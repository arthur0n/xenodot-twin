---
type: finding
title: "MQTT bridge — live end-to-end from a fresh seat's own viewer.cfg (+ --record→playback)"
description: "The Schependomlaan seat pointed at a real local broker via its own viewer.cfg url=, painting live from MQTT publishes; the bridge is one dependency behind the unmodified sourceUrl seam. New --record mode makes a live session a hostable recording; live sources stay NOT hostable (url='')."
timestamp: 2026-07-10T18:10:00+01:00
tags: [mqtt, bridge, websocket, twin-data, sourceUrl, live, recording, hosting, seat, qos0]
---

# MQTT bridge — live end-to-end from a fresh seat's own viewer.cfg

Not a re-proof of the codec (that was validated against Docker Mosquitto,
`twin-mqtt-bridge-2026-07-09.md`). This is the **first** run end-to-end from a fresh seat's OWN
`viewer.cfg url=`, the way an integrator wires it: run a broker, run the bridge against it, point
`url=` at the bridge. The digital-twin **visualization** paints from live MQTT publishes.

Seat: `xt-poc2` (Schependomlaan real building, IFC2X3, 6 exterior facade walls bound by real
22-char GlobalIds, `binding_map.json`). One-machine caveat: Apple M3 Pro, Metal, shadows off,
Godot 4.6.3.stable.

## The bridge is ONE dependency

The bridge is a client BEHIND the unmodified `sourceUrl` relay — `twin-data.js`, the DataBus,
`binding_map`, and the viewer are all unchanged. Integration is entirely: set the seat's own
`viewer.cfg [viewer] url="ws://localhost:8766"` and boot. No stack rewrite, no viewer edit.

## What ran (real, no-sudo broker)

Mosquitto and Docker were unavailable without a system change on this machine (no `mosquitto`
binary; Docker daemon down). Per the no-sudo constraint the broker was a **scratch broker over real
TCP :1883 built on the framework's OWN MQTT 3.1.1 codec** (`tools/bridge/mqtt_protocol.js` +
`map.js` wildcard routing) — a real broker process that independent client PROCESSES (the bridge,
a framework-codec publisher) connect to over the wire. Codec interop with an independent broker
(Mosquitto) is already covered by the prior finding; this unit's new surface is the seat path, which
is broker-agnostic above the codec.

- Bridge: `mqtt_ws.js --broker mqtt://localhost:1883 --map <seat>/mqtt_map.json --port 8766
--record capture.ndjson --stats stats.json` → **6/6 filters subscribed**, **348 frames
  forwarded**, **2 deliberate `badPayload` drops** (a subscribed facade topic published as `warm`),
  logged, never fatal.
- `mqtt_map.json` (DATA, lives in the seat) maps `schependomlaan/facade/<side>/temp` →
  `facade_<side>.temp`, the seat's six bound tags.

## Live paint — proven windowed, before/after

`smoke_binding.gd --url=ws://localhost:8766 --scene=main --seconds=2 --json=…` (the framework's own
live-path gate): DataBus up, **6/6 bindings resolved**, node-drive **targets=6 driven=6 non_white=6
moved=6** → all six facades paint AND change under live publishes; `BIND-SMOKE: OK` (exit 0).

Windowed boots (`$GODOT --path . -- --screenshot=…`), publisher pinned cool then hot:

| Screenshot        | HUD source                            | facade_roof.temp | Bound walls                    |
| ----------------- | ------------------------------------- | ---------------- | ------------------------------ |
| `before_cool.png` | `DataBus: LIVE (ws://localhost:8766)` | 14.0 °C          | **blue** (#1e63ff end of ramp) |
| `after_hot.png`   | `DataBus: LIVE (ws://localhost:8766)` | 30.0 °C          | **red** (#ff2f2f end of ramp)  |

Both: `tags: 6`, `bindings: 6/6 resolved`, HUD reads the **bridge (8766), not the sim (8765)**.
Latency `lat=2.1–7.2 ms` — the **bridge→viewer** hop only (`sent_ms` is stamped at translation;
`seq` is bridge-local — QoS 0 promises no delivery, so this is not broker→bridge loss). Evidence:
`xt-poc2/spikes/mqtt-live/`.

## Live → hostable: --record proven end to end (verification gate)

The durable gap this unit exposed: a live bridge path produces nothing hostable. Closed by the new
**`--record`** mode — it taps the forwarded stream into the same `twin-recording` NDJSON contract
(`tools/sim/recording.js`) `record.js` emits. The 348-frame `capture.ndjson` was replayed through
the **shipped viewer** (`--recording=capture.ndjson`): HUD `DataBus: PLAYBACK (recording)`, 5800 ms
timeline, **6/6 resolved**, facades paint from the ramp. Live session → recording → viewer playback,
end to end. New **`--stats`** now also reports `filters` subscribed (was forwarded/dropped only).
Unit-tested deterministically: `ui/server/features/twin/mqtt-bridge.test.js` (`--record` serializes a
valid twin-recording; `--stats.filters`).

## NOT hostable — recording only

`tools/twin_publish_web.sh` bakes `viewer.cfg url=""` into every hosted build (live-source OFF — a
Pages demo has no broker to reach). So this unit is **NOT hostable as a live web demo**; its
deliverable is the **recording** above. No hosted/live MQTT web demo exists or is implied. Durable
rule: `docs/process/live-sources-not-hostable.md`.

## Honest negatives

- **`dropped.noRule` is structurally unreachable against a real broker.** A broker only delivers a
  topic that matches a subscription, and every subscription IS a rule → any delivered topic matches
  a rule. Real drops are `badPayload` (subscribed topic, non-numeric payload). The `noRule` counter
  guards the in-process/misconfigured (wildcard-subscription) case.
- **Phantom DataBus drops with multi-tag publishers.** The bridge stamps a GLOBAL per-frame `seq`
  (0,1,2,…), but `data_bus.gd` computes drops PER TAG (`seq > last+1`). With 6 tags sharing one
  counter, each tag's seq jumps by ~6, so the HUD reported ~570 "drops" over 2 s of a 6-tag stream —
  **not real loss** (QoS-0 loopback lost nothing; the smoke gate's connect-window drops were 0). The
  sim avoids this by using `seq = tick` (shared across a tick's tags). Follow-up candidate: give the
  bridge a per-tag seq (or a tick-shared seq) so DataBus drop math is meaningful for multi-tag
  sources. Not fixed here — the codec test pins the current global-seq contract; out of unit scope.

## Framework harvest delivered

- Tool: `mqtt_ws.js --record <ndjson>` (live→hostable) + `--stats` enriched with `filters`; test added.
- Skill: `twin-bind-data/SKILL.md` §MQTT — integrator recipe + hosting boundary + flags.
- Convention: `docs/process/live-sources-not-hostable.md`.
- UI surface: `ui/` settings modal "Twin data source" row (LIVE `ws://` vs baked `url=""`), server
  `/api/state.twin.sourceUrl`; browser-verified (twin_evidence console-clean + CDP modal capture).
- Verification gate: `--record` NDJSON plays back deterministically through the shipped viewer (above).
