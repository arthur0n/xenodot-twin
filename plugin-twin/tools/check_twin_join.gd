extends SceneTree
## tools/check_twin_join.gd — GlobalId join-coverage gate (skill: twin-verify, step 4).
##
## Loads a model (.glb/.gltf via GLTFDocument, .tscn via load()) and joins its candidate
## IFC GlobalIds against the property sidecar's keys. Candidates come from BOTH sources:
##   1. named MeshInstance3D nodes — the guid sits on the node or its parent grouping node;
##      Godot dedup suffixes ("<guid>2") are handled: a GlobalId is exactly 22 chars.
##   2. `twin_globalids` metadata arrays (PackedStringArray or Array) on optimized nodes
##      (MultiMeshInstance3D batches from twin-optimize) — each id counts individually.
## A node carrying `twin_globalids` is counted by its meta ids only, never by name too.
##
## Machine-parseable output (one line each), then exit 0/1:
##   JOIN: <matched>/<total> (<pct>%)
##   JOIN-GATE: OK|FAIL (min <pct>%)
##
## Usage (headless-safe, deterministic):
##   $GODOT --headless --path <project> --script tools/check_twin_join.gd -- \
##       --scene=<models/model.glb|scene.tscn> --sidecar=<models/model_props.json> \
##       [--min=0.95] [--json=<path/to/metrics.json>]
## .tscn paths must be project-relative (res://); .glb and sidecar may also be absolute.
##
## --json=<path> writes the verdict as a STRUCT, not just a log line, so the assets UI card can read
## it. If the path already holds a JSON object (e.g. ifc_convert.py --metrics wrote import time /
## shapes / schema there), the join fields are MERGED in — one file carries the whole import result.
## The join struct: join_matched, join_total, join_pct, join_gate (OK|FAIL), join_min_pct,
## sidecar_keys, mesh_nodes, multimesh_ids, join_checked_at (ISO-8601 UTC). It is written on the OK
## path and on FAIL paths that reach a verdict (threshold not met, zero candidates) — a failing join
## is a recorded fact, not a hole. It is NOT written on early-exit failures that never reach a verdict
## (unreadable/empty sidecar, scene-load failure) — there is no join struct to report yet.

## IFC GlobalId length in chars (buildingSMART base64) — the join key is this 22-char prefix, the
## same fact TwinHints.GUID_LEN and binding_map.gd GLOBALID_LEN encode.
const GUID_LEN := 22

## Default minimum matched/total ratio for the gate to PASS. 0.95 == 95 %: real BIM exports carry a
## few unnamed helper nodes, so demanding 100 % would false-fail; 95 % still catches a broken join.
## Mirrors verify_twin.sh's TWIN_JOIN_MIN default (0.95) — override with --min there and here.
const DEFAULT_JOIN_MIN := 0.95

## How many missing ids to print as a diagnostic sample (MISS_SAMPLE=...); enough to spot a pattern
## without dumping thousands on a total miss.
const MISS_SAMPLE := 5

var scene_path := ""
var sidecar_path := ""
var min_ratio := DEFAULT_JOIN_MIN
var json_path := ""


func _init() -> void:
	if not _parse_args():
		quit(1)
		return
	_run()


func _parse_args() -> bool:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--scene="):
			scene_path = a.substr("--scene=".length())
		elif a.begins_with("--sidecar="):
			sidecar_path = a.substr("--sidecar=".length())
		elif a.begins_with("--min="):
			min_ratio = float(a.substr("--min=".length()))
		elif a.begins_with("--json="):
			json_path = a.substr("--json=".length())
	if scene_path == "" or sidecar_path == "":
		push_error(
			(
				"JOIN-GATE: FAIL — usage: --scene=<model.glb|scene.tscn>"
				+ " --sidecar=<props.json> [--min=%.2f]" % DEFAULT_JOIN_MIN
			)
		)
		return false
	return true


func _run() -> void:
	var side := _load_sidecar()
	if side.is_empty():
		print("JOIN-GATE: FAIL (empty or unreadable sidecar: %s)" % sidecar_path)
		quit(1)
		return
	print("SIDECAR_KEYS=%d" % side.size())

	var scene := _load_scene()
	if scene == null:
		quit(1)
		return
	root.add_child(scene)

	var mesh_nodes: Array[Node] = []
	var meta_ids: Array[String] = []
	_collect(scene, mesh_nodes, meta_ids)

	var matched := 0
	var total := 0
	var misses: Array[String] = []
	for m in mesh_nodes:
		total += 1
		if _guid_for(m, side) != "":
			matched += 1
		else:
			misses.append(str(m.name))
	for gid in meta_ids:
		total += 1
		if side.has(gid):
			matched += 1
		else:
			misses.append(gid)

	print("JOIN-SOURCES: mesh_nodes=%d multimesh_ids=%d" % [mesh_nodes.size(), meta_ids.size()])
	if not misses.is_empty():
		print("MISS_SAMPLE=", misses.slice(0, MISS_SAMPLE))
	var pct := 0.0
	if total > 0:
		pct = (100.0 * matched) / total
	print("JOIN: %d/%d (%.1f%%)" % [matched, total, pct])
	if total == 0:
		print(
			(
				(
					"JOIN-GATE: FAIL (min %.1f%%) — no candidates (no MeshInstance3D nodes,"
					+ " no twin_globalids metas)"
				)
				% (min_ratio * 100.0)
			)
		)
		_write_json(matched, total, pct, "FAIL", side.size(), mesh_nodes.size(), meta_ids.size())
		quit(1)
		return
	var ok := float(matched) / float(total) >= min_ratio
	var gate := "OK" if ok else "FAIL"
	print("JOIN-GATE: %s (min %.1f%%)" % [gate, min_ratio * 100.0])
	_write_json(matched, total, pct, gate, side.size(), mesh_nodes.size(), meta_ids.size())
	quit(0 if ok else 1)


## Merge the join verdict as a STRUCT into --json=<path> (a no-op when unset). If the file already
## holds a JSON object (ifc_convert.py --metrics), the join_* fields are added beside it so one file
## carries the whole import result; otherwise a fresh object is written.
func _write_json(
	matched: int, total: int, pct: float, gate: String, keys: int, meshes: int, multis: int
) -> void:
	if json_path == "":
		return
	var out_path := _globalized(json_path)
	var merged: Dictionary = {}
	var raw_txt := FileAccess.get_file_as_string(out_path)
	var existing: Variant = JSON.parse_string(raw_txt)
	if existing is Dictionary:
		merged = existing
	elif raw_txt != "":
		# The file exists and has content, but failed to parse as JSON — most likely a
		# corrupt metrics file (would otherwise carry ifc_convert.py's schema/shape counts).
		# Don't silently clobber it: warn and write the join verdict to a sibling file instead
		# so the corrupt original survives for inspection alongside the fresh join result.
		push_error(
			(
				"JOIN: --json=%s exists but is not valid JSON — leaving it untouched, writing"
				+ " join verdict to a sibling file instead"
			) % json_path
		)
		out_path += ".join.json"
	merged["join_matched"] = matched
	merged["join_total"] = total
	merged["join_pct"] = snappedf(pct, 0.1)
	merged["join_gate"] = gate
	merged["join_min_pct"] = snappedf(min_ratio * 100.0, 0.1)
	merged["sidecar_keys"] = keys
	merged["mesh_nodes"] = meshes
	merged["multimesh_ids"] = multis
	merged["join_checked_at"] = Time.get_datetime_string_from_system(true) + "Z"
	var fh := FileAccess.open(out_path, FileAccess.WRITE)
	if fh == null:
		push_error(
			"JOIN: could not write --json=%s (%s)" % [out_path, error_string(FileAccess.get_open_error())]
		)
		return
	fh.store_string(JSON.stringify(merged, " "))
	fh.close()
	print("JOIN-JSON: %s" % out_path)


## res:// stays project-mapped; absolute OS paths pass through; bare paths are res://-relative.
func _globalized(p: String) -> String:
	if p.begins_with("res://"):
		return ProjectSettings.globalize_path(p)
	if p.is_absolute_path():
		return p
	return ProjectSettings.globalize_path("res://" + p)


func _load_sidecar() -> Dictionary:
	var txt := FileAccess.get_file_as_string(_globalized(sidecar_path))
	var parsed: Variant = JSON.parse_string(txt)
	if parsed is Dictionary:
		return parsed
	return {}


func _load_scene() -> Node:
	var lower := scene_path.to_lower()
	if lower.ends_with(".glb") or lower.ends_with(".gltf"):
		var gltf := GLTFDocument.new()
		var state := GLTFState.new()
		var err := gltf.append_from_file(_globalized(scene_path), state)
		if err != OK:
			push_error("JOIN-GATE: FAIL — GLB load failed (%s): %s" % [scene_path, err])
			return null
		return gltf.generate_scene(state)
	var res_path := scene_path if scene_path.begins_with("res://") else "res://" + scene_path
	var packed: PackedScene = load(res_path)
	if packed == null:
		push_error("JOIN-GATE: FAIL — cannot load scene %s" % res_path)
		return null
	return packed.instantiate()


## Walk the tree collecting both candidate sources (meta-carrying nodes are meta-only).
func _collect(n: Node, mesh_nodes: Array[Node], meta_ids: Array[String]) -> void:
	if n.has_meta("twin_globalids"):
		var raw: Variant = n.get_meta("twin_globalids")
		if raw is PackedStringArray:
			for gid: String in raw:
				meta_ids.append(gid)
		elif raw is Array:
			for e: Variant in raw:
				meta_ids.append(str(e))
	elif n is MeshInstance3D:
		mesh_nodes.append(n)
	for c in n.get_children():
		_collect(c, mesh_nodes, meta_ids)


## Node names may be Godot-sanitized (dedup suffixes) or the guid may sit on the parent
## grouping node (glTF nodes with children). A GlobalId is exactly GUID_LEN chars.
func _guid_for(n: Node, side: Dictionary) -> String:
	var parent := n.get_parent()
	var cands: Array[String] = [str(n.name), str(parent.name) if parent != null else ""]
	for c in cands:
		if side.has(c):
			return c
		if c.length() > GUID_LEN and side.has(c.substr(0, GUID_LEN)):
			return c.substr(0, GUID_LEN)
	return ""
