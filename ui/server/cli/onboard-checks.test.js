// node:test coverage for the pure environment audit shared by `onboard:check` (CLI) and the
// first-boot setup panel (GET /api/onboard-status) — same function, so the two never drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardChecks, summarizeChecks, MIN_NODE } from "./onboard-checks.js";

test("onboardChecks: Node is the required check and passes on this runtime", () => {
  const checks = onboardChecks();
  assert.ok(Array.isArray(checks) && checks.length >= 5, "returns the audit list");
  const node = checks[0];
  assert.ok(node, "has a Node check");
  assert.equal(node.required, true, "Node is the one hard requirement");
  assert.equal(node.mark, "✓", `test runner is Node ≥${MIN_NODE}, so Node passes`);
  // Every check carries a mark from the fixed set and a human line.
  for (const c of checks) {
    assert.ok(["✓", "✗", "—"].includes(c.mark), `valid mark: ${c.mark}`);
    assert.ok(typeof c.line === "string" && c.line.length, "has a line");
  }
});

test("summarizeChecks: counts by mark and flags a required failure", () => {
  const rollup = summarizeChecks([
    { mark: "✓", line: "a" },
    { mark: "✗", line: "b", required: true },
    { mark: "—", line: "c" },
  ]);
  assert.deepEqual(rollup, { present: 1, missing: 1, skipped: 1, requiredFail: true });
  const clean = summarizeChecks([{ mark: "✗", line: "advisory" }]);
  assert.equal(clean.requiredFail, false, "a non-required ✗ does not fail the audit");
});
