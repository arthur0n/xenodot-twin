#!/usr/bin/env bash
# PreToolUse(Bash) rtk usage logger — OBSERVE-ONLY, NON-BLOCKING. Records whether each
# sub-agent Bash command was `rtk`-prefixed so real rtk-usage can be measured alongside the
# caveman compliance log. NEVER blocks, denies, or rewrites — only appends a log row (exit 0).
#
# Scoped to sub-agents ONLY via `agent_id` (absent on the main thread). rtk for spawned game
# sub-agents is instruction-only (no enforcing hook ships in the plugin); this hook just tells
# you whether that instruction is actually being followed.
#
# Log: logs/rtk-usage.log under the framework dir. Per row: rtk-prefixed?, exempt?, command head.
payload="$(cat)"
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null)"
[ -z "$agent_id" ] && exit 0

session_id="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# First non-space token of the command.
first="$(printf '%s' "$cmd" | awk '{print $1; exit}')"

rtk=false
[ "$first" = "rtk" ] && rtk=true

# Exempt = commands with no rtk filter (per agent docs): the Godot binary, project scripts, and
# trivial shell builtins. These shouldn't count as rtk "violations".
exempt=false
case "$first" in
  cd|export|source|.|:|true|false|echo) exempt=true ;;
  *godot|"$GODOT") exempt=true ;;
  tools/*|./tools/*|*validate.sh) exempt=true ;;
esac

# Command head for context (first 80 chars, single line).
head="$(printf '%s' "$cmd" | tr '\n' ' ' | cut -c1-80)"

log_dir="${XENODOT_PLUGIN%/plugin}/logs"
[ -n "${XENODOT_PLUGIN:-}" ] || log_dir="${TMPDIR:-/tmp}"
{
  mkdir -p "$log_dir" 2>/dev/null && \
  jq -cn \
    --arg s "$session_id" --argjson r "$rtk" --argjson e "$exempt" --arg c "$head" \
    '{session_id:$s, rtk:$r, exempt:$e, cmd:$c}' \
    >> "$log_dir/rtk-usage.log"
} 2>/dev/null

exit 0
