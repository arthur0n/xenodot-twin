#!/usr/bin/env bash
# Visible supervisor for the Xenodot Twin UI server — `npm start`'s implementation.
#
# Runs the server and, when it exits with the RESTART code (75, matching RESTART_EXIT_CODE in
# ui/server/core/http/restart.js), relaunches it on the SAME port. That is how the UI's
# "restart server" button binds config changes (config.js boot consts) a live session can't see.
# Any OTHER exit code is a genuine shutdown: the loop stops and forwards that code. Args pass
# through (e.g. a one-off project path).
#
# No daemon, no magic — a plain while-loop honoring one exit code (scripts-over-magic). For dev
# without the supervisor, run the server directly: `node ui/server/core/index.js [project]`
# (or `npm run start:once`).
set -u

RESTART_CODE=75
cd "$(dirname "$0")/.." || exit 1

while true; do
  node ui/server/core/index.js "$@"
  code=$?
  if [ "$code" -ne "$RESTART_CODE" ]; then
    exit "$code"
  fi
  echo "supervisor: server asked to restart (exit $code) — relaunching…"
done
