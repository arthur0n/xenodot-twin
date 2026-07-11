#!/usr/bin/env python
"""Synthetic demonstration plant — OpenUSD (usd-core) generator, the USD sibling of gen_plant_ifc.py.

Emits an honest **synthetic demonstration model**: the same tank-farm / pump-skid as the IFC
demo (tank cylinders, pump boxes, a header pipe run, inline valves), authored this time as real
`UsdGeom.Mesh` prims so the dependency-free USD→GLB route (`tools/usd_convert.py`) reads
points/faces directly. Every prim gets a MEANINGFUL prim path (`/Plant/Tanks/TK_101` …) — the
**join key** — and customData attributes (the sidecar payload: Reference, Service, capacity/flow/
head, LineReference, tag). The whole twin pipeline then runs unmodified: import (usd_convert.py)
→ sidecar join → optimize → bind → verify.

HONESTY: generated demonstration model, NO real-world provenance; never present it as as-built.
The label "synthetic demonstration model" is written into the stage's `customLayerData` and this
docstring on purpose.

VENV: needs usd-core (the `pxr` wheels), which — like ifcopenshell — has no wheel for a current
system Python. Run inside the SAME pinned 3.12 `.venv-usd` the USD convert path uses (see
`tools/usd_convert.py`'s header / `twin_build.sh --provision`):

    uv venv --python 3.12 .venv-usd
    uv pip install --python .venv-usd/bin/python usd-core
    .venv-usd/bin/python plugin/examples/gen_plant_usd.py --out plant.usda

DETERMINISM: same `--seed` ⇒ same stage. The generator seeds its own PRNG for the property values;
geometry is fully parametric. Authored with `upAxis=Y` + `metersPerUnit=1` so `usdchecker` passes
clean. (Prim paths, not GlobalIds, are the join key — so unlike the IFC generator there is no GUID
stream to pin; the paths are structural and identical across runs.)

Usage:
    gen_plant_usd.py [--tanks N] [--pumps M] [--seed S] [--out plant.usda]

The DEFAULT (4 tanks, 3 pumps → 15 mesh prims) is the vendored demo asset — small, fast, and it
carries ≥6 bindable tags across ≥3 equipment classes (path segments Tanks/Pumps/Valves).
"""

import argparse
import math
import random

from pxr import Gf, Usd, UsdGeom

SYNTHETIC_LABEL = "synthetic demonstration model"

TANK_R, TANK_H, TANK_SPACING = 1.5, 5.0, 6.0
PUMP_DX, PUMP_DY, PUMP_DZ, PUMP_SPACING = 1.4, 0.8, 1.0, 6.0
PIPE_R, PIPE_SEG_LEN = 0.25, 4.0
HEADER_Y, HEADER_Z = -4.0, 0.5
VALVE = 0.6


def _stamp(mesh, custom):
    for k, v in custom.items():
        mesh.GetPrim().SetCustomDataByKey(k, v)


def box_mesh(stage, path, dx, dy, dz, tx, ty, tz, custom):
    """An axis-aligned box authored as a real 6-quad UsdGeom.Mesh (trivially convex)."""
    m = UsdGeom.Mesh.Define(stage, path)
    hx, hy, hz = dx / 2, dy / 2, dz / 2
    pts = [
        (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
        (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
    ]
    m.GetPointsAttr().Set([Gf.Vec3f(*p) for p in pts])
    m.GetFaceVertexCountsAttr().Set([4, 4, 4, 4, 4, 4])
    m.GetFaceVertexIndicesAttr().Set(
        [4, 5, 6, 7, 0, 3, 2, 1, 0, 1, 5, 4, 2, 3, 7, 6, 1, 2, 6, 5, 0, 4, 7, 3]
    )
    UsdGeom.XformCommonAPI(m).SetTranslate(Gf.Vec3d(tx, ty, tz))
    _stamp(m, custom)
    return m


def cyl_mesh(stage, path, radius, height, tx, ty, tz, custom, sides=12):
    """An N-sided vertical prism — a REAL mesh, not an implicit UsdGeom.Cylinder (which this
    convert route cannot tessellate). Convex side quads, so fan triangulation is exact."""
    m = UsdGeom.Mesh.Define(stage, path)
    pts, counts, idx = [], [], []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        pts.append((radius * math.cos(a), 0.0, radius * math.sin(a)))  # bottom ring
    for i in range(sides):
        a = 2 * math.pi * i / sides
        pts.append((radius * math.cos(a), height, radius * math.sin(a)))  # top ring
    for i in range(sides):
        j = (i + 1) % sides
        idx += [i, j, sides + j, sides + i]  # side quad
        counts.append(4)
    m.GetPointsAttr().Set([Gf.Vec3f(*p) for p in pts])
    m.GetFaceVertexCountsAttr().Set(counts)
    m.GetFaceVertexIndicesAttr().Set(idx)
    UsdGeom.XformCommonAPI(m).SetTranslate(Gf.Vec3d(tx, ty, tz))
    _stamp(m, custom)
    return m


def build(tanks, pumps, seed):
    """Author the synthetic plant into a fresh in-memory stage. Pure function of the args + seed."""
    rng = random.Random(seed)
    stage = Usd.Stage.CreateInMemory()
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    stage.SetMetadata(
        "customLayerData",
        {
            "provenance": SYNTHETIC_LABEL,
            "generator": "gen_plant_usd.py",
            "note": "no real-world provenance; do not present as as-built.",
        },
    )
    root = UsdGeom.Xform.Define(stage, "/Plant")
    stage.SetDefaultPrim(root.GetPrim())
    UsdGeom.Xform.Define(stage, "/Plant/Tanks")
    UsdGeom.Xform.Define(stage, "/Plant/Pumps")
    UsdGeom.Xform.Define(stage, "/Plant/Header")
    UsdGeom.Xform.Define(stage, "/Plant/Valves")

    tank_services = ["buffer", "feed", "product", "slop", "condensate", "reflux"]
    for i in range(tanks):
        ref = f"TK_{101 + i}"
        cap = 5000 + 500 * rng.randrange(0, 11)
        cyl_mesh(
            stage, f"/Plant/Tanks/{ref}", TANK_R, TANK_H, i * TANK_SPACING, 0.0, 0.0,
            {
                "Reference": ref, "class": "Tank", "Service": tank_services[i % 6],
                "NominalCapacity": f"{cap} L", "LineReference": f"L-{100 + i}",
                "tag": f"tank_{i + 1}.level",
            },
        )

    pump_services = ["feed", "transfer", "circulation", "booster", "dosing"]
    for i in range(pumps):
        ref = f"P_{101 + i}"
        flow = 8 + 2 * rng.randrange(0, 21)
        head = 20 + 5 * rng.randrange(0, 13)
        box_mesh(
            stage, f"/Plant/Pumps/{ref}", PUMP_DX, PUMP_DY, PUMP_DZ, i * PUMP_SPACING, -10.0, 0.0,
            {
                "Reference": ref, "class": "Pump", "Service": pump_services[i % 5],
                "NominalFlowRate": f"{flow} m3/h", "NominalHead": f"{head} m",
                "LineReference": f"L-{200 + i}", "tag": f"pump_{i + 1}.flow",
            },
        )

    span = max(1, max(tanks, pumps) - 1) * max(TANK_SPACING, PUMP_SPACING)
    n_header = max(2, int(span // PIPE_SEG_LEN) + 1)
    for i in range(n_header):
        ref = f"HDR_{i + 1}"
        # A thin box along +X (keeps the mesh trivially convex — a header pipe segment).
        box_mesh(
            stage, f"/Plant/Header/{ref}", PIPE_SEG_LEN, 2 * PIPE_R, 2 * PIPE_R,
            i * PIPE_SEG_LEN - 2.0 + PIPE_SEG_LEN / 2, HEADER_Y, HEADER_Z,
            {
                "Reference": ref, "class": "FlowSegment", "NominalDiameter": "200 mm",
                "LineReference": "L-HDR",
            },
        )

    for i in range(pumps):
        ref = f"V_{101 + i}"
        box_mesh(
            stage, f"/Plant/Valves/{ref}", VALVE, VALVE, VALVE,
            i * PUMP_SPACING, HEADER_Y - 3.0, HEADER_Z,
            {
                "Reference": ref, "class": "Valve", "Size": "DN100",
                "Service": "isolation", "LineReference": f"L-{200 + i}",
                "tag": f"valve_{i + 1}.position",
            },
        )
    return stage


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tanks", type=int, default=4, help="number of tank prims (default 4)")
    ap.add_argument("--pumps", type=int, default=3, help="number of pump prims (default 3)")
    ap.add_argument("--seed", type=int, default=42, help="PRNG seed (determinism, default 42)")
    ap.add_argument("--out", default="plant.usda", help="output USD path (default plant.usda)")
    args = ap.parse_args()
    if args.tanks < 0 or args.pumps < 0:
        ap.error("--tanks and --pumps must be non-negative")

    stage = build(args.tanks, args.pumps, args.seed)
    stage.GetRootLayer().Export(args.out)
    n = sum(1 for p in stage.Traverse() if p.IsA(UsdGeom.Mesh))
    print(f"WROTE {args.out}  ({SYNTHETIC_LABEL}, seed={args.seed})  meshes={n}")
    print("  prim paths (the join key; for binding-map authoring):")
    for p in stage.Traverse():
        if p.IsA(UsdGeom.Mesh):
            tag = p.GetCustomDataByKey("tag") or "-"
            print(f"    {str(p.GetPath()):24s} tag={tag}")


if __name__ == "__main__":
    main()
