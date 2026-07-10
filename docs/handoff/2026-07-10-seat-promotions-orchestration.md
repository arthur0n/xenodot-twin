# Orchestration plan — seat→core promotions (post-run audit)

Origin: human-requested audit "what was built in the test repo that should go to
the framework?" after the open-items run. Verdict: the validate projects hold
nothing (consumers, regenerable); four genuinely framework-worthy strays stayed
seat-local. Human approved the recommendation: promote two now, trigger-ize two.

## Scope

PROMOTE NOW (this item, branch `feat/seat-promotions` off main `1819446`):

1. **bench_sweep perceptual mode** — promote the fade-sweep pair
   (`twin-spikes/fade-sweep/pop_series.gd` + `pop_analyze.py`) into the
   framework as the documented "perceptual v2" of `tools/bench_sweep`
   (the tool's own docs already point at this as the planned v2; the promotion
   closes that pointer). House them per the bench precedent
   (`tools/bench/`), generalize the hardcoded fade-sweep specifics (paths,
   camera coords → args), keep the honest labeling ("frame-reviewed, pending
   human confirmation" is the output's own caveat class).
2. **`examples/gen_city.gd`** — promote `house-twin/scripts/gen_city.gd` (and
   `shot_city.gd` if it's part of reproducing the findings — assess) into
   `plugin-twin/examples/` per the `gen_plant_ifc.py` precedent (demo/bench
   asset generators live in examples/, NOT materialized into user scaffolds).
   Three merged findings depend on scenes only this script regenerates.

TRIGGER-IZE (open-items doc entries, no build): 3. web-ceiling browser-bench drivers (web_bench.gd + CDP .mjs) — promote when
web benching recurs (Godot upgrade, Safari cells, renderer work). 4. Retention math into merge_sweep.py — promote when a second retention-gated
recipe shows up.

## Working rules

- Promotions are MOVES with generalization, not rewrites: behavior parity with
  the spike originals proven where feasible (pop_series output on the same
  scene/coords → same frames; gen_city with same params → same census/optimize
  results as the vissweep artifacts).
- Findings that cite seat paths stay as-is (provenance is historical); the
  TOOL docs point at the new framework homes going forward.
- check:sh floor + gdlint/gdformat + validate/test gates as always; SEAMS
  protect-list += new files; CAPABILITIES updated; twin-optimize SKILL's
  "benching a recipe" section gains the perceptual mode + generator pointers.
- Spike originals stay in the seat (evidence); a one-line "promoted to core as
  X" note in each spike dir README/NOTES if cheap.

## Orchestrator gates

1. Line-by-line diff review; parity proofs checked.
2. Independent scoped review if the generalization is non-trivial (likely yes
   for pop_series arg-ification; decide on sight).
3. Seat check: run the promoted perceptual mode + gen_city from a seat project.
4. Merge no-ff, push, open-items updated (items 3/4 trigger-ized there too).

## Status log

- [x] Implemented (branch `feat/seat-promotions`): perceptual mode →
      `plugin-twin/tools/bench/pop_series.gd` + `pop_analyze.py` (arg-ified — fade-sweep coords are the
      header example; adjacent + matched-position modes; ffmpeg preflighted); scale generator →
      `plugin-twin/examples/gen_city.gd` (determinism stated honestly: census/structure stable, .scn bytes
      not claimed). Invocation shape: standalone companions in the `tools/bench/` family, NOT a
      `bench_sweep.sh` stage (windowed + single-axis + perceptual metrics ≠ the headless matrix/asserted
      merge — closes the v1 "documented v2" pointer without overloading the matrix schema).
- [x] Parity proofs: (1) promoted `pop_analyze` on the spike's recorded frames + on frames
      re-captured by the promoted `pop_series` (33 frames, `f_001..f_033`) both reproduce the recorded
      matched numbers EXACTLY — aggressive vs fade12 peak ydelta 0.164 @ z=99 / mean 0.033 / min SSIM
      0.9962; fade5 peak 0.056 / mean 0.008. (2) `gen_city --grid=10 --pitch=30` → 28,600 meshes / 100
      copies / 10×10; optimized `--min-instances=100000` → groups_instanced 0, groups_total 224,
      vis_ranges_set 7700 (defaults) — matches the vissweep census.
- [x] shot_city.gd assessed → LEFT IN SEAT (screenshot convenience, not a findings-reproduction
      dependency; the quantitative backbone reproduces via gen_city + bench_sweep, the perceptual
      street-approach via the promoted pop pair; shot_city only adds static bench-scene screenshots).
- [x] Seat check: promoted tools run from the seat (house-twin), artifacts restored/cleaned.
- [x] Gates: `npm run validate` (incl. check:sh), `npm test`, prettier, gdlint/gdformat, py_compile —
      all green. Materialization confirmed: `tools/bench/` pop files ride the recursive copy; `examples/`
      does not materialize.
- [ ] Merged to main (orchestrator gate — NOT done here per instructions; no merge/push).
