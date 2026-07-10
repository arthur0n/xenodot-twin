---
type: finding
title: "twin-analyze — a real non-Anthropic report from the seat, bundle 87.6 KB, byte-stable"
description: "End-to-end seat validation of the multi-model analysis seam: a deterministic house-sim window (synth seed 42, 18 000 frames) packs to an 87 605-byte bundle (byte-identical on re-pack), dispatched through the Hermes worker to a NON-Anthropic model (Nous Portal gateway, z-ai/glm-5.2) which returned a faithful summarize-window report — cites only stats-block numbers, names the bound IFC element per tag, flags seed:42 as synthetic (no simulation claim), proposes no action. All five guardrails demonstrated; the report is the committed worked example."
timestamp: 2026-07-10T01:30:00+01:00
tags:
  [
    twin-analyze,
    analysis-seam,
    multi-model,
    hermes,
    non-anthropic,
    bundle,
    determinism,
    guardrails,
    advisory,
    seat-proof,
  ]
---

# twin-analyze — a real non-Anthropic report from the seat

End-to-end proof of the multi-model analysis seam (Nice-to-Have #5) from the twin seat
(`twindemo/house`): record → bundle (data-in) → dispatch to another model → advisory report
(report-out). The seam IS the two contracts; the worker is a swappable adapter. This run exercised
the **Hermes** adapter against a real, billable **non-Anthropic** gateway — the item's whole point.

## The run (reproducible)

| Step        | Command                                                                                                                         | Result                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **record**  | `node tools/sim/record.js --out window.ndjson --seconds 300 --seed 42 --hz 10 --map binding_map.json`                           | 18 000 frames, `sha256 faafb630…` (synth, reproducible per seed) |
| **bundle**  | `node tools/analyze/bundle.js --recording window.ndjson --map binding_map.json --sidecar models/duplex_props.json --out b.json` | **87 605 bytes** (< 102 400 budget), `sha256 77763f48…`          |
| **analyze** | `ANALYSIS_WORKER=hermes npm run analyze -- --task summarize-window --bundle b.json`                                             | wrote `reports/analysis/2026-07-10-summarize-window.md`          |

The report is committed as the worked example: seat copy in place at
`house/reports/analysis/2026-07-10-summarize-window.md`, canonical copy in the skill's references
(`plugin-twin/skills/twin-analyze/references/example-report.md`).

## AC1 — byte-stable bundle

Same recording file + same flags, packed twice → **byte-identical** (`cmp` clean, both
`sha256 77763f48…`). The only thing that changes the bundle sha is the input **basename** embedded in
the provenance `inputs` block (by design — `name` is the basename, the real identity is the sha256):
packing a differently-named copy of the same bytes shifted one byte and flipped the hash, which is
correct provenance behavior, not nondeterminism. The recording itself is byte-reproducible per seed
(`faafb630…` on both records), so the whole chain is reproducible from the seed + flags.

## AC4 — the non-Anthropic model (route + attribution honesty)

Route taken: **Hermes gateway**, one billable run, first attempt succeeded. On this machine no local
OpenAI-compatible endpoint existed (no Ollama, `:11434` dead) and the gateway `:8642` was **down**
(stale pid in `~/.hermes/gateway_state.json`); the user's own Hermes was started by the documented
mechanism (`hermes gateway`, config + Portal auth already present from item #3), a free
`GET /v1/models` probe confirmed the key, then exactly one `summarize-window` run was dispatched. The
gateway was **stopped afterward** to restore the found (down) state — no billable process left running.

Attribution nuance worth recording: the report frontmatter names `model: nousresearch/hermes-4-70b`,
which is the **xenodot hermes-block label** (`HERMES_DEFAULT_MODEL` — the `hermes` config block carries
no `model` field), while the gateway's configured inference model is **`z-ai/glm-5.2`** (Nous Portal).
Both are unambiguously non-Anthropic, so AC4 holds either way. The gap is the documented "the model
field is a label only" caveat (`HERMES.md`): the hermes worker echoes the config label because the
runs-API findings reply carries no model id — unlike the openai-compatible adapter, which reports the
endpoint's actual `body.model`. Not a defect to fix in this phase, but a known limit of Hermes-path
attribution: the label can drift from the gateway's real model.

## Report honesty (the content check)

The non-Anthropic worker held every standing rule with no framework post-editing:

- **Numbers trace to the bundle.** Every figure in the per-tag table (count 3 000, boiler min 41.63 /
  max 78.44 / mean 60.03 / stddev 12.04, solar max_step_delta 498.15, …) is a bundle `stats` value.
- **Named the element, not the tag.** "boiler.temp → Basic Wall:Foundation - Concrete … (T/FDN)",
  "solar.output_w → Basic Roof … (IfcSlab)" — drawn from the `bindings` curated subset.
- **No simulation claim.** It flagged `seed: 42` as "a reproducible synthetic recording; the values
  reflect the generator's behavior, not readings from a live plant."
- **Reported the transport truth.** `seq_gaps: 0` and `range_crossings: 0` across all six tags,
  correctly noting the boiler approaches but does not cross its 40–80 band.
- **Proposed no action.** Pure reading, a Caveats section on what the data cannot support.

Bundle-shape note: because the house `binding_map` limits equal the sim's header ranges (the sim
derives its ranges from the map), synth values clamp inside the band and `range_crossings` is 0 — a
tighter map limit than the header is what would surface excursions (see `bundle-schema.md`). Default
stride decimation (200/tag) preserved the story; no tuning needed. Bundle at 87.6 KB left comfortable
headroom under the ~100 KB budget with all six tags and the full sidecar binding context.

## AC5 — the five guardrails, each demonstrated

1. **Workers never write project files; framework writes only `reports/analysis/`.** `analysis.js`
   imports no `node:fs`/`node:child_process` (static test `analysis.test.js` "guardrail: … import no
   node:fs / node:child_process"); the report writer's only write is `path.join(projectDir,
...REPORTS_DIR_PARTS)` with a whitelisted task filename.
2. **Advisory, never an action.** The report lands under `reports/analysis/` and nothing reads it
   back; `analyze-cli` only writes the file (`analyze-cli.test.js` "report must land under
   reports/analysis/", "nothing under reports/analysis/" on the failure path).
3. **Unconfigured → clear no-op.** `npm run analyze` with an unset endpoint printed
   "worker 'openai-compatible' is not configured — analysis.apiUrl is not set … No report was written"
   and exited nonzero — no crash, no partial file.
4. **Every report names provider+model+bundle hash.** The produced frontmatter carries
   `worker: hermes`, `provider: hermes`, `model: nousresearch/hermes-4-70b`,
   `bundle_sha256: 77763f48…` (`analysis-report.test.js` asserts the provider/model/sha lines).
5. **No machine access on any worker path.** Same greppable guarantee as #1; the hermes adapter sends
   **no toolsets** on the run (only `{input, instructions}`), so the gateway's machine-access tools
   never enter the analysis path — verified by the same static test over `analysis.js` +
   `hermes-runs.js`.

## Bottom line

The seam works as designed against a real other-model provider: deterministic bundle in, honest
advisory report out, provider+model+hash named, all guardrails held, ~86 KB well inside budget. The
one thing to carry forward is the Hermes-path model-label attribution gap (above) — precise only for
the openai-compatible adapter today. One machine, M3 Pro; Nous Portal (z-ai/glm-5.2) this session.
