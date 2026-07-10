# tools/CAPABILITIES-twin.md — registered xenodot-twin tools

Materialize merges these into the project's `tools/` **alongside the base xenodot plugin's**
(`validate.sh`, `lib/checks.sh`, `verify_scene.gd`, …) — twin scripts compose the shared
`tools/lib/checks.sh` from the merged set; nothing from the base plugin is copied here.

## `twin_build.sh` — one command: IFC → verified, data-bound twin

```
tools/twin_build.sh <model.ifc> [--map binding_map.json] [--out-dir models/] \
    [--chunks auto|N] [--min-instances N] [--hints h.json] [--occluders] \
    [--vis-ranges] [--wire]
```

The deterministic driver that chains the four tools below into ONE gate: **preflight**
(engine + the `.venv-ifc`/ifcopenshell venv) → **import** (`ifc_convert.py`) → **optimize**
(`optimize_scene.gd`; registers the `class_name` globals with a one-off headless import when
a fresh project's class cache is missing them) → **verify** (`verify_twin.sh` pinned to the
built artifacts — join gate on the import, smoke + static floor on the optimized scene) →
**summary** with the artifact list and the exact boot command. Same discipline as
`verify_twin.sh`: loud stage labels, exit nonzero on the FIRST failure, a SKIP is never a
pass (no `--map` → the binding smoke SKIPs loudly and the summary names `twin-bind-data`).
Orchestrates ONLY — every number stays gate-backed; `--occluders` / `--vis-ranges` pass
through to the optimizer and NEVER default on. The venv is never auto-created (a missing
`.venv-ifc` FAILs loud with the two `uv` lines). `--wire` is the one opt-in that touches
user data — it points `viewer.cfg [viewer] model=` at the optimized scene (keeps a `.bak`).
Operator manual: skill `twin-build`. Measured one-command wall time (clean-stranger seat
run): `plugin-twin/library/findings/twin-build-2026-07-09.md`.

## `twin_ship.sh` — package the export-safe build + data as one deployable

```
tools/twin_ship.sh --preset <name> [--model <path>] [--map <path>] [--sidecar <path>] \
    [--recording <path>]... [--out dist/] [--zip] [--smoke|--no-smoke]
```

The last step of the twin journey: takes the export-safe viewer (`starter-viewer` phase 1)
and packages it WITH its data as a single, retargetable artifact. Five loud stages —
**preflight** (engine + preset lookup in `export_presets.cfg` + export templates for the
exact version + the macOS `import_etc2_astc` assertion + model/sidecar/map discovery
mirroring `verify_twin.sh`) → **export** (headless `--export-release`, delegating export
debugging to the base `xenodot:godot-export-builds`; asserts on ERROR lines + a non-empty
executable because exit codes lie) → **assemble** (the **data-beside-build** contract: the
model + sidecar + map + recordings go in a `data/` folder BESIDE the executable — inside
`.app/Contents/MacOS/` on macOS — never baked into the pck, which stays code + starter
scenes only; the shipped `viewer.cfg` `model=`/`binding_map=`/`recording=` are rewritten to
`data/`-relative paths via the `twin_build.sh --wire` ConfigFile idiom, comments preserved,
`url=` left for the site) → **smoke** (boots the exported binary `--quit-after=N`, asserts
`model loaded from data/`, `bindings resolved N/N`, playback, quit-after; default on iff the
preset platform matches the host — a cross-platform build SKIPs LOUDLY, never a fake pass) →
**zip** (deterministic: `find | LC_ALL=C sort` order + `zip -X`). Same discipline as
`twin_build.sh`/`verify_twin.sh`: loud labels, exit nonzero on the FIRST failure, a SKIP is
never a pass. The deploy value it unlocks: a site retargets `url=`/`model=` by editing the
shipped `viewer.cfg` — WITHOUT re-exporting (the data is read at runtime). Unsigned builds
(signing/notarization out of scope); the shipped `README.txt` states the Gatekeeper warning
honestly. Web builds do NOT ship here — they use the web-embed recipe (`tools/web/serve_coi.py`
and the Web presets). Operator manual: skill `twin-ship`. Measured seat artifact sizes + the
clean-stranger run: `plugin-twin/library/findings/twin-ship-2026-07-10.md`.

## `ifc_convert.py` — IFC → GLB + property sidecar

```
python tools/ifc_convert.py <model.ifc> [--glb out.glb] [--sidecar out.json]
```

Converts an IFC model to GLB with node names carrying the IFC GlobalIds
(`use-element-guids`), and writes a property sidecar JSON keyed by GlobalId
(`get_psets`, `json.dump default=str`). Validates the STEP header first — the guard
against dead sample URLs that download HTML.

Needs a **Python 3.12** venv with `ifcopenshell==0.8.5` (3.14 has no wheel) — setup in
skill `twin-import`. No engine needed.

## `optimize_scene.gd` — the scene optimizer

```
$GODOT --headless --path . --script tools/optimize_scene.gd -- \
    --in=<model.glb|scene.tscn> --out=<optimized.scn> --report=<report.json> \
    [--chunks=auto|N] [--target-per-chunk=32] [--min-instances=8] \
    [--hints=<hints.json>] [--occluders] [--occluder-min-volume=10.0] [--vis-ranges] \
    [--vis-small-diag=0.5] [--vis-medium-diag=2.0] [--vis-small-end=40] [--vis-medium-end=120]
```

Groups repeated meshes into region-chunked MultiMesh fields (auto-sized per group by
default), preserving the GlobalId join as `twin_globalids` metadata; applies hint-sidecar
directives (`no_instance` / `occluder` / `lod_end` / `tags` → persistent groups +
metadata); optional occluder and visibility-range passes. Emits a full report JSON.
The four `--vis-*` flags override the visibility-range size-class thresholds/distances
(each must be > 0, medium must exceed small, or it FAILs loud); the report echoes the
effective values so every run is self-describing. `--vis-ranges` is now benched — a
**scoped win** (big on many-unique-mesh scenes, no-op on single buildings / instanced
scenes; defaults kept, still opt-in): `plugin-twin/library/findings/twin-vis-range-recipe-2026-07-09.md`.
`--occluders` is likewise benched — a **scoped win** at street/interior on many-unique-mesh
scenes (unique-city street cpu −0.15 ms / −9%, objects −55..−73%, lossless) but net-negative on
single buildings and a no-op on instanced/aerial scenes; `--occluder-min-volume=` overrides the
10 m³ gate (> 0, else FAILs loud) — the measured sweet spot, kept, still opt-in:
`plugin-twin/library/findings/twin-occluder-recipe-2026-07-10.md`.
Helpers live in `tools/lib/twin_chunks.gd` (grid + emission) and `tools/lib/twin_hints.gd`
(hint contract). Recipe, measured numbers and knob guidance: skill `twin-optimize`.

## `verify_twin.sh` — the twin builder's gate

```
tools/verify_twin.sh [scene.tscn]
```

The shared static floor (`tools/lib/checks.sh`, same functions as `validate.sh`, labelled
`verify-twin:`), then the twin checks in order: GlobalId **join coverage**
(`check_twin_join.gd`, auto-discovered model/sidecar pair or `TWIN_MODEL`/`TWIN_SIDECAR`),
the seeded **data-binding smoke** (spawns `sim/server.js` on `TWIN_SIM_PORT`, always reaps
it), **playback determinism** (synthesizes a fixture, runs `check_playback.gd` twice,
gates the two hashes equal, cleans up), and the **frame-budget** bench (opt-in
`TWIN_BENCH=1`, needs a display). Every check SKIPs loudly when its prerequisites are
missing — a SKIP is not a pass.

Headless OK for everything except the frame budget; stops at the first failure; exit 0 =
OK. Gate contract: skill `twin-verify`.

## `check_twin_join.gd` — GlobalId join gate

```
$GODOT --headless --path . --script tools/check_twin_join.gd -- \
    --scene=<model.glb|scene.tscn> --sidecar=<props.json> [--min=0.95]
```

Joins the scene's candidate GlobalIds — named `MeshInstance3D` nodes **and**
`twin_globalids` metadata on optimized MultiMesh nodes — against the sidecar keys.
Prints `JOIN: <matched>/<total>` then `JOIN-GATE: OK|FAIL`, exit 0/1.

## `bench_scene.gd` — frames-drawn fps benchmark

```
$GODOT --path . -s tools/bench_scene.gd -- <scene.tscn> \
    [--vantage X,Y,Z:LX,LY,LZ] [--warmup 2] [--measure 8] [--out .xenodot/bench/x.json]
```

The only honest fps on macOS — process-loop fps lies when drawing suspends. Forces vsync
off + window always-on-top, warms up, measures, prints a `BENCH:` JSON row (fps,
frame_ms, cpu_ms/gpu_ms, draw calls, primitives) and optionally appends it to a file.

Requires a display: `--headless` prints `BENCH: SKIP` and exits 0. Methodology: skill
`twin-optimize`; the budget gate that consumes it: skill `twin-verify`.

## `sim/server.js` — seeded tag simulator

```
node tools/sim/server.js [--seed 42] [--port 8765] [--hz 10] \
    [--map binding_map.json] [--stats out.json]
```

The deterministic data-binding test fixture: a dependency-free RFC 6455 WebSocket server
(bare `node`, no npm install) publishing JSON tag frames `{tag,value,seq,sent_ms}` — the
DataBus wire shape — at a fixed rate. Values are a pure function of `(seed, tick, tag)`:
the same seed replays bit-for-bit. `--map` derives the tag list and each tag's
`[min,max]` from the binding map itself, so sim and bindings can never drift.

Shared internals — one source, no forks: `sim/stream.js` (the deterministic core),
`sim/protocol.js` (RFC 6455 framing, both directions), `sim/recording.js` (the NDJSON
recording contract). Fixture contract: skill `twin-bind-data`.

## `sim/record.js` — twin-stream recorder

```
# fixture mode (no network, byte-reproducible per seed — sha256 printed):
node tools/sim/record.js --out fixture.ndjson --seconds 30 [--seed 42] [--hz 10] [--map binding_map.json]

# live mode (records a running source):
node tools/sim/record.js --out capture.ndjson --url ws://localhost:8765 [--seconds 30]
```

Two modes, one NDJSON contract (`sim/recording.js`): a header line
`{version, kind:"twin-recording", hz, seed, tags[]}` then frames `{t_ms,tag,value,seq}`
ascending. **Fixture mode** synthesizes the exact stream the sim would send (same
`tagValue`, same tag table, `t_ms = tick·1000/hz`) — same seed+args yield a
byte-identical file, the foundation of the playback determinism gate. **Live mode**
connects as an RFC 6455 client (masked frames, validated Accept), stamps `t_ms` from the
first frame on a monotonic clock, derives header `hz` from the observed cadence, and
marks the file `seed:-1` — recorded, not synthesizable (its `seq` is also not zero-based;
playback keys on `t_ms`).

Bare `node`; no engine needed. Without `--seconds`, SIGINT flushes and summarizes.
Playback consumes these files (starter-viewer `core/recording.gd`). Contract: skill
`twin-playback`.

## `analyze/bundle.js` — analysis-bundle packager (Contract 1, data-in)

```
node tools/analyze/bundle.js --recording recordings/day.ndjson \
    [--map binding_map.json] [--sidecar models/duplex_props.json] \
    [--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] \
    [--allow-oversize] --out bundle.json
```

The **data-in** half of the multi-model analysis seam: packs a twin recording (plus an
optional binding map + property sidecar) into ONE deterministic JSON document
(`kind:"twin-analysis-bundle"`) that a swappable worker — another model, or a human
pasting into a chat UI — narrates. Same inputs + same flags ⇒ **byte-identical bundle**
(equal sha256, like a recording): fixed key order, every tag-keyed collection a sorted
array. Carries per-tag pure stats (count, min/max/mean/population-stddev, first/last,
seq-gaps, range-crossings vs the map/header limits, max-step-delta — computed in
`analyze/stats.js`, unit-tested against seeded fixtures with exact expected values),
endpoint-preserving stride-decimated `[t_ms,value]` series (default 200/tag), tag→GlobalId→
curated sidecar subset bindings, and the sha256 + byte size of every input file
(provenance). Size-budgeted to ≤ **102400 bytes** so it inlines into any provider's context;
over budget the CLI hard-FAILs (no file written) unless `--allow-oversize` (loud). Bare
`node`, dependency-free — rides the recursive tools copy into projects like the sim.

The **report-out** half and the dispatch surface are framework-side (not materialized): the
worker adapters + report writer live in `ui/server/features/twin/`, driven by
`npm run analyze -- --task <summarize-window|narrate-anomalies|inspection-report>
(--bundle b.json | --recording r.ndjson …)` — the framework writes the advisory report to
`reports/analysis/<date>-<task>.md`, naming its provider+model and the bundle hash; the
worker never writes a file. Probe a configured worker with `npm run analysis:check` (no
model run, no charge). Operator manual + config + the five guardrails: skill `twin-analyze`;
the two contracts: `plugin-twin/skills/twin-analyze/references/{bundle-schema,report-format}.md`.
Seat-proven worked example: `plugin-twin/library/findings/twin-analyze-2026-07-10.md`.

## `bridge/mqtt_ws.js` — MQTT → WebSocket bridge

```
node tools/bridge/mqtt_ws.js --broker mqtt://localhost:1883 --map mqtt_map.json \
    [--port 8766] [--user u --pass p] [--stats out.json]
```

The first real protocol adapter behind the relay's `sourceUrl` seam: a dependency-free
(bare `node`, no npm install) MQTT 3.1.1 client (QoS-0 subscribe) that translates each
broker PUBLISH into the DataBus wire shape `{tag,value,seq,sent_ms}` and re-serves it as a
WebSocket server on `8766` — the exact shape the sim emits, so relay/DataBus/viewer are
unchanged. Point a viewer at it via `TWIN_SOURCE_URL=ws://localhost:8766` or
`viewer.cfg url=`. The `mqtt_map.json` rule list (example:
`plugin-twin/examples/mqtt_map.example.json`) maps topics→tags: `topic` (exact or `+`/`#`
wildcard), optional `tag` (else derived slash→dot), optional `field` (JSON numeric key);
first match wins. Non-numeric / unmapped payloads are counted and dropped, never fatal.
TLS (`mqtts://`), MQTT 5, QoS 1/2 and the write path are out of scope v1.

Shared internals — one source, no forks: `bridge/mqtt_protocol.js` (MQTT codec, both
directions), `bridge/map.js` (pure topic→tag/value), `../sim/protocol.js` (RFC 6455 WS
server side, reused verbatim). Seam contract + map schema: skill `twin-bind-data`.

## `bridge/demo_publish.js` — MQTT demo publisher

```
node tools/bridge/demo_publish.js --broker mqtt://localhost:1883 [--hz 2] [--user u --pass p]
```

The broker-side counterpart to the seeded sim, so the MQTT path can be tried end-to-end
without hand-writing a `mosquitto_pub` loop: a dependency-free (bare `node`) MQTT client
that PUBLISHes the six house demo topics — the ones
`plugin-twin/examples/mqtt_map.example.json` maps — with smooth animated values (reusing
`../sim/stream.js` `tagValue`), so `mqtt_ws.js` → viewer paints and moves. The topic table
is kept in lockstep with the example map by `mqtt-demo.test.js` (change one, the test flags
the other). Uses the SAME `bridge/mqtt_protocol.js` codec as the bridge.

## `check_playback.gd` — playback determinism gate

```
$GODOT --headless --fixed-fps 60 --path . --script tools/check_playback.gd -- \
    --recording=<fixture.ndjson> [--seek=t1,t2] [--out=emitted.txt]
```

Drives the SHIPPED player (`core/playback.gd`) and the real DataBus autoload through
their public seams only: load → seek (each snapshot asserted against an **independent**
last-frame-≤T-per-tag recompute — the gate has its own parser, so the check is not
circular) → play a bounded window → pause. Hashes the emitted `tag|value|seq` sequence
and prints `PLAYBACK-HASH: <sha256>` + `PLAYBACK-GATE: OK|FAIL`. Also asserts monotonic
emission, transport honesty (`frames_injected>0` while `frames_received==0`) and the
end-of-recording pause.

Two runs of the same fixture+seeks printing the SAME hash **is** the determinism check —
that's what `verify_twin.sh` gates. Synthesized fixtures only (`seed>=0`); the hash is
order-exact, so it is stable across cold/warm engine starts. Contract: skill
`twin-playback`.

## `web/serve_coi.py` — cross-origin-isolation static server (web/Grafana embed)

```
python3 tools/web/serve_coi.py [--dir builds/web] [--port 8070]
```

The dev/local server for a Godot **Web (WASM)** export — the serving half of the web/Grafana embed
recipe. Sends `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
require-corp` on every response (a `thread_support=true` build refuses to boot without them; a
no-threads build ignores them — so the headers are the **safe default for both variants**), plus the
correct `application/wasm` / `.pck` MIME types and `Cache-Control: no-store` for a clean dev
edit-export-reload loop. Dependency-free — **Python 3 standard library only** (`http.server`), same
runtime policy as `ifc_convert.py`; rides the recursive `tools/` copy into projects (shebang → exec
bit on materialize) like the sim. Bound to `127.0.0.1`, no TLS — for a hosted deploy send the same
two headers from your own web server / CDN behind `https` (and use `wss://` for the live relay:
mixed-content rule). The two annotated Web export presets ship as examples:
`plugin-twin/examples/export_presets.web-nothreads.cfg` (the embed-anywhere / Grafana build) +
`export_presets.web-threads.cfg` (the standalone-tab / own-COI-domain build). Measured browser fps
ceiling, the threads-vs-no-threads no-delta finding, and the Grafana-embed evidence:
`plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md`. Recipe + embed snippet: skill
`twin-bind-data` → "Serving to the browser / Grafana embed".

## Referenced (NOT bundled) — base xenodot capabilities

Twin sessions load both plugins; these resolve from the base plugin / the merged project
`tools/`:

- `xenodot:godot-verify` — the verification floor `twin-verify` step 1 delegates to.
- `xenodot:godot-code-rules` — strict GDScript rules every twin `.gd` follows.
- `xenodot:godot-export-builds` — shipping a distributable viewer build.
- `tools/lib/checks.sh`, `validate.sh`, `verify_scene.gd`, `verify_render.gd` — the base
  gate scripts `verify_twin.sh` composes or defers to (materialized from the base plugin).
