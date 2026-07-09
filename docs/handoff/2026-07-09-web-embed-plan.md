# Implementation plan — web/Grafana embed story (measure the WASM ceiling, then recipe)

Roadmap Nice-to-Have #6 (see `2026-07-09-roadmap-handoff.md`). Plan only. OpenTwins
proved the pattern (Unity WebGL scene embedded in Grafana with live push-down); our web
export BOOTS (~38 MB, Phase-0 spike) but browser fps was never measured. The item's own
wording carries the honesty rule: if the ceiling is bad, PUBLISH THE FINDING — negative
results are still content.

## What exists (verified)

- **Spike artifacts** (seat: `twindemo/twin-spikes/s3-scale/`): `serve.py` — a COI
  static server (`Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp`, what Godot web-with-threads needs);
  `export_presets.cfg` with a Web preset, `variant/thread_support=true`; `export.log`;
  `results.json` — NATIVE fps rows only (e.g. 100k instances, 152.9 fps, mode single).
  No browser numbers anywhere — the roadmap statement checks out.
- **Framework server**: no COI headers in `ui/server` (grepped) — nothing serves a web
  build today.
- **Bench methodology**: `bench_scene.gd` is a desktop `SceneTree` harness
  (windowed-only, always-on-top tricks) — it cannot run inside a web export as-is.
  Browser measurement needs its own path.
- **Live data in browser**: `data_bus.gd` uses `WebSocketPeer` (supported in web
  export); the relay serves `/twin-data`. Mixed-content applies: an `https` page can
  only open `wss:` — plain `ws://localhost` works for local demos only.

## The constraint that shapes the whole item: threads vs Grafana

Godot web with `thread_support=true` needs `SharedArrayBuffer` ⇒ the document must be
`crossOriginIsolated` ⇒ COOP+COEP on the TOP-LEVEL document too, not just the iframe.
Grafana does not serve itself with COEP, so a threads build inside a Grafana iframe is
expected DEAD ON ARRIVAL regardless of our headers. Godot also ships a NON-threaded web
variant (`thread_support=false`) — no SAB, embeddable anywhere, at a single-thread
performance cost nobody has measured for our scenes. So the measurement matrix is not
"how fast is WASM" but **"how fast is each variant, and is the embeddable one usable"**:

- threads + COI → the standalone-tab / own-domain story (viewer link next to Grafana).
- no-threads → the true iframe-in-Grafana story (OpenTwins-equivalent).

Both get measured; the recipe recommends per deployment shape. (Verify the
COI-in-iframe claim empirically during the spike rather than trusting the spec reading
— one Grafana text-panel iframe attempt per variant, result recorded either way.)

## Phase 1 — measure (seat spike, scratch tooling allowed)

**Instrumentation**: minimal `web_bench.gd` overlay hook in the spike project (NOT the
framework yet): sample `Engine.get_frames_drawn()` deltas + frame time over a fixed
window, emit one `BENCH: {json}` line via `JavaScriptBridge.eval("console.log(...)")`
— readable by hand from DevTools or scraped via a scratch Chrome-DevTools-Protocol
script. Same vantage coordinates as the native benchmark
(`plugin-twin/library/findings/twin-optimizer-benchmark-2026-07-08.md`) so columns are
comparable.

**Matrix (bounded):**

- Builds: threads, no-threads.
- Scenes: optimized duplex (single-building realistic), c2-optimized 10×10 city
  (28,600-mesh case that natively sits at the display cap; 20×20 only if 10×10 is
  healthy).
- Browsers: Chrome + Safari (macOS; Safari is the SAB/WASM worst case and the one a
  stakeholder will open). Firefox opportunistic, not gating.
- Vantages: street + aerial (native-bench coordinates).
- Live path: sim → `wss`/`ws` → DataBus in-browser; record fps WITH binding active +
  frames/drops (the DataBus stats), not just a static spin.

**Also record**: load time to first frame, pck+wasm transfer size, memory (DevTools),
and the two Grafana-iframe attempts (threads expected-fail is itself a finding).

**Caveats discipline**: one machine, browser versions pinned in the findings file,
120 Hz cap note carries over (browsers also vsync — `requestAnimationFrame` caps at
display refresh; sub-cap frame_ms is the differentiator, same logic as native).

## Phase 2 — decide from data (all three outcomes shippable)

- **Embeddable variant usable** (no-threads holds a stated floor — e.g. ≥30 fps street
  vantage on the duplex; pick and NAME the floor in the findings before measuring, not
  after): ship the full Grafana recipe.
- **Only threads variant usable**: ship the "companion tab / reverse-proxy with COI on
  your own domain" recipe, and say plainly in docs that in-Grafana iframes are not
  supported at usable frame rates (with numbers).
- **Neither usable at scale**: publish the negative finding with the numbers and scope
  web export in all docs to small models / demo links. Roadmap item still closes.

## Phase 3 — ship the recipe (framework, scope per outcome)

- **COI server tool**: promote the spike's `serve.py` into
  `plugin-twin/tools/web/serve_coi.py` (python3 stdlib only — same runtime policy as
  `ifc_convert.py`; a node twin of it is 20 lines if we'd rather keep tools/ mono-runtime
  — decide at review). Materializes via the existing recursive copy.
- **Export preset examples**: `plugin-twin/examples/export_presets.web-threads.cfg` +
  `.web-nothreads.cfg` (annotated: what thread_support toggles, when each applies).
- **Docs**: new section in the tutorial + `twin-bind-data`'s relay notes: serving
  (`serve_coi.py`), `wss` requirement behind https, Grafana embed snippet (text/HTML
  panel iframe) for whichever variant survived, DataBus URL config for a hosted relay.
  Numbers cited only from the findings file.
- **Findings file**: `plugin-twin/library/findings/twin-web-ceiling-<date>.md` — the
  deliverable that exists in EVERY outcome.
- Housekeeping: CAPABILITIES entry (if the tool ships), SEAMS protect-list +=
  `tools/web/` + example presets, roadmap tick naming the outcome type.

## Explicitly out of scope (named)

- Packaging/deploy bundling of build+model+sidecar+recording — that is roadmap #7
  (`twin-ship`), next plan; this item only proves the browser runtime and the serving
  headers.
- Grafana datasource/plugin development, bidirectional click-through (OpenTwins
  parity) — revisit only after the embed proves worth it.
- CDN/hosting guidance beyond the COI header requirement.
- Mobile browsers.
- Any framework UI for launching web builds (`ui/server` COI middleware only if the
  recipe needs the framework to serve builds — default is the standalone tool, keep
  the server out of it).

## Acceptance criteria

1. Findings file with the full matrix (2 builds × 2 scenes × 2 browsers × 2 vantages,
   live-data on), load/size/memory columns, browser versions, machine caveats — and
   the pre-declared usability floor stated up front.
2. Both Grafana-iframe attempts recorded (even the expected threads failure).
3. Recipe docs cite only measured numbers; the unsupported paths say so plainly.
4. If a tool ships: materialized `serve_coi` runs a COI-correct server (headers
   assert-checked in a curl test), example presets load in the editor unmodified.
5. SEAMS/CAPABILITIES/tutorial/roadmap updated in the same change set; roadmap tick
   names the outcome (recipe / companion-tab-only / negative).
