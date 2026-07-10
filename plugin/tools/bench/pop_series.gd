extends SceneTree
## tools/bench/pop_series.gd — the PERCEPTUAL half of bench_sweep (skill: twin-optimize). Captures
## a dense scripted camera APPROACH along one axis, one PNG per step, in ONE windowed Godot process
## (load the scene once, translate the camera, capture each step) instead of N separate launches. It
## exists to make an LOD/visibility change VISIBLE frame-to-frame: a hard-pop config shows an abrupt
## full-object appearance between consecutive frames as objects cross the visibility_range_end
## cutoff; a working fade spreads that appearance as an alpha ramp over the [end, end+margin] band
## across several frames. Pair it with tools/bench/pop_analyze.py for the diff metrics. This is the
## documented "perceptual v2" the bench_sweep tool's docs point at — the numeric sweep
## (bench_sweep.sh) proves the cpu/object cost; this proves the visual character. Output stays
## FRAME-REVIEWED, pending human confirmation — an agent reviews the frames + diffs, a human still
## rules on the live fly-through.
##
## The camera flies a straight forward translation down one axis: at (x, y, z) looking at
## (x, y, z - look_ahead), so the view direction is a constant look down -Z and the ONLY thing
## changing frame to frame is objects crossing the cull shell. It captures z from --start-z down to
## --end-z in --step increments. Frames saved as <out-dir>/f_<NNN>_z<zzz>.png. The camera path
## coords are SCENE-SPECIFIC and REQUIRED (no defaults) — pick the axis your recipe's pop is on.
##
## Usage (NO --headless — the Dummy renderer saves blank images; this FAILS LOUD on headless):
##   $GODOT --path . --resolution 1280x720 -s tools/bench/pop_series.gd -- <scene.scn> \
##       --out-dir <abs dir> --x <cx> --y <cy> --start-z <z0> --end-z <z1> \
##       [--step 3] [--look-ahead 60] [--settle 6]
##
## Worked example — the fade-sweep street approach that first proved this (recipe:
## library/findings/twin-vis-fade-2026-07-10.md): the many-unique-mesh city (city_before.scn built
## by examples/gen_city.gd, optimized --min-instances=100000) benched down its street axis —
##   --x 139.5 --y 1.7 --start-z 126 --end-z 30 --step 3 --look-ahead 60
## steps z 126→30 in 3 m (32 frames), crossing the aggressive 60 m medium cutoff.
##
## Per-frame output: `POP: f<NNN> z=<z> -> <png>`; final `POP: DONE <count> frames`. A missing
## required coord or a headless renderer prints `POP: FAIL — <reason>` and exits 1.

## Far plane (metres): building-scale twins span hundreds of metres; 12 km clears any approach.
## Mirrors bench_scene.gd / shot_city.gd CAM_FAR_M so captures and benches frame the scene alike.
const CAM_FAR_M := 12000.0

## |dir . UP| above this counts as looking straight up/down, where Basis.looking_at degenerates;
## swap in a non-parallel up first. 0.999 ~= within ~2.6 deg of vertical (same guard as the bench).
const UP_PARALLEL_DOT := 0.999

## Frames to settle between placement and capture so shader compile / first-frame spikes don't leak
## into the diff. 6 is enough for these static approach scenes (matches the fade-sweep run).
const DEFAULT_SETTLE := 6

## Default forward step (metres) and look-ahead (metres) — methodology defaults, tune per scene. The
## camera coords (x/y/start-z/end-z) have NO defaults on purpose: they are the scene's own axis.
const DEFAULT_STEP := 3.0
const DEFAULT_LOOK_AHEAD := 60.0

## Sentinel for "required coord not supplied" — NAN can't be a real coordinate, so any left NAN
## after parse is a missing-arg FAIL (a bare 0.0 default would silently fly the camera to origin).
const UNSET := NAN

var scene_path := ""
var out_dir := ""
var cx := UNSET
var cy := UNSET
var start_z := UNSET
var end_z := UNSET
var step := DEFAULT_STEP
var look_ahead := DEFAULT_LOOK_AHEAD
var settle := DEFAULT_SETTLE

var _cam: Camera3D
var _positions: Array[float] = []
var _idx := 0
var _wait := 0
var _count := 0


func _initialize() -> void:
	if DisplayServer.get_name() == "headless":
		print("POP: FAIL — headless renderer saves blank images; run with a display")
		quit(1)
		return
	_parse_args()
	if not _args_ok():
		quit(1)
		return
	var packed := load(scene_path) as PackedScene
	if packed == null:
		print("POP: FAIL — cannot load %s" % scene_path)
		quit(1)
		return
	root.add_child(packed.instantiate())
	_cam = Camera3D.new()
	_cam.far = CAM_FAR_M
	root.add_child(_cam)
	_cam.make_current()
	DirAccess.make_dir_recursive_absolute(out_dir)
	var z := start_z
	while z >= end_z - 0.001:
		_positions.append(z)
		z -= step
	_place(_positions[0])


func _args_ok() -> bool:
	if scene_path == "" or out_dir == "":
		print("POP: FAIL — <scene> --out-dir <dir> required")
		return false
	if is_nan(cx) or is_nan(cy) or is_nan(start_z) or is_nan(end_z):
		print("POP: FAIL — --x --y --start-z --end-z are all required (the scene's approach axis)")
		return false
	if step <= 0.0:
		print("POP: FAIL — --step must be > 0")
		return false
	return true


func _parse_args() -> void:
	var args := OS.get_cmdline_user_args()
	var i := 0
	while i < args.size():
		var a: String = args[i]
		match a:
			"--out-dir":
				i += 1
				out_dir = args[i]
			"--x":
				i += 1
				cx = float(args[i])
			"--y":
				i += 1
				cy = float(args[i])
			"--start-z":
				i += 1
				start_z = float(args[i])
			"--end-z":
				i += 1
				end_z = float(args[i])
			"--step":
				i += 1
				step = float(args[i])
			"--look-ahead":
				i += 1
				look_ahead = float(args[i])
			"--settle":
				i += 1
				settle = int(args[i])
			_:
				if scene_path == "":
					scene_path = a if a.begins_with("res://") else "res://" + a
		i += 1


func _place(z: float) -> void:
	_cam.position = Vector3(cx, cy, z)
	var dir := Vector3(cx, cy, z - look_ahead) - _cam.position
	var up := Vector3.UP
	if absf(dir.normalized().dot(Vector3.UP)) > UP_PARALLEL_DOT:
		up = Vector3.FORWARD
	_cam.basis = Basis.looking_at(dir, up)


func _process(_delta: float) -> bool:
	_wait += 1
	if _wait < settle:
		return false
	_wait = 0
	_capture(_positions[_idx])
	_idx += 1
	if _idx >= _positions.size():
		print("POP: DONE %d frames" % _count)
		return true
	_place(_positions[_idx])
	return false


func _capture(z: float) -> void:
	await RenderingServer.frame_post_draw
	var img := root.get_viewport().get_texture().get_image()
	if img == null:
		print("POP: FAIL — viewport image null at z=%.0f" % z)
		return
	var png := "%s/f_%03d_z%03d.png" % [out_dir, _idx, roundi(z)]
	img.save_png(png)
	_count += 1
	print("POP: f%03d z=%.0f -> %s" % [_idx, z, png])
