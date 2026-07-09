# Implementation plan — MQTT source adapter behind `sourceUrl`

Roadmap Must-Have #1 (see `2026-07-09-roadmap-handoff.md`). Plan only — nothing built yet.
Investigated against the repo at plan time; every file reference verified to exist.

## Why this item, restated

First question every real visitor asks: "can it talk to my broker?" The research-validated
architecture (`docs/research/landscape-2026-07.md`) is edge bridge → MQTT/WS → viewer; the
3D scene never speaks plant protocols. Agent-advantage LOW, product-necessity HIGH: build
once, gate it, stop.

## The seam as it exists today (verified)

- **Relay** (`ui/server/features/twin/twin-data.js`): one upstream WS multiplexed to N
  viewer clients on `/twin-data`, reconnect-to-source, `getSourceUrl` read fresh per
  (re)connect (env `TWIN_SOURCE_URL` → `.xenodot.json` `twin.sourceUrl`). Its header states
  the design intent verbatim: _"a protocol bridge (e.g. mqtt→ws) plugs in behind
  `sourceUrl`, and that is the ONLY seam it needs."_
- **Wire contract** (`starter-viewer/core/data_bus.gd`): one JSON object per WS text frame,
  `{"tag": String, "value": float, "seq": int, "sent_ms": float}`. DataBus computes drops
  from `seq` gaps and latency from `sent_ms`.
- **House precedent** (`plugin-twin/tools/sim/`): dependency-free tools under bare `node`
  — no package.json in materialized `tools/`. The sim hand-rolled minimal RFC 6455
  (`protocol.js`, shared by both wire ends, every constant named with spec section) rather
  than take a dependency. `materialize.js` copies the twin plugin's `tools/` tree
  recursively and add-only, so a new `tools/bridge/` subdir materializes into every viewer
  project with zero materializer changes (verified in `ui/server/cli/materialize.js`).
- **Tests precedent**: `ui/server/features/twin/twin-data.test.js` tests the relay with
  in-process fakes via the injected `connect` factory; `node --test` under `ui/`.

## Architecture decision

**Standalone bridge tool, relay untouched.** New `plugin-twin/tools/bridge/` speaks MQTT
3.1.1 client-side to the broker and serves the DataBus wire shape as a tiny WS server;
`sourceUrl` (or a viewer's `viewer.cfg url=`) points at the bridge. Rejected alternative —
teaching the relay an `mqtt://` scheme — because it would (a) add an npm dep or move
protocol code into `ui/server`, (b) couple viewers to the framework server (a shipped
build with no framework running couldn't use it), and (c) contradict the relay's own
documented contract that the bridge is _behind_ the seam.

**Dependency-free, hand-rolled MQTT 3.1.1 client, QoS 0.** Same reasoning as protocol.js:
materialized tools run under bare `node`. The needed subset is genuinely small — CONNECT/
CONNACK, SUBSCRIBE/SUBACK, PUBLISH (receive), PINGREQ/PINGRESP, DISCONNECT, and the
remaining-length varint. This is comparable in size to the RFC 6455 module that already
exists. MQTT 5, QoS 1/2, TLS, and publishing back are explicitly out of scope v1 (notes
below).

## Module split (mirrors sim's protocol/stream/server split)

1. **`tools/bridge/mqtt_protocol.js`** — packet encode/decode only. Shared by the bridge
   client AND the test fake broker, same "one module, both wire ends, or they drift"
   rationale as `sim/protocol.js`. Every constant named with its MQTT 3.1.1 spec section
   (OASIS spec §2.2 fixed header, §2.2.3 remaining-length varint, §3.1 CONNECT, §3.2
   CONNACK, §3.3 PUBLISH, §3.8/3.9 SUBSCRIBE/SUBACK, §3.12/3.13 PINGREQ/PINGRESP).
   Incremental decoder returning `{packets, rest}` — same shape as `decodeFrames`.
2. **`tools/bridge/map.js`** — pure functions: topic→tag mapping + payload→value
   extraction. Rule list from a JSON map file (agent-authored, human-diffable — the
   two-layer house pattern). MQTT topic-filter matching (`+`, `#`) implemented here
   (spec §4.7), pure and unit-testable.
3. **`tools/bridge/mqtt_ws.js`** — CLI entry. net.Socket MQTT client with
   reconnect-to-broker (mirror the relay's reconnect-delay rationale) → translate via
   map.js → WS server reusing `../sim/protocol.js` server side (handshake +
   `encodeTextFrame` + ping/close handling, exactly like `sim/server.js`). Both subdirs
   materialize together so the relative import holds in projects.

## Data mapping design

Map file `mqtt_map.json` next to `binding_map.json`:

```json
{
  "rules": [
    { "topic": "plant/pump_1/temp", "tag": "pump_1.temp" },
    { "topic": "plant/+/flow", "field": "value" },
    { "topic": "sensors/#" }
  ]
}
```

- `topic` — exact or MQTT wildcard filter; the bridge subscribes to each rule's filter.
- `tag` — explicit tag name; when omitted, derived from the concrete topic by
  slash→dot substitution (`plant/pump_1/temp` → `plant.pump_1.temp`). Derivation rule
  documented in the map schema and in map.js.
- `field` — when the payload is a JSON object, the key holding the numeric value; when
  omitted, the payload must parse as a bare number. Non-numeric / unparseable payloads
  are counted and dropped loudly (periodic stderr summary, never a crash — a plant broker
  carries chatter the bridge doesn't own).
- First matching rule wins; document rule order as significant.

Frame synthesis: `seq` = bridge-local monotonic counter (document honestly: DataBus drop
math then measures the bridge→viewer hop only, not broker→bridge loss — QoS 0 makes no
delivery promise anyway); `sent_ms = Date.now()` at translation (latency shown is
bridge→viewer, same honesty note).

CLI shape (named defaults, no magic numbers):

```
node tools/bridge/mqtt_ws.js --broker mqtt://localhost:1883 --map mqtt_map.json [--port 8766] [--user u --pass p] [--stats out.json]
```

`DEFAULT_BRIDGE_PORT = 8766` — one above the sim's 8765 and distinct from the gate's 8899;
document all three in one comment cluster like the existing port constants. `--user/--pass`
ride the CONNECT packet's existing username/password fields (spec §3.1.3.4/5) — nearly
free, and real brokers commonly require them. Reuse `parseArgs` from `../sim/stream.js`.

## Tests and gates

- **Unit** (new `ui/server/features/twin/mqtt-bridge.test.js` or sibling files, `node
--test`, importing the plugin tool modules directly like the materializer tests do):
  codec round-trips including remaining-length varint edges (127/128/16383/16384),
  topic-filter matching per spec §4.7 cases, tag derivation, payload extraction incl.
  malformed payloads.
- **Integration, in-process**: fake broker built on `mqtt_protocol.js` (a net server that
  answers CONNACK/SUBACK and publishes scripted PUBLISHes) → real bridge translate path →
  assert WS client receives exact `{tag, value, seq, sent_ms}` frames and seq is gapless.
  No live broker needed in CI; deterministic.
- **verify_twin.sh**: NO new mandatory phase — the binding smoke keeps the seeded sim as
  its fixture (the bridge is not deterministic; gating on a live broker would violate the
  determinism contract). If a live check is wanted later, it enters as an opt-in
  env-gated phase like TWIN_BENCH, SKIP loud. Not in v1 scope.
- **Live validation** (human/agent, one-time, from the twin seat `twindemo/`): local
  Mosquitto (`brew install mosquitto`, or docker), `mosquitto_pub` loop publishing to the
  demo topics, bridge on 8766, `house/` viewer pointed at it (`viewer.cfg url=` or relay
  `sourceUrl`) → elements paint. Record the observed numbers with caveats in
  `plugin-twin/library/findings/` like the other measurements.

## Docs and hygiene (part of scope, not follow-up)

- `plugin-twin/skills/twin-bind-data/SKILL.md` — the "honest boundaries" section currently
  lists MQTT adapters as NOT built; flip that wording only when the gate-backed thing
  exists, and describe the bridge + map schema there (or a short new
  `tools/bridge/README` section referenced from the skill — prefer extending the skill,
  it already owns the relay-seam story).
- `plugin-twin/agents/data-binder.md` mentions `sourceUrl` — add the bridge as the named
  first instance of the pattern.
- `plugin-twin/tools/CAPABILITIES-twin.md` — new tool entry.
- `docs/fork/SEAMS.md` protect-list — ADD every new `tools/bridge/` file; the first sync
  proved upstream merges silently delete unprotected twin files.
- Roadmap handoff — tick item 1 with a pointer to this plan and the findings file.
- Tutorial (`docs/tutorials/digital-twin.md`): one short "point it at your broker"
  section. This is the demo answer to the visitor question; keep it to the happy path.

## Phasing (three commits-ish, review after each — line-by-line review + constants list expected)

1. **Codec**: `mqtt_protocol.js` + unit tests. Pure, no I/O. Constants list for review.
2. **Bridge**: `map.js` + `mqtt_ws.js` + fake-broker integration test. Runs end-to-end
   against the in-process fake.
3. **Wire-up + proof**: live Mosquitto validation from the twin seat, findings file,
   skill/agent/CAPABILITIES/SEAMS/tutorial updates, roadmap tick.

## Out of scope v1 (named so nobody re-litigates)

- MQTT 5 (adds properties/varint headers everywhere; 3.1.1 is what Mosquitto/plant
  bridges speak by default).
- QoS 1/2 (QoS 0 subscribe matches the viewer's own live-data stance: latest value wins,
  history is the recorder's job).
- TLS (`mqtts://`) — bounded later swap of net.connect → tls.connect; note in the CLI
  error message when an `mqtts://` URL is passed.
- Publishing viewer→broker (write path / commands): a different trust boundary, different
  roadmap conversation.
- OPC UA / BACnet: permanently third-party bridges in front of this adapter (roadmap
  "explicitly NOT" section).

## Acceptance criteria

1. `ui/` test suite green including new codec + mapping + fake-broker integration tests.
2. Diff shows ZERO changes to `twin-data.js` — the seam absorbed the adapter as designed.
3. Fresh project materialization carries `tools/bridge/`; bridge runs under bare `node`
   with no package.json (clean-stranger rule).
4. Live Mosquitto → bridge → viewer paints elements; measured numbers + caveats recorded
   in `plugin-twin/library/findings/`.
5. SEAMS protect-list, skill, agent, CAPABILITIES, tutorial, roadmap all updated in the
   same change set.
