---
name: twin-optimize
agents: [twin-architect, scene-optimizer]
description: >-
  Scale a digital-twin viewer to large instance counts without lying to yourself about fps — the
  chunked-MultiMesh recipe (measured to 1M instances), the occlusion-culling toggle discipline (it
  can be net-NEGATIVE), and the benchmark methodology that survives macOS (frames-drawn deltas,
  vsync off, warmup). Use when the walkthrough stutters, when a frame budget must hold at N
  instances, when deciding chunked vs single MultiMesh, when tempted to enable occlusion culling
  "because more culling is better", or when any fps number is about to go in a report. NOT the
  import pipeline (twin-import) and NOT data binding (twin-bind-data).
---

# Twin optimize (chunking, culling, honest benchmarks)

Every number below is **measured** (Phase 0 spike S3, 1M-instance factory layout, macOS Metal;
record: `library-twin/findings/twin-spike-verdicts-2026-07-08.md` — twin knowledge reads/writes
go through the project's `library-twin/` mount, the engine-invisible symlink to its canonical
home `plugin-twin/library/`; the base plugin's knowledge stays on `library/`). The recipes
generalize; the exact percentages are one machine's — re-measure on the target hardware before
promising a budget.

## Recipe — chunked MultiMesh

Split the instance field into a **chunk grid** of MultiMeshInstance3D nodes (one MultiMesh per
chunk per mesh type) instead of one giant MultiMesh. Chunks give the frustum/occlusion culler
units it can actually reject; a single MultiMesh is all-or-nothing.

- **8×8 grid proven; 64–256 chunks is the sane band.** Too few → nothing culls; too many →
  per-object overhead eats the win.
- **`instance_count` MUST be set BEFORE `buffer`** — assigning the buffer first silently fails.
- Buffer layout (TRANSFORM_3D, no color/custom): **12 floats per instance**, the 3×4 transform
  **row-major** — per row: basis column x/y/z components then origin. Build
  `PackedFloat32Array`s per chunk; `buffer = buf` after `instance_count = buf.size() / 12`.
- Shadows off on instanced field meshes unless the look needs them (isolates instancing cost).

### Measured trade-off (1M instances) — chunking is camera-dependent

| Vantage                    | single → chunked fps | primitives      | verdict                    |
| -------------------------- | -------------------- | --------------- | -------------------------- |
| walkthrough (inside)       | 84.4 → 117.6 (+39%)  | −92% (18M→1.4M) | chunked wins big           |
| overview (full visibility) | 81.9 → 72.1 (−12%)   | same 18M        | chunked LOSES (more draws) |

So: **the primary camera decides.** A walkthrough viewer chunks; an overview dashboard may be
better single/coarse. When both matter, chunk and accept the overview tax — but say so in the
report, with both vantages measured.

## Occlusion culling — toggle discipline (it can be net-negative)

Godot's occlusion culling is a **CPU Embree raster** every frame — it costs before it saves.
On flat/open scenes it is **net-NEGATIVE**: the spike's occ-off control run beat the occ-on
run on the same scene. Rules:

- **Always ship it toggleable** (a flag / project-setting switch), never as the only path.
- **Report primitive reduction alongside fps** — a big primitive drop with flat fps means the
  bottleneck is elsewhere; fps alone can hide that occlusion is pure cost.
- Requires the project setting `rendering/occlusion_culling/use_occlusion_culling = true`
  (plus `get_viewport().use_occlusion_culling` at runtime).
- **Explicit `OccluderInstance3D` + `BoxOccluder3D` needs NO bake** — baking is only for
  deriving occluders from arbitrary meshes. Hand-placed box occluders on walls work at runtime.

## Benchmark methodology (how not to lie)

`tools/bench_scene.gd` implements this; keep the discipline even ad hoc:

- **fps = `Engine.get_frames_drawn()` delta / elapsed** — the only trustworthy number on
  macOS. When the window is occluded, macOS suspends drawing: `frame_post_draw` stops firing
  and the process loop keeps spinning, so **process-loop fps lies**. Keep the window
  `ALWAYS_ON_TOP` + foregrounded for the whole run; report `process_fps` separately if at all.
- **vsync OFF** (`display/window/vsync/vsync_mode = 0`) — otherwise everything clamps to 60/120
  and deltas vanish.
- **Warm up ~2 s, measure ~8 s** per config; average Performance monitors
  (`RENDER_TOTAL_DRAW_CALLS_IN_FRAME`, `RENDER_TOTAL_PRIMITIVES_IN_FRAME`,
  `RENDER_TOTAL_OBJECTS_IN_FRAME`) over the window.
- **Before/after, same vantage(s), both vantage classes** — see the trade-off table for why a
  one-vantage result can invert.
- Not headless — rendering benchmarks need a display by nature. Headless runs must SKIP loudly,
  never fabricate.

## Phase 2 TODO — honest boundaries

The following are NOT yet proven recipes; treat them as open work, not folklore:

- **LOD / `visibility_range_*`** — no measured recipe yet (which distances, hysteresis, per
  mesh type). Do not present visibility ranges as a proven win until benched here.
- **Automatic chunk-size selection** — the 64–256 band is empirical at 1M instances on one
  layout; no formula for arbitrary models/instance densities yet.
- **Calibrated frame-budget defaults per hardware tier** — budgets are per-project statements
  today.
- **Occluder authoring from IFC geometry** (walls → BoxOccluder3D automatically) — unproven.
- **Interaction with runtime-loaded GLB scenes** (twin-import) at scale — the spike instanced
  procedural meshes; re-instancing a loaded GLB into MultiMesh chunks is designed, not proven.

## RTK note

Prefix shell commands with `rtk` as usual (`rtk $GODOT …` passes through). Never reference rtk
inside `.gd` files.
