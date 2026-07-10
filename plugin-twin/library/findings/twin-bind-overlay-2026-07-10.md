---
type: finding
title: "twin-bind-overlay — the bind-smoke gate catches a silent unbound tag RED, then GREEN; N/N badged in the UI"
description: "Authoring a binding overlay against the REAL Schependomlaan building (IFC2X3, 3505/3505 join) proves a mistyped GlobalId is a silent 0-of-N — a valid 22-char id absent from the model resolves to 0 targets, the viewer boots and lies. The hardened bind smoke (smoke_binding.gd --json) catches it: a planted bad id gives BIND-SMOKE=5/6 FAIL with the runtime loudly push_warning-ing the dead GlobalId; fixing it to a real sidecar key gives BIND-SMOKE=6/6 OK, 6 node targets driven. The --json status flows to the framework assets panel as a green/red N/N resolved badge — captured flipping green 6/6 -> red 5/6 -> green in a real browser. Convention filed: a binding map is not shipped until BIND-SMOKE=N/N. One machine, Apple M3 Pro / Metal, shadows off, Godot 4.6.3.stable."
timestamp: 2026-07-10T17:30:00+01:00
tags:
  [
    twin-bind-data,
    binding-map,
    globalid,
    bind-smoke,
    silent-unbound,
    red-green,
    ui-badge,
    schependomlaan,
    one-machine,
  ]
---

# twin-bind-overlay — geometry becomes a live instrument through DATA alone

The twin-bim-import finding proved the pipeline joins the **Schependomlaan** real building 3505/3505.
This unit proves the next step: an operator turns that geometry into a live instrument by AUTHORING a
`binding_map.json` — no script change, just `binding_map.json` + `viewer.cfg`. And it proves the one
failure mode that hides, so the map is trustworthy: a **silent unbound tag**.

Seat: `xt-poc2` (the already-joined Schependomlaan twin), disposable per D5. Evidence in
`spikes/bind-overlay/`. One machine: Apple M3 Pro, Metal, shadows off, Godot 4.6.3.stable, node 22.

## The authored overlay (steps 3–4)

Five zone-temperature tags were already bound to five real exterior brick outer-leaf (`buitenblad`)
facade walls by their 22-char IFC GlobalIds. A sixth (`facade_roof.temp`) was added the same way —
grep the sidecar (`models/Schependomlaan_props.json`, `GlobalId → {ifc_class, name, psets}`) for a
real wall key, paste the **key** (not the `name`). `viewer.cfg [twin] binding_map=binding_map.json`;
the seeded sim derives its tags + ranges FROM the map (`--map binding_map.json`), so fixture and map
cannot drift.

Boot green, headless, against the seeded sim (seed 42, 10 Hz):

```
BIND-SMOKE connection: up=true frames_received=6 drops=0
BIND-SMOKE resolution: 6/6 resolved
BIND-SMOKE=6/6
BIND-SMOKE node-drive: targets=6 driven=6 non_white=6 moved=6
BIND-SMOKE: OK — 6 node target(s), 0 mmi target(s), 90 frames, 0 drops
```

Join gate still 100% on the real model (`check_twin_join.gd --json`): `JOIN: 3505/3505 (100.0%)`,
`JOIN-GATE: OK`.

## The silent-unbound-tag trap — RED then GREEN (steps 5–6, the evidence)

A mistyped GlobalId is a **valid 22-char string that resolves to 0 targets**. The viewer still boots,
the other five tags still move, and nothing flags the dead row unless you count. The whole point of
the gate is to count.

**RED** — plant one plausible-but-wrong id `3xQ7Zn0lT9$eKpWvFy2Rc4` (valid IFC base64 alphabet, `grep`
confirms it is absent from the 3508-key sidecar) as the 6th binding's `globalid`, verbatim:

```
WARNING: binding_map: GlobalId '3xQ7Zn0lT9$eKpWvFy2Rc4' (tag facade_roof.temp) resolved 0 targets
     at: push_warning (core/variant/variant_utility.cpp:1034)
BIND-SMOKE connection: up=true frames_received=6 drops=0
BIND-SMOKE resolution: 5/6 resolved
BIND-SMOKE=5/6
BIND-SMOKE: FAIL — bindings resolved 5/6 (need total>=1, all resolved — a miss is a stale map)
```

The runtime is **loud** (`push_warning` names the dead GlobalId, per `twin-bind-data`'s "unknown
GlobalId → loud" contract) and the gate exits non-zero. The `--json` status the smoke wrote:

```json
{
  "bind_smoke": "FAIL",
  "resolved": 5,
  "total": 6,
  "unresolved": ["3xQ7Zn0lT9$eKpWvFy2Rc4"],
  "node_targets": 5,
  "mmi_targets": 0
}
```

**GREEN** — correct the id to a real sidecar key (`0DkB$K5OX8IwKgjary8NgC`, a real `buitenblad`
exterior wall), rerun:

```
BIND-SMOKE resolution: 6/6 resolved
BIND-SMOKE=6/6
BIND-SMOKE node-drive: targets=6 driven=6 non_white=6 moved=6
BIND-SMOKE: OK — 6 node target(s), 0 mmi target(s), 90 frames, 0 drops
```

Status flips to `{ "bind_smoke": "OK", "resolved": 6, "total": 6, "unresolved": [] }`. This red→green
pair, both verbatim, is the finding: the gate — not the render — is what catches a dead row.

## Windowed confirmation (step 7)

A windowed boot (`spikes/bind-overlay/windowed_6of6.png`) against the live sim: HUD reads
`DataBus: LIVE (ws://localhost:8765)`, `tags: 6 | facade_roof.temp=23.144 seq=65 lat=12.8ms`,
`fps: 60`, `bindings: 6/6 resolved`. The six bound outer-leaf walls repaint on the 12–32 °C blue→red
ramp (visible as the coloured patches on the facade). Honesty note: only **6 walls** are bound — the
bulk gold/green surfaces are the building's own imported materials, not the ramp. The point is a real
GlobalId join on a real building, not coverage (visualization, not simulation — the values are the
seeded fixture).

## Framework harvest (the point — the demo is exhaust)

- **Tool** — `smoke_binding.gd` hardened with `--json=<path>`: emits `BIND-SMOKE=<resolved>/<total>`
  and writes a status struct (`bind_smoke`, `resolved`, `total`, `unresolved[]`, node/mmi counts) on
  **every** terminal path, so a UI badge can flip red the instant resolution drops. Backed by a new
  public read surface `binding_map.gd → unresolved_globalids()`.
- **UI surface** — the framework assets panel now shows a **Binding maps** card with a green/red
  `N/N resolved` badge fed by `/api/binding-status` (server `binding-status.js`, client `get-assets.js`).
  Captured in a REAL browser (Chrome over CDP): green `6/6 resolved` → red `5/6 resolved` on the
  planted bad id → green again (`spikes/bind-overlay/ui_badge_{green_6of6,red_5of6}.png`) — an in-UI
  state change, not merely this recording.
- **Skill** — `twin-bind-data` gains the "author a map against real GlobalIds" operator recipe (grep
  the sidecar key, never copy the example's ids) and the silent-unbound red→green pattern as a worked,
  measured example.
- **Agent** — `data-binder` gains the ship checklist: bind only real sidecar ids, run BIND-SMOKE with
  `--json` before shipping, treat `resolved < total` as RED, prove the gate on a new map.
- **Convention** — `docs/process/binding-ship-gate.md`: a binding map is not shipped until
  `BIND-SMOKE=N/N`; a mistyped GlobalId is a silent 0-of-N, so the gate (and the UI badge), not the
  eye, is the ship criterion.

## Copy discipline

Digital-twin **visualization** — no simulation exists; the values are a seeded deterministic fixture.
One machine (Apple M3 Pro, Metal, shadows off, Godot 4.6.3.stable, node 22.21) — not a benchmark.
