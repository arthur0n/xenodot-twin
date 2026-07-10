# Orchestration plan — open item #5: benched occluder recipe

Companion to `2026-07-10-open-items.md` item 5 and the umbrella
`2026-07-10-open-items-orchestration.md`. Direct sibling of the vis-range item
(Must-Have #4): `--occluders` ships a reasoned-but-unbenched
`OCCLUDER_MIN_VOLUME_M3` default and the twin-optimize skill already warns it
"can be net-negative" — nobody has measured where. Same execution protocol and
the same measurement discipline (pre-declared decision rule, noise floor, all
outcomes shippable).

## Working rules

- Branch: `feat/occluder-bench` off `main` (post item-#4 merge, `82b3f61`).
- Methodology inherited from the vis-range findings + 2026-07-08 benchmark:
  same vantages where comparable, cpu_ms leads sub-cap, ~0.03 ms noise floor,
  machine caveats pinned. The vis-range sweep harness
  (`twindemo/twin-spikes/vis-range-sweep/bench_vis_sweep.sh`) is the reusable
  starting point.
- **Pre-declared decision rule (BEFORE measuring):** `--occluders` earns a
  default-on recommendation for a scene class only if it wins ≥0.10 ms cpu_ms
  (≥3× noise floor) on that class at BOTH vantages with zero visual artifacts
  (frame-compare proxy); otherwise it stays opt-in with measured guidance. A
  net-negative result is published as such (the skill's warning gets numbers).
- Occlusion needs occluders between camera and geometry: street-level vantages
  are the live cells; aerial is the expected no-op/negative control by
  geometry (little sits between an aerial camera and the scene) — verify
  rather than assume.
- Perceptual proxy per the vis-range precedent: screenshot series,
  "frame-reviewed, pending human confirmation" labeling.

## Phase 1 — parameterize the knob (framework; subagent: Opus)

`optimize_scene.gd`: `--occluder-min-volume=` arg defaulting to
OCCLUDER_MIN_VOLUME_M3 (same loud validation pattern as the --vis-\* flags —
number > 0, no silent clamping); report JSON records the effective value +
`occluders_set` count (check what the report already carries). No-arg output
byte-identical (unique_id-churn methodology from vis-range Phase 1). Full gate
green.

## Phase 2 — the sweep (seat; subagent: Opus)

Scenes: optimized duplex (interior walls = natural occluders), instanced c2
city (building shells), unique-mesh city if cheap (the sub-cap scene where a
win would actually show). Vantages: street + aerial (prior coords). Configs:
OFF baseline; default (10 m³); half (5); double (20); aggressive (2). Metrics:
cpu_ms / fps sub-cap / objects_rendered delta (occlusion culling's direct
signal) / draw_calls; occluder count per config from the report. Frame-compare
proxy for artifacts (over-aggressive occluders cause visible pop-in/holes).
Raw JSON + notes committed to the seat repo.

## Phase 3 — recipe + docs (framework; subagent: Opus, scope per outcome)

Findings file `twin-occluder-recipe-2026-07-10.md` (every outcome ships);
constants/doc comment updated citing the measurement; twin-optimize SKILL.md
occluder section gains measured guidance (or the honest negative with
numbers); CAPABILITIES if the arg surface changed; roadmap NOT touched (this
is an open-item follow-up, not a roadmap row — note it in the open-items doc
instead); `--occluders` stays opt-in in twin-build unless the pre-declared
rule is met unambiguously.

## Orchestrator gates

1. Line-by-line review per phase; sweep numbers sanity vs the pre-declared
   rule (a delta inside noise is not a win).
2. Independent scoped review before merge (numbers integrity vs raw JSON).
3. Seat check: orchestrator boots an occluder-built scene.
4. Merge no-ff, push, umbrella log updated — then open item #6.

## Status log

- [x] Phase 1 done + reviewed — `554b074` (+26/−8, sole file optimize_scene.gd,
      vis-range precedent followed exactly). --occluder-min-volume= with loud
      validation folded into renamed \_resolve_overrides (one validation home),
      report echoes occluder_min_volume beside occluders_added, pass reads the
      effective var. Proofs: byte-identity modulo inherent unique_id churn
      (same-tool re-run control), arg live (occluders_added 31→74 at volume 2,
      tscn OccluderInstance3D counts match reports exactly), 3 validation failures
      loud exit 1, gate GDScript stages green (smoke FAIL proven environmental via
      pristine-tool control — no sim on :8765), gdlint/gdformat clean.
- [x] Phase 2 done + reviewed — seat commit `6146794` (occluder-sweep/: NOTES,
      summary.json self-describing, 6 bench arrays, 15 reports, 40 shots). Matrix
      complete (c2 collapsed to OFF — all configs add 0 occluders, logged as data).
      Both bench projects ship use_occlusion_culling=true (committed f41f93e) —
      numbers are real occlusion. Results: ucity street −0.15 ms (5× floor) at
      default/half, objects −55..−73%, SSIM ≥0.9999 lossless; ucity aerial
      structural NO-OP (objects byte-identical across configs); duplex NET-NEGATIVE
      both vantages (+0.16..+0.25 ms) + genuine interior over-cull artifact (SSIM
      0.983 in-room); 10 m³ default already the sweet spot (smaller gates add
      occluders, no cpu payoff). DECISION vs pre-declared rule: stays OPT-IN with
      measured guidance; duplex net-negative published. HONEST RULE NOTE: the
      "win at BOTH vantages" bar is unreachable by occlusion as a feature class
      (aerial has nothing between camera and scene) — rule was mis-specified,
      verdict unaffected (opt-in either way), flaw recorded so the next
      measurement item words its rule per-vantage-class.
- [x] Phase 3 done + reviewed — `a4fbeb1` (finding 251L + skill recipe rewrite +
      CAPABILITIES + constants comment measured-cited + open-items tick).
- [x] Scoped review (independent Opus): MERGE-READY, every spot-checked number
      exact (SSIM recomputed from PNGs; ucity-aerial session-drift attribution
      verified airtight via byte-identical object counts). 3 LOW fixes landed in
      `883135a`: stale \_resolve_vis comment, empty-flag-value now fails loud
      (proof table incl. regression of Phase 1/2 numbers), win headline rescoped
      to street-measured/interior-unmeasured (honesty catch).
- [x] Orchestrator seat check: occluder-built ucity scene boots in the
      current-viewer project (bindings resolve). Side finding: house-twin carries
      a stale pre-item-#2 materialized viewer (GLB-only loader) — re-materialize
      when convenient; not a product bug.
- [x] Merged to main (no-ff `8dfbc90`), pushed. Item #5 CLOSED.
