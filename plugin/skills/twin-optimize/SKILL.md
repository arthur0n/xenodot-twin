---
name: twin-optimize
agents: [twin-architect, scene-optimizer]
description: >-
  Scale a digital-twin viewer to large instance counts without lying to yourself about fps — the
  chunked-MultiMesh recipe (measured to 1M instances), the occlusion-culling toggle discipline (it
  can be net-NEGATIVE), and the benchmark methodology that survives macOS (frames-drawn deltas,
  vsync off, warmup). Use when the walkthrough stutters, when a frame budget must hold at N
  instances, when deciding chunked vs single MultiMesh, when tempted to enable occlusion culling
  "because more culling is better", when an imported twin model should get the toolkit applied
  automatically (tools/optimize_scene.gd), or when any fps number is about to go in a report.
  NOT the import pipeline (twin-import) and NOT data binding (twin-bind-data).
---

# Twin optimize (chunking, culling, honest benchmarks)

Every number below is **measured** (Phase 0 spike S3, 1M-instance factory layout, macOS Metal;
record: `library/findings/twin-spike-verdicts-2026-07-08.md` — twin knowledge is folded into the
one plugin, so reads/writes go through the project's `library/` mount, the engine-invisible symlink
to its canonical home `plugin/library/`, beside the base framework knowledge). The recipes
generalize; the exact percentages are one machine's — re-measure on the target hardware before
promising a budget.

## Scene optimizer — `tools/optimize_scene.gd` (headless)

Mechanizes the toolkit below on an imported twin model. No editor import needed (.glb loads at
runtime via GLTFDocument), deterministic, headless-safe, exit 0 = optimized scene + report:

```sh
$GODOT --headless --path . --script tools/optimize_scene.gd -- \
    --in=<model.glb|scene.tscn> --out=<optimized.tscn> --report=<report.json> \
    [--chunks=auto|<int>] [--target-per-chunk=32] [--min-instances=8] \
    [--hints=<hints.json>] [--occluders] [--occluder-min-volume=10.0] [--vis-ranges]
```

Passes, in order:

- **Instancing (always on).** Groups MeshInstance3Ds by (mesh resource, `material_override`);
  nodes with per-surface override materials are skipped — MultiMeshInstance3D cannot express
  them. Groups with ≥ `--min-instances` (default 8) collapse into region-chunked
  MultiMeshInstance3D fields: the group's world AABB gridded `grid`×`grid` on the XZ plane,
  instances bucketed by origin, one MultiMesh per non-empty cell with a correct per-chunk
  `custom_aabb` so the frustum culler gets real units (chunk nodes sit at identity;
  `instance_count` set BEFORE `buffer`).
- **Chunk grid is AUTO by default (`--chunks=auto`).** The grid is derived **per group** from
  its instance count so every cell holds ~`--target-per-chunk` instances (default 32):
  `cells = ceil(N / target); axis = clamp(ceil(sqrt(cells)), 1, 32)`. This is the fix for the
  fixed-grid regression (below): a fixed 8×8 over 100-instance groups made ~2 instances/chunk
  and 14,336 near-empty multimeshes. **`--chunks=<int>`** forces a fixed global grid for every
  group (escape hatch). **Knob guidance:** lower `--target-per-chunk` (finer chunks) for a
  **walkthrough** camera that wants aggressive frustum culling; raise it (coarser, fewer draws)
  for an **overview/aerial** dashboard. 32–64 validated at ~100-instance groups. Report records
  the chosen `grid` per group in `per_group` and `target_per_chunk` at top level.
- **Colors ready for binding.** Every emitted MultiMesh sets `use_colors = true` and initializes
  all instance colors to **white**, so the binding runtime can drive `set_instance_color(i, …)`
  per instance later without re-emitting the field. With colors on the buffer stride is **16
  floats/instance** (12-float transform + 4-float RGBA, color written inline as white);
  `use_colors` MUST be set BEFORE `instance_count`/`buffer`. Getters (`get_instance_color`,
  `get_instance_transform`) are RenderingServer-backed — they return stubs under `--headless`;
  verify colors/transforms on a **windowed** run (empirically confirmed set/get + transforms
  intact this way; the buffer itself serializes correctly headless).
- **GlobalId join preserved.** Every chunk node carries `meta "twin_globalids"` — a
  PackedStringArray of the original node names ordered by instance index — and the report
  embeds the same map (`globalid_map`), so data binding can still resolve
  instance → GlobalId (`set_instance_color` per instance later). Caveat: the stored name is
  the MeshInstance3D's own; models that keep the guid on a parent grouping node need the
  node-or-parent fallback applied BEFORE optimizing.
- **`--hints=<hints.json>` (opt-in, schema v1).** A property sidecar that overrides per-node
  behavior by GlobalId. Keys are 22-char GlobalIds matched against node names (exact, else the
  22-char prefix — the same dedup-suffix rule the join gate uses). A matched node is kept **out
  of the instancing pass** (survives as an addressable MeshInstance3D) and materialized per the
  contract table below. Report records `hints_file`, `hints_applied` (matched nodes) and
  `hints_unmatched` (hint ids that matched no node — a data-quality signal, listed not fatal).

  ```json
  {
    "version": 1,
    "hints": {
      "<22-char GlobalId>": {
        "no_instance": true,
        "occluder": true,
        "lod_end": 40.0,
        "tags": ["pump_1"]
      }
    }
  }
  ```

  | hint field         | effect on the surviving node (exact names = gate contract)                                                       |
  | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
  | `no_instance:true` | excluded from grouping; `add_to_group("twin_no_instance", persistent)`                                           |
  | `occluder:true`    | `add_to_group("twin_occluder", persistent)` + forced occluder child (90%-shrink box, even without `--occluders`) |
  | `lod_end:<float>`  | `visibility_range_end = <float>` + `set_meta("twin_lod_end", <float>)`                                           |
  | `tags:[…]`         | `set_meta("twin_tags", PackedStringArray(tags))`                                                                 |

- **`--occluders` (opt-in, MEASURED — recipe below).** Any remaining un-instanced mesh whose
  world-AABB volume exceeds `--occluder-min-volume=` (default 10 m³) gets a child
  `OccluderInstance3D` with a `BoxOccluder3D` sized to 90% of its local AABB — the shrink avoids
  self-occlusion artifacts, explicit box occluders need no bake. The default gate is now the benched
  **scoped winner** (big on many-unique-mesh scenes at street level; net-negative on single
  buildings, no-op on instanced/aerial) — recipe + numbers below and in
  `library/findings/twin-occluder-recipe-2026-07-10.md`.
- **`--vis-ranges` (opt-in, MEASURED — recipe below).** Size classes by world-AABB diagonal:
  small (< 0.5 m) → `visibility_range_end = 40` m; medium (< 2 m) → 120 m; large → untouched
  (structure must never pop out). Un-instanced meshes only — chunked fields already cull per
  chunk. The defaults are now the benched **scoped winner** (big on many-unique-mesh scenes; skip
  it on single buildings / instanced scenes) — recipe + numbers below and in
  `library/findings/twin-vis-range-recipe-2026-07-09.md`.

Report JSON: `chunks` (`"auto"` or the fixed int as a string), `target_per_chunk`,
`meshes_before`, `nodes_before/after`, `groups_total/instanced`, `multimeshes`,
`instances_total`, `skipped_surface_override`, `occluders_added`, `vis_ranges_set`,
`est_draw_items_before/after` (one item per mesh-surface / per chunk-surface),
`globalid_map(_size)`, `hints_file`, `hints_applied`, `hints_unmatched`,
`per_group` (each instanced group records its chosen `grid`).

Gotchas baked into the tool (learned the hard way):

- `Node3D.global_transform` silently returns identity during `SceneTree._init` — wait one
  `process_frame` before reading transforms, or every instance lands in one chunk at origin.
- `PackedScene.pack()` silently DROPS any node whose `owner` is unset — own every descendant
  before packing.
- Runtime-loaded GLB meshes have no `resource_path`, so they serialize inline into the output
  `.tscn` (duplex: 286 meshes → 465 KB text); pass an `.scn` out-path for big models.

### Measured on real BIM (duplex.glb, 286 meshes) — instancing rarely wins there

At defaults, duplex has **224 distinct mesh groups in 286 meshes**: only 3 groups
(30 instances) instanced, est draw items 348 → 340. Even at `--min-instances=2`: 26 groups /
88 instances → 84 multimeshes, still 348 → 340. **Real IFC geometry is mostly unique.** The
instancing pass pays off on repeated-equipment scenes — synthetic control, 2000 nodes sharing
3 meshes: 3 groups → 192 chunks, nodes 2001 → 194, est draw items 2000 → 192, all 2000
GlobalIds preserved and unique after round-trip. On unique-geometry architecture the
`--occluders` / `--vis-ranges` passes are what remain to tune (duplex: 31 occluders,
47 vis ranges) — and their fps effect must be benched per the methodology below, not assumed.

### Measured on a real composite scene (city block of duplexes, M3 Pro Metal)

Full record: `library/findings/twin-optimizer-benchmark-2026-07-08.md`. duplex.glb
duplicated 20x20 (114,400 meshes) and optimized with `--chunks=2` (optimizer wall-clock 1.3 s):

- **Aerial (all visible): 27.3 → 119.4 fps (+337%, ≥4.4x — the after is still pinned at the
  macOS 120 Hz presentation cap)**; frame 36.6 → 8.4 ms; render-thread submit 28.98 → 0.56 ms
  (−98%); draw calls 21,787 → 1,084.
- Street level: 99.3 → 120 fps (cap-limited); render-thread 7.46 → 0.37 ms (−95%).
- **The old fixed default `--chunks=8` REGRESSED the same scene at 10x10** (~100 instances/group
  → ~2 instances per chunk, 14,336 multimeshes): aerial 120 → 50.3 fps. Chunk count must match
  instance density — this is why **auto per-group grid is now the default** (see below).
- macOS caps frame presentation at the display refresh (120 Hz) even with `VSYNC_DISABLED` —
  an empty scene benches at exactly 120. At the cap, compare `cpu_ms` (viewport measured
  render time, now in `bench_scene.gd`; `gpu_ms` reads 0 on this Metal setup), not fps.
- Forward+ already auto-merges repeated identical surfaces (49,458 objects → 6,802 draw
  calls unoptimized), so `est_draw_items` overstates before-cost; the real win is per-object
  cull/sort/submit overhead. `--occluders`/`--vis-ranges` are no-ops on fully-instanced
  scenes (0 added). Join gate on the optimized composite: 28,600/28,600 ids (100%) via
  `twin_globalids` metas.

### Auto-chunk default — measured (10x10 city, 28,600 meshes, M3 Pro Metal)

`--chunks=auto --target-per-chunk=32` (now the default) picks a **per-group 2×2 grid** for the
~100-instance groups (`ceil(100/32)=4 cells → axis 2`), emitting **1,140 multimeshes** — the
sane band, NOT the 14,336 the old fixed 8×8 produced. It **matches the hand-picked `--chunks=2`
optimum**:

- **Aerial: 119.7 fps** at auto(t32) vs the 120-cap of hand-tuned `--chunks=2`; the old fixed
  `--chunks=8` default had regressed the same scene to **50.3 fps**. Street 120 fps (cap).
- Join preserved: **28,600/28,600 ids (100%)** via `twin_globalids` on the auto output.
- `--target-per-chunk` trades walkthrough-culling vs overview-draws: t64 gives a coarser grid
  (fewer draws, aerial pinned at the 120 cap too); **32–64 both validated at ~100-instance
  groups** — lower for walkthrough, higher for overview.
- Emission stays fast: the full 28,600-instance city (load → group → chunk → emit 1,140
  MultiMeshes with 16-float color buffers → save 2.1 MB `.scn`) is **~0.5 s wall-clock**.
- **Hands-on walkthrough of this exact recipe** (generate the 10×10 city → optimize auto vs the
  forced `--chunks=8` regression vs hand-tuned `--chunks=2` → join gate → bench both vantages by
  hand, with the honest duplicate-GlobalId caveat): `docs/tutorials/city-scale-demo.md`. Reproduced
  this session on a 60 Hz window — fps flat at the cap, the win read off `cpu_ms` (aerial
  5.17 → 1.20 ms, −77%) and draw calls (5,559 → 1,084), c8 forced worse than unoptimized
  (7.21 ms) — matching this finding's shape on a different display cap.

## Recipe — chunked MultiMesh

Split the instance field into a **chunk grid** of MultiMeshInstance3D nodes (one MultiMesh per
chunk per mesh type) instead of one giant MultiMesh. Chunks give the frustum/occlusion culler
units it can actually reject; a single MultiMesh is all-or-nothing.

- **Match chunk size to instance density** (tens of instances per chunk); the optimizer's auto
  grid does this per group (`ceil(sqrt(ceil(N / target_per_chunk)))`, target 32). Too few chunks
  → nothing culls; too many → per-object overhead eats the win (the fixed-8×8 regression above).
- **`instance_count` MUST be set BEFORE `buffer`** — assigning the buffer first silently fails.
  Same for **`use_colors` — set it BEFORE `instance_count`/`buffer`** or the stride is wrong.
- Buffer layout is **12 floats/instance** for TRANSFORM_3D (the 3×4 transform **row-major** — per
  row: basis column x/y/z then origin), **+4 RGBA floats when `use_colors` is on** → 16-float
  stride, color quad written inline after the transform. The optimizer sets `use_colors=true` and
  writes every instance white so the binding runtime can `set_instance_color` later; verify
  colors on a **windowed** run (RenderingServer getters stub under `--headless`).
- Shadows off on instanced field meshes unless the look needs them (isolates instancing cost).

### Measured trade-off (1M instances) — chunking is camera-dependent

| Vantage                    | single → chunked fps | primitives      | verdict                    |
| -------------------------- | -------------------- | --------------- | -------------------------- |
| walkthrough (inside)       | 84.4 → 117.6 (+39%)  | −92% (18M→1.4M) | chunked wins big           |
| overview (full visibility) | 81.9 → 72.1 (−12%)   | same 18M        | chunked LOSES (more draws) |

So: **the primary camera decides.** A walkthrough viewer chunks; an overview dashboard may be
better single/coarse. When both matter, chunk and accept the overview tax — but say so in the
report, with both vantages measured.

## Recipe — visibility ranges (`--vis-ranges`), measured

`--vis-ranges` sets `visibility_range_end` on un-instanced meshes by size class (small < 0.5 m
diagonal → 40 m, medium < 2 m → 120 m, large untouched) — a hard distance cull with **no fade**.
Swept 6 configs × 3 real-shaped scenes on M3 Pro Metal (full record:
`library/findings/twin-vis-range-recipe-2026-07-09.md`, seat sweep `a6c0707`). Verdict:
**SCOPED WIN** — big on many-unique-mesh scenes, essentially nothing on single buildings, no-op on
fully-instanced scenes.

- **Reach for it on many-unique-mesh scenes** — heterogeneous clutter / plant-fitting regime, or a
  single model's un-instanced leftovers when there are _thousands_ of them. On the 28,600-unique
  city: aerial `cpu 4.13 → 2.81 ms (−32%)` at defaults, `→ 1.19 ms (−71%)` coarser,
  `fps 163 → 530`; street `0.99 → 0.90 (−9%)` default to `0.54 (−45%)` aggressive. The win scales
  with the count of small/medium unique meshes and camera distance.
- **Skip it on single buildings / small unique-mesh counts.** The optimized duplex (256
  un-instanced leftovers) is **flat at street** (nothing culls at walkthrough distance) and
  ≤0.04 ms at aerial only with the most aggressive cutoff on a 0.15 ms scene — not worth the flag.
- **No-op on fully-instanced scenes** — the instancing pass consumes every repeated mesh, so the
  vis pass sets **0 ranges** (negative control asserted). `--vis-ranges` only matters on
  mostly-unique geometry.
- **Use the defaults (0.5/2 → 40/120).** They are the perceptually-clean winner (frame-reviewed
  CLEAN at street, pending human fly-through) and already capture the city-scale win. Distances
  are **absolute, not scene-relative** — the best cutoffs did NOT track scene bounds between the
  duplex and the city, so there is no AABB-derived grid here. (The sub-0.5 m small class never
  fired at default thresholds in the bench scenes — untested; re-bench for genuinely small clutter.)
- **Coarser/aggressive (1.0/4.0, 20/60) — now adoptable behind a fade, MEASURED (item #6).** They
  win more cpu but **hard-pop distant fixtures in at ~60 m** because the pass sets
  `visibility_range_end` only. The fade band closes that: `--vis-fade-margin=<m> --vis-fade-mode=self`
  makes a ranged object fade to transparency over `[end, end+margin]` instead of popping. Swept on the
  unique-mesh city at street (full record:
  `library/findings/twin-vis-fade-2026-07-10.md`, seat sweep `8118350`):
  - **Reach for the aggressive tier with `--vis-fade-margin=5 --vis-fade-mode=self`** — it retains
    **97%** of the aggressive cpu win (fade cost +0.025 ms, at/below the 0.03 ms noise floor —
    effectively free; only +162 distant fixtures / +3.3% re-enter the band) and replaces the hard pop
    with an alpha ramp. Recommended-with-caveat, **pending a human fly-through** (the standing
    convention — an agent frame-reviewed the ramp + matched-position diff, not live motion).
  - **Fallback `--vis-fade-margin=12`** is the _pop-optimal_ band (widest, smoothest ramp) but eats
    ~⅓ of the win (**69% median / 81% min retention**, +0.235 ms) — it **misses the 80% retention
    bar**. Use it only if a human judges the 5 m ramp too quick, and ship it as "aggressive-tier fade
    costs ~⅓ of the win."
  - **When NOT:** the **coarser** tier (40/120) fails retention at **both** margins (65% / 39%) — its
    wider cull radius drops far more geometry into the band; don't fade it. And **web export**: the
    fade renders under **Forward+ ONLY** — the Compatibility renderer the browser build uses treats it
    as DISABLED and **the pop returns**, so a web-bound twin can't lean on the fade to justify the
    aggressive cutoffs. Aerial fade is free (band empty from overhead). `--vis-fade-mode=deps` (fade a
    `visibility_parent` LOD chain) is unmeasured — `self` only so far.
- Same discipline as chunking: `cpu_ms` leads (cap-immune), sub-cap fps second, then
  `objects_rendered` delta; measure **both vantages** (street + aerial) — a street-only look misses
  the −32% aerial win, an aerial-only look misses that `dist_double` no-ops at street.

## Recipe — occlusion culling (`--occluders`), measured

`--occluders` gives every un-instanced mesh whose world-AABB volume exceeds `--occluder-min-volume=`
(default 10 m³) a child `OccluderInstance3D` + `BoxOccluder3D` at 90% of its local AABB — a hard
runtime cull that **costs before it saves** (Godot's occlusion culling is a CPU Embree depth raster
every frame). Swept 5 volume-gate configs × 3 real-shaped scenes on M3 Pro Metal (full record:
`library/findings/twin-occluder-recipe-2026-07-10.md`, seat sweep `6146794`). Verdict:
**SCOPED WIN** — real at street level on many-unique-mesh scenes, net-negative on single
buildings, no-op on instanced/aerial scenes.

- **Reach for it on many-unique-mesh scenes at street level (measured)** — heavy heterogeneous
  clutter where near geometry occludes far. On the 28,600-unique city at street: `cpu 1.67 → 1.52 ms
(−0.15 ms, −9%)`, `objects_rendered −55..−73%`, `draw_calls −48..−64%`, visually lossless
  (SSIM ≥ 0.9999, frame-reviewed). The near-buildings-occlude-far corridor is the live occluder cell.
  An interior vantage on such a scene is expected to win by the same mechanism but is **unmeasured**
  (the sweep's only interior cell was the single-building duplex — net-negative, below).
- **Use the 10 m³ default (kept).** It is the measured sweet spot — it ties the 5 m³ gate for best
  cpu; smaller gates (5, 2) only add occluder count for no cpu payoff (aggressive 2 m³ adds 2.4× the
  occluders for the same win), and 20 under-covers. The sweep gave **no basis for changing it**.
  `--occluder-min-volume=<m³>` exists to re-sweep the gate, not to lower the default.
- **Skip it on single buildings** — the optimized duplex is **net-negative at BOTH vantages**
  (`cpu +0.16..+0.25 ms`; on a sub-1 ms scene the depth-raster + cull overhead exceeds the few
  submits saved) **and** it over-culls visible interior geometry (in-room SSIM 0.983 — a real
  artifact). Don't enable occluders on single-building interiors.
- **No-op on fully-instanced scenes** (the instancing pass consumes every mesh → 0 occluders added,
  negative control asserted) **and from aerial/overhead vantages** (`objects_rendered` byte-identical
  across every gate — nothing sits between the camera and the scene; any cpu spread there is session
  drift, not a cull).
- **Requires `rendering/occlusion_culling/use_occlusion_culling = true`** (plus
  `get_viewport().use_occlusion_culling` at runtime) — the twin template ships it ON; a hand-rolled
  project with it OFF renders the emitted occluder nodes **inert** (setup cost, no cull). **Explicit
  `OccluderInstance3D` + `BoxOccluder3D` needs NO bake** — baking only derives occluders from
  arbitrary meshes; hand-placed / auto box occluders work at runtime.
- Same discipline as chunking/vis-ranges: **`cpu_ms` leads** (cap-immune), sub-cap fps second, then
  `objects_rendered` / primitive reduction — a big primitive drop with flat fps means occlusion is
  pure cost and the bottleneck is elsewhere. Measure **both vantage classes**, but read a per-vantage
  win by scene (aerial is a structural no-op for occlusion; only ground-level vantages can win —
  street measured, interior unmeasured).

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

## Benching a recipe — `tools/bench_sweep.sh` (the reusable sweep)

Every `--vis-ranges` / `--occluders` / fade recipe above came from the SAME loop — a matrix of
optimizer configs × camera vantages, built then benched then merged into delta rows. That loop is now
one deterministic framework tool instead of a per-spike hand-rolled driver:

```sh
tools/bench_sweep.sh <matrix.json> [optimize|bench|repeat|merge|all]
```

- **Declarative matrix (JSON).** Names the `scene_in`, the `configs` (each a name → optimizer
  `flags`), the `vantages`, a `baseline` config for deltas, and an optional `repeat` block. Loading it
  VALIDATES it — an unknown key / missing baseline / malformed config **fails loud** at the first
  stage. Worked example (recreates the fade sweep):
  `plugin-twin/examples/bench_sweep.vis-fade.example.json` — its `scene_in` is the many-unique-mesh
  city built by `plugin-twin/examples/gen_city.gd` (the scale/bench demo scene; run it to regenerate
  the exact scene the vis/occluder/fade findings measure — 10×10 duplex grid → 28,600 meshes).
- **Deterministic build, asserted.** Each config is built once with `optimize_scene.gd` (same flags
  in → same scene out); the merge ASSERTS the deterministic per-frame columns
  (`objects_rendered` / `draw_calls` / `primitives`) are byte-identical across every repeat and
  **fails loud on any variance** (a rendered scene can't change its object count run to run).
- **Interleaved repeats when the cap bites.** When `frame_ms` is pinned at the display cap (median
  ≈ 1000/refresh), `cpu_ms` is noisy and a single sequential pass can alias thermal drift onto the
  config axis (the fade sweep hit exactly this). The tool **auto-suggests** adding a `repeat` block;
  with one, it re-benches the configs in INTERLEAVED cycles at one vantage and takes the drift-cancelled
  MEDIAN as the authoritative cpu. Timings stay honestly session-bound (one machine, one thermal
  block) — say so in any report; everything else is deterministic.
- **Runs IN a project against its materialized `tools/`** — no framework-overlay logic (that was a
  spike-only need to test an unmerged branch). Same loud-stage discipline as `twin_build.sh` /
  `verify_twin.sh`; a SKIP is never a pass. The merge (`tools/bench/merge_sweep.py`) writes
  `summary.json` + prints the delta tables, flagging any `|Δcpu|` within the noise floor.
- **Perceptual mode — `tools/bench/pop_series.gd` + `tools/bench/pop_analyze.py` (the sweep's visual
  half, ffmpeg-backed).** The numeric sweep above proves the cpu/object COST of a vis/occluder/fade
  change; the perceptual pair proves its visual CHARACTER — that a hard pop became a gradual fade, not
  just a cheaper frame. They are **standalone companions** in the same `tools/bench/` family, NOT a
  `bench_sweep.sh` stage: the sweep is a headless-capable configs×vantages matrix with a
  determinism-asserted merge, whereas pop capture needs a WINDOWED process, flies a single approach
  axis (not a vantage matrix), and its ydelta/SSIM are perceptual (not deterministic) — so it stays the
  windowed adjunct you reach for after the numbers land, exactly as the fade sweep ran it (a separate
  `pop` stage after the numeric sweep). Flow:
  - `pop_series.gd` (windowed, NO `--headless` — fails loud on it) flies a dense scripted approach down
    one axis of a built config scene, one PNG per step: `$GODOT --path . --resolution 1280x720 -s
tools/bench/pop_series.gd -- <scene.scn> --out-dir <dir> --x <cx> --y <cy> --start-z <z0> --end-z
<z1> [--step 3] [--look-ahead 60]`. The coords are the scene's own axis (required, no defaults);
    the fade sweep's street approach (`--x 139.5 --y 1.7 --start-z 126 --end-z 30 --step 3`) is the
    header's worked example. Run it per config you want to compare.
  - `pop_analyze.py` (needs ffmpeg — preflighted with a clear message; it is the established sweep
    analysis dependency) diffs the frames two ways: `--adjacent <dir>` (temporal profile WITHIN a
    config — but forward-motion parallax dominates it on a dense scene) and `--matched <dirA> <dirB>`
    (same-pose diff BETWEEN two configs, motion cancelled — the real fade signal; this is what proved
    the fade genuinely active under Forward+). Emits `pop_metrics.json` + tables.
  - Output stays **frame-reviewed, pending human confirmation** — the numbers characterise the pop, a
    human still rules on the live fly-through (the standing convention). The scene to fly is the same
    one the numeric sweep built; the many-unique-mesh city those sweeps use is generated by
    `plugin-twin/examples/gen_city.gd`.

## Phase 2 TODO — honest boundaries

The following are NOT yet proven recipes; treat them as open work, not folklore:

- **Fade margin for `--vis-ranges` — DONE** (item #6, recipe in the vis-ranges section above):
  `--vis-fade-margin` / `--vis-fade-mode` benched; the aggressive tier is adoptable with margin 5
  (self) — 97% retention, Forward+ only — pending a human fly-through. Still open under it:
  `--vis-fade-mode=deps` is unmeasured (`self` only), and the sub-0.5 m small class still never fired
  at default thresholds in the bench scenes — untested; re-bench for genuinely small clutter.
- **Auto-LOD generation** (simplified proxy meshes for far ranges, procedural or via
  `ImporterMesh` LODs) — not built; `--vis-ranges` only hides, it never swaps.
- **`--target-per-chunk` sweep across scene shapes** — auto-chunk (count-driven per group) ships
  and matches hand-tuned chunks on the city bench, but the 32-default and the walkthrough-vs-
  overview knob guidance are validated at ~100-instance groups on one layout; sweep other
  densities/camera paths before promising a target for a given viewer.
- **Calibrated frame-budget defaults per hardware tier** — budgets are per-project statements
  today.
- **Semantic occluder authoring** (IFC walls/slabs/floorplan → fitted occluders) — the
  `--occluders` pass is now benched (scoped win, recipe above) but stays geometric only (AABB volume
  gate + shrunken box). Its net-negative + interior over-cull on single buildings comes from box
  occluders bracketing the camera; fitted, semantics-aware occluders from a floorplan (thin walls,
  no self-bracket) are the unproven next step that could turn the single-building case positive.

## RTK note

Prefix shell commands with `rtk` as usual (`rtk $GODOT …` passes through). Never reference rtk
inside `.gd` files.
