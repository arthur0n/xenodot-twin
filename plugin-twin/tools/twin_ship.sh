#!/bin/bash
# tools/twin_ship.sh — package the exported viewer + model + data as ONE deployable (skill: twin-ship).
#
# The last step of the twin journey: an export-safe viewer build (twin-ship phase 1) plus the
# swappable data tree beside it, so a site retargets url=/model= WITHOUT re-exporting (the
# data-beside-build contract — data is NOT baked into the pck; the pck is code + starter scenes).
# Same discipline as twin_build.sh / verify_twin.sh: loud stage labels, exit nonzero on the FIRST
# failure, and a SKIP is never a pass (the cross-platform smoke SKIPs loudly — you cannot run a
# Linux ELF on macOS, so the tool refuses to fake a green there).
#
# It orchestrates the five ship stages and reinvents nothing: export delegates to the base export
# doctrine (skill godot-export-builds owns template install + export-failure debugging), and the
# shipped viewer.cfg rewrite reuses twin_build.sh's --wire idiom (ConfigFile-validate then
# line-rewrite, preserving comments — Godot's ConfigFile.save() drops them).
#
# Usage (from the project root or anywhere):
#   tools/twin_ship.sh --preset <name> [--model <path>] [--map <path>] [--sidecar <path>]
#                      [--recording <path>]... [--out dist/] [--zip] [--smoke|--no-smoke]
#
# Stages: 1 preflight · 2 export · 3 assemble · 4 smoke · 5 zip.
# Exit 0 = the artifact assembled (and, where runnable, the smoke passed): "twin-ship: OK".
set -u
# Resolve the script dir BEFORE cd, so sourcing is robust however the script was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1
PATH="$HOME/.local/bin:$PATH"

# Label the shared engine resolver's output as this gate's.
XENO_GATE="twin-ship"
# shellcheck source=lib/checks.sh
source "$SCRIPT_DIR/lib/checks.sh"

_stage() { printf '\n== %s [%s] %s ==\n' "$XENO_GATE" "$1" "$2"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}

_usage() {
	cat <<'USAGE'
usage: tools/twin_ship.sh --preset <name> [options]
  --preset <name>       export_presets.cfg preset to build (REQUIRED; matched by its name=)
  --model <path>        model to ship (else: viewer.cfg [viewer] model= → newest models/*.glb)
  --sidecar <path>      property sidecar (else: the model's sibling <base>_props.json)
  --map <path>          binding map (else: viewer.cfg [twin] binding_map= → binding_map.json)
  --recording <path>    recording to bundle (repeatable; the first is the smoke's playback fixture)
  --out <dir>           output root (default: dist)
  --zip                 also produce a deterministic <name>-<platform>.zip of the assembled tree
  --smoke | --no-smoke  run/skip the exported-binary boot smoke (default: on iff preset == host)
USAGE
}

# --- argument parse ----------------------------------------------------------------------------
PRESET=""
MODEL=""
SIDECAR=""
MAP=""
RECORDINGS=()
OUT="dist"
WANT_ZIP=0
# SMOKE: -1 auto (on iff preset platform == host), 1 forced on, 0 forced off.
SMOKE=-1
while [ $# -gt 0 ]; do
	case "$1" in
	--preset)
		[ $# -ge 2 ] || _fail "--preset requires a value"
		PRESET="$2"
		shift 2
		;;
	--model)
		[ $# -ge 2 ] || _fail "--model requires a value"
		MODEL="$2"
		shift 2
		;;
	--sidecar)
		[ $# -ge 2 ] || _fail "--sidecar requires a value"
		SIDECAR="$2"
		shift 2
		;;
	--map)
		[ $# -ge 2 ] || _fail "--map requires a value"
		MAP="$2"
		shift 2
		;;
	--recording)
		[ $# -ge 2 ] || _fail "--recording requires a value"
		RECORDINGS+=("$2")
		shift 2
		;;
	--out)
		[ $# -ge 2 ] || _fail "--out requires a value"
		OUT="$2"
		shift 2
		;;
	--zip)
		WANT_ZIP=1
		shift
		;;
	--smoke)
		SMOKE=1
		shift
		;;
	--no-smoke)
		SMOKE=0
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
		_usage >&2
		_fail "unexpected argument '$1' (all inputs are flags; --preset is required)"
		;;
	esac
done
if [ -z "$PRESET" ]; then
	_usage >&2
	_fail "no --preset given"
fi

# Read one quoted INI value: _cfg_value <section> <key> <file>. Mirrors verify_twin.sh's awk reader
# (section by bracket line, value with surrounding quotes/space stripped). Empty output = absent.
_cfg_value() {
	awk -F= -v s="[$1]" -v k="$2" '
		/^[[:space:]]*\[/ { sect = $0; sub(/[ \t\r]*$/, "", sect); sub(/^[ \t]*/, "", sect) }
		sect == s && $1 ~ ("^[ \t]*" k "[ \t]*$") { gsub(/[ \t"\r]/, "", $2); v = $2 }
		END { if (v != "") print v }
	' "$3" 2>/dev/null
}

# --- stage 1: preflight ------------------------------------------------------------------------
_stage 1/5 "preflight"
[ -f project.godot ] || _fail "no project.godot in $(pwd) — run twin_ship.sh from a Godot project root"
xeno_resolve_engine || exit 1

PRESETS_CFG="export_presets.cfg"
[ -f "$PRESETS_CFG" ] || _fail "no $PRESETS_CFG — author one first (skill godot-export-builds: one preset per platform)"

# Preset lookup: parse the INI (preset names are quoted values, never grep them naively). Emit the
# matched preset's platform=; empty means the name is not present in any [preset.N] block.
PLATFORM="$(awk -F= -v want="$PRESET" '
	/^\[preset\.[0-9]+\][ \t\r]*$/ { cur = 1; nm = ""; pf = ""; next }
	/^\[/ { if (cur && nm != "") plat[nm] = pf; cur = 0; next }
	cur && $1 ~ /^[ \t]*name[ \t]*$/ { gsub(/[ \t"\r]/, "", $2); nm = $2 }
	cur && $1 ~ /^[ \t]*platform[ \t]*$/ { gsub(/[ \t"\r]/, "", $2); pf = $2 }
	END { if (cur && nm != "") plat[nm] = pf; print plat[want] }
' "$PRESETS_CFG")"
if [ -z "$PLATFORM" ]; then
	echo "$XENO_GATE: FAIL preflight — no preset named '$PRESET' in $PRESETS_CFG." >&2
	echo "  Preset names are the quoted name= values inside each [preset.N] block. Present names:" >&2
	awk -F= '/^\[preset\.[0-9]+\]/ { cur = 1; next } /^\[/ { cur = 0 } cur && $1 ~ /^[ \t]*name[ \t]*$/ { gsub(/[ \t"\r]/, "", $2); print "    " $2 }' "$PRESETS_CFG" >&2
	exit 1
fi

# Platform → dist token + host-runnability. The smoke can only run a binary of the HOST platform.
HOST_OS="$(uname -s)"
IS_MAC=0
HOST_MATCH=0
case "$PLATFORM" in
macOS)
	PLAT_TOKEN="macos"
	IS_MAC=1
	[ "$HOST_OS" = "Darwin" ] && HOST_MATCH=1
	;;
"Linux/X11" | Linux)
	PLAT_TOKEN="linux"
	[ "$HOST_OS" = "Linux" ] && HOST_MATCH=1
	;;
"Windows Desktop")
	PLAT_TOKEN="windows"
	case "$HOST_OS" in MINGW* | MSYS* | CYGWIN*) HOST_MATCH=1 ;; esac
	;;
*)
	_fail "preset '$PRESET' has unsupported platform '$PLATFORM' (macOS / Linux/X11 / Windows Desktop)"
	;;
esac

# Export templates for the EXACT engine version (a host setup step, not a project bug — see the base
# skill). Version string "4.6.3.stable.official.<hash>" → template folder "4.6.3.stable".
ENGINE_VER_RAW="$("$GODOT" --version 2>/dev/null | head -1)"
TEMPLATE_VER="$(printf '%s\n' "$ENGINE_VER_RAW" | awk -F. '{ print $1"."$2"."$3"."$4 }')"
TEMPLATES_OK=0
for d in \
	"$HOME/Library/Application Support/Godot/export_templates" \
	"$HOME/.local/share/godot/export_templates" \
	"$HOME/.config/godot/export_templates"; do
	[ -d "$d/$TEMPLATE_VER" ] && TEMPLATES_OK=1
done
if [ "$TEMPLATES_OK" -ne 1 ]; then
	echo "$XENO_GATE: FAIL preflight — no export templates for $TEMPLATE_VER (engine '$ENGINE_VER_RAW')." >&2
	echo "  Headless export needs the ~700 MB templates for this EXACT version. Install once:" >&2
	echo "    Editor → Manage Export Templates → Download and Install (skill: godot-export-builds)." >&2
	exit 1
fi

# macOS templates ship ONLY ASTC-compressed texture variants; without import_etc2_astc the macOS
# export aborts ("Target platform requires 'ETC2/ASTC'"). Assert it — do NOT silently edit
# project.godot (the twin never rewrites user config behind their back); print the exact line.
if [ "$IS_MAC" -eq 1 ]; then
	if ! grep -qE '^textures/vram_compression/import_etc2_astc[[:space:]]*=[[:space:]]*true' project.godot; then
		echo "$XENO_GATE: FAIL preflight — macOS export needs ETC2/ASTC texture compression enabled." >&2
		echo "  Add this line under [rendering] in project.godot, then re-run (the macOS templates are" >&2
		echo "  ASTC-only; default-off imports none and the export aborts):" >&2
		echo "    textures/vram_compression/import_etc2_astc=true" >&2
		exit 1
	fi
fi

# Model discovery (flag → viewer.cfg [viewer] model= → newest models/*.glb, mirroring verify_twin.sh).
if [ -z "$MODEL" ]; then
	cfg_model="$(_cfg_value viewer model viewer.cfg)"
	if [ -n "$cfg_model" ]; then
		MODEL="${cfg_model#res://}"
	fi
fi
if [ -z "$MODEL" ]; then
	MODEL="$(find -L models x-shared-assets -name '*.glb' -type f -print0 2>/dev/null \
		| xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
fi
[ -n "$MODEL" ] || _fail "no model found (pass --model, set viewer.cfg [viewer] model=, or drop a .glb under models/)"
[ -f "$MODEL" ] || _fail "no such model: $MODEL"

# Sidecar discovery (flag → the model's sibling <base>_props.json / <base>.props.json).
MODEL_BASE="${MODEL%.*}"
if [ -z "$SIDECAR" ]; then
	for cand in "${MODEL_BASE}_props.json" "${MODEL_BASE}.props.json"; do
		[ -f "$cand" ] && SIDECAR="$cand" && break
	done
fi
if [ -n "$SIDECAR" ] && [ ! -f "$SIDECAR" ]; then
	_fail "no such sidecar: $SIDECAR"
fi

# Map discovery (flag → viewer.cfg [twin] binding_map= → binding_map.json, mirroring verify_twin.sh).
if [ -z "$MAP" ]; then
	MAP="$(_cfg_value twin binding_map viewer.cfg)"
	[ -n "$MAP" ] || MAP="binding_map.json"
fi
if [ -n "$MAP" ] && [ ! -f "$MAP" ]; then
	_fail "no such binding map: $MAP (pass --map or fix viewer.cfg [twin] binding_map=)"
fi

# Recordings are OPTIONAL. Each must exist if named.
for rec in "${RECORDINGS[@]:-}"; do
	[ -z "$rec" ] && continue
	[ -f "$rec" ] || _fail "no such recording: $rec"
done

# The ship name (dist/<name>-<platform>/) is the model's stem — the twin's identity.
NAME="$(basename "$MODEL")"
NAME="${NAME%.*}"

echo "$XENO_GATE: PASS preflight (preset '$PRESET' → $PLATFORM, templates $TEMPLATE_VER, model $MODEL)"

# --- stage 2: export ---------------------------------------------------------------------------
_stage 2/5 "export (--export-release '$PRESET')"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
case "$PLAT_TOKEN" in
macos) EXPORT_OUT="$WORK/$NAME.app" ;;
linux) EXPORT_OUT="$WORK/$NAME.x86_64" ;;
windows) EXPORT_OUT="$WORK/$NAME.exe" ;;
esac
# Exit codes lie (a Godot habit) — assert on the OUTPUT: capture the log, fail on any ERROR line,
# and confirm the real EXECUTABLE exists non-trivially (a macOS export can leave a half-built .app
# bundle behind when a template binary is missing, so `-e "$EXPORT_OUT"` alone is not enough).
EXPORT_LOG="$("$GODOT" --headless --path . --export-release "$PRESET" "$EXPORT_OUT" 2>&1)"
echo "$EXPORT_LOG" | grep -vE "$XENO_BENIGN"
case "$PLAT_TOKEN" in
macos) EXPORT_BIN="$(find "$EXPORT_OUT/Contents/MacOS" -type f 2>/dev/null | head -1)" ;;
*) EXPORT_BIN="$EXPORT_OUT" ;;
esac
if echo "$EXPORT_LOG" | grep -qE '^ERROR:|export.*failed|template binary .* not found'; then
	echo "$XENO_GATE: FAIL export — the engine reported an export error (see ERROR lines above)." >&2
	echo "  Debug export failures with the base doctrine (skill: godot-export-builds) — template" >&2
	echo "  mismatch (e.g. an architecture= with no matching template binary), a preset" >&2
	echo "  platform-string typo, or a scene that fails verify all land here." >&2
	exit 1
fi
if [ -z "$EXPORT_BIN" ] || [ ! -s "$EXPORT_BIN" ]; then
	echo "$XENO_GATE: FAIL export — no non-empty executable produced (exit codes lie; output missing)." >&2
	echo "  Expected the binary at $EXPORT_OUT. Debug with skill: godot-export-builds." >&2
	exit 1
fi
# The runnable binary's NAME: macOS names the in-bundle executable after project.godot
# application/config/name (NOT the .app basename), so discover it; Linux/Windows we named it above.
case "$PLAT_TOKEN" in
macos) BIN_NAME="$(basename "$EXPORT_BIN")" ;;
linux) BIN_NAME="$NAME.x86_64" ;;
windows) BIN_NAME="$NAME.exe" ;;
esac
echo "$XENO_GATE: PASS export ($EXPORT_OUT)"

# --- stage 3: assemble -------------------------------------------------------------------------
_stage 3/5 "assemble (dist/$NAME-$PLAT_TOKEN)"
DIST_DIR="$OUT/$NAME-$PLAT_TOKEN"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# EXEC_DIR is where the executable lives — viewer.cfg AND data/ sit BESIDE it, because the export-safe
# viewer roots viewer.cfg (data_bus.config_path) and bare data paths (_rooted_path) against
# OS.get_executable_path().get_base_dir(). macOS bundles put the binary at .app/Contents/MacOS/, so
# on mac the staged config + data live INSIDE the bundle there (the layout contract, phase-1 proof).
case "$PLAT_TOKEN" in
macos)
	cp -R "$EXPORT_OUT" "$DIST_DIR/"
	EXEC_DIR="$DIST_DIR/$NAME.app/Contents/MacOS"
	;;
linux | windows)
	cp "$EXPORT_OUT" "$DIST_DIR/"
	# Windows ships a sibling .pck unless embedded — carry it if the export produced one.
	[ -f "${EXPORT_OUT%.exe}.pck" ] && cp "${EXPORT_OUT%.exe}.pck" "$DIST_DIR/"
	EXEC_DIR="$DIST_DIR"
	;;
esac

DATA_DIR="$EXEC_DIR/data"
mkdir -p "$DATA_DIR/recordings"
cp "$MODEL" "$DATA_DIR/"
MODEL_SHIP="data/$(basename "$MODEL")"
[ -n "$SIDECAR" ] && cp "$SIDECAR" "$DATA_DIR/"
cp "$MAP" "$DATA_DIR/"
MAP_SHIP="data/$(basename "$MAP")"
REC_SHIP=""
for rec in "${RECORDINGS[@]:-}"; do
	[ -z "$rec" ] && continue
	cp "$rec" "$DATA_DIR/recordings/"
	[ -z "$REC_SHIP" ] && REC_SHIP="data/recordings/$(basename "$rec")"
done

# Shipped viewer.cfg: copy the project's, then rewrite model=/binding_map=/recording= to their
# data/-relative paths (bare relative → the exported viewer roots them against the executable dir).
# ConfigFile-validate then line-rewrite, preserving comments — the twin_build.sh --wire idiom,
# generalized here to several [section] key=value rewrites. url= is left untouched (a site edits it).
SHIP_CFG="$EXEC_DIR/viewer.cfg"
if [ -f viewer.cfg ]; then
	cp viewer.cfg "$SHIP_CFG"
else
	printf '[viewer]\nurl="ws://localhost:8765"\n' >"$SHIP_CFG"
fi
CFG_GD="$WORK/twin_ship_cfg.gd"
cat >"$CFG_GD" <<'CFG_EOF'
extends SceneTree
## twin_ship.sh assemble helper: rewrite the shipped viewer.cfg's model=/binding_map=/recording=
## to their data/-relative paths, preserving comments and every other key. ConfigFile.save() drops
## comments, so we validate the file parses as Godot INI (ConfigFile.load) then line-rewrite. This
## is the twin_build.sh --wire idiom generalized to several [section] key=value rewrites. `out` is a
## plain Array (reference-passed, so _flush's appends are seen by the caller — a PackedStringArray
## is a copy-on-write value type and would not be); every pending[section] read is cast to a typed
## Dictionary local before any method call, so nothing lands on an inferred Variant (the viewer
## project escalates unsafe_method_access to an error).


func _init() -> void:
	quit(_run())


func _run() -> int:
	var cfg := ""
	var sets: Array = []  # each entry: [section, key, value]
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--cfg="):
			cfg = a.substr("--cfg=".length())
		elif a.begins_with("--set="):
			var spec := a.substr("--set=".length())
			var parts := spec.split("|")
			if parts.size() != 3:
				push_error("SHIP-CFG: FAIL — bad --set '%s' (want section|key|value)" % spec)
				return 1
			sets.append([parts[0], parts[1], parts[2]])
	if cfg == "" or sets.is_empty():
		push_error("SHIP-CFG: FAIL — --cfg= and at least one --set= are required")
		return 1
	if not FileAccess.file_exists(cfg):
		push_error("SHIP-CFG: FAIL — no such cfg %s" % cfg)
		return 1
	var probe := ConfigFile.new()
	var perr := probe.load(cfg)
	if perr != OK:
		push_error("SHIP-CFG: FAIL — %s is not valid Godot INI (err %d)" % [cfg, perr])
		return 1
	var pending := {}  # section -> { key -> value }, consumed as written
	for s: Array in sets:
		var sect: String = s[0]
		var key: String = s[1]
		var value: String = s[2]
		var inner: Dictionary = pending.get(sect, {})
		inner[key] = value
		pending[sect] = inner
	var lines := FileAccess.get_file_as_string(cfg).split("\n")
	var out: Array = []
	var cur := ""
	for line in lines:
		var t := line.strip_edges()
		if t.begins_with("[") and t.ends_with("]"):
			_flush(out, pending, cur)
			cur = t.substr(1, t.length() - 2)
			out.append(line)
			continue
		if pending.has(cur):
			var inner: Dictionary = pending[cur]
			var key := t.split("=")[0].strip_edges()
			if inner.has(key):
				out.append('%s="%s"' % [key, inner[key]])
				inner.erase(key)
				continue
		out.append(line)
	_flush(out, pending, cur)
	for sect: String in pending:
		var inner: Dictionary = pending[sect]
		if inner.is_empty():
			continue
		if out.size() > 0 and str(out[out.size() - 1]).strip_edges() != "":
			out.append("")
		out.append("[%s]" % sect)
		for key: String in inner:
			out.append('%s="%s"' % [key, inner[key]])
	var fa := FileAccess.open(cfg, FileAccess.WRITE)
	if fa == null:
		push_error("SHIP-CFG: FAIL — cannot write %s" % cfg)
		return 1
	fa.store_string("\n".join(PackedStringArray(out)))
	fa.close()
	print("SHIP-CFG: OK — %s (%d key(s))" % [cfg, sets.size()])
	return 0


## Append any not-yet-written pending keys for `sect` to `out` (the section is about to close), then
## empty that section so the trailing "never appeared" pass skips it. `out` is an Array on purpose
## (reference semantics — see _run's header note).
func _flush(out: Array, pending: Dictionary, sect: String) -> void:
	if sect == "" or not pending.has(sect):
		return
	var inner: Dictionary = pending[sect]
	for key: String in inner.keys():
		out.append('%s="%s"' % [key, inner[key]])
	inner.clear()
CFG_EOF
CFG_SETS=("--set=viewer|model|$MODEL_SHIP" "--set=twin|binding_map|$MAP_SHIP")
[ -n "$REC_SHIP" ] && CFG_SETS+=("--set=twin|recording|$REC_SHIP")
if ! "$GODOT" --headless --path . --script "$CFG_GD" -- "--cfg=$SHIP_CFG" "${CFG_SETS[@]}"; then
	_fail "failed to rewrite shipped viewer.cfg ($SHIP_CFG)"
fi

# README.txt — how to run (with the honest unsigned-build warning), and what to edit.
README="$DIST_DIR/README.txt"
{
	echo "$NAME — twin viewer ($PLATFORM build)"
	echo "==================================================="
	echo
	echo "This is a self-contained twin viewer: the build plus its data (model, binding"
	echo "map, sidecar, recordings) staged beside the executable. The viewer reads its"
	echo "data at runtime — you can retarget it WITHOUT re-exporting (see 'To edit')."
	echo
	echo "To run:"
	case "$PLAT_TOKEN" in
	macos)
		echo "  Double-click $NAME.app, or from a terminal:"
		echo "    open $NAME.app          # windowed"
		# The in-bundle executable is named by project.godot application/config/name (NOT the
		# .app basename) and may contain spaces — single-quote the whole path so a stranger can
		# paste it verbatim. BIN_NAME was discovered in the export stage.
		echo "    './$NAME.app/Contents/MacOS/$BIN_NAME'   # run the binary directly"
		echo
		echo "  UNSIGNED BUILD — Gatekeeper will warn on first open ('cannot be opened"
		echo "  because the developer cannot be verified' / 'damaged'). This build is not"
		echo "  code-signed or notarized (out of scope). To open it anyway, either:"
		echo "    - right-click the .app → Open → Open (confirms once), or"
		echo "    - xattr -dr com.apple.quarantine $NAME.app"
		;;
	linux)
		echo "    ./$NAME.x86_64"
		echo
		echo "  If it is not executable: chmod +x $NAME.x86_64"
		;;
	windows)
		echo "    $NAME.exe"
		echo
		echo "  UNSIGNED BUILD — SmartScreen may warn ('Windows protected your PC'):"
		echo "  More info → Run anyway. This build is not code-signed (out of scope)."
		;;
	esac
	echo
	echo "To edit (no re-export needed) — open viewer.cfg beside the executable:"
	case "$PLAT_TOKEN" in
	macos) echo "  $NAME.app/Contents/MacOS/viewer.cfg" ;;
	*) echo "  viewer.cfg" ;;
	esac
	echo "  [viewer] url=    point at THIS site's live tag source (ws://host:port)"
	echo "  [viewer] model=  the model to show (a path under data/, e.g. $MODEL_SHIP)"
	echo
	echo "Data lives in data/ beside the executable:"
	echo "  $MODEL_SHIP        the model (GLB or optimized .tscn)"
	[ -n "$SIDECAR" ] && echo "  data/$(basename "$SIDECAR")   property sidecar (review data)"
	echo "  $MAP_SHIP   tag → GlobalId binding map"
	[ -n "$REC_SHIP" ] && echo "  $REC_SHIP   bundled recording (playback)"
} >"$README"

echo "$XENO_GATE: PASS assemble ($DIST_DIR)"
echo "  layout:"
( cd "$OUT" && find "$NAME-$PLAT_TOKEN" -type f | LC_ALL=C sort | sed 's/^/    /' )

# --- stage 4: smoke ----------------------------------------------------------------------------
_stage 4/5 "smoke"
# Default: on iff the preset platform matches the host (you cannot run a Linux ELF / Windows PE on
# macOS). --smoke forces it (and would fail on a non-host binary — that is the caller's choice);
# --no-smoke skips. A cross-platform SKIP is LOUD and never a pass.
RUN_SMOKE=0
if [ "$SMOKE" -eq 1 ]; then
	RUN_SMOKE=1
elif [ "$SMOKE" -eq -1 ] && [ "$HOST_MATCH" -eq 1 ]; then
	RUN_SMOKE=1
fi
SMOKE_FRAMES=20
if [ "$RUN_SMOKE" -ne 1 ]; then
	if [ "$SMOKE" -eq 0 ]; then
		echo "$XENO_GATE: SKIP smoke — --no-smoke requested (a SKIP is not a pass)."
	else
		echo "$XENO_GATE: SKIP smoke — $PLATFORM build cannot run on this $HOST_OS host (a SKIP is"
		echo "  NOT a pass). Boot it on a $PLATFORM machine, or re-run there. To force anyway: --smoke."
	fi
else
	SMOKE_BIN="$EXEC_DIR/$BIN_NAME"
	[ -x "$SMOKE_BIN" ] || _fail "smoke — exported binary not found/executable: $SMOKE_BIN"
	SMOKE_ARGS=(--headless -- "--quit-after=$SMOKE_FRAMES")
	[ -n "$REC_SHIP" ] && SMOKE_ARGS+=("--recording=$REC_SHIP")
	echo "  running: $(basename "$SMOKE_BIN") ${SMOKE_ARGS[*]}"
	SMOKE_LOG="$("$SMOKE_BIN" "${SMOKE_ARGS[@]}" 2>&1)"
	echo "$SMOKE_LOG" | grep -E "^viewer:|SCRIPT ERROR|^ERROR" | sed 's/^/    /'
	SMOKE_FAIL=0
	_assert() {
		if echo "$SMOKE_LOG" | grep -qE "$1"; then
			echo "  assert OK  — $2"
		else
			echo "$XENO_GATE: assert MISS — $2 (pattern: $1)" >&2
			SMOKE_FAIL=1
		fi
	}
	_assert "^viewer: model loaded from data/" "model loaded from data/"
	_assert "^viewer: bindings resolved [0-9]+/[0-9]+" "bindings resolved (count present)"
	if [ -n "$REC_SHIP" ]; then
		_assert "^viewer: playback of " "recording playback started"
	else
		echo "  note       — no recording bundled; playback assertion N/A (a note, not a pass)"
	fi
	_assert "^viewer: quit-after $SMOKE_FRAMES frames reached" "quit-after $SMOKE_FRAMES frames reached"
	if [ "$SMOKE_FAIL" -ne 0 ]; then
		echo "$XENO_GATE: FAIL smoke — the exported artifact did not boot to the expected log." >&2
		exit 1
	fi
	echo "$XENO_GATE: PASS smoke ($(basename "$SMOKE_BIN") booted from data/ beside the build)"
fi

# --- stage 5: zip ------------------------------------------------------------------------------
_stage 5/5 "zip"
if [ "$WANT_ZIP" -ne 1 ]; then
	echo "$XENO_GATE: SKIP zip — --zip not requested (the assembled dir is the artifact)."
else
	ZIP_PATH="$OUT/$NAME-$PLAT_TOKEN.zip"
	rm -f "$ZIP_PATH"
	# Deterministic: a FIXED input order (find | LC_ALL=C sort) plus `zip -X` (drop the platform
	# extra-field: uid/gid + hi-res mtimes). Over an unchanged tree the standard 2-second DOS
	# timestamps are identical, so re-zipping the same tree yields a byte-identical archive.
	( cd "$OUT" && find "$NAME-$PLAT_TOKEN" -type f | LC_ALL=C sort | zip -X -q "$NAME-$PLAT_TOKEN.zip" -@ )
	[ -f "$ZIP_PATH" ] || _fail "zip — no archive produced at $ZIP_PATH"
	ZIP_SIZE="$(du -h "$ZIP_PATH" | cut -f1 | tr -d ' ')"
	echo "$XENO_GATE: PASS zip ($ZIP_PATH, $ZIP_SIZE — deterministic: find|sort order + zip -X)"
fi

echo
echo "$XENO_GATE: OK"
echo "  artifact: $DIST_DIR"
if [ "$WANT_ZIP" -eq 1 ]; then
	echo "  zip:      $OUT/$NAME-$PLAT_TOKEN.zip"
fi
exit 0
