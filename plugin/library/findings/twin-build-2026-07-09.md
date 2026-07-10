---
type: finding
title: "twin-build — IFC to a verified, data-bound twin in ~19.5 s, one command"
description: "Clean-stranger validation from the twin seat: a freshly scaffolded viewer + the bundled Duplex IFC + example map, one command `tools/twin_build.sh <ifc> --map <map>`, reaches all gates green (join 286/286, binding-smoke 6/6) in ~19.5 s wall on an M3 Pro — the first-run number a stranger actually gets, headless class-cache import included."
timestamp: 2026-07-09T18:00:00+01:00
tags:
  [twin-build, one-command, pipeline, ifc, join, binding-smoke, clean-stranger, marketing-number]
---

# twin-build — IFC to a verified twin in ~19.5 seconds, one command

The demo moment this item exists to produce, measured against a **clean stranger's** project:
a folder scaffolded with `npm run new`, the bundled Duplex IFC + example binding map copied in
per `plugin-twin/examples/README.md`, the pinned `.venv-ifc` created once — then **one command**:

```bash
tools/twin_build.sh models/Duplex_A_20110907.ifc --map binding_map.json
```

Exit 0, every non-SKIP gate green, and the summary prints the exact boot command. Booting the
optimized `.tscn` headless confirms the twin loads and binds:

```
viewer: model loaded from models/Duplex_A_20110907_opt.tscn
viewer: bindings resolved 6/6
```

## The number

**~19.5 s wall, one command, cold** (fresh scaffold, nothing pre-imported), exit 0.

| Stage       | ~wall       | What ran / gated                                                                                                                                                                                                |
| ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 preflight | 0.2 s       | engine resolved, `.venv-ifc`/ifcopenshell present                                                                                                                                                               |
| 2 import    | 2.2 s       | IFC → GLB (**286 shapes**, node names = GlobalIds) + sidecar (**295 elements**)                                                                                                                                 |
| 3 optimize  | 2.9 s       | **incl. ~2.7 s one-time headless class-cache import** (see below); optimize ~0.2 s → 3 MultiMesh groups, 348→300 est. draw items                                                                                |
| 4 verify    | 13.9 s      | format, lint, warnings, parse, scenes, scene-errors, smoke, **JOIN 286/286 (100%)**, **BIND-SMOKE 6/6 resolved** (seed 42), playback-determinism; frame-budget **SKIPs loud** (headless — a SKIP is not a pass) |
| 5 summary   | <0.1 s      | artifact list + exact boot command                                                                                                                                                                              |
| **total**   | **~19.5 s** | **twin-build: OK** (exit 0)                                                                                                                                                                                     |

Roughly **75% of the wall clock is the verify gate** (eight sub-gates, three of which each spin
up a headless Godot). Import and optimize proper are ~2 s each; the rest is the framework proving
the artifact rather than producing it.

## The clean-stranger gap this validation caught (and its fix)

`optimize_scene.gd` resolves the `TwinChunks` / `TwinHints` `class_name` globals (they live in
`tools/lib/`), and Godot only registers `class_name` scripts during a **resource-import scan**. A
freshly scaffolded project has never been opened, so it has no `.godot/global_script_class_cache.cfg`
— and a first `--script` run parse-fails with _"Identifier TwinChunks not declared"_. Phase 2 was
proven in an overlaid `house` project that had already been imported, so the gap was invisible until
this seat run. Fix: `twin_build.sh`'s optimize stage now does a one-off `--headless --import` when
the class cache is missing the twin libs (cheap, idempotent, and NOT swallowed as a pass — the
optimize step still gates on the `.tscn` being produced). That ~2.7 s import is the only reason the
cold number is ~19.5 s and not ~17 s.

## Machine caveats — read the number honestly

- **One shot, not a benchmark.** These are single-run wall times from `perl Time::HiRes`
  per-line stamps, not averaged or warmed. Treat as order-of-magnitude, not a stopwatch record.
- **Machine:** Apple M3 Pro, 12 cores, macOS (Darwin 25.5), `Godot 4.6.3.stable.official`,
  ifcopenshell 0.8.5 on CPython 3.12. Import time scales with the IFC (286 shapes here); the
  Duplex is a small model.
- **Cold vs warm:** the ~2.7 s class-cache import runs only on a never-opened project. A warm
  re-run (cache present) skips it, landing the whole pipeline at **~16–17 s**.
- **Excluded from the number:** the one-time prerequisites a stranger does once and the command
  never auto-does — `npm run new` scaffold and `uv venv --python 3.12 .venv-ifc && uv pip install
ifcopenshell==0.8.5` (the documented 3.12 venv; no 3.14 wheel). twin_build never auto-creates
  the venv (uv may be absent; silently building envs hides failures).
- The **frame-budget** bench SKIPs in this headless/agent context and is loud about it — it is
  the one gate that needs a real display (`TWIN_BENCH=1`), and a SKIP is never counted as a pass.

## Reproduce

From a framework checkout (`feat/twin-build` or later), against an empty folder:

```bash
npm run new -- ../twin-build-validate --viewer && cd ../twin-build-validate
mkdir -p models
cp <framework>/plugin-twin/examples/Duplex_A_20110907.ifc models/
cp <framework>/plugin-twin/examples/binding_map.example.json binding_map.json
cp <framework>/plugin-twin/examples/viewer.cfg.example viewer.cfg
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5
tools/twin_build.sh models/Duplex_A_20110907.ifc --map binding_map.json
```
