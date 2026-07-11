// Pure-function checks for the agents-side capability map (the data-driven routing roster) — run:
//   node ui/server/cli/gen-capabilities.check.js
// No test runner: buildCapabilities/renderRoutingBlock are pure (buildCapabilities reads the
// plugin; render takes a record), so they're exercised directly. Guards D6 (the generated routing
// block that replaced the orchestrator's hand-written domain→specialist table): the framework
// builders populate the roster, render namespaces them, a game-local agent renders un-namespaced,
// and an empty/legacy record renders "" (fail-open).
import assert from "node:assert/strict";
import { buildCapabilities, renderRoutingBlock } from "./gen-capabilities.js";
import { BUILDERS } from "../features/skills/skill-registry.js";

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

// --- buildCapabilities: the framework builders populate the roster (agents side) ---
check(
  "buildCapabilities: roster is exactly the framework builders, each with a description",
  () => {
    const cap = buildCapabilities();
    assert.deepEqual(
      cap.agents.map((a) => a.name).sort(),
      [...BUILDERS].sort(),
      "every BUILDER (and nothing else) is in the roster",
    );
    for (const a of cap.agents) {
      assert.equal(a.local, false, `${a.name} is a framework agent`);
      assert.ok(a.description.length > 0, `${a.name} carries its routing charter`);
    }
  },
);

// --- renderRoutingBlock: framework agents namespace, game-local ones don't ---
check("renderRoutingBlock: framework → xenodot:<name>, local → bare + tag", () => {
  const block = renderRoutingBlock({
    profile: { genre: null, style: null },
    skills: [],
    agents: [
      { name: "godot-enemy", description: "ENEMY builder.", local: false },
      { name: "my-boss-builder", description: "Game-local boss builder.", local: true },
    ],
  });
  assert.match(block, /^## Available builders/m);
  assert.match(block, /- `xenodot:godot-enemy` — ENEMY builder\./);
  assert.match(block, /- `my-boss-builder` _\(game-local\)_ — Game-local boss builder\./);
  assert.doesNotMatch(block, /xenodot:my-boss-builder/, "a local agent is never namespaced");
});

// --- renderRoutingBlock: sorted by name so the block is deterministic across regens ---
check("renderRoutingBlock: roster rendered in name order", () => {
  const block = renderRoutingBlock({
    profile: { genre: null, style: null },
    skills: [],
    agents: [
      { name: "godot-visuals", description: "b", local: false },
      { name: "godot-assets", description: "a", local: false },
    ],
  });
  assert.ok(
    block.indexOf("godot-assets") < block.indexOf("godot-visuals"),
    "assets sorts before visuals",
  );
});

// --- renderRoutingBlock: fail-open on an empty/legacy (no agents) record ---
check("renderRoutingBlock: empty roster / legacy record → ''", () => {
  assert.equal(
    renderRoutingBlock({ profile: { genre: null, style: null }, skills: [], agents: [] }),
    "",
  );
  assert.equal(renderRoutingBlock(/** @type {any} */ ({ skills: [] })), "");
});

console.log(`✓ ${passed} checks passed`);
