# Live sources are integrator-side; a hosted demo is a baked recording

One durable rule, so it need not be re-explained per plan.

## The rule

A **LIVE** data source — any `ws://` the viewer connects to at runtime (the seeded sim, or the
`mqtt_ws.js` bridge on a real broker) — is **integrator-side**. It exists on the machine that runs
the broker/bridge. A published web demo (GitHub Pages, any static host) has **no broker to reach**,
so `tools/twin_publish_web.sh` bakes `viewer.cfg url=""` into every hosted build — live-source OFF,
by contract.

Therefore: **a live source is NOT hostable as a live web demo.** The hostable artifact is always a
**baked recording** — a deterministic `twin-recording` NDJSON the viewer replays (`viewer.cfg
[twin] recording=` / `--recording=`), with `url=""`.

## How to make a live source hostable

Record it, then ship the recording:

- Seeded sim → `tools/sim/record.js --url ws://localhost:8765 --out capture.ndjson`.
- MQTT bridge → `tools/bridge/mqtt_ws.js … --record capture.ndjson` (taps the live stream into the
  same NDJSON contract, `tools/sim/recording.js`).

The recording plays back through the shipped viewer identically to live (the DataBus inject seam),
so bindings and paint behave the same — only reproducible.

## What to say (and not say)

- Say: "the hosted demo replays a baked recording; the live source runs integrator-side."
- Do **not** claim or imply a hosted/live MQTT (or any live-`ws://`) web demo exists — Pages demos
  are `url=""` playback by construction.

Cross-refs: `tools/twin_publish_web.sh` header (`url=""` invariant); `skills/twin-bind-data/SKILL.md`
§"The MQTT→WS bridge" (hosting boundary); findings `twin-mqtt-bridge-2026-07-09.md` (codec) and
`twin-mqtt-live-seat-2026-07-10.md` (live seat + `--record`→playback).
