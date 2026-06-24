---
name: godot-greybox
agents: [game-designer, level-designer]
description: Spatial-craft layer for arena blockouts in a Godot 4.6 FPS — turn a level-designer concept brief into a measurable, non-flat combat space by authoring an ArenaLayout .tres (footprint, cover pieces with class, verticality, lanes, landmarks, reusing existing SpawnMarker3D + FallZone), instantiating it with one builder node, and running a headless layout self-audit that reports the spatial metrics. Use when an arena ships as a "flat empty oversized perimeter-walled square", when a blockout has no interior cover / no verticality / one big region, when cover sits off the navmesh, when adding/reshaping a combat arena, or when "greybox", "blockout", "arena layout", "level feels empty", "add cover", "spatial pacing" appears. NOT the concept interview (that is level-designer) and NOT GridMap tile-fill (godot-gridmap-level) — this is the cover/sightline/verticality craft + its self-audit. Emits DATA the builder reads; runs the audit headless via the godot-runtime-smoke harness.
---

# godot-greybox — measurable arena blockout craft

A combat arena is a SYSTEM authored as DATA, not hand-placed boxes. The "flat empty square" failure is the absence of five measurable properties — interior cover, layered sightlines, bounded verticality, ≥3 nameable regions, and a spawn-to-engagement path that is neither too long nor fully exposed. Author the space as an `ArenaLayout` Resource, instantiate it with one builder node, and prove the properties with a headless audit that REPORTS metrics (and diffs against a known-good baseline) before any number is a hard gate. All numeric caps are unverified — calibrate on a good + a bad variant before failing a build on them.

## Requirements

- `godot-code-rules` (strict typed GDScript) — applied before any .gd.
- `godot-composition` — the builder is a component node under the level root; signals up / calls down.
- `godot-runtime-smoke` — the audit is a headless SceneTree tool wired as a validate.sh step; reuse its pattern.
- `godot-main-scene` — levels load under Main/LevelHost; the arena builder lives inside a level scene.
- `godot-verify` — Transform3D ban: the builder emits `position` + `rotation.y` only, never a Transform3D literal.
- level-designer has produced a concept brief (design/levels/<name>.md) with experience-goal + pacing beats. This skill consumes that brief; it does NOT run the concept interview.

## Project conventions (DiceOfFate)

- 1 Godot unit = 1 metre (CONFIRMED: blast_court floor 0.2 thick, walls h=4, player capsule ~1.8). P8 metrics-zoo dims apply as-is.
- Arena lives in a level scene under `levels/<name>.tscn`; builder + data in `entities/arena/`.
- Reuse, do NOT fork existing systems:
  - Navmesh: one NavigationRegion3D in group `nav_region` (NavFloor in blast_court). Map RID via `get_navigation_map()`.
  - Spawns: `SpawnMarker*` Marker3D children, wired to WaveManager `spawn_marker_paths`. The audit's spawn-to-engagement uses the REAL markers + CenterWP, not an abstract centre.
  - Fall hazard: existing FallZone Area3D `collision_mask=2` + dwell-trap tiles (`levels/blast_court.gd`). `fall_zones` is DATA the builder instantiates into that pattern; no new runtime system.
- The audit mirrors WaveManager's seams exactly so it sees the SAME geometry: LOS via `PhysicsDirectSpaceState3D.intersect_ray` with `collision_mask = 1` (walls), `EYE_HEIGHT = 1.0`; nav via `NavigationServer3D.map_get_closest_point` / `map_get_path`.
- node names PascalCase; files snake_case.

## The nine checkable principles (author + self-audit)

- P1 TOPOLOGY = LOOP. Every cover node has ≥2 escape routes; no degree-1 walkable node. Three-lane or figure-8. _Biggest lever vs empty square._ CHECK: map_get_path between region pairs yields ≥2 non-overlapping routes; connectivity graph has ~0 degree-1 leaves.
- P2 INTERIOR FOOTHOLD. Each sub-region has ≥1 cover piece NOT touching a perimeter wall. CHECK: per-region count of pieces whose AABB clears the perimeter band.
- P3 PARTITIONED SIGHTLINES. No standing point sees the whole arena. CHECK: longest unobstructed sightline < cap (CALIBRATE); %-walkable-visible-from-worst-point < cap (CALIBRATE).
- P4 COVER COMPOSITION. Mix half (crouch/step-out) vs full (blocks LOS); hard vs soft. CHECK: class counts; no single class > ~70% (CALIBRATE).
- P5 VERTICALITY = RESTRAINT. Present but bounded. CHECK: max-min floor_y > 0 AND #levels in 2–3 (CALIBRATE). (blast_court = 0 → fail.)
- P6 LANDMARKS. ≥3 nameable sub-regions, each unique height/shape/greybox colour. CHECK: ≥3 regions with distinct massing.
- P7 SPAWN-TO-ENGAGEMENT. CHECK: map_get_path SpawnMarker→CenterWP (or nearest cover) length / run-speed in band (arena-survival 3–8 s, CALIBRATE); route passes ≥1 cover (not fully exposed).
- P8 SCALE / DENSITY. wall 150–200% figure; halls ≥2.0 m; doorways ≥1.25×2.5; stairs 30–35°. CHECK: footprint m² / active_cap within density band (CALIBRATE; blast_court=115 m²/enemy, target 25–40).
- P9 CHOKE vs OPEN. Alternate open spaces with commitment chokes. CHECK: open-floor:choke-floor ratio in band (CALIBRATE, low priority v1).

## ArenaLayout schema (DATA)

- `ArenaLayout extends Resource`: `footprint_m: Vector2`, `floor_y: float`, `perimeter_walls: bool`, `pieces: Array[ArenaPiece]`, `spawn_markers: Array[Vector3]`, `fall_zones: Array[AABB]`, `lanes: Array[LaneDef]`, `landmarks: Array[LandmarkDef]`.
- `ArenaPiece extends Resource`: `type: int` (enum BOX_FULL_COVER / BOX_HALF_COVER / RAMP / PLATFORM / DROPDOWN / WALL_PARTITION / SOFT_COVER), `pos: Vector3`, `rot_y: float`, `size: Vector3`, `cover_class: int` (HALF/FULL × HARD/SOFT), `lane_id: int`.
  Iterate the layout = edit the .tres. New cover behaviour = new piece type, no call-site change.

## Steps

1. Read the level-designer brief: experience-goal, pacing beats, footprint intent. If footprint × active_cap is outside the density band, shrink footprint FIRST (oversized is the #1 cause of "empty").
2. Author / edit `levels/<name>_layout.tres` (an ArenaLayout). Place interior cover (P2) per region, mix cover classes (P4), set 2–3 floor levels via PLATFORM/RAMP/DROPDOWN (P5), define ≥3 landmark regions (P6), set lanes for a loop topology (P1). Emit `position` + `rot_y` only.
3. Wire `spawn_markers` + `fall_zones` to reuse the existing SpawnMarker3D / FallZone pattern — do not invent a new hazard or spawn system.
4. Let the ArenaBuilder node instantiate the layout (BoxMesh StaticBody3D per piece, SpawnMarker3D, FallZone + dwell tiles, bake NavigationRegion3D in group nav_region).
5. Run the headless layout audit (`$GODOT --headless --script tools/audit_layout.gd -- <level.tscn>`). It REPORTS the metric set + diff vs baseline. Read violations; iterate the .tres. Do NOT gate the build on a number until it is calibrated.
6. Pre-handoff self-audit (below) must be green-by-judgement before handing to godot-dev / verify.

## Pre-handoff self-audit checklist

- [ ] topology is a graph (loop / multiple routes), no dead-ends (P1)
- [ ] each region has ≥1 interior foothold (P2)
- [ ] cover-class mix, no single class > ~70% (P4)
- [ ] sightline coverage bounded — no point sees the whole arena (P3)
- [ ] ≥3 nameable landmark regions (P6)
- [ ] spawn-to-engagement in band AND route passes cover (P7)
- [ ] verticality present but bounded (2–3 levels) (P5)
- [ ] every cover piece sits ON the navmesh (closest-point dist < eps)
- [ ] footprint/active_cap within density band (P8)
- [ ] no raw Transform3D in the built scene (godot-verify)

## Failure-mode catalogue (led by the real complaint)

"flat empty oversized perimeter-walled square" decomposes to:

- empty centre → P2 (no interior foothold)
- oversized → P7/P8 (density m²/enemy too high — shrink footprint)
- flat → P5 (verticality 0 — add 2–3 floor levels)
- perimeter-only walls/cover → P3 + P6 (no internal massing, 1 region)
- cover-off-arena → metric: cover AABB nearest-navmesh-point dist > eps

## Metric set → Godot API

| Metric                          | API                                                                      |
| ------------------------------- | ------------------------------------------------------------------------ |
| footprint m², per-enemy density | floor AABB area / active_cap                                             |
| cover count + class breakdown   | iterate ArenaLayout.pieces                                               |
| cover-off-navmesh               | NavigationServer3D.map_get_closest_point — dist > eps → flag             |
| %walkable / routes / dead-ends  | navmesh poly area; NavigationServer3D.map_get_path                       |
| spawn-to-engagement             | map_get_path SpawnMarker→CenterWP / run speed                            |
| longest sightline / coverage %  | PhysicsDirectSpaceState3D.intersect_ray, mask=1, eye=1.0, grid of points |
| verticality                     | max-min floor_y, #distinct levels                                        |

## Error → Fix

| Symptom                                  | Fix                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Arena reads empty in centre              | add interior-foothold cover per region (P2); shrink footprint if density > band  |
| Players camp the wall / no flow          | author loop topology + interior cover that pulls inward (P1/P2)                  |
| Whole arena visible from spawn           | add WALL_PARTITION internal massing (P3)                                         |
| Cover floats / enemies path under it     | cover AABB off navmesh — re-place on nav, re-bake nav_region                     |
| Build fails godot-verify Transform3D ban | builder/.tres emit position+rot_y, never Transform3D literal                     |
| Audit flips red on a fresh number        | caps are INFERRED — run REPORT mode, calibrate on good+bad variant before gating |
| Spawn-to-engagement too long/too exposed | move markers / add cover along route; shrink footprint (P7)                      |

## Parked (available later, not v1)

- Graph-grammar topology-seed (three-lane / figure-8) emitting ArenaLayout + constraints → checker-gated. Best AI fit. NOT WFC (weak for continuous combat cover) and NOT BSP (corridor/maze, anti-arena).
- Hard pass/fail gating of metrics — only after calibration on Blast Court + 1 good + 1 bad.

Adapted from The Level Design Book (book.leveldesignbook.com, Yoder/Yang) + Robert Yoder blog + GDC talks (FMPONE CS:GO 2015, Steve Lee Holistic LD 2017, Griesemer Sniper 2010, Worch Prioritization 2014, Burgess & Purkeypile Fallout 4 Modular 2016). Reference material, no code copied.
