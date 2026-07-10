# Orchestration plan — executing Nice-to-Have #5 (multi-model analysis seam)

Companion to `2026-07-09-analysis-seam-plan.md` (the WHAT). Same execution protocol
that closed items #2–#4: Opus subagent per phase, orchestrator line-by-line review
between, independent scoped review + seat proof before merge. First Nice-to-Have —
Must-Haves are 4/4 done.

## Working rules

- Branch: `feat/analysis-seam` off `main` (post item-#4 merge, `9b57173`).
- The seam IS the two contracts (bundle in, report out); workers are swappable
  adapters. Never let a phase drift into building a worker-specific feature.
- Guardrails 1–5 from the plan are inherited verbatim from the Hermes acceptance
  list — each must be demonstrably held at final review.
- Determinism discipline: bundle byte-stable (fixed key order like recording.js),
  stats exact-tested against seeded fixtures. A flaky analysis test is a defect.
- Known machine facts for Phase 3 (AC4 — real NON-Anthropic model report): the Hermes
  gateway on :8642 was DOWN during item #3 (stale pid, billable Portal z-ai/glm-5.2);
  check whether a local OpenAI-compatible endpoint (Ollama etc.) exists before
  deciding the AC4 route; if neither is available without user action, deliver
  everything else + fake-server proof and flag AC4 as blocked-on-user.

## Phase 1 — contracts + packager (subagent: Opus)

`plugin-twin/tools/analyze/{bundle,stats}.js` (bare node, dependency-free,
materializer free-ride), per-tag stats + stride decimation + binding context +
provenance hashes, size budget documented/enforced (~100 KB default), pure-function
tests with exact expected values from seeded fixtures, golden-file bundle test,
contract docs in the future skill's references dir.

## Phase 2 — workers + CLI (subagent: Opus)

Adapter interface in `ui/server/features/twin/analysis.js`; `openai-compatible` +
`hermes` adapters; `npm run analyze`; `.xenodot.json` analysis config block + probe;
report writer (frontmatter: task, worker, provider/model, bundle sha256, window).
Fake-HTTP-server tests incl. timeout/non-200/unconfigured. Graceful absence verbatim.

## Phase 3 — skill + seat proof (subagent: Opus)

`twin-analyze` SKILL.md; live seat validation (record house-sim window → bundle →
`summarize-window` via a non-Anthropic worker → report committed as worked example);
SEAMS protect-list += `tools/analyze/` + `skills/twin-analyze/`; CAPABILITIES;
roadmap tick. AC4 route per machine facts above.

## Orchestrator gates

1. Line-by-line diff review per phase.
2. Independent scoped review before merge (guardrails 1–5 explicitly).
3. Seat/UI proof appropriate to the item (CLI run from the seat; report content
   honesty check — no simulation claims, numbers traceable to stats block).
4. Acceptance criteria 1–6.
5. Merge no-ff to main, push, log — then next index item.

## Status log

- [x] Phase 1 done + reviewed — `5aaa617` (stats.js 203L pure/no-I/O + bundle.js 506L
      CLI + 438L tests) + `9d87e1a` (contract docs: bundle-schema.md, report-format.md).
      Determinism proven (double-run sha equal, golden pinned), exactness via hand +
      seeded-oracle fixtures, budget fail-with-override (102400B, --allow-oversize loud),
      materialization free-ride confirmed (copyTreeAddOnly, 0 collisions). 154 tests
      green. Decisions accepted: population stddev (documented), sorted arrays over
      object maps (V8 key-order safety), endpoint-preserving stride, header-limit
      fallback for range crossings (documented clamp caveat), --allow-oversize parsed
      before sim parseArgs (pairing quirk).
- [x] Phase 2 done + reviewed — `390f7c6` (bridge extraction: runs-API primitives
      moved verbatim from hermes-tool.js into dependency-free hermes-runs.js +
      runToCompletion; tool re-imports, behavior unchanged, 6 tests green) + `8031b36`
      (adapter interface/registry, openai-compatible + hermes workers, 3 task templates
      with honesty rules, report writer, analyze CLI + analysis:check probe, 3 test
      files). 180/180 tests. Real bug found + fixed in passing: PROJECT_DIR argv scan
      would misread --task value as project path → reports scattered; CLI now resolves
      root without argv scan. Guardrails asserted in tests (no fs/child_process in
      adapters; reports only under reports/analysis/; frontmatter attribution complete).
      AC4 status: no local endpoint on machine (no ollama, :11434 dead, gateway :8642
      down) — Phase 3 may start the user's own configured Hermes gateway for ONE run,
      else flag blocked-on-user.
- [x] Phase 3 done (subagent) — `twin-analyze` SKILL.md (operator manual, three-task menu,
      config quickstart, graceful-absence, the five guardrails verbatim, pointers to the two
      references). Frontmatter decision: `agents: [orchestrator]` NOT a builder agent — analysis is
      an operator-dispatched advisory seam (`npm run analyze`), a different sphere from build+verify
      (the human's division of labor) and the Hermes precedent (orchestrator-gated, not builder-owned);
      twin skills tagging `orchestrator` feed the viewer main-session floor at runtime
      (getPluginOrchestratorSkills, skills.js:159) with no constant to cross-check, and it keeps
      data-binder under the 10-skill split cap. SEAMS protect-list += `tools/analyze` +
      `skills/twin-analyze` (belt-and-suspenders like twin-build); CAPABILITIES `analyze/bundle.js`
      entry; roadmap #5 + index ticked. **AC4 route: Hermes gateway (real non-Anthropic).** No local
      endpoint (no ollama, :11434 dead); gateway :8642 was DOWN (stale pid) — started the user's own
      configured Hermes by `hermes gateway`, free `GET /v1/models` probe confirmed the key, ONE billable
      `summarize-window` run (first attempt) to Nous Portal `z-ai/glm-5.2` (frontmatter label
      `nousresearch/hermes-4-70b` — the documented "label only" caveat). Gateway STOPPED afterward to
      restore the found (down) state. Seat proof: window (synth seed 42, 18 000 frames, sha `faafb630…`)
      → 87 605-byte bundle (byte-identical on re-pack, AC1), report cites stats-block numbers, names the
      bound IFC element per tag, flags seed:42 synthetic (no simulation claim). AC5: all five guardrails
      demonstrated. `npm run validate` + `npm test` (180/180 + 15 reducer + 8 skills) green; prettier
      clean; check:skills 16+8 in sync. Worked example committed:
      `plugin-twin/skills/twin-analyze/references/example-report.md` (canonical) + seat
      `house/reports/analysis/2026-07-10-summarize-window.md`; finding `twin-analyze-2026-07-10.md`.
      Known limit carried forward: Hermes-path model attribution echoes the config label (the runs-API
      reply has no model id), so it can drift from the gateway's real model — precise only for the
      openai-compatible adapter today.
- [x] Scoped review (independent Opus): merge-after-fixes → fixes landed in
      `35819e6` + `2265fc7` and verified: MEDIUM-1 /v1 double-append (OpenRouter/vLLM
      documented base form 404'd; adapter + probe now strip trailing /v1, tested incl.
      fake-server POST path), MEDIUM-2 YAML frontmatter injection via untrusted
      endpoint model string (worker/provider/model now JSON-encoded scalars, hostile
      string test), LOW-4 unknown --tags loud warning, LOW-5 latest-wins overwrite
      documented, NIT-6 size label unified. Accepted as-is: sha-of-utf8 provenance
      caveat, illustrative provider label. Adversarial passes all clean: stats edges,
      budget on final bytes, no timer leak, no apiKey leak, poll deadline, refactor
      drift-free, guardrails 1–5 code+test verified. 185 tests green.
- [x] Orchestrator honesty gate on the real report: synthetic seed disclosed, no
      simulation/causality claims, numbers traceable to stats block, measurement-method
      caveat unprompted. Worker typo ("42.54 W" for °C) left verbatim — worker body is
      verbatim by contract.
- [x] Acceptance criteria 1–6 met (AC4 with a REAL non-Anthropic run — Hermes
      gateway, one billable call, gateway restored to found-down state). Merged to main
      (no-ff), index + roadmap ticked. Item #5 CLOSED.
