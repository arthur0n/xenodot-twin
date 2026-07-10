// node:test coverage for the binding-candidate shared core (features/assets/binding-candidates.js) —
// the pure query + sidecar resolution the mcp tool, the CLI, and the /api/binding-candidates endpoint
// all wrap. Exact expected numbers come from a SMALL seeded fixture (the analysis-seam "exact-tested
// against seeded fixtures" ethos), so a drift in filter/pagination semantics fails loudly. A temp
// project dir gives real models/ + root discovery without touching a real seat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SidecarError,
  SIDECAR_SUFFIX,
  listSidecars,
  resolveSidecarPath,
  loadSidecar,
  queryCandidates,
} from "./binding-candidates.js";

/** A seeded sidecar: 3 walls (2 plain + 1 StandardCase), 2 doors, 1 storey-tagged beam, 1 malformed
 * entry (must be skipped). Every count in the asserts is hand-derived from THIS object. */
const FIXTURE = {
  W1: { ifc_class: "IfcWall", name: "Party Wall North", psets: {}, quantities: {} },
  W2: { ifc_class: "IfcWall", name: "Party Wall South", psets: {}, quantities: {} },
  WSC: { ifc_class: "IfcWallStandardCase", name: "Exterior Brick", psets: {}, quantities: {} },
  D1: { ifc_class: "IfcDoor", name: "Front Door", psets: {}, quantities: {} },
  D2: { ifc_class: "IfcDoor", name: null, psets: {}, quantities: {} },
  B1: {
    ifc_class: "IfcBeam",
    name: "Steel Beam",
    psets: { Pset_Placement: { BuildingStorey: "Level 02" } },
    quantities: {},
  },
  BAD: "not-an-object",
};

test("queryCandidates: IfcWall prefix match catches IfcWall AND IfcWallStandardCase", () => {
  const r = queryCandidates(FIXTURE, { ifcClass: "IfcWall" });
  assert.equal(r.total, 7); // includes the malformed BAD key
  assert.equal(r.matched, 3); // W1 + W2 + WSC
  assert.deepEqual(
    r.classes,
    [
      { ifcClass: "IfcWall", count: 2 },
      { ifcClass: "IfcWallStandardCase", count: 1 },
    ],
    "class histogram over the matched set, count-desc",
  );
  // Deterministic order: (class, name, globalId)
  assert.deepEqual(
    r.candidates.map((c) => c.globalId),
    ["W1", "W2", "WSC"],
  );
});

test("queryCandidates: exact class filter is case-insensitive and excludes StandardCase when specific", () => {
  const r = queryCandidates(FIXTURE, { ifcClass: "ifcdoor" });
  assert.equal(r.matched, 2);
  assert.deepEqual(
    r.candidates.map((c) => c.name),
    [null, "Front Door"], // D2(null) sorts before "Front Door" ("" < "Front")
  );
});

test("queryCandidates: name substring is case-insensitive", () => {
  const r = queryCandidates(FIXTURE, { name: "party" });
  assert.equal(r.matched, 2);
  assert.ok(r.candidates.every((c) => (c.name ?? "").includes("Party")));
});

test("queryCandidates: best-effort storey surfaces + filters when a pset carries it", () => {
  const all = queryCandidates(FIXTURE, { ifcClass: "IfcBeam" });
  assert.equal(all.candidates[0]?.storey, "Level 02");
  const filtered = queryCandidates(FIXTURE, { storey: "level 02" });
  assert.equal(filtered.matched, 1);
  assert.equal(filtered.candidates[0]?.globalId, "B1");
  // Elements without a storey are excluded when a storey filter is given.
  assert.equal(queryCandidates(FIXTURE, { storey: "nope" }).matched, 0);
});

test("queryCandidates: pagination never dumps — offset/limit bound the page, matched is the truth", () => {
  const r = queryCandidates(FIXTURE, { limit: 2, offset: 2 });
  assert.equal(r.matched, 6); // all well-formed entries (BAD skipped)
  assert.equal(r.count, 2);
  assert.equal(r.limit, 2);
  assert.equal(r.offset, 2);
});

test("queryCandidates: limit is clamped to the MAX (never an unbounded slurp)", () => {
  const r = queryCandidates(FIXTURE, { limit: 99999 });
  assert.ok(r.limit <= 200, "limit clamped to MAX_LIMIT");
});

test("resolveSidecarPath + listSidecars: models/ wins, model stem resolves, ambiguity errors", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xeno-binding-core-"));
  const models = path.join(root, "models");
  mkdirSync(models);
  writeFileSync(path.join(models, "A" + SIDECAR_SUFFIX), JSON.stringify(FIXTURE));
  writeFileSync(path.join(models, "B" + SIDECAR_SUFFIX), JSON.stringify(FIXTURE));

  const found = listSidecars(root);
  assert.deepEqual(
    found.map((f) => f.name),
    ["A" + SIDECAR_SUFFIX, "B" + SIDECAR_SUFFIX],
  );
  // model stem → the right file
  assert.equal(
    resolveSidecarPath({ projectDir: root, model: "A" }),
    path.join(models, "A_props.json"),
  );
  // ambiguous (two sidecars, no model/sidecar) → SidecarError
  assert.throws(() => resolveSidecarPath({ projectDir: root }), SidecarError);
  // unknown model → SidecarError
  assert.throws(() => resolveSidecarPath({ projectDir: root, model: "Z" }), SidecarError);
});

test("loadSidecar: parses a real file, rejects a non-object top level gracefully", () => {
  const root = mkdtempSync(path.join(tmpdir(), "xeno-binding-load-"));
  const good = path.join(root, "g" + SIDECAR_SUFFIX);
  writeFileSync(good, JSON.stringify(FIXTURE));
  const { sidecar, bytes } = loadSidecar(good);
  assert.equal(Object.keys(sidecar).length, 7);
  assert.ok(bytes > 0);

  const bad = path.join(root, "b" + SIDECAR_SUFFIX);
  writeFileSync(bad, "[1,2,3]"); // JSON, but an array, not { GlobalId: {…} }
  assert.throws(() => loadSidecar(bad), SidecarError);
  assert.throws(() => loadSidecar(path.join(root, "missing.json")), SidecarError);
});
