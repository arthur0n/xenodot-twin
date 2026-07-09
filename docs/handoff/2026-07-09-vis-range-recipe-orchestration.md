# Orchestration plan — executing Must-Have #4 (benched vis-range recipe)

Companion to `2026-07-09-vis-range-recipe-plan.md` (the WHAT). Same execution protocol
that closed items #2 and #3: Opus subagent per phase, orchestrator line-by-line review
between phases, independent scoped review + seat UI check before merge.

## Working rules

- Branch: `feat/vis-range-recipe` off `main` (post item-#3 merge, `899b90d`).
- MEASUREMENT item: the deliverable is a gate-backed number set (or an honest negative).
  All three plan outcomes are shippable; never force a "win".
- Sweep runs from the SEAT (`twindemo/`), windowed (bench SKIPs headless) — sweep
  scripts and raw JSON are seat-local evidence, only the recipe/constants land in the
  framework.
- Perceptual pass: subagents cannot truly "see" popping live — approximate with
  scripted camera-path screenshot series per config (agent reviews frames), and the
  findings file must flag the perceptual verdict as "frame-reviewed, pending human
  fly-through confirmation".
- `--vis-ranges` stays opt-in in twin-build unless win is unambiguous on BOTH
  real-shaped scenes AND the perceptual pass is clean (plan's own bar).

## Phase 1 — parameterize the pass (framework; subagent: Opus)

Four `--vis-*` args on `optimize_scene.gd` defaulting to the existing constants;
report JSON records effective values; no-arg output byte-identical (diff duplex
report + tscn pre/post); full gate green.

## Phase 2 — the sweep (seat; subagent: Opus)

3 scenes (optimized duplex / unique-mesh city via --min-instances threshold trick /
instanced-c2 negative control), 2 vantages (2026-07-08 coordinates), 6 configs,
`bench_vis_sweep.sh` seat-local driver, raw JSON committed to seat repo, negative
control asserted (`vis_ranges_set == 0`, metrics within documented noise floor),
screenshot series for the perceptual proxy. Metrics order: cpu_ms → sub-cap fps →
objects_rendered delta → primitives.

## Phase 3 — recipe + docs (framework; subagent: Opus, scope depends on Phase 2 outcome)

Constants/derivation per outcome with measured rationale; findings file
`twin-vis-range-recipe-<date>.md` with machine caveats; twin-optimize SKILL.md recipe
section; CAPABILITIES + optimize_scene.gd header; roadmap tick naming outcome type.
No new SEAMS rows (all twin-plugin-owned).

## Orchestrator gates

1. Line-by-line diff review per phase; Phase 2 also sanity-check the numbers
   (noise floor vs claimed deltas — a "win" inside noise is a negative).
2. Independent scoped review before merge.
3. UI/seat check appropriate to the item (bench evidence + optimized scene boots).
4. Acceptance criteria 1–6 from the plan.
5. Merge no-ff to main, push, log updated — then next index item.

## Status log

- [x] Phase 1 done + reviewed — `5853234` on `feat/vis-range-recipe` (+58/-5, sole
      file optimize_scene.gd). Four --vis-\* flags, one source-of-truth dict (\_vis), loud
      validation incl. medium>small ordering (deliberately NOT --min-instances-style
      clamping — a silently clamped sweep row corrupts the measurement), report echoes
      effective values. No-arg byte-identity proven modulo Godot's inherent unique_id
      churn (same-tool re-run shows identical noise shape; 0 content diffs). Args proven
      live: vis_ranges_set 47→150 with coarser classes. Orchestrator also fixed the
      pre-broken smoke Phase 1 flagged in twin-build-validate: viewer.cfg pointed at the
      never-built duplex.glb → re-ran twin_build.sh --wire (WIRE: OK, .bak kept,
      twin-build: OK end-to-end — bonus real-world --wire exercise).
- [x] Phase 2 done + reviewed — seat commit `a6c0707`
      (twin-spikes/vis-range-sweep/: driver, 6 raw bench JSON, 14 optimize reports,
      36 shots, merged summary.json with 28 self-describing rows). Matrix 100%.
      Outcome: SCOPED WIN. ucity aerial cpu −32% (default) to −71% (coarser/aggr),
      street −9% to −45% — all far beyond the 0.03 ms floor; duplex flat at street,
      ≤0.04 ms aerial (marginal); negative control c2 vis_ranges_set==0, objects
      byte-identical to 2026-07-08 (542/1084), within noise. Perceptual (frame-reviewed,
      pending human fly-through): default + dist_double CLEAN; dist_half/coarser mild
      far thinning; aggressive visible hard-pop ~60 m — needs fade margin if ever
      adopted. Orchestrator sanity check: numbers coherent, deltas real, evidence rows
      self-describing. Deviation accepted: duplex vantages AABB-derived (city coords
      meaningless on a 9×11×27 m building); c2 reduced to OFF+default per plan.
- [x] Phase 3 done + reviewed — `a5f3f18` (findings 212L + skill recipe + CAPABILITIES
  - constants comment citing measurement) + `ccb1c77` (roadmap/index tick "SCOPED
    WIN"). Defaults kept (measured clean winner), coarser/aggressive explicitly NOT
    adopted pending fade margin, --vis-ranges stays opt-in in twin-build (plan's bar:
    win not unambiguous on both real-shaped scenes). Verify gate re-proven green with
    branch tool overlaid on seat project.
- [x] Scoped review (independent Opus): MERGE-READY. EVERY findings-table cell
      verified against raw summary.json; percentages recomputed correct; negative
      control byte-identical to 2026-07-08 (542/1084); no noise-floor delta sold as a
      win; partial-override guard reads merged dict (caught); no-arg scene output
      unaffected. All findings LOW: >120-line library chunk warning (non-blocking,
      precedent exists), plan AC1 wording loose re report keys (branch correct),
      \_resolve_vis validates even without --vis-ranges (early-reject, desirable).
- [x] Perceptual verdicts labeled "frame-reviewed, pending human fly-through" —
      standing open item for a human walkthrough; does not block (default config is the
      shipped guidance and is frame-clean).
- [x] Acceptance criteria 1–6 verified independently. Merged to main (no-ff), index
  - roadmap ticked. Item #4 CLOSED — Must-Haves 4/4 complete.
