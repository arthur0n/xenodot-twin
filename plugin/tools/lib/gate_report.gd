# tools/lib/gate_report.gd — ONE machine-readable verdict shape for every twin gate (house pattern:
# class_name static utils in tools/lib/, referenced by bare class name — see TwinHints/NodeBuilder).
#
# The join gate (check_twin_join.gd), the data-binding smoke (smoke_binding.gd) and the playback
# determinism gate (check_playback.gd) all answer --json=<path> the SAME way, so a UI badge (or CI
# reader) needs to understand only one merge-and-write contract, not three near-copies that drift.
# This file IS that contract; the three gates call GateReport.merge_write(...) instead of each
# hand-rolling the file I/O. Splitting it out is also what let the copies stop diverging (join and
# bind had already grown apart on the corrupt-file case — see merge_write's elif branch).
#
# Contract:
#   * --json="" is a no-op (the gate simply prints its log lines and exits — no file demanded).
#   * If --json=<path> already holds a JSON object, the gate's fields are MERGED in (overwriting the
#     gate's own keys, leaving a sibling gate's keys intact) so ONE file can carry a whole import
#     result — ifc_convert.py's --metrics + JOIN + BIND-SMOKE + PLAYBACK all beside each other.
#   * If the path holds NON-JSON bytes (a genuinely corrupt file, not a sibling gate's struct),
#     the original is LEFT UNTOUCHED for inspection and the verdict is written to a sibling
#     <path>.<gate>.json instead — a gate must never silently clobber evidence of corruption.
#   * Every field the gate passes is overwritten on every run, so a previously-green struct cannot
#     survive a later failure and keep a UI badge lying green (the stale-green invariant the join
#     and bind gates already enforce, now enforced in one place).
class_name GateReport
extends RefCounted


# res:// and user:// stay engine-mapped; absolute OS paths pass through; bare paths are res-based.
# The union of the three gates' former per-file _globalized/_globalize helpers — one resolver now.
static func globalize(p: String) -> String:
	if p.begins_with("res://") or p.begins_with("user://"):
		return ProjectSettings.globalize_path(p)
	if p.is_absolute_path():
		return p
	return ProjectSettings.globalize_path("res://" + p)


# Merge `fields` into the JSON object at `json_path`, write it back, printing "<GATE>-JSON: <path>".
# `gate_label` is the gate's short name ("JOIN", "BIND-SMOKE", "PLAYBACK") — it names the log line
# and, on the corrupt-file path, the sibling ext (.join.json / .bind_smoke.json / .playback.json).
#
# RETURNS true when the verdict is persisted (or when --json="" so nothing was demanded), false when
# an EXPLICIT --json path could not be written. A false is FATAL to the caller: a gate that cannot
# write its demanded verdict must exit non-zero even if its own result was OK, or a prior green
# struct survives the failed write and keeps a UI badge lying green (the stale-green class). Every
# caller checks the return and fails closed on false — see check_twin_join.gd / smoke_binding.gd /
# check_playback.gd. (An unwritable path was previously push_error+return void, which the passing
# gate ignored — the exact stale-green hole this bool closes.)
static func merge_write(json_path: String, fields: Dictionary, gate_label: String) -> bool:
	if json_path == "":
		return true
	var out_path := globalize(json_path)
	var merged: Dictionary = {}
	var raw_txt := FileAccess.get_file_as_string(out_path)
	var existing: Variant = JSON.parse_string(raw_txt)
	if existing is Dictionary:
		merged = existing
	elif raw_txt != "":
		# The file exists and has content but is not JSON — most likely a corrupt metrics file.
		# Don't clobber it: warn and write the verdict to a sibling so the original survives.
		push_error(
			(
				(
					"%s: --json=%s exists but is not valid JSON — leaving it untouched, writing"
					+ " verdict to a sibling file instead"
				)
				% [gate_label, json_path]
			)
		)
		out_path += ".%s.json" % gate_label.to_lower().replace("-", "_")
	merged.merge(fields, true)
	var fh := FileAccess.open(out_path, FileAccess.WRITE)
	if fh == null:
		push_error(
			(
				(
					"%s: could not write --json=%s (%s) — FAILING the gate: an unwritten verdict must"
					+ " never leave a prior green struct standing"
				)
				% [gate_label, out_path, error_string(FileAccess.get_open_error())]
			)
		)
		return false
	fh.store_string(JSON.stringify(merged, " "))
	fh.close()
	print("%s-JSON: %s" % [gate_label, out_path])
	return true


# ISO-8601 UTC stamp with a trailing Z — the format every gate's <gate>_checked_at field uses.
static func now_iso() -> String:
	return Time.get_datetime_string_from_system(true) + "Z"
