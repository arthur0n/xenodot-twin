---
name: twin-bind-data
agents: [twin-architect, data-binder]
description: >-
  Bind live tag data to a digital-twin scene — the DataBus autoload contract (WebSocketPeer with the
  four gotchas that make it actually work), tag→node binding through the IFC GlobalId join,
  overlay/state response, the seeded simulator as the deterministic test fixture, AND the built
  MQTT→WS bridge (tools/bridge/mqtt_ws.js) that plugs a real MQTT broker in behind the `sourceUrl`
  seam. Use when wiring a live (or simulated) data stream into the viewer, when connecting a real
  MQTT broker / plant telemetry (point the viewer at the broker, "talk to my broker", topic→tag
  mapping) — the bridge is ALREADY BUILT, run it, don't rebuild it — when "the socket connects but
  nothing arrives" (poll), when frames back up or drop on reconnect, when binding a tag to a model
  element, or when a binding change needs a repeatable test source. NOT the IFC conversion/join
  itself (twin-import) and NOT scale work (twin-optimize).
---

# Twin bind-data (DataBus, GlobalId binding, seeded fixture)

Live data enters through ONE seam — the **DataBus autoload** — and reaches geometry through
ONE key — the **IFC GlobalId** (skill `twin-import` owns producing it). Everything here is
proven by the Phase 0 spike S2 (10 Hz stream, 0 drops, sub-ms latency, reconnect survival);
the protocol-adapter surface beyond WebSocket is Phase 3.

## The DataBus autoload contract

One autoload (`DataBus`, the viewer's one justified singleton — the starter-viewer ships it).
Consumers bind to its signals; nothing else touches the socket.

```gdscript
signal tag_update(tag: String, value: float, seq: int, latency_ms: float)
signal connection_changed(up: bool)
```

Frame shape on the wire (JSON per packet): `{tag, value, seq, sent_ms}`. The bus also exposes a
`stats()` dictionary (frames received/expected, drops, reconnects, latency min/avg/max) — the
binding smoke asserts against it (skill `twin-verify`).

### The four WebSocketPeer gotchas (each one cost the spike time — bake them in)

1. **`poll()` every frame or NOTHING happens.** WebSocketPeer does no background work; call
   `_ws.poll()` in `_process` unconditionally.
2. **`connect_to_url()` is async** — returns OK immediately; state walks
   `STATE_CONNECTING → STATE_OPEN` (or `CLOSED` on failure). Gate on `get_ready_state()`.
3. **Drain ALL pending packets each frame** (`while get_available_packet_count() > 0`) — a
   10 Hz stream backs up behind a per-frame single read under hiccups.
4. **Fresh peer per reconnect** — a CLOSED WebSocketPeer cannot be reliably reused; allocate a
   new `WebSocketPeer.new()` for every connection attempt, on a small cooldown. **Reset seq
   tracking on disconnect** — after a reconnect the source's seq numbering restarts/jumps, and
   stale last-seq state counts phantom drops.

## Tag → node binding (by GlobalId)

- The **binding map is data**: `tag → GlobalId` (JSON/dictionary, authored per the architect's
  design doc) — never per-tag `if` chains in scripts.
- Resolve `GlobalId → Node` once at load, using the join rules from `twin-import` (name or
  parent name; 22-char prefix under Godot name-dedup). Cache the lookup; the stream is per
  frame.
- Visual response per binding: normalize value into the tag's `[min, max]` range, then drive
  the node — material ramp (green→red albedo), `Label3D` text with value + latency, or a
  CanvasLayer HUD for aggregates. Unknown tag → ignore silently (the map is the filter);
  unknown GlobalId → **loud** (`push_warning`) — that's a stale map, a real bug.

## The data-binding runtime (implemented — `core/binding_map.gd`)

The runtime is a plain `Node` added under `Main` (NOT an autoload — the DataBus is the one
justified singleton; this composes on top of its `tag_update` signal). `main.gd` loads it when
`viewer.cfg [twin] binding_map=` points at a map (default `binding_map.json`), resolves it
against `%ModelHost`, and pushes a `bindings: N/M resolved` HUD line (via `overlay.set_bindings`).

### Binding map schema (agent-emitted JSON, NOT `.tres`)

The `data-binder` agent **emits JSON** — a data artifact it can author/regenerate deterministically,
diff, and validate — never a Godot resource. Project file `binding_map.json`:

```json
{
  "version": 1,
  "bindings": [
    {
      "tag": "pump_1.temp",
      "globalid": "<22-char IFC GlobalId>",
      "min": 20.0,
      "max": 90.0,
      "response": "albedo_ramp",
      "ramp": ["#00ff00", "#ff0000"]
    }
  ]
}
```

- Required per binding: `tag`, `globalid`, `min`, `max`, `response`, `ramp` (exactly two hex
  colours). **Typed-at-load**: the loader validates each row — unknown keys are tolerated, a row
  missing/mistyping a required field is `push_warning`'d and **skipped**, a malformed file yields
  0 bindings. It **never crashes** the viewer (a dead binding must not take the scene down).
- `t = clamp((value - min) / (max - min), 0, 1)`; `colour = ramp[0].lerp(ramp[1], t)`
  (`min == max` → `t = 1`, matching `tag_label_3d.gd`).

### Resolution index (built by one tree walk at scene (re)load)

`build_index(root)` walks `root` once and builds `GlobalId → Array[Locator]`, where each locator
is one of two kinds:

- **`node`** — a node whose name is a 22-char IFC GlobalId (the base64 IFC alphabet
  `0-9A-Za-z_$`; Godot's name-dedup suffix is stripped by taking the 22-char prefix, matching
  `twin-import`'s join). Response drives `material_override` on a **fresh per-target**
  `StandardMaterial3D` — never mutate the shared/imported material.
- **`mmi`** — a `MultiMeshInstance3D` carrying meta **`twin_globalids`** (`PackedStringArray`,
  **index = instance position**, emitted by `twin-optimize`'s `optimize_scene.gd`). Each entry
  becomes one locator `{node, index}`. Response drives `multimesh.set_instance_color(index, …)`.
  **`use_colors` must be true** on the MultiMesh; if it is false the runtime `push_warning`s once
  per node and skips (the optimizer enables `use_colors` on emitted fields).

**Duplicate-GlobalId caveat**: one GlobalId can resolve to **many** locators (a de-normalized IFC
export, or repeated equipment collapsed into a MultiMesh). All matched targets are driven by the
one binding — documented and intended; each target keeps its own render cache so they don't clash.

### Response table (v1)

| `response`    | node target                                  | mmi target                                  |
| ------------- | -------------------------------------------- | ------------------------------------------- |
| `albedo_ramp` | per-target `StandardMaterial3D.albedo_color` | `multimesh.set_instance_color(index, col)`  |
| `label`       | spawn a `TagLabel3D` above the node (once)   | spawn a `TagLabel3D` at the instance origin |

The `label` response reuses `overlay/tag_label_3d.gd` — spawn once, then it self-updates from the
DataBus (text + green→red ramp). `albedo_ramp` updates every frame.

## Authoring a map against real GlobalIds (the operator recipe)

The binding map is **authored**, not generated — an operator (or the `data-binder` agent) writes
`tag → GlobalId` rows against a REAL model. The one failure mode that hides is a **silent unbound
tag**: a mistyped or copy-pasted GlobalId that is a valid 22-char string but is absent from the
model resolves to **0 targets** — the viewer boots, the HUD still shows the other tags moving, and
nothing flags the dead row unless you count. So author against the sidecar, and let the gate count.

1. **Never copy the example's own ids.** `binding_map.example.json` carries Duplex ids; they do not
   resolve against your model. Grep the model's sidecar (`<model>_props.json`, `GlobalId → {ifc_class,
name, psets}`) for the elements you mean, and take the **22-char key**, not the `name`:

   ```bash
   rtk grep -o '"[0-9A-Za-z_$]\{22\}": {[^}]*buitenblad' models/<model>_props.json   # e.g. exterior walls
   ```

2. **Wire it.** `viewer.cfg [twin] binding_map=binding_map.json`. The seeded sim derives its tags +
   ranges FROM the map (`--map binding_map.json`), so the fixture never drifts from the rows.

3. **Smoke it — the count IS the ship gate.** `BIND-SMOKE=N/N` (every row resolved) is the only
   honest ship signal; eyeballing the render misses a silent 0-of-N.

   ```bash
   node tools/sim/server.js --seed 42 --port 8899 --hz 10 --map binding_map.json &
   $GODOT --headless --path . --script tools/smoke_binding.gd -- \
       --map=binding_map.json --url=ws://localhost:8899 --json=binding_map.status.json
   ```

   `--json=<path>` writes `{bind_smoke, resolved, total, unresolved[], node_targets, mmi_targets}` —
   machine-readable; the framework assets panel renders it as a green/red `N/N resolved` badge
   (`/api/binding-status`), so resolution health is visible in the product, not only in the HUD.

### The silent-unbound-tag red→green pattern (worked, measured on Schependomlaan)

Prove the gate catches a dead row before trusting a map. Add one row with a plausible-but-WRONG
22-char id alongside the working ones, then fix it:

- **RED** — a mistyped id `3xQ7Zn0lT9$eKpWvFy2Rc4` (valid IFC base64 alphabet, absent from the model):

  ```
  WARNING: binding_map: GlobalId '3xQ7Zn0lT9$eKpWvFy2Rc4' (tag facade_roof.temp) resolved 0 targets
  BIND-SMOKE resolution: 5/6 resolved
  BIND-SMOKE=5/6
  BIND-SMOKE: FAIL — bindings resolved 5/6 (need total>=1, all resolved — a miss is a stale map)
  ```

  The runtime is **loud** (`push_warning` names the dead GlobalId, per "unknown GlobalId → loud")
  and the gate exits non-zero — a silent 0-of-N is caught, not shipped; the `--json` status flips to
  `bind_smoke: FAIL` with the dead id in `unresolved[]`, reddening the badge.

- **GREEN** — correct the id to a real sidecar key (`0DkB$K5OX8IwKgjary8NgC`, a real exterior wall):

  ```
  BIND-SMOKE resolution: 6/6 resolved
  BIND-SMOKE=6/6
  BIND-SMOKE node-drive: targets=6 driven=6 non_white=6 moved=6
  BIND-SMOKE: OK — 6 node target(s), 0 mmi target(s), 90 frames, 0 drops
  ```

Measured on the Schependomlaan real building (IFC2X3, 3505/3505 join), Godot 4.6.3.stable, Apple M3
Pro / Metal, shadows off — one machine (see `library/findings/twin-bind-overlay-2026-07-10.md`).

## Seeded simulator = the fixture

Never develop binding against a source you can't replay. The seeded simulator — a plugin tool
materialized into the project at `tools/sim/server.js`
(`node tools/sim/server.js --seed 42 --port 8765 --hz 10 --map binding_map.json`) — is a WebSocket server
publishing JSON tag frames, **deterministic per (seed, tick)** via a seeded PRNG (mulberry32) —
same seed, same stream, every run. That determinism is what makes the `twin-verify` binding smoke a
real assert instead of a flake:

- Fix the seed in the smoke; assert `frames_received > 0`, `drops == 0`, and the bound node's
  state moved.
- **`--map binding_map.json` derives the tag list + each tag's `[min,max]` FROM the binding map
  itself** (the ranges double as the colour-ramp ranges), so the sim and the bindings can never
  drift. With no `--map` it falls back to a built-in 5-tag demo set.
- Flags: `--seed` (default 42), `--port` (8765), `--hz` (10), `--map`, `--stats <path>` (writes
  per-tag last-seq + frames-sent on exit, to cross-check the viewer's `stats()`).
- **No npm dependency, by design**: the sim is PLUGIN CAPABILITY (it lives in the xenodot-twin
  plugin at `plugin-twin/tools/sim/` and is materialized into every viewer project's `tools/`, so
  even wire-in-place viewers get it and it never drifts). The materialized `tools/` ships no
  `package.json`, so it must run under a bare `node tools/sim/server.js`. The sim is a minimal RFC6455 server
  on node's `http` + `crypto` (handshake + server→client unmasked text frames + just enough
  client-frame parsing to answer pings and honour close). It speaks only what a data source needs;
  Godot's `WebSocketPeer` and the framework relay (`ws`) both interoperate with it. Determinism is
  proven: two `--seed 42` runs produce byte-identical first-frame values; `--seed 99` differs.

## The relay seam — real sources (framework `ui/server/features/twin/twin-data.js`)

The seeded sim is the fixture; a **real** source (a plant WebSocket bridge, or an MQTT→WS bridge)
reaches viewers through the framework's **twin-data relay**. It holds ONE upstream connection and
fans its frames out to N browser/viewer clients on the WebSocket path **`/twin-data`**, reconnecting
to the source on drop without the viewers noticing (the real source is usually singular +
rate-limited; viewers come and go). It is **lazy** — no upstream connection until the first client,
dropped when the last leaves.

- Config: `.xenodot.json` `twin: { sourceUrl }` — read **fresh per (re)connect** via a getter in
  the twin feature (`getTwinConfig`, same live-read contract as `getCodexConfig`), so re-pointing
  the source needs no server restart. Env `TWIN_SOURCE_URL` overrides.
- The relay shares the existing session `WebSocketServer` (registered in `core/index.js`): it
  claims only `/twin-data` sockets; the session handler declines those via `isTwinDataPath`.
- **The relay itself is WebSocket-only** — it carries NO MQTT/OPC-UA dependency. A protocol bridge
  plugs in behind `sourceUrl`, and that is the ONLY seam it needs. The first such bridge now exists
  — see below.

## The MQTT→WS bridge — real broker source (`tools/bridge/`)

The first protocol adapter behind the seam. `tools/bridge/mqtt_ws.js` speaks MQTT 3.1.1 client-side
to a broker (QoS-0 subscribe, dependency-free, bare `node` like the sim), translates each PUBLISH
into the DataBus wire shape, and re-serves it as a WebSocket server on `8766`. Point the relay at
it: `TWIN_SOURCE_URL=ws://localhost:8766` (or a viewer's `viewer.cfg url=`). The relay, DataBus, and
viewer are unchanged — the bridge just IS a `ws://` source.

```
node tools/bridge/mqtt_ws.js --broker mqtt://localhost:1883 --map mqtt_map.json \
    [--port 8766] [--user u --pass p] [--stats out.json]
```

Map file (`mqtt_map.json`, example: `plugin-twin/examples/mqtt_map.example.json`) — a `rules` list,
**first match wins** (order matters):

- `topic` — an exact topic or MQTT wildcard filter (`+` one level, `#` remaining levels); the bridge
  subscribes to each rule's filter.
- `tag` — the DataBus tag name; **omit** to derive it from the concrete topic by slash→dot
  (`plant/pump_1/temp` → `plant.pump_1.temp`).
- `field` — the numeric key when the payload is a JSON object; **omit** when the payload is a bare
  number. Non-numeric / unmapped payloads are counted and dropped loudly, never fatal.

Honesty note: `seq` is bridge-local and `sent_ms` is stamped at translation, so DataBus drop/latency
math measures the bridge→viewer hop, not broker→bridge loss (QoS 0 promises no delivery anyway).
Modules: `mqtt_protocol.js` (codec), `map.js` (pure translation), `mqtt_ws.js` (client + WS server,
reusing `../sim/protocol.js`). To try it without a real broker, `tools/bridge/demo_publish.js`
(bare `node`, same codec) publishes the six example-map topics with animated values — the MQTT
counterpart to the seeded sim. Live-validated against Mosquitto — see
`plugin-twin/library/findings/twin-mqtt-bridge-2026-07-09.md`.

## Serving to the browser / Grafana embed (the web recipe)

The same viewer exports to a Godot Web (WASM) build that embeds in a Grafana dashboard as a live 3D
panel (the OpenTwins pattern). The relay-side facts a data-binder needs — measured, from
`plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md` (Chrome 150, one machine; **Safari
unverified** — see the caveat there, do not claim Safari works):

- **Ship the no-threads variant.** Export presets:
  `plugin-twin/examples/export_presets.web-{nothreads,threads}.cfg` (annotated). `thread_support=false`
  needs no `SharedArrayBuffer`, so it embeds in a Grafana `<iframe>` (whose parent is not
  cross-origin isolated); `thread_support=true` is **dead on arrival in Grafana** (needs COI on the
  top document, Grafana serves no COEP). Measured: threads buys **zero** rendering fps here (Godot 4's
  web renderer is single-threaded), so no-threads sacrifices nothing.
- **Serve with the COI headers** using the bundled tool (Python 3 stdlib, dependency-free — rides the
  recursive `tools/` copy like the sim):

  ```
  python3 tools/web/serve_coi.py --dir builds/web --port 8070
  ```

  It sends `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`
  (required by a threads build, ignored by a no-threads build — safe default for both), the correct
  `application/wasm` / `.pck` MIME types, and `Cache-Control: no-store` for dev. It is a **dev/local**
  server (127.0.0.1, no TLS); for a hosted deploy send the same two headers from your own server/CDN.

- **Grafana embed** — a Text panel in HTML mode (Grafana started with
  `GF_PANELS_DISABLE_SANITIZE_HTML=true`):

  ```html
  <iframe
    src="http://your-host:8070/index.html?scene=duplex&vantage=street"
    width="1000"
    height="640"
    style="border:0"
  ></iframe>
  ```

  Measured inside a real Grafana OSS text/HTML panel: the no-threads build booted **live-bound at
  120 fps, 0 drops**.

- **Mixed-content rule (the relay behind https).** The DataBus opens a WebSocket to the source. An
  `https` page may only open a **`wss://`** socket — a browser blocks plain `ws://` from a secure page.
  Local demo (`http://localhost` page + relay): `ws://localhost:8765` is fine. Hosted: put the
  `/twin-data` relay (or the bridge) behind **`wss://`** (terminate TLS at your reverse proxy) and
  point the viewer at it via `viewer.cfg [twin] url=` / `TWIN_SOURCE_URL` — the same `sourceUrl` seam
  the MQTT bridge plugs into.

- **Optimize heavy scenes first.** The browser is not the bottleneck for a single building or an
  instanced/c2-style city (~1.3k objects — both peg the display cap). Many-unique-mesh scenes hit the
  ceiling: a 28,600-individual-mesh case fell to **~17 fps aerial** (~10× native CPU cost, WebGL2
  Compatibility vs Metal). Run the optimizer first (skill `twin-optimize`; `--vis-ranges` targets
  this regime) before shipping such a scene to web.

## Phase 3 TODO — honest boundaries

Built and proven now: the binding-map runtime (`core/binding_map.gd` — loader, resolution index
incl. the `mmi`+index case, `albedo_ramp`/`label` responses), the seeded sim, the WebSocket relay
seam (`/twin-data`, `sourceUrl`), and the **MQTT→WS bridge** (`tools/bridge/`, above). Still NOT
built or proven; do not claim them:

- **Other protocol adapters** — OPC-UA / BACnet. MQTT now has a built bridge behind the `sourceUrl`
  seam; OPC-UA and BACnet remain **third-party bridges placed in front of** this adapter, not
  framework code. The relay stays WebSocket-in / WebSocket-out only.
- **More responses** — v1 is `albedo_ramp` + `label`. No visibility/emission/animation responses,
  no CanvasLayer-aggregate response type in the map (the overlay HUD is hand-wired).
- **Historization / trends** — no time-series buffer, no trend overlay.
- **Alarm/threshold semantics** — the colour ramp is a demo response; a real alarm model
  (states, ack, hysteresis) is undesigned.
- **Binding-map authoring flow** — the map is still agent-emitted/hand-authored data (no in-UI
  editor). What DOES exist: `smoke_binding.gd --json` writes a resolution status the assets panel
  renders as a green/red `N/N resolved` badge (the operator recipe above), so a silent-unbound tag
  is caught by the gate + surfaced in the product. Still missing: an in-UI map editor, and
  validation against the sidecar BEFORE the smoke (the gate catches a dead id at boot, not at type).
- **Multi-source / tag namespacing** — one stream, flat tag names.

## RTK note

Prefix shell commands with `rtk` as usual; the simulator (`node tools/sim/server.js`) and `$GODOT`
pass through. Never reference rtk inside `.gd` files.
