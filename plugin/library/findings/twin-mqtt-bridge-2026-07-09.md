---
type: finding
title: "MQTT→WS bridge — live Mosquitto validation (QoS-0 subscribe adapter)"
description: "The dependency-free MQTT 3.1.1 bridge (tools/bridge/) verified end-to-end against a real Mosquitto broker: mapped topics became exact DataBus frames, unmapped/non-numeric payloads dropped, seq gapless."
timestamp: 2026-07-09T12:00:00+01:00
tags: [mqtt, bridge, websocket, twin-data, sourceUrl, mosquitto, qos0]
---

# MQTT→WS bridge — live Mosquitto validation

The MQTT source adapter (`plugin-twin/tools/bridge/`) plugs in **behind** the relay's `sourceUrl`
seam: it speaks MQTT 3.1.1 client-side to a broker (QoS 0), translates each PUBLISH into the
DataBus wire shape `{tag, value, seq, sent_ms}`, and re-serves those as a WebSocket server on
`DEFAULT_BRIDGE_PORT = 8766` — the same wire the sim emits, so `twin-data.js`, the DataBus, and the
viewer are unchanged. `mqtt_protocol.js` (codec), `map.js` (pure topic→tag/value), `mqtt_ws.js`
(net client + WS server, reusing `../sim/protocol.js`).

## What was measured

Real broker: `docker run --rm -p 1883:1883 eclipse-mosquitto:2` (anonymous listener). The **real
CLI** `node tools/bridge/mqtt_ws.js --broker mqtt://localhost:1883 --map
plugin-twin/examples/mqtt_map.example.json --port 8766` connected, subscribed to all 6 example
filters, and a `ws://` viewer client read the forwarded frames while `mosquitto_pub` published
telemetry.

| Published topic             | payload          | Result                                                          |
| --------------------------- | ---------------- | --------------------------------------------------------------- |
| `house/living_room/temp`    | `21.5`           | frame `{living_room.temp, 21.5, seq 0}`                         |
| `house/kitchen/temp`        | `22.4`           | frame `{kitchen.temp, 22.4, seq 1}`                             |
| `house/solar/power`         | `{"watts":3200}` | frame `{solar.output_w, 3200, seq 2}` — JSON `field` extraction |
| `house/entrance_door/state` | `1`              | frame `{entrance_door.open, 1, seq 3}`                          |
| `junk/unmapped`             | `9`              | **dropped** (no matching rule)                                  |
| `house/boiler/temp`         | `warm`           | **dropped** (non-numeric payload)                               |

- 4 mapped publishes → 4 frames, **seq gapless 0–3**; the two off-contract publishes were counted
  and withheld, never forwarded, never a crash.
- Explicit `tag`, JSON-`field` extraction, and first-match rule ordering all exercised.

## Numbers, honestly caveated

- Observed viewer-side timing: all 4 frames arrived within ~286 ms of the first publish — but that
  window is dominated by per-publish `docker exec mosquitto_pub` process startup in the test
  harness, **not** bridge latency. The bridge adds a single decode→translate→encode hop.
- `seq` is a **bridge-local** monotonic counter and `sent_ms` is stamped at translation, so the
  DataBus drop/latency math measures the **bridge→viewer** hop only, not broker→bridge loss — QoS 0
  makes no delivery promise anyway. This is by design and documented in `mqtt_ws.js`.

## Test coverage backing this

- `ui/server/features/twin/mqtt-codec.test.js` — MQTT 3.1.1 codec (remaining-length varint edges
  127/128/16383/16384, CONNECT/SUBSCRIBE/PUBLISH/CONNACK/SUBACK round-trips, incremental decode).
- `ui/server/features/twin/mqtt-map.test.js` — §4.7 topic-filter matching (`+`/`#`/`$`), tag
  derivation, payload extraction incl. malformed, `parseMap` validation.
- `ui/server/features/twin/mqtt-bridge.test.js` — in-process fake broker (built on the SAME codec)
  → real bridge translate path → ws client asserts exact frames + gapless seq + drop counts. No
  live broker needed in CI; deterministic.

## Godot element paint — proven

The `house/` viewer was pointed at the bridge (`viewer.cfg url=ws://localhost:8766`) with the docker
Mosquitto broker + `mosquitto_pub` loop feeding the six demo topics, and screenshotted. Observed in
the HUD: **`DataBus: LIVE (ws://localhost:8766)`** (reading the bridge, not the sim), `tags: 6`,
`entrance_door.open=1.000 seq=35 lat=2.1ms`, **`bindings: 6/6 resolved`**. The model painted from the
live MQTT values — the front door rendered red (`entrance_door.open=1` on the closed→open green→red
ramp), the solar roof green from the published watts. Full broker→bridge→relay→viewer→paint path
confirmed end-to-end.

## Out of scope v1 (unchanged)

MQTT 5, QoS 1/2, TLS (`mqtts://` errors loudly), viewer→broker publish, OPC-UA/BACnet (permanently
third-party bridges in front of this adapter).
