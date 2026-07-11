# Bring your own IFC — one command to a bound, painted twin

Every other tutorial hands you an asset. This one takes **your own `.ifc`** and, in one command,
gives you back a bound, painted viewer streaming simulated live data — **with no hand-authored
binding map**. It is the fastest way for a digital-twin engineer to see their real model in the
framework.

> Tutorial-discipline: every command and captured output below was run for real, on a reference
> machine (macOS, Node 22, Godot 4.6.3, `uv`). Where a stage's output depends on your model, the
> shown output is from the bundled synthetic `plant.ifc`
> (`plugin/examples/plant.ifc`) — used here as a stand-in for "your own IFC", with its
> hand-authored map deliberately ignored so the generator does all the work.

## The one command

```bash
npm run byo -- /path/to/your.ifc --project /path/you/choose
```

`--project` is **required** — the framework never scaffolds at an implicit path; it creates exactly
the directory you name (and says so), or wires an existing Godot project already there. Re-running
is idempotent: it rebuilds the artifacts and restarts the sim in place.

What `byo` chains, so you don't have to:

1. **scaffold / wire the seat** — the same path `npm run new` uses (tools materialized, library
   linked).
2. **provision the pinned venv** — `ifcopenshell` has no wheel for system Python, so the importer
   needs a pinned 3.12 venv. `byo` creates it if missing (needs `uv`):
   ```
   Using CPython 3.12.12 interpreter at: /opt/homebrew/opt/python@3.12/bin/python3.12
   Creating virtual environment at: .venv-ifc
    + ifcopenshell==0.8.5
   ```
3. **build, data-bound** — import (IFC → GLB + property sidecar) → **auto-map** → optimize → verify.
4. **start the seeded sim** on the generated map and **print the boot command** (it never launches
   the editor — you run it when ready).

## The auto-map — what gets generated

Nothing authored a binding map before this; `binding-candidates` only _listed_ GlobalIds. The
generator (`tools/gen_binding_map.js`) turns the import sidecar into a valid map deterministically:
it picks a spread across distinct **geometric** IFC classes (spaces, storeys and other non-geometric
containers are skipped — they carry no mesh to paint), caps at ~12 tags, and synthesizes a tag per
element:

```
gen_binding_map: OK — 12 binding(s) → models/plant_auto_binding_map.json (VERDICT: GEN-BINDING-MAP OK)
```

```
tags: pump_1.state, tank_1.state, valve_1.state, flowsegment_1.state, pump_2.state, tank_2.state,
      valve_2.state, flowsegment_2.state, pump_3.state, tank_3.state, valve_3.state, flowsegment_3.state
```

Each row binds a synthesized tag to a **real** element by its 22-char GlobalId, with neutral default
range + ramp for you to retune:

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

The seeded sim derives its tag table and each tag's `[min,max]` straight from this file, so the data
and the geometry can never drift. Same sidecar in ⇒ byte-identical map out (no wall-clock, no RNG).

> **It's a starting point, not the finished twin.** The ramps and ranges are neutral defaults and
> the tags are synthesized, not your real telemetry. Retune each row (or hand-author against
> `npm run binding` candidates) once you see it painting.

## The two gates that prove it

The generated map has to pass the same gates a hand-authored one does.

**Join coverage** — every candidate GlobalId in the model matches the sidecar:

```
SIDECAR_KEYS=18
JOIN: 18/18 (100.0%)
JOIN-GATE: OK (min 95.0%)
```

**Resolution + live drive** — every binding resolves to real geometry and the viewer paints it. The
generator guarantees a paintable node target by leading with classes small enough that the optimizer
never batches them into an instanced field. Booting the real viewer shell headless against the map +
a live sim (`--quit-after` bounds the run):

```
viewer: model loaded from models/plant_opt.tscn
viewer: bindings resolved 12/12
viewer: quit-after 60 frames reached
```

12/12 resolved — the auto-map binds every one of its tags to real elements in the optimized scene.

## Boot it yourself

`byo` prints a **self-contained** one-liner — the model and its bindings ride on user args, so
nothing in your `viewer.cfg` is touched:

```bash
/Applications/Godot.app/Contents/MacOS/Godot --path /path/you/choose -- \
    --model=models/your_opt.tscn --binding-map=models/your_auto_binding_map.json
```

The `--binding-map=` arg is symmetric with `--model=` / `--recording=` (the arg wins, else
`viewer.cfg [twin] binding_map=`, else the default). With the seeded sim `byo` started still running,
the viewer opens on your model with the tags painting live.

Stop the sim with the line `byo` prints (`kill $(cat …/byo-sim.pid)`).

## Doing it a stage at a time

`byo` is just the four steps chained. Any of them runs on its own:

```bash
# provision the venv (idempotent; needs uv), then build with a generated map:
tools/twin_build.sh your.ifc --provision --auto-map

# or author a map from a model you already imported, on the framework side:
npm run binding:auto -- --model your          # → models/your_auto_binding_map.json
```

`--provision` runs the two documented `uv` commands only when the venv is missing; without the flag a
missing venv still fails loud with the exact recovery (the long-standing contract is unchanged).
`--auto-map` and `--map` are mutually exclusive — a generated map or a hand-authored one, not both.

## If IFC import isn't set up

`--provision` needs `uv` on PATH. Without it you'll get an honest failure and the two commands to run
by hand:

```
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5
```

Already have a GLB + `<stem>_props.json` sidecar (no IFC toolchain needed)? Skip straight to
`npm run binding:auto -- --sidecar models/<stem>_props.json` and the boot command above.
