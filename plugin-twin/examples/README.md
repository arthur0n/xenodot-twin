# xenodot-twin examples — the try-it kit

Three files that turn a freshly scaffolded viewer project into the live smart-home digital twin
from the tutorial ([`docs/tutorials/digital-twin.md`](../../docs/tutorials/digital-twin.md)):

- `Duplex_A_20110907.ifc` — the sample BIM model (see [`NOTICE.md`](NOTICE.md) for provenance).
- `binding_map.example.json` — 6 telemetry tags bound to real Duplex GlobalIds.
- `viewer.cfg.example` — the viewer config (LIVE by default).

## Quickstart

```bash
# 0. Scaffold a viewer project from the framework clone (creates ../house with tools/, etc.):
npm run new -- ../house --viewer
cd ../house

# 1. Copy the kit in:
cp /path/to/xenodot-forge/plugin-twin/examples/Duplex_A_20110907.ifc .
cp /path/to/xenodot-forge/plugin-twin/examples/binding_map.example.json binding_map.json
cp /path/to/xenodot-forge/plugin-twin/examples/viewer.cfg.example viewer.cfg

# 2. Convert the IFC → GLB (node names = GlobalIds) + sidecar (needs the 3.12 ifcopenshell venv):
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python ifcopenshell==0.8.5
.venv/bin/python tools/ifc_convert.py Duplex_A_20110907.ifc \
  --glb models/duplex.glb --sidecar models/duplex_props.json

# 3. Run it (sim in one terminal, viewer in another):
node tools/sim/server.js --map binding_map.json &
$GODOT --path .
```

The full walkthrough — venv setup, the GlobalId join, recording a fixture, the gate, and the
gotchas — is in [`docs/tutorials/digital-twin.md`](../../docs/tutorials/digital-twin.md).
