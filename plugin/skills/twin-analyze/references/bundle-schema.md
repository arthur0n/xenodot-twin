# Contract 1 — the analysis bundle (`twin-analysis-bundle`)

The **data-in** half of the analysis seam. `plugin/tools/analyze/bundle.js` packs a twin
recording (plus an optional binding map and property sidecar) into **one deterministic JSON
document** that a swappable worker — another model, or a human pasting into a chat UI — narrates.
The seam IS this contract; the worker is an adapter.

```
node tools/analyze/bundle.js --recording recordings/day.ndjson \
    [--map binding_map.json] [--sidecar models/duplex_props.json] \
    [--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] \
    [--allow-oversize] --out bundle.json
```

## Guarantees

- **Deterministic / byte-stable.** Same inputs + same flags ⇒ byte-identical bundle (equal
  sha256), exactly like a recording (`tools/sim/recording.js`). Key order is fixed by
  construction; every tag-keyed collection is a **sorted array** (never an object map, whose
  integer-like keys V8 may reorder); all numbers are plain IEEE-754 doubles.
- **Provenance-honest.** The bundle carries the sha256 + byte size of every input file. A report
  is only as honest as the bytes it saw.
- **Pure stats.** Every number in `stats` is a pure function of the windowed frames
  (`tools/analyze/stats.js`), unit-tested against seeded fixtures with exact expected values.
- **Size-budgeted.** A default bundle targets ≤ **102400 bytes** (`SIZE_BUDGET_BYTES`, ~100 KB) so
  it inlines into any provider's context. The budget is **enforced** (see below).

## Top-level shape (fixed key order)

| key                | type               | notes                                                         |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| `schema_version`   | int                | `1` (`SCHEMA_VERSION`). Bump only on a breaking shape change. |
| `kind`             | string             | `"twin-analysis-bundle"` (`BUNDLE_KIND`) — the discriminator. |
| `generated_by`     | string             | `"tools/analyze/bundle.js"` — stable producer id.             |
| `inputs`           | object             | provenance: `{ recording, map, sidecar }`.                    |
| `recording_header` | object             | the recording's header, passed through verbatim.              |
| `window`           | object             | the window actually analyzed.                                 |
| `points_per_tag`   | int                | decimation target (`--points-per-tag`, default `200`).        |
| `stats`            | array (sorted tag) | per-tag statistics.                                           |
| `series`           | array (sorted tag) | per-tag decimated `[t_ms, value]` series.                     |
| `bindings`         | array (sorted tag) | tag → GlobalId(s) → curated sidecar subset.                   |

### `inputs`

`{ recording, map, sidecar }`. Each slot is `{ name, bytes, sha256 }` or `null` (map/sidecar are
optional). `name` is the **basename** only — absolute paths would leak and hurt cross-machine
stability; the sha256 is the real identity.

### `recording_header`

`{ version, kind, hz, seed, tags }`, straight from the recording's line-1 header. `tags` is the
full source tag table `[{ tag, min, max }]` — passed through even when `--tags` narrows the
analysis, so the source stays fully described. `seed: -1` marks a live capture (not
re-synthesizable); `seed >= 0` is a reproducible synth.

### `window`

`{ from_ms, to_ms, frames }`. The bounds are the **resolved inclusive** window: a `--from-ms` /
`--to-ms` flag wins verbatim (preserved even when it selects nothing); otherwise each bound is the
first / last `t_ms` of the analyzed frames, or `null` when the window is empty. `frames` is the
count actually analyzed (after the window AND `--tags` filters).

### `stats[]` (one per analyzed tag, sorted by tag)

| field             | type                 | definition                                                                                                                                                         |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tag`             | string               |                                                                                                                                                                    |
| `count`           | int                  | frames for this tag in the window.                                                                                                                                 |
| `min` / `max`     | number               | value extremes.                                                                                                                                                    |
| `mean`            | number               | arithmetic mean.                                                                                                                                                   |
| `stddev`          | number               | **population** standard deviation (÷N). A single value ⇒ `0`.                                                                                                      |
| `first` / `last`  | `{ t_ms, value }`    | earliest / latest sample (frames are t_ms-ascending).                                                                                                              |
| `seq_gaps`        | int                  | missing sequence numbers: Σ max(0, Δseq − 1) over adjacent frames. Transport drops. `0` = none.                                                                    |
| `range`           | `{ min, max }`\|null | the limit band checked against (see precedence below), or `null` when none was available.                                                                          |
| `range_crossings` | int\|null            | boundary crossings vs `range`: adjacent samples whose in-range membership flips. Direction-agnostic (each entry OR exit = 1). `null` when no limit or < 2 samples. |
| `max_step_delta`  | number\|null         | largest absolute change between adjacent samples. `null` when < 2 samples.                                                                                         |

**Limit precedence** (for `range` / `range_crossings`): the **binding map's** `[min,max]` for the
tag (preferred) → else the recording header's tag-table `[min,max]` (finite only) → else `null`.
Note: a synth recording clamps values into the header range, so header-derived limits are never
crossed — a tighter map limit is what surfaces real excursions.

The in-range test is **inclusive**: a value exactly on `min` or `max` is IN.

### `series[]` (one per analyzed tag, sorted by tag)

`{ tag, points }` where `points` is `[[t_ms, value], …]`. Decimated by **endpoint-preserving
stride** (`stats.js decimate`): ≤ `points_per_tag` samples → all kept; otherwise `n` indices are
taken evenly across `[0, len−1]` via `floor(i·(len−1)/(n−1))`, so the **first and last** samples
always survive. Dumb and deterministic on purpose — no LTTB/area weighting.

### `bindings[]` (analyzed tags carrying GlobalIds, sorted by tag)

`{ tag, global_ids, elements }`. Present only when a `--map` supplies GlobalIds for the tag.

- `global_ids` — the tag's GlobalId(s) from the map (map order, deduped).
- `elements` — one curated entry per GlobalId **when a `--sidecar` is supplied** (else `[]`):
  `{ global_id, name, type, level }`.
  - `name` = sidecar entry `name`; `type` = sidecar entry `ifc_class`; both `null` when absent.
  - `level` = the first hit among `Level`, `Reference Level`, `Base Level`, `Base Constraint`
    (Revit conventions: hosted elements carry `Level`, walls carry `Base Constraint` e.g.
    `"Level 1"`), scanning psets in sorted name order; `null` when none.

## Size budget — enforced (fail-with-override)

The CLI serializes, then gates on `SIZE_BUDGET_BYTES`:

- **over budget, no override → hard fail**: nonzero exit, **no file written**, stderr names the
  overage and the levers (narrow the window, select `--tags`, lower `--points-per-tag`).
- **`--allow-oversize` → loud warning**, then writes anyway.

The pure `buildBundle()` never writes or exits — it returns `{ bundle, json, bytes }`; the CLI
wrapper owns the filesystem and the budget gate.

## Materialization

`tools/analyze/` rides the existing recursive tools copy into viewer projects
(`materializeTwinTools` → `copyTreeAddOnly`) — no per-file registration. Dependency-free, runs
under bare `node`.
