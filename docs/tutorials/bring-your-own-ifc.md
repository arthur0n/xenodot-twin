# Bring your own IFC — step by step to a bound, painted twin

Every other tutorial hands you an asset. This one takes **your own `.ifc`** and walks the pipeline
**one explicit step at a time** — wire a seat → provision the importer → build a data-bound viewer
with an auto-generated binding map → stream a seeded sim → boot it. No hand-authored binding map, and
no magic: each step is a command you run and an output you can check. (There is a one-line
convenience that chains them — see the footnote — but the point of this page is the steps.)

> Tutorial-discipline: every command and captured output below was run for real, on a reference
> machine (macOS, Node 22, Godot 4.6.3, `uv` 0.9, gdtoolkit 4.5). Where a stage's output depends on
> your model, the shown output is from the bundled synthetic `plant.ifc`
> (`plugin/examples/plant.ifc`) — used here as a stand-in for "your own IFC", with its hand-authored
> map deliberately ignored so the generator does all the work.

## Step 1 — wire a seat for your model

Point the framework at a directory you name — scaffold an empty one into a viewer, or wire an
existing Godot project in place. This is the same onboarding step as any other project:

```bash
npm run onboard:project -- /path/you/choose
```

It **requires an explicit path** — the framework never scaffolds at an implicit location; it creates
exactly the directory you name (and says so), materializes the plugin's per-project `tools/`, and
health-checks with `doctor`. Everything below runs **from inside that seat**:

```bash
cd /path/you/choose
```

## Step 2 — provision the IFC importer

`ifcopenshell` has no wheel for a current system Python, so the importer runs in a pinned 3.12 venv.
Provision it once with `--provision` (needs `uv` on PATH — `npm run onboard:check` verifies that):

```bash
tools/twin_build.sh /path/to/your.ifc --provision --auto-map
```

`--provision` runs the two documented `uv` commands **only when the venv is missing** — the preflight
output on a fresh seat:

```
Using CPython 3.12.12 interpreter at: /opt/homebrew/opt/python@3.12/bin/python3.12
Creating virtual environment at: .venv-ifc
 + ifcopenshell==0.8.5
```

Without `--provision`, a missing venv fails loud with the exact recovery command (the contract is
unchanged) — see [If IFC import isn't set up](#if-ifc-import-isnt-set-up).

## Step 3 — build, data-bound, with an auto-generated map

The same `twin_build.sh` call above (`--auto-map`) runs the whole build in the venv it just
provisioned: **import** (IFC → GLB + property sidecar) → **auto-map** → **optimize** → **verify**.
`--auto-map` and `--map` are mutually exclusive: a generated map, or a hand-authored one, not both.

### What the auto-map generates

Nothing authored a binding map before this; `npm run binding` only _lists_ candidate GlobalIds. The
generator (`tools/gen_binding_map.js`) turns the import sidecar into a valid map deterministically:
it picks a spread across distinct **geometric** IFC classes (spaces, storeys and other non-geometric
containers are skipped — no mesh to paint), caps at ~12 tags, and synthesizes a tag per element:

```
gen_binding_map: OK — 12 binding(s) → models/plant_auto_binding_map.json (VERDICT: GEN-BINDING-MAP OK)
```

```
tags: pump_1.state, tank_1.state, valve_1.state, flowsegment_1.state, pump_2.state, tank_2.state,
      valve_2.state, flowsegment_2.state, pump_3.state, tank_3.state, valve_3.state, flowsegment_3.state
```

Each row binds a synthesized tag to a **real** element by its 22-char GlobalId, with a neutral
default range + ramp for you to retune:

```json
{
  "tag": "pump_1.state",
  "globalid": "2wpxFG2n_HOywVzNz3jwEc",
  "min": 0,
  "max": 100,
  "response": "albedo_ramp",
  "ramp": ["#14142a", "#39d0ff"],
  "ifc": "IfcPump / P-101 Feed Pump",
  "note": "auto-generated binding — retune min/max/ramp/response for this element's real telemetry."
}
```

Same sidecar in ⇒ byte-identical map out (no wall-clock, no RNG). The seeded sim (Step 4) derives its
tag table and each tag's `[min,max]` straight from this file, so the data and the geometry can never
drift.

> **It's a starting point, not the finished twin.** The ramps and ranges are neutral defaults and the
> tags are synthesized, not your real telemetry. Retune each row (or hand-author against
> `npm run binding` candidates) once you see it painting.

> Already imported the model elsewhere (a GLB + `<stem>_props.json` sidecar on hand, no IFC toolchain
> needed)? Author the map on the framework side instead of the seat:
>
> ```bash
> npm run binding:auto -- --sidecar models/<stem>_props.json   # → models/<stem>_auto_binding_map.json
> ```

### The two gates that prove the build

The generated map passes the same gates a hand-authored one does — `twin_build` runs them as part of
Step 3.

**Join coverage** — every candidate GlobalId in the model matches the sidecar:

```
SIDECAR_KEYS=18
JOIN: 18/18 (100.0%)
JOIN-GATE: OK (min 95.0%)
```

**Resolution + live drive** — every binding resolves to real geometry and the viewer paints it. The
generator guarantees a paintable node target by leading with classes small enough that the optimizer
never batches them into an instanced field. `twin_build` boots the viewer shell headless against the
map + a live sim (`--quit-after` bounds the run):

```
viewer: model loaded from models/plant_opt.tscn
viewer: bindings resolved 12/12
viewer: quit-after 60 frames reached
```

12/12 resolved — the auto-map binds every one of its tags to real elements in the optimized scene.

## Step 4 — stream a seeded sim on the generated map

Start the seeded simulator bound to the map from Step 3. It derives its tag table from that file and
streams over WebSocket; the viewer's `DataBus` default points at `ws://localhost:8765`, so no `--url`
is needed:

```bash
node tools/sim/server.js --map models/plant_auto_binding_map.json --port 8765
```

Leave it running (or background it) while you boot the viewer in Step 5. Stop it with `Ctrl-C` (or
`kill` its PID if you backgrounded it).

## Step 5 — boot the viewer yourself

Boot with a **self-contained** one-liner — the model and its bindings ride on user args, so nothing
in your `viewer.cfg` is touched:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path /path/you/choose -- \
    --model=models/plant_opt.tscn --binding-map=models/plant_auto_binding_map.json
```

The `--binding-map=` arg is symmetric with `--model=` / `--recording=` (the arg wins, else
`viewer.cfg [twin] binding_map=`, else the default). With the Step-4 sim still running, the viewer
opens on your model with the tags painting live.

## If IFC import isn't set up

`--provision` needs `uv` on PATH. Without it you get an honest failure and the two commands to run by
hand:

```
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5
```

`npm run onboard:check` reports `uv`/Python status up front so you catch this before you build.

---

**Footnote — the one-line convenience.** `npm run byo -- /path/to/your.ifc --project /path/you/choose`
chains Steps 1–4 and prints the Step-5 boot command — the same scripts, run for you, idempotent on
re-run. Use it once you know the steps; this page teaches them so the convenience is never a black box.
</content>
