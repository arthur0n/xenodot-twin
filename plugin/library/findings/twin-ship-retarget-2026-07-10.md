---
type: finding
title: "twin-ship retarget — a shipped twin repointed to a new live source by editing ONE line, same binary"
description: "Cross-SOURCE retarget of a real shipped twin (Schependomlaan BIM), the data-beside-build contract's live half. tools/twin_ship.sh shipped the seat's optimized twin as a macOS artifact (universal .app, deterministic zip 63 MB); a clean-stranger unzip outside the seat booted it windowed painting LIVE from a seeded sim (HUD DataBus: LIVE ws://localhost:8765, facade_roof.temp=27.972, bindings 6/6). Editing ONE line of the shipped viewer.cfg (url= ws://localhost:8765 -> ws://localhost:8766) and re-running the SAME binary repointed it to a second independent live source (HUD DataBus: LIVE ws://localhost:8766, facade_roof.temp=14.871, bindings 6/6) — the executable's mtime IDENTICAL before and after (1783710362), no re-export. Negative control: a bogus model= failed LOUD on boot (ERROR: Cannot open file / Failed loading resource / viewer: failed to load scene, bindings 0/6), never a silent blank. Harvest landed + self-verified: twin_ship.sh gained a --retarget mode (swaps model/map/recording in an already-shipped artifact, asserts binary mtime unchanged + url= untouched, --json manifest) — it swapped the optimized .tscn for the raw .glb in the dist artifact with mtime provably unchanged and the same binary booting the swapped model painted 6/6. One machine: Apple M3 Pro, Metal 4.0 Forward+, macOS Darwin 25.5, Godot 4.6.3.stable, shadows off, unsigned/Gatekeeper-warned build."
timestamp: 2026-07-10T20:20:00+01:00
tags:
  [
    twin-ship,
    retarget,
    data-beside-build,
    url,
    live-source,
    same-binary,
    no-re-export,
    packaging,
    macos,
    negative-control,
    metal,
    unsigned,
  ]
---

# twin-ship retarget — the shipped twin, repointed to a new live source by one line

The prior ship finding (`twin-ship-2026-07-10.md`) proved the packaging + the **`model=`** swap contract
(bogus/renamed model, same binary, mtime unchanged). This unit's NEW contribution is the cross-**SOURCE**
retarget: the same shipped artifact repointed to a **different live `ws://` source** by editing the one
line that is the site's to own — `url=` — with the binary never rebuilt. Packaging is not re-proven here;
see the prior finding for artifact sizes, the exclude-filter, and the macOS layout contract.

## Provenance (what ran where)

Run from the disposable seat **`xt-poc2`** (the Schependomlaan real-building BIM twin, 6/6 bindings green).
The seat was shipped with `tools/twin_ship.sh --preset macOS` (hand-authored `export_presets.cfg`, the
SKILL's recommended macOS preset). The **artifact** (the deterministic zip) was unzipped to a clean scratch
path **outside any project** and run there. The two live sources are two `tools/sim/server.js` instances —
seed 42 on `:8765` and seed 1337 on `:8766`, both `--map binding_map.json` — standing in for two sites'
feeds; the sim↔**MQTT-bridge** protocol swap on this same seat is proven separately in
`twin-mqtt-live-seat-2026-07-10.md` (no broker was stood up here — this unit is about the `url=` retarget,
not re-proving MQTT). Machine: Apple M3 Pro, Metal 4.0 Forward+, macOS Darwin 25.5, Godot **4.6.3.stable**.

This is a digital-twin **visualization** repointed to a new data source — not a simulation.

## The retarget — the verbatim one-line diff (the centerpiece)

Editing the shipped `viewer.cfg` beside the executable, nothing else:

```diff
--- viewer.cfg.before
+++ viewer.cfg   (Schependomlaan_opt.app/Contents/MacOS/viewer.cfg)
@@ -6,7 +6,7 @@
 ; Optimized runtime scene from twin_build (node names carry IFC GlobalIds).
 model="data/Schependomlaan_opt.tscn"
 ; Live data source — the seeded sim (tools/sim/server.js --map binding_map.json --port 8765).
-url="ws://localhost:8765"
+url="ws://localhost:8766"

 [twin]
 ; Tag->GlobalId binding map (the sim derives its tags + ranges from it).
```

One line. `model=`, `binding_map=`, and every comment untouched.

## Same binary — the unchanged-mtime proof

The in-bundle executable `Schependomlaan_opt.app/Contents/MacOS/Xenodot Twin Viewer` had mtime
**`1783710362`** before the edit, after the edit, and after the retargeted boot — **identical** across all
three. The config is read fresh at each boot; nothing was re-exported. A site repoints `url=` with a text
edit; re-export only when the _code_ changes.

## Before / after — the same artifact painting from two live sources (windowed, real GPU)

Two windowed boots of the SAME binary (viewer's own `--screenshot`, 1280×720, Metal 4.0 Forward+):

| boot   | shipped `url=`        | HUD source                            | live value (facade_roof.temp) | bindings |
| ------ | --------------------- | ------------------------------------- | ----------------------------- | -------- |
| before | `ws://localhost:8765` | `DataBus: LIVE (ws://localhost:8765)` | `27.972` (seq 255)            | 6/6      |
| after  | `ws://localhost:8766` | `DataBus: LIVE (ws://localhost:8766)` | `14.871` (seq 98)             | 6/6      |

The building (green roof, gold facade, six sensor markers) painted in both; the HUD's source URL and the
live temperature differ — the same shipped viewer bound to a **different** live feed, no rebuild.
Screenshots: seat `spikes/ship-retarget/before_8765.png`, `after_8766.png`.

## Negative control — a bogus `model=` fails LOUD, never blank

Editing the shipped `model=` to a nonexistent `data/NOPE.tscn` and re-running the same binary headless:

```
ERROR: Cannot open file '.../data/NOPE.tscn'.
ERROR: Failed loading resource: .../data/NOPE.tscn.
ERROR: viewer: failed to load scene 'data/NOPE.tscn'
viewer: bindings resolved 0/6
```

Loud on the first boot — never a silent blank window. (The message is the `.tscn` `load()` path's; the raw
`.glb` path reports `failed to read model '…' (error 7)` — same contract, both loud.) The honesty is part
of the contract: a receiver who fat-fingers a swap sees it immediately.

## Harvest landed + self-verified — `twin_ship.sh --retarget`

The by-hand `url=` flip above is the site's deployment edit. The harvest makes the _data-file_ retarget a
first-class, asserted tool capability rather than a hand-run swap:

```
tools/twin_ship.sh --retarget dist/Schependomlaan_opt-macos --model models/Schependomlaan.glb --json
```

swapped the optimized `.tscn` for the raw `.glb` inside the already-shipped artifact and reported:

```
twin-ship: PASS retarget — model=data/Schependomlaan.glb swapped; binary mtime UNCHANGED (1783710361); url= untouched (ws://localhost:8765)
twin-ship: PASS retarget --json manifest (…/retarget.json)
    viewer: model loaded from data/Schependomlaan.glb
    viewer: bindings resolved 6/6
twin-ship: PASS retarget smoke — the swapped model booted painted from data/ (same binary)
```

The mode copies the new model/map/recording into `data/`, rewrites `viewer.cfg`, **asserts** the binary
mtime is unchanged and `url=` is untouched (fails loud if either moves), boots the same binary as a smoke
(model loaded + bindings > 0; SKIP loud on a non-host binary), and `--json` writes `retarget.json` — a
manifest of exactly what a stranger may swap. (Here the two model forms are the same building — optimized
`.tscn` ↔ raw `.glb`, both bind 6/6 — proving the file-swap mechanism; a genuinely different building
retargets the same way.) Also shipped: SKILL §"Retargeting a shipped artifact" (the receiver contract
table) and `docs/process/data-beside-build.md` (the durable rule).

## Caveats (honest scope)

- **One machine** — Apple M3 Pro, Metal 4.0 Forward+, macOS Darwin 25.5, Godot 4.6.3.stable, shadows off.
- **Unsigned build** — not code-signed or notarized (out of scope). On another Mac, Gatekeeper warns on
  first open; the shipped `README.txt` states this and gives the two ways past it. This finding does not
  claim a signed artifact — it isn't.
- **Two seeded sims, not a live broker** — the `url=` retarget is proven between two `ws://` sim sources;
  the sim↔MQTT-bridge protocol swap is proven separately (`twin-mqtt-live-seat-2026-07-10.md`). No hosted
  live web demo is implied — Pages demos are `url=""` playback by construction
  (`docs/process/live-sources-not-hostable.md`).
- **`--retarget` verified with two model _forms_ of one building** (`.tscn`/`.glb`); the mechanism, not a
  second building, is what this seat proved.
