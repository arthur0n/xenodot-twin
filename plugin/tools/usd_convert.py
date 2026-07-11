#!/usr/bin/env python
"""OpenUSD -> GLB (node names = SANITIZED prim paths) + property sidecar JSON keyed the same.

The twin-import pipeline's build step for USD, the extension-switch sibling of
tools/ifc_convert.py. Where IFC's stable join key is the GlobalId, USD's is the **prim path**
(the readiness contract: docs/handoff/2026-07-09-usd-pointcloud-readiness.md). Every GLB node
is named by its sanitized prim path and the sidecar is keyed identically, so the framework's
generic join gate (check_twin_join.gd) and the binding runtime plug in unmodified — a format
that names nodes by its stable id and keys its sidecar the same way needs no new gate.

CLI contract mirrors ifc_convert.py so twin_build.sh grows a second input format by
extension-switch, not redesign:

    tools/twin_build.sh model.usda --provision           # provisions .venv-usd, then this
    .venv-usd/bin/python tools/usd_convert.py model.usda  # -> model.glb + model_props.json
    python tools/usd_convert.py model.usda --glb out/m.glb --sidecar out/m_props.json

Defaults derive from the input stem: model.usda -> model.glb + model_props.json. Accepts
.usd / .usda / .usdc (crate). Needs usd-core (the `pxr` wheels) in a pinned 3.12 venv — see
twin_build.sh --provision / the twin-import skill.

# THE SANITIZATION CONTRACT (the join key — documented because it is load-bearing)

A GLB node name and a JSON key cannot be an arbitrary USD prim path (`/Plant/Tanks/TK_101`):
slashes are node-path separators and USD allows characters glTF node names / dict keys do not.
So the prim path is sanitized into a node-name-legal, collision-resistant token, and the SAME
function keys the sidecar — that identity IS the join. The rules, in order:

  1. strip the single leading '/'          (/Plant/Tanks/TK_101 -> Plant/Tanks/TK_101)
  2. every remaining '/' -> '__'            (Plant/Tanks/TK_101  -> Plant__Tanks__TK_101)
  3. every non-[A-Za-z0-9_] char -> '_'     (dots, colons, spaces in prim names -> '_')

Prim paths are unique, and this map is near-injective (a rare collision would surface as a
join miss, never a silent overwrite — the sidecar is keyed the same way, so both sides move
together). The double-underscore for '/' keeps the hierarchy visible and reversible-ish for a
human reading a node name. This contract is the reason the IFC-shaped join gate accepts USD.

# GEOMETRY ROUTE (honest scope)

usd-core reads UsdGeom.Mesh points / faceVertexCounts / faceVertexIndices directly; faces are
fan-triangulated (convex only) and a minimal glTF 2.0 GLB is written by hand (pure `struct`,
no trimesh/pygltflib). This is the dependency-free route qualified in Phase A when guc and
Blender were both absent. LIMITS, stated plainly:
  * it tessellates authored polygon **meshes** only. Implicit prims (UsdGeom.Sphere / Cylinder
    / Cube) carry no points array and are SKIPPED — they never reach the GLB or the sidecar.
    A model built from implicit prims needs guc / Blender headless / a usdImaging pass first.
  * fan triangulation assumes convex faces (true for the box/cylinder-band demo prims).
"""

import argparse
import json
import re
import struct
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from pxr import Tf, Usd, UsdGeom, Vt
except ImportError:
    sys.exit(
        "pxr (usd-core) not importable — provision + run inside the pinned 3.12 .venv-usd: "
        "tools/twin_build.sh <model.usd> --provision (or by hand: "
        "uv venv --python 3.12 .venv-usd && uv pip install --python .venv-usd/bin/python usd-core). "
        "See the twin-import skill."
    )

# usd-core auto-injects a schema-doc key into a Mesh prim's customData (Phase A finding): the
# UsdGeomMesh class documentation ("Encodes a mesh with optional subdivision …"). It is NOT an
# authored attribute — filter it out so the sidecar carries only real per-element properties.
SCHEMA_DOC_KEYS = frozenset({"userDocBrief"})


def sanitize(prim_path: str) -> str:
    """Prim path -> node name / sidecar key. THE join contract (documented in the file header):
    strip the leading '/', turn every remaining '/' into '__', then every other non-[A-Za-z0-9_]
    character into '_'. The same function keys the sidecar, so the identity is the join."""
    return re.sub(r"[^A-Za-z0-9_]", "_", prim_path.lstrip("/").replace("/", "__"))


def triangulate(counts, indices):
    """Fan-triangulate polygon faces (convex). Returns a flat list of triangle indices."""
    tris = []
    cursor = 0
    for c in counts:
        face = indices[cursor : cursor + c]
        for k in range(1, c - 1):
            tris.extend((face[0], face[k], face[k + 1]))
        cursor += c
    return tris


def read_meshes(stage):
    """Walk the stage; yield (sanitized_name, prim_path, world-space points, tri indices,
    attributes) for every UsdGeom.Mesh that carries geometry. Implicit prims and meshes with no
    points/faces are skipped (they cannot be tessellated by this route — see the header limits)."""
    out = []
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        pts = mesh.GetPointsAttr().Get()
        counts = mesh.GetFaceVertexCountsAttr().Get()
        idx = mesh.GetFaceVertexIndicesAttr().Get()
        if not pts or not counts or not idx:
            continue
        # Bake the prim's world transform into the points (sample uses simple translates).
        xf = UsdGeom.XformCache().GetLocalToWorldTransform(prim)
        points = []
        for p in pts:
            v = xf.Transform(p)
            points.append((float(v[0]), float(v[1]), float(v[2])))
        tris = triangulate(list(counts), list(idx))
        # Authored customData is the sidecar payload — minus usd-core's schema-doc keys.
        attrs = {k: v for k, v in prim.GetCustomData().items() if k not in SCHEMA_DOC_KEYS}
        out.append((sanitize(str(prim.GetPath())), str(prim.GetPath()), points, tris, attrs))
    return out


def write_glb(meshes, out_path):
    """Emit a minimal, valid glTF 2.0 GLB. One buffer; per-mesh position + index
    bufferViews/accessors; one node per mesh named by the sanitized prim path."""
    bin_blob = bytearray()
    buffer_views = []
    accessors = []
    gltf_meshes = []
    nodes = []
    scene_nodes = []

    def align():
        while len(bin_blob) % 4 != 0:
            bin_blob.append(0)

    for name, _path, points, tris, _attrs in meshes:
        # positions (VEC3 float32)
        align()
        pos_offset = len(bin_blob)
        mins = [min(p[i] for p in points) for i in range(3)]
        maxs = [max(p[i] for p in points) for i in range(3)]
        for p in points:
            bin_blob += struct.pack("<3f", *p)
        pos_len = len(bin_blob) - pos_offset
        pos_bv = len(buffer_views)
        buffer_views.append(
            {"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_len, "target": 34962}
        )
        pos_acc = len(accessors)
        accessors.append(
            {
                "bufferView": pos_bv,
                "componentType": 5126,
                "count": len(points),
                "type": "VEC3",
                "min": mins,
                "max": maxs,
            }
        )
        # indices (uint32)
        align()
        idx_offset = len(bin_blob)
        for i in tris:
            bin_blob += struct.pack("<I", i)
        idx_len = len(bin_blob) - idx_offset
        idx_bv = len(buffer_views)
        buffer_views.append(
            {"buffer": 0, "byteOffset": idx_offset, "byteLength": idx_len, "target": 34963}
        )
        idx_acc = len(accessors)
        accessors.append(
            {"bufferView": idx_bv, "componentType": 5125, "count": len(tris), "type": "SCALAR"}
        )

        mesh_i = len(gltf_meshes)
        gltf_meshes.append(
            {"primitives": [{"attributes": {"POSITION": pos_acc}, "indices": idx_acc, "mode": 4}]}
        )
        node_i = len(nodes)
        nodes.append({"name": name, "mesh": mesh_i})
        scene_nodes.append(node_i)

    gltf = {
        "asset": {"version": "2.0", "generator": "usd_convert.py"},
        "scene": 0,
        "scenes": [{"nodes": scene_nodes}],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_blob)}],
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "
    while len(bin_blob) % 4 != 0:
        bin_blob.append(0)

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    with open(out_path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        fh.write(json_bytes)
        fh.write(struct.pack("<I4s", len(bin_blob), b"BIN\x00"))
        fh.write(bin_blob)
    return len(nodes), len(bin_blob)


def _jsonable(v):
    """Coerce a customData value into something json.dump handles: USD string/token arrays and Gf
    vectors become plain lists; everything else is left for json.dump's default=str."""
    if isinstance(v, (Vt.StringArray, Vt.TokenArray)):
        return [str(x) for x in v]
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    return v


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("usd", help="input USD stage (.usd / .usda / .usdc)")
    ap.add_argument("--glb", help="output GLB path (default: <usd stem>.glb)")
    ap.add_argument("--sidecar", help="output sidecar JSON path (default: <usd stem>_props.json)")
    ap.add_argument(
        "--metrics",
        help=(
            "write import metrics as machine-readable JSON here "
            "(schema, shapes, elements, import_seconds) — the same contract the assets UI card "
            "reads for IFC; check_twin_join.gd --json merges the JOIN fields into the same file"
        ),
    )
    args = ap.parse_args()

    usd_path = Path(args.usd)
    if not usd_path.is_file():
        sys.exit(f"no such file: {usd_path}")
    glb_path = Path(args.glb) if args.glb else usd_path.with_suffix(".glb")
    sidecar_path = (
        Path(args.sidecar)
        if args.sidecar
        else usd_path.with_name(usd_path.stem + "_props.json")
    )
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    sidecar_path.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    # Fail closed on an unreadable / non-USD file. Usd.Stage.Open EITHER returns an invalid stage
    # OR raises Tf.ErrorException (a malformed .usda — e.g. an HTML page a dead URL served) — cover
    # both so a bad input never "converts" into an empty GLB or dumps a C++ traceback.
    try:
        stage = Usd.Stage.Open(str(usd_path))
    except Tf.ErrorException as exc:
        first = str(exc).strip().splitlines()[0] if str(exc).strip() else "not a valid USD layer"
        sys.exit(
            f"{usd_path} is not a readable USD stage ({first}) — a dead download URL likely "
            "served an HTML page, or the crate is corrupt. Fail-closed."
        )
    if not stage:
        sys.exit(
            f"{usd_path} did not open as a USD stage (unreadable, not USD, or a corrupt crate) — "
            "fail-closed rather than emit an empty GLB."
        )
    up_axis = UsdGeom.GetStageUpAxis(stage)
    print(f"opened {usd_path} upAxis={up_axis}")

    # --- geometry -> GLB ---------------------------------------------------
    meshes = read_meshes(stage)
    if not meshes:
        sys.exit(
            f"{usd_path} has no tessellable UsdGeom.Mesh prims (only implicit prims, or an empty "
            "stage) — nothing to join. This route handles authored polygon meshes only "
            "(see usd_convert.py header)."
        )
    count, blob_len = write_glb(meshes, glb_path)
    print(f"GLB written: {glb_path} — {count} nodes ({blob_len} bin bytes) in {time.time() - t0:.1f}s")

    # --- property sidecar ---------------------------------------------------
    # Keyed by the SAME sanitized prim path the GLB node carries — that identity is the join.
    t1 = time.time()
    sidecar = {}
    for name, path, _points, _tris, attrs in meshes:
        prim = stage.GetPrimAtPath(path)
        sidecar[name] = {
            "type": str(prim.GetTypeName()),
            "prim_path": path,
            "name": prim.GetName(),
            "attributes": {k: _jsonable(v) for k, v in attrs.items()},
        }
    with open(sidecar_path, "w") as fp:
        # default=str: a stray Gf/Sdf value type still serializes rather than raising.
        json.dump(sidecar, fp, indent=1, default=str)
    print(f"sidecar: {sidecar_path} — {len(sidecar)} elements in {time.time() - t1:.1f}s")
    import_seconds = round(time.time() - t0, 2)
    print(f"total wall-clock: {import_seconds}s")

    # --- metrics (machine-readable; the assets UI card contract, identical to ifc_convert) ----
    if args.metrics:
        metrics_path = Path(args.metrics)
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        metrics = {
            "model": usd_path.stem,
            "usd": str(usd_path),
            "glb": str(glb_path),
            "sidecar": str(sidecar_path),
            "schema": "USD",
            "up_axis": str(up_axis),
            "shapes": count,
            "elements": len(sidecar),
            "import_seconds": import_seconds,
            "generated_by": "usd_convert.py",
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        with open(metrics_path, "w") as fp:
            json.dump(metrics, fp, indent=1)
        print(f"metrics: {metrics_path}")


if __name__ == "__main__":
    main()
