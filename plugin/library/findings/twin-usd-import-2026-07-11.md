---
type: finding
title: "twin-usd-import — OpenUSD joins the pipeline by extension-switch: prim-path join key, 15/15 join, 12/12 bindings, no C++"
description: "OpenUSD (.usd/.usda/.usdc) becomes a second twin input by EXTENSION-SWITCH, not a second pipeline: tools/usd_convert.py mirrors ifc_convert.py's CLI (in → out.glb + out_props.json + --metrics), twin_build.sh routes .usd* to it via a pinned .venv-usd (usd-core 26.5), and everything downstream is unchanged because the GLB node name + sidecar key are the SANITIZED PRIM PATH (strip leading /, '/'→'__', other non-[A-Za-z0-9_]→'_'; /Plant/Tanks/TK_101 → Plant__Tanks__TK_101) — the same join-key invariant IFC's GlobalId satisfies. Measured on the bundled synthetic plant.usda (15 UsdGeom.Mesh prims): JOIN 15/15 (100%), auto-map 12 bindings across 4 prim-path groups with ZERO hand-authoring, headless boot 'bindings resolved 12/12'. The geometry route is dependency-free (usd-core reads points/faces + a hand-rolled GLB writer) — guc/Blender/C++ NOT built. Honest limits: authored polygon meshes only (implicit prims skipped), convex-fan triangulation. One machine: macOS M3 Pro/Metal, Godot 4.6.3, Python 3.12.12, usd-core 26.5."
timestamp: 2026-07-11T16:00:00+01:00
tags:
  [usd, openusd, twin, import, join, prim-path, sidecar, auto-map, extension-switch, custom-agent]
---

# OpenUSD import — the extension-switch held (prim path = join key)

Roadmap Good-to-Have #10. The readiness plan (`docs/handoff/2026-07-09-usd-pointcloud-readiness.md`)
pre-derived the shape: USD's stable id is the **prim path**; a converter that names GLB nodes by it
and keys the sidecar the same plugs into the existing join gate unmodified. Phase B promoted Phase
A's proven prototype into the framework and proved it end-to-end in a stranger's seat.

## What shipped

- `plugin/tools/usd_convert.py` — CLI mirrors `ifc_convert.py` (`<in> --glb --sidecar --metrics`,
  stem defaults). Reads `UsdGeom.Mesh` points/faceVertexCounts/faceVertexIndices via usd-core,
  fan-triangulates, writes a hand-rolled glTF-2.0 GLB (pure `struct`). Filters usd-core's
  auto-injected `userDocBrief` schema-doc customData key. Fail-closed on unreadable/non-USD input
  (catches `Tf.ErrorException` AND an invalid stage) and on a stage with no tessellable mesh prims.
- `plugin/examples/gen_plant_usd.py` + `plant.usda` — the USD sibling of `gen_plant_ifc.py`/`plant.ifc`.
- `twin_build.sh` extension-switch: `.usd/.usda/.usdc` → `usd_convert.py` in `.venv-usd`; `--provision`
  bootstraps the venv the **input format** needs (one flag, format-aware — smallest honest shape).
- `gen_binding_map.js` made sidecar-generic (`classOf()`); `binding_map.gd` join key generalized from
  "IFC GlobalId only" to "any stable node-name id (GlobalId or sanitized prim path)".

## THE SANITIZATION CONTRACT (the join — this is load-bearing)

A GLB node name / JSON key cannot be a raw prim path (`/Plant/Tanks/TK_101`). The prim path is mapped
by `usd_convert.py`'s `sanitize()`, and the SAME function keys the sidecar — that identity is the join:

1. strip the single leading `/` → `Plant/Tanks/TK_101`
2. every remaining `/` → `__` → `Plant__Tanks__TK_101`
3. every other non-`[A-Za-z0-9_]` char → `_`

Prim paths are unique and the map is near-injective; a rare collision surfaces as a join miss (both
sides move together), never a silent overwrite. `binding_map.gd` now indexes a node under its FULL
name when that differs from the 22-char IFC prefix — so an IFC node (name == GlobalId) is unchanged
(byte-for-byte target counts) while a USD node (`Plant__Tanks__TK_101`, 20 chars, not base64) resolves.

## Measured (bundled `plant.usda`, 15 `UsdGeom.Mesh` prims, seat = `usd-twin/viewer`)

| Stage             | Result                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| provision         | `.venv-usd` = usd-core 26.5, Python 3.12.12 (uv, ~0.1 s)                               |
| import            | 15 GLB nodes + 15 sidecar keys, ~0.01 s; `userDocBrief` filtered                       |
| auto-map          | 12 bindings across 4 prim-path groups (Tanks/Pumps/Header/Valves), zero hand-authoring |
| **join gate**     | **JOIN 15/15 (100.0%)**, JOIN-GATE OK (min 95%)                                        |
| optimize          | 15 nodes, 0 instancing (unique geometry — same NO-OP read as the IFC plant)            |
| **headless boot** | **model loaded, bindings resolved 12/12**, quit-after reached                          |

`usdchecker plant.usda` → `Success!`; regen is deterministic (identical stage, sha256
`1c2451ff…`, 14609 bytes). D9 toolchain-drift (gdformat 4.5.0 reformats 3 committed `.gd`; Godot
4.6.3 treats `smoke_binding.gd`'s unsafe-casts as errors) aborts the ONE-command `twin_build` at the
static-floor format gate and blocks `smoke_binding.gd` — so the join and boot gates were run DIRECTLY
(the BYO-unit remedy), each green above. The drift is pre-existing and unrelated to the USD change.

## The no-C++ route (and its honest limits)

`guc` and Blender headless were both absent (Phase A); C++ was **not** built from source (roadmap
NONE-list). The qualified route is usd-core reading mesh arrays directly + a dependency-free GLB
writer. Scope, stated plainly:

- **Authored polygon meshes only.** Implicit prims (`UsdGeom.Sphere/Cylinder/Cube`) carry no points
  array and are SKIPPED — they never reach the GLB or the sidecar. A stage built from implicit prims
  needs a prior tessellation pass (guc / Blender headless / usdImaging) — **unsettled**, deferred to
  a real user file that needs it (the readiness trigger discipline).
- **Convex faces only** (fan triangulation). True for the box/cylinder-band demo prims.
- The pip `usd-core` wheel ships the `pxr` module but **no CLI binaries** (`usdcat` et al.); macOS's
  system `/usr/bin/usd*` tools read the wheel's output for round-trip/validation.

## Custom-agent experiment (seat-only, `claude -p` from `usd-twin/viewer`)

Drove the render-health gate through a seat session with the framework's custom agents/skills.

- **Run 1** (untrusted workspace): hit the **trust gate** Phase A predicted — headless `-p` ignores
  the seat's 39-entry `permissions.allow` until the workspace is trusted, so tool calls fell to
  interactive prompting `-p` can't answer; it thrashed to `error_max_turns` (16 turns, 118 s, $1.81,
  empty result). Honest failure, one cause.
- **Run 2** (seat trusted via `hasTrustDialogAccepted:true`, Phase A option a): **success** — 10
  turns, 72 s, $1.24. It **routed** to the render-health gate, **actually ran** it
  (`verify_render.gd`, windowed 640×360), returned the verbatim verdict (`VERIFY-RENDER: FAIL — flat
color` on the standalone model scene) AND correctly contextualized it: a model-only scene rendering
  flat is the **documented Main-shell expectation**, not a defect — it recommended running the gate on
  `main.tscn` with the model loaded through the shell. Skill-aware judgment, not just a command echo.
- **Verdict:** viable for real work once the seat is trusted; the trust gate is the whole friction.
  Neither run modified the framework clone (seat-only, confirmed by `git status`).

## One-machine caveat

Apple M3 Pro / Metal, Godot 4.6.3, Python 3.12.12, usd-core 26.5, uv 0.9. Single-run wall times, not
benchmarked records. The plant is a demonstration model (no real-world provenance).
