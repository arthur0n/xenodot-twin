# xenodot-twin examples — the try-it kit

Three files that turn a freshly scaffolded viewer project into the live smart-home digital twin
from the tutorial ([`docs/tutorials/digital-twin.md`](../../docs/tutorials/digital-twin.md)):

- `Duplex_A_20110907.ifc` — the sample BIM model (see [`NOTICE.md`](NOTICE.md) for provenance).
- `binding_map.example.json` — 6 telemetry tags bound to real Duplex GlobalIds.
- `viewer.cfg.example` — the viewer config (LIVE by default).

## Quickstart — one command

Scaffold, drop the kit in, create the pinned venv once, then let `twin_build.sh` do
import → optimize → verify in a single gated command:

```bash
# 0. Scaffold a viewer project from the framework clone (creates ../house with tools/, etc.):
npm run new -- ../house --viewer
cd ../house

# 1. Copy the kit in (the IFC goes under models/ so the build's artifacts co-locate there):
mkdir -p models
cp /path/to/xenodot-twin/plugin-twin/examples/Duplex_A_20110907.ifc models/
cp /path/to/xenodot-twin/plugin-twin/examples/binding_map.example.json binding_map.json
cp /path/to/xenodot-twin/plugin-twin/examples/viewer.cfg.example viewer.cfg

# 2. Create the pinned 3.12 ifcopenshell venv ONCE (twin_build looks for exactly .venv-ifc;
#    ifcopenshell has no 3.14 wheel — twin_build never auto-creates it, it FAILs loud instead):
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5

# 3. One command → optimized, join-verified, binding-smoked twin + the exact boot command:
tools/twin_build.sh models/Duplex_A_20110907.ifc --map binding_map.json
```

Green tail (all gates, exit 0) and the boot line it prints:

```
JOIN: 286/286 (100.0%)
BIND-SMOKE: OK — 6 node target(s), 0 mmi target(s), 90 frames, 0 drops
twin-build: OK
  boot the optimized twin (live against the sim):
    $GODOT --path . -- --model=models/Duplex_A_20110907_opt.tscn
```

Boot with that printed `--model=` command: the copied `viewer.cfg` points `model=` at the
teaching path's `res://models/duplex.glb` (which this fast path never builds), so a bare
`$GODOT --path .` comes up empty — either use the printed command, or rerun with `--wire` to
point `viewer.cfg` at the optimized scene (keeps a `viewer.cfg.bak`).

No map discoverable (no `--map`, nothing in `viewer.cfg [twin] binding_map=`, no
`binding_map.json`)? The build still completes import + optimize + join; the binding smoke
SKIPs loudly and the summary names `twin-bind-data` as the next step. (In this quickstart the
smoke always runs: step 1 copies `binding_map.json` into place.) Measured wall time + machine
caveats:
[`../library/findings/twin-build-2026-07-09.md`](../library/findings/twin-build-2026-07-09.md).

## By hand — the teaching path

The one command compresses the pipeline; running it by hand is how you learn each stage
(and how you drive a real, non-Duplex model). Convert, then run sim + viewer:

```bash
# Convert the IFC → GLB (node names = GlobalIds) + sidecar (needs the 3.12 ifcopenshell venv):
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python ifcopenshell==0.8.5
.venv/bin/python tools/ifc_convert.py Duplex_A_20110907.ifc \
  --glb models/duplex.glb --sidecar models/duplex_props.json

# Run it (sim in one terminal, viewer in another):
node tools/sim/server.js --map binding_map.json &
$GODOT --path .
```

The full walkthrough — venv setup, the GlobalId join, optimize, recording a fixture, the gate,
and the gotchas — is in [`docs/tutorials/digital-twin.md`](../../docs/tutorials/digital-twin.md).
