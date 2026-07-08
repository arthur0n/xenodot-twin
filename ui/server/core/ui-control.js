// Which in-process MCP tools are "UI-control" surfaces — they only mutate local state +
// broadcast to the browser (no real side effect), so canUseTool auto-allows them without
// the permission gate. Split out of session.js to keep makeCanUseTool's complexity (and
// that file's length) in check.
import {
  TASK_TOOL,
  ASK_TOOL,
  PROMOTE_TOOL,
  ASSET_TOOL,
  AUTONOMOUS_TOOL,
  COMPACT_TOOL,
  DOCS_GET_CLASS_TOOL,
} from "./config.js";

// These get the calling agent stamped as `_by` so the server can attribute the record
// (task/question/promotion owner). The server overrides any model-supplied `_by`.
const STAMP_BY_TOOLS = new Set([TASK_TOOL, ASK_TOOL, PROMOTE_TOOL]);
// These auto-allow with no stamp.
const PLAIN_ALLOW_TOOLS = new Set([ASSET_TOOL, AUTONOMOUS_TOOL, COMPACT_TOOL]);

/** Auto-allow result for a UI-control tool, or null if `toolName` isn't one.
 * @param {string} toolName @param {Record<string, unknown>} input @param {string} agent */
export function uiControlAllow(toolName, input, agent) {
  if (STAMP_BY_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: { ...input, _by: agent } };
  if (PLAIN_ALLOW_TOOLS.has(toolName))
    return { behavior: /** @type {const} */ ("allow"), updatedInput: input };
  return null;
}

/**
 * Deterministic dedup of the immutable Godot API docs: a `get_class` dump is ~20k chars of
 * version-pinned reference, so re-fetching a class already pulled THIS SESSION only re-sends the
 * same payload for no new info. A repeat → DENY with a stub; the first fetch is recorded and flows
 * through the normal permission policy. In-session dedup arm of token opp `godot-docs-memoize` (the
 * dated, TRIMMED cross-session cache is tracked as framework tech debt).
 * @param {string} toolName
 * @param {unknown} input
 * @param {Set<string>} seen  per-session fetched-class set (mutated on first fetch)
 * @returns {{ behavior: "deny", message: string } | null}  deny stub on a repeat, else null
 */
export function docsDedupDecision(toolName, input, seen) {
  if (toolName !== DOCS_GET_CLASS_TOOL) return null;
  const inp = /** @type {{ className?: unknown }} */ (input);
  const cls = typeof inp?.className === "string" ? inp.className.trim() : "";
  if (!cls) return null;
  if (seen.has(cls)) {
    return {
      behavior: /** @type {const} */ ("deny"),
      message: `Already fetched the full "${cls}" API earlier this session — not re-sent (identical version-pinned docs; saves ~5k tokens). Scroll up to that get_class result; re-fetch only if you genuinely cannot find it.`,
    };
  }
  seen.add(cls);
  return null;
}
