#!/bin/bash
# tools/lib/verdict.sh — ONE machine-readable verdict shape for every SHELL gate, written on EVERY
# terminal path. This is the shell twin of tools/lib/gate_report.gd (which does exactly this for the
# .gd gates): the GDScript gates got a shared writer that rewrites the status file on every run so a
# previously-green struct can never survive a later failure; the shell gates had no equivalent, and
# the stale-green / stale-manifest bug class recurred FOUR times on the shell/GDScript side before
# this library existed (check_twin_join.gd → 0d7f9db, smoke_binding.gd → 27423c6, and twin_ship.sh
# --retarget twice → 1c2a9a2, including a PASS written BEFORE the smoke that could fail after it).
# Each fix hand-rolled "write the FAIL verdict on this newly-noticed path too". This library removes
# the class instead of patching one path at a time: the EXIT trap owns the terminal path, so a gate
# can no longer FORGET one.
#
# Source it the way checks.sh is sourced (from a script whose SCRIPT_DIR/lib holds it), set XENO_GATE
# to label the output, then:
#
#   XENO_GATE="twin-ship"
#   source "$SCRIPT_DIR/lib/verdict.sh"
#   verdict_arm "$MANIFEST_PATH" "$ARTIFACT"   # "" path ⇒ no --json demanded ⇒ the writer is a no-op
#   verdict_stage preflight                     # label the stage stamped into a fail-closed manifest
#   ... work ...
#   verdict_fail preflight "no such model '$M'" # explicit FAIL manifest; does NOT exit (caller does)
#   ...
#   verdict_pass                                # the gate wrote its own PASS manifest inline — keep it
#
# The safety net: verdict_arm installs a single EXIT trap. If the script EXITS having neither marked
# verdict_pass nor written an explicit verdict_fail, the trap writes a fail-closed FAIL manifest OVER
# whatever stale green was there, so no reader (a UI badge, CI) inherits a pass the run never earned.
# Its coverage is precisely "exited without a terminal verdict on record" — a set -u unbound-var abort,
# a killed/signalled process, or a bare `exit <nonzero>` that skipped the fail helper. It is NOT a
# substitute for `set -e`: these gates run set -u ONLY, so a plain command that fails but does not halt
# the shell (its nonzero status ignored, the script continuing on to verdict_pass) is INVISIBLE to the
# trap — the trap never fires because the script never dies, and a PASS ends up on record. Guarding
# such commands (route each load-bearing command through the fail helper, or check its status) stays
# the gate author's job; the trap only catches the death, not the silent miss. The trap is INLINE (not
# a named handler) on purpose: a function invoked only from a trap trips shellcheck SC2317 on older
# versions, and the whole point here is to add a gate without a new suppression.

# Guard against double-sourcing (a composing gate could pull in both checks.sh and this).
[ -n "${XENO_VERDICT_SH:-}" ] && return 0
XENO_VERDICT_SH=1

# Output prefix — set by the composing gate, same convention as checks.sh.
: "${XENO_GATE:=gate}"

# State — set by verdict_arm / verdict_stage, read by the EXIT trap. Initialised so `set -u` gates
# never trip on an unset read inside the trap.
XENO_VERDICT_PATH=""       # manifest file to write ("" ⇒ no --json requested ⇒ writer is a no-op)
XENO_VERDICT_ARTIFACT=""   # the "artifact" field value carried into the manifest
XENO_VERDICT_STAGE="setup" # current stage, stamped into a fail-closed manifest
XENO_VERDICT_DONE=0        # 1 once a terminal verdict is on record (PASS kept, or explicit FAIL)
XENO_VERDICT_TMP=""        # optional scratch dir removed on exit (a gate that mktemps sets this)
XENO_VERDICT_EC=0          # the exit code captured first thing in the EXIT trap, re-raised at its end

# JSON-escape one line: backslashes then double quotes. Fail reasons are single-line by construction,
# so no newline handling is needed (identical to twin_ship.sh's former _json_str).
_verdict_json_str() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Write the FAIL manifest NOW (a no-op when no path was armed). Shape is EXACTLY
# {status, stage, reason, artifact} — byte-for-byte the manifest twin_ship.sh's inline _rfail used
# to write, so a consumer sees no change. Reachable from verdict_fail AND the EXIT trap.
_verdict_write_fail() { # <stage> <reason>
	[ -n "$XENO_VERDICT_PATH" ] || return 0
	{
		printf '{\n'
		printf '  "status": "FAIL",\n'
		printf '  "stage": "%s",\n' "$(_verdict_json_str "$1")"
		printf '  "reason": "%s",\n' "$(_verdict_json_str "$2")"
		printf '  "artifact": "%s"\n' "$(_verdict_json_str "$XENO_VERDICT_ARTIFACT")"
		printf '}\n'
	} >"$XENO_VERDICT_PATH"
}

# Arm the verdict: record where the manifest lives + the artifact it describes, and install the ONE
# EXIT trap that guarantees a terminal verdict. The handler is inline (see the header note on SC2317)
# and delegates the actual write to _verdict_write_fail, which has a reachable call site.
verdict_arm() { # <manifest_path> <artifact>
	XENO_VERDICT_PATH="$1"
	XENO_VERDICT_ARTIFACT="${2:-}"
	XENO_VERDICT_DONE=0
	trap '
		XENO_VERDICT_EC=$?
		[ -n "$XENO_VERDICT_TMP" ] && rm -rf "$XENO_VERDICT_TMP"
		if [ "$XENO_VERDICT_DONE" -ne 1 ] && [ -n "$XENO_VERDICT_PATH" ]; then
			_verdict_write_fail "$XENO_VERDICT_STAGE" "$XENO_GATE exited on an unrouted path (exit $XENO_VERDICT_EC) — no verdict was recorded; failing closed so no reader inherits a stale green"
			echo "$XENO_GATE: FAIL verdict written on unrouted exit ($XENO_VERDICT_PATH)" >&2
		fi
		exit "$XENO_VERDICT_EC"
	' EXIT
}

# Label the current stage — stamped into the manifest only if the safety net fires.
verdict_stage() { XENO_VERDICT_STAGE="$1"; }

# Explicit FAIL: write the manifest and record that a terminal verdict is on file. Does NOT exit — the
# caller fails loud exactly as before (twin_ship's _rfail calls _fail right after). The stderr line
# matches the message the inline writer used to print, so a consumer's logs are unchanged.
verdict_fail() { # <stage> <reason...>
	local stage="$1"
	shift
	_verdict_write_fail "$stage" "$*"
	[ -n "$XENO_VERDICT_PATH" ] && echo "$XENO_GATE: FAIL manifest written ($XENO_VERDICT_PATH)" >&2
	XENO_VERDICT_DONE=1
}

# The gate wrote its own PASS manifest inline — mark the verdict satisfied so the safety net leaves it
# in place. Call it only once the PASS artifact is truly final (after the last thing that could fail).
verdict_pass() { XENO_VERDICT_DONE=1; }

# A terminal SKIP is on record: the gate wrote its own status:"SKIP" manifest and OWNS a non-zero
# exit (a SKIP is never a pass). Mark the verdict satisfied so the EXIT trap leaves that honest SKIP
# manifest in place instead of clobbering it with a fail-closed FAIL — SKIP and FAIL are different
# facts and the manifest must keep saying which one. The caller still returns/exits non-zero itself.
verdict_skip() { XENO_VERDICT_DONE=1; }
