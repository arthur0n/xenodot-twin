# Analyze a run — the analysis seam, both directions

The twin has a **seam where other models plug in** — one door, two directions of traffic. This
walkthrough drives both, by hand, on a real recording, and pastes every output:

1. **Data out → a report.** Pack a recording into one deterministic **analysis bundle**
   (`tools/analyze/bundle.js`), read its **stats**, and hand it to a swappable worker
   (`npm run analyze`) that narrates a window back as an advisory Markdown report. The bundle is
   the product; the worker is optional.
2. **Predictions in → painted pixels.** A **forecast producer** (`tools/sim/forecast.js`)
   publishes model _projections_ on the wire in the twin's ordinary tag shape, and the
   **unmodified** viewer paints them. Model-outputs-as-tags is how _any_ ML/AI output enters the
   twin with **zero core change**.

These are the same idea from two sides: the twin's boundary is a **door, not a wall**. Analysis
reads a recording; a producer writes the live stream. Neither touches the shipped runtime.

> **What this demo is — read this first.** Part 1 is a **data + tooling** showcase: a deterministic
> bundle and honest per-tag statistics, plus the _dispatch surface_ that would hand them to another
> model. It is **not** an LLM demo — narrating the bundle needs a configured worker (an
> OpenAI-compatible endpoint or Hermes), and this tutorial does **not** fake a model call. It runs
> the dispatch up to the honest boundary and shows you exactly where a key goes. Part 2 is an
> **extensibility** showcase: it proves the DataBus seam is origin-agnostic. The forecaster's
> arithmetic is a dumb least-squares projection on purpose — the point is _where the value comes
> from is invisible to the viewer_, not that the forecast is clever.

> **Every command and number below was actually run** on one machine (macOS 26.5, Apple M3 Pro /
> Metal, Godot 4.6.3.stable, Node 22.21, `uv` 0.9.7, `ifcopenshell` 0.8.5). The recording sha256,
> the bundle sha256, the stats, and the frame counts are copy-pasted from that session. The
> geometry- and seed-independent numbers (the two sha256s, the per-tag stats, 6/6 tags) reproduce
> **exactly** on any machine because the recording and the bundle are deterministic; wall-clock
> timings are this machine's.

The produced artifacts are committed beside this file under
[`artifacts/analyze/`](artifacts/analyze/) — you can inspect the exact bundle and captures this
run wrote.

---

## Prerequisites

- **Node 18+** (22 here) — Part 1's recording/bundle/stats and Part 2's producer are all
  **dependency-free `node`** (the materialized `tools/` ships no `package.json` on purpose), so
  they run straight from a framework clone with nothing installed.
- **The framework clone**, green out of the box:
  ```bash
  npm install && npm run validate && npm test
  ```
- **Optional — a scaffolded viewer seat** (`npm run new -- <path>`) — needed only to (a) enrich the
  bundle with element _names/levels_ from an IFC property sidecar, and (b) give `npm run analyze` a
  configured project to write its report into. Part 1's core path needs neither.
- **Optional — Godot 4.x + `uv`/Python 3.12** — only for the IFC sidecar and the viewer-paint leg
  of Part 2.

All commands below run from inside the framework clone unless noted. Prefix shell commands with
`rtk` as usual; the bare-`node` and `npm run` lines pass through unfiltered.

---

# Part 1 — recording → bundle → stats → (dispatch)

The seam here is **two contracts, not a worker**: a deterministic **bundle in**, an advisory
**report out**. Everything up to the report is pure and reproducible; the worker is a swappable
adapter you point at whatever model you like (or a human pasting the bundle into any chat UI).

```
recording.ndjson ─┐
binding_map.json ─┼─▶ bundle.js ─▶ bundle.json ─▶ [worker: other model] ─▶ framework writes ─▶
duplex_props.json ┘   (data-in)     ≤ ~100 KB       narration only            reports/analysis/…
```

## Step 1 — record a deterministic fixture

The data source is the seeded WebSocket sim, but for analysis you don't need a live socket:
`record.js` in **fixture mode** synthesizes the exact stream the sim would send — no network,
byte-reproducible per `(seed, seconds, hz)`. Record a 60-second house-day off the bundled example
binding map:

```bash
mkdir -p docs/tutorials/artifacts/analyze
node plugin/tools/sim/record.js \
  --out docs/tutorials/artifacts/analyze/house-day.ndjson \
  --seconds 60 --map plugin/examples/binding_map.example.json
```

Actual output:

```
record: wrote docs/tutorials/artifacts/analyze/house-day.ndjson — frames=3600 duration_ms=59900 tags=6 sha256=361bc6e93c2bb799d2b7ba0f2ece06347cbec2b25fa1ed0111b9315185824586
```

That `sha256=361bc6e…` is the **same hash the house tutorial records** — the fixture is
deterministic, so a stranger reproduces this recording bit-for-bit. The file is the committed
artifact [`artifacts/analyze/house-day.ndjson`](artifacts/analyze/house-day.ndjson): line 1 is the
header (tag table + `min`/`max`), the next 3600 lines are `{t_ms,tag,value,seq}` frames.

## Step 2 — pack the analysis bundle

`bundle.js` reads the recording (+ the binding map, + an optional property sidecar) and emits **one
deterministic JSON document**: a provenance header (sha256 of every input), the recording header,
the analyzed window, per-tag **stats**, a stride-decimated **series** per tag, and **bindings** that
tie each tag to its GlobalId. Same inputs + same flags ⇒ **byte-identical** output.

```bash
node plugin/tools/analyze/bundle.js \
  --recording docs/tutorials/artifacts/analyze/house-day.ndjson \
  --map plugin/examples/binding_map.example.json \
  --out docs/tutorials/artifacts/analyze/house-day.bundle.json
```

```
bundle: wrote docs/tutorials/artifacts/analyze/house-day.bundle.json — bytes=85220 tags=6 frames=3600 sha256=8c3abe0027b2585e9078852545f632e32c88c02ccae77f38e5c3713e9f9d51eb
```

**Determinism, proven.** Run it a second time to a scratch path and hash both:

```bash
node plugin/tools/analyze/bundle.js --recording …/house-day.ndjson \
  --map plugin/examples/binding_map.example.json --out /tmp/rerun.bundle.json
shasum -a256 docs/tutorials/artifacts/analyze/house-day.bundle.json /tmp/rerun.bundle.json
```

```
8c3abe0027b2585e9078852545f632e32c88c02ccae77f38e5c3713e9f9d51eb  …/house-day.bundle.json
8c3abe0027b2585e9078852545f632e32c88c02ccae77f38e5c3713e9f9d51eb  /tmp/rerun.bundle.json
```

Identical bytes. Key order is fixed by construction, tag-keyed collections are sorted arrays (never
object maps V8 might reorder), and every number is a plain double — so the bundle is a stable
provenance record, not a snapshot that drifts between runs.

**The size budget is enforced.** A default bundle targets ≤ ~100 KB (`SIZE_BUDGET_BYTES`) so it
inlines into any provider's context. Over budget, the CLI **fails loudly** (nonzero, no file
written) and names the levers — narrow the window (`--from-ms/--to-ms`), select `--tags`, or lower
`--points-per-tag` — unless you pass `--allow-oversize` (a loud warning). Here 85220 bytes < budget,
so it wrote cleanly.

## Step 3 — read the stats (the real numbers)

The stats block is the analytic payload — a **pure function** of the frames (`tools/analyze/stats.js`,
unit-tested against exact expected values). Pull it out of the bundle:

```bash
node -e 'const b=require("./docs/tutorials/artifacts/analyze/house-day.bundle.json");
for(const s of b.stats)console.log(`${s.tag} n=${s.count} min=${s.min.toFixed(2)} max=${s.max.toFixed(2)} mean=${s.mean.toFixed(3)} stddev=${s.stddev.toFixed(3)} crossings=${s.range_crossings} maxStep=${s.max_step_delta.toFixed(3)} gaps=${s.seq_gaps}`)'
```

Actual output (window `[0, 59900] ms`, 3600 frames, 6 tags, 600 frames each):

```
bedroom_1.temp     n=600 min=18.48 max=29.49 mean=24.022 stddev=3.607 crossings=0 maxStep=1.150 gaps=0
boiler.temp        n=600 min=41.86 max=78.24 mean=60.049 stddev=12.035 crossings=0 maxStep=3.736 gaps=0
entrance_door.open n=600 min=0.05  max=0.96  mean=0.500  stddev=0.302  crossings=0 maxStep=0.089 gaps=0
kitchen.temp       n=600 min=18.51 max=29.52 mean=23.998 stddev=3.610 crossings=0 maxStep=1.110 gaps=0
living_room.temp   n=600 min=18.46 max=29.51 mean=23.999 stddev=3.606 crossings=0 maxStep=1.130 gaps=0
solar.output_w     n=600 min=194.79 max=4784.62 mean=2499.505 stddev=1507.294 crossings=0 maxStep=480.699 gaps=0
```

Every column is a deterministic statistic over the analyzed window:

- **`count / min / max / mean / stddev`** — the shape of each tag. `stddev` is the **population**
  standard deviation (÷N), so a single sample would read 0.
- **`range_crossings`** — how often the value crossed its `[min,max]` limit band (from the binding
  map). `0` everywhere here: the sim keeps each tag inside its declared range, so nothing excursed.
- **`max_step_delta`** — the largest jump between adjacent samples (`solar.output_w` swings hardest
  at 480.7 W/tick; `entrance_door.open` barely moves at 0.089).
- **`seq_gaps`** — dropped ticks (missing sequence numbers). `0` everywhere: a synthesized fixture
  never drops. On a **live** capture this is your transport-health number.

## Step 4 — name the elements (enrich with a sidecar)

The bundle above binds tags to raw GlobalIds. A narration that says _"the boiler wall on the
foundation level"_ instead of _"tag boiler.temp"_ needs the IFC **property sidecar** — keyed by the
same GlobalId. Generate it once from the sample IFC in a scaffolded seat (this is the only step that
needs Python/ifcopenshell), then rebuild the bundle with `--sidecar`:

```bash
# in a scaffolded viewer seat (npm run new -- <seat>):
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5
.venv-ifc/bin/python tools/ifc_convert.py Duplex_A_20110907.ifc \
  --glb models/duplex.glb --sidecar models/duplex_props.json
# → sidecar: models/duplex_props.json — 295 elements in 0.1s

# back in the framework clone, rebuild with the sidecar:
node plugin/tools/analyze/bundle.js \
  --recording docs/tutorials/artifacts/analyze/house-day.ndjson \
  --map plugin/examples/binding_map.example.json \
  --sidecar <seat>/models/duplex_props.json \
  --out docs/tutorials/artifacts/analyze/house-day.bundle.json
```

```
bundle: wrote …/house-day.bundle.json — bytes=86623 tags=6 frames=3600 sha256=e4d33b392a5d9613ad3c219df4a0f7497ac9bca831c388d64ed5dea134788a1b
```

The committed artifact is this enriched bundle (sha256 `e4d33b39…`). Its `bindings` now carry curated
element context — name, IFC type, and level:

```bash
node -e 'const b=require("./docs/tutorials/artifacts/analyze/house-day.bundle.json");
for(const x of b.bindings)console.log(x.tag,"->",x.elements[0].type,"|",x.elements[0].name,"| level",x.elements[0].level)'
```

```
bedroom_1.temp     -> IfcWallStandardCase | Basic Wall:Exterior - Brick on Block:143478      | level Level 2
boiler.temp        -> IfcWallStandardCase | Basic Wall:Foundation - Concrete (417mm):140520  | level T/FDN
entrance_door.open -> IfcDoor             | M_Single-Flush:1250mm x 2010mm:…:146596          | level Level 1
kitchen.temp       -> IfcWallStandardCase | Basic Wall:Exterior - Brick on Block:138310      | level Level 1
living_room.temp   -> IfcWallStandardCase | Basic Wall:Exterior - Brick on Block:138157      | level Level 1
solar.output_w     -> IfcSlab             | Basic Roof:Live Roof over Wood Joist Flat Roof…   | level null
```

Now a worker can say _"the boiler is bound to the concrete foundation wall (T/FDN)"_ — element
language, sourced from the bundle, not invented.

## Step 5 — where multi-model analysis dispatches (the honest boundary)

`npm run analyze` is the dispatch surface: it wraps a reviewed task template around the bundle, hands
the composed prompt to the **configured worker**, and the **framework** (never the worker) writes the
returned narration to `reports/analysis/<date>-<task>.md`. Three tasks: `summarize-window`,
`narrate-anomalies`, `inspection-report`.

**Probe first — no charge, no model run.** `npm run analysis:check` confirms the worker is configured
and the endpoint answers (`GET /v1/models`). On a fresh clone with **no worker configured**:

```bash
GAME_DIR=<seat> npm run analysis:check ; echo "exit=$?"
```

```
✗ analysis worker 'openai-compatible' not configured — analysis.apiUrl is not set — point it at an
OpenAI-compatible endpoint (OpenRouter, Ollama, vLLM, …) in .xenodot.json `analysis` block or the
ANALYSIS_API_URL env var.
exit=1
```

And the dispatch itself, unconfigured, is a **graceful no-op** — a clear message pointing at setup,
exit 1, **no half-written report** (guardrail 3):

```bash
GAME_DIR=<seat> npm run analyze -- --task summarize-window \
  --bundle docs/tutorials/artifacts/analyze/house-day.bundle.json ; echo "exit=$?"
```

```
analyze: worker 'openai-compatible' is not configured — analysis.apiUrl is not set — point it at an
OpenAI-compatible endpoint (OpenRouter, Ollama, vLLM, …) in .xenodot.json `analysis` block or the
ANALYSIS_API_URL env var.
No report was written. Configure the worker (see above), then re-run.
exit=1
```

**This is the boundary, stated honestly.** Everything up to here — record, bundle, stats, sidecar —
ran for real and is committed. The **model narration does not**, because it requires _your_ endpoint
and key. To cross the boundary, add one block to `.xenodot.json` (gitignored — the key lives only
here or in env):

```json
{
  "analysis": {
    "worker": "openai-compatible",
    "apiUrl": "https://openrouter.ai/api",
    "apiKey": "sk-…",
    "model": "meta-llama/llama-3.1-70b-instruct"
  }
}
```

`apiUrl` covers OpenRouter, local llama.cpp/Ollama/vLLM, and most hosted "other models"; a bare local
endpoint (`http://localhost:11434`) needs no key. Env overrides mirror Hermes:
`ANALYSIS_WORKER/_API_URL/_API_KEY/_MODEL`. Re-run `analyze` and the framework writes
`reports/analysis/<date>-summarize-window.md` with provenance frontmatter (task, worker,
provider/model, **bundle sha256**, window) wrapped around the worker's body.

Why the seam is drawn here: **Claude Code stays the build-and-verify system; other models plug in for
analysis, advisory-only.** A report proposes nothing that acts, names its provider+model and bundle
hash, and lands only under `reports/analysis/`. The full operator manual is the
[`twin-analyze`](../../plugin/skills/twin-analyze/SKILL.md) skill.

---

# Part 2 — a forecast producer paints through the unmodified seam

Part 1 read a recording. Part 2 writes the **live** stream — and proves the more surprising half of
the door: a producer of **predictions** is just a third thing behind the same `url=`. The viewer
does not know or care where a value came from.

`tools/sim/forecast.js` publishes the **identical wire shape** as the sim (`{tag,value,seq,sent_ms}`,
same RFC 6455 framing via the shared `protocol.js`/`stream.js`), but each value is a **least-squares
linear projection** extrapolated a fixed horizon _past_ a short seed window — a forecast, computed
**in the producer**, not the framework. `--map` derives the tag list + each tag's `[min,max]` from
the binding map, so a forecaster and its bindings can never drift.

## Step 1 — run the producer

```bash
node plugin/tools/sim/forecast.js \
  --map plugin/examples/binding_map.example.json \
  --port 8766 --seed 42 --window 20 --horizon 30 \
  --stats docs/tutorials/artifacts/analyze/forecast-stats.json
```

Boot line (actual):

```
forecast: PREDICTED-value tag source on ws://localhost:8766 — seed=42 hz=10 window=20 horizon=30 tags=6 (from plugin/examples/binding_map.example.json) — values are PROJECTED, not live; the twin only visualizes them.
```

The producer _declares its own nature_ on boot — projected, not live. `--window 20` fits the trend
over the last 20 ticks (2 s at 10 Hz); `--horizon 30` projects 30 ticks (3 s) ahead; each value is
clamped to its tag's `[min,max]`.

## Step 2 — prove the frames traverse the unmodified consumer seam (headless)

The strongest reproducible proof that _model outputs enter the twin as ordinary tags_ is to consume
the producer with the **same RFC 6455 client path the viewer uses** — `record.js` in **live mode**,
a real masked-frame WebSocket client — and confirm it reads the forecast stream as an ordinary
recording:

```bash
node plugin/tools/sim/record.js \
  --out docs/tutorials/artifacts/analyze/forecast-capture.ndjson \
  --url ws://localhost:8766 --seconds 4
```

Actual output:

```
record: connected to ws://localhost:8766 — recording for 4s
record: observed cadence 9.906 Hz → header hz=10
record: wrote …/forecast-capture.ndjson — frames=240 duration_ms=3937 tags=6 sha256=b827929044889a02dbd0fba8dff947ff4fa95ffc168a991f80c70301e95d243d
```

240 frames, **6/6 tags**, observed cadence snapped to 10 Hz — the consumer read the forecaster
exactly as it reads the sim. The captured frames are projections: e.g. `living_room.temp` pins at
its ceiling (`value:30`, clamped) while the fit trends up, and the derived header shows tags whose
projected range never fills `[min,max]` (`bedroom_1.temp` max `20.44`, not `30`) — a forecast, not
the sim's own signal. The committed capture is
[`artifacts/analyze/forecast-capture.ndjson`](artifacts/analyze/forecast-capture.ndjson); the
producer's own tally is [`forecast-stats.json`](artifacts/analyze/forecast-stats.json)
(`kind:"forecast"`, 54 frames sent per tag over the capture).

## Step 3 — zero core change

The claim is **model-outputs-as-tags = zero core change**, and it is structural, not aspirational:

- `forecast.js` imports **only** `node:http`, `node:fs`, and the shared `sim/stream.js` +
  `sim/protocol.js`. It references **no** runtime `.gd` file. It is a new producer, purely additive.
- The viewer's seam is `core/data_bus.gd` (the WebSocket client) + `core/binding_map.gd` (tag →
  GlobalId → response). Pointing the viewer at the forecaster is a **one-field** change —
  `viewer.cfg`'s `[viewer] url=` (or the `TWIN_SOURCE_URL` env / `twin.sourceUrl`) — the _same_ seam
  the sim, a recording, and the MQTT bridge already use. **No shipped runtime file is edited.**

That is why _"visualization, not simulation"_ is a **stated choice**, not an architectural limit: the
twin paints whatever a producer publishes, and a producer of predictions is a third source behind one
door. An origin-agnostic viewer cannot distinguish a forecast from a live reading — and does not need
to.

## Step 4 — the viewer paints it, and one honest toolchain boundary

The pixel-level proof — the real viewer resolving all 6 bindings against the forecaster and driving
`material_override.albedo_color` off white — is the headless `tools/smoke_binding.gd` bind-smoke,
pointed at the running producer:

```bash
$GODOT --headless --path . --script tools/smoke_binding.gd -- \
  --map=binding_map.json --url=ws://localhost:8766 --seconds 3 --json=/tmp/bindsmoke.json
```

**On this machine that leg is blocked by toolchain drift, and this tutorial says so rather than
faking it.** Under Godot 4.6.3.stable, `smoke_binding.gd`'s `(get_script() as Resource)` /
`(parsed as Dictionary)` casts trip the project's strict-mode escalation
(`gdscript/warnings/unsafe_cast=2`, `unsafe_call_argument=2` in `project.godot`), and the script
**fails to load** before it can run:

```
SCRIPT ERROR: Parse Error: Casting "Variant" to "Resource" is unsafe. (Warning treated as error.)
          at: GDScript::reload (res://tools/smoke_binding.gd:102)
ERROR: Failed to load script "res://tools/smoke_binding.gd" with error "Parse error".
```

The rest of the Godot toolchain is fine here — `tools/check_twin_join.gd` runs clean on the same seat
(`JOIN: 286/286 (100.0%)`, exit 0) — so this is **localized drift in `smoke_binding.gd`'s casts under
this Godot build**, not a broken viewer. Loosening the project's warning config to route around it
would violate the standing rule that lint only ever _tightens_, so it is left as an honest boundary.

The viewer-paint _has_ been proven on a passing toolchain: finding
[`twin-extensibility-spine-2026-07-10`](../../plugin/library/findings/twin-extensibility-spine-2026-07-10.md)
records the unmodified Schependomlaan viewer painting the forecaster through the same `url=` —
bindings 6/6, HUD `facade_roof.temp=23.049` matching the producer's projection at seq 56 and sweeping
to 14.163 by seq 63, with `git diff` on `core/data_bus.gd` + `core/binding_map.gd` **empty**. The
headless wire-capture in Step 2 reproduces the _seam-traversal_ half of that proof here and now; the
finding carries the pixel half.

---

## Artifacts this run produced

All committed under [`artifacts/analyze/`](artifacts/analyze/):

| File                      | What it is                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `house-day.ndjson`        | The deterministic 60 s / 3600-frame recording (sha256 `361bc6e…`).                                  |
| `house-day.bundle.json`   | The sidecar-enriched analysis bundle (sha256 `e4d33b39…`, 6 tags, stats + series + named bindings). |
| `forecast-capture.ndjson` | 240 frames of the forecast producer's stream, captured through the unmodified consumer seam.        |
| `forecast-stats.json`     | The producer's own send tally (`kind:"forecast"`, seed 42, window 20, horizon 30).                  |

## Where to go next

- The operator manual for Part 1: the [`twin-analyze`](../../plugin/skills/twin-analyze/SKILL.md)
  skill (task menu, worker config, the five guardrails).
- The bundle shape + determinism guarantees:
  [`references/bundle-schema.md`](../../plugin/skills/twin-analyze/references/bundle-schema.md).
- The pipeline this analysis reads from: the [house tutorial](digital-twin.md) (record → bind →
  verify) and its [plant sibling](plant-twin.md).
