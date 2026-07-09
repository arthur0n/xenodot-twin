# Implementation plan — multi-model analysis seam (data-in / report-out)

Roadmap Nice-to-Have #5 (see `2026-07-09-roadmap-handoff.md`). Plan only. The human's
stated direction: Claude Code/Anthropic stays the build-and-verify system; OTHER models
plug in for **analysis** — narrating anomalies in a recording, summarizing a day of tag
history, drafting inspection reports from binding data. Advisory, swappable, gated.

## Precedents to generalize (verified in repo)

- **Hermes** (`ui/server/integrations/hermes/`, as-built record
  `docs/handoff/hermes-researcher-subagent-poc.md`): own provider, own billing,
  advisory-only, Hive-gated dispatch, graceful absence when unconfigured, findings
  re-enter as input to gated agents, machine-access toolsets off. The guarantees list
  there is the guardrail template.
- **Codex** (`ui/server/integrations/codex/`): second integration following the same
  convention — `integrations/<name>/{setup,check}.js`, config block in `.xenodot.json`,
  optional, on-demand.
- **Typed inputs already exist**: recording NDJSON contract encoded once in
  `plugin-twin/tools/sim/recording.js` (header + `{t_ms,tag,value,seq}` frames,
  byte-reproducible, `seed: -1` marks live captures); binding maps; property sidecars
  keyed by GlobalId. Clean machine-readable analysis fodder — this is why the seam is
  cheap to build well.

## The seam IS the two contracts, not any worker

Design principle (roadmap wording): data-in/report-out so the worker is swappable —
including "worker" = a human pasting the bundle into any chat UI. Providers are
adapters; the contracts are the product.

### Contract 1 — analysis bundle (data-in)

New deterministic packager: `plugin-twin/tools/analyze/bundle.js` (bare node,
dependency-free, materialized like the sim — same recursive-copy free ride).

```
node tools/analyze/bundle.js --recording recordings/day.ndjson \
    [--map binding_map.json] [--sidecar models/duplex_props.json] \
    [--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] --out bundle.json
```

One JSON doc:

- **Header**: schema version + `kind: "twin-analysis-bundle"`, sha256 of every input
  file (provenance — a report is only as honest as the bytes it saw), recording header
  passthrough (hz, seed, tag table), window actually used.
- **Per-tag stats** (pure, deterministic): count, min/max/mean/stddev, first/last
  value+t_ms, seq-gap count (transport drops), range-limit crossings vs the binding
  map's [min,max], largest single-step delta. Computed in a pure module
  (`tools/analyze/stats.js`) so it unit-tests against a SEEDED fixture with exact
  expected numbers — the sim's determinism does the test-oracle work for free.
- **Decimated series**: stride decimation to `--points-per-tag` (default named
  constant, ~200) — deterministic and dumb on purpose; LTTB or fancier downsampling
  only if a real narration proves stride loses the story. Values as `[t_ms, value]`
  pairs.
- **Binding context**: tag → GlobalId(s) → a curated sidecar property subset (name,
  type, level — the fields a narration would cite), so a worker can say "the pump on
  level 2", not "tag pump_1".

Size budget documented and enforced (target: default bundle ≤ ~100 KB so it inlines
into any provider's context, including Hermes' runs-API instruction string).

### Contract 2 — analysis report (report-out)

Markdown + machine frontmatter, written by the framework (never by the worker directly)
to `reports/analysis/<date>-<task>.md` in the project:

- Frontmatter: task type, worker id, provider/model string, bundle sha256, created-at,
  window. The model that wrote it is ALWAYS named — multi-model honesty.
- Body: the worker's narration/summary/draft.
- Standing wording rules apply and go in the task prompts: narrate the DATA
  (visualization/observation), never claim simulation or physics; numbers cited must
  come from the bundle's stats block.
- Advisory-only: reports land in `reports/analysis/` and nowhere else; nothing
  auto-adopts them (same sphere-separation as Hermes' guarantees).

### Task types (v1, three — the roadmap's own list)

Prompt templates as reviewable files (`plugin-twin/skills/twin-analyze/tasks/*.md`,
agent-authored data — the house two-layer pattern applied to prompts):
`narrate-anomalies`, `summarize-window`, `inspection-report`. Each template states the
role, the honesty rules, and the required report structure; the bundle JSON is appended
verbatim.

## Worker adapters (thin, swappable)

Interface (`ui/server/features/twin/analysis.js`):
`{ id, configured() → bool|reason, analyze({instructions}) → Promise<{output, model}> }`.

v1 ships two:

1. **`openai-compatible`** — POST `/v1/chat/completions` to any configured endpoint
   (`.xenodot.json` `analysis: { worker, apiUrl, apiKey?, model }`, env overrides
   mirroring the Hermes config pattern). This single adapter covers OpenRouter, local
   llama.cpp/Ollama, vLLM, and most hosted "other models" — it IS the multi-model
   answer, ~100 lines with a fake-server test.
2. **`hermes`** — reuse the existing runs-API bridge machinery (`createRun`/poll) with
   the analysis instructions; advisory loop and billing separation already proven.

Graceful absence contract (Hermes rule generalized): unconfigured → the CLI/tool says
so and points at setup; framework behavior otherwise unchanged.

Dispatch surface v1 is the **CLI**: `npm run analyze -- --task summarize-window
--bundle bundle.json` (or `--recording` to bundle inline). An `mcp__ui__analyze` MCP
tool (Hive-gated like `mcp__ui__hermes`) is the natural phase-2 surface once the CLI
path is proven — not v1, keeps the change set bounded.

## Guardrails (inherited verbatim from the Hermes acceptance list)

1. Analysis workers never write project files; the framework writes only
   `reports/analysis/`.
2. Output is advisory input for humans/gated agents, never an action.
3. Unconfigured → no-op with a clear message.
4. Every report names its provider+model and its bundle hash.
5. No machine-access of any kind on any worker path.

## Tests

- `stats.js`/decimation/windowing: pure-function tests against a synthesized seeded
  fixture (`record.js` synth path) — exact expected stats, no flake.
- Bundle packager: golden-file test (byte-stable JSON, key order fixed like
  recording.js does).
- Adapters: fake HTTP server (node http, in-process) asserting request shape + report
  assembly; error paths (timeout, non-200, unconfigured).
- No gate change: verify_twin.sh untouched (analysis is not a build gate). `npm test`
  owns this feature.

## Phasing

1. **Contracts + packager**: `tools/analyze/{bundle,stats}.js` + tests + the two
   contract docs (bundle schema, report format) inside the new skill's references.
2. **Workers + CLI**: adapter interface, `openai-compatible` + `hermes` adapters,
   `npm run analyze`, config block + `analysis:check`-style probe, report writer.
3. **Skill + seat proof**: `twin-analyze` SKILL.md (when to use, task menu, honesty
   rules, graceful-absence); live validation from `twindemo/`: record a window of the
   house sim, bundle it, run `summarize-window` through a local/other-provider model,
   commit the report as the example; findings note if bundle size or decimation needed
   tuning. SEAMS protect-list += `tools/analyze/`, `skills/twin-analyze/`; CAPABILITIES
   entry; roadmap tick.

## Acceptance criteria

1. Same recording + same flags → byte-identical bundle (hash-stable, like recordings).
2. Stats tests assert exact values from a seeded fixture.
3. `npm run analyze` with an unconfigured worker exits with the graceful-absence
   message; with the fake server it writes a report whose frontmatter carries task,
   worker, model, bundle hash.
4. One real end-to-end report from the seat committed as the worked example, produced
   by a NON-Anthropic model (that's the point of the item), clearly labeled.
5. All five guardrails demonstrably hold (test or manual check each).
6. SEAMS/CAPABILITIES/skill/roadmap updated in the same change set.

## Out of scope (named)

- Live/streaming analysis (bundle is windowed batch; streaming is a different seam).
- In-viewer display of reports (overlay/UI work — later, after reports prove useful).
- MCP dispatch surface (phase 2, after CLI proof).
- Auto-adoption of any worker suggestion; closed-loop actions on plant data.
- Anomaly DETECTION algorithms beyond the deterministic stats block — v1 narrates
  data + stats; fancier detection enters only as more pure functions in stats.js with
  the same exact-expectation tests.
- Simulation claims of any kind (standing honesty rule).
