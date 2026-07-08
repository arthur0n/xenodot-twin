#!/usr/bin/env python
"""IFC -> GLB (node names = IFC GlobalIds) + property sidecar JSON keyed by GlobalId.

The twin-import pipeline's build step (skill: twin-import). Requires ifcopenshell,
which has NO wheel for Python 3.14 -- run inside a Python 3.12 venv:

    uv venv --python 3.12 .venv-ifc && source .venv-ifc/bin/activate
    uv pip install ifcopenshell==0.8.5

Usage:
    python tools/ifc_convert.py model.ifc
    python tools/ifc_convert.py model.ifc --glb out/model.glb --sidecar out/model_props.json

Defaults derive from the input stem: model.ifc -> model.glb + model_props.json.
"""

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.element
except ImportError:
    sys.exit(
        "ifcopenshell not importable — activate the 3.12 venv first "
        "(uv venv --python 3.12; uv pip install ifcopenshell==0.8.5). "
        "Python 3.14 has no ifcopenshell wheel."
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("ifc", help="input IFC file (STEP; must start with ISO-10303-21)")
    ap.add_argument("--glb", help="output GLB path (default: <ifc stem>.glb)")
    ap.add_argument(
        "--sidecar", help="output sidecar JSON path (default: <ifc stem>_props.json)"
    )
    args = ap.parse_args()

    ifc_path = Path(args.ifc)
    if not ifc_path.is_file():
        sys.exit(f"no such file: {ifc_path}")
    # Dead sample-model URLs serve HTML that "converts" into garbage — validate the header.
    with open(ifc_path, "rb") as fh:
        if not fh.read(13).startswith(b"ISO-10303-21"):
            sys.exit(
                f"{ifc_path} is not an IFC/STEP file (missing ISO-10303-21 header) — "
                "a dead download URL likely served an HTML page."
            )
    glb_path = Path(args.glb) if args.glb else ifc_path.with_suffix(".glb")
    sidecar_path = (
        Path(args.sidecar)
        if args.sidecar
        else ifc_path.with_name(ifc_path.stem + "_props.json")
    )
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    f = ifcopenshell.open(str(ifc_path))
    print(f"opened {ifc_path} schema={f.schema}")

    # --- geometry -> GLB ---------------------------------------------------
    settings = ifcopenshell.geom.settings()
    settings.set("weld-vertices", True)
    ser_settings = ifcopenshell.geom.serializer_settings()
    # THE critical line: node names carry IFC GlobalIds — the join key for the
    # sidecar and for live-data binding (skill: twin-bind-data).
    ser_settings.set("use-element-guids", True)

    serializer = ifcopenshell.geom.serializers.gltf(str(glb_path), settings, ser_settings)
    serializer.setFile(f)
    serializer.writeHeader()

    it = ifcopenshell.geom.iterator(settings, f)
    count = 0
    if it.initialize():
        while True:
            serializer.write(it.get())
            count += 1
            if not it.next():
                break
    serializer.finalize()
    print(f"GLB written: {glb_path} — {count} shapes in {time.time() - t0:.1f}s")

    # --- property sidecar ----------------------------------------------------
    t1 = time.time()
    sidecar = {}
    for el in f.by_type("IfcProduct"):
        if not el.GlobalId:
            continue
        psets = ifcopenshell.util.element.get_psets(el, psets_only=True)
        qtos = ifcopenshell.util.element.get_psets(el, qtos_only=True)
        sidecar[el.GlobalId] = {
            "ifc_class": el.is_a(),
            "name": el.Name,
            "psets": psets,
            "quantities": qtos,
        }
    with open(sidecar_path, "w") as fp:
        # default=str: pset values include non-JSON types (IFC entity refs, dates).
        json.dump(sidecar, fp, indent=1, default=str)
    print(f"sidecar: {sidecar_path} — {len(sidecar)} elements in {time.time() - t1:.1f}s")
    print(f"total wall-clock: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
