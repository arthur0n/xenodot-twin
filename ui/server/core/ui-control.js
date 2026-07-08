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

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** The stub returned when an image Read is refused — points at the numeric gate + disk frame. */
export const SCREENSHOT_STUB =
  "Image reads are GATED (a render/screenshot frame is token-heavy base64). Framework rule (godot-verify): never read a frame into chat — trust the NUMERIC gate (render_health.gd / VERIFY-* output). The PNG stays on disk (.godot/verify_render_last.png) for human inspection only. If a human genuinely must eyeball it, surface that via AskUserQuestion at the END of the pipeline.";

/** Is this a Read of an image file (a screenshot/render frame)? Such a Read floods context with
 * ~thousands of base64 tokens, so it is gated (human-approved / denied when headless), never at-will.
 * @param {string} toolName @param {unknown} input @returns {boolean} */
export function isImageRead(toolName, input) {
  if (toolName !== "Read") return false;
  const fp = /** @type {{ file_path?: unknown }} */ (input)?.file_path;
  return typeof fp === "string" && IMAGE_RE.test(fp);
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

/** @typedef {import("../../lib/types.js").WaitFor} WaitFor */
/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {{ session: { autonomousActive?: boolean, fetchedDocs?: Set<string> }, waitFor: WaitFor, log: (dir: string, obj: OutMsg) => void, toolName: string, input: Record<string, unknown>, agent: string }} GateDeps */

/** Gate a screenshot/render-frame Read: deny outright when headless/autonomous (no human to
 * approve), else FORCE a human approval — never at-will. @param {GateDeps} d */
async function gateImageRead({ session, waitFor, log, toolName, input, agent }) {
  if (session.autonomousActive) {
    log("auto", { type: "permission", toolName, policy: "image-read-denied" });
    return { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
  }
  const { allow } = await waitFor("permission", { toolName, input, agent });
  return allow
    ? { behavior: /** @type {const} */ ("allow"), updatedInput: input }
    : { behavior: /** @type {const} */ ("deny"), message: SCREENSHOT_STUB };
}

/** Deterministic pre-gates run BEFORE the permission policy: immutable-docs dedup, then the
 * screenshot read gate. Returns a decision to short-circuit, or null to fall through. Keeps
 * makeCanUseTool's arrow under the complexity cap and its file under the line cap.
 * @param {GateDeps} d */
export async function preToolGate({ session, waitFor, log, toolName, input, agent }) {
  const dedup = docsDedupDecision(
    toolName,
    input,
    session.fetchedDocs ?? (session.fetchedDocs = new Set()),
  );
  if (dedup) {
    log("auto", { type: "permission", toolName, policy: "docs-dedup" });
    return dedup;
  }
  if (isImageRead(toolName, input))
    return gateImageRead({ session, waitFor, log, toolName, input, agent });
  return null;
}
