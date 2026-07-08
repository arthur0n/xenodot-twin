---
name: twin-bind-data
agents: [twin-architect, data-binder]
description: >-
  Bind live tag data to a digital-twin scene — the DataBus autoload contract (WebSocketPeer with the
  four gotchas that make it actually work), tag→node binding through the IFC GlobalId join,
  overlay/state response, and the seeded simulator as the deterministic test fixture. Use when
  wiring a live (or simulated) data stream into the viewer, when "the socket connects but nothing
  arrives" (poll), when frames back up or drop on reconnect, when binding a tag to a model element,
  or when a binding change needs a repeatable test source. NOT the IFC conversion/join itself
  (twin-import) and NOT scale work (twin-optimize).
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

## Seeded simulator = the fixture

Never develop binding against a source you can't replay. The starter-viewer's simulator
(`node sim/server.js --seed 42 --port 8765 --hz 10`) is a WebSocket server publishing JSON tag
frames, **deterministic per (seed, tick)** via a seeded PRNG (mulberry32) — same seed, same
stream, every run. That determinism is what makes the `twin-verify` binding smoke a real
assert instead of a flake:

- Fix the seed in the smoke; assert `frames_received > 0`, `drops == 0`, and the bound node's
  state moved.
- Extend the sim's tag table to match the binding map (tag, min, max, period) — the ranges
  double as the color-ramp ranges.
- The sim writes `stats.json` (per-tag last seq, frames sent) — cross-check the viewer's
  `stats()` against it for end-to-end accounting.

## Phase 3 TODO — honest boundaries

Not yet built or proven; do not claim them:

- **Real protocol adapters** — OPC-UA / MQTT / BACnet sources behind the same DataBus signal
  contract. Today: WebSocket JSON only.
- **Historization / trends** — no time-series buffer, no trend overlay.
- **Alarm/threshold semantics** — the color ramp is a demo response; a real alarm model
  (states, ack, hysteresis) is undesigned.
- **Binding-map authoring flow** — today the map is hand-authored data; no UI, no validation
  against the sidecar beyond the join check.
- **Multi-source / tag namespacing** — one stream, flat tag names.

## RTK note

Prefix shell commands with `rtk` as usual; the simulator (`node sim/server.js`) and `$GODOT`
pass through. Never reference rtk inside `.gd` files.
