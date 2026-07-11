// Generate the per-game capabilities index — the skills side of the machine-readable capability
// map (M2). Written into the game tree at .xenodot/capabilities.json (gitignored, like the
// manifest) by prepareGame() — so it regenerates on server startup, `doctor`, and `forge new`.
//
// For each of the plugin's skills it records: its `domain:` tag, the agents that own it (the
// inversion of the skill→agents audience projection), and whether it is IN this game's profile
// (computed from the domain + the declared {genre, style} via the same inProfile() the runtime
// session filter uses — one source of truth for the index and the preload filter).
//
// The agents side is now emitted too: a routing roster (framework builders + the game's own
// `.claude/agents`) rendered into the orchestrator prompt, so a game-local builder is visible to
// routing — the drift the orchestrator's hand-written domain→specialist table couldn't see.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PROFILE } from "../core/config.js";
import { loadRegistry, readAgents, BUILDERS, ORCH } from "../features/skills/skill-registry.js";
import { inProfile } from "../features/skills/skill-scope.js";
import { parseJSON } from "../../lib/json.js";

/** @typedef {import("../../lib/profile.js").Profile} Profile */
/** @typedef {{ name: string, domain: string|null, owner_agents: string[], in_profile: boolean }} SkillCap */
/** A dispatchable agent in the routing roster. `local` = added game-side (in `.claude/agents`),
 * so it renders un-namespaced; framework agents render as `xenodot:<name>`.
 * @typedef {{ name: string, description: string, local: boolean }} AgentCap */
/** @typedef {{ profile: Profile, skills: SkillCap[], agents: AgentCap[] }} Capabilities */

/** Invert the audience projection (audienceId → skillSet) into skill → sorted owner agent ids.
 * The `@orchestrator` sentinel is rendered as its ORCH token so the record is self-describing.
 * @param {Map<string, Set<string>>} expected @returns {Map<string, string[]>} */
function ownerAgentsBySkill(expected) {
  /** @type {Map<string, string[]>} */
  const owners = new Map();
  for (const [audience, skillSet] of expected)
    for (const skill of skillSet) {
      const list = owners.get(skill) ?? [];
      list.push(audience === ORCH ? "orchestrator" : audience);
      owners.set(skill, list);
    }
  for (const [skill, list] of owners) owners.set(skill, list.sort());
  return owners;
}

/** Build the capabilities record from the plugin registry + this game's profile. Pure-ish (reads
 * the plugin via loadRegistry; no project IO). The `agents` roster carries only the framework
 * builders here; game-local agents are merged in by generateCapabilities (which has the projectDir).
 * @returns {Capabilities} */
export function buildCapabilities() {
  const { domains, expected, agents } = loadRegistry();
  const owners = ownerAgentsBySkill(expected);
  const skills = [...domains.keys()].sort().map((name) => {
    const domain = domains.get(name) ?? null;
    return {
      name,
      domain,
      owner_agents: owners.get(name) ?? [],
      // Fail-open when the profile axis is undeclared (inProfile returns true) — the doctor warns
      // separately (see doctor.js), and the top-level `profile` block records what was declared.
      in_profile: inProfile(domain, PROFILE, name),
    };
  });
  // The dispatchable builders/specialists the orchestrator routes DOMAIN work to (godot-dev + its
  // splits). game-designer/researchers/etc. route via the orchestrator's workflow prose, not this
  // roster, so they stay out of it.
  const builderAgents = BUILDERS.filter((name) => agents.has(name)).map((name) => ({
    name,
    description: agents.get(name)?.description ?? "",
    local: false,
  }));
  return { profile: PROFILE, skills, agents: builderAgents };
}

/** Read the game's own `.claude/agents/*.md` so game-added agents surface in the routing roster —
 * the drift the orchestrator's hand-written table couldn't see. Absent dir → [] (fail-open).
 * @param {string} projectDir @returns {AgentCap[]} */
function readGameLocalAgents(projectDir) {
  const dir = path.join(projectDir, ".claude", "agents");
  if (!existsSync(dir)) return [];
  return [...readAgents(dir)].map(([name, def]) => ({
    name,
    description: def.description,
    local: true,
  }));
}

/** Write <projectDir>/.xenodot/capabilities.json with the skills-side map + the routing roster
 * (framework builders + this game's local agents merged in). @param {string} projectDir
 * @returns {Capabilities} */
export function generateCapabilities(projectDir) {
  const base = buildCapabilities();
  const capabilities = { ...base, agents: [...base.agents, ...readGameLocalAgents(projectDir)] };
  const outDir = path.join(projectDir, ".xenodot");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "capabilities.json"),
    JSON.stringify(capabilities, null, 2) + "\n",
  );
  return capabilities;
}

/** Render the routing roster into the markdown block the orchestrator prompt appends — the
 * data-driven replacement for its hand-written domain→specialist table. Each agent's `description`
 * IS the routing hint (authored for exactly this), so no synthesis is needed. Empty roster → ""
 * (the orchestrator's prose still routes). @param {Capabilities} capabilities @returns {string} */
export function renderRoutingBlock(capabilities) {
  const roster = capabilities.agents ?? [];
  if (!roster.length) return "";
  const lines = [...roster]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => {
      const id = a.local ? a.name : `xenodot:${a.name}`;
      const tag = a.local ? " _(game-local)_" : "";
      return `- \`${id}\`${tag} — ${a.description}`;
    });
  return [
    "## Available builders (generated — route DOMAIN work by this roster)",
    "",
    "Generated from the plugin registry + this game's `.claude/agents` (`capabilities.json`), so a" +
      " builder added game-side is routable here even though it isn't named in the prose above." +
      " Match the request to a charter below; `xenodot:godot-dev` is the default when no specialist" +
      " owns it.",
    "",
    ...lines,
  ].join("\n");
}

/** Read a game's generated capabilities.json and render its routing roster for the orchestrator
 * prompt. Fail-open: a missing/unreadable/legacy (no `agents`) index → "". @param {string} projectDir
 * @returns {string} */
export function loadRoutingBlock(projectDir) {
  try {
    const raw = readFileSync(path.join(projectDir, ".xenodot", "capabilities.json"), "utf8");
    return renderRoutingBlock(/** @type {Capabilities} */ (parseJSON(raw)));
  } catch {
    return "";
  }
}

// CLI: `node ui/server/cli/gen-capabilities.js [projectDir]`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PROJECT_DIR } = await import("../core/config.js");
  const arg = process.argv[2];
  const target = arg ? path.resolve(arg) : PROJECT_DIR;
  const cap = generateCapabilities(target);
  const inN = cap.skills.filter((s) => s.in_profile).length;
  console.log(
    `capabilities: ${target} — ${cap.skills.length} skills, ${inN} in profile ` +
      `(${cap.profile.genre ?? "genre?"}/${cap.profile.style ?? "style?"}).`,
  );
}
