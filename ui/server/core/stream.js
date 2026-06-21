// Best-effort context-meter helper for the session message stream. Split out of
// session.js to keep that file under its length cap.

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").RunningAgentWire} RunningChip */

/** Build a running-strip chip from a `task_started` system message. The server holds these
 * as the authoritative live set; the client reconciles its strip against them.
 * @param {{ task_id?: string, tool_use_id?: string, subagent_type?: string, description?: string }} message
 * @param {Set<string>} bgSpawns tool_use ids spawned run_in_background @returns {RunningChip} */
export function runningChip(message, bgSpawns) {
  const toolUseId = message.tool_use_id ?? "";
  return {
    taskId: message.task_id ?? "",
    toolUseId,
    label: message.subagent_type ?? "",
    desc: message.description ?? "",
    started: Date.now(),
    background: bgSpawns.has(toolUseId),
  };
}

/** Push the authoritative running-agents snapshot to the browser; the client reconciles its
 * strip against it, so a missed task_started/notification self-heals on the next emit.
 * @param {Map<string, RunningChip>} runningByTask @param {(obj: OutMsg) => void} send */
export function emitRunning(runningByTask, send) {
  send({ type: "running", agents: [...runningByTask.values()] });
}

/** Read the session's live context-window usage and push it to the UI meter.
 * Best-effort: getContextUsage is a streaming-mode control request and can throw if the
 * turn raced the session teardown — a missing meter update is harmless, so swallow errors
 * rather than killing the message loop.
 * @param {{ getContextUsage?: () => Promise<{ totalTokens: number, maxTokens: number, percentage: number }> }} q
 * @param {(obj: OutMsg) => void} send */
export async function emitContextUsage(q, send) {
  try {
    const u = await q.getContextUsage?.();
    if (!u) return;
    send({
      type: "context",
      percentage: u.percentage,
      totalTokens: u.totalTokens,
      maxTokens: u.maxTokens,
    });
  } catch {
    // session ended or control request unsupported — skip this meter update
  }
}
