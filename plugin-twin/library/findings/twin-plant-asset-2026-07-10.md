---
type: finding
title: "Synthetic plant demo asset — the optimizer is a NO-OP on it at any scale (honest read), + recording + shot-list"
description: "The synthetic tank-farm/pump-skid demo model (gen_plant_ifc.py) gets ZERO instancing from optimize_scene.gd at BOTH the vendored default (18 elements) and a 189-element --tanks 40 --pumps 30 preset — groups_instanced 0/18 and 0/189, multimeshes 0, est_draw_items unchanged. This CONTRADICTS the sourcing-spike hypothesis that repeated pipe runs make it an instancing showcase: the generator authors a fresh IfcExtrudedAreaSolid per element (0 IfcRepresentationMap), so ifc_convert.py emits a distinct Mesh resource per element and the optimizer's mesh-resource grouping finds no repeats — scale makes it WORSE, not better. The Duplex only instances because it either shares geometry via mapped representations (60 IfcRepresentationMap referenced by 167 IfcMappedItem in-model) for its repeated fixtures OR is spatially duplicated (the city benchmark's node.duplicate() shares one Mesh resource across 100 copies → 224/224 groups instanced). Plus: one deterministic plant recording (4800 frames / 59.9 s / 8 tags, byte-identical on re-record) and a human-paced marketing shot-list note. One machine, M3 Pro/Metal, Godot 4.6.3, ifcopenshell 0.8.5."
timestamp: 2026-07-10T16:00:00+01:00
tags: [multimesh, optimizer, instancing, ifc, plant, synthetic, recording, provenance]
---

# Synthetic plant demo asset — the optimizer is a NO-OP on it at any scale (honest read)

Companion to the [twin optimizer benchmark](twin-optimizer-benchmark-2026-07-08.md) (the
city-of-duplexes before/after) and the [vis-range recipe](twin-vis-range-recipe-2026-07-09.md).
This one measures the **synthetic plant demo asset** (roadmap Nice-to-Have #8, Track B — a
generated `IfcTank`/`IfcPump`/`IfcValve`/`IfcFlowSegment` model, `gen_plant_ifc.py`, no
real-world provenance) through the same `tools/optimize_scene.gd`, at two scales, and reports
the honest result: **the optimizer does nothing for it, and turning the scale knob up makes it
worse.** That corrects the sourcing spike's optimistic "pipe runs = repeated geometry →
instancing showcase" hypothesis. It doesn't hold — for a real and instructive reason.

Machine: M3 Pro, macOS Darwin 25.5, Metal (Forward+), **Godot 4.6.3.stable**, ifcopenshell
0.8.5 in the pinned 3.12 venv. Seat scaffold: `twindemo/twin-plant-validate/` (the Phase-2
validated plant project — venv + kit + artifacts).

## Census — the two presets

Both generated at `--seed 42` (byte-identical per seed; the generator seeds its own PRNG and
pins the STEP header — never `guid.new()`/wall-clock):

| preset             | generator args          | IfcTank | IfcPump | IfcValve | IfcFlowSegment | total elements | IFC bytes | GLB bytes |
| ------------------ | ----------------------- | ------- | ------- | -------- | -------------- | -------------- | --------- | --------- |
| default (VENDORED) | `--tanks 4 --pumps 3`   | 4       | 3       | 3        | 8              | **18**         | 15,989    | ~74.8 KB  |
| big (SCRATCH)      | `--tanks 40 --pumps 30` | 40      | 30      | 30       | 89             | **189**        | 160,058   | ~801.7 KB |

The default is the vendored asset (`plugin-twin/examples/plant.ifc`). The big preset is a
**scratch artifact — NOT vendored**: the generator + `--seed 42` reproduce it byte-for-byte, so
there is nothing to commit. Reproduce:

```bash
.venv-ifc/bin/python plugin-twin/examples/gen_plant_ifc.py --tanks 40 --pumps 30 --seed 42 \
  --out models/plant_big.ifc
.venv-ifc/bin/python tools/ifc_convert.py models/plant_big.ifc \
  --glb models/plant_big.glb --sidecar models/plant_big_props.json      # 189 shapes, 0.2 s
$GODOT --headless --path . --script tools/optimize_scene.gd -- \
  --in=res://models/plant_big.glb --out=res://models/plant_big_opt.tscn \
  --report=reports/plant_big_optimize.json
```

## Numbers — plant default vs plant big vs the Duplex reference

`optimize_scene.gd` groups `MeshInstance3D`s by **`(mesh resource identity, material_override)`**
and collapses any group of `>= --min-instances` (default 8) into region-chunked MultiMeshes.
`groups_instanced` / `multimeshes` are the report fields verbatim; `est_draw_items` is the
scene-graph estimate (`before → after`).

| scene                   | elements / meshes | groups_total | groups_instanced | multimeshes            | est_draw_items    | instancing verdict                                                                                                    |
| ----------------------- | ----------------- | ------------ | ---------------- | ---------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **plant default**       | 18                | 18           | **0**            | 0                      | 18 → 18           | **none** — every group is count 1                                                                                     |
| **plant big (40T/30P)** | 189               | 189          | **0**            | 0                      | 189 → 189         | **none** — every group is STILL count 1                                                                               |
| Duplex single (ref)     | 286 meshes        | 224          | —                | —                      | —                 | 286 meshes → 224 groups: the model reuses geometry (`IfcRepresentationMap` via `IfcMappedItem`) for repeated fixtures |
| Duplex city ×100 (ref)  | 28,600            | 224          | **224 (100%)**   | 896 (c2) / 14,336 (c8) | 34,800 → 964 (c2) | **full** — spatial duplication shares one Mesh resource across 100 copies                                             |

Duplex reference rows are from [`twin-optimizer-benchmark-2026-07-08.md`](twin-optimizer-benchmark-2026-07-08.md)
(not re-run here). The plant rows are this session, both `--chunks=auto`, `--min-instances=8`.

## Why the plant instances NOTHING — and scale makes it worse

The sourcing spike guessed the plant would be a strong instancing showcase because its 89 header
and branch pipe segments are **geometrically identical** (same `PIPE_SEG_LEN`, same radius). They
are — but the optimizer never sees them as identical, because the identity it groups on is the
**Godot `Mesh` resource**, not the geometry bytes:

- **The generator authors a fresh `IfcExtrudedAreaSolid` (its own `IfcShapeRepresentation`) per
  element** — grep the big IFC: **0** `IfcMappedItem` / `IfcRepresentationMap`, and **189**
  `IfcShapeRepresentation` — one per element, none shared.
- `ifc_convert.py` converts each element's geometry independently → the GLB carries **189 distinct
  glTF meshes** → `GLTFDocument` loads **189 distinct in-memory `Mesh` resources** (empty
  `resource_path`, unique `instance_id`).
- So the grouping pass builds **189 groups of exactly 1**. Nothing clears `--min-instances=8`
  (nothing even clears the floor of 2). `groups_instanced = 0`, `multimeshes = 0`, at every scale.
- **Turning `--tanks`/`--pumps` up makes it strictly worse:** more unique elements = more
  count-1 groups = more draw items, with no instancing to claw any of them back (18 → 189
  draw items, 0 → 0 instanced). The scale knob is a _marketing/visual-density_ knob, **not** an
  optimizer-win knob.

The Duplex is the instructive contrast on BOTH mechanisms that DO produce instancing:

1. **In-model geometry reuse.** The real Duplex shares geometry via mapped representations
   (**60** `IfcRepresentationMap` referenced by **167** `IfcMappedItem` in the file) so
   its repeated windows/doors/furniture reference **shared** representations → `ifc_convert.py`
   emits shared meshes → 286 mesh instances collapse to 224 distinct groups. A synthetic model
   would have to author `IfcRepresentationMap`s (or `ifc_convert.py` would have to dedup identical
   geometry post-hoc) to get this — `gen_plant_ifc.py` does neither today.
2. **Spatial duplication.** The city benchmark reaches 224/224 groups instanced only because it
   builds the scene with `Node.duplicate()` of ONE loaded tree — every one of the 100 copies
   **shares the same `Mesh` resource**. That is a scene-assembly artifact, not an IFC-conversion
   one, and the plant demo does no such duplication.

**Honest verdict:** the plant is a good _flavor/pitch_ asset and a fine _data-binding_ showcase
(literal pump/tank/valve tags), but it is **not** an optimizer/instancing showcase, and this
finding retires the spike's hypothesis that it would be. `--occluders`/`--vis-ranges` are also
no-ops of a different kind on it (few, large, well-separated meshes); the win for a real dense
plant would come from either (a) a converter geometry-dedup pass, or (b) authoring shared
representations in the generator — both are future work, neither is claimed here.

## The demo recording (`plant-shift.ndjson`)

One deterministic plant session, recorded in the seat scaffold via the fixture path (pure
synthesis, no sim/viewer/Godot needed — same seed+args ⇒ byte-identical file, which is the whole
point of the playback gate):

```bash
node tools/sim/record.js --out recordings/plant-shift.ndjson --seconds 60 --seed 42 --hz 10 \
  --map binding_map.json
# record: wrote recordings/plant-shift.ndjson — frames=4800 duration_ms=59900 tags=8
#         sha256=163e40f6c4333448061c80137c197139c22e55aef84eef001dd651c6b3b6e7b1
```

- **frames** 4800 (600 ticks × 8 tags), **duration** 59,900 ms, **tags** 8 (the plant binding
  map's pump temp/flow, motor rpm, 3× tank level, 2× valve position), **hz** 10, **seed** 42,
  **348,167 bytes**.
- **Determinism proven:** re-recording to a second path produced a **byte-identical** file
  (`diff` clean, same `sha256`). This is the established determinism check for the recording
  itself (fixture mode is pure); it mirrors the `house-day.ndjson` tutorial fixture.
- **Committed path:** in the SEAT, `twin-plant-validate/recordings/plant-shift.ndjson` — following
  the Duplex precedent, where recordings are **project content** (`house/recordings/house-day.ndjson`
  is committed in the seat scaffold), NOT vendored in `plugin-twin/examples/`. It feeds playback +
  the future analysis seam ([`2026-07-09-analysis-seam-plan.md`](../../../docs/handoff/2026-07-09-analysis-seam-plan.md))
  industrial data to chew on.

## Marketing shot-list note

> **HUMAN-PACED ITEM — shots to be taken and published by the human. Agents do NOT publish
> marketing material** (the plant plan's own ban). This list is a suggestion for the human; it is
> not an instruction to render, capture, or post anything.

Suggested shots that read as "industrial plant" from what the viewer already paints (no
beautification pass — geometry + data binding is the pitch):

1. **Aerial tank farm, painted by level.** The `--tanks 40` preset from high oblique: the tank
   row filling on the dark→green level ramp (`tank_*.level`), a wall of half-full vessels.
2. **Pump skid close-up, temperature ramp.** Street height on the pump row: `pump_1.temp`
   ramping blue→red on the feed-pump casing while `pump_2.flow` glows dark→cyan next to it.
3. **Valve labels, open/closed.** A branch with the inline `IfcValve` `Label3D`s showing
   position (green closed → red open) as a status readout floating on the geometry.
4. **Motor rpm on the circulation pump.** `motor_1.rpm` on P-103 sweeping idle→amber — the
   "drive is spinning up" beat.
5. **Playback scrub of `plant-shift.ndjson`.** The timeline bar scrubbing the recorded shift so
   the whole farm animates deterministically for a repeatable capture (no live sim on stage).

## Caveats

One machine (M3 Pro, Metal, macOS Darwin 25.5, Godot 4.6.3, ifcopenshell 0.8.5, pinned 3.12
venv). The instancing result is **structural, not machine-dependent** — it follows from
mesh-resource identity and the generator's per-element geometry, so it holds anywhere; the wall
times (convert 0.2 s / 189 shapes) are this machine's. `est_draw_items` is a scene-graph estimate,
not GPU draw-call truth (Forward+ auto-merges identical surfaces — see the optimizer benchmark's
"draw_calls far below objects" note); it is used here only to show before == after (the optimizer
changed nothing). No fps benching was run for the plant: with 0 instancing and ≤189 large meshes
there is nothing to differentiate, and the frame-budget gate already covers the vendored default.
