# tools/verify_scene.gd — godot-verify layer 1: scene property validation.
extends SceneTree
## Scene property validator. Godot silently drops unknown properties when
## loading a .tscn, so hand-authored scenes can carry dead properties that
## never error at runtime. This script instantiates each scene and checks
## every property assignment in the .tscn text against the real property
## list of the node/resource it targets.
##
## Usage (from the project root):
##   godot --headless --path . --script tools/verify_scene.gd                    # all scenes
##   godot --headless --path . --script tools/verify_scene.gd -- levels/basic_room.tscn
##
## Exit code: 0 = clean, 1 = problems found (lines prefixed VERIFY-FAIL).

# Indexed-array property whitelist.
# Godot 4.x serialises some resource/node arrays as "prefix/N/subkey" where N
# is an integer index.  A fresh ClassDB.instantiate() or an empty Skeleton3D
# has zero entries, so get_property_list() never surfaces these keys — the
# checker would flag every one as unknown.  The tables below declare which
# (class, prefix, subkey) triples are canonical so they are accepted without
# a live-instance property-list hit.
# Key: class name (exact ClassDB string). Value: Dictionary{prefix -> Set[subkey]}.
const _INDEXED_ARRAY_PROPS: Dictionary = {
	"Animation":
	{
		"tracks":
		{
			"type": true,
			"path": true,
			"interp": true,
			"loop_wrap": true,
			"imported": true,
			"enabled": true,
			"keys": true,
			"method_library": true,
			"capture_mode": true,
		},
	},
	"Skin":
	{
		"bind":
		{
			"name": true,
			"bone": true,
			"pose": true,
		},
	},
	"Skeleton3D":
	{
		"bones":
		{
			"name": true,
			"parent": true,
			"rest": true,
			"enabled": true,
			"position": true,
			"rotation": true,
			"scale": true,
		},
	},
}

var failures := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var scenes: Array[String] = []
	if args.is_empty():
		_collect_scenes("res://", scenes)
	else:
		for a: String in args:
			scenes.append(a if a.begins_with("res://") else "res://" + a)
	for path: String in scenes:
		_verify(path)
	if failures > 0:
		print("VERIFY: FAIL — %d problem(s) in %d scene(s)" % [failures, scenes.size()])
		quit(1)
	else:
		print("VERIFY: OK — %d scene(s) clean" % scenes.size())
		quit(0)


func _collect_scenes(dir_path: String, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if dir.current_is_dir():
			if not entry.begins_with("."):
				_collect_scenes(dir_path.path_join(entry), out)
		elif entry.ends_with(".tscn"):
			out.append(dir_path.path_join(entry))
		entry = dir.get_next()


func _verify(path: String) -> void:
	if not ResourceLoader.exists(path):
		_fail(path, "", "file not found")
		return
	var packed := load(path) as PackedScene
	if packed == null:
		_fail(path, "", "failed to load (see engine errors above)")
		return
	var root_node := packed.instantiate()
	if root_node == null:
		_fail(path, "", "failed to instantiate")
		return
	_check_text_properties(path, root_node)
	root_node.free()


## Walks the .tscn text; for each section that maps to a live object,
## flags property names the object does not actually have.
func _check_text_properties(path: String, root_node: Node) -> void:
	var current: Object = null
	var current_label := ""
	var current_class := ""
	for raw_line: String in FileAccess.get_file_as_string(path).split("\n"):
		var line := raw_line.strip_edges()
		if line.begins_with("[node"):
			var node_name := _attr(line, "name")
			var parent := _attr(line, "parent")
			var node_path := "."
			if parent == ".":
				node_path = node_name
			elif parent != "":
				node_path = parent + "/" + node_name
			current = root_node if node_path == "." else root_node.get_node_or_null(node_path)
			current_label = "node " + node_name
			current_class = _attr(line, "type")
			if current == null:
				_fail(path, current_label, 'could not resolve node (parent="%s")' % parent)
			elif current_class == "":
				# Inherited type — ask the live object.
				current_class = current.get_class()
		elif line.begins_with("[sub_resource"):
			var type := _attr(line, "type")
			current = ClassDB.instantiate(type) if ClassDB.can_instantiate(type) else null
			current_label = "sub_resource " + type
			current_class = type
		elif line.begins_with("[ext_resource"):
			var rpath := _attr(line, "path")
			if rpath != "" and not ResourceLoader.exists(rpath):
				_fail(path, "ext_resource", "missing file: " + rpath)
			current = null
			current_class = ""
		elif line.begins_with("["):
			current = null
			current_class = ""
		elif current != null:
			var prop := _prop_name(line)
			if prop != "" and not _has_property(current, current_class, prop):
				_fail(
					path, current_label, 'unknown property "%s" (silently dropped by Godot)' % prop
				)


func _attr(line: String, key: String) -> String:
	var token := key + '="'
	var start := line.find(token)
	if start == -1:
		return ""
	start += token.length()
	var end := line.find('"', start)
	return line.substr(start, end - start) if end != -1 else ""


func _prop_name(line: String) -> String:
	var eq := line.find(" = ")
	if eq <= 0:
		return ""
	var prop := line.substr(0, eq)
	for i: int in prop.length():
		var c := prop.unicode_at(i)
		var ok := (
			(c >= 48 and c <= 57)
			or (c >= 65 and c <= 90)
			or (c >= 97 and c <= 122)
			or c == 95
			or c == 47
		)
		if not ok:
			return ""
	return prop


func _has_property(obj: Object, obj_class: String, prop: String) -> bool:
	# shader_parameter/* is dynamic (depends on the assigned shader) and
	# can't be checked on a fresh instance; metadata/* is always legal.
	# item/* is dynamic on MeshLibrary — items are stored under item/N/* keys that
	# only appear when items exist; a fresh instance has none in get_property_list().
	if (
		prop == "script"
		or prop.begins_with("metadata/")
		or prop.begins_with("shader_parameter/")
		or prop.begins_with("item/")
	):
		return true
	# Indexed-array properties (e.g. tracks/0/type on Animation, bones/2/rest on
	# Skeleton3D, bind/1/pose on Skin) are not present on a fresh empty instance
	# returned by ClassDB.instantiate() — the arrays are empty.  Accept them
	# when the class and subkey are both in the canonical whitelist.
	if _is_whitelisted_indexed_prop(obj_class, prop):
		return true
	for p: Dictionary in obj.get_property_list():
		if p["name"] == prop:
			return true
	return false


## Returns true if prop matches a canonical indexed-array pattern for obj_class.
## Pattern: "<prefix>/<non-negative-integer>/<subkey>" where both prefix and
## subkey appear in _INDEXED_ARRAY_PROPS[obj_class].  Unknown class, unknown
## prefix, or unknown subkey all return false — keeping the check strict.
func _is_whitelisted_indexed_prop(obj_class: String, prop: String) -> bool:
	if not _INDEXED_ARRAY_PROPS.has(obj_class):
		return false
	# Also accept parent classes: walk the ClassDB inheritance chain once.
	var class_name_to_check := obj_class
	var prefixes: Dictionary = {}
	while class_name_to_check != "":
		if _INDEXED_ARRAY_PROPS.has(class_name_to_check):
			@warning_ignore("unsafe_cast")
			var entry := _INDEXED_ARRAY_PROPS[class_name_to_check] as Dictionary
			for k: String in entry:
				if not prefixes.has(k):
					prefixes[k] = entry[k]
		class_name_to_check = ClassDB.get_parent_class(class_name_to_check)
	if prefixes.is_empty():
		return false
	# Decompose "prefix/N/subkey".
	var parts := prop.split("/")
	if parts.size() != 3:
		return false
	var prefix: String = parts[0]
	var index_str: String = parts[1]
	var subkey: String = parts[2]
	# Index segment must be a non-negative integer.
	for ch: int in range(index_str.length()):
		var c := index_str.unicode_at(ch)
		if c < 48 or c > 57:
			return false
	if not prefixes.has(prefix):
		return false
	@warning_ignore("unsafe_cast")
	var subkeys := prefixes[prefix] as Dictionary
	return subkeys.has(subkey)


func _fail(path: String, where: String, message: String) -> void:
	failures += 1
	print("VERIFY-FAIL %s [%s] %s" % [path, where, message])
