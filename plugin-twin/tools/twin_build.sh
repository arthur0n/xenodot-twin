#!/bin/bash
# tools/twin_build.sh — one command, IFC → verified, data-bound twin (skill: twin-build).
#
# The deterministic driver that chains the twin pipeline's four existing tools into a single
# gate: import (tools/ifc_convert.py) → optimize (tools/optimize_scene.gd) → verify
# (tools/verify_twin.sh) → summary with the exact boot command. Same discipline as
# verify_twin.sh: loud stage labels, exit nonzero on the FIRST failure, and a SKIP is never a
# pass (the binding smoke SKIPs loudly when no map is wired — the summary names the next step).
#
# It orchestrates ONLY; every number stays gate-backed. --occluders / --vis-ranges are
# pass-through to the optimizer and NEVER default-on (their recipes are unmeasured — roadmap #4).
# The venv is never auto-created: uv may be absent and silently building environments hides
# failures, so a missing .venv-ifc FAILs loud with the exact two uv commands (the skill owns
# recovery). --wire is the ONLY thing that touches user data (viewer.cfg), opt-in, with a .bak.
#
# Usage (from the project root or anywhere):
#   tools/twin_build.sh <model.ifc> [--map binding_map.json] [--out-dir models/]
#                       [--chunks auto|N] [--min-instances N] [--hints h.json]
#                       [--occluders] [--vis-ranges] [--wire]
# Exit 0 = every non-SKIP gate passed ("twin-build: OK").
set -u
# Resolve the script dir BEFORE cd, so sourcing is robust however the script was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1
PATH="$HOME/.local/bin:$PATH"

# Label the shared engine resolver's output as this gate's.
XENO_GATE="twin-build"
# shellcheck source=lib/checks.sh
source "$SCRIPT_DIR/lib/checks.sh"

_stage() { printf '\n== %s [%s] %s ==\n' "$XENO_GATE" "$1" "$2"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}

_usage() {
	cat <<'USAGE'
usage: tools/twin_build.sh <model.ifc> [options]
  --map <binding_map.json>   binding map for the data-binding smoke (else it SKIPs loudly)
  --out-dir <dir>            artifact directory for the glb/sidecar/scene (default: models)
  --chunks <auto|N>          optimizer chunk grid (pass-through to optimize_scene.gd)
  --min-instances <N>        optimizer MultiMesh threshold (pass-through)
  --hints <hints.json>       optimizer per-GlobalId hints (pass-through)
  --occluders                optimizer occluder pass (pass-through; NEVER default-on)
  --vis-ranges               optimizer visibility ranges (pass-through; NEVER default-on)
  --wire                     point viewer.cfg [viewer] model= at the optimized scene (keeps .bak)
USAGE
}

# --- argument parse (one positional IFC + flags) -----------------------------------------------
IFC=""
MAP=""
OUT_DIR="models"
CHUNKS=""
MIN_INSTANCES=""
HINTS=""
WANT_OCCLUDERS=0
WANT_VIS_RANGES=0
WANT_WIRE=0
while [ $# -gt 0 ]; do
	case "$1" in
	--map)
		[ $# -ge 2 ] || _fail "--map requires a value"
		MAP="$2"
		shift 2
		;;
	--out-dir)
		[ $# -ge 2 ] || _fail "--out-dir requires a value"
		OUT_DIR="$2"
		shift 2
		;;
	--chunks)
		[ $# -ge 2 ] || _fail "--chunks requires a value (auto|N)"
		CHUNKS="$2"
		shift 2
		;;
	--min-instances)
		[ $# -ge 2 ] || _fail "--min-instances requires a value"
		MIN_INSTANCES="$2"
		shift 2
		;;
	--hints)
		[ $# -ge 2 ] || _fail "--hints requires a value"
		HINTS="$2"
		shift 2
		;;
	--occluders)
		WANT_OCCLUDERS=1
		shift
		;;
	--vis-ranges)
		WANT_VIS_RANGES=1
		shift
		;;
	--wire)
		WANT_WIRE=1
		shift
		;;
	-h | --help)
		_usage
		exit 0
		;;
	--*)
		_usage >&2
		_fail "unknown option '$1'"
		;;
	*)
		if [ -z "$IFC" ]; then
			IFC="$1"
		else
			_fail "unexpected argument '$1' (one IFC model per build)"
		fi
		shift
		;;
	esac
done
if [ -z "$IFC" ]; then
	_usage >&2
	_fail "no IFC model given"
fi

# Artifact paths derive from the input stem, co-located under --out-dir (the boot command and
# verify both reference them there); the optimize report lands under reports/ (build metadata).
STEM="$(basename "$IFC")"
STEM="${STEM%.*}"
GLB="$OUT_DIR/$STEM.glb"
SIDECAR="$OUT_DIR/${STEM}_props.json"
OPT_SCENE="$OUT_DIR/${STEM}_opt.tscn"
REPORT="reports/${STEM}_optimize.json"
VENV_PY=".venv-ifc/bin/python"

# --- stage 1: preflight ------------------------------------------------------------------------
_stage 1/5 "preflight"
[ -f project.godot ] || _fail "no project.godot in $(pwd) — run twin_build.sh from a Godot project root"
xeno_resolve_engine || exit 1
[ -f "$IFC" ] || _fail "no such IFC model: $IFC"
if [ -n "$MAP" ] && [ ! -f "$MAP" ]; then
	_fail "no such binding map: $MAP (drop --map to run the build without the smoke)"
fi
if [ -n "$HINTS" ] && [ ! -f "$HINTS" ]; then
	_fail "no such hints file: $HINTS"
fi
if [ ! -x "$VENV_PY" ] || ! "$VENV_PY" -c "import ifcopenshell" >/dev/null 2>&1; then
	echo "$XENO_GATE: FAIL preflight — the ifcopenshell venv (.venv-ifc) is missing or broken." >&2
	echo "  ifcopenshell has NO wheel for Python 3.14 — create the pinned 3.12 venv (skill twin-import):" >&2
	echo "    uv venv --python 3.12 .venv-ifc && source .venv-ifc/bin/activate" >&2
	echo "    uv pip install ifcopenshell==0.8.5" >&2
	echo "  twin_build.sh never auto-creates it (uv may be absent; silently building envs hides failures)." >&2
	exit 1
fi
echo "$XENO_GATE: PASS preflight (engine + .venv-ifc/ifcopenshell present)"

# --- stage 2: import (IFC → GLB + sidecar) -----------------------------------------------------
_stage 2/5 "import (ifc_convert.py)"
mkdir -p "$OUT_DIR"
if ! "$VENV_PY" tools/ifc_convert.py "$IFC" --glb "$GLB" --sidecar "$SIDECAR"; then
	_fail "import failed (ifc_convert.py) — see output above"
fi
if [ ! -f "$GLB" ] || [ ! -f "$SIDECAR" ]; then
	_fail "import produced no $GLB / $SIDECAR"
fi
echo "$XENO_GATE: PASS import ($GLB + $SIDECAR)"

# --- stage 3: optimize (GLB → optimized .tscn + report) ----------------------------------------
_stage 3/5 "optimize (optimize_scene.gd)"
OPT_ARGS=("--in=$GLB" "--out=$OPT_SCENE" "--report=$REPORT")
[ -n "$CHUNKS" ] && OPT_ARGS+=("--chunks=$CHUNKS")
[ -n "$MIN_INSTANCES" ] && OPT_ARGS+=("--min-instances=$MIN_INSTANCES")
[ -n "$HINTS" ] && OPT_ARGS+=("--hints=$HINTS")
[ "$WANT_OCCLUDERS" -eq 1 ] && OPT_ARGS+=("--occluders")
[ "$WANT_VIS_RANGES" -eq 1 ] && OPT_ARGS+=("--vis-ranges")
if ! "$GODOT" --headless --path . --script tools/optimize_scene.gd -- "${OPT_ARGS[@]}"; then
	_fail "optimize failed (optimize_scene.gd) — see OPTIMIZE lines above"
fi
[ -f "$OPT_SCENE" ] || _fail "optimize produced no $OPT_SCENE"
echo "$XENO_GATE: PASS optimize ($OPT_SCENE, report $REPORT)"

# --- stage 4: verify (join gate on the import; smoke + static floor on the optimized scene) ----
_stage 4/5 "verify (verify_twin.sh)"
VLOG=".xenodot/tmp/twin-build-verify.log"
mkdir -p "$(dirname "$VLOG")"
VERIFY_ENV=("TWIN_MODEL=$GLB" "TWIN_SIDECAR=$SIDECAR")
[ -n "$MAP" ] && VERIFY_ENV+=("TWIN_BINDING_MAP=$MAP")
# Tee so the gate's output stays LIVE while we keep it to name the next step in the summary.
env "${VERIFY_ENV[@]}" tools/verify_twin.sh "$OPT_SCENE" 2>&1 | tee "$VLOG"
VERIFY_RC=${PIPESTATUS[0]}
if [ "$VERIFY_RC" -ne 0 ]; then
	echo "$XENO_GATE: FAIL verify — a gate failed (see verify-twin output above)" >&2
	exit "$VERIFY_RC"
fi
SMOKE_SKIPPED=0
grep -q "SKIP binding-smoke" "$VLOG" && SMOKE_SKIPPED=1
echo "$XENO_GATE: PASS verify (every non-SKIP gate green)"

# --- stage 5: summary (artifacts + gate outcome + the exact boot command) ----------------------
_stage 5/5 "summary"
echo "  artifacts:"
echo "    import glb    $GLB"
echo "    import props  $SIDECAR"
echo "    optimized     $OPT_SCENE"
echo "    optimize rpt  $REPORT"
echo
if [ "$SMOKE_SKIPPED" -eq 1 ]; then
	echo "  binding smoke SKIPPED — no binding map wired into this build (a SKIP is not a pass)."
	echo "  NEXT: author a binding map with the twin-bind-data skill, then rerun with:"
	echo "    tools/twin_build.sh $IFC --map <binding_map.json>"
	echo
fi
echo "  boot the optimized twin (live against the sim):"
echo "    $GODOT --path . -- --model=$OPT_SCENE"

# --wire: the ONLY write to user data. Godot's ConfigFile.save() DROPS comments, so we validate
# the file parses under Godot's own INI dialect with ConfigFile, then rewrite ONLY the [viewer]
# model= line in a headless Godot pass — preserving every comment and other key. Previous file is
# kept as viewer.cfg.bak (scripts don't silently overwrite user data).
if [ "$WANT_WIRE" -eq 1 ]; then
	CFG="viewer.cfg"
	if [ -f "$CFG" ]; then
		cp "$CFG" "$CFG.bak"
		echo "  --wire: kept previous $CFG as $CFG.bak"
	fi
	WIRE_GD=".xenodot/tmp/twin_build_wire.gd"
	mkdir -p "$(dirname "$WIRE_GD")"
	cat >"$WIRE_GD" <<'WIRE_EOF'
extends SceneTree
## twin_build.sh --wire helper: set viewer.cfg [viewer] model= to the optimized scene while
## preserving comments and every other key (ConfigFile.save() drops comments, so we only rewrite
## the model= line). Validates the file parses as Godot INI via ConfigFile before touching it.


func _init() -> void:
	quit(_run())


func _run() -> int:
	var cfg := ""
	var model := ""
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--cfg="):
			cfg = a.substr("--cfg=".length())
		elif a.begins_with("--model="):
			model = a.substr("--model=".length())
	if cfg == "" or model == "":
		push_error("WIRE: FAIL — --cfg= and --model= are required")
		return 1
	if FileAccess.file_exists(cfg):
		var probe := ConfigFile.new()
		var perr := probe.load(cfg)
		if perr != OK:
			push_error("WIRE: FAIL — %s is not valid Godot INI (err %d)" % [cfg, perr])
			return 1
	var new_line := 'model="%s"' % model
	var lines := PackedStringArray()
	if FileAccess.file_exists(cfg):
		lines = FileAccess.get_file_as_string(cfg).split("\n")
	var out := PackedStringArray()
	var in_viewer := false
	var seen_viewer := false
	var wrote := false
	for line in lines:
		var t := line.strip_edges()
		if t.begins_with("[") and t.ends_with("]"):
			if in_viewer and not wrote:
				out.append(new_line)
				wrote = true
			in_viewer = t == "[viewer]"
			seen_viewer = seen_viewer or in_viewer
			out.append(line)
			continue
		if in_viewer and not wrote and t.split("=")[0].strip_edges() == "model":
			out.append(new_line)
			wrote = true
			continue
		out.append(line)
	if in_viewer and not wrote:
		out.append(new_line)
		wrote = true
	if not seen_viewer:
		if out.size() > 0 and out[out.size() - 1].strip_edges() != "":
			out.append("")
		out.append("[viewer]")
		out.append(new_line)
	var fa := FileAccess.open(cfg, FileAccess.WRITE)
	if fa == null:
		push_error("WIRE: FAIL — cannot write %s" % cfg)
		return 1
	fa.store_string("\n".join(out))
	fa.close()
	print("WIRE: OK — %s [viewer] model=%s" % [cfg, model])
	return 0
WIRE_EOF
	if ! "$GODOT" --headless --path . --script "$WIRE_GD" -- "--cfg=$PWD/$CFG" "--model=res://$OPT_SCENE"; then
		rm -f "$WIRE_GD"
		_fail "--wire failed to update $CFG (restore from $CFG.bak if it was changed)"
	fi
	rm -f "$WIRE_GD"
	echo "  --wire: $CFG [viewer] model=res://$OPT_SCENE"
fi

echo
echo "$XENO_GATE: OK"
