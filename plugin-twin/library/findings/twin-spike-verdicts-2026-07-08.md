---
type: finding
title: "Phase 0 spike verdicts — IFC import (S1), live data (S2), scale (S3)"
description: "All three risks retired: IFC→GLB+sidecar joins by GlobalId in ~1.1 s (py3.12 venv only); WebSocket stream clean at 10 Hz with 4 peer gotchas; chunked MultiMesh +39% fps walkthrough at 1M but −12% overview, occlusion net-negative on flat scenes."
timestamp: 2026-07-08T12:00:00+01:00
tags: [ifc, gltf, multimesh, occlusion, websocket, benchmark]
---

# Phase 0 spike verdicts — IFC import (S1), live data (S2), scale (S3)

Evidence: `twin-spikes/` (s1-ifc/convert.py + godot/headless_check.gd, s2-live/viewer/DataBus.gd

- sim/server.js, s3-scale/main.gd + results.json). These verdicts seeded the twin-import /
  twin-bind-data / twin-optimize skills; numbers are one machine's (macOS, Metal) — recipes
  generalize, percentages don't automatically.

## S1 — IFC → GLB + sidecar (VERDICT: works, fast, one env trap)

- **Toolchain**: ifcopenshell **0.8.5** in a **Python 3.12** venv (`uv venv --python 3.12`) —
  system Python 3.14 has NO ifcopenshell wheel. This is the only setup trap.
- **The join key**: gltf serializer with serializer setting `use-element-guids` = True → GLB
  node names ARE the IFC GlobalIds. Sidecar JSON keyed by GlobalId from
  `ifcopenshell.util.element.get_psets()` (`json.dump` needs `default=str`).
- **Perf**: Duplex sample (2.3 MB IFC) → GLB + sidecar in **~1.1 s** wall-clock.
- **Runtime load**: `GLTFDocument.append_from_file()` + `generate_scene()` — no editor import,
  works `--headless`. Join verified headless at ~100% of mesh nodes (guid on node or parent;
  Godot name-dedup handled by 22-char prefix match).
- **Gotcha**: canonical buildingSMART sample URLs are DEAD; working mirror
  `raw.githubusercontent.com/andyward/XBimDemo/master/Xbim.TestApp/Duplex_A_20110907.ifc`.
  Validate any download: file must start `ISO-10303-21`.

## S2 — live data over WebSocket (VERDICT: clean at 10 Hz; peer has 4 sharp edges)

- 10 Hz × 5 tags for 30 s: 0 drops, sub-ms same-machine latency, survives sim kill/restart.
- **The four gotchas** (each independently breaks the stream): `poll()` every frame; drain ALL
  packets per frame (not one); `connect_to_url` is async — gate on `get_ready_state()`; fresh
  `WebSocketPeer` per reconnect + reset seq tracking on disconnect (else phantom drops).
- **Fixture pattern**: seeded (mulberry32) simulator ⇒ deterministic per (seed, tick) ⇒ binding
  smoke can assert exact expectations instead of flaking.

## S3 — scale via chunked MultiMesh (VERDICT: camera-dependent win; occlusion toggleable)

1M instances, 8×8 chunk grid (64–256 chunks = sane band), `instance_count` before `buffer`,
12 floats/instance row-major:

| Vantage              | single → chunked fps | primitives      |
| -------------------- | -------------------- | --------------- |
| walkthrough (inside) | 84.4 → 117.6 (+39%)  | −92% (18M→1.4M) |
| overview (full vis)  | 81.9 → 72.1 (−12%)   | unchanged (18M) |

- **Chunking wins walkthroughs, loses overviews** — the primary camera decides; ship toggleable.
- **Occlusion culling = CPU Embree raster, net-NEGATIVE on flat scenes** (occ-off control run
  won). Always toggleable; report primitive reduction alongside fps. Needs project setting
  `rendering/occlusion_culling/use_occlusion_culling`; explicit `BoxOccluder3D` needs no bake.
- **Benchmark honesty on macOS**: measure `Engine.get_frames_drawn()` deltas — window occlusion
  freezes rendering and makes process-loop fps a phantom number; vsync_mode=0; keep the window
  always-on-top + foreground for the whole sweep.
