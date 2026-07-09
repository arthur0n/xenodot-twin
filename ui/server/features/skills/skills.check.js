// Pure-function checks for computeSessionSkills (the testable core of resolveSessionSkills) — run:
//   node ui/server/features/skills/skills.check.js
// No test runner: computeSessionSkills is pure, so it's exercised directly. Guards the override
// semantics Layer 1 depends on (default-deny, wildcard, per-name, floor always-on, dedup) plus
// the data-driven audience reader (getPluginOrchestratorSkills — audience-tag reads over a temp
// fixture plugin, so nothing depends on any real plugin dir).
// Importing skills.js triggers config.js's one-time engine probe — harmless, hand-run only.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  computeSessionSkills,
  getPluginOrchestratorSkills,
  computeProfiledAgents,
} from "./skills.js";
import { validateSkillDomains } from "./skill-registry.js";

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

const floor = ["caveman", "graphify"];
const candidates = ["init", "verify", "code-review"];
const sorted = (/** @type {string[]} */ a) => [...a].sort();

check("default-deny: no overrides → floor only (no built-ins, no domain skills)", () => {
  const out = computeSessionSkills({ floor, candidates, overrides: {} });
  assert.deepEqual(sorted(out), sorted(["caveman", "graphify"]));
});

check('wildcard "*":"on" → floor + ALL candidates', () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { "*": "on" } });
  assert.deepEqual(sorted(out), sorted([...floor, ...candidates]));
});

check('wildcard "on" + a per-name "off" removes just that one', () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { "*": "on", verify: "off" } });
  assert.ok(out.includes("init") && out.includes("code-review"));
  assert.ok(!out.includes("verify"));
});

check("default-deny + a per-name on → only that built-in is added to the floor", () => {
  const out = computeSessionSkills({ floor, candidates, overrides: { init: "on" } });
  assert.deepEqual(sorted(out), sorted([...floor, "init"]));
});

check("floor is ALWAYS in, even when overrides try to disable it", () => {
  const out = computeSessionSkills({
    floor,
    candidates,
    overrides: { "*": "off", caveman: "off" },
  });
  assert.ok(out.includes("caveman") && out.includes("graphify"));
});

check("result is de-duplicated when a name is in both floor and candidates", () => {
  const out = computeSessionSkills({
    floor: ["caveman"],
    candidates: ["caveman"],
    overrides: { "*": "on" },
  });
  assert.deepEqual(out, ["caveman"]);
});

// ---- getPluginOrchestratorSkills: the data-driven audience reader (each SKILL.md `agents:`
// tag is the source of truth — orchestrator/all join the floor, builder-audience skills stay out).
const fixture = mkdtempSync(path.join(tmpdir(), "xeno-fixture-plugin-"));
/** @param {string} name @param {string} agents */
function makeSkill(name, agents) {
  const dir = path.join(fixture, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: x\nagents: [${agents}]\n---\nbody\n`,
  );
}
makeSkill("ext-status", "orchestrator");
makeSkill("ext-terse", "all");
makeSkill("ext-verify", "builders, data-binder");

check("getPluginOrchestratorSkills: orchestrator/all-tagged skills in, builder-tagged out", () => {
  assert.deepEqual(getPluginOrchestratorSkills(fixture), ["ext-status", "ext-terse"]);
});

check(
  "getPluginOrchestratorSkills: a missing plugin dir (game project, parallel build) → []",
  () => {
    assert.deepEqual(getPluginOrchestratorSkills(path.join(fixture, "nope")), []);
  },
);

// ---- computeProfiledAgents: the M2 options.agents overlay core. Override an agent ONLY when the
// profile filter actually drops a skill; preserve description/prompt/tools/model/effort otherwise.
/** One entry of the readAgents() shape, for the overlay tests.
 * @param {string[]} skills
 * @returns {{skills:string[],tools:string[],model:string|null,effort:string|null,description:string,body:string}} */
const agent = (skills) => ({
  skills,
  tools: ["Read", "Write"],
  model: "sonnet",
  effort: "medium",
  description: "desc",
  body: "prompt-body",
});
const AGENTS = new Map([
  [
    "godot-player",
    agent(["caveman", "godot-first-person-controller", "godot-orthographic-follow-camera"]),
  ],
  ["godot-dev", agent(["caveman", "godot-verify"])], // all universal/core → never narrowed
]);
const DOMAINS = new Map([
  ["caveman", "universal"],
  ["godot-verify", "godot-core"],
  ["godot-first-person-controller", "genre-fps"],
  ["godot-orthographic-follow-camera", "genre-topdown-iso"],
]);
const ISO_HD = { genre: "genre-topdown-iso", style: "style-hd" };

check("computeProfiledAgents: overrides only the agent whose skills got narrowed", () => {
  const out = computeProfiledAgents(AGENTS, DOMAINS, ISO_HD);
  assert.deepEqual(Object.keys(out), ["godot-player"]); // godot-dev untouched (nothing dropped)
});

check("computeProfiledAgents: narrows the skill list, preserves the rest of the definition", () => {
  const def = computeProfiledAgents(AGENTS, DOMAINS, ISO_HD)["godot-player"];
  assert.ok(def);
  assert.deepEqual(def.skills, ["caveman", "godot-orthographic-follow-camera"]); // fps dropped
  assert.equal(def.description, "desc");
  assert.equal(def.prompt, "prompt-body");
  assert.equal(def.model, "sonnet");
  assert.equal(def.effort, "medium");
  assert.deepEqual(def.tools, ["Read", "Write"]);
});

check(
  "computeProfiledAgents: unset profile → empty overlay (fail-open, no override at all)",
  () => {
    const out = computeProfiledAgents(AGENTS, DOMAINS, { genre: null, style: null });
    assert.deepEqual(out, {});
  },
);

check("computeProfiledAgents: omits empty tools / null model+effort", () => {
  const bare = new Map([
    [
      "a",
      {
        skills: ["godot-first-person-controller", "caveman"],
        tools: [""],
        model: null,
        effort: null,
        description: "d",
        body: "b",
      },
    ],
  ]);
  const def = computeProfiledAgents(bare, DOMAINS, ISO_HD)["a"];
  assert.ok(def);
  assert.ok(!("tools" in def) && !("model" in def) && !("effort" in def));
  assert.deepEqual(def.skills, ["caveman"]);
});

// ---- validateSkillDomains: the domain gate (mirrors the missing-`agents:` error path).
check("validateSkillDomains: all-valid map → no errors", () => {
  /** @type {string[]} */
  const errors = [];
  validateSkillDomains(
    new Map([
      ["a", "universal"],
      ["b", "godot-core"],
    ]),
    errors,
  );
  assert.equal(errors.length, 0);
});

check("validateSkillDomains: missing or out-of-enum domain → one error each", () => {
  /** @type {string[]} */
  const errors = [];
  validateSkillDomains(
    new Map([
      ["a", null],
      ["b", "genre-bogus"],
      ["c", "style-hd"],
    ]),
    errors,
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0] ?? "", /has no `domain:` tag/);
  assert.match(errors[1] ?? "", /invalid domain `genre-bogus`/);
});

console.log(
  `ok  skills: ${passed} computeSessionSkills + getPluginOrchestratorSkills + computeProfiledAgents + validateSkillDomains checks passed`,
);
