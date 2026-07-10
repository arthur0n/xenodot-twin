---
type: finding
title: "Benched --occluders recipe — scoped street/interior win on many-unique-mesh scenes, net-negative on single buildings, no-op instanced/aerial"
description: "The optimizer's --occluders pass, swept across 5 volume-gate configs on 3 real-shaped scenes: a real beyond-noise win ONLY on the many-unique-mesh city at street level (cpu 1.67 -> 1.52 ms, -0.15 ms / -9%; objects_rendered -55..-73%, draw_calls -48..-64%; visually lossless SSIM >=0.9999), NET-NEGATIVE at both vantages on a realistic single building (duplex +0.16..+0.25 ms cpu AND an interior over-cull artifact, in-room SSIM 0.983), a proven no-op on fully-instanced scenes (c2: 0 occluders at every gate) and from every aerial vantage (objects_rendered byte-identical). The shipped 10 m3 default gate is the measured sweet spot — smaller gates only add occluder count for no cpu payoff. --occluders stays OPT-IN with measured guidance. Requires use_occlusion_culling=true (twin template ships it ON). PRE-DECLARED RULE FLAW named: its 'win at BOTH vantages' bar is structurally unreachable by occlusion (aerial no-op) — verdict unaffected. One machine, M3 Pro/Metal, shadows off, fps display-capped this session (cpu_ms sole differentiator)."
timestamp: 2026-07-10T18:00:00+01:00
tags:
  [
    occluders,
    occlusion-culling,
    benchmark,
    optimizer,
    scoped-win,
    net-negative,
    metal,
    macos,
    noise-floor,
  ]
---

# Benched --occluders recipe — scoped street/interior win, net-negative single-building, no-op instanced/aerial

`optimize_scene.gd`'s `--occluders` pass shipped a reasoned-but-unbenched default gate
(`OCCLUDER_MIN_VOLUME_M3 = 10.0` — a leftover mesh needs > 10 m³ world-AABB volume to earn a box
occluder) and the twin-optimize skill already warned occlusion "can be net-negative" — nobody had
measured where. This is the measurement that turns that gate + warning into a recipe with numbers.
Outcome: **STAYS OPT-IN WITH MEASURED GUIDANCE** (one scene class wins; one is net-negative; two are
no-ops).

## Pre-declared decision rule (stated BEFORE measuring) — and its honest flaw

Rule (from the orchestration plan, unadjusted): `--occluders` earns a **default-on** recommendation
for a scene class **only if it wins ≥ 0.10 ms cpu_ms (≥ 3× the ~0.03 ms noise floor) at BOTH
vantages with zero visual artifacts**; otherwise it stays opt-in with measured guidance, and a
net-negative result is published as such.

**The rule's "BOTH vantages" bar turned out structurally unreachable for an occlusion feature** and
is named here as a mis-specification (verdict unaffected). Occlusion culling only helps when
occluders sit _between the camera and geometry_; from an aerial/overhead vantage almost nothing does,
so `objects_rendered` is byte-identical across every gate at aerial on every scene (measured below) —
there is no rendering-work difference for a cpu win to come from. A feature that is a geometric no-op
at one of the two required vantages can never satisfy "win at BOTH", so the rule (unadjusted) yields
**opt-in** for even the scene that wins cleanly at the vantage where occlusion _can_ work
(ucity/street). The flaw is recorded so the next measurement item words its rule
**per-vantage-class** rather than demanding a win at a vantage the feature cannot affect. The
decision (opt-in, with a scoped street/interior win published) is the same under either wording.

## Evidence provenance (SEAT-local — nothing there lands in the framework)

Seat commit **`6146794`**, `twindemo/twin-spikes/occluder-sweep/` — `bench_occluder_sweep.sh` driver,
6 raw bench arrays, 15 optimize reports, 40 screenshots, `NOTES.md` (per-config notes) and
`summary.json` (self-describing rows, each carrying its effective `occluder_min_volume` +
`occluders_added` + deltas vs OFF). Phase 1 (framework branch `feat/occluder-bench`, commit
`554b074`) parameterized the pass so a sweep needs no source edit; the sweep temp-overlaid that
branch version per project for the optimize stage and restored the materialized (main) version after
(no overlay left behind). Numbers below are cross-checked against `summary.json`.

## Machine / methodology (reused from twin-optimizer-benchmark-2026-07-08 + vis-range-sweep)

Apple M3 Pro, macOS, Metal / Forward+, Godot 4.6.3, 1280×720 window, vsync OFF, shadows OFF,
warmup 2 s / measure 8 s. City vantages byte-identical to the 2026-07-08 + vis-sweep runs
(street `139.5,1.7,135:139.5,1.7,0`, aerial `-65,260,-65:135,15,135`); duplex vantages AABB-derived
(street = walk the long Z axis at 1.7 m so interior partitions sit between camera and far rooms — the
live occluder cell; aerial = high oblique). Documented within-session noise floor: **~0.03 ms cpu**.
Metric order (plan): `cpu_ms` → sub-cap fps → `objects_rendered` delta → `draw_calls`.

**Machine caveat — fps WAS display-capped this session** (120.0 flat almost everywhere; only
ucity/aerial dipped to 116.8–119.9 under load), unlike the vis-sweep session. So **`cpu_ms` is the
sole differentiator** (per plan); fps carries no signal here except marginally at ucity/aerial.
`gpu_ms` reads 0.0 (unsupported on this Metal setup, as in prior runs).

**Occlusion-culling project setting (verified):** both bench/viewer projects ship with
`rendering/occlusion_culling/use_occlusion_culling = true`, committed at workspace init (`f41f93e`)
with an explicit comment. So the occluders `--occluders` adds ARE live at runtime — these numbers
reflect **real runtime occlusion**, not dead occluder nodes. **Hand-rolled-project caveat:** a
project with that setting OFF renders the emitted `OccluderInstance3D` nodes **inert** (no cull, only
their small setup cost) — the twin template ships the setting ON, but a hand-rolled viewer must set
it or `--occluders` does nothing.

## Scenes + configs

- **duplex** (`Duplex_A_20110907.glb` optimized at defaults) — 286 meshes, 3 groups instanced
  (30 inst), 256 leftover un-instanced meshes feed the occluder pass. The realistic single building.
- **ucity** (`city_before.scn` optimized `--min-instances=100000` so nothing instances) — 28,600
  meshes, all leftover: the many-unique-mesh stand-in where occlusion can actually show.
- **c2** (`city_before.scn` optimized `--chunks=2`) — normally instanced; the negative control.

The volume gate is a **floor**: a _lower_ `--occluder-min-volume=` lets _smaller_ meshes clear it, so
aggressive(2) adds the **most** occluders and double(20) the **fewest**. Configs: off (no flag),
default (10 m³ — the shipped default via bare `--occluders`), half (5), double (20), aggressive (2).

### occluders_added per scene / config (from the optimize reports)

| scene  | off | default (10) | half (5) | double (20) | aggressive (2) |
| ------ | --- | ------------ | -------- | ----------- | -------------- |
| duplex | 0   | 31           | 39       | 21          | 74             |
| ucity  | 0   | 3100         | 3900     | 2100        | 7400           |
| c2     | 0   | **0**        | **0**    | **0**       | **0**          |

**c2 adds 0 occluders at EVERY gate** — fully instanced, the instancing pass consumes every mesh and
the occluder pass only touches leftover un-instanced meshes. The 5 c2 configs produce byte-identical
scenes; benched OFF once as the representative (a data point, not a hopeful re-run). Matches the
2026-07-08 "occluders are a no-op on fully-instanced scenes" finding.

## Numbers — duplex/street (NET-NEGATIVE)

| config     | occ | cpu_ms | Δcpu      | objects | draws | verdict        |
| ---------- | --- | ------ | --------- | ------- | ----- | -------------- |
| off        | 0   | 0.70   | —         | 343     | 282   | baseline       |
| default    | 31  | 0.91   | **+0.21** | 105     | 101   | cpu REGRESSION |
| half       | 39  | 0.89   | +0.19     | 105     | 101   | cpu REGRESSION |
| double     | 21  | 0.86   | +0.16     | 269     | 234   | cpu REGRESSION |
| aggressive | 74  | 0.87   | +0.17     | 93      | 90    | cpu REGRESSION |

Occlusion culls objects hard (343 → 93–105) but cpu **regresses +0.16..+0.21 ms** (all well beyond
the 0.03 floor): on a 0.7 ms scene the box-occluder depth rasterization + cull test costs more than
the handful of draw submits it saves. Net-negative at every gate.

## Numbers — duplex/aerial (NET-NEGATIVE)

| config     | occ | cpu_ms | Δcpu      | objects | draws | verdict        |
| ---------- | --- | ------ | --------- | ------- | ----- | -------------- |
| off        | 0   | 0.61   | —         | 343     | 284   | baseline       |
| default    | 31  | 0.78   | +0.17     | 321     | 273   | cpu REGRESSION |
| half       | 39  | 0.81   | +0.20     | 317     | 271   | cpu REGRESSION |
| double     | 21  | 0.81   | +0.20     | 321     | 273   | cpu REGRESSION |
| aggressive | 74  | 0.86   | **+0.25** | 313     | 269   | cpu REGRESSION |

Aerial barely culls (343 → 313–321 — little sits behind anything from oblique above) and cpu
regresses **+0.17..+0.25 ms**. Net-negative.

## Numbers — ucity/street (REAL WIN)

| config     | occ  | cpu_ms | Δcpu      | objects | Δobj | draws | verdict        |
| ---------- | ---- | ------ | --------- | ------- | ---- | ----- | -------------- |
| off        | 0    | 1.67   | —         | 11829   | —    | 1828  | baseline       |
| default    | 3100 | 1.52   | **−0.15** | 3990    | −66% | 757   | cpu-win ≥ 0.10 |
| half       | 3900 | 1.52   | **−0.15** | 3650    | −69% | 714   | cpu-win ≥ 0.10 |
| double     | 2100 | 1.64   | −0.03     | 5326    | −55% | 950   | within noise   |
| aggressive | 7400 | 1.55   | −0.12     | 3169    | −73% | 655   | cpu-win ≥ 0.10 |

**Real, beyond-noise cpu win of −0.12..−0.15 ms (−9%)** at default / half / aggressive (double
under-covers at only −0.03, within noise); `objects_rendered` −55..−73%, `draw_calls` −48..−64%. Near
buildings occlude far ones down the street corridor — the live occluder cell. fps display-capped
(120), no fps signal. **Gate sweet spot: default (10 m³) ties half (5) for best cpu; aggressive (2)
adds 2.4× the occluders (7400 vs 3100) for no extra cpu benefit; double (20) leaves too much
uncovered.** No reason to lower the default.

## Numbers — ucity/aerial (NO-OP + measurement noise)

| config     | occ  | cpu_ms | Δcpu  | objects | Δobj  | draws | fps   |
| ---------- | ---- | ------ | ----- | ------- | ----- | ----- | ----- |
| off        | 0    | 5.45   | —     | 40500   | 0     | 5579  | 117.5 |
| default    | 3100 | 5.58   | +0.13 | 40500   | **0** | 5579  | 116.8 |
| half       | 3900 | 4.71   | −0.74 | 40500   | **0** | 5579  | 119.5 |
| double     | 2100 | 4.40   | −1.05 | 40500   | **0** | 5579  | 119.9 |
| aggressive | 7400 | 4.36   | −1.09 | 40500   | **0** | 5579  | 119.9 |

`objects_rendered` is **byte-identical (40500)** and `draw_calls` identical (5579) across ALL configs
→ occlusion culls **nothing** from aerial (nothing sits between an overhead camera and the block).
The large cpu_ms spread (4.36–5.58) is **NON-MONOTONIC in occluder count** (default = 3100 occ reads
WORST at +0.13; double = 2100 occ reads near-best at −1.05) — it is thermal/session drift on a heavy
5 ms scene, **NOT an occlusion win** (no rendering-work difference to produce one). The mechanical
"cpu-win" labels on the half/double/aggressive rows are blind to Δobj = 0 and must not be read as a
result. Confirms the plan's prediction: aerial is the geometric no-op / negative control.

## Numbers — c2/street + c2/aerial (PROVEN NO-OP)

| vantage | cpu_ms | objects | draws | note                                |
| ------- | ------ | ------- | ----- | ----------------------------------- |
| street  | 0.91   | 542     | 542   | 0 occluders (all configs identical) |
| aerial  | 0.96   | 1084    | 1084  | 0 occluders (all configs identical) |

Objects match the 2026-07-08 c2 numbers (542 / 1084) exactly. Fully-instanced scenes get 0
occluders — skip the flag.

## Perceptual / artifact pass (FRAME-REVIEWED, PENDING HUMAN CONFIRMATION)

Street near→mid→far series (p0/p1/p2) + one aerial frame (p3), OFF + every config, both scenes with
occluders (`shots/`). All 4 non-OFF configs are **pixel-identical to each other** at every position
(md5) — even aggressive (2) never over-culls relative to default (10); the only comparison that
matters is OFF vs any occluder config. SSIM (1.000000 = identical), **frame-reviewed, pending human
confirmation** (an agent judged the screenshot series, not live motion):

| position          | duplex       | ucity    | reading                               |
| ----------------- | ------------ | -------- | ------------------------------------- |
| p0 (street near)  | 1.000000     | 0.999967 | clean                                 |
| p1 (interior/mid) | **0.983231** | 0.999900 | duplex INTERIOR artifact; ucity clean |
| p2 (street far)   | 1.000000     | 0.999900 | clean                                 |
| p3 (aerial)       | 1.000000     | 1.000000 | no-op, identical                      |

- **ucity — CLEAN.** SSIM ≥ 0.99990 at every street position; the amplified diff is flat except one
  sub-pixel speck at the vanishing point — the 55–73% objects cut is all deep-corridor geometry
  genuinely hidden behind nearer buildings. No foreground holes. Visually lossless.
- **duplex — INTERIOR ARTIFACT at p1.** From the walkthrough corridor (p0) and far positions the
  frame is pixel-identical, but from **inside a room looking down the interior length (p1)** SSIM
  drops to **0.983** — the auto box-occluders (90% of the AABB of large leftover meshes, some of
  whose AABBs bracket the camera) over-cull genuinely-visible interior geometry. A visible change, not
  lossless. Compounds duplex's net-negative cpu: do not enable occluders on single-building interiors.
- c2 not shot (0 occluders — nothing to compare).

## Decision rule applied (pre-declared, unadjusted)

- **duplex** → cpu NET-NEGATIVE at both vantages (+0.16..+0.25 ms) **and** an interior over-cull
  artifact (SSIM 0.983). Fails hard. **Publish net-negative.**
- **ucity** → street: clean ≥ 0.10 win (−0.15 ms, SSIM ≥ 0.9999) ✓. aerial: **no occlusion effect**
  (Δobjects = 0; the cpu spread is noise, not a win). Fails the "BOTH vantages" bar (see the rule-flaw
  note — that bar is structurally unreachable). **Does NOT earn default-on → opt-in with
  street/interior-scoped guidance.**
- **c2 (instanced)** → 0 occluders, proven no-op. **Skip the flag.**

## Verdict — STAYS OPT-IN, and the recipe

No scene class earns default-on; `--occluders` **stays opt-in** in `twin-build` and the optimizer.
The shipped **10 m³ default gate is kept** (the measured sweet spot). Measured guidance:

- **Reach for `--occluders` on many-unique-mesh scenes viewed at street/interior level** — heavy
  heterogeneous clutter where near geometry occludes far. ucity/street: `objects_rendered` −55..−73%,
  `draw_calls` −48..−64%, `cpu 1.67 → 1.52 ms (−0.15 ms, −9%)`, visually lossless (SSIM ≥ 0.9999).
- **Keep the 10 m³ default.** It ties the 5 m³ gate for best cpu; 5 and 2 only add occluder count with
  no extra cpu payoff (aggressive adds 2.4× the occluders for the same win), and 20 under-covers. The
  sweep gives **no basis for changing the default**.
- **Skip it on single buildings** (duplex): net-negative cpu at **both** vantages (+0.16..+0.25 ms —
  the depth-raster + cull overhead exceeds the few submits saved on a sub-1 ms scene) **and** it
  over-culls visible interior geometry (in-room SSIM 0.983).
- **No-op on fully-instanced scenes** (c2: 0 occluders at every gate) **and from aerial vantages**
  (`objects_rendered` byte-identical — nothing sits between an overhead camera and the scene).
- **Requires `rendering/occlusion_culling/use_occlusion_culling = true`** — the twin template ships it
  ON; a hand-rolled project with it OFF renders the emitted occluder nodes inert.

## Caveats

- **One machine** (Apple M3 Pro, Metal / Forward+, macOS, Godot 4.6.3), one window size (1280×720),
  **shadows OFF** (a shadow pass would re-rank everything). Recipes generalize; the exact percentages
  are this machine's — re-measure on target hardware before promising a budget.
- **fps was display-capped this session** (120 Hz flat except a marginal ucity/aerial dip) — so
  **`cpu_ms` is the sole differentiator**; fps carries no signal here. Cross-session absolute cpu is
  not comparable; within-session off-vs-config deltas are the proof.
- The **ucity aerial cpu spread is non-monotonic session drift, not an occlusion result** — Δobjects
  is 0 at every gate. Do not read the mechanical "cpu-win" labels on those rows.
- The unique-city is a **synthetic stand-in** (uniqueness via a `--min-instances` threshold trick) —
  honest about mesh _count_ and cull behavior, but a real heterogeneous-plant scene should confirm.
- Perceptual verdicts are **frame-reviewed, pending human confirmation** — the duplex interior artifact
  in particular wants a live walk before the "do not enable on interiors" line is treated as final.

## Reproduce

From the seat (`twindemo/twin-spikes/occluder-sweep/`, commit `6146794`):
`bash bench_occluder_sweep.sh overlay|optimize|restore|bench|shots`, then `python3 merge.py`
regenerates `summary.json` + the delta tables. c2 bench collapses to OFF (all configs byte-identical,
0 occluders). SSIM: `ffmpeg -i off.png -i cfg.png -lavfi ssim -f null -`. Requires a display (bench
SKIPs headless).
