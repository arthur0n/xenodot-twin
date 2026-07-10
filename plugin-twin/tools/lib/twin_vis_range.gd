# tools/lib/twin_vis_range.gd — the visibility-range (distance-cull) half of twin-optimize, split
# out of optimize_scene.gd so the SceneTree driver stays a thin orchestrator and under the gdlint
# file-line cap (house pattern: class_name static utils in tools/lib/, referenced by bare class name
# — see TwinChunks/TwinHints).
#
# Owns: the four size-class defaults (VIS_* consts), fail-loud override validation (no silent clamp,
# unlike --min-instances — a corrupted sweep row must be loud), the optional fade band, and the pass
# itself — classify each leftover MeshInstance3D by world-AABB diagonal and set visibility_range_end
# (+ optional end_margin/fade_mode). MultiMesh batches are never touched: the driver only ever hands
# this the un-instanced leftovers still in the scene, and the pass walks MeshInstance3D nodes only
# (a MultiMeshInstance3D is not one), so instanced groups keep drawing at all distances. resolve()
# returns effective values the driver echoes in the report, so every optimized scene is self-
# describing.
#
# Fade band (item #6, VERIFIED Godot 4.6.3): a positive end_margin + a non-DISABLED fade_mode makes
# a ranged object fade to transparency over [end, end+end_margin] instead of hard-popping at end.
# SELF fades the object itself; DEPENDENCIES fades its Node3D.visibility_parent LOD dependencies.
# CAVEAT the recipe must carry: SELF/DEPENDENCIES only render the fade under Forward+ — the Mobile/
# Compatibility renderer (the web export) treats both as DISABLED, so the pop returns there.
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


## Validate the --vis-* size-class overrides + the two --vis-fade knobs, folding them onto the VIS_*
## / no-fade defaults and returning a params Dictionary the driver stores for apply() + the report.
## vis_raw maps each provided --vis-* flag ("--vis-small-diag=" etc) to its raw string; the fade_*
## args carry the raw --vis-fade-margin=/--vis-fade-mode= strings plus a provided bit each (an EMPTY
## value must fail loud, so "" cannot double as absent). FAILS LOUD (result {"ok": false, "error":
## ...}, the driver push_errors it) on a non-numeric or non-positive value, size classes that don't
## nest (each medium threshold must strictly exceed its small one), or an invalid fade combo —
## silent clamping (as --min-instances does) would corrupt a sweep row unnoticed.
static func resolve(
	vis_raw: Dictionary,
	fade_margin_raw: String,
	fade_margin_provided: bool,
	fade_mode_raw: String,
	fade_mode_provided: bool
) -> Dictionary:
	var out := {
		"ok": true,
		"error": "",
		"--vis-small-diag=": VIS_SMALL_DIAGONAL_M,
		"--vis-medium-diag=": VIS_MEDIUM_DIAGONAL_M,
		"--vis-small-end=": VIS_SMALL_END_M,
		"--vis-medium-end=": VIS_MEDIUM_END_M,
		"fade_margin": 0.0,  # visibility_range_end_margin; 0 = no fade band
		"fade_mode": GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED,
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
	return _resolve_fade(
		out, fade_margin_raw, fade_margin_provided, fade_mode_raw, fade_mode_provided
	)


## Validate + couple the fade knobs onto out.fade_margin / out.fade_mode. The margin (metres > 0) is
## the fade band width; the mode picks the enum. Coupling rule (VERIFIED): a zero-width band never
## fades, so a mode REQUIRES a positive margin (fails loud); a margin without an explicit mode
## defaults to SELF (fade the object — the common case). Absent flags keep the no-fade default.
static func _resolve_fade(
	out: Dictionary,
	margin_raw: String,
	margin_provided: bool,
	mode_raw: String,
	mode_provided: bool
) -> Dictionary:
	if margin_provided:
		if not margin_raw.is_valid_float() or margin_raw.to_float() <= 0.0:
			return _fail("--vis-fade-margin= value must be a number > 0, got '%s'" % margin_raw)
		out["fade_margin"] = margin_raw.to_float()
	if mode_provided:
		if mode_raw == "self":
			out["fade_mode"] = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		elif mode_raw == "deps":
			out["fade_mode"] = GeometryInstance3D.VISIBILITY_RANGE_FADE_DEPENDENCIES
		else:
			return _fail("--vis-fade-mode= must be 'self' or 'deps', got '%s'" % mode_raw)
		if out["fade_margin"] <= 0.0:
			return _fail("--vis-fade-mode= needs a positive --vis-fade-margin=")
	elif out["fade_margin"] > 0.0:
		out["fade_mode"] = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
	return out


## --vis-ranges pass: set a visibility_range_end on leftover meshes by size class (small/medium;
## larger structure keeps none), plus the optional fade band. Returns the number of meshes ranged.
static func apply(scene_root: Node3D, params: Dictionary) -> int:
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(scene_root, meshes)
	var small_diag: float = params["--vis-small-diag="]
	var medium_diag: float = params["--vis-medium-diag="]
	var small_end: float = params["--vis-small-end="]
	var medium_end: float = params["--vis-medium-end="]
	var fade_margin: float = params["fade_margin"]
	var fade_mode: int = params["fade_mode"]
	var set_count := 0
	for mi: MeshInstance3D in meshes:
		var diagonal := (mi.global_transform * mi.mesh.get_aabb()).size.length()
		if diagonal < small_diag:
			mi.visibility_range_end = small_end
		elif diagonal < medium_diag:
			mi.visibility_range_end = medium_end
		else:
			continue
		# No-op at the default (margin 0): end_margin/fade_mode stay at their defaults and neither
		# serialises, keeping a no-fade run byte-identical to the pre-fade pass.
		if fade_margin > 0.0:
			mi.visibility_range_end_margin = fade_margin
			mi.visibility_range_fade_mode = fade_mode
		set_count += 1
	return set_count


## Fade enum -> report label, so the driver's echoed effective fade is human-readable.
static func mode_label(mode: int) -> String:
	match mode:
		GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF:
			return "self"
		GeometryInstance3D.VISIBILITY_RANGE_FADE_DEPENDENCIES:
			return "deps"
		_:
			return "disabled"


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
