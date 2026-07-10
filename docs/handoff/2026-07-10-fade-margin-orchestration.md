# Orchestration plan — open item #6: fade margin for aggressive vis classes

Companion to `2026-07-10-open-items.md` item 6 and the umbrella orchestration doc.
Context from the vis-range finding (`twin-vis-range-recipe-2026-07-09.md`):
`coarser`/`aggressive` size classes win up to −71% cpu on many-unique-mesh scenes
but hard-pop visibly at ~60 m (no fade); adoption was blocked on a MEASURED
fade-margin evaluation — measured before adopted, per the standing rule.

## Working rules

- Branch: `feat/vis-fade-margin` off `main` (post item-#5 merge, `b55ee2d`).
- **Pre-declared decision rule (BEFORE measuring; worded per-vantage-class — the
  item-#5 lesson):** a fade configuration earns adoption into the vis-range
  recipe's aggressive tier iff, on the many-unique-mesh scene at the STREET
  vantage (the class+vantage where coarser/aggressive win), it (a) eliminates
  the visible hard-pop in the frame-series proxy (no abrupt full-object
  appearance between consecutive frames along the approach path) AND (b) retains
  ≥80% of that config's measured cpu win vs OFF (fade renders transitioning
  objects with alpha — it has real cost; if fade eats the win, the honest
  outcome is "aggressive tier stays unadopted, hard-pop is why, fade cost is
  why"). Aerial cells are context only. All outcomes shippable.
- Default tier (0.5/2→40/120) is NOT in question — it is perceptually clean
  without fade (measured); nothing changes for it unless fade is literally free.
- Godot facts to verify in Phase 1, not assume: which fade mechanism applies —
  `visibility_range_fade_mode` (self/dependencies) vs a begin margin
  (`visibility_range_begin_margin`/`visibility_range_end_margin`) — what each
  actually does on a MeshInstance3D, and their transparency implications on the
  Compatibility vs Forward+ renderers (web export uses Compatibility — a fade
  that only works on Forward+ is a caveat the recipe must carry).

## Phase 1 — parameterize fade (framework; subagent: Opus)

`optimize_scene.gd`: fade knobs on the vis pass (e.g. `--vis-fade-margin=<m>`
and/or `--vis-fade-mode=<self|deps>` — exact surface decided from the verified
Godot semantics; loud validation via \_resolve_overrides; report echoes).
No-arg byte-identity (churn methodology); full gate green; gdlint/gdformat.

## Phase 2 — the sweep (seat; subagent: Opus)

ucity street (the decisive cell) + ucity aerial (context): aggressive and
coarser configs × fade OFF / margin small (e.g. 5 m) / margin larger (e.g.
10–15 m) / mode variants as the Phase 1 semantics dictate. Metrics: cpu_ms vs
the no-fade win (the ≥80% retention check), objects_rendered, and the
POP-SERIES proxy: frame series along a street approach path crossing the 60 m
cutoff — consecutive-frame diffs; hard-pop = abrupt appearance, fade = gradual
alpha ramp visible across several frames. Evidence to the seat repo.

## Phase 3 — recipe update + sweep-tool promotion (framework; subagent: Opus)

vis-range finding gains a fade addendum (or a new finding file — match library
conventions); twin-optimize SKILL vis-range recipe section updated (aggressive
tier adopted-with-fade OR stays-unadopted-with-numbers); CAPABILITIES for new
flags; open-items doc item-6 tick. Constants only change if adoption happens.

PLUS (human directive, mid-run): promote the sweep driver into a reusable
deterministic framework tool — this run's THIRD spike-local driver (vis-range,
occluder, fade) proves the pattern. `plugin-twin/tools/bench_sweep` (shape per
Phase 2's tool-promotion spec): declarative matrix in → optimize builds
(deterministic, seeded) → windowed bench runs → merged self-describing rows
out. Timings stay honestly session-bound (documented); everything else
deterministic. The three existing spike drivers become matrix configs /
worked examples. SEAMS/CAPABILITIES accordingly.

## Orchestrator gates

1. Line-by-line review per phase; Phase 2 numbers vs the pre-declared rule.
2. Independent scoped review before merge.
3. Seat check: orchestrator boots a fade-built scene.
4. Merge no-ff, push, umbrella + open-items updated — then item #7.

## Status log

- [x] Phase 1 done + reviewed — `ed99442` (no-op refactor: vis subsystem →
      TwinVisRange lib helper, forced by the 500-line gdlint cap, byte-identity
      proven independently) + `4552f22` (--vis-fade-margin / --vis-fade-mode,
      provided-bit validation, coupling rule: mode needs margin, margin defaults
      mode to self). VERIFIED SEMANTICS recorded in code + here: fade band =
      [end, end+margin]; margin REQUIRED for visible fade; DEPENDENCIES fades
      visibility_parent deps not self; **Forward+ ONLY — Compatibility (web
      export) treats fade as DISABLED, pop returns there** — the recipe headline
      regardless of sweep outcome. MultiMesh batches never touched. Proofs: no-arg
      byte-identity, 47/47 meshes serialize margin+mode, 7 validation failures
      loud, full seat gate green (strict warnings caught a Variant-arg issue the
      scratch runs missed — overlay gate earned its keep).
- [x] Phase 2 done + reviewed — seat commit `8118350` (fade-sweep/: interleaved
      repeat json, reports, 3×32-frame pop series + matched-position diffs, driver +
      merge + pop_analyze). RULE VERDICT (unadjusted): aggressive tier ADOPTABLE
      with --vis-fade-margin=5 --vis-fade-mode=self — retention 97% median (fade
      cost +0.025 ms ≤ noise), pop softened via alpha ramp (matched-position diff
      proves fade active; at 1× the aggressive pop is perceptually minor — sub-4 m
      clutter at 60 m). fade12 = pop-optimal fallback but 69% median retention
      (fails ≥80%). coarser+fade FAILS both margins (39–73%). Aerial: fade free
      (band empty). Adoption gated on human fly-through (standing convention).
      Renderer caveat carried: Forward+ only — web export keeps the pop.
      METHOD DEFECT found+fixed: sequential bench order aliased thermal drift onto
      the config axis under this session's 120 Hz cap → interleaved-repeat medians
      (drift common-mode); superseded drifted pass kept + documented. Permission
      blip mid-run: two longer repeat benches denied → equivalent data via two
      4-cycle family runs, no data lost, overlay/strays verified clean.
      Tool-promotion spec delivered (declarative matrix, determinism asserts,
      session-bound labeling, auto-interleave when capped, perceptual sub-modes).
- [x] Phase 3 done (recipe + tool promotion) — finding
      `plugin-twin/library/findings/twin-vis-fade-2026-07-10.md` (pre-declared rule, retention tables
      cross-checked vs seat `8118350` summary.json/pop_metrics.json, Forward+-only caveat, thermal-drift
      method note, ADOPTION = aggressive tier + `--vis-fade-margin=5 --vis-fade-mode=self` recommended
      pending the human fly-through). SKILL `twin-optimize` vis-range recipe gains the fade guidance
      (aggressive+fade5, margin-12 fallback, coarser-fails/web-caveat when-NOT) + a "benching a recipe"
      subsection; CAPABILITIES gains the two fade flags + the bench_sweep entry; `TwinVisRange` MEASURED
      block extended. TOOL PROMOTION: `plugin-twin/tools/bench_sweep.sh` +
      `tools/bench/merge_sweep.py` + `examples/bench_sweep.vis-fade.example.json` (CORE
      matrix→optimize→bench→merge with determinism asserts, delta-vs-baseline + noise flag, auto-suggest
      interleave; perceptual sub-mode deferred to a documented v2). SEAMS protect-list + open-items #6
      ticked. Proven end-to-end in the seat (house-twin, duplex 2-config matrix): stages, determinism
      assert PASS, 3 loud negatives (unknown key / missing baseline / doctored-row variance), shellcheck
      clean, materializes via the recursive copy.
- [ ] Scoped review + seat check
- [ ] Merged to main, docs updated
