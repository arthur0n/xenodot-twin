# Implementation plan — benched LOD/visibility-range recipe

Roadmap Must-Have #4 (see `2026-07-09-roadmap-handoff.md`). Plan only. This is a
MEASUREMENT item, not a feature item: `--vis-ranges` ships defaults nobody benched, and
the product's promise is that every number is gate-backed. Sibling plans: MQTT adapter,
twin-build, de-game personas (all independent; twin-build deliberately does NOT default
`--vis-ranges` on — it waits for this item).

## What exists (verified)

- **The pass** (`plugin-twin/tools/optimize_scene.gd::_vis_range_pass`): two size
  classes by transformed-AABB diagonal — `< 0.5 m` → `visibility_range_end = 40`,
  `< 2 m` → `120`, larger untouched. Sets `visibility_range_end` ONLY: no
  `visibility_range_begin`, no fade margin, no fade mode — a hard pop at the cutoff.
  Constants `VIS_SMALL_DIAGONAL_M / VIS_MEDIUM_DIAGONAL_M / VIS_SMALL_END_M /
VIS_MEDIUM_END_M` are documented but explicitly unmeasured.
- **The harness** (`plugin-twin/tools/bench_scene.gd`): windowed-only (headless SKIPs),
  frames-drawn fps + `cpu_ms` (render-thread submit) + `objects_rendered` +
  `draw_calls`, `--vantage`, `--out` JSON append. The 2026-07-08 findings file
  (`plugin-twin/library/findings/twin-optimizer-benchmark-2026-07-08.md`) established
  the methodology: fps saturates at the 120 Hz macOS presentation cap, `cpu_ms` is the
  sub-cap differentiator, ~0.5% fps / ~0.03 ms cpu run-to-run noise floor.
- **The killer prior finding**: `--vis-ranges` added **0** ranges on the instanced city
  — the pass only touches meshes left UN-instanced. On repeated-geometry scenes the
  instancing pass consumes everything. So the recipe's domain is mostly-unique
  geometry (a single building's leftovers; heterogeneous plants) — and the bench
  scenes must be built accordingly or the sweep measures nothing.
- **Scene generator**: `gen_city.gd` survives in the twin seat
  (`twindemo/house-twin/scripts/gen_city.gd`), not in the framework — the sweep runs
  from the seat, per the workspace model.

## Blocker to remove first: the distances are consts, the sweep needs knobs

`_vis_range_pass` reads four `const`s — a sweep would need one framework edit per
config. Phase 1 makes the pass parameterizable:

- New optional args on `optimize_scene.gd`: `--vis-small-diag=`, `--vis-medium-diag=`,
  `--vis-small-end=`, `--vis-medium-end=` — defaults are the existing constants, so
  no-arg behavior is byte-identical (same rule as the verify_twin.sh change in the
  twin-build plan).
- The report JSON records the four effective values plus `vis_ranges_set` (already
  reported), so every benched scene is self-describing — no "which config was this
  file" archaeology.

This is also the shape the eventual recipe needs if it lands as scene-relative
derivation (see outcomes).

## The experiment (bounded matrix, scripted, one windowed session)

**Scenes (3):**

1. **Bare duplex, optimized** — the realistic single-building case: instancing eats the
   repeats, `--vis-ranges` applies to the unique leftovers.
2. **Unique-mesh city** — the scale case: `gen_city.gd` grid, then optimize with
   `--min-instances` above every group size so NOTHING instances and all ~28k meshes
   stay individual `MeshInstance3D`s. Honest label: synthetic stand-in for
   heterogeneous plants (real plants have unique fittings; our duplicates are unique
   only by threshold trick — say so in the findings).
3. **Instanced city (c2), negative control** — assert `vis_ranges_set == 0` and
   fps/cpu_ms within noise of the prior run. Re-proves the no-op finding under the
   parameterized pass.

**Vantages (2):** street (1.7 m, inside — small meshes both near and far) and high
aerial oblique (everything beyond the small cutoff) — same coordinates as the
2026-07-08 run for comparability.

**Configs (6 per scene/vantage):** OFF baseline; current defaults (0.5/2 → 40/120);
distance ×0.5 (→ 20/60); distance ×2 (→ 80/240); coarser classes (1.0/4.0 → 40/120);
aggressive-everything (1.0/4.0 → 20/60). ~30 measured runs × ~12 s measure+warmup —
one scripted session via a seat-local driver (`bench_vis_sweep.sh`, scratch script in
the seat project, NOT framework; raw JSON kept as evidence).

**Metrics, in decision order:** `cpu_ms` (cap-immune), fps only when below cap,
`objects_rendered` delta (proves the culling did anything), `primitives`. Plus a
**perceptual pass**: fly the street vantage manually per config and note popping —
`visibility_range_end` with no fade HARD-POPS geometry; a recipe that wins 0.3 ms by
making doors vanish mid-walkthrough fails the demo, and no counter measures that.

## Outcomes the plan commits to (all three are shippable)

- **Win found** → re-tune the four constants with measured provenance (constants table
  for review, what AND why per the quality bar), decide absolute vs SCENE-RELATIVE
  (if the best cutoffs track scene bounds between duplex and city, derive distances
  from the scene AABB like chunking's AUTO grid; if they don't, keep absolute). If
  popping is objectionable at winning distances, evaluate adding
  `visibility_range_fade_mode` (or a begin-margin) to the pass as part of the recipe
  — measured again before adoption, not assumed.
- **No measurable win on target scenes** → NEGATIVE RESULT, publish it: findings file
  states `--vis-ranges` buys nothing on building-scale twins on this class of machine,
  the skill/docs demote the flag to "measured: no effect on tested scenes; may matter
  on <condition>", constants stay but their doc comment cites the finding. Roadmap
  item still closes — "benched" was the promise, not "faster".
- **Win only on the synthetic unique-city** → report both honestly; recipe ships
  scoped to "many-unique-mesh scenes", duplex-scale guidance says skip the flag.

Whatever the outcome, `--vis-ranges` stays opt-in in twin-build unless the win is
unambiguous across both real-shaped scenes AND the perceptual pass is clean.

## Phasing

1. **Parameterize the pass** (framework): four `--vis-*` args defaulting to the
   constants, report records effective values; full gate green; no-arg optimize output
   byte-identical (diff a before/after report on the duplex).
2. **Sweep** (seat, human-visible display required — bench is windowed-only):
   `bench_vis_sweep.sh` over the matrix; raw JSON + notes committed to the seat repo;
   negative control asserted; perceptual notes per config.
3. **Recipe + docs** (framework): constants/derivation updated per outcome with
   measured rationale; findings file
   `plugin-twin/library/findings/twin-vis-range-recipe-<date>.md` (numbers + caveats:
   one machine, M3 Pro/Metal, shadows off, 120 Hz cap, window size); `twin-optimize`
   SKILL.md gets the recipe section (mirroring how chunking's measured guidance is
   written); `CAPABILITIES-twin.md` + optimize_scene.gd header updated; roadmap tick.
   SEAMS: no new files shared with upstream (all twin-plugin-owned) — no new seam rows,
   protect-list already covers `plugin-twin/`.

## Acceptance criteria

1. No-arg `optimize_scene.gd` output byte-identical pre/post parameterization; gate
   green.
2. Raw sweep JSON committed (seat) with every row self-describing its four values.
3. Negative control: instanced-c2 scene reports `vis_ranges_set == 0`, metrics within
   the documented noise floor of the 2026-07-08 run.
4. Findings file exists with numbers + machine caveats + perceptual verdict; every
   VIS\_\* constant (or its replacement derivation) cites it.
5. twin-optimize skill carries the recipe (or the honest negative), consistent with
   the findings file — no undocumented defaults anywhere in the pass.
6. Roadmap tick names the outcome type (win / negative / scoped).

## Out of scope (named)

- HLOD/mesh simplification, imposters, or any geometry LOD authoring — different
  feature, not this pass.
- Occluder recipe (`--occluders` has the same unmeasured-defaults smell — its
  OCCLUDER_MIN_VOLUME_M3 is reasoned-but-unbenched) — same methodology applies, run it
  as a follow-up item once this one proves the sweep harness; noted for the roadmap,
  not folded in.
- Shadow-on re-ranking (prior caveat stands; shadows would re-rank everything — a
  future bench dimension, not this item).
- Weaker-GPU validation (recipes generalize, exact numbers don't; the findings caveat
  carries this).
