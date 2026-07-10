#!/usr/bin/env bash
# PreToolUse(Bash) guard: block destructive / working-tree-discarding git for ALL callers
# (subagents AND the main session). A refactor agent once ran `git checkout <file>` + `git stash`
# to "clean the baseline" and destroyed an entire uncommitted build — this prevents a recurrence.
#
# Blocks:  git reset | checkout | restore | stash | clean   (also when rtk-prefixed or in an && chain)
# Allows:  git status | diff | log | show | add | commit | push | pull | fetch | switch | branch ...
#          (commit/push don't discard work; use `git switch -c` to create branches)
#
# Reads the PreToolUse payload on stdin; emits a deny decision (exit 0) only on a match.
cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null)"
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_])git[[:space:]]+(reset|checkout|restore|stash|clean)([[:space:]]|$)'; then
  # shellcheck disable=SC2016 # intentional: fixed JSON literal; the backticks are message text, no expansion wanted
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Destructive git is blocked by Xenodot Forge safety policy. git reset/checkout/restore/stash/clean discard or rewrite uncommitted working-tree changes and once wiped an entire uncommitted build. Use read-only git (status/diff/log/show), `git switch -c` to branch; add/commit/push are allowed. If you truly need this, ask the human to run it."}}'
fi
exit 0
