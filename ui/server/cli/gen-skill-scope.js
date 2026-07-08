// Skill-scope registry guard — the per-agent skill index is DECLARED once (each
// plugin/skills/*/SKILL.md carries an `agents:` tag naming its audience) and PROJECTED into each
// plugin/agents/*.md `skills:` frontmatter (what the SDK reads as AgentDefinition.skills). This checks
// the two stay in sync, so the "only required skills per agent" scoping can't silently drift. The read
// + inversion core lives in ui/server/features/skills/skill-registry.js (shared with the set_skill tool
// + the recalibration UI). Mirrors structure.check.js: bare-node; wired into `npm run validate`, the
// pre-commit hook, and CI.
//   node ui/server/cli/gen-skill-scope.js            # --check (default): exits 1 on any drift
//   node ui/server/cli/gen-skill-scope.js --write     # advisory: print the projected skills: blocks
//
// Tag vocabulary (in a skill's `agents: [...]`): bare agent names, plus reserved tokens —
//   all          → the orchestrator + every agent          (e.g. caveman)
//   workers      → every agent that manages the board (has the mcp__ui__tasks tool)
//   builders     → godot-dev, godot-refactor + the domain specialists (the code-writers)
//   orchestrator → the main session only (cross-checked against ORCHESTRATOR_FRAMEWORK_SKILLS)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ORCHESTRATOR_FRAMEWORK_SKILLS } from "../features/skills/skill-catalog.js";
import {
  ORCH,
  BUILDERS,
  SKILLS_DIR,
  TWIN_DIR,
  split,
  loadRegistry,
} from "../features/skills/skill-registry.js";

const { skills, agents, agentNames, expected, errors } = loadRegistry();
const onDisk = new Set(skills.keys());
/** @type {string[]} */ const warnings = [];

/** Set difference a − b as a sorted array. @param {Set<string>} a @param {Set<string>} b */
const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();

/** Body references to skills near a load/follow verb, or `name` skill mentions. @param {string} body */
function bodySkillRefs(body) {
  /** @type {Set<string>} */
  const refs = new Set();
  for (const m of body.matchAll(/(?:load|follow)\b[^.\n]*?`([a-z][a-z0-9-]+)`/g))
    if (m[1]) refs.add(m[1]);
  for (const m of body.matchAll(/`([a-z][a-z0-9-]+)`(?:\*{1,2}|_)?\s+skill\b/g))
    if (m[1]) refs.add(m[1]);
  return refs;
}

// Actual skills: per audience (the orchestrator's set is the framework constant).
/** @type {Map<string, Set<string>>} */
const actual = new Map();
actual.set(ORCH, new Set(ORCHESTRATOR_FRAMEWORK_SKILLS));
for (const n of agentNames) actual.set(n, new Set(agents.get(n)?.skills));

for (const [id, want] of expected) {
  /** @type {Set<string>} */
  const have = actual.get(id) ?? new Set();
  const label =
    id === ORCH ? "ORCHESTRATOR_FRAMEWORK_SKILLS" : `agent \`${id}\` frontmatter skills:`;
  // D1: every listed skill exists on disk.
  for (const s of have)
    if (!onDisk.has(s)) errors.push(`${label} lists \`${s}\`, which is not a skill on disk`);
  // D2: the projection (skill tags) and the frontmatter must match exactly, both directions.
  for (const s of minus(want, have))
    errors.push(
      `${label} is missing \`${s}\` (a skill tags this audience but the frontmatter omits it)`,
    );
  for (const s of minus(have, want))
    errors.push(
      `${label} lists \`${s}\`, but \`${s}\`'s \`agents:\` tag does not include this audience`,
    );
}

// Self-check: keep each context's tier-1 skill INDEX small. Past the cap the always-listed description
// budget bites and selection accuracy erodes as descriptions overlap (the index is the "these exist +
// roughly what they do" signal; full skills load on demand). The meaningful signal is DOMAIN breadth,
// not raw count: BUILDERS carry a 7-skill SHARED CORE before any domain skill — `caveman` ([all]) +
// `tasks-mcp` ([workers]) + the five [builders]-scoped skills (code-rules, composition, verify, docs,
// agent-report) — so they get a higher cap (core + ~8 domain). Non-builders carry ~2 core, so 10.
// An over-cap agent is the signal to split it into domain-specialized agents (core + domain).
const INDEX_SOFT_CAP = 10; // default (orchestrator, researchers, interview agents)
const BUILDER_INDEX_CAP = 15; // 7 shared core + ~8 domain
for (const [id, have] of actual) {
  const cap = BUILDERS.includes(id) ? BUILDER_INDEX_CAP : INDEX_SOFT_CAP;
  if (have.size > cap)
    warnings.push(
      `${id === ORCH ? "orchestrator" : `agent \`${id}\``} carries ${have.size} skills in its index ` +
        `(> ${cap}) — consider splitting it into domain-specialized agents (core + domain)`,
    );
}

// Body-reference checks: an agent body that names a skill it doesn't list. Two cases —
//   - the skill EXISTS on disk → ERROR (real drift: the prose claims a skill the agent isn't wired to
//     load). Fix by adding it to skills:, OR — if the skill belongs to another agent and the body is
//     just cross-referencing it — reword the prose so it doesn't read as a self-claim. (You cannot
//     simply add a builder-scoped skill to a non-builder here: that trips the D2 audience check above.)
//   - the skill is NOT on disk and looks godot-/gd- → WARNING (heuristic: may be a game-local skill).
for (const [name, a] of agents) {
  const listed = new Set(a.skills);
  for (const ref of bodySkillRefs(a.body)) {
    if (onDisk.has(ref) && !listed.has(ref))
      errors.push(
        `agent \`${name}\` body references the \`${ref}\` skill but its frontmatter skills: omits it ` +
          `(add it to skills:, or reword the prose as a cross-reference if the skill belongs to another agent)`,
      );
  }
}

// Dangling skill-ref check (agents + skills): a backtick-quoted godot-/gd- skill-shaped token that is
// NOT a skill on disk is either a dangling ref (the skill doesn't exist — e.g. a removed/renamed/never-
// built skill) or a game-local skill a framework file must not hard-depend on. Either way → WARNING.
// Backtick-required so prose like "Godot-family" / "godot 4.x" doesn't trip it; EXTERNAL_REFS excludes
// known non-skill names (external repos cited in lineage tables) that legitimately appear in backticks.
// Catches refs the load/follow-only `bodySkillRefs` regex misses (e.g. inside a "NOT (...)" clause).
// Excludes: skills on disk; AGENT names (godot-* agents are legit cross-refs, not skills); external
// repos cited in lineage tables; and intentionally-named not-yet-built skills. What remains is a real
// dangling ref or a framework→game-local skill dependency (the art-director→godot-art-style class).
const agentSet = new Set(agentNames);
const EXTERNAL_REFS = new Set([
  "godot-gameplay-systems", // external repo (OctoD, lineage)
  "godot-ideas", // external repo (willnationsdev, lineage)
  "godot-extended-libraries", // external repo (willnationsdev, lineage)
  "godot-buff", // planned/illustrative effect variant, not yet built
  "godot-debuff", // planned/illustrative effect variant, not yet built
  "godot-dot", // planned/illustrative effect variant, not yet built
  "godot-addon", // GitHub topic name (addon search), not a skill
  "godot-plugin", // GitHub topic name (addon search), not a skill
]);
const REF_RE = /`(godot-[a-z][a-z0-9-]*|gd-[a-z][a-z0-9-]*)`/g;
/** @param {string} label @param {string} body @param {string | null} own
 * @param {Set<string>} [extraKnown] additional legitimate names (the twin pass adds its own
 * skill + agent names on top of the base sets). */
function scanDangling(label, body, own, extraKnown) {
  /** @type {Set<string>} */
  const flagged = new Set();
  for (const m of body.matchAll(REF_RE)) {
    const ref = m[1];
    if (
      !ref ||
      ref === own ||
      onDisk.has(ref) ||
      agentSet.has(ref) ||
      EXTERNAL_REFS.has(ref) ||
      extraKnown?.has(ref) ||
      flagged.has(ref)
    )
      continue;
    flagged.add(ref);
    warnings.push(
      `${label} references \`${ref}\` — not a framework skill on disk (dangling ref, or a game-local ` +
        `skill a framework file must not depend on)`,
    );
  }
}
for (const [name, a] of agents) scanDangling(`agent \`${name}\` body`, a.body, null);
for (const ent of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  let text;
  try {
    text = readFileSync(path.join(SKILLS_DIR, ent.name, "SKILL.md"), "utf8");
  } catch {
    continue;
  }
  scanDangling(`skill \`${ent.name}\` body`, split(text).body, ent.name);
}

// ── xenodot-twin pass ─────────────────────────────────────────────────────────────────────
// The SECOND plugin (viewer projects) gets the same scope-sync enforcement, with one twist:
// twin agent frontmatter legitimately composes BASE skills as `xenodot:<name>` (the runtime
// namespace), so namespaced entries are checked for existence against the base plugin's skills
// (D1) and exempt from D2 — the base skills' `agents:` vocabulary cannot name twin agents.
// Twin skills tagging `orchestrator`/`all` feed the viewer session floor at runtime
// (getPluginOrchestratorSkills), with no constant to cross-check, so the twin pass checks
// agent audiences only. Skipped entirely when plugin-twin/ is absent (a plain fork).
const twin = existsSync(TWIN_DIR) ? loadRegistry(TWIN_DIR) : null;
if (twin) {
  errors.push(...twin.errors.map((e) => `plugin-twin: ${e}`));
  const twinOnDisk = new Set(twin.skills.keys());
  // A twin skill shadowing a base skill name is ambiguous everywhere (session skill lists,
  // docs, this gate's own resolution) — ban the collision outright.
  for (const s of twinOnDisk)
    if (onDisk.has(s))
      errors.push(
        `plugin-twin skill \`${s}\` collides with a base-plugin skill of the same name — rename it (twin-*)`,
      );
  const NS = "xenodot:";
  const twinKnown = new Set([...twinOnDisk, ...twin.agentNames]);
  for (const [name, a] of twin.agents) {
    const label = `plugin-twin agent \`${name}\` frontmatter skills:`;
    /** @type {Set<string>} */
    const bare = new Set();
    for (const s of a.skills) {
      if (s.startsWith(NS)) {
        if (!onDisk.has(s.slice(NS.length)))
          errors.push(`${label} lists \`${s}\`, which is not a base-plugin skill on disk`);
      } else if (s.includes(":")) {
        errors.push(
          `${label} lists \`${s}\` — unknown namespace (use a bare twin skill name or xenodot:<base-skill>)`,
        );
      } else {
        bare.add(s);
        if (!twinOnDisk.has(s))
          errors.push(`${label} lists \`${s}\`, which is not a twin skill on disk`);
      }
    }
    // D2 over the twin-local names, both directions (same contract as the base pass).
    const want = twin.expected.get(name) ?? new Set();
    for (const s of minus(want, bare))
      errors.push(
        `${label} is missing \`${s}\` (a twin skill tags this audience but the frontmatter omits it)`,
      );
    for (const s of minus(bare, want))
      errors.push(
        `${label} lists \`${s}\`, but \`${s}\`'s \`agents:\` tag does not include this audience`,
      );
    // Index cap (twin agents are not in BUILDERS; the namespaced base entries count too —
    // they sit in the same always-listed index).
    if (a.skills.length > INDEX_SOFT_CAP)
      warnings.push(
        `plugin-twin agent \`${name}\` carries ${a.skills.length} skills in its index (> ${INDEX_SOFT_CAP}) ` +
          `— consider splitting it into domain-specialized agents (core + domain)`,
      );
    // Body references resolve across both plugins (a `xenodot:x` listing covers a bare `x` ref).
    const listedResolved = new Set(
      a.skills.map((s) => (s.startsWith(NS) ? s.slice(NS.length) : s)),
    );
    for (const ref of bodySkillRefs(a.body)) {
      if ((twinOnDisk.has(ref) || onDisk.has(ref)) && !listedResolved.has(ref))
        errors.push(
          `plugin-twin agent \`${name}\` body references the \`${ref}\` skill but its frontmatter skills: omits it ` +
            `(add it to skills:, or reword the prose as a cross-reference if the skill belongs to another agent)`,
        );
    }
    scanDangling(`plugin-twin agent \`${name}\` body`, a.body, null, twinKnown);
  }
  for (const [name] of twin.skills) {
    try {
      const text = readFileSync(path.join(TWIN_DIR, "skills", name, "SKILL.md"), "utf8");
      scanDangling(`plugin-twin skill \`${name}\` body`, split(text).body, name, twinKnown);
    } catch {
      /* unreadable — readSkills already required the file to exist */
    }
  }
}

if (process.argv.includes("--write")) {
  console.log(
    "# Projected skills: blocks (from each skill's agents: tag) — sync agent frontmatter to these:\n",
  );
  for (const id of [ORCH, ...agentNames]) {
    const list = [...(expected.get(id) ?? [])].sort();
    console.log(`## ${id === ORCH ? "orchestrator (ORCHESTRATOR_FRAMEWORK_SKILLS)" : id}`);
    console.log(
      id === ORCH ? `  [${list.join(", ")}]` : "skills:\n" + list.map((s) => `  - ${s}`).join("\n"),
    );
    console.log("");
  }
}

for (const w of warnings) console.warn(`⚠ skill-scope: ${w}`);
if (errors.length) {
  console.error(`✗ skill-scope: ${errors.length} drift error(s) in skill scoping:`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    "  Fix the skill tag, the agent frontmatter, or the body reference so they agree (run --write to see the expected blocks).",
  );
  process.exit(1);
}
console.log(
  `ok  skill-scope: ` +
    (twin
      ? `${skills.size}+${twin.skills.size} skills, ${agentNames.length}+${twin.agentNames.length} agents (plugin + plugin-twin)`
      : `${skills.size} skills, ${agentNames.length} agents`) +
    `, scoping in sync` +
    (warnings.length ? ` (${warnings.length} warning(s) above)` : ""),
);
