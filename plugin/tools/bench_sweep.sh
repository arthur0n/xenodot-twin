#!/bin/bash
# tools/bench_sweep.sh — declarative, deterministic optimize→bench→merge sweep (skill: twin-optimize).
#
# ONE reusable driver for the sweep pattern that three seat spikes (vis-range, occluder, fade) each
# re-hand-rolled: take a declarative matrix of optimizer configs × camera vantages, build each config
# with tools/optimize_scene.gd (deterministic, seeded — same flags in, same scene out), bench each
# config at each vantage with tools/bench_scene.gd, optionally re-bench a set of configs in
# INTERLEAVED cycles (cancels the monotonic thermal drift a single sequential pass aliases onto the
# config axis when frame_ms is display-capped), then merge into self-describing rows with deltas vs a
# named baseline and a noise-floor flag. The merge (tools/bench/merge_sweep.py) ASSERTS the
# deterministic per-frame columns (objects/draws/primitives) are byte-identical across every repeat
# and FAILS LOUD on any variance.
#
# Runs IN a project against its MATERIALIZED tools/ — there is NO framework-overlay logic here (the
# overlay a spike needs to test an unmerged branch is a spike-only concern; a user's optimize_scene.gd
# is already the shipped one). Same discipline as twin_build.sh / verify_twin.sh: loud stage labels,
# exit nonzero on the FIRST failure, a SKIP is never a pass. Timings are honestly session-bound (one
# machine, one thermal block — say so in any report); everything else is deterministic.
#
# The matrix is JSON (dependency-free — parsed by merge_sweep.py, the same python3 every sweep merge
# is written in; no jq). Loading it VALIDATES it, so a bad matrix (unknown key, missing baseline,
# malformed config) fails loud at the first stage that reads it. Worked example matrix (recreates the
# fade sweep): plugin/examples/bench_sweep.vis-fade.example.json.
#
# Usage (from the project root or via tools/bench_sweep.sh):
#   tools/bench_sweep.sh <matrix.json> [stage]
# Stages: optimize | bench | repeat | merge | all (default). PERCEPTUAL pop-series capture is NOT in
# this core tool — see the v2 pointer in the twin-optimize skill (seat spikes carry the reference gd).
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1 # project root — tools/ lives directly under it
PATH="$HOME/.local/bin:$PATH"

XENO_GATE="bench-sweep"
# shellcheck source=lib/checks.sh
source "$SCRIPT_DIR/lib/checks.sh"
MERGE="$SCRIPT_DIR/bench/merge_sweep.py"

_stage() { printf '\n== %s [%s] %s ==\n' "$XENO_GATE" "$1" "$2"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}
# Read one matrix field via the (validating) python reader. Only safe AFTER the preflight validate
# below has proven the matrix loads — a failure inside this $(...) subshell can't abort the parent.
_field() { python3 "$MERGE" "$MATRIX" --field "$1"; }

MATRIX="${1:-}"
STAGE="${2:-all}"
[ -n "$MATRIX" ] || _fail "usage: tools/bench_sweep.sh <matrix.json> [optimize|bench|repeat|merge|all]"
[ -f "$MATRIX" ] || _fail "matrix '$MATRIX' not found"
[ -f "$MERGE" ] || _fail "merge helper not found at $MERGE"

# Preflight: resolve the engine and VALIDATE the matrix once. The validate must run in an `if`
# condition (NOT a $(...) that swallows the abort) so a bad matrix stops the whole run right here.
_stage preflight "resolve engine + validate matrix"
xeno_resolve_engine || exit 1
command -v python3 >/dev/null 2>&1 || _fail "python3 is required for the matrix reader / merge"
if ! _verr="$(python3 "$MERGE" "$MATRIX" --field has_repeat 2>&1)"; then
	printf '%s\n' "$_verr" >&2
	_fail "matrix '$MATRIX' failed validation (see above)"
fi
SCENE_IN="$(_field scene_in)"
OUT_DIR="$(_field out_dir)"
REPORT_DIR="$(_field report_dir)"
JSON_DIR="$(_field json_dir)"
OPT_COMMON="$(_field optimize_common)"
WARMUP="$(_field warmup)"
MEASURE="$(_field measure)"
echo "$XENO_GATE: matrix OK — scene=$SCENE_IN out=$OUT_DIR configs=$(_field configs | wc -l | tr -d ' ') vantages=$(_field vantages | wc -l | tr -d ' ')"

_optimize() {
	_stage optimize "build each config (deterministic)"
	mkdir -p "$REPORT_DIR" "${OUT_DIR#res://}" # res:// out dir must exist or the scene save errors
	# Refresh the class cache so a freshly materialized helper (e.g. TwinVisRange) resolves.
	"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
	local name flags line
	while IFS="$(printf '\t')" read -r name flags; do
		[ -n "$name" ] || continue
		echo "-- optimize $name --"
		# shellcheck disable=SC2086  # $flags / $OPT_COMMON are intentionally word-split optimizer args
		line="$("$GODOT" --headless --path . --script tools/optimize_scene.gd -- \
			--in="$SCENE_IN" --out="$OUT_DIR/$name.scn" --report="$REPORT_DIR/$name.json" \
			$OPT_COMMON $flags 2>&1 | grep -E "OPTIMIZE: (OK|FAIL)|SCRIPT ERROR" | tail -1)"
		echo "$line"
		case "$line" in
		*"OPTIMIZE: OK"*) ;;
		*) _fail "optimize '$name' failed: ${line:-no OPTIMIZE line emitted}" ;;
		esac
	done < <(_field configs)
}

# Run one bench cell, echo its BENCH lines, and return nonzero unless a MEASURED row was emitted.
# The ONLY success signature is a "BENCH: {json}" row — bench_scene.gd SKIPs (exit 0, no row) on a
# headless/display-less host and a SKIP is never a pass: without this assert the merge would read
# the missing rows as None and the driver would print a false green. Mirrors the optimize check.
_bench_one() { # scene vantage_coords out_json warmup measure
	local out
	out="$("$GODOT" --path . -s tools/bench_scene.gd -- "$1" \
		--vantage "$2" --warmup "$4" --measure "$5" --out "$3" 2>&1 | grep -E "BENCH:" | tail -2)"
	printf '%s\n' "$out"
	case "$out" in
	*"BENCH: {"*) return 0 ;;
	*) return 1 ;;
	esac
}

_bench() {
	_stage bench "per config × vantage (single pass)"
	mkdir -p "$JSON_DIR"
	# Fresh per-vantage arrays so a re-run doesn't append onto a stale pass.
	while IFS="$(printf '\t')" read -r vname _; do
		[ -n "$vname" ] && rm -f "$JSON_DIR/$vname.json"
	done < <(_field vantages)
	while IFS="$(printf '\t')" read -r cname _; do
		[ -n "$cname" ] || continue
		while IFS="$(printf '\t')" read -r vname vcoords; do
			[ -n "$vname" ] || continue
			echo "-- bench $cname @ $vname --"
			_bench_one "$OUT_DIR/$cname.scn" "$vcoords" "$JSON_DIR/$vname.json" "$WARMUP" "$MEASURE" \
				|| _fail "bench '$cname' @ '$vname' produced no measured row (a headless SKIP or a bench failure is never a pass)"
		done < <(_field vantages)
	done < <(_field configs)
}

_repeat() {
	[ "$(_field has_repeat)" = "1" ] || {
		echo "$XENO_GATE: no repeat block in matrix — skipping interleaved repeats (single pass stands)"
		return 0
	}
	IFS="$(printf '\t')" read -r cycles rvname rvcoords rwarm rmeas < <(_field repeat_scalars)
	_stage repeat "interleaved cpu @ $rvname ($cycles cycles) — cancels thermal drift"
	local rd="$JSON_DIR/repeat"
	mkdir -p "$rd"
	while IFS="$(printf '\t')" read -r cname _; do
		[ -n "$cname" ] && rm -f "$rd/$cname.json"
	done < <(_field repeat_configs)
	local cyc out
	for cyc in $(seq 1 "$cycles"); do
		while IFS="$(printf '\t')" read -r cname _; do
			[ -n "$cname" ] || continue
			# Capture-then-prefix (NOT a pipe): piping _bench_one into sed would swallow its
			# no-measured-row status — the same subshell trap the preflight validate avoids.
			if ! out="$(_bench_one "$OUT_DIR/$cname.scn" "$rvcoords" "$rd/$cname.json" "$rwarm" "$rmeas")"; then
				printf '%s\n' "$out" >&2
				_fail "repeat cyc$cyc '$cname' produced no measured row (a headless SKIP or a bench failure is never a pass)"
			fi
			printf '%s\n' "$out" | sed "s/^/cyc$cyc $cname /"
		done < <(_field repeat_configs)
	done
}

_merge() {
	_stage merge "deltas vs baseline + determinism asserts"
	python3 "$MERGE" "$MATRIX" || _fail "merge failed (determinism variance or unreadable rows — see above)"
}

case "$STAGE" in
optimize) _optimize ;;
bench) _bench ;;
repeat) _repeat ;;
merge) _merge ;;
all)
	_optimize
	_bench
	_repeat
	_merge
	;;
*) _fail "unknown stage '$STAGE' (optimize|bench|repeat|merge|all)" ;;
esac
echo "$XENO_GATE: OK ($STAGE)"
