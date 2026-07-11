// Tests for the auto-map generator core (plugin/tools/gen_binding_map.js buildBindingMap) — the
// "bring your own IFC" seam. The acceptance bar these guard: the generated map is (1) schema-valid
// for binding_map.gd, (2) deterministic, (3) built ONLY from geometric classes, and (4) led by a
// guaranteed-node pick so verify_twin.sh's binding smoke can find a node target to drive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBindingMap } from "../../../../plugin/tools/gen_binding_map.js";

/** A small synthetic sidecar: two geometric classes below the batch threshold (guaranteed nodes),
 * one non-geometric class (must be excluded), and the proxy override (geometric despite its prefix).
 * @returns {Record<string, unknown>} */
function synthSidecar() {
  return {
    "0wall00000000000000001": { ifc_class: "IfcWallStandardCase", name: "Wall B" },
    "0wall00000000000000002": { ifc_class: "IfcWallStandardCase", name: "Wall A" },
    "0door00000000000000001": { ifc_class: "IfcDoor", name: "Door 1" },
    "0space0000000000000001": { ifc_class: "IfcSpace", name: "Room 1" },
    "0storey000000000000001": { ifc_class: "IfcBuildingStorey", name: "Level 0" },
    "0proxy0000000000000001": { ifc_class: "IfcBuildingElementProxy", name: "Proxy X" },
  };
}

test("emits the binding_map.gd schema on every row", () => {
  const map = buildBindingMap(synthSidecar());
  assert.equal(map.version, 1);
  assert.ok(typeof map._about === "string" && map._about.length > 0);
  assert.ok(map.bindings.length >= 1);
  for (const b of map.bindings) {
    assert.equal(typeof b.tag, "string");
    assert.equal(b.globalid.length, 22, "globalid must be the 22-char IFC join key");
    assert.equal(typeof b.min, "number");
    assert.equal(typeof b.max, "number");
    assert.ok(b.response === "albedo_ramp" || b.response === "label");
    assert.equal(b.ramp.length, 2, "ramp is exactly two colour strings");
    for (const c of b.ramp) assert.match(c, /^#[0-9a-fA-F]{6}$/);
  }
});

test("excludes non-geometric classes (spaces, storeys) and keeps the proxy override", () => {
  const map = buildBindingMap(synthSidecar());
  const classes = new Set(map.bindings.map((b) => b.ifc.split(" / ")[0]));
  assert.ok(!classes.has("IfcSpace"), "IfcSpace carries no mesh — must be excluded");
  assert.ok(!classes.has("IfcBuildingStorey"), "IfcBuildingStorey carries no mesh — must be excluded");
  assert.ok(classes.has("IfcBuildingElementProxy"), "proxy is geometric — must be kept");
});

test("is deterministic — same sidecar yields a byte-identical map", () => {
  const a = JSON.stringify(buildBindingMap(synthSidecar()));
  const b = JSON.stringify(buildBindingMap(synthSidecar()));
  assert.equal(a, b);
});

test("leads with a guaranteed-node class (count < min-instances) for the smoke's node-drive", () => {
  // Every synth class has < 8 elements, so the FIRST binding is guaranteed to land on a plain node
  // (never MMI-batched) — the element the binding smoke samples for a moving albedo.
  const map = buildBindingMap(synthSidecar(), { minInstances: 8 });
  const first = map.bindings[0];
  assert.ok(first !== undefined);
  assert.equal(first.response, "albedo_ramp", "the lead binding paints a node so the smoke can drive it");
});

test("spreads across distinct classes rather than N of one", () => {
  const map = buildBindingMap(synthSidecar(), { max: 3 });
  const classes = new Set(map.bindings.map((b) => b.ifc.split(" / ")[0]));
  assert.ok(classes.size >= 2, "round-robin picks distinct classes before repeating one");
});

test("respects the --max cap and tolerates a geometry-free sidecar", () => {
  const capped = buildBindingMap(synthSidecar(), { max: 2 });
  assert.equal(capped.bindings.length, 2);
  const empty = buildBindingMap({ "0space0000000000000001": { ifc_class: "IfcSpace", name: "R" } });
  assert.equal(empty.bindings.length, 0, "no geometric element => no bindings (caller FAILs on this)");
});
