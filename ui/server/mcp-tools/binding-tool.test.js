// node:test coverage for the binding-candidate tool (mcp-tools/binding-tool.js) — the
// mcp__ui__find_binding_candidates dispatch surface. It wraps the SAME shared core the CLI + the
// /api/binding-candidates endpoint do (features/assets/binding-candidates.js), so this suite proves
// the SURFACE: registration, the happy path against a real in-project sidecar, pagination that never
// dumps the model, and the LOAD-BEARING confinement control (a model-supplied path can't escape the
// project root). GAME_DIR is set to a temp dir BEFORE import so config.PROJECT_DIR points at it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = mkdtempSync(path.join(tmpdir(), "xeno-binding-tool-"));
mkdirSync(path.join(ROOT, "models"));
process.env.GAME_DIR = ROOT;
const { makeBindingTool } = await import("./binding-tool.js");
const { uiControlAllow } = await import("../core/ui-control.js");
const { BINDING_TOOL } = await import("../core/config.js");

/** A seeded in-project sidecar with enough rows to page.
 * @type {Record<string, { ifc_class: string, name: string | null, psets: object, quantities: object }>} */
const SIDECAR = {};
for (let i = 0; i < 30; i++)
  SIDECAR[`W${i}`] = { ifc_class: "IfcWall", name: `Wall ${i}`, psets: {}, quantities: {} };
SIDECAR["D0"] = { ifc_class: "IfcDoor", name: "Front Door", psets: {}, quantities: {} };
writeFileSync(path.join(ROOT, "models", "House_props.json"), JSON.stringify(SIDECAR));

/** First text block of a tool result. @param {unknown} r @returns {string} */
function textOf(r) {
  return /** @type {{ content: { text?: string }[] }} */ (r).content[0]?.text ?? "";
}

/** Fill the optional keys the SDK's InferShape keeps required (as `| undefined`) — mirrors
 * analyze-tool.test's args(). @param {{ sidecar?: string, model?: string, ifcClass?: string,
 * name?: string, storey?: string, limit?: number, offset?: number }} input */
function args(input) {
  return {
    sidecar: undefined,
    model: undefined,
    ifcClass: undefined,
    name: undefined,
    storey: undefined,
    limit: undefined,
    offset: undefined,
    ...input,
  };
}

test("tool registers with the expected name + schema", () => {
  const t = makeBindingTool();
  assert.equal(t.name, "find_binding_candidates");
  assert.equal(typeof t.handler, "function");
  assert.ok(t.inputSchema.ifcClass, "exposes an ifcClass filter");
});

test("happy path: lists IfcWall candidates from the in-project sidecar (auto-picked model)", async () => {
  const t = makeBindingTool();
  const out = await t.handler(args({ ifcClass: "IfcWall", limit: 5 }), {});
  const text = textOf(out);
  assert.match(text, /30 of 31 elements match/); // 30 walls of 31 total
  assert.match(text, /showing 5/);
  assert.match(text, /IfcWall×30/); // class histogram
  assert.match(text, /W0\b/); // a GlobalId row is present
});

test("pagination never dumps: a page is bounded and points at the next offset", async () => {
  const t = makeBindingTool();
  const out = await t.handler(
    args({ model: "House", ifcClass: "IfcWall", limit: 5, offset: 0 }),
    {},
  );
  const text = textOf(out);
  // 30 matches, 5 shown → 25 more, and it must NOT contain all 30 rows.
  assert.match(text, /25 more — re-call with offset 5/);
  const rows = text.split("\n").filter((l) => /^\s{2}W\d+\s/.test(l));
  assert.equal(rows.length, 5, "exactly one bounded page of rows, never the whole model");
});

test("confinement: a model-supplied path outside the project root is refused (not read)", async () => {
  const t = makeBindingTool();
  const out = await t.handler(args({ sidecar: "../../../../etc/passwd" }), {});
  assert.match(textOf(out), /resolves outside the project root/);
});

test("confinement is REALPATH-based: an in-root symlink pointing outside is refused", async () => {
  // The attack a lexical resolve+startsWith misses: models/evil_props.json IS inside the root
  // lexically, but realpath's to a file outside it. The target holds valid sidecar JSON, so a
  // lexical-only check would happily serve its contents as "candidates" — this test fails
  // against that implementation by construction.
  const outside = mkdtempSync(path.join(tmpdir(), "xeno-binding-outside-"));
  const secret = path.join(outside, "secret_props.json");
  writeFileSync(
    secret,
    JSON.stringify({ S1: { ifc_class: "IfcWall", name: "SECRET", psets: {}, quantities: {} } }),
  );
  const link = path.join(ROOT, "models", "evil_props.json");
  symlinkSync(secret, link);
  try {
    const t = makeBindingTool();
    // Direct sidecar arg naming the symlink.
    const bySidecar = await t.handler(args({ sidecar: "models/evil_props.json" }), {});
    assert.match(textOf(bySidecar), /resolves outside the project root/);
    assert.doesNotMatch(textOf(bySidecar), /SECRET/, "the target file is never read");
    // model-stem resolution reaching the same symlink (the re-confine of the FINAL path).
    const byModel = await t.handler(args({ model: "evil" }), {});
    assert.match(textOf(byModel), /resolves outside the project root/);
    assert.doesNotMatch(textOf(byModel), /SECRET/, "the target file is never read");
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("graceful absence: an unknown model is a message, not a throw", async () => {
  const t = makeBindingTool();
  const out = await t.handler(args({ model: "Nope" }), {});
  assert.match(textOf(out), /no sidecar for model 'Nope'/);
});

test("the tool auto-allows (read-only UI-control surface), like request_asset", () => {
  const decision = uiControlAllow(BINDING_TOOL, {}, "orchestrator");
  assert.ok(decision, "BINDING_TOOL is a plain-allow tool");
  assert.equal(decision.behavior, "allow");
});
