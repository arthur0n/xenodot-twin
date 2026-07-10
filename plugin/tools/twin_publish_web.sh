#!/bin/bash
# tools/twin_publish_web.sh — export the no-threads Web (WASM) build, wire it for AUTOPLAY
# playback, and publish it into a static demos repo (skill: twin-ship → web boundary note).
#
# The web counterpart of twin_ship.sh. twin_ship packages a DESKTOP build with its data staged
# BESIDE the executable (OS.get_executable_path filesystem); a Web build has no executable-adjacent
# filesystem, so its data rides INSIDE the pck as res:// resources (measured + confirmed: the viewer
# reads res://viewer.cfg on web — data_bus.config_path() falls back to the packed copy — and
# _rooted_path passes res:// through). This tool therefore bakes the model + binding map + recording
# into the pck via a res://-wired viewer.cfg, exports the no-threads variant (the embed-anywhere /
# GitHub-Pages-compatible build — needs NO cross-origin-isolation headers), stages the export into
# <demos-repo>/<name>/, and regenerates the demos-repo root index.html.
#
# Same discipline as twin_ship.sh / twin_build.sh / verify_twin.sh: loud stage labels, exit nonzero
# on the FIRST failure, and a SKIP is never a pass (the --movie hero capture SKIPs loudly when not
# requested; the browser run itself is unverified in a shell — the wiring smoke boots the dev
# checkout, whose res:// resolution is IDENTICAL to the web pck, as the honest proxy).
#
# Usage (from the project root or anywhere):
#   tools/twin_publish_web.sh --demos-repo <dir> --name <demo> [--model <path>] [--map <path>]
#                             [--recording <path>] [--preset <name>] [--embed-base <url>] [--movie]
#                             [--movie-seconds <N>] [--movie-fps <N>]
#
# Stages: 1 preflight · 2 wire · 3 export · 4 smoke · 5 stage (+ embed.html) · 6 index · 7 movie.
# Exit 0 = the demo published into <demos-repo>/<name>/ (and the root index regenerated).
#
# EMBED SNIPPET. Beside every staged demo the tool writes an `embed.html` — a ready-to-paste
# Grafana text/HTML-panel <iframe> pointing at the demo's hosted URL, so an operator embeds the twin
# as a live 3D panel (the OpenTwins pattern) without hand-authoring the iframe. The hosted base is
# --embed-base, else inferred from the demos repo's `origin` remote (github.com/<u>/<r> →
# https://<u>.github.io/<r>). Regenerate the snippet for an already-published demo without a rebuild:
#   tools/twin_publish_web.sh --emit-embed-only --demos-repo <dir> --name <demo> [--embed-base <url>]
# The no-threads build embeds in Grafana with NO cross-origin-isolation headers (a threads build needs
# SharedArrayBuffer/COEP and is dead on arrival there); local-serve reference: tools/web/serve_coi.py.
# Measured: the no-threads build boots live-bound at 120 fps in a real Grafana panel
# (plugin/library/findings/twin-web-ceiling-2026-07-10.md, Chrome 150, one machine).
set -u
# Resolve the script dir BEFORE cd, so sourcing is robust however the script was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1
PATH="$HOME/.local/bin:$PATH"

# Label the shared engine resolver's output as this gate's.
XENO_GATE="twin-publish-web"
# shellcheck source=lib/checks.sh
source "$SCRIPT_DIR/lib/checks.sh"

_stage() { printf '\n== %s [%s] %s ==\n' "$XENO_GATE" "$1" "$2"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}

_usage() {
	cat <<'USAGE'
usage: tools/twin_publish_web.sh --demos-repo <dir> --name <demo> [options]
  --demos-repo <dir>    the static demos repo to publish into (REQUIRED; a git working tree)
  --name <demo>         the demo folder under <demos-repo>/ (REQUIRED; no slashes)
  --model <path>        model to bake (else: viewer.cfg [viewer] model= → newest models/*_opt.tscn/*.glb)
  --map <path>          binding map (else: viewer.cfg [twin] binding_map= → binding_map.json)
  --recording <path>    recording to AUTOPLAY (else: viewer.cfg [twin] recording= → newest recordings/*.ndjson)
  --preset <name>       export_presets.cfg preset (default: Web-nothreads; generated from the
                        annotated example when export_presets.cfg is absent)
  --embed-base <url>    hosted site root for the emitted embed.html iframe src (default: inferred
                        from the demos repo's origin remote → https://<user>.github.io/<repo>)
  --emit-embed-only     skip the build; (re)write only <demos-repo>/<name>/embed.html and exit
  --movie               also capture a windowed hero clip → <name>/hero.mp4 + hero.gif + poster.png
  --movie-seconds <N>   hero clip length in seconds (default: 6; needs --movie)
  --movie-fps <N>       hero capture fps (default: 60; needs --movie)
USAGE
}

# --- argument parse ----------------------------------------------------------------------------
DEMOS_REPO=""
NAME=""
MODEL=""
MAP=""
RECORDING=""
PRESET="Web-nothreads"
EMBED_BASE=""
EMIT_EMBED_ONLY=0
WANT_MOVIE=0
MOVIE_SECONDS=6
MOVIE_FPS=60
while [ $# -gt 0 ]; do
	case "$1" in
	--embed-base)
		[ $# -ge 2 ] || _fail "--embed-base requires a value"
		EMBED_BASE="$2"
		shift 2
		;;
	--emit-embed-only)
		EMIT_EMBED_ONLY=1
		shift
		;;
	--demos-repo)
		[ $# -ge 2 ] || _fail "--demos-repo requires a value"
		DEMOS_REPO="$2"
		shift 2
		;;
	--name)
		[ $# -ge 2 ] || _fail "--name requires a value"
		NAME="$2"
		shift 2
		;;
	--model)
		[ $# -ge 2 ] || _fail "--model requires a value"
		MODEL="$2"
		shift 2
		;;
	--map)
		[ $# -ge 2 ] || _fail "--map requires a value"
		MAP="$2"
		shift 2
		;;
	--recording)
		[ $# -ge 2 ] || _fail "--recording requires a value"
		RECORDING="$2"
		shift 2
		;;
	--preset)
		[ $# -ge 2 ] || _fail "--preset requires a value"
		PRESET="$2"
		shift 2
		;;
	--movie)
		WANT_MOVIE=1
		shift
		;;
	--movie-seconds)
		[ $# -ge 2 ] || _fail "--movie-seconds requires a value"
		MOVIE_SECONDS="$2"
		shift 2
		;;
	--movie-fps)
		[ $# -ge 2 ] || _fail "--movie-fps requires a value"
		MOVIE_FPS="$2"
		shift 2
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
		_fail "unexpected argument '$1' (all inputs are flags; --demos-repo and --name are required)"
		;;
	esac
done
[ -n "$DEMOS_REPO" ] || {
	_usage >&2
	_fail "no --demos-repo given"
}
[ -n "$NAME" ] || {
	_usage >&2
	_fail "no --name given"
}
case "$NAME" in
*/* | .* | "") _fail "invalid --name '$NAME' (a single folder name, no slashes)" ;;
esac

# Read one quoted INI value: _cfg_value <section> <key> <file>. Mirrors twin_ship.sh's awk reader
# (section by bracket line, value with surrounding quotes/space stripped). Empty output = absent.
_cfg_value() {
	awk -F= -v s="[$1]" -v k="$2" '
		/^[[:space:]]*\[/ { sect = $0; sub(/[ \t\r]*$/, "", sect); sub(/^[ \t]*/, "", sect) }
		sect == s && $1 ~ ("^[ \t]*" k "[ \t]*$") { gsub(/[ \t"\r]/, "", $2); v = $2 }
		END { if (v != "") print v }
	' "$3" 2>/dev/null
}

# res://-normalize a discovered/flagged path: strip a leading ./ and res:// so we can re-prefix it
# cleanly. The web build reads everything from the pck, so every baked path is res://-rooted.
_as_res() {
	local p="$1"
	p="${p#res://}"
	p="${p#./}"
	printf 'res://%s' "$p"
}

# The absolute URL the emitted embed.html iframe points at. --embed-base ($EMBED_BASE) wins; else
# infer the GitHub Pages origin from the demos repo's `origin` remote (github.com/<user>/<repo> →
# https://<user>.github.io/<repo>, handling both https and git@ scp-like remotes and a .git suffix);
# else a clearly-marked placeholder the operator fills in. Prints "<base>/<name>/index.html".
_derive_embed_src() {
	local base="$EMBED_BASE" remote repo user
	if [ -z "$base" ]; then
		remote="$(git -C "$DEMOS_REPO" remote get-url origin 2>/dev/null || true)"
		case "$remote" in
		*github.com*)
			remote="${remote%.git}"
			repo="${remote##*/}"
			user="${remote%/*}"
			user="${user##*[:/]}"
			[ -n "$user" ] && [ -n "$repo" ] && base="https://$user.github.io/$repo"
			;;
		esac
	fi
	[ -n "$base" ] || base="https://YOUR-HOST"
	printf '%s/%s/index.html' "${base%/}" "$NAME"
}

# Write <demos-repo>/<name>/embed.html — a ready-to-paste Grafana text/HTML-panel <iframe>. Used both
# by stage 5 (after staging) and by the --emit-embed-only fast path (regenerate without a rebuild).
_emit_embed() {
	local dest="$DEMOS_REPO/$NAME" src
	[ -d "$dest" ] || _fail "no staged demo at $dest to emit an embed for (publish it first, or drop --emit-embed-only)"
	src="$(_derive_embed_src)"
	cat >"$dest/embed.html" <<EMBED_EOF
<!-- xenodot-twin — Grafana embed snippet for the "$NAME" demo (generated by twin_publish_web.sh).
     Paste the <iframe> below into a Grafana **Text** panel set to HTML mode. Grafana must run with
     GF_PANELS_DISABLE_SANITIZE_HTML=true or it strips the iframe on render. This is the no-threads
     web build: it embeds with NO cross-origin-isolation headers, so it works inside a Grafana iframe
     (whose parent document is not cross-origin isolated). A threads build needs SharedArrayBuffer /
     COEP and is dead on arrival in Grafana. Measured: no-threads boots live-bound at 120 fps in a
     real Grafana panel (plugin/library/findings/twin-web-ceiling-2026-07-10.md; Chrome 150, one
     machine — Safari unverified). To serve/preview locally with the right headers instead of the
     hosted URL: python3 tools/web/serve_coi.py --dir <this demo dir> --port 8070 . Opening this
     embed.html directly in a browser previews exactly what the Grafana panel will show. -->
<iframe src="$src" width="1000" height="640" style="border:0" title="$NAME digital twin"></iframe>
EMBED_EOF
	echo "$XENO_GATE: PASS embed ($dest/embed.html — iframe src=$src)"
}

# --emit-embed-only: skip the whole build, (re)write just the embed snippet, exit. No Godot project,
# no export — resolve the demos repo to an absolute path (as preflight would) and emit.
if [ "$EMIT_EMBED_ONLY" -eq 1 ]; then
	[ -d "$DEMOS_REPO" ] || _fail "no such demos repo directory: $DEMOS_REPO"
	DEMOS_REPO="$(cd "$DEMOS_REPO" && pwd)"
	_emit_embed
	echo "$XENO_GATE: OK (embed-only) — $DEMOS_REPO/$NAME/embed.html"
	exit 0
fi

# --- stage 1: preflight ------------------------------------------------------------------------
_stage 1/7 "preflight"
[ -f project.godot ] || _fail "no project.godot in $(pwd) — run twin_publish_web.sh from a Godot project root"
xeno_resolve_engine || exit 1

# The demos repo must exist and be a working tree we can stage into (a git repo, so a publish is a
# reviewable commit). A non-git dir is allowed but flagged — the whole point is a committable repo.
[ -d "$DEMOS_REPO" ] || _fail "no such demos repo directory: $DEMOS_REPO"
DEMOS_REPO="$(cd "$DEMOS_REPO" && pwd)"
if [ ! -d "$DEMOS_REPO/.git" ]; then
	echo "$XENO_GATE: preflight — note: $DEMOS_REPO is not a git working tree (publishing anyway;"
	echo "  the demos repo is meant to be committed + pushed for GitHub Pages)."
fi

# Web export templates for the EXACT engine version (a host setup step — skill godot-export-builds).
ENGINE_VER_RAW="$("$GODOT" --version 2>/dev/null | head -1)"
TEMPLATE_VER="$(printf '%s\n' "$ENGINE_VER_RAW" | awk -F. '{ print $1"."$2"."$3"."$4 }')"
TEMPLATES_OK=0
for d in \
	"$HOME/Library/Application Support/Godot/export_templates" \
	"$HOME/.local/share/godot/export_templates" \
	"$HOME/.config/godot/export_templates"; do
	[ -f "$d/$TEMPLATE_VER/web_nothreads_release.zip" ] && TEMPLATES_OK=1
done
if [ "$TEMPLATES_OK" -ne 1 ]; then
	echo "$XENO_GATE: FAIL preflight — no Web export template (web_nothreads_release.zip) for $TEMPLATE_VER." >&2
	echo "  Install the ~700 MB templates for this EXACT engine version once (skill godot-export-builds):" >&2
	echo "    Editor → Manage Export Templates → Download and Install." >&2
	exit 1
fi

# ffmpeg is only required when --movie is asked for (a SKIP-never-pass: a requested capture must not
# silently drop). Without --movie it is irrelevant.
if [ "$WANT_MOVIE" -eq 1 ] && ! command -v ffmpeg >/dev/null 2>&1; then
	_fail "--movie requested but ffmpeg is not on PATH (brew install ffmpeg) — a requested capture cannot be faked"
fi

# The export preset: use export_presets.cfg's named preset if present; else GENERATE the no-threads
# preset. Never CLOBBER an existing export_presets.cfg that lacks the preset (the twin never rewrites
# user export config behind their back) — FAIL loud. An existing preset is used VERBATIM, so a seat
# that defines its own exclude_filter is honored as-is (this default only applies to the generated one).
# The generated preset mirrors the canonical annotated example
# (plugin/examples/export_presets.web-nothreads.cfg) — thread_support=false (the embed-anywhere /
# no-COI-headers build) — but sets include_filter so the RAW, FileAccess-read files (viewer.cfg CONFIG,
# binding map JSON, recording NDJSON — none of them imported resources) bake into the pck. viewer.cfg
# is the load-bearing one: the web viewer reads res://viewer.cfg for model=/recording=/url=, and a
# plain .cfg is neither a resource (export_filter skips it) nor json/ndjson, so WITHOUT *viewer.cfg the
# config is dropped entirely → the viewer boots with no model (0 nodes → every binding resolves 0/N),
# no recording (no playback), and the DEFAULT url (ws:// spam). The raw json/ndjson likewise ride in
# via their globs. It is embedded here (not read from examples/) so the tool is self-contained when
# materialized into a project, where examples/ is not present.
#
# exclude_filter is the counterweight to export_filter=all_resources, which otherwise sweeps EVERY
# imported resource in the tree into the pck — including a seat's spike/debug SCREENSHOTS. A tiny
# source PNG imports into a multi-megabyte VRAM texture (mipmaps + compression), so a handful of
# evidence captures under spikes/ ballooned one bim pck from ~35 MB to ~71 MB. We exclude, by
# DIRECTORY (Godot's `*` spans `/`, so `spikes/*` is recursive — same convention as the seat's own
# desktop preset), the dev-only trees a web demo never renders: spike evidence, build reports, the
# desktop ship output, the framework tooling, and any top-level evidence dir. This is deliberately
# CONSERVATIVE — it does NOT exclude *.png globally (a model's own external textures are PNGs), only
# the known non-runtime directories — so it leaves a duplex/plant seat's scene, models/data and viewer
# core untouched while dropping the debris.
GENERATED_PRESET=0
if [ -f export_presets.cfg ]; then
	if ! awk -F= -v want="$PRESET" '
		/^\[preset\.[0-9]+\]/ { c=1; n=""; next } /^\[/ { c=0 }
		c && $1 ~ /^[ \t]*name[ \t]*$/ { gsub(/[ \t"\r]/,"",$2); n=$2; if (n==want) { print "yes"; exit } }
	' export_presets.cfg | grep -q yes; then
		echo "$XENO_GATE: FAIL preflight — export_presets.cfg exists but has no preset named '$PRESET'." >&2
		echo "  Add the annotated no-threads Web preset (do not let this tool clobber your presets):" >&2
		echo "    cp <framework>/plugin/examples/export_presets.web-nothreads.cfg  # merge its [preset.N]" >&2
		exit 1
	fi
else
	if [ "$PRESET" != "Web-nothreads" ]; then
		_fail "no export_presets.cfg to generate a '$PRESET' preset (only the built-in 'Web-nothreads' is generatable)"
	fi
	cat >export_presets.cfg <<'PRESET_EOF'
[preset.0]

name="Web-nothreads"
platform="Web"
runnable=true
advanced_options=false
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter="*viewer.cfg,*.json,*.ndjson,*.glb"
exclude_filter="spikes/*,reports/*,dist/*,tools/*,evidence/*"
export_path="builds/web/index.html"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
seed=0
encrypt_pck=false
encrypt_directory=false
script_export_mode=2

[preset.0.options]

custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
PRESET_EOF
	GENERATED_PRESET=1
	echo "$XENO_GATE: preflight — generated export_presets.cfg (no-threads, include=*viewer.cfg,*.json,*.ndjson,*.glb; exclude=spikes/*,reports/*,dist/*,tools/*,evidence/*)"
fi

# Model discovery (flag → viewer.cfg [viewer] model= → newest models/*_opt.tscn, else newest *.glb).
if [ -z "$MODEL" ]; then
	cfg_model="$(_cfg_value viewer model viewer.cfg)"
	[ -n "$cfg_model" ] && MODEL="${cfg_model#res://}"
fi
if [ -z "$MODEL" ]; then
	MODEL="$(find -L models -name '*_opt.tscn' -type f -print0 2>/dev/null \
		| xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
fi
if [ -z "$MODEL" ]; then
	MODEL="$(find -L models -name '*.glb' -type f -print0 2>/dev/null \
		| xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
fi
[ -n "$MODEL" ] || _fail "no model found (pass --model, set viewer.cfg [viewer] model=, or build one with twin_build.sh)"
MODEL="${MODEL#res://}"
[ -f "$MODEL" ] || _fail "no such model: $MODEL"

# WEB-CORRECT MODEL. A web build has no exe-adjacent filesystem: every asset must live INSIDE the
# pck. A raw .glb/.gltf that Godot has IMPORTED (a sibling <model>.import exists) does NOT ride in the
# pck as raw bytes — the exporter packs only the IMPORTED .scn + a tiny remap stub, so a runtime
# GLTFDocument read (FileAccess.get_file_as_bytes) comes back EMPTY and the model never loads (0
# nodes → every binding resolves 0/N). That is exactly how a "smoke passed on desktop / blank on
# the web" divergence happens: a dev checkout reads the raw .glb off disk, the web pck cannot. So for
# an imported source glb we publish the OPTIMIZED SCENE RESOURCE (<stem>_opt.tscn from twin_build.sh)
# instead — a real Godot resource, always packed by export_filter=all_resources, loaded via
# load()/PackedScene, node names (the IFC GlobalIds) preserved. A NON-imported glb (no .import) is
# left as-is: include_filter bakes its raw bytes and the runtime GLTFDocument path works on web.
case "$MODEL" in
*.glb | *.gltf | *.GLB | *.GLTF)
	if [ -f "$MODEL.import" ]; then
		MODEL_OPT="${MODEL%.*}_opt.tscn"
		if [ -f "$MODEL_OPT" ]; then
			echo "$XENO_GATE: preflight — model '$MODEL' is an IMPORTED glb (won't ride in a web pck as raw bytes);"
			echo "  publishing the optimized scene resource '$MODEL_OPT' instead (packs + loads from the pck)."
			MODEL="$MODEL_OPT"
		else
			_fail "model '$MODEL' is an imported glb — its raw bytes can't be read from a web pck, and no
    optimized scene '$MODEL_OPT' exists to publish instead. Build one first (twin_build.sh) or pass
    --model <scene.tscn>. (A web demo bakes a packed SCENE resource, not a runtime-loaded raw glb.)"
		fi
	fi
	;;
esac

# Map discovery (flag → viewer.cfg [twin] binding_map= → binding_map.json).
if [ -z "$MAP" ]; then
	MAP="$(_cfg_value twin binding_map viewer.cfg)"
	MAP="${MAP#res://}"
	[ -n "$MAP" ] || MAP="binding_map.json"
fi
MAP="${MAP#res://}"
[ -f "$MAP" ] || _fail "no such binding map: $MAP (pass --map or fix viewer.cfg [twin] binding_map=)"

# Recording discovery (flag → viewer.cfg [twin] recording= → newest recordings/*.ndjson). A demo
# AUTOPLAYS a recording — with none, there is nothing to show, so this FAILs (not a neutral live
# viewer: a Pages demo has no sim to connect to). Generate one with tools/sim/record.js first.
if [ -z "$RECORDING" ]; then
	RECORDING="$(_cfg_value twin recording viewer.cfg)"
	RECORDING="${RECORDING#res://}"
fi
if [ -z "$RECORDING" ]; then
	RECORDING="$(find -L recordings -name '*.ndjson' -type f -print0 2>/dev/null \
		| xargs -0 stat -f '%m %N' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
fi
[ -n "$RECORDING" ] || _fail "no recording found — a web demo autoplays one. Make it first:
    node tools/sim/record.js --out recordings/<name>.ndjson --seconds 40 --seed 42 --map $MAP"
RECORDING="${RECORDING#res://}"
[ -f "$RECORDING" ] || _fail "no such recording: $RECORDING"

MODEL_RES="$(_as_res "$MODEL")"
MAP_RES="$(_as_res "$MAP")"
REC_RES="$(_as_res "$RECORDING")"
echo "$XENO_GATE: PASS preflight (preset '$PRESET', model $MODEL, map $MAP, recording $RECORDING)"

# --- stage 2: wire viewer.cfg (res:// paths → baked into the pck) ------------------------------
_stage 2/7 "wire (res:// model/map/recording → autoplay)"
# The web build reads res://viewer.cfg from the pck; rewrite its model=/binding_map=/recording= to
# res:// paths (baked-in), preserving comments — the twin_ship.sh assemble idiom (ConfigFile-validate
# then line-rewrite). recording= makes the viewer AUTOPLAY on boot (main.gd _start_playback → play()).
# url= is BLANKED to "" (the DataBus "live source OFF" contract, data_bus.gd _live_disabled): a Pages
# demo has no sim, so a non-empty url would spam ws:// ERR_CONNECTION_REFUSED forever. Empty = no
# connect, no retry; the recording drives every visual (playback also closes the socket as defence).
[ -f viewer.cfg ] && cp viewer.cfg viewer.cfg.bak || printf '[viewer]\nurl="ws://localhost:8765"\n' >viewer.cfg
WORK="$(mktemp -d)"
# Invoked via `trap _cleanup EXIT` below; shellcheck can't see the indirect call, so it flags the
# function as never-invoked (SC2329) and every body command as unreachable (SC2317). Both are the
# same false positive — the function-level directive covers the whole body. SC2317 is version-
# dependent: shellcheck 0.9.x (ubuntu-latest CI) emits it here, 0.11.0 (local) suppresses it itself.
# shellcheck disable=SC2329,SC2317 # invoked via trap — not unreachable
_cleanup() {
	# Always restore the project's viewer.cfg + generated presets, and drop the temp export dir.
	[ -f viewer.cfg.bak ] && mv -f viewer.cfg.bak viewer.cfg
	[ "$GENERATED_PRESET" -eq 1 ] && rm -f export_presets.cfg
	rm -rf "$WORK"
}
trap _cleanup EXIT
CFG_GD="$WORK/publish_cfg.gd"
cat >"$CFG_GD" <<'CFG_EOF'
extends SceneTree
## twin_publish_web.sh wire helper: rewrite the project viewer.cfg model=/binding_map=/recording= to
## res:// paths (baked into the web pck), preserving comments and every other key. ConfigFile.save()
## drops comments, so we validate the file parses as Godot INI (ConfigFile.load) then line-rewrite —
## the twin_ship.sh assemble idiom, verbatim (several [section] key=value rewrites).


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
				push_error("PUBLISH-CFG: FAIL — bad --set '%s' (want section|key|value)" % spec)
				return 1
			sets.append([parts[0], parts[1], parts[2]])
	if cfg == "" or sets.is_empty():
		push_error("PUBLISH-CFG: FAIL — --cfg= and at least one --set= are required")
		return 1
	if not FileAccess.file_exists(cfg):
		push_error("PUBLISH-CFG: FAIL — no such cfg %s" % cfg)
		return 1
	var probe := ConfigFile.new()
	var perr := probe.load(cfg)
	if perr != OK:
		push_error("PUBLISH-CFG: FAIL — %s is not valid Godot INI (err %d)" % [cfg, perr])
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
		push_error("PUBLISH-CFG: FAIL — cannot write %s" % cfg)
		return 1
	fa.store_string("\n".join(PackedStringArray(out)))
	fa.close()
	print("PUBLISH-CFG: OK — %s (%d key(s))" % [cfg, sets.size()])
	return 0


## Append any not-yet-written pending keys for `sect` to `out` (the section is about to close), then
## empty that section so the trailing "never appeared" pass skips it. `out` is an Array on purpose
## (reference semantics — _flush's appends must be seen by the caller).
func _flush(out: Array, pending: Dictionary, sect: String) -> void:
	if sect == "" or not pending.has(sect):
		return
	var inner: Dictionary = pending[sect]
	for key: String in inner.keys():
		out.append('%s="%s"' % [key, inner[key]])
	inner.clear()
CFG_EOF
CFG_SETS=(
	"--set=viewer|model|$MODEL_RES"
	"--set=viewer|url|"
	"--set=twin|binding_map|$MAP_RES"
	"--set=twin|recording|$REC_RES"
)
if ! "$GODOT" --headless --path . --script "$CFG_GD" -- "--cfg=$PWD/viewer.cfg" "${CFG_SETS[@]}"; then
	_fail "failed to wire viewer.cfg (model=$MODEL_RES map=$MAP_RES recording=$REC_RES)"
fi
echo "$XENO_GATE: PASS wire (viewer.cfg → model=$MODEL_RES, url=\"\" [live off], binding_map=$MAP_RES, recording=$REC_RES)"

# --- stage 3: export (Web no-threads) ----------------------------------------------------------
_stage 3/7 "export (--export-release '$PRESET' → no-threads WASM)"
mkdir -p "$WORK/web"
EXPORT_OUT="$WORK/web/index.html"
# Exit codes lie (a Godot habit) — assert on the OUTPUT: capture the log, filter benign noise, fail
# on any ERROR line, and confirm the three load-bearing artifacts exist non-trivially.
EXPORT_LOG="$("$GODOT" --headless --path . --export-release "$PRESET" "$EXPORT_OUT" 2>&1)"
echo "$EXPORT_LOG" | grep -vE "$XENO_BENIGN" | grep -E '^(ERROR|SCRIPT ERROR)|savepack|export' | tail -4
if echo "$EXPORT_LOG" | grep -vE "$XENO_BENIGN" | grep -qE '^ERROR:|export.*failed|template.* not found'; then
	echo "$XENO_GATE: FAIL export — the engine reported an export error (see ERROR lines above)." >&2
	echo "  Debug web export failures with the base doctrine (skill: godot-export-builds)." >&2
	exit 1
fi
WASM="$WORK/web/index.wasm"
PCK="$WORK/web/index.pck"
for f in "$EXPORT_OUT" "$WASM" "$PCK"; do
	[ -s "$f" ] || _fail "export produced no non-empty $(basename "$f") (exit codes lie; output missing)"
done
# GitHub Pages rejects any single file > 100 MB. The no-threads wasm measured ~37 MB — assert it
# stays under the ceiling so a publish can't silently produce an un-serveable build.
WASM_BYTES="$(stat -f '%z' "$WASM")"
WASM_MB=$((WASM_BYTES / 1048576))
if [ "$WASM_BYTES" -gt 104857600 ]; then
	_fail "index.wasm is ${WASM_MB} MB — over GitHub Pages' 100 MB/file limit. Optimize the build."
fi
echo "$XENO_GATE: PASS export (wasm ${WASM_MB} MB < 100 MB Pages limit, pck $(($(stat -f '%z' "$PCK") / 1024)) KB)"

# --- stage 4: smoke (web-wiring proxy: dev-checkout res:// boot) --------------------------------
_stage 4/7 "smoke (res:// wiring — dev boot, identical resolution to the web pck)"
# A wasm build cannot run in a shell, so the honest gate boots the DEV CHECKOUT headless with the
# same wired viewer.cfg: on both the editor-run and the web build, config_path() reads res://viewer.cfg
# and _rooted_path passes res:// through — so "model loaded / bindings resolved / playback started"
# here proves the baked pck will resolve the same. This RUNS (not a SKIP); a MISS fails the publish.
SMOKE_FRAMES=45
SMOKE_LOG="$("$GODOT" --headless --path . -- "--quit-after=$SMOKE_FRAMES" 2>&1)"
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
_assert "^viewer: model loaded from res://" "model baked + loaded from the pck (res://)"
_assert "^viewer: bindings resolved [1-9][0-9]*/[0-9]+" "bindings resolved (>0 — 0/N is a broken map)"
_assert "^viewer: playback of res://" "recording autoplays from the pck (res://)"
if [ "$SMOKE_FAIL" -ne 0 ]; then
	echo "$XENO_GATE: FAIL smoke — the wired viewer did not boot to the expected log (the web pck would fail too)." >&2
	exit 1
fi
echo "$XENO_GATE: PASS smoke (model + bindings + autoplay all resolve from res://)"

# The dev-checkout smoke reads viewer.cfg + the model OFF DISK — it CANNOT see a file that failed to
# ride into the pck (the exact gap that shipped a 0/N demo: viewer.cfg is not a resource, so without
# *viewer.cfg in include_filter the export silently dropped it; an imported raw .glb likewise never
# packs its bytes). So assert the invariants directly on the ACTUAL artifact that ships — the exported
# pck (grep -a: treat the binary pck as text). Each MISS is a hard fail (SKIP-never-pass).
echo "  pck invariants ($(basename "$PCK")):"
PCK_FAIL=0
_pck_assert() {
	if grep -aqF "$1" "$PCK"; then
		echo "    invariant OK  — $2"
	else
		echo "$XENO_GATE: invariant MISS — $2 (needle: $1)" >&2
		PCK_FAIL=1
	fi
}
# 1. The config itself is baked (the primary regression: no viewer.cfg → no model/recording/url).
_pck_assert "[viewer]" "viewer.cfg baked into the pck (config readable as res://viewer.cfg)"
# 2. Live source OFF: the baked url is blank, so a Pages demo cannot spam ws:// forever.
_pck_assert 'url=""' "live source OFF in the baked viewer.cfg (url=\"\" — no ws:// reconnect spam)"
# 3. The model artifact's bytes actually ride in the pck (not just a remap stub). A .glb must carry
#    its glTF magic (raw runtime-read bytes); a scene resource must appear by name (its packed .scn +
#    remap). This is what a runtime GLTFDocument read on an imported glb would FAIL — caught here.
case "$MODEL" in
*.glb | *.gltf | *.GLB | *.GLTF)
	_pck_assert "glTF" "model glb bytes baked (raw glTF present — runtime GLTFDocument can read it)"
	;;
*)
	_pck_assert "$(basename "$MODEL")" "model scene resource baked (packed + remapped into the pck)"
	;;
esac
# 4. The raw data files the viewer FileAccess-reads are present (map + recording).
_pck_assert "$(basename "$MAP")" "binding map baked (raw JSON in the pck)"
_pck_assert "$(basename "$RECORDING")" "recording baked (raw NDJSON in the pck — autoplay source)"
if [ "$PCK_FAIL" -ne 0 ]; then
	echo "$XENO_GATE: FAIL smoke — a load-bearing file did not ride into the exported pck (the web demo would boot blank)." >&2
	exit 1
fi
echo "$XENO_GATE: PASS smoke (dev-boot resolution + pck invariants: config, live-off, model, map, recording all baked)"

# --- stage 5: stage into the demos repo --------------------------------------------------------
_stage 5/7 "stage (<demos-repo>/$NAME/)"
DEST="$DEMOS_REPO/$NAME"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$WORK/web/." "$DEST/"
echo "$XENO_GATE: PASS stage ($DEST)"

# Emit the ready-to-paste Grafana embed snippet beside the build, so an operator drops the twin into
# a dashboard as a live 3D panel without hand-authoring the iframe (the harvested capability).
_emit_embed

echo "  files:"
(cd "$DEST" && find . -maxdepth 1 -type f | LC_ALL=C sort | sed 's|^\./|    |')

# Per-demo card copy for the gallery: "Title|blurb|honest-label" keyed by folder name, with a neutral
# fallback for demos this tool does not know. The plant label carries the framework's established
# "synthetic demonstration model" wording; duplex is honestly named as the real buildingSMART sample.
_demo_meta() {
	case "$1" in
	plant) printf '%s' 'Plant — tank farm & pump skid|A synthetic process-plant twin: tank levels, pump temperature and flow, motor RPM and valve position, each painted live from recorded telemetry.|Synthetic demonstration model' ;;
	duplex) printf '%s' 'Duplex — BIM building|A real IFC/BIM residential building (the buildingSMART Duplex_A sample): room temperatures, boiler, solar output and the entrance door, painted live from recorded telemetry.|Real BIM model · buildingSMART sample' ;;
	*) printf '%s|%s|%s' "$1" 'A data-bound digital twin replaying recorded telemetry in your browser.' 'Demonstration model' ;;
	esac
}

# Deterministic static generator: list every immediate subdir that holds an index.html, sorted, with
# its poster.png if one exists. Rebuilt whole each publish so the listing always matches the folders
# (a function so it can run AFTER --movie, when this demo's poster already exists to show on its card).
_regen_index() {
	local INDEX DEMO_DIRS d poster DEMO_COUNT meta title blurb label
	INDEX="$DEMOS_REPO/index.html"
	DEMO_DIRS="$(cd "$DEMOS_REPO" && find . -mindepth 2 -maxdepth 2 -name index.html -type f 2>/dev/null \
		| sed 's|^\./||; s|/index.html$||' | LC_ALL=C sort)"
	{
	cat <<'HTML_HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>xenodot-twin — live digital-twin demos</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --muted:#667; --card:#fff; --line:#0002; --badge:#0000000d; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8ea; --muted:#9aa; --card:#17181b; --line:#fff2; --badge:#ffffff12; } }
  * { box-sizing: border-box; }
  body { font: 16px/1.6 system-ui, -apple-system, sans-serif; color: var(--fg); max-width: 64rem; margin: 0 auto; padding: 3.2rem 1.2rem 4rem; }
  h1 { font-size: 1.75rem; letter-spacing: -.02em; margin: 0 0 .4rem; }
  .lede { color: var(--muted); font-size: 1.05rem; margin: 0 0 .5rem; max-width: 42rem; }
  .note { color: var(--muted); font-size: .9rem; margin: 0 0 2.4rem; max-width: 42rem; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 1.4rem; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); }
  li { border: 1px solid var(--line); border-radius: .8rem; overflow: hidden; background: var(--card); transition: transform .12s ease, box-shadow .12s ease; }
  li:hover { transform: translateY(-2px); box-shadow: 0 .5rem 1.5rem #0003; }
  a { text-decoration: none; color: inherit; display: block; }
  .poster { aspect-ratio: 16/10; background: #8881 center/cover no-repeat; display: block; }
  .cbody { padding: .85rem 1rem 1.1rem; }
  .name { font-weight: 650; font-size: 1.05rem; letter-spacing: -.01em; }
  .blurb { color: var(--muted); font-size: .9rem; margin: .3rem 0 .7rem; display: block; }
  .badge { display: inline-block; font-size: .74rem; color: var(--muted); background: var(--badge); border-radius: 1rem; padding: .15rem .6rem; }
  footer { margin-top: 3rem; color: var(--muted); font-size: .88rem; line-height: 1.7; }
  a.link { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  code { background: var(--badge); padding: .1em .4em; border-radius: .3em; font-size: .85em; }
</style>
</head>
<body>
<h1>xenodot-twin — live digital-twin demos</h1>
<p class="lede">Data-bound 3D digital twins running entirely in your browser — a Godot / WebAssembly viewer replaying recorded telemetry, painting each tag onto the model. No server, no plugins, nothing to install.</p>
<p class="note">Orbit with the mouse (drag to rotate, scroll to zoom); the recording plays automatically on load. Each demo is a single static page — the model, the tag&#8594;geometry binding map and the recording are all baked into one <code>.pck</code>.</p>
<ul>
HTML_HEAD
	if [ -z "$DEMO_DIRS" ]; then
		echo '  <li><div class="cbody"><div class="name">(no demos published yet)</div></div></li>'
	else
		while IFS= read -r d; do
			[ -z "$d" ] && continue
			meta="$(_demo_meta "$d")"
			title="${meta%%|*}"
			blurb="${meta#*|}"
			blurb="${blurb%|*}"
			label="${meta##*|}"
			poster=""
			[ -f "$DEMOS_REPO/$d/poster.png" ] && poster=" style=\"background-image:url('$d/poster.png')\""
			printf '  <li><a href="%s/index.html"><span class="poster"%s></span><span class="cbody"><span class="name">%s</span><span class="blurb">%s</span><span class="badge">%s</span></span></a></li>\n' \
				"$d" "$poster" "$title" "$blurb" "$label"
		done <<<"$DEMO_DIRS"
	fi
	cat <<'HTML_TAIL'
</ul>
<footer>
Built with <a class="link" href="https://github.com/arthur0n/xenodot-twin">xenodot-twin</a> — an agent-built pipeline that turns a 3D/BIM model into a data-bound twin viewer. Each demo bakes its model, binding map and recording into the <code>.pck</code> and ships as a static, no-threads WebAssembly build (no cross-origin-isolation headers), served straight from GitHub Pages.
</footer>
</body>
</html>
HTML_TAIL
	} >"$INDEX"
	# .nojekyll: tell GitHub Pages to serve the tree verbatim (no Jekyll pass) — Godot ships files the
	# Jekyll pipeline could mangle/skip, and it speeds the deploy. Idempotent.
	touch "$DEMOS_REPO/.nojekyll"
	DEMO_COUNT="$(printf '%s\n' "$DEMO_DIRS" | grep -c . || true)"
	echo "$XENO_GATE: PASS index ($INDEX — $DEMO_COUNT demo(s) listed, .nojekyll ensured)"
}

# --- stage 6: movie (optional hero capture) ----------------------------------------------------
# Runs BEFORE the index regen so this demo's poster.png exists to show on its card.
_stage 6/7 "movie"
if [ "$WANT_MOVIE" -ne 1 ]; then
	echo "$XENO_GATE: SKIP movie — --movie not requested (a SKIP is not a pass; the demo is published)."
else
	MOVIE_FRAMES=$((MOVIE_FPS * MOVIE_SECONDS))
	AVI="$WORK/hero.avi"
	echo "  capturing windowed --write-movie: ${MOVIE_SECONDS}s @ ${MOVIE_FPS} fps ($MOVIE_FRAMES frames)"
	# Movie Maker needs a WINDOWED run (headless renders black); it writes frames directly to the AVI
	# (no screen-capture / TCC). The wired viewer.cfg autoplays the recording, so the clip shows data.
	if ! "$GODOT" --path . --write-movie "$AVI" --fixed-fps "$MOVIE_FPS" -- "--quit-after=$MOVIE_FRAMES" \
		>"$WORK/movie.log" 2>&1; then
		cat "$WORK/movie.log" >&2
		_fail "movie — windowed --write-movie failed (needs a real display; see log above)"
	fi
	[ -s "$AVI" ] || _fail "movie — --write-movie produced no AVI (a windowed display is required)"
	POSTER_AT="$(awk "BEGIN{printf \"%.2f\", $MOVIE_SECONDS*0.4}")"
	ffmpeg -y -i "$AVI" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an "$DEST/hero.mp4" >>"$WORK/movie.log" 2>&1 \
		|| _fail "movie — ffmpeg mp4 encode failed (see $WORK/movie.log)"
	ffmpeg -y -i "$AVI" -vf "fps=12,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
		"$DEST/hero.gif" >>"$WORK/movie.log" 2>&1 || _fail "movie — ffmpeg gif encode failed (see $WORK/movie.log)"
	ffmpeg -y -ss "$POSTER_AT" -i "$AVI" -frames:v 1 "$DEST/poster.png" >>"$WORK/movie.log" 2>&1 \
		|| _fail "movie — ffmpeg poster extract failed (see $WORK/movie.log)"
	for f in hero.mp4 hero.gif poster.png; do
		[ -s "$DEST/$f" ] || _fail "movie — $f not produced"
	done
	echo "$XENO_GATE: PASS movie ($DEST/hero.mp4 + hero.gif + poster.png)"
fi

# --- stage 7: regenerate the demos-repo root index.html ----------------------------------------
_stage 7/7 "index (regenerate $DEMOS_REPO/index.html)"
_regen_index

echo
echo "$XENO_GATE: OK"
echo "  demo:      $DEST"
echo "  index:     $DEMOS_REPO/index.html"
echo "  NEXT: commit + push the demos repo, then (once) enable GitHub Pages on it:"
echo "    (cd $DEMOS_REPO && git add -A && git commit -m 'publish $NAME demo' && git push)"
exit 0
