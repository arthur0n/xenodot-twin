---
type: finding
title: "Benched --vis-ranges recipe — scoped win on many-unique-mesh scenes, no-op on single buildings"
description: "The optimizer's --vis-ranges pass, swept across 6 configs on 3 real-shaped scenes: a large, well-beyond-noise win ONLY on many-unique-mesh scenes (unique-city aerial cpu 4.13 -> 2.81 ms at defaults, -32%; up to -71% coarser, fps 163 -> 530), essentially nothing on a realistic single building (duplex flat at street, <=0.04 ms aerial), and a proven no-op on fully-instanced scenes (vis_ranges_set==0). Defaults 0.5/2 -> 40/120 kept as-is: the perceptually-clean scoped winner; coarser/aggressive win more cpu but hard-pop at ~60 m and are NOT adopted without a fade margin. --vis-ranges stays opt-in. One machine, M3 Pro/Metal, shadows off, uncapped fps this session."
timestamp: 2026-07-09T20:00:00+01:00
tags:
  [vis-ranges, lod, visibility-range, benchmark, optimizer, scoped-win, metal, macos, noise-floor]
---

# Benched --vis-ranges recipe — scoped win on many-unique-mesh scenes, no-op on single buildings

`optimize_scene.gd`'s `--vis-ranges` pass shipped with four size-class defaults nobody had
benched (`VIS_SMALL_DIAGONAL_M / VIS_MEDIUM_DIAGONAL_M / VIS_SMALL_END_M / VIS_MEDIUM_END_M` =
0.5 / 2 m -> 40 / 120 m). This is the measurement that turns those defaults from folklore into a
recipe — or an honest negative. Outcome: **SCOPED WIN** (the plan's third outcome).

Evidence provenance (SEAT-local, nothing there lands in the framework): seat commit
**`a6c0707`**, `twindemo/twin-spikes/vis-range-sweep/` — `bench_vis_sweep.sh` driver, 6 raw
bench JSON, 14 optimize reports, 36 screenshots, and `summary.json` (**28 self-describing rows**,
each carrying its four effective `--vis-*` values + `vis_ranges_set`). Phase 1 (framework branch
`feat/vis-range-recipe`, commit `5853234`) parameterized the pass so a sweep needs no source
edit; the sweep temp-overlaid that branch version per project for the optimize stage and restored
the materialized version after. Per-config notes: `.../vis-range-sweep/NOTES.md`.

## Machine / methodology (reused from twin-optimizer-benchmark-2026-07-08 + CITY.md)

Apple M3 Pro, macOS, Metal / Forward+, Godot 4.6.3, 1280x720 window, vsync OFF, shadows OFF,
warmup 2 s / measure 8 s. City vantages byte-identical to the 2026-07-08 run
(street `139.5,1.7,135:139.5,1.7,0`, aerial `-65,260,-65:135,15,135`). Documented within-session
noise floor: **~0.03 ms cpu, ~0.5% fps**. Metric order (plan): `cpu_ms` (cap-immune) -> sub-cap
fps -> `objects_rendered` delta -> `primitives`.

**Session caveat — fps was NOT display-capped this run** (duplex 1500-1900 fps, city 160-1000
fps; the 120 Hz ProMotion cap never engaged, unlike the 2026-07-08 findings session). So both
`cpu_ms` and fps are honest differentiators here; `cpu_ms` still leads per the plan. This is a
different session from 2026-07-08 — within-session (off vs config) deltas are the proof;
cross-session absolute cpu drifts (see the c2 note).

## Scenes (each real-shaped; the pass only touches un-instanced meshes)

1. **duplex** — `Duplex_A_20110907.glb` optimized at defaults (real BIM single building, 286
   meshes; 3 groups instanced / 30 instances, **256 individual leftover MeshInstance3Ds** get the
   vis pass). Size classes at defaults: **0 small, 47 medium**; coarser (1.0/4.0 m): 150 ranges.
   The realistic single-building case. Vantages AABB-derived (a 9x11x27 m building cannot use the
   270 m city coords — deviation logged & accepted): street = walk the long axis at 1.7 m; aerial
   = high oblique ~81 m (default medium end 120 IN range, tight ends 60 OUT).
2. **ucity** (unique-mesh city) — `city_before.scn` optimized `--min-instances=100000` so
   **nothing instances** (`groups_instanced == 0` asserted; all **28,600 meshes stay individual**).
   The synthetic stand-in for heterogeneous many-unique-mesh scenes — HONEST label: real plants
   have unique fittings, here uniqueness is a `--min-instances` threshold trick. **0 small, 7700
   medium** at defaults; **18,000** ranges at coarser (1.0/4.0).
3. **c2** (negative control) — `city_before.scn` optimized `--chunks=2` (normal instancing).
   **`vis_ranges_set == 0` asserted for both off and default**: re-proves the no-op finding under
   the parameterized pass — the instancing pass consumes every repeated mesh, leaving nothing for
   the vis pass. Reduced to OFF + default per plan (sufficient to prove a no-op).

## Configs (optimize flags)

| config      | small/med diag (m)    | small/med end (m) |
| ----------- | --------------------- | ----------------- |
| off         | — (no `--vis-ranges`) | —                 |
| default     | 0.5 / 2.0             | 40 / 120          |
| dist_half   | 0.5 / 2.0             | 20 / 60           |
| dist_double | 0.5 / 2.0             | 80 / 240          |
| coarser     | 1.0 / 4.0             | 40 / 120          |
| aggressive  | 1.0 / 4.0             | 20 / 60           |

## Numbers — duplex (realistic single building)

Street (walk at 1.7 m): **flat — nothing culls.** All 47 medium meshes sit inside even the
tightest 60 m end; 0 small. `cpu_ms 0.16` and `objects 343` every config (aggressive 342). WITHIN
NOISE.

| config      | vantage | vis_set | cpu_ms | fps    | objects | primitives |
| ----------- | ------- | ------- | ------ | ------ | ------- | ---------- |
| off         | street  | 0       | 0.16   | 1590.9 | 343     | 27,740     |
| default     | street  | 47      | 0.16   | 1592.4 | 343     | 27,740     |
| dist_half   | street  | 47      | 0.16   | 1614.2 | 343     | 27,740     |
| dist_double | street  | 47      | 0.16   | 1601.3 | 343     | 27,740     |
| coarser     | street  | 150     | 0.16   | 1580.9 | 343     | 27,740     |
| aggressive  | street  | 150     | 0.16   | 1593.5 | 342     | 27,616     |

Aerial (~81 m): only the tight-end configs cull anything, and the whole scene is a 0.15 ms
baseline. `aggressive` drops objects 343 -> 135 (-61%), `cpu 0.15 -> 0.11` (**-0.04 ms — only
marginally beyond the 0.03 floor**), fps +21%. Real but trivially small.

| config      | vantage | vis_set | cpu_ms | fps    | objects | primitives |
| ----------- | ------- | ------- | ------ | ------ | ------- | ---------- |
| off         | aerial  | 0       | 0.15   | 1567.5 | 343     | 27,740     |
| default     | aerial  | 47      | 0.15   | 1603.4 | 343     | 27,740     |
| dist_half   | aerial  | 47      | 0.14   | 1667.2 | 282     | 19,728     |
| dist_double | aerial  | 47      | 0.15   | 1575.2 | 343     | 27,740     |
| coarser     | aerial  | 150     | 0.16   | 1565.1 | 341     | 27,492     |
| aggressive  | aerial  | 150     | 0.11   | 1903.9 | 135     | 12,640     |

**Duplex verdict: skip the flag.** On a realistic single building `--vis-ranges` buys essentially
nothing.

## Numbers — ucity (28,600 unique meshes — the scale case)

Street: **REAL, scales with aggressiveness.** default `cpu 0.99 -> 0.90` (-9%); aggressive
`0.99 -> 0.54` (**-45%, -0.45 ms, far beyond noise**), objects 11,829 -> 4,854, fps +72%.
`dist_double` (end 240) is a no-op / slightly worse at street — it culls nothing there and adds
overhead.

| config      | vantage | vis_set | cpu_ms | fps    | objects | primitives |
| ----------- | ------- | ------- | ------ | ------ | ------- | ---------- |
| off         | street  | 0       | 0.99   | 597.6  | 11,829  | 805,674    |
| default     | street  | 7,700   | 0.90   | 664.9  | 10,014  | 639,354    |
| dist_half   | street  | 7,700   | 0.81   | 745.8  | 8,523   | 510,662    |
| dist_double | street  | 7,700   | 1.05   | 564.5  | 11,829  | 805,674    |
| coarser     | street  | 18,000  | 0.75   | 774.5  | 7,944   | 538,422    |
| aggressive  | street  | 18,000  | 0.54   | 1026.9 | 4,854   | 331,194    |

Aerial (~374 m): **DECISIVE.** default/dist_half/dist_double all `cpu 4.13 -> ~2.82` (**-32%,
-1.3 ms** — everything past even the 240 end culls, so all three classify the same 7,700 meshes);
coarser/aggressive `cpu 4.13 -> ~1.20` (**-71%, -2.9 ms**), objects 40,500 -> 12,700, **fps
163 -> 530 (+225%)**.

| config      | vantage | vis_set | cpu_ms | fps   | objects | primitives |
| ----------- | ------- | ------- | ------ | ----- | ------- | ---------- |
| off         | aerial  | 0       | 4.13   | 163.3 | 40,500  | 2,774,000  |
| default     | aerial  | 7,700   | 2.81   | 243.1 | 27,400  | 1,584,000  |
| dist_half   | aerial  | 7,700   | 2.82   | 242.3 | 27,400  | 1,584,000  |
| dist_double | aerial  | 7,700   | 2.84   | 241.2 | 27,400  | 1,584,000  |
| coarser     | aerial  | 18,000  | 1.19   | 534.4 | 12,700  | 875,200    |
| aggressive  | aerial  | 18,000  | 1.20   | 530.1 | 12,700  | 875,200    |

## Numbers — c2 (negative control, fully instanced)

`vis_ranges_set == 0` for both rows; off vs default at/within the noise floor; objects
byte-identical (542 / 1,084). Proven no-op. (Objects match the 2026-07-08 c2 exactly, 542/1,084;
cpu reads lower this session because the run was uncapped — cross-session cpu drift, the
within-session off-vs-default equality is the real proof.)

| config  | vantage | vis_set | cpu_ms | fps   | objects |
| ------- | ------- | ------- | ------ | ----- | ------- |
| off     | street  | 0       | 0.28   | 741.4 | 542     |
| default | street  | 0       | 0.29   | 744.1 | 542     |
| off     | aerial  | 0       | 0.49   | 451.5 | 1,084   |
| default | aerial  | 0       | 0.52   | 454.0 | 1,084   |

## Perceptual pass (FRAME-REVIEWED, PENDING HUMAN FLY-THROUGH)

Street near->far screenshot series, OFF + every config, both scenes (`shots/`). The pass sets
`visibility_range_end` only — **no fade, a hard pop at the cutoff.** These verdicts are
frame-reviewed from the screenshot series; a live human fly-through has not yet confirmed them.

- **duplex — all configs:** pixel-identical to OFF at every street position (nothing culls). No
  popping possible. CLEAN.
- **ucity/default + dist_double:** indistinguishable from OFF at street — far-corridor detail
  persists to the vanishing point. CLEAN.
- **ucity/dist_half + coarser:** mild thinning of the deepest far-corridor small fixtures;
  near/mid field intact. Acceptable.
- **ucity/aggressive:** visibly thins distant small fixtures (windows, green roof caps) in the
  far-mid corridor; near/mid field fully intact. In a live walk-through these would **hard-pop in
  at the ~60 m boundary.** Borderline — a fade margin would remove the pop if this cutoff is ever
  adopted.

## Verdict — SCOPED WIN, and the recipe

`--vis-ranges` delivers a large, well-beyond-noise win **only on many-unique-mesh scenes** (the
unique-city: -32% to -71% cpu / +225% fps at aerial, -9% to -45% cpu at street, scaling with mesh
count and aggressiveness). On a realistic **single building it buys essentially nothing** (duplex
flat at street; <=0.04 ms at aerial only with the most aggressive cutoff on a 0.15 ms scene), and
it is a **proven no-op on fully-instanced repeated-geometry scenes** (negative control,
`vis_ranges_set == 0`, within noise).

- **Reach for `--vis-ranges` on:** many-unique-mesh scenes — heavy heterogeneous clutter, the
  plant-fitting / heterogeneous-planting regime, or a single building's un-instanced leftovers
  when there are _thousands_ of them. The win scales with the count of small/medium unique meshes.
- **Skip it on:** single buildings / small unique-mesh counts (nothing culls at walkthrough
  distance — the duplex is flat), and fully-instanced repeated-geometry scenes (the instancing
  pass already consumed everything; the vis pass sets 0 ranges).
- **Recommended cutoff: the defaults (0.5/2 -> 40/120).** They are perceptually clean (CLEAN at
  street, frame-reviewed) AND already capture the big city-scale win (aerial -32%). The sweep
  showed **no basis for changing the four values** — distances are kept ABSOLUTE (the best
  cutoffs did not track scene bounds between the duplex and the city; the city wins came from the
  same absolute values that no-op'd on the duplex), so no scene-relative derivation.
- **`coarser` / `aggressive` are NOT adopted.** They win more cpu (-71% aerial) but introduce a
  visible far-field hard-pop at ~60 m. Adopt only with a fade margin
  (`visibility_range_fade_mode` / a `visibility_range_begin` margin) — and that is future work,
  **measured before adoption, not assumed** (the plan's rule; out of scope here).

Because the win is not unambiguous on BOTH real-shaped scenes (flat on the duplex), `--vis-ranges`
**stays opt-in** in `twin-build` and the optimizer — the plan's explicit bar.

## Caveats

- **One machine** (Apple M3 Pro, Metal / Forward+, macOS, Godot 4.6.3), one window size
  (1280x720), **shadows OFF** (a shadow pass would re-rank everything), no occluders in any
  measured scene. Recipes generalize; the exact percentages are this machine's — re-measure on
  target hardware before promising a budget.
- **fps was uncapped this session** (the 120 Hz ProMotion cap never engaged); the 2026-07-08
  findings session was cap-pinned. Cross-session absolute cpu is not comparable; within-session
  off-vs-config deltas are.
- **0 small-class meshes fired in either scene at default thresholds** — the small class (< 0.5 m
  diagonal -> 40 m end) is UNTESTED by this sweep; only the medium class fired at defaults, and
  the small class only participated once the coarser 1.0/4.0 diag reclassified meshes into it.
  A scene with genuinely sub-0.5 m clutter (dense fittings/bolts/small sensors) would exercise the
  40 m end and should be re-benched before relying on the small-class number.
- The unique-city is a **synthetic stand-in** (uniqueness via `--min-instances` threshold trick,
  not genuinely distinct geometry) — it is honest about mesh _count_ and cull behavior, but a real
  heterogeneous-plant scene should confirm the numbers.
- Perceptual verdicts are **frame-reviewed** — closed 2026-07-11 without a formal fly-through:
  the human accepted the current visuals as fine for now. The hard-pop assessment for
  `aggressive` still wants a live walk before that cutoff is ever adopted; re-open if popping
  bothers real use.

## Reproduce

From the seat (`twindemo/twin-spikes/vis-range-sweep/`, commit `a6c0707`):
`bash bench_vis_sweep.sh optimize|restore|bench|shots`, then `python3 merge.py` regenerates
`summary.json` + the delta tables. Requires a display (bench SKIPs headless).
