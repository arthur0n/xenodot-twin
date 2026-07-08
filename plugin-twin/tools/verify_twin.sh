#!/bin/bash
# tools/verify_twin.sh — the twin builder's deterministic gate (skill: twin-verify):
# the shared static floor (tools/lib/checks.sh — the SAME library validate.sh composes,
# materialized into the project from the base xenodot plugin) + the twin-specific checks:
# GlobalId join coverage, data-binding smoke, frame-budget bench.
#
# SKELETON STATUS: the static floor is live; the twin checks run when their project
# scripts exist and SKIP loudly otherwise (a SKIP is not a pass — see the skill).
#
# Usage (from the project root or anywhere):
#   tools/verify_twin.sh                              # runs main scene
#   tools/verify_twin.sh path/to/scene.tscn           # runs given scene
# Exit 0 = gate passed ("verify-twin: OK").
set -u
# Resolve the script dir BEFORE cd, so sourcing is robust however the script was invoked.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1
PATH="$HOME/.local/bin:$PATH"

# Label the shared checks' output as this gate's.
XENO_GATE="verify-twin"
# shellcheck source=lib/checks.sh
source "$SCRIPT_DIR/lib/checks.sh"
xeno_resolve_engine || exit 1

SCENE_ARG="${1:-}"
SCENE_RES=""
[ -n "$SCENE_ARG" ] && SCENE_RES="res://$SCENE_ARG"

# --- static floor (shared with the base plugin's validate.sh — no drift) ----------------------
check_format || exit 1
check_lint || exit 1
check_warnings_config || exit 1
check_parse || exit 1
check_props || exit 1
check_scene_errors || exit 1
check_smoke "$SCENE_RES" || exit 1

# --- twin checks (skill: twin-verify) ----------------------------------------------------------

# GlobalId join coverage — headless join check from twin-import (JOIN=<n>/<m> at ~100%).
if [ -f "tools/check_twin_join.gd" ]; then
	if ! "$GODOT" --headless --path . -s tools/check_twin_join.gd; then
		echo "$XENO_GATE: FAIL join-coverage — see JOIN/MISS_SAMPLE lines above"
		exit 1
	fi
	echo "$XENO_GATE: PASS join-coverage"
else
	echo "$XENO_GATE: SKIP join-coverage (no tools/check_twin_join.gd yet — TODO Phase 1)"
fi

# Data-binding smoke — seeded sim + bounded viewer run + state asserts (twin-bind-data fixture).
if [ -f "tools/smoke_binding.gd" ] && [ -f "sim/server.js" ]; then
	node sim/server.js --seed 42 &
	SIM_PID=$!
	SMOKE_RC=0
	"$GODOT" --headless --path . -s tools/smoke_binding.gd || SMOKE_RC=1
	kill "$SIM_PID" 2>/dev/null
	if [ "$SMOKE_RC" -ne 0 ]; then
		echo "$XENO_GATE: FAIL binding-smoke — see BIND-SMOKE lines above"
		exit 1
	fi
	echo "$XENO_GATE: PASS binding-smoke"
else
	echo "$XENO_GATE: SKIP binding-smoke (needs tools/smoke_binding.gd + sim/server.js — TODO Phase 3)"
fi

# Frame-budget bench — windowed only; the gate itself never fabricates an fps number.
# Run manually / from CI-with-display per the twin-verify skill:
#   $GODOT --path . -s tools/bench_scene.gd -- <scene> --out .xenodot/bench/<slug>.json
echo "$XENO_GATE: SKIP frame-budget (windowed bench — run tools/bench_scene.gd per skill twin-verify)"

echo "verify-twin: OK"
