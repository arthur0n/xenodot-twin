---
name: twin-verify
agents: [twin-architect, scene-optimizer, data-binder]
description: >-
  Verify a digital-twin viewer actually works — the base xenodot:godot-verify layers (property
  validation, smoke run, render health) PLUS the three twin-specific gates none of them cover: the
  frame-budget gate (bench vs the stated budget), the data-binding smoke (seeded sim → assert
  overlay state moved), and the GlobalId join coverage check. Use after ANY .tscn/.gd change in the
  viewer and before claiming work done — and specifically before reporting a performance win (budget
  gate), a binding feature (binding smoke), or a fresh model import (join coverage). The composed
  gate is tools/verify_twin.sh.
---

# Twin verify (base floor + twin gates)

Verification is layered: the **base floor is `xenodot:godot-verify`** — do not reimplement it.
Then three twin-specific gates catch what a game-shaped verify never looks for: a viewer that
renders beautifully but misses its frame budget, paints no live data, or lost its join keys.

`tools/verify_twin.sh` composes the static floor (the shared `tools/lib/checks.sh` functions —
the same library `validate.sh` composes) plus the twin checks. Run it from the project root.

## Step 1 — DELEGATE to `xenodot:godot-verify` (the floor)

Load and follow the base skill `xenodot:godot-verify` for property validation (silently-dropped
properties), the headless smoke run, and render health (windowed). Its layers, pass criteria,
hand-authoring rules, and error table apply to the viewer unchanged — this skill does not
restate them. `tools/verify_twin.sh` runs its layers 1–2 equivalent via the shared check
library; the windowed render layer remains yours to run per that skill when an entry-point
scene changed.

Everything below is what the base skill does NOT cover.

## Step 2 — frame-budget gate (twin)

The architect's design doc states a frame budget (fps floor, vantage, instance count). Gate it:

```bash
$GODOT --path . -s tools/bench_scene.gd -- <scene.tscn> --vantage <name-or-pos> --out .xenodot/bench/<slug>.json
```

- fps is the **frames-drawn delta** number, vsync off — the methodology contract is in
  `twin-optimize`; `bench_scene.gd` implements it (warmup, measure window, monitor averages).
- **PASS** iff measured fps ≥ budget at the stated vantage/count. For an optimization slice,
  the report needs BEFORE and AFTER rows, both vantage classes.
- Headless / no display: the bench **SKIPs loudly** (exit 0, `BENCH: SKIP`) — a SKIP is not a
  pass; say "budget gate not run (no display)".

## Step 3 — data-binding smoke (twin)

Proves the live path end-to-end: stream → DataBus → binding → visible state. Contract (the
fixture discipline lives in `twin-bind-data`):

1. Start the seeded simulator with a **fixed seed**: `node sim/server.js --seed 42 &`.
2. Run the viewer for a bounded window (~10 s is plenty at 10 Hz).
3. Assert from `DataBus.stats()` and scene state, machine-readable:
   - `frames_received > 0` (stream arrived),
   - `drops == 0` (clean run — the sim is deterministic; drops mean a bus bug),
   - each bound node's state **moved** (albedo/label changed from its initial value) — a
     viewer that connects but paints nothing must FAIL here.
4. Kill the sim; emit `BIND-SMOKE: OK — <n> tags, <m> frames, 0 drops` or
   `BIND-SMOKE: FAIL — <reason>`.

Run it after ANY binding/overlay change. Without a display the state asserts still run
headless; only the "visibly rendered" claim needs the windowed render layer (step 1).

## Step 4 — GlobalId join coverage (twin)

After any model (re)import or join-code change, run the headless join check from `twin-import`
(load GLB, collect meshes, join against the sidecar) and gate on the ratio:

- `JOIN=<joined>/<total>` — **PASS** at ~100% of mesh nodes (a handful of legitimately
  unnamed helper nodes may miss; a double-digit miss rate is a broken conversion).
- On FAIL, diagnose from `MISS_SAMPLE` per the `twin-import` error table — never carry a
  low-join model into binding work.

## Pass criteria

1. `xenodot:godot-verify` floor: per that skill (verify_twin.sh runs its headless layers;
   windowed render per the base skill when an entry-point scene changed).
2. Frame-budget gate: measured fps ≥ budget at the stated vantage, or an explicit SKIP with
   reason (no display / no budget stated — the latter is an architect finding, not a pass).
3. Binding smoke: `BIND-SMOKE: OK` for any binding/overlay change.
4. Join coverage: `JOIN` ~100% for any import/join change.

If the engine binary or a display is unavailable: say so explicitly — never claim a layer you
didn't run.

## RTK note

Prefix shell commands with `rtk` as usual. `tools/verify_twin.sh`, `$GODOT`, and
`node sim/server.js` run without an rtk filter (passthrough). Do not pipe gate output into
`rtk grep` — it can hide FAIL lines; use plain `grep` inside pipes.
