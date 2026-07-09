# Readiness plan — USD import (#10) and point clouds (#11), offline-conversion pattern

Roadmap Good-to-Haves #10 and #11 (see `2026-07-09-roadmap-handoff.md`), one doc
because the roadmap's own rule is "same pipeline shape as IFC; do when a user shows up
with the files". PARKED BY DESIGN. Readiness altitude: triggers, pre-derived shape,
first bounded steps. Not a build plan.

## Shared trigger + shared pattern

**Trigger (each format independently): a user/prospect shows up with real files.**
Nothing else counts — not "USD is strategic", not a nice sample found online. The
roadmap's NONE-list already settled the architecture question: native C++ format
parsers (GDExtensions) are NOT agent-shaped and never get built here; the agent-shaped
version is the OFFLINE CONVERSION PIPELINE, which the IFC path already proved:
fiddly-documented-workflow → encoded once in a skill → deterministic tool →
gate-verified artifacts.

**The invariant that generalizes** (this is the load-bearing insight): the IFC
pipeline's contract is really "every rendered element carries a STABLE ID that joins
geometry ↔ sidecar ↔ live tags". GlobalId is the IFC instance of it. The join gate
(`check_twin_join.gd`) already checks node names vs sidecar keys GENERICALLY — a
converter for any format that names nodes by its stable id and keys its sidecar the
same way plugs into the existing gate unmodified.

## USD (#10) — pre-derived shape

- **Join key: the prim path** (USD's stable identifier). Converter names GLB nodes by
  prim path (sanitized — document the sanitization as part of the contract), sidecar
  keyed identically: `{prim_path: {type, attributes, customData…}}`.
- **Toolchain candidates to qualify at trigger time** (availability/quality verified
  then — same discipline as the plant-asset sourcing spike): `usd-core` (Pixar OpenUSD
  Python wheels — the sidecar/attribute walker, same role ifcopenshell plays);
  geometry via `guc` (open-source USD→glTF) or Blender headless import→GLB export as
  the fallback; Apple's usdzconvert where relevant. Expect the same class of traps as
  IFC (venv pinning, flag archaeology) — that's precisely why it's skill-shaped.
- **Tool shape**: `tools/usd_convert.py` mirroring `ifc_convert.py`'s CLI contract
  (`in.usd → out.glb + out_props.json`, stem-derived defaults) so `twin-build`
  (`2026-07-09-twin-build-plan.md`) grows a second input format by extension-switch,
  not redesign.
- **Godot-native USD**: an open engine proposal — ADOPT it when it lands (roadmap's
  explicitly-NOT section); the offline pipeline is the meantime, and the sidecar/join
  layer stays ours either way.
- **First bounded steps at trigger**: convert THE USER'S file first (its structure
  decides prim-path sanitization + which attributes matter); join gate ≥95% on it;
  only then generalize into skill + venv recipe + sample asset.

## Point clouds (#11) — pre-derived shape (and the honest difference)

Point clouds are NOT join-shaped — no elements, no stable per-thing ids, just points.
Pretending otherwise would corrupt the invariant. Their twin role is different and
should be stated plainly when built: **context backdrop** (the as-scanned plant/site)
under the BIM/USD model that carries the data binding.

- **Pipeline**: LAS/E57 → offline decimation/voxel downsample (PDAL or Open3D — the
  established tools; qualify at trigger) → chunked Godot-renderable artifact.
- **Rendering candidates** (measure, don't assume — bench methodology exists):
  `ArrayMesh` with `PRIMITIVE_POINTS` + point-size shader, chunked like the MultiMesh
  recipe; region chunking reuses the AUTO-grid thinking from `twin_chunks.gd`. A
  point-budget recipe (how many points this machine class holds at frame budget) is a
  bench_scene.gd run away — same findings discipline as chunking.
- **Sidecar**: per-CHUNK metadata only (source file, bounds, point count, decimation
  params) — provenance, not element properties. Binding: none, by design; at most
  region tags. The docs say so explicitly (honesty rule).
- **Alignment**: scan↔model registration (a transform) is the real user problem;
  v-trigger scope is "accept a known transform" (from CloudCompare or the like), NOT
  auto-registration — that's a solver, roadmap NONE territory.
- **First bounded steps at trigger**: decimate the USER'S scan to three budgets, bench
  all three on the standard vantages, pick the recipe, ship converter + findings +
  skill section together.

## Shared never-list (scope fence)

- No C++/GDExtension parsers authored here — adopt mature ones if/when they exist
  (GDIFC-style rule from the roadmap applies to all formats).
- No streaming/tiling runtime (Cesium/Omniverse turf — refuted-claims research keeps
  that door consciously closed).
- No auto-registration/SLAM for scans.
- Neither format blocks or reshapes current pipeline work — when triggered, they
  EXTEND `twin-build` and the join gate; if a design would require changing the join
  invariant instead, the design is wrong (point clouds sit BESIDE the invariant as
  backdrop, they don't weaken it).
