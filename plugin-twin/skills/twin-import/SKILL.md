---
name: twin-import
agents: [twin-architect, data-binder]
description: >-
  The IFC→Godot import pipeline for a digital-twin viewer — convert an IFC/BIM model to a GLB whose
  node names carry the IFC GlobalIds, plus a property sidecar JSON keyed by the same GlobalIds, then
  load the GLB at RUNTIME with GLTFDocument (no editor import, works headless) and verify the
  GlobalId join. Use when bringing any IFC model into the viewer, setting up the ifcopenshell venv,
  when a sample-model download yields garbage (dead buildingSMART URLs), when GLB node names don't
  match sidecar keys ("join misses"), or when tempted to import the model through the Godot editor
  (don't — runtime load is the contract). NOT the live-data wiring (twin-bind-data) and NOT scale
  optimization (twin-optimize).
---

# Twin import (IFC → GLB + sidecar → runtime load)

One pipeline, three artifacts, one invariant: **the IFC GlobalId is the join key everywhere** —
GLB node names carry it, the sidecar JSON is keyed by it, live tags bind through it
(skill `twin-bind-data`). Break the invariant and the twin is just a 3D model.

```
model.ifc ──ifc_convert.py──▶ model.glb        (node names = IFC GlobalIds)
                          └─▶ model_props.json (GlobalId → {ifc_class, name, psets, quantities})
model.glb ──GLTFDocument (runtime)──▶ live scene tree
```

Proven end-to-end on the Duplex sample: 2.3 MB IFC → GLB + sidecar in ~1.1 s wall-clock.

## Step 0 — the Python venv (the version trap)

ifcopenshell ships **no wheel for Python 3.14** (the current macOS system python) — `pip install
ifcopenshell` on 3.14 fails with "no matching distribution". Pin **3.12**:

```bash
rtk uv venv --python 3.12 .venv-ifc
source .venv-ifc/bin/activate
rtk uv pip install ifcopenshell==0.8.5      # 0.8.5 = the proven version
python -c "import ifcopenshell; print(ifcopenshell.version)"
```

The venv is a host toolchain, not project runtime — keep it out of the Godot project's `res://`
(gitignore it). Godot never touches Python; the converter is a build step.

## Step 1 — convert: `tools/ifc_convert.py`

```bash
python tools/ifc_convert.py model.ifc                       # → model.glb + model_props.json
python tools/ifc_convert.py model.ifc --glb out/plant.glb --sidecar out/plant_props.json
```

What it does (and why each line matters — see the script for the full source):

- `settings.set("weld-vertices", True)` — geometry settings for the iterator.
- **`serializer_settings().set("use-element-guids", True)`** — THE critical line: the gltf
  serializer names each node by the element's **GlobalId** instead of its display name. Without
  it there is no join key and the whole pipeline is decorative.
- Sidecar: for every `IfcProduct` with a GlobalId, `ifcopenshell.util.element.get_psets(el,
psets_only=True)` + `get_psets(el, qtos_only=True)` → `{ifc_class, name, psets, quantities}`.
- **`json.dump(..., default=str)`** — pset values include non-JSON types (IFC entity refs,
  dates); without `default=str` the dump raises on real-world models.

## Sample models — the dead-URL gotcha

The canonical buildingSMART sample URLs are **DEAD** (they 404 or serve an HTML page that
"converts" into garbage). Working mirror for the standard Duplex model:

```
https://raw.githubusercontent.com/andyward/XBimDemo/master/Xbim.TestApp/Duplex_A_20110907.ifc
```

**Always validate the download before converting** — a real IFC (STEP file) starts with the
ISO header; an HTML error page doesn't:

```bash
rtk proxy head -c 13 Duplex_A_20110907.ifc    # must print: ISO-10303-21;
```

If it prints `<!DOCTYPE` or anything else, the URL served a web page, not a model.

## Step 2 — load at RUNTIME (no editor import)

The viewer loads the GLB with `GLTFDocument` at runtime — **no editor import step, no
`.import` files, works `--headless`**. This is the contract: models are data the viewer opens,
not assets baked into the project.

```gdscript
var gltf := GLTFDocument.new()
var state := GLTFState.new()
var err := gltf.append_from_file(glb_path, state)   # absolute path — globalize res:// first
if err != OK:
    push_error("GLB load failed: %s" % err)
    return
var scene := gltf.generate_scene(state)
add_child(scene)
```

`append_from_file` wants a real filesystem path — use
`ProjectSettings.globalize_path("res://…")` for project-relative GLBs.

## Step 3 — verify the GlobalId join (headless, mandatory)

After every conversion, prove the join before building on it. The headless check pattern
(an `extends SceneTree` script, run `$GODOT --headless --path . -s tools/check_twin_join.gd`):
load the GLB (step 2), collect all `MeshInstance3D` nodes, load the sidecar JSON, and join
each mesh node to a sidecar key. Two name quirks the join MUST handle:

- **The guid may sit on the PARENT grouping node** — when a glTF node had children, the mesh
  is a child of the named node. Check the node's own name, then its parent's.
- **Godot uniquifies duplicate sibling names** by appending suffixes (`name2`, `name3`). An
  IFC GlobalId is exactly **22 characters** — if a candidate name is longer and its first 22
  chars are a sidecar key, that prefix is the guid: `c.substr(0, 22)`.

```gdscript
func _guid_for(n: Node, side: Dictionary) -> String:
    var cands := [str(n.name), str(n.get_parent().name) if n.get_parent() else ""]
    for c in cands:
        if side.has(c):
            return c
        if c.length() > 22 and side.has(c.substr(0, 22)):
            return c.substr(0, 22)
    return ""
```

Emit machine-readable results and gate on the ratio:

```
MESH_COUNT=<n>
SIDECAR_KEYS=<n>
JOIN=<joined>/<total>
MISS_SAMPLE=[first few unmatched names]
```

A healthy conversion joins ~100% of mesh nodes. A low ratio means `use-element-guids` was off,
the GLB and sidecar came from different conversions, or the model has products without
GlobalIds — diagnose from `MISS_SAMPLE`, never ship a low-join model into binding work.

## Error → Fix

| Symptom                                                       | Fix                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pip install ifcopenshell` — no matching distribution         | Python too new (3.14 has no wheel). `uv venv --python 3.12`, install `ifcopenshell==0.8.5`                                     |
| Downloaded "IFC" fails to open / parses as garbage            | Dead buildingSMART URL served HTML. Use the XBimDemo raw.githubusercontent.com mirror; validate `head -c 13` = `ISO-10303-21;` |
| GLB node names are display names, not 22-char ids             | `use-element-guids` not set on **serializer_settings** (it is a serializer setting, not a geometry setting)                    |
| `json.dump` raises TypeError on psets                         | Missing `default=str` — pset values include IFC entity refs/dates                                                              |
| `append_from_file` returns error on a valid GLB               | Passed a `res://` path — globalize it (`ProjectSettings.globalize_path`)                                                       |
| `JOIN` well below mesh count, misses look like guids + suffix | Godot name-dedup — apply the 22-char prefix rule (above)                                                                       |
| `JOIN` misses are readable names ("Wall", "Basic Wall:…")     | This GLB was converted without guids, or by another tool — reconvert with `tools/ifc_convert.py`                               |
| Sidecar has keys the scene never shows                        | Normal: non-geometric products (spaces, systems) have psets but no shapes. Join is gated over MESH nodes, not sidecar keys     |

## RTK note

Prefix shell commands with `rtk` as usual. The Godot binary (`$GODOT`) and the python inside
the venv run without an rtk filter (passthrough). Never reference rtk inside `.gd` or `.py`
files.
