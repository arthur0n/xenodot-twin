extends SceneTree
## examples/gen_city.gd — synthesise the repeated-BIM "city block" SCALE / BENCH demo scene. This is
## the generator behind the scale showcase the optimize recipes are measured on: the three
## vis/occluder/fade findings all bench the many-unique-mesh city built HERE, and bench_sweep's
## worked example matrix (examples/bench_sweep.vis-fade.example.json) names its output `scene_in`.
## It is a DEMO ASSET generator — it lives in examples/ (like gen_plant_ifc.py) and is NOT
## materialized into a user project's tools/; run it as a --script against a viewer to build it.
## Prior art / methodology: plugin-twin/library/findings/twin-optimizer-benchmark-2026-07-08.md and
## the twin-optimize skill.
##
## Loads a single real BIM model (duplex.glb — the tutorial's Duplex, ~286 meshes) once via
## GLTFDocument (no editor import), deep-copies its whole tree into a GRID x GRID lattice on the XZ
## plane at PITCH-metre spacing, and adds one shadowless DirectionalLight3D + a flat-ambient
## WorldEnvironment so a bench/screenshot camera sees a lit scene. GlobalId-bearing MeshInstance3D
## node names are preserved verbatim in every copy so the twin-optimize instancing pass can still
## carry the join (check_twin_join.gd). Output is an .scn (binary) because runtime-loaded GLB meshes
## have no resource_path and would otherwise serialise inline into a huge .tscn (optimize gotcha).
##
## DETERMINISM (honest): there is NO RNG and NO wall-clock here, so the CENSUS and STRUCTURE are
## fully stable and reproducible — the same --grid always yields the same mesh count (GRID² × the
## duplex's ~286 = 28,600 at the default 10×10), the same node names (`Block_<gx>_<gz>` + the
## duplex's own GlobalId-bearing names), the same GlobalId join, and the same lattice layout. That
## is exactly what the findings depend on and what the optimize report reproduces. The emitted
## .scn's EXACT BYTES are NOT claimed byte-identical run-to-run (unlike gen_plant_ifc.py's IFC): it
## deep-copies runtime-loaded GLB mesh resources whose in-memory ids and PackedScene binary
## serialisation are not a determinism contract. The findings key off the census/report, never a
## file hash — so it suffices.
##
## Usage (headless-safe, deterministic structure; NO rendering needed) — run against a viewer
## project (copy this file into it or pass its path to --script):
##   $GODOT --headless --path <project> --script examples/gen_city.gd -- \
##       --src=<abs or res:// duplex.glb> --out=res://models/city_before.scn \
##       [--grid=10] [--pitch=30.0]
## The bench scenes are then built FROM this output by optimize_scene.gd, e.g. the ucity the
## findings use: `--in=res://models/city_before.scn --min-instances=100000` (nothing instances → the
## 28,600 meshes stay individual), or the c2 negative control `--chunks=2` (normal instancing).
##
## Output: one `GENCITY: OK {json}` line (meshes, nodes, grid, pitch) then exit 0.

## Default grid side. 10x10 copies of the ~286-mesh duplex ~= 28,600 MeshInstance3Ds — the
## repeated-equipment regime where MultiMesh instancing pays off (twin-optimize benchmark).
const DEFAULT_GRID := 10

## Default lattice pitch in metres between adjacent duplex copies. 30 m clears the duplex footprint
## (~10 m) with a street-width gap between rows, matching the prior-art city bench layout so the
## street/aerial vantages there stay valid.
const DEFAULT_PITCH_M := 30.0

## Sun orientation (radians): a fixed oblique key light. Shadows OFF on purpose — shadow passes
## would re-rank draw cost and confound the instancing-only measurement (twin-optimize caveat).
const SUN_ROTATION := Vector3(-0.9, -0.5, 0.0)

## Flat ambient so interiors/undersides read in overview shots without a second light. Values mirror
## the viewer's own WorldEnvironment (main.tscn) for visual parity.
const AMBIENT_COLOR := Color(0.72, 0.74, 0.8, 1.0)
const AMBIENT_ENERGY := 0.6
const BG_COLOR := Color(0.09, 0.1, 0.13, 1.0)

## Godot Environment enum values (named to avoid bare magic ints): sky-less flat background and a
## constant ambient-light source.
const BG_MODE_COLOR := 1  # Environment.BG_COLOR
const AMBIENT_SOURCE_COLOR := 2  # Environment.AMBIENT_SOURCE_COLOR

var src_path := ""
var out_path := ""
var grid := DEFAULT_GRID
var pitch := DEFAULT_PITCH_M


func _init() -> void:
	_main()


## global_transform is identity during SceneTree._init; gen only sets LOCAL transforms on the copy
## roots (baked into the packed scene), so no frame wait is needed — but keep the await so any
## future transform read stays honest.
func _main() -> void:
	await process_frame
	quit(_run())


func _run() -> int:
	if not _parse_args():
		return 1
	var duplex := _load_duplex()
	if duplex == null:
		return 1

	var city := Node3D.new()
	city.name = "City"
	root.add_child(city)
	_add_lighting(city)

	var copies := 0
	for gx: int in grid:
		for gz: int in grid:
			var copy := duplex.duplicate() as Node3D
			copy.name = "Block_%d_%d" % [gx, gz]
			copy.position = Vector3(gx * pitch, 0.0, gz * pitch)
			city.add_child(copy)
			copies += 1
	duplex.free()  # template no longer needed; copies are independent

	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(city, meshes)
	if not _save_scene(city):
		return 1

	var summary := {
		"output": out_path,
		"grid": "%dx%d" % [grid, grid],
		"pitch_m": pitch,
		"copies": copies,
		"meshes": meshes.size(),
		"nodes": _count_nodes(city),
	}
	print("GENCITY: OK ", JSON.stringify(summary))
	return 0


func _parse_args() -> bool:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--src="):
			src_path = a.substr("--src=".length())
		elif a.begins_with("--out="):
			out_path = a.substr("--out=".length())
		elif a.begins_with("--grid="):
			grid = maxi(a.substr("--grid=".length()).to_int(), 1)
		elif a.begins_with("--pitch="):
			pitch = maxf(a.substr("--pitch=".length()).to_float(), 1.0)
		else:
			push_error("GENCITY: FAIL — unknown argument '%s'" % a)
			return false
	if src_path == "" or out_path == "":
		push_error("GENCITY: FAIL — --src= and --out= are required")
		return false
	return true


func _load_duplex() -> Node3D:
	var gltf := GLTFDocument.new()
	var state := GLTFState.new()
	var err := gltf.append_from_file(_globalized(src_path), state)
	if err != OK:
		push_error("GENCITY: FAIL — GLB load error %d for %s" % [err, src_path])
		return null
	var scene := gltf.generate_scene(state) as Node3D
	if scene == null:
		push_error("GENCITY: FAIL — GLB produced no Node3D root: %s" % src_path)
	return scene


## res:// / user:// map through ProjectSettings; absolute OS paths pass; bare paths are res://.
func _globalized(p: String) -> String:
	if p.begins_with("res://") or p.begins_with("user://"):
		return ProjectSettings.globalize_path(p)
	if p.is_absolute_path():
		return p
	return ProjectSettings.globalize_path("res://" + p)


func _add_lighting(city: Node3D) -> void:
	var env := Environment.new()
	env.background_mode = BG_MODE_COLOR
	env.background_color = BG_COLOR
	env.ambient_light_source = AMBIENT_SOURCE_COLOR
	env.ambient_light_color = AMBIENT_COLOR
	env.ambient_light_energy = AMBIENT_ENERGY
	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = env
	city.add_child(we)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation = SUN_ROTATION
	sun.shadow_enabled = false
	city.add_child(sun)


func _collect_meshes(n: Node, out: Array[MeshInstance3D]) -> void:
	var mi := n as MeshInstance3D
	if mi != null and mi.mesh != null:
		out.append(mi)
	for c: Node in n.get_children():
		_collect_meshes(c, out)


func _count_nodes(n: Node) -> int:
	var total := 1
	for c: Node in n.get_children():
		total += _count_nodes(c)
	return total


## PackedScene.pack silently DROPS any node whose owner is unset — own every descendant first.
func _save_scene(city: Node3D) -> bool:
	_set_owner_recursive(city, city)
	var packed := PackedScene.new()
	if packed.pack(city) != OK:
		push_error("GENCITY: FAIL — PackedScene.pack failed")
		return false
	var abs_path := ProjectSettings.globalize_path(out_path)
	DirAccess.make_dir_recursive_absolute(abs_path.get_base_dir())
	var err := ResourceSaver.save(packed, out_path)
	if err != OK:
		push_error("GENCITY: FAIL — save error %d for %s" % [err, out_path])
		return false
	return true


func _set_owner_recursive(n: Node, owner_node: Node) -> void:
	for c: Node in n.get_children():
		c.owner = owner_node
		_set_owner_recursive(c, owner_node)
