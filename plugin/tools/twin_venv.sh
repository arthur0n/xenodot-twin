#!/bin/bash
# tools/twin_venv.sh — idempotently provision the pinned ifcopenshell venv the IFC convert
# path needs (skill: twin-import, Step 0). One command replaces the hand-run two-liner that
# every seat repeated by hand (house, twin-build-validate, twin-plant-validate, xt-poc2):
#
#     uv venv --python 3.12 .venv-ifc && uv pip install ifcopenshell==0.8.5
#
# ifcopenshell ships NO wheel for the current macOS system python (3.14) — the venv MUST pin
# 3.12, and 0.8.5 is the proven version. This tool owns that recipe so ifc_convert.py can stay
# a pure build step (it runs INSIDE the venv and can't bootstrap the venv it imports from).
#
# Contract (idempotent):
#   • existing valid venv (ifcopenshell == the pinned version importable) → REUSE, exit 0.
#   • missing venv → PROVISION (uv venv --python 3.12 + uv pip install ifcopenshell==0.8.5).
#   • version MISMATCH (a different ifcopenshell already installed) → clear FAIL, never a silent
#     rebuild (silently rebuilding an environment hides drift — the same discipline twin_build.sh
#     keeps by refusing to auto-create).
#
# Usage (from the project root or anywhere):
#   tools/twin_venv.sh                                  # ensure .venv-ifc is ready
#   tools/twin_venv.sh --dir .venv-ifc --python 3.12 --ifcopenshell 0.8.5
#   tools/twin_venv.sh --run tools/ifc_convert.py model.ifc   # ensure, then run inside the venv
# Exit 0 = venv ready (or the --run script exited 0).
set -u
PATH="$HOME/.local/bin:$PATH"
XENO_GATE="twin-venv"

VENV_DIR=".venv-ifc"
PY_VERSION="3.12"
IFC_VERSION="0.8.5"
RUN=0

_ok() { printf '%s: OK — %s\n' "$XENO_GATE" "$*"; }
_step() { printf '%s: %s\n' "$XENO_GATE" "$*"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}

_usage() {
	cat <<'USAGE'
usage: tools/twin_venv.sh [options] [--run <script> [args...]]
  --dir <path>            venv directory (default: .venv-ifc)
  --python <ver>          python version to pin (default: 3.12 — ifcopenshell has no 3.14 wheel)
  --ifcopenshell <ver>    ifcopenshell version to pin (default: 0.8.5 — the proven version)
  --run <script> [args]   after ensuring the venv, run <script> with the venv's python (rest passed through)
USAGE
}

# --- argument parse ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
	case "$1" in
	--dir)
		VENV_DIR="${2:?--dir needs a path}"
		shift 2
		;;
	--python)
		PY_VERSION="${2:?--python needs a version}"
		shift 2
		;;
	--ifcopenshell)
		IFC_VERSION="${2:?--ifcopenshell needs a version}"
		shift 2
		;;
	--run)
		RUN=1
		shift
		break # everything after --run is the script + its args
		;;
	-h | --help)
		_usage
		exit 0
		;;
	*) _fail "unknown argument: $1 (see --help)" ;;
	esac
done

VENV_PY="$VENV_DIR/bin/python"

# Query the ifcopenshell version installed in the venv, or empty if not importable.
_installed_version() {
	[ -x "$VENV_PY" ] || return 0
	"$VENV_PY" -c 'import ifcopenshell; print(ifcopenshell.version)' 2>/dev/null
}

# Ensure uv is on PATH — the provisioner. Absent uv is a loud, actionable failure (never a
# silent skip): uv may not be installed, and building the environment behind the user's back
# would hide that.
_require_uv() {
	command -v uv >/dev/null 2>&1 && return 0
	_fail "uv not found — install it (brew install uv) then re-run. It provides the pinned python and pip."
}

# --- ensure the venv --------------------------------------------------------------------------
FOUND="$(_installed_version)"
if [ -n "$FOUND" ]; then
	if [ "$FOUND" = "$IFC_VERSION" ]; then
		_ok "reuse $VENV_DIR (ifcopenshell $FOUND)"
	else
		_fail "version mismatch: $VENV_DIR has ifcopenshell $FOUND, want $IFC_VERSION — remove $VENV_DIR and re-run to rebuild, or pass --ifcopenshell $FOUND to accept it."
	fi
else
	_require_uv
	if [ ! -x "$VENV_PY" ]; then
		# Self-heal: a directory left by an interrupted provision has no working bin/python —
		# uv venv refuses an existing dir, and the failure would misread as "python unavailable".
		# Remove the invalid dir honestly and rebuild. (A VALID venv never reaches this branch:
		# the reuse/mismatch checks above already handled it.)
		if [ -e "$VENV_DIR" ]; then
			_step "removing invalid venv $VENV_DIR (no working bin/python — interrupted provision?) and rebuilding"
			rm -rf -- "$VENV_DIR" || _fail "could not remove invalid venv dir $VENV_DIR"
		fi
		_step "creating venv $VENV_DIR (python $PY_VERSION)"
		uv venv --python "$PY_VERSION" "$VENV_DIR" || _fail "uv venv failed (python $PY_VERSION unavailable?)"
	fi
	_step "installing ifcopenshell==$IFC_VERSION into $VENV_DIR"
	uv pip install --python "$VENV_PY" "ifcopenshell==$IFC_VERSION" || _fail "uv pip install ifcopenshell==$IFC_VERSION failed"
	FOUND="$(_installed_version)"
	[ "$FOUND" = "$IFC_VERSION" ] || _fail "post-install verify: ifcopenshell reports '$FOUND', expected $IFC_VERSION"
	_ok "provisioned $VENV_DIR (ifcopenshell $FOUND, python $PY_VERSION)"
fi

# --- optional: run a script inside the venv ---------------------------------------------------
if [ "$RUN" -eq 1 ]; then
	[ $# -gt 0 ] || _fail "--run needs a script path"
	_step "running: $VENV_PY $*"
	exec "$VENV_PY" "$@"
fi
