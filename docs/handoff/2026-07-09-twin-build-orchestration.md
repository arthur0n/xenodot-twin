# Orchestration plan — executing Must-Have #2 (`twin-build`)

Companion to `2026-07-09-twin-build-plan.md` (the WHAT). This doc is the HOW of the
execution: who builds, who reviews, in what order, and what gates each phase. Written by
the orchestrator session in the twin seat (`twindemo/`); implementation is delegated to
Opus subagents, one phase at a time — quality over speed, review between every phase.

## Working rules for this execution

- Branch: `feat/twin-build` off current `main` (post-handoff-docs commit `7f3d039`).
- One subagent per phase. Subagent implements ONLY its phase; orchestrator reviews the
  diff line-by-line before the next phase starts.
- Phase order is the plan's own phasing (viewer/gate plumbing → script+skill → seat
  validation + docs). No phase starts until the previous one is committed on the branch
  and reviewed.
- Merge to `main` only when all three phases + scoped review + seat UI test pass. Then
  tick the roadmap and index.
- Re-verify plan-time file references against current `main` before each phase — the
  plan is a point-in-time investigation (its own warning); PRs #4/#5 landed after it.

## Phase 1 — viewer + gate plumbing (subagent: Opus)

Scope (from plan, gaps 1+2):

- `starter-viewer/main.gd` `_load_model`: extension branch — `.glb`/`.gltf` keep
  GLTFDocument; `.tscn`/`.scn` load as PackedScene + instantiate into `_model_host`.
  Loud error paths preserved.
- `plugin-twin/tools/verify_twin.sh`: forward the gate's scene argument into both
  binding-smoke invocations. No-arg behavior byte-identical (prove by diffing gate
  output on an unchanged project before/after).

Prove before hand-back: full gate green on an existing project; no-arg output diff
empty; optimized Duplex `.tscn` loads windowed and paints (screenshot or described
observation acceptable headless).

## Phase 2 — `twin_build.sh` + skill (subagent: Opus)

Scope: the five stages (preflight, import, optimize, verify, summary) exactly per plan —
venv preflight fails loud with the two `uv` remedy lines, `--vis-ranges`/`--occluders`
pass-through-only never default, `--wire` via headless ConfigFile round-trip with
`viewer.cfg.bak`, SKIP-is-not-pass semantics mirroring `verify_twin.sh`. Plus
`plugin-twin/skills/twin-build/SKILL.md` (operator manual, `agents:` lists
twin-architect, no new agent). shellcheck-clean.

Prove: happy path on bundled Duplex; each preflight failure mode exercised and fails
loud with the right remedy.

## Phase 3 — seat validation + docs (subagent: Opus, validation observed from seat)

Scope: clean-stranger run in `twindemo/` (fresh scaffold, bundled Duplex + example map,
ONE command), findings file in `plugin-twin/library/findings/` with measured wall time +
machine caveats, and the doc set: CAPABILITIES-twin.md entry, tutorial restructure
(one-command path leads, manual walk stays), examples README, SEAMS protect-list
(`tools/twin_build.sh` + `skills/twin-build/`), roadmap tick.

## Orchestrator gates (between phases and at the end)

1. Line-by-line diff review per phase; constants list expected (plan's own bar).
2. Scoped review at the end (`/code-review` equivalent over the branch diff).
3. UI simulation from the seat: boot the twin viewer on the optimized output, confirm
   painted live against the sim; web UI on PORT=8339 (never 8338 — forge's).
4. Acceptance criteria 1–6 from the plan checked one by one before merge.
5. Merge to `main` as snapshot; index status updated; then and only then pick the next
   index item.

## Status log

- [x] Handoff docs committed to main (`7f3d039`).
- [x] Phase 1 done + reviewed — `2498131` on `feat/twin-build`. Proofs: gate green on
      seat, no-arg output byte-identical (1706B diff empty), optimized Duplex tscn loads +
      binds 6/6 via new `_load_packed`. Deviation accepted: only ONE binding-smoke
      invocation exists (plan said two); hints smoke already passes `--scene`. Open: shellcheck
      not installed on this machine — `bash -n` clean, re-run shellcheck at final review if
      available.
- [x] Phase 2 done + reviewed — `8fa5783` on `feat/twin-build` (twin_build.sh 303L +
      SKILL.md 125L). All 6 proofs real: happy path exit 0 (JOIN 286/286, smoke 6/6), no-map
      SKIP loud + twin-bind-data named, venv-absent fails with exact uv lines before any
      artifact, --wire single-line diff with comments intact + .bak byte-identical.
      Deviation ACCEPTED (improves on plan): ConfigFile.save() strips comments (proven), so
      --wire validates via ConfigFile then rewrites only the model= line. Carry-forward for
      Phase 3: house seat has PRE-Phase-1 materialized tools — re-materialize from current
      plugin-twin before the seat validation/UI test.
- [x] Phase 3 done + reviewed — `423fc86` (real clean-stranger catch: fresh project
      class_name cache empty → optimize parse-fail; fixed via guarded one-off headless
      --import, not swallowed), `c28bb0a` (findings: IFC→verified twin ~19.5s cold, JOIN
      286/286, smoke 6/6), `d90ce31` (tutorial/examples/CAPABILITIES/SEAMS/roadmap/index).
      Validation project kept at `twindemo/twin-build-validate`.
- [x] Scoped review (independent Opus, fresh eyes over full branch diff): MERGE-READY,
      0 blockers, 5 nits — nits 1–2 (examples README fast-path accuracy) fixed in
      `01ca584`; nits 3–5 accepted (loud-error edge behaviors). shellcheck still not
      installed machine-wide — standing open item.
- [x] UI test: door http://localhost:8339 → 200; orchestrator's own headless boot of
      `twin-build-validate` optimized scene → `viewer: model loaded ...` +
      `viewer: bindings resolved 6/6`.
- [x] Acceptance criteria 1–6 all verified. Merged to main (no-ff), index + roadmap
      ticked. Item #2 CLOSED.
