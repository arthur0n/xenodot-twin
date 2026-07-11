// Skill-scope registry CORE — the read + inversion logic shared by the CLI validator
// (cli/gen-skill-scope.js), the set_skill MCP tool, and the recalibration UI. The per-skill `agents:`
// tag in each plugin/skills/*/SKILL.md is the source of truth; it inverts to a per-agent skill set
// (projected into agent frontmatter). Deliberately node:fs-only — NO config.js — so it stays
// side-effect-free for `npm run validate`. Paths resolve from this file's location.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // ui/server/features/skills
const PLUGIN = path.join(HERE, "..", "..", "..", "..", "plugin");
export const SKILLS_DIR = path.join(PLUGIN, "skills");
export const AGENTS_DIR = path.join(PLUGIN, "agents");
/** The plugin root, exported so the CLI validator can locate it without pulling in config.js. */
export const PLUGIN_DIR = PLUGIN;

/** Sentinel for the main session (the hive) in audience sets — NOT an agent file. Its tag token is
 * `orchestrator`; its skill set is ORCHESTRATOR_FRAMEWORK_SKILLS (in skill-catalog.js). */
export const ORCH = "@orchestrator";

/** The closed set of `domain:` values every skill must declare (M2 taxonomy). One key per skill,
 * its DOMINANT profile lock. `universal`/`godot-core`/`design`/`twin`/`project-local` are always kept
 * by the profile filter; `genre-*`/`style-*` are dropped when they mismatch the game profile — but
 * xenodot-twin ships no genre-/style- skills (the game domain lives upstream), so those entries are
 * an inert allowlist here and the profile stays effectively unset (fail-open). `twin` is the fork's
 * digital-twin domain (the always-kept `twin-*` skills). The source of truth for the enum — the gate,
 * the capabilities index, and the runtime filter all read it from here. @type {readonly string[]} */
export const SKILL_DOMAINS = [
  "universal",
  "godot-core",
  "design",
  "twin",
  "genre-fps",
  "genre-topdown-iso",
  "style-pixel",
  "style-hd",
  "project-local",
];

/** The code-writers (stable hardcoded alias). godot-dev is the core/general builder that the viewer
 * orchestrator routes generic Godot glue to; godot-refactor does behaviour-preserving extraction;
 * godot-visuals owns the rendered look; godot-assets owns asset-import wiring. (The game gameplay
 * specialists — enemy/weapons/player/vfx — are not part of the digital-twin domain; see
 * ui/orchestrator-viewer.md.) Builders carry a shared skill core, so the index cap for a builder is
 * higher (15 = 7 core + ~8 domain); see gen-skill-scope.js. @type {string[]} */
export const BUILDERS = ["godot-dev", "godot-refactor", "godot-visuals", "godot-assets"];

/** The frontmatter block (between the first two `---`) and the body that follows.
 * @param {string} text @returns {{ fm: string, body: string }} */
export function split(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1] ?? "", body: m[2] ?? "" } : { fm: "", body: text };
}

/** Parse a `skills:` YAML block (`  - name` items) from a frontmatter string.
 * @param {string} fm @returns {string[]} */
export function parseSkillsList(fm) {
  const lines = fm.split("\n");
  const start = lines.findIndex((l) => /^skills:/.test(l));
  if (start < 0) return [];
  /** @type {string[]} */
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const item = line.match(/^\s*-\s*(.+?)\s*$/);
    if (item?.[1]) out.push(item[1]);
    else if (/^\S/.test(line)) break; // next top-level key
  }
  return out;
}

/** Discover skills: { dir-name -> agents tag tokens }.
 * @param {string} [dir] skills dir to read (defaults to the base plugin's)
 * @returns {Map<string,string[]>} */
export function readSkills(dir = SKILLS_DIR) {
  /** @type {Map<string, string[]>} */
  const skills = new Map();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const { fm } = split(readFileSync(file, "utf8"));
    const tag = fm.match(/^agents:\s*\[([^\]]*)\]/m);
    skills.set(
      e.name,
      tag?.[1]
        ? tag[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    );
  }
  return skills;
}

/** Discover each skill's `domain:` tag: { dir-name -> domain-or-null }. Reads the frontmatter block
 * ONLY (via split), so a stray `domain:` in a skill's body prose can't be mistaken for the tag.
 * @param {string} [dir] skills dir to read (defaults to the base plugin's)
 * @returns {Map<string,string|null>} */
export function readSkillDomains(dir = SKILLS_DIR) {
  /** @type {Map<string, string|null>} */
  const domains = new Map();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const { fm } = split(readFileSync(file, "utf8"));
    domains.set(e.name, fm.match(/^domain:\s*(\S+)/m)?.[1] ?? null);
  }
  return domains;
}

/** Gate the `domain:` tags: push an error for any skill missing one or carrying a value outside
 * SKILL_DOMAINS — mirrors the missing-`agents:` gate. Errors flow to the CLI's `errors[]`, which
 * `gen-skill-scope.js` exits 1 on. @param {Map<string,string|null>} domains @param {string[]} [errors] */
export function validateSkillDomains(domains, errors) {
  for (const [skill, domain] of domains) {
    if (!domain)
      errors?.push(
        `skill \`${skill}\` has no \`domain:\` tag — every skill must declare a domain (${SKILL_DOMAINS.join(" · ")})`,
      );
    else if (!SKILL_DOMAINS.includes(domain))
      errors?.push(
        `skill \`${skill}\` has invalid domain \`${domain}\` — must be one of ${SKILL_DOMAINS.join(" · ")}`,
      );
  }
}

/** Discover agents: { name -> { skills, tools, model, effort, description, body } }. `description`
 * and `effort` are captured so a full AgentDefinition can be reconstructed at session start (the
 * M2 profile-filtered `options.agents` overlay) without dropping the agent's tuning.
 * @param {string} [dir] agents dir to read (defaults to the base plugin's)
 * @returns {Map<string,{skills:string[],tools:string[],model:string|null,effort:string|null,description:string,body:string}>} */
export function readAgents(dir = AGENTS_DIR) {
  /** @type {Map<string, {skills:string[],tools:string[],model:string|null,effort:string|null,description:string,body:string}>} */
  const agents = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const { fm, body } = split(readFileSync(path.join(dir, f), "utf8"));
    const tools = (fm.match(/^tools:\s*(.+)$/m)?.[1] ?? "").split(",").map((s) => s.trim());
    const model = fm.match(/^model:\s*(\S+)/m)?.[1] ?? null;
    const effort = fm.match(/^effort:\s*(\S+)/m)?.[1] ?? null;
    const description = fm.match(/^description:\s*(.+?)\s*$/m)?.[1] ?? "";
    agents.set(f.replace(/\.md$/, ""), {
      skills: parseSkillsList(fm),
      tools,
      model,
      effort,
      description,
      body,
    });
  }
  return agents;
}

/** Expand one audience token into agent ids (or the ORCH sentinel). Unknown tokens push to `errors`
 * if supplied (the CLI gates on them; the tool/UI ignores them).
 * @param {string} token @param {string[]} agentNames @param {string[]} workers @param {string[]} [errors]
 * @returns {string[]} */
export function expandToken(token, agentNames, workers, errors) {
  if (token === "all") return [ORCH, ...agentNames];
  if (token === "workers") return workers;
  if (token === "builders") return BUILDERS;
  if (token === "orchestrator") return [ORCH];
  if (agentNames.includes(token)) return [token];
  errors?.push(`unknown audience token \`${token}\` (not a reserved token or an agent name)`);
  return [];
}

/** Invert the skill tags into the expected per-audience skill sets.
 * @param {Map<string,string[]>} skills @param {string[]} agentNames @param {string[]} workers
 * @param {string[]} [errors] @returns {Map<string, Set<string>>} audienceId -> expected skill names */
export function expectedByAudience(skills, agentNames, workers, errors) {
  /** @type {Map<string, Set<string>>} */
  const expected = new Map();
  expected.set(ORCH, new Set());
  for (const n of agentNames) expected.set(n, new Set());
  for (const [skill, tokens] of skills) {
    if (!tokens.length)
      errors?.push(
        `skill \`${skill}\` has no \`agents:\` tag — every skill must declare an audience`,
      );
    for (const t of tokens)
      for (const id of expandToken(t, agentNames, workers, errors)) expected.get(id)?.add(skill);
  }
  return expected;
}

/** Read everything + compute the projection in one call. Workers = agents with the board tool.
 * The one plugin carries both the base and the folded-in twin domain; partitionRegistry splits the
 * result when a pass needs the halves separately.
 * @param {string} [root] plugin root to read (defaults to the plugin)
 * @returns {{ skills: Map<string,string[]>, domains: Map<string,string|null>,
 *   agents: ReturnType<typeof readAgents>, agentNames: string[], workers: string[],
 *   expected: Map<string,Set<string>>, errors: string[] }} */
export function loadRegistry(root = PLUGIN) {
  const skillsDir = path.join(root, "skills");
  const skills = readSkills(skillsDir);
  const domains = readSkillDomains(skillsDir);
  const agents = readAgents(path.join(root, "agents"));
  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  /** @type {string[]} */
  const errors = [];
  const expected = expectedByAudience(skills, agentNames, workers, errors);
  validateSkillDomains(domains, errors);
  return { skills, domains, agents, agentNames, workers, expected, errors };
}

/** @typedef {ReturnType<typeof loadRegistry>} Registry */

/** Recompute the per-audience projection for a SUBSET of the registry (a slice of skills + agents).
 * Same shape as loadRegistry, but the projection is confined to the subset — so a base skill tagged
 * `all` does not sweep in twin agents, and a twin skill's audience resolves only against twin agents.
 * @param {Map<string,string[]>} skills @param {Registry["agents"]} agents
 * @param {Registry["domains"]} domains @returns {Registry} */
function scopeOf(skills, agents, domains) {
  const agentNames = [...agents.keys()].sort();
  const workers = agentNames.filter((n) => agents.get(n)?.tools.includes("mcp__ui__tasks"));
  /** @type {string[]} */
  const errors = [];
  const expected = expectedByAudience(skills, agentNames, workers, errors);
  return { skills, domains, agents, agentNames, workers, expected, errors };
}

/** Split the ONE merged plugin registry into its base and twin (digital-twin domain) halves, so the
 * scope gate keeps enforcing each half by its own rules after the two plugins were folded into one:
 *   - twin AGENTS are the ones whose frontmatter composes base capabilities cross-domain via the
 *     `xenodot:` self-namespace prefix (base agents list everything bare);
 *   - twin SKILLS are the `twin-` prefixed ones.
 * The twin half's `xenodot:<base-skill>` refs are then existence-checked against the base half and
 * exempt from audience projection (see gen-skill-scope.js), exactly as the old two-plugin pass did.
 * @param {Registry} [reg] @returns {{ base: Registry, twin: Registry | null }} */
export function partitionRegistry(reg = loadRegistry()) {
  const twinAgents = new Set(
    [...reg.agents]
      .filter(([, a]) => a.skills.some((s) => s.startsWith("xenodot:")))
      .map(([n]) => n),
  );
  const isTwinSkill = (/** @type {string} */ n) => n.startsWith("twin-");
  const base = scopeOf(
    new Map([...reg.skills].filter(([n]) => !isTwinSkill(n))),
    new Map([...reg.agents].filter(([n]) => !twinAgents.has(n))),
    new Map([...reg.domains].filter(([n]) => !isTwinSkill(n))),
  );
  const twinSkills = new Map([...reg.skills].filter(([n]) => isTwinSkill(n)));
  const twinAgentMap = new Map([...reg.agents].filter(([n]) => twinAgents.has(n)));
  const twinDomains = new Map([...reg.domains].filter(([n]) => isTwinSkill(n)));
  const twin = twinAgentMap.size ? scopeOf(twinSkills, twinAgentMap, twinDomains) : null;
  return { base, twin };
}
