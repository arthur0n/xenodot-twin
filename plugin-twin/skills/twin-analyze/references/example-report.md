# Worked example — a real `summarize-window` report

This is the canonical worked example the skill ships beside its two contracts
([`bundle-schema.md`](bundle-schema.md), [`report-format.md`](report-format.md)): a real analysis
report produced **end-to-end from the twin seat** (`twindemo/house`) by a **NON-Anthropic model** —
the point of Nice-to-Have #5. It is reproduced here **verbatim, unedited** so a reader can see a
worker honor the honesty rules against a real bundle.

**How it was produced** (reproducible):

1. Record a deterministic window of the house sim — synth, `seed 42`, `hz 10`, 300 s:
   `node tools/sim/record.js --out window.ndjson --seconds 300 --seed 42 --hz 10 --map binding_map.json`
   → 18 000 frames, `sha256 faafb630…`.
2. Pack the bundle (data-in):
   `node tools/analyze/bundle.js --recording window.ndjson --map binding_map.json --sidecar models/duplex_props.json --out bundle.json`
   → **87 605 bytes** (under the ~100 KB budget), `sha256 77763f48…`.
3. Dispatch through the **Hermes** worker (its own provider + billing — a Nous Portal account, gateway
   model `z-ai/glm-5.2`; the frontmatter `model:` echoes the xenodot hermes-block label
   `nousresearch/hermes-4-70b`, the documented "label only" caveat — both non-Anthropic):
   `ANALYSIS_WORKER=hermes npm run analyze -- --task summarize-window --bundle bundle.json`.

The framework wrote the file below; the worker returned only the body. Note how it holds every honesty
rule: it cites only stats-block numbers, names the bound IFC element behind each tag, reports
`seq_gaps: 0` / `range_crossings: 0` from the bundle, flags `seed: 42` as a **reproducible synthetic
recording — not readings from a live plant** (no simulation claim), and proposes no action.

The measured seat run (determinism recheck, guardrail demonstrations, AC4 route): finding
[`twin-analyze-2026-07-10.md`](../../../library/findings/twin-analyze-2026-07-10.md).

---

```md
---
kind: twin-analysis-report
task: summarize-window
worker: hermes
provider: hermes
model: nousresearch/hermes-4-70b
bundle_sha256: 77763f48e1a251c2ab2d4b62d10ad48021a366e2f775ede535e7c0fe0bd96550
window: { from_ms: 0, to_ms: 299900 }
created_at: 2026-07-10T00:00:26.489Z
---

## Overview

This bundle summarizes a window of digital-twin telemetry from 0 ms to 299 900 ms (18 000 frames at 10 Hz) covering 6 tags. The recording header declares `seed: 42`, indicating a reproducible synthetic capture rather than a live one. Each tag carries 3 000 samples in the stats block, decimated to 200 points per tag in the series. The binding map maps every tag to an IFC building element, so all six telemetry streams have named physical referents.

## Per-tag summary

| Tag → bound element                                                                           | Count | Min    | Max      | Mean     | Stddev   |
| --------------------------------------------------------------------------------------------- | ----- | ------ | -------- | -------- | -------- |
| bedroom_1.temp → Basic Wall:Exterior - Brick on Block:143478 (IfcWallStandardCase, Level 2)   | 3 000 | 18.46  | 29.54    | 24.00    | 3.61     |
| boiler.temp → Basic Wall:Foundation - Concrete (437mm):140520 (IfcWallStandardCase, T/FDN)    | 3 000 | 41.63  | 78.44    | 60.03    | 12.04    |
| entrance_door.open → M_Single-Flush:1250mm x 2010mm (IfcDoor, Level 1)                        | 3 000 | 0.039  | 0.961    | 0.499    | 0.301    |
| kitchen.temp → Basic Wall:Exterior - Brick on Block:138310 (IfcWallStandardCase, Level 1)     | 3 000 | 18.46  | 29.54    | 24.00    | 3.62     |
| living_room.temp → Basic Wall:Exterior - Brick on Block:138157 (IfcWallStandardCase, Level 1) | 3 000 | 18.46  | 29.51    | 24.00    | 3.61     |
| solar.output_w → Basic Roof:Live Roof over Wood Joist Flat Roof:184483 (IfcSlab, no level)    | 3 000 | 193.33 | 4 809.43 | 2 498.27 | 1 507.93 |

The three room-temperature tags (bedroom_1, kitchen, living_room) share nearly identical distributions — same band (18–30 °C), means within 0.01 of each other, and stddevs around 3.6 — but their decimated series are phase-offset, each oscillating through the full range on a roughly 15-second cycle. The boiler tag spans 41.6–78.4 °C against a 40–80 limit band with a mean of 60.0. The entrance door oscillates between near-closed and near-open with a mean of 0.499. Solar output swings from 193 W to 4 809 W with a mean of 2 498 W.

## Notable movements

- Largest single-step delta: solar.output_w at 498.15 W — consistent with its wide range and fast oscillation visible in the series (e.g. 1947 W at t=3000 rising to 4704 W at t=6000).
- boiler.temp: max_step_delta of 3.98 °C, the second-largest — the series shows swings of ~35 °C within 15-second arcs (e.g. 42.54 W at t=12000 up to 76.32 at t=18000).
- The three room-temperature tags each show max_step_delta around 1.15–1.19 °C, markedly smaller than the boiler.
- entrance_door.open max_step_delta is 0.097, the smallest in absolute terms but large relative to its 0–1 range.
- seq_gaps: 0 across all six tags — no transport drops or missing samples in the window.
- range_crossings: 0 across all six tags — no sample left its declared limit band (min/max in the recording header). Note the boiler's observed min of 41.63 sits just above its 40 floor and its max of 78.44 sits just below its 80 ceiling, so it approaches but does not cross its limits.

## Caveats

- The series is decimated to 200 points per tag from 3 000 underlying samples; sub-sampling detail between consecutive decimated points is not visible. The max_step_delta values come from the full-resolution stats, not the decimated series.
- The bundle carries no causal or correlation information — the apparent phase relationships between boiler, solar, and room temperatures cannot be confirmed as linked from this data alone.
- The binding names are curated element labels (IfcWallStandardCase, IfcDoor, IfcSlab); the bundle does not state that these elements are themselves the sensors or that the tag semantics (temperature, open fraction, wattage) are directly measured on those elements. The binding identifies the physical referent, not the measurement method.
- `seed: 42` marks this as a reproducible synthetic recording; the values reflect the generator's behavior, not readings from a live plant.
```
