# tools/lib/twin_vis_range.gd — the visibility-range (distance-cull) half of twin-optimize, split
# out of optimize_scene.gd so the SceneTree driver stays a thin orchestrator and under the gdlint
# file-line cap (house pattern: class_name static utils in tools/lib/, referenced by bare class name
# — see TwinChunks/TwinHints).
#
# Owns: the four size-class defaults (VIS_* consts), fail-loud override validation (no silent clamp,
# unlike --min-instances — a corrupted sweep row must be loud), and the pass itself — classify each
# leftover MeshInstance3D by world-AABB diagonal and set visibility_range_end. MultiMesh batches are
# never touched: the driver only ever hands this the un-instanced leftovers still in the scene, and
# the pass walks MeshInstance3D nodes only (a MultiMeshInstance3D is not one), so instanced groups
# keep drawing at all distances. resolve() returns effective values the driver echoes in the report,
# so every optimized scene is self-describing.
class_name TwinVisRange
extends RefCounted

## --vis-ranges size classes by world-AABB diagonal (metres) and the distance each class fades at.
## Small clutter can vanish close; medium fixtures a bit further; large structure always draws.
## MEASURED (scoped win, kept as-is): these defaults (0.5/2 -> 40/120) win big on many-unique-mesh
## scenes (unique-city aerial cpu -32%, perceptually clean at street) and no-op on single buildings
## / fully-instanced scenes, so the pass stays opt-in. Sweep, tables and machine caveats:
## library-twin/findings/twin-vis-range-recipe-2026-07-09.md.
const VIS_SMALL_DIAGONAL_M := 0.5  # diagonal < 0.5 m -> "small"
const VIS_MEDIUM_DIAGONAL_M := 2.0  # diagonal < 2 m -> "medium"; larger keeps no range
const VIS_SMALL_END_M := 40.0  # small meshes fade past 40 m
const VIS_MEDIUM_END_M := 120.0  # medium meshes fade past 120 m


## Validate the four --vis-* size-class overrides and fold them onto the VIS_* defaults, returning a
## params Dictionary the driver stores for apply() + the report. vis_raw maps each provided flag
## ("--vis-small-diag=" etc) to its raw string; absent flags keep the default. FAILS LOUD (result
## {"ok": false, "error": ...}, the driver push_errors it) on a non-numeric or non-positive value,
## or size classes that don't nest (each medium threshold must strictly exceed its small one, else a
## class is unreachable or inverted) — silent clamping (as --min-instances does) would corrupt a
## sweep row unnoticed.
static func resolve(vis_raw: Dictionary) -> Dictionary:
	var out := {
		"ok": true,
		"error": "",
		"--vis-small-diag=": VIS_SMALL_DIAGONAL_M,
		"--vis-medium-diag=": VIS_MEDIUM_DIAGONAL_M,
		"--vis-small-end=": VIS_SMALL_END_M,
		"--vis-medium-end=": VIS_MEDIUM_END_M,
	}
	for flag: String in vis_raw:
		var raw: String = vis_raw[flag]
		if not raw.is_valid_float() or raw.to_float() <= 0.0:
			return _fail("%s value must be a number > 0, got '%s'" % [flag, raw])
		out[flag] = raw.to_float()
	if out["--vis-medium-diag="] <= out["--vis-small-diag="]:
		return _fail("--vis-medium-diag= must exceed --vis-small-diag=")
	if out["--vis-medium-end="] <= out["--vis-small-end="]:
		return _fail("--vis-medium-end= must exceed --vis-small-end=")
	return out


## --vis-ranges pass: set a visibility_range_end on leftover meshes by size class (small/medium;
## larger structure keeps none). Returns the number of meshes ranged.
static func apply(scene_root: Node3D, params: Dictionary) -> int:
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(scene_root, meshes)
	var small_diag: float = params["--vis-small-diag="]
	var medium_diag: float = params["--vis-medium-diag="]
	var small_end: float = params["--vis-small-end="]
	var medium_end: float = params["--vis-medium-end="]
	var set_count := 0
	for mi: MeshInstance3D in meshes:
		var diagonal := (mi.global_transform * mi.mesh.get_aabb()).size.length()
		if diagonal < small_diag:
			mi.visibility_range_end = small_end
			set_count += 1
		elif diagonal < medium_diag:
			mi.visibility_range_end = medium_end
			set_count += 1
	return set_count


## Pre-order walk of every MeshInstance3D carrying a mesh — the same set the driver's
## _collect_meshes gathers, kept here so the pass is self-contained. MultiMeshInstance3D is not a
## MeshInstance3D, so instanced batches are never collected.
static func _collect_meshes(n: Node, out: Array[MeshInstance3D]) -> void:
	var mi := n as MeshInstance3D
	if mi != null and mi.mesh != null:
		out.append(mi)
	for c: Node in n.get_children():
		_collect_meshes(c, out)


## Build a fail result: prefix the message with the tool's OPTIMIZE: FAIL banner so the driver can
## push_error it verbatim, keeping the loud-failure wording identical to inline validation.
static func _fail(msg: String) -> Dictionary:
	return {"ok": false, "error": "OPTIMIZE: FAIL — " + msg}
