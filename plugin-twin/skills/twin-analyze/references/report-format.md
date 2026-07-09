# Contract 2 — the analysis report (`twin-analysis-report`)

The **report-out** half of the analysis seam. A report is Markdown with a machine-readable
frontmatter block, **written by the framework — never by the worker directly** — to
`reports/analysis/<date>-<task>.md` in the project.

> **Status:** this document is the CONTRACT. The report-writer code (frontmatter assembly + the
> `reports/analysis/` write) ships in Phase 2 alongside the worker adapters and `npm run analyze`.
> Phase 1 pins the shape so the packager, the workers, and the writer agree.

## Why the framework writes it, not the worker

A worker (another model, or a human) produces only the **body narration**. The framework wraps it
with provenance and drops it in the advisory folder. This keeps the seam swappable and enforces the
honesty guarantees below regardless of which worker ran — the same sphere-separation as Hermes.

## Frontmatter (required fields)

```yaml
---
kind: twin-analysis-report
task: summarize-window # one of: narrate-anomalies | summarize-window | inspection-report
worker: openai-compatible # the adapter id that ran
provider: openrouter # provider/endpoint string
model: <model-id> # the EXACT model string that wrote the body — always named
bundle_sha256: <hex> # the bundle's own sha256 — ties the words to the exact bytes analyzed
window: { from_ms: A, to_ms: B } # copied from the bundle's window block
created_at: <ISO-8601>
---
```

**The model that wrote it is ALWAYS named** — multi-model honesty is the whole point of the item.
`bundle_sha256` is the bundle document's hash, so any reader can re-derive it from the bytes and
confirm the report describes that exact bundle (whose own `inputs` block in turn hashes the
recording/map/sidecar).

## Body — honesty rules (these go verbatim into every task prompt)

1. **Narrate the DATA, not a simulation.** Describe what the recording/stats SHOW
   (visualization, observation). Never claim the numbers come from a physics simulation, a
   solver, or a real sensor unless the bundle says so. It is telemetry being summarized, not a
   model being run.
2. **Every cited number must come from the bundle's `stats` block** (or `series` points). No
   invented figures, no arithmetic the bundle doesn't support. If a claim needs a number the
   bundle lacks, say the bundle doesn't carry it.
3. **Name elements from `bindings`, not raw tags,** when the binding context is present ("the pump
   on level 2", not "tag pump_1") — but only what the curated `name`/`type`/`level` actually say.
4. **No actions, no adoption.** The report proposes nothing that closes a loop on plant data; it
   is a reading, not an instruction.

## Advisory-only placement

- Reports land in **`reports/analysis/` and nowhere else**. Nothing in the framework auto-adopts,
  executes, or re-imports them.
- A report is **input for a human or a gated agent**, never an action — identical to the Hermes
  acceptance guarantees:
  1. analysis workers never write project files; the framework writes only `reports/analysis/`;
  2. output is advisory input, never an action;
  3. unconfigured worker → no-op with a clear message;
  4. every report names its provider + model and its bundle hash;
  5. no machine-access of any kind on any worker path.

## Task types (v1)

`narrate-anomalies`, `summarize-window`, `inspection-report`. Prompt templates are reviewable files
(Phase 3, `plugin-twin/skills/twin-analyze/tasks/*.md`); each states the role, embeds the honesty
rules above, defines the required report structure, and appends the bundle JSON verbatim.
