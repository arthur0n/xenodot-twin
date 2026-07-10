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
ifcopenshell` on 3.14 fails with "no matching distribution". The venv MUST pin **3.12**, and
**0.8.5** is the proven version. `tools/twin_venv.sh` owns that recipe so you never hand-run it:

```bash
rtk tools/twin_venv.sh                         # ensure .venv-ifc (idempotent)
rtk tools/twin_venv.sh --run tools/ifc_convert.py model.ifc   # ensure, then convert inside it
```

It is **idempotent**: an existing valid `.venv-ifc` is reused; a missing one is provisioned
(`uv venv --python 3.12` + `uv pip install ifcopenshell==0.8.5`); a different ifcopenshell
already installed **FAILs loud** with the fix (it never silently rebuilds — drift stays visible).
The equivalent by hand, if you ever need it:

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
python tools/ifc_convert.py model.ifc --metrics models/model.metrics.json   # + machine-readable metrics
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

### The metrics contract: `--metrics <path>`

`--metrics models/<model>.metrics.json` writes the import result as **machine-readable JSON** so the
numbers live somewhere the product can read, not only in a finding's prose. It carries `model`,
`schema`, `shapes` (GLB node count), `elements` (sidecar key count), `import_seconds` (single-run
wall-clock — the one-machine caveat applies), plus the `ifc`/`glb`/`sidecar` paths and a `timestamp`.
The **assets panel's "Imported models" card reads this file** (`GET /api/import-metrics` scans the
project's `models/*.metrics.json`). The join verdict is added by the next step:

- `check_twin_join.gd --json=<same path>` **merges** `join_matched` / `join_total` / `join_pct` /
  `join_gate` / `sidecar_keys` into the same file — one file carries the whole import result. Point
  both stages at `models/<model>.metrics.json` and the card shows schema, JOIN %, import time and
  counts together. (GDScript's JSON re-serializes the ints as floats on merge — consumers round.)

## Sample models — the dead-URL gotcha

### Validated models — re-fetch from here, do NOT re-walk dead URLs

Each row is a model this pipeline has actually converted; the detailed fetch/verify notes follow.
Feed the URL + sha256 to `tools/twin_fetch_model.sh` (it handles the Git-LFS media endpoint):

| Model                  | Schema | Size    | sha256 (prefix) | Source (see detail below)                         |
| ---------------------- | ------ | ------- | --------------- | ------------------------------------------------- |
| **Duplex** (bundled)   | IFC2X3 | 2.3 MB  | —               | `plugin/examples/` + XBimDemo raw mirror          |
| **Schependomlaan**     | IFC2X3 | 62 MB   | `57fafa59f03b…` | buildingsmart-community sample repo (LFS media)   |
| **NBU Medical Clinic** | IFC4   | 27 MB\* | `32b5f8008a39…` | TIB DURAARK mirror (zip; \*per-discipline models) |

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

A vetted copy of the Duplex sample (plus an example binding map + viewer config) ships in the
try-it kit at `plugin/examples/` — see its `README.md` for the copy-in-and-convert
quickstart and `NOTICE.md` for provenance.

### Fetch + verify + stamp in one command: `tools/twin_fetch_model.sh`

Don't hand-run the download/verify/provenance chore — `tools/twin_fetch_model.sh` does all of it:
download → **Git-LFS media-endpoint handling** → **sha256 verify** against the expected digest →
**STEP-header** (`ISO-10303-21;`) sanity → schema read → **stamp `models/PROVENANCE.md`**
(URL, license, sha256, size, schema). It's idempotent (an output whose sha256 already matches is
reused) and never leaves a half-verified file.

```bash
rtk tools/twin_fetch_model.sh <url> --sha256 <hex> --out models/<name>.ifc --license "<line>"
```

**The Git-LFS trap:** the buildingSMART community sample repo tracks its `.ifc` files with Git
LFS, so a plain `raw.githubusercontent.com` / GitHub `blob` URL serves a ~130-byte **text
pointer**, not the model. The tool auto-detects the pointer and re-fetches from the
`media.githubusercontent.com/media/` endpoint (which serves the real bytes); pass a media URL
directly and it just works.

**The large-IFC boundary — big source models never enter `res://`:** a 62 MB IFC (and its GLB +
20 MB+ sidecar) is a build **input**, not a shipped asset. Keep the raw `.ifc` and the derived
`.glb`/`_props.json`/`.metrics.json` in a `models/` dir that is **gitignored** (or Git-LFS-tracked
in the seat, never committed into the framework); Godot loads the GLB at runtime by absolute path
(Step 2), so nothing here needs to live under `res://`. Only the **optimized** scene the ship step
bakes goes into the packaged project. This mirrors the venv rule: host-side build artifacts stay out
of the game tree.

**Verified working sample — Schependomlaan** (a real 62 MB IFC2X3 Dutch row-house project, the
BIM-seat model; CC BY 4.0, credit line required — see the seat's `PROVENANCE.md`):

```
https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan/As%20Planned%20models/IFC%20Schependomlaan%20incl%20planningsdata.ifc
  65,078,748 bytes  IFC2X3  sha256 57fafa59f03b18c05be211a456e346bdd0445d5c35d66522e598d339e81dfcf4
```

### More dead / trap URLs — DO NOT RE-WALK (plant-asset sourcing spike, 2026-07-10)

Sourcing an industrial/plant-flavored public model (roadmap #8) re-confirmed the dead-URL trap
and found three more to skip:

| URL                                                                           | Status                  | Note                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://projects.buildingsmartalliance.org/files/?artifact_id=4288…4292,3451` | **DEAD** (curl 000)     | The canonical buildingSMART "Common BIM Files" artifact URLs — host down / DNS fail. The documented trap, re-confirmed.                               |
| `http://duraark.eu/data-repository/`                                          | **DEAD** (ECONNREFUSED) | DURAARK project site gone; the datasets survive at the TIB mirror (below).                                                                            |
| `http://openifcmodel.cs.auckland.ac.nz/`                                      | LIVE 200 but **JS SPA** | Landing page has no model list in HTML — enumeration needs the app's API. Not dead, a **walk-cost trap**; don't `curl`/WebFetch-walk it in a timebox. |

**Verified working mirror** for the DURAARK datasets (the Medical Clinic family — CC0 per re3data
`r3d100012506`), pinned so a future session can re-fetch without re-walking:

```
https://tib.eu/data/duraark/BuildingData/01_IFC/NBU_MedicalClinic_ifc.zip
  82,736,494 bytes  sha256 32b5f8008a39bd7510adc8cae35179ad40a48d13a339e6aa0208ef43d6220a5c
```

(The Clinic HVAC discipline model — 27.4 MB IFC → 6.1 MB GLB, 100 % join — is the only
practically-sized real plant-ish candidate, but it is air-side only: fans/VAV/AHU, **no
pump/tank/valve**. The plant demo shipped as a synthetic model instead; see the roadmap #8 tick.)

### `IfcTank` / `IfcPump` / `IfcValve` are IFC4-only

These first-class equipment classes **do not exist in IFC2X3** — there they are generic
`IfcFlowStorageDevice` / `IfcFlowMovingDevice` / `IfcFlowController` with an `ObjectType`
discriminator. So: a binding map or census over an **IFC2X3** model (the Duplex, the DURAARK
Clinic family) must inspect `Name`/`ObjectType`, not the entity class, to find a pump or tank;
a model that expresses them as literal `IfcPump`/`IfcTank` (like the synthetic plant demo) is
**IFC4+**. Check the schema in the STEP header (`FILE_SCHEMA(('IFC4'))` vs `('IFC2X3')`) before
assuming which vocabulary the equipment speaks.

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

The shipped `tools/check_twin_join.gd` also takes **`--json=<path>`**, which writes the verdict as a
**struct** (`join_matched`/`join_total`/`join_pct`/`join_gate`/`sidecar_keys`), merging into the
`--metrics` file from Step 1 when you point both at `models/<model>.metrics.json`. That single file
is the contract the assets panel's import card reads — the join gate becomes a number the product
shows, not only a log line. It writes on the OK path and on FAIL paths that reach a verdict (a
failing join is a fact) — early-exit failures before a verdict (unreadable/empty sidecar,
scene-load failure) skip the write; there is nothing to report yet.

## Error → Fix

| Symptom                                                       | Fix                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pip install ifcopenshell` — no matching distribution         | Python too new (3.14 has no wheel). Run `tools/twin_venv.sh` (pins 3.12 + `ifcopenshell==0.8.5`)                               |
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
