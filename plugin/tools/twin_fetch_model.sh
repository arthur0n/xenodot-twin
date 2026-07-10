#!/bin/bash
# tools/twin_fetch_model.sh — fetch an IFC model, verify its integrity, and stamp provenance
# (skill: twin-import). Turns the documented download gotchas into one command:
#
#   1. DOWNLOAD from a URL — with GitHub Git-LFS handling: a plain raw.githubusercontent.com /
#      github.com blob URL for an LFS-tracked file serves a tiny TEXT POINTER, not the model.
#      When the download is an LFS pointer, rewrite to the media.githubusercontent.com/media/
#      endpoint (which serves the real bytes) and re-fetch. (An already-media URL just works.)
#   2. sha256 VERIFY against the expected digest — content integrity, not just "a 200 came back".
#   3. STEP-header SANITY — first 13 bytes must be `ISO-10303-21;`, the guard against a dead URL
#      that served an HTML error page (which would "convert" into garbage downstream).
#   4. SCHEMA — read `FILE_SCHEMA(('IFCx'))` from the header (IFC2X3 vs IFC4 changes the binding
#      vocabulary: IfcPump/Tank/Valve are IFC4-only — see the twin-import skill).
#   5. STAMP models/PROVENANCE.md — URL, license, sha256, byte size, schema, date, file.
#
# Idempotent: an existing output file whose sha256 already matches is REUSED (no re-download).
#
# Usage (from the project root):
#   tools/twin_fetch_model.sh <url> --sha256 <hex> [options]
#     --sha256 <hex>       REQUIRED expected sha256 of the model bytes (integrity gate)
#     --out <path>         output file (default: <models-dir>/<url basename>)
#     --models-dir <dir>   where PROVENANCE.md lives + default output dir (default: models)
#     --license <text>     license / attribution line to record in PROVENANCE.md
#     --name <label>       human label for the PROVENANCE.md section (default: output stem)
#     --no-lfs-rewrite     do NOT auto-rewrite a GitHub URL to the LFS media endpoint
# Exit 0 = downloaded (or reused), verified, and stamped.
set -u
PATH="$HOME/.local/bin:$PATH"
XENO_GATE="twin-fetch-model"

SHA_EXPECT=""
OUT=""
MODELS_DIR="models"
LICENSE=""
NAME=""
LFS_REWRITE=1
URL=""

_step() { printf '%s: %s\n' "$XENO_GATE" "$*"; }
_ok() { printf '%s: OK — %s\n' "$XENO_GATE" "$*"; }
_fail() {
	echo "$XENO_GATE: FAIL — $*" >&2
	exit 1
}

_usage() {
	sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

# --- argument parse (one positional URL + flags) ----------------------------------------------
while [ $# -gt 0 ]; do
	case "$1" in
	--sha256)
		SHA_EXPECT="${2:?--sha256 needs a hex digest}"
		shift 2
		;;
	--out)
		OUT="${2:?--out needs a path}"
		shift 2
		;;
	--models-dir)
		MODELS_DIR="${2:?--models-dir needs a path}"
		shift 2
		;;
	--license)
		LICENSE="${2:?--license needs text}"
		shift 2
		;;
	--name)
		NAME="${2:?--name needs a label}"
		shift 2
		;;
	--no-lfs-rewrite)
		LFS_REWRITE=0
		shift
		;;
	-h | --help)
		_usage
		exit 0
		;;
	-*) _fail "unknown option: $1 (see --help)" ;;
	*)
		[ -z "$URL" ] || _fail "more than one URL given: $URL and $1"
		URL="$1"
		shift
		;;
	esac
done

[ -n "$URL" ] || _fail "no URL given (see --help)"
[ -n "$SHA_EXPECT" ] || _fail "--sha256 <hex> is required (integrity gate)"
command -v curl >/dev/null 2>&1 || _fail "curl not found — needed to download the model"

# sha256 tool differs by platform: coreutils sha256sum vs macOS/BSD shasum.
_sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

# Lowercase a hex digest so the compare is case-insensitive.
_lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Default output path from the URL basename (strip query, url-decode %20 → space).
if [ -z "$OUT" ]; then
	base="${URL%%\?*}"
	base="${base##*/}"
	base="${base//%20/ }"
	[ -n "$base" ] || _fail "cannot derive an output filename from the URL — pass --out"
	OUT="$MODELS_DIR/$base"
fi
[ -n "$NAME" ] || {
	NAME="${OUT##*/}"
	NAME="${NAME%.*}"
}

# --- idempotent reuse -------------------------------------------------------------------------
if [ -f "$OUT" ]; then
	have="$(_sha256 "$OUT")"
	if [ "$(_lc "$have")" = "$(_lc "$SHA_EXPECT")" ]; then
		_ok "reuse $OUT (sha256 already matches)"
		exit 0
	fi
	_step "existing $OUT sha256 differs — re-downloading"
fi

mkdir -p "$(dirname "$OUT")" || _fail "cannot create output dir for $OUT"
TMP="$(mktemp "${TMPDIR:-/tmp}/twin-fetch.XXXXXX")" || _fail "mktemp failed"
# shellcheck disable=SC2064 # expand TMP now: the trap must remove THIS run's temp file
trap "rm -f '$TMP'" EXIT

_download() {
	_step "downloading $1"
	curl -fSL --retry 3 --retry-delay 2 -o "$TMP" "$1" || _fail "download failed: $1"
}

# Rewrite a GitHub raw/blob URL to its Git-LFS media endpoint (serves the real bytes).
_lfs_media_url() {
	case "$1" in
	https://raw.githubusercontent.com/*)
		printf 'https://media.githubusercontent.com/media/%s' "${1#https://raw.githubusercontent.com/}"
		;;
	https://github.com/*/blob/*)
		printf 'https://media.githubusercontent.com/media/%s' "$(printf '%s' "${1#https://github.com/}" | sed 's#/blob/#/#')"
		;;
	https://github.com/*/raw/*)
		printf 'https://media.githubusercontent.com/media/%s' "$(printf '%s' "${1#https://github.com/}" | sed 's#/raw/#/#')"
		;;
	*) return 1 ;;
	esac
}

_download "$URL"

# Git-LFS pointer detection: a pointer is a tiny text file whose first line is the LFS spec URL.
if head -c 60 "$TMP" | grep -q '^version https://git-lfs'; then
	if [ "$LFS_REWRITE" -eq 1 ] && media="$(_lfs_media_url "$URL")"; then
		_step "got a Git-LFS pointer — retrying via the media endpoint"
		_download "$media"
		if head -c 60 "$TMP" | grep -q '^version https://git-lfs'; then
			_fail "still a Git-LFS pointer after media rewrite — is the URL correct? ($media)"
		fi
	else
		_fail "URL served a Git-LFS pointer, not the model. Use the media.githubusercontent.com/media/ endpoint, or drop --no-lfs-rewrite."
	fi
fi

# --- STEP header sanity -----------------------------------------------------------------------
if [ "$(head -c 13 "$TMP")" != "ISO-10303-21;" ]; then
	_fail "not an IFC/STEP file (first 13 bytes are not 'ISO-10303-21;') — a dead URL likely served HTML."
fi

# --- sha256 integrity gate --------------------------------------------------------------------
SHA_ACTUAL="$(_sha256 "$TMP")"
if [ "$(_lc "$SHA_ACTUAL")" != "$(_lc "$SHA_EXPECT")" ]; then
	_fail "sha256 mismatch — expected $SHA_EXPECT, got $SHA_ACTUAL. Corrupt/tampered download; not saved."
fi

# --- schema + size ----------------------------------------------------------------------------
# FILE_SCHEMA(('IFC2X3')) — tolerate whitespace variants; take the first quoted token.
SCHEMA="$(head -c 4096 "$TMP" | tr -d '\n' | grep -oiE "FILE_SCHEMA[[:space:]]*\(\([[:space:]]*'[^']*'" | grep -oE "'[^']*'" | head -1 | tr -d "'")"
[ -n "$SCHEMA" ] || SCHEMA="unknown"
if command -v stat >/dev/null 2>&1; then
	SIZE="$(stat -f%z "$TMP" 2>/dev/null || stat -c%s "$TMP" 2>/dev/null)"
else
	SIZE="$(wc -c <"$TMP" | tr -d ' ')"
fi

# Move the verified bytes into place only now (never leave a half-verified file at $OUT).
mv "$TMP" "$OUT" || _fail "could not write $OUT"
trap - EXIT

# --- stamp PROVENANCE.md ----------------------------------------------------------------------
PROV="$MODELS_DIR/PROVENANCE.md"
mkdir -p "$MODELS_DIR"
if [ ! -f "$PROV" ]; then
	# shellcheck disable=SC2016 # backticks are literal Markdown here, not command substitution
	printf '# Model provenance\n\nIntegrity + source record for each model fetched by `tools/twin_fetch_model.sh`.\n' >"$PROV"
fi
# shellcheck disable=SC2016 # backticks in these format strings are literal Markdown, not command substitution
{
	printf '\n## %s\n\n' "$NAME"
	printf -- '- **File:** `%s`\n' "$OUT"
	printf -- '- **Source URL:** `%s`\n' "$URL"
	printf -- '- **sha256:** `%s` (verified)\n' "$SHA_ACTUAL"
	printf -- '- **Byte size:** %s bytes\n' "$SIZE"
	printf -- '- **IFC schema (STEP header):** `%s`\n' "$SCHEMA"
	printf -- '- **STEP header:** `ISO-10303-21;` (validated — real STEP/IFC, not an HTML page)\n'
	printf -- '- **License / attribution:** %s\n' "${LICENSE:-_(not supplied — record it before any hosted/redistributed use)_}"
	printf -- '- **Fetched:** %s\n' "$(date +%Y-%m-%d)"
} >>"$PROV"

_ok "$OUT — $SIZE bytes, schema $SCHEMA, sha256 verified; provenance → $PROV"
