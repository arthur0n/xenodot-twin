# Implementation plan — `twin-build`: one command, IFC → optimized, join-verified, bound viewer

Roadmap Must-Have #2 (see `2026-07-09-roadmap-handoff.md`). Plan only — nothing built yet.
Every file reference verified against the repo at plan time. Sibling plan:
`2026-07-09-mqtt-adapter-plan.md` (Must-Have #1, independent — no ordering constraint
between the two).

## Why this item, restated

The pieces exist as separate skills/tools; the demo moment is one command that takes an
IFC and ends at a verified, data-painted viewer. Pure orchestration glue — the thing the
framework claims to be good at, so it should also be the thing a clean stranger can run.

## The stages as they exist today (verified)

- **Import** (`plugin-twin/tools/ifc_convert.py`): IFC → GLB (node names = GlobalIds) +
  `<stem>_props.json` sidecar. Requires the Python 3.12 venv (`uv venv --python 3.12
.venv-ifc && uv pip install ifcopenshell==0.8.5` — no 3.14 wheel; the documented venv
  trap). Defaults derive from the input stem.
- **Optimize** (`plugin-twin/tools/optimize_scene.gd`): headless SceneTree driver,
  `$GODOT --headless --path . --script tools/optimize_scene.gd -- --in=<glb|tscn>
--out=<optimized.tscn> --report=<report.json> [--chunks] [--min-instances] [--hints]
[--occluders] [--vis-ranges]`. Join survives via `twin_globalids` meta on chunked
  MultiMesh batches; instance colours are runtime-driven by the data binder.
- **Verify** (`plugin-twin/tools/verify_twin.sh`): static floor (shared `lib/checks.sh`,
  `xeno_resolve_engine` resolves `$GODOT`) + join gate (`TWIN_MODEL`/`TWIN_SIDECAR` env
  override, else auto-discovery) + binding smoke (seeded sim on `TWIN_SIM_PORT` 8899,
  map precedence `TWIN_BINDING_MAP` env → `viewer.cfg` → `binding_map.json`) + opt-in
  bench (`TWIN_BENCH=1`).
- **Viewer boot** (`starter-viewer/main.gd`): model path from `--model=` user arg →
  `viewer.cfg [viewer] model=`; loads at runtime via GLTFDocument.
- **Binding map**: agent-authored data (`twin-bind-data`), example shipped for the
  bundled Duplex (`plugin-twin/examples/binding_map.example.json`); the sim derives tags
  - ranges from the map, so any present map is immediately live.

## Gaps the investigation found (these ARE the work)

1. **The viewer cannot load the pipeline's own output.** `main.gd:_load_model` speaks
   only GLTFDocument (GLB); `optimize_scene.gd` emits `.tscn`. Today the optimized scene
   is only ever exercised by headless tools that have their own loaders (`_load_input`
   branches on extension). Fix: extend `_load_model` with a PackedScene branch
   (`.tscn`/`.scn` via `load()` + instantiate), mirroring the optimizer's loader split.
   Without this there is no "optimized, bound viewer" — this is the load-bearing change,
   everything else is shell glue.
2. **The binding smoke must exercise the OPTIMIZED scene.** `smoke_binding.gd` already
   accepts `--scene=` (verified, arg parser line ~86) but `verify_twin.sh`'s smoke
   invocation doesn't forward the gate's scene argument to it. `twin_build` needs the
   whole verify pass pinned to its artifacts: `TWIN_MODEL`/`TWIN_SIDECAR` env for the
   join gate (exists), scene pass-through for the smoke (small verify_twin.sh change —
   forward `$SCENE_RES` to the smoke calls, default behavior unchanged when no arg).

## Shape: deterministic script + thin skill (house pattern)

**`plugin-twin/tools/twin_build.sh`** — the command. Deterministic driver, same
discipline as `verify_twin.sh` (loud stage labels, exit nonzero on first failure, SKIP is
never a pass). Materializes into every project via the existing recursive tools copy —
zero materializer changes.

**`plugin-twin/skills/twin-build/SKILL.md`** — the operator manual, NOT a re-explanation
of the stages: when to run it, how to read each stage's failure, the venv-trap recovery
(pointing into `twin-import`), and the explicit handoff — "no binding map → author one
with `twin-bind-data`, then rerun". `agents:` header lists twin-architect (it already
fronts import + optimize). No new agent.

### Script stages

```
tools/twin_build.sh <model.ifc> [--map binding_map.json] [--out-dir models/]
                    [--chunks auto|N] [--min-instances N] [--hints h.json]
                    [--occluders] [--vis-ranges] [--wire]
```

1. **Preflight** — resolve project root (`project.godot` present), source
   `tools/lib/checks.sh` + `xeno_resolve_engine` (same resolution the gate uses), check
   `.venv-ifc/bin/python -c "import ifcopenshell"`. Venv missing → FAIL loudly printing
   the exact two `uv` commands from ifc_convert.py's docstring (do NOT auto-create: `uv`
   presence isn't guaranteed and silently building environments violates the
   loud-failure rule; the skill owns recovery guidance).
2. **Import** — `.venv-ifc/bin/python tools/ifc_convert.py <in.ifc> --glb
<out-dir>/<stem>.glb --sidecar <out-dir>/<stem>_props.json`.
3. **Optimize** — `$GODOT --headless --path . --script tools/optimize_scene.gd --
--in=<stem>.glb --out=<stem>_opt.tscn --report=reports/<stem>_optimize.json` plus
   pass-through flags. `--vis-ranges` stays pass-through-only, NEVER default-on: its
   defaults are unmeasured (roadmap Must-Have #4); defaulting them on would break the
   "every number is gate-backed" promise. Same for `--occluders` (can be net-negative,
   per twin-optimize).
4. **Verify** — `TWIN_MODEL=<stem>.glb TWIN_SIDECAR=<stem>_props.json
[TWIN_BINDING_MAP=<map>] tools/verify_twin.sh <stem>_opt.tscn`. Join gate checks the
   import artifacts; smoke + static floor run against the optimized scene. No map in the
   project → the smoke SKIPs loudly (existing precedent) and the summary names the next
   step (`twin-bind-data`), still exiting 0 only if every non-SKIP gate passed —
   mirroring verify_twin.sh's own SKIP semantics exactly.
5. **Summary** — artifact list (glb, sidecar, optimized tscn, optimize report), gate
   results, and the exact boot command:
   `$GODOT --path . -- --model=<out-dir>/<stem>_opt.tscn`.
   Default does NOT touch `viewer.cfg` (scripts don't silently edit user data); `--wire`
   opts in to setting `[viewer] model=` to the optimized scene — implemented via a tiny
   headless ConfigFile round-trip (Godot parses its own INI dialect; sed/awk against it
   is how comments get eaten), previous file kept as `viewer.cfg.bak`.

### Viewer change (gap 1)

`starter-viewer/main.gd` `_load_model`: branch on extension — `.glb`/`.gltf` →
existing GLTFDocument path; `.tscn`/`.scn` → `load()` as PackedScene, instantiate into
`_model_host`. Error paths stay loud (`push_error` + boolean return, as now). Binder and
`_frame_model` already walk `_model_host` generically; MMI instance-colour driving
already exists (twin-optimize contract) — no binder change expected, but the binding
smoke against the optimized Duplex is the proof, not this assertion.

### verify_twin.sh change (gap 2)

Forward the scene argument into both smoke invocations (headless + windowed variants).
No-arg behavior byte-identical. This is upstream-shared-file territory in spirit but the
file is twin-plugin-owned — still, run the full gate before/after and diff output on the
no-arg path.

## Not in v1 (named so nobody re-litigates)

- **Binding-map autogeneration from the sidecar.** Semantic authoring is agent work
  (two-layer pattern: agents author reviewable data). A deterministic "skeleton map"
  generator is plausible later but is a separate decision — the demo path already has
  the example map, and real models deserve real binding decisions.
- **Hints autogeneration** — same reasoning; `--hints` passes through.
- **`--vis-ranges`/`--occluders` default-on** — blocked on roadmap #4 (measured recipe).
- **Multi-model/batch builds, non-IFC inputs** — pipeline shape generalizes later
  (roadmap items 10/11); one format, one model, one command first.
- **MQTT/live-source wiring** — sibling plan.

## Validation (the LIVE test, from the twin seat)

Clean-stranger acid test in `twindemo/`: scaffold a fresh viewer (`npm run new`), copy
the bundled Duplex IFC + example binding map per `examples/README.md`, run ONE command
`tools/twin_build.sh models/Duplex_A_20110907.ifc`, expect: gates green end-to-end, then
the printed boot command shows the optimized, painted twin against the sim. Record the
end-to-end wall time + per-stage breakdown (with machine caveats) in
`plugin-twin/library/findings/` — "IFC to verified twin in N seconds, one command" is
the demo/marketing number this item exists to produce.

## Docs and hygiene (in scope)

- `plugin-twin/tools/CAPABILITIES-twin.md` — new entry.
- `docs/tutorials/digital-twin.md` — lead with the one-command path; keep the manual
  stage-by-stage walk as the teaching path below it (the tutorial teaches the pipeline,
  the command compresses it — both survive).
- `plugin-twin/examples/README.md` — same restructure for the kit.
- `docs/fork/SEAMS.md` protect-list — ADD `tools/twin_build.sh` + `skills/twin-build/`
  (upstream sync silently deletes unprotected twin files; proven on first sync).
- Roadmap handoff — tick item 2, pointer here + findings file.
- shellcheck-clean like verify_twin.sh (it carries shellcheck directives; match).

## Phasing (review after each — line-by-line + constants list expected)

1. **Viewer + gate plumbing**: `main.gd` `.tscn` branch; verify_twin.sh scene
   pass-through to the smoke. Prove: full gate green on an existing project, no-arg
   output unchanged, optimized Duplex scene loads windowed and paints.
2. **`twin_build.sh` + skill**: the five stages, `--wire`, failure semantics; skill doc.
   Prove: happy path + each preflight failure mode fails loud with the right remedy.
3. **Seat validation + docs**: clean-stranger run in `twindemo/`, findings file with
   measured end-to-end time, tutorial/examples/CAPABILITIES/SEAMS/roadmap updates.

## Acceptance criteria

1. Fresh scaffold + bundled Duplex: `tools/twin_build.sh <ifc>` exits 0 with all gates
   green (join ≥ threshold on 286/286-class coverage, binding smoke PASS with the
   example map) and prints the boot command; booting it shows the optimized scene
   painted live.
2. No binding map present: build still completes import+optimize+join, smoke SKIPs
   LOUDLY, summary names `twin-bind-data` as the next step.
3. Venv absent: preflight fails with the exact `uv` remedy lines; nothing half-built.
4. `verify_twin.sh` no-arg behavior byte-identical to before (diff of gate output on an
   unchanged project).
5. Findings file records the measured one-command wall time with machine caveats.
6. SEAMS protect-list, CAPABILITIES, tutorial, examples README, roadmap all updated in
   the same change set.
