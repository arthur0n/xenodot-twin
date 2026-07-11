---
type: finding
title: "Benched --vis-fade-margin — the aggressive vis-range tier becomes adoptable with margin 5 (self), 97% of its cpu win kept; margin 12 pop-optimal but fails the 80% bar; Forward+ only"
description: "The fade band added to optimize_scene.gd's --vis-ranges pass (--vis-fade-margin / --vis-fade-mode), swept over the many-unique-mesh city at the decisive street vantage against a pre-declared per-vantage rule (adopt into the aggressive tier iff it softens the ~60 m hard-pop AND retains >=80% of the config's cpu win vs OFF): aggressive + margin 5 self RETAINS 97% median / 96% min of the win (fade cost +0.025 ms, at/below the 0.03 ms noise floor = effectively free; +162 objects / +3.3%, +397 draws) and replaces the hard appearance with an alpha ramp -> ADOPTABLE, pending a human fly-through. Margin 12 removes the pop most thoroughly but eats ~1/3 of the win (69% median / 81% min retention, +0.235 ms) -> BORDERLINE-FAIL the bar. The coarser tier FAILS retention at both margins (65% / 39%) -- its wider 40/120 m cull radius drops far more geometry into the band. Aerial fade is FREE (from 374 m the whole scene is past end+margin, band empty, 12700 objects identical). RENDERER CAVEAT (headline): the fade renders under Forward+ ONLY -- the Compatibility renderer the WEB EXPORT uses treats it as DISABLED and the pop returns there. Cost mechanism quantified: objects_rendered/draw_calls RISE with margin (the band renders the crossing objects with alpha). One machine, M3 Pro/Metal, shadows off, 120 Hz display-capped this session (street cpu taken from interleaved-repeat medians to cancel thermal drift; objects/draws deterministic)."
timestamp: 2026-07-10T21:00:00+01:00
tags:
  [
    vis-ranges,
    visibility-range,
    fade,
    visibility-range-fade-mode,
    lod,
    benchmark,
    optimizer,
    forward-plus,
    metal,
    macos,
    noise-floor,
  ]
---

# Benched --vis-fade-margin — the aggressive vis tier becomes adoptable with margin 5 (self), Forward+ only

The `--vis-ranges` recipe (`twin-vis-range-recipe-2026-07-09.md`) shipped a scoped win at the
perceptually-clean defaults but left the **`coarser` / `aggressive` size classes unadopted**: they
win far more cpu (up to −71% aerial) yet set `visibility_range_end` with **no fade**, so distant
small fixtures **hard-pop in at ~60 m** on a live approach. Adoption was blocked, per the standing
rule, on a **measured** fade-margin evaluation. Phase 1 added the fade knobs
(`--vis-fade-margin=<m>` / `--vis-fade-mode=self|deps`) on `feat/vis-fade-margin`
(`ed99442` split the vis pass into `TwinVisRange`; `4552f22` added the knobs). This is that
measurement. Outcome: **the aggressive tier is ADOPTABLE with `--vis-fade-margin=5
--vis-fade-mode=self`** (recommended-with-caveat, pending the human fly-through) — margin 12 is the
pop-optimal fallback but misses the retention bar; the coarser tier stays unadopted; aerial is free;
and the whole result is **Forward+ only**.

## Pre-declared decision rule (stated BEFORE measuring — worded per-vantage-class)

From the orchestration plan, unadjusted: a fade configuration earns adoption into the vis-range
recipe's **aggressive tier** iff, on the many-unique-mesh scene at the **STREET** vantage (the
class+vantage where `coarser`/`aggressive` win), it **(a)** eliminates the visible hard-pop in the
frame-series proxy (no abrupt full-object appearance between consecutive frames along the approach)
**AND (b)** retains **≥ 80%** of that config's measured cpu win vs OFF (fade renders transitioning
objects with alpha — it has real cost; if fade eats the win, the honest outcome is "aggressive tier
stays unadopted, hard-pop is why, fade cost is why"). Aerial cells are context only. All outcomes
shippable. The default tier (0.5/2 → 40/120) was never in question — it is perceptually clean
without fade and nothing changes for it.

## Evidence provenance (SEAT-local — nothing there lands in the framework)

Seat commit **`8118350`**, `twindemo/twin-spikes/fade-sweep/` — `bench_fade_sweep.sh` driver,
7 optimize reports, single-pass + **interleaved-repeat** bench JSON, a 3×32-frame street-approach
pop series + matched-position diffs, `NOTES.md` (per-config notes) and `summary.json` (self-describing
rows, each carrying its `vis_fade_margin` / `vis_fade_mode` + retention math). Numbers below are
cross-checked against `summary.json` and `pop_metrics.json`. This is the **third** spike to
hand-roll the optimize→bench→merge sweep pattern (after vis-range `a6c0707` and occluder `6146794`);
that repetition is what promoted the pattern into the framework tool `tools/bench_sweep.sh` (below).

## VERIFIED Godot 4.6.3 fade semantics (Phase 1, carried unchanged)

- Fade band = **`[end, end+margin]`**; a **positive margin is REQUIRED** (a zero-width band never
  fades). `self` fades the object's own alpha over the band; `deps` fades its
  `visibility_parent` LOD dependencies. This sweep uses `self` throughout (the common case — fade the
  culled object itself).
- **RENDERER CAVEAT — the headline, regardless of the sweep outcome: the fade renders ONLY under
  Forward+.** The Mobile / **Compatibility renderer — which the WEB EXPORT uses — treats
  `SELF`/`DEPENDENCIES` as DISABLED**, so the hard pop **RETURNS on web**. `house-twin` renders
  `forward_plus`, so the fade is LIVE in every number below; the web caveat is renderer-level, not
  sweep-measurable here, and every downstream doc carries it verbatim. (A runtime Compatibility
  re-render at the peak-fade pose was INCONCLUSIVE — the fade's already-tiny signal sits under
  whole-renderer shading noise; the authoritative proof is the Phase 1 serialization-level analysis,
  which stands.)

## Machine / methodology (reused from vis-range-sweep / occluder-sweep)

Apple M3 Pro, macOS, Metal / Forward+, Godot 4.6.3, 1280×720 window, vsync OFF, shadows OFF,
warmup 2 s / measure 8 s (repeat cells 1.5 / 6 s). ucity vantages byte-identical to those runs
(street `139.5,1.7,135:139.5,1.7,0`, aerial `-65,260,-65:135,15,135`). Documented within-session
noise floor **~0.03 ms cpu**. Scene: **ucity** only (`city_before.scn` optimized
`--min-instances=100000` → `groups_instanced==0`, all 28,600 meshes individual; `vis_ranges_set==18000`
for every vis config). duplex / c2 are out of scope — vis-range-sweep already proved them
no-op/trivial for the vis pass.

**METHOD NOTE — thermal drift, sequential → interleaved (the lesson that fed the tool).**
Presentation was **120 Hz display-capped this run** (`frame_ms` 8.33 flat everywhere). With render
load ~1–2 ms out of the 8.33 ms budget the CPU idles ~6 ms/frame and measured render-time cpu is
noisy. The **single sequential street pass drifted NON-PHYSICALLY** — fade configs read _lower_ cpu
than their no-fade base despite rendering _more_ objects (impossible for the same scene). The raw
drifted pass is kept (`json/ucity_street.json`, superseded). **Street cpu is taken from INTERLEAVED
REPEAT arrays** (`json/repeat/<cfg>.json`): each config benched once per cycle, cycles interleaved,
which cancels the monotonic thermal drift and restores the physical ordering (base < fade5 < fade12).
The two families ran in separate thermal blocks, so **each family's retention uses its own same-block
OFF**. `objects_rendered` / `draw_calls` / `primitives` are DETERMINISTIC per-frame counts (identical
every run) and are the backbone metric; cpu corroborates within its noisy limits. Aerial is stable
and taken from the single pass. This defect-and-fix is exactly what the promoted `bench_sweep`
auto-suggests (interleave when `frame_ms` is pinned at the cap) and asserts (deterministic columns
identical across repeats).

## Configs (optimize flags; ucity, `--min-instances=100000`)

| config            | small/med diag        | small/med end | fade                                        |
| ----------------- | --------------------- | ------------- | ------------------------------------------- |
| off               | — (no `--vis-ranges`) | —             | —                                           |
| aggressive        | 1.0 / 4.0             | **20 / 60**   | none                                        |
| aggressive_fade5  | 1.0 / 4.0             | 20 / 60       | `--vis-fade-margin=5 --vis-fade-mode=self`  |
| aggressive_fade12 | 1.0 / 4.0             | 20 / 60       | `--vis-fade-margin=12 --vis-fade-mode=self` |
| coarser           | 1.0 / 4.0             | 40 / 120      | none                                        |
| coarser_fade5     | 1.0 / 4.0             | 40 / 120      | `--vis-fade-margin=5 --vis-fade-mode=self`  |
| coarser_fade12    | 1.0 / 4.0             | 40 / 120      | `--vis-fade-margin=12 --vis-fade-mode=self` |

## STREET results (interleaved-repeat, per-family own OFF) — DECISIVE

Retention = (OFF − fade) / (OFF − no-fade-base). Fade cost = fade − base (median). Δobj vs base.

**aggressive tier** — OFF cpu median 1.61 / min 1.51 ms:

| config            | cpu med | cpu min | objects | Δobj             | draws | fade cost (med)      | ret med | ret min | verdict        |
| ----------------- | ------- | ------- | ------- | ---------------- | ----- | -------------------- | ------- | ------- | -------------- |
| aggressive        | 0.84    | 0.83    | 4854    | —                | 906   | —                    | 100%    | 100%    | no-fade base   |
| aggressive_fade5  | 0.87    | 0.86    | 5016    | **+162 (+3.3%)** | 1303  | **+0.025 (≤ noise)** | **97%** | **96%** | **PASS ≥80%**  |
| aggressive_fade12 | 1.08    | 0.96    | 5282    | +428 (+8.8%)     | 1630  | +0.235               | 69%     | 81%     | **BORDERLINE** |

**coarser tier** — OFF cpu median 1.77 / min 1.73 ms:

| config         | cpu med | cpu min | objects | Δobj         | draws | fade cost (med) | ret med | ret min | verdict      |
| -------------- | ------- | ------- | ------- | ------------ | ----- | --------------- | ------- | ------- | ------------ |
| coarser        | 1.28    | 1.21    | 7944    | —            | 1325  | —               | 100%    | 100%    | no-fade base |
| coarser_fade5  | 1.46    | 1.35    | 8262    | +318 (+4.0%) | 1816  | +0.170          | 65%     | 73%     | FAIL <80%    |
| coarser_fade12 | 1.58    | 1.53    | 8726    | +782 (+9.8%) | 2452  | +0.295          | 39%     | 38%     | FAIL <80%    |

**Cost mechanism, quantified (the rule's ask):** the band `[end, end+margin]` extends draw distance —
objects that would hard-cull at `end` instead **render (with alpha)** out to `end+margin`. So
`objects_rendered` RISES with margin exactly as predicted (aggressive +3.3% / +8.8%; coarser +4.0% /
+9.8%) and `draw_calls` rise harder (aggressive 906→1303→1630; coarser 1325→1816→2452 — each faded
object still submits a draw); cpu tracks the object rise. **coarser's fade is proportionally far
costlier**: its 40/120 m cull radius sits where much more geometry lies in the band (+782 objects at
margin 12) AND its no-fade win is smaller (0.49 vs 0.77 ms), so the same-magnitude fade cost eats a
bigger fraction of a smaller win.

## AERIAL results (single-pass; context) — fade is FREE

| config                                         | objects               | cpu_ms                         |
| ---------------------------------------------- | --------------------- | ------------------------------ |
| off                                            | 40500                 | 3.94                           |
| any vis config (aggressive/coarser × any fade) | **12700** (identical) | 2.13–2.17 (flat, within noise) |

From 374 m up the whole scene is past even `end+margin` (72 m ≪ 374 m), so the fade band contains
NOTHING: every vis config renders an IDENTICAL 12700 objects and cpu is flat within noise. **Fade
costs nothing at aerial** — the cost materialises only where objects sit inside the band, i.e. at
street.

## POP-SERIES proxy (rule clause a) — FRAME-REVIEWED, PENDING HUMAN FLY-THROUGH

Dense scripted approach down the street axis (`pop_series.gd`, one windowed process per config):
camera stepping z 126→30 in **3 m** steps (32 frames), crossing the aggressive 60 m medium cutoff.
The honest read on how the pop was (and was not) isolated:

- **Adjacent-frame diff COULD NOT isolate the pop under motion.** 3 m of forward travel down a dense
  street shifts the whole frame (parallax): adjacent-frame SSIM ~0.83 and a periodic ydelta peaking
  every ~24 m (the repeating city-block geometry). The aggressive (no-fade) and fade12 temporal
  profiles are **identical to 3 sig figs** (peak ydelta 21.67 vs 21.63) — motion swamps any per-object
  fade signal at this step granularity. The adjacent-frame metric alone cannot see the pop here.
- **Matched-position config diff (motion cancelled) IS the signal.** Diffing aggressive vs a fade
  frame at the SAME camera pose isolates exactly the pixels the fade changes: aggressive vs **fade12**
  peak ydelta 0.164 / 255 (mean 0.033, min SSIM 0.9962), localised to the block-boundary rows at the
  cull distances; aggressive vs **fade5** peak 0.056 (~⅓ the faded geometry — the narrower band). The
  20×-amplified diff shows the changed pixels are **windows, wall panels and green roof caps** at the
  cull boundary that fade renders (faded) and aggressive drops entirely — the "distant small fixtures"
  the vis-range finding flagged. The fade demonstrably **replaces the hard appearance with a gradual
  alpha ramp** (mechanism proven by the +162/+428 object rise and the amplified diff).
- **At 1× the configs are near-indistinguishable (SSIM 0.996).** WHY the pop is small at this vantage:
  the aggressive cutoff only ranges **sub-4 m-diag clutter** (buildings, being large, are NEVER ranged
  — they always draw), and at 60 m that clutter is tiny in screen space. So both the hard-pop and its
  fade-fix are **perceptually minor here**; the magnitude is subtle.

**Frame-reviewed; a human fly-through is still needed to rule on perceptual pop elimination — flagged
pending** (the standing convention: an agent judged the frame series + matched diff, not live motion).

## Rule applied (pre-declared, unadjusted)

- **aggressive_fade5 (margin 5, self):** (b) **PASS** — 97% median / 96% min retention; fade cost
  **+0.025 ms, at/below the 0.03 ms noise floor = effectively FREE**; +162 objects (+3.3%). (a)
  softens the pop (alpha ramp replaces the hard appearance; matched diff confirms fade active) — the
  pop at this vantage is small to begin with. **Clears both, pending human confirmation of the
  narrower 5 m band.**
- **aggressive_fade12 (margin 12, self):** (a) **best** pop smoothing (widest band, smoothest ramp)
  but (b) **BORDERLINE-FAIL** — 69% median / 81% min retention; +0.235 ms eats ~⅓ of the win on the
  robust median estimator. The config that came CLOSEST on the pop but **misses the retention bar**.
- **coarser tier (context):** fade FAILS retention at BOTH margins (65% / 39%) — not adoptable with
  fade; its wider cull radius drops far more geometry into the band.

## ADOPTION — aggressive tier gains a fade, PENDING the human fly-through

**The aggressive vis-range tier is adoptable WITH `--vis-fade-margin=5 --vis-fade-mode=self`.** The
recipe's aggressive-tier guidance (in the `twin-optimize` skill) now names that flag pair as the
recommended pairing when a project reaches for the aggressive cutoffs — margin 5 keeps 97% of the cpu
win (cost within noise, because only 162 distant fixtures re-enter the band) and replaces the hard
pop with an alpha ramp. This ships as **recommended-with-caveat, NOT a silent default**: the standing
convention gates the final "kill the pop" verdict on a **human fly-through** of the street vantage on
the unique-mesh city at the aggressive cutoff. Until that fly-through confirms margin 5 perceptually
kills the (small) pop, the guidance reads "adopt aggressive with margin 5, pending the fly-through";
if a human judges the 5 m ramp too quick, **margin 12 is the pop-optimal fallback but does not clear
the 80% retention bar** and would ship as "aggressive-tier fade costs ~⅓ of the win." No optimizer
constant changes — the fade is opt-in via the flags, exactly like `--vis-ranges` itself; the default
tier (0.5/2 → 40/120) is untouched (perceptually clean without fade).

**Web-export caveat carried verbatim:** the fade renders under **Forward+ ONLY** — on the
Compatibility renderer (the web export) it is **DISABLED and the pop returns**. A twin destined for a
browser embed cannot lean on the fade to justify the aggressive cutoffs.

## Caveats

- **One machine** (Apple M3 Pro, Metal / Forward+, macOS, Godot 4.6.3), one window (1280×720),
  **shadows OFF** (a shadow pass would re-rank everything). Recipes generalize; the exact percentages
  are this machine's — re-measure on target hardware before promising a budget.
- **fps was 120 Hz display-capped this session** — so **street cpu is interleaved-repeat medians**
  (drift-cancelled), and `objects_rendered` / `draw_calls` (deterministic) are the backbone; the
  single sequential pass is superseded (kept for provenance). Cross-session absolute cpu is not
  comparable; within-session, within-thermal-block deltas are the proof.
- The unique-city is a **synthetic stand-in** (uniqueness via a `--min-instances` threshold trick) —
  honest about mesh _count_ and cull behavior; a real heterogeneous-plant scene should confirm.
- **`deps` (fade dependencies) is UNMEASURED** — this sweep is `self` only. `deps` fades a
  `visibility_parent` LOD chain, which none of the bench scenes author; re-bench before relying on it.
- The perceptual verdict is **frame-reviewed** — closed 2026-07-11 without a formal fly-through
  (human accepted as fine for now; re-open if popping bothers real use). And the whole
  fade result is **Forward+ only**; the web pop is unfixed by design.

## Reproduce

From the seat (`twindemo/twin-spikes/fade-sweep/`, commit `8118350`):
`bash bench_fade_sweep.sh overlay|optimize|restore|bench`, then
`CYCLES=4 bash bench_fade_sweep.sh repeat aggressive` / `... repeat coarser` (interleaved street cpu),
`bash bench_fade_sweep.sh pop` (pop series + `pop_analyze.py`), then `python3 merge.py` regenerates
`summary.json` + the retention tables. The same sweep expressed as a declarative matrix for the
promoted framework tool: `plugin-twin/examples/bench_sweep.vis-fade.example.json` (run in a project
with the fade-capable optimizer materialized). Requires a display (bench SKIPs headless).
