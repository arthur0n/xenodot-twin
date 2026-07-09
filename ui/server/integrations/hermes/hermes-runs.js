// Hermes runs-API bridge — the low-level HTTP primitives for driving a Hermes agent through its
// asynchronous "runs" API (POST a run, poll it to a terminal state, stop it). Extracted here,
// dependency-free (no agent SDK, no zod), so BOTH callers reuse ONE bridge instead of duplicating
// the fetch/poll dance:
//   • mcp-tools/hermes-tool.js — the fire-and-forget Hive dispatch (background watcher, session push).
//   • features/twin/analysis.js — the synchronous analysis worker (`runToCompletion`, returns output).
//
// Hermes "runs" API (docs/user-guide/features/api-server):
//   POST /v1/runs {input, instructions?} -> {run_id, status:"started"}   (returns at once)
//   GET  /v1/runs/{id}                   -> {status, output, usage, ...}  (completed|failed|cancelled)
//   POST /v1/runs/{id}/stop              -> stop a run
//   Auth: Authorization: Bearer <API_SERVER_KEY>
import { parseJSON } from "../../../lib/json.js";

/** Default cadence for the poll loop — a run's state is read this often until it ends. */
export const POLL_INTERVAL_MS = 3_000;

/** @param {string} key @returns {{ authorization: string }} */
export const authHeaders = (key) => ({ authorization: `Bearer ${key}` });

/** Strip trailing slashes so path joins never double up. @param {string} url @returns {string} */
export const baseOf = (url) => url.replace(/\/+$/, "");

/** Parse a JSON payload, or null if it isn't JSON. @param {string} data @returns {unknown} */
export function parseAs(data) {
  try {
    return parseJSON(data);
  } catch {
    return null;
  }
}

/** Resolve after `ms`, or early if `signal` aborts (so a poll loop unblocks on teardown).
 * @param {number} ms @param {AbortSignal} signal @returns {Promise<void>} */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/** Create a run and return its id. The POST returns immediately; the agent loops server-side.
 * @param {string} base @param {string} key @param {string} task @param {string} instructions
 * @param {AbortSignal} signal @returns {Promise<string>} */
export async function createRun(base, key, task, instructions, signal) {
  const res = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(key) },
    body: JSON.stringify({ input: task, instructions }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Hermes ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const body = /** @type {{ run_id?: string } | null} */ (
    parseAs(await res.text().catch(() => "{}"))
  );
  const runId = body?.run_id;
  if (!runId) throw new Error("Hermes did not return a run_id");
  return runId;
}

/** Fetch one run's current state. @param {string} base @param {string} key @param {string} runId
 * @param {AbortSignal} signal @returns {Promise<Record<string, unknown> | null>} */
export async function fetchRun(base, key, runId, signal) {
  const res = await fetch(`${base}/v1/runs/${runId}`, { headers: authHeaders(key), signal });
  if (!res.ok) throw new Error(`run status ${res.status}`);
  return /** @type {Record<string, unknown> | null} */ (
    parseAs(await res.text().catch(() => "{}"))
  );
}

/** Best-effort stop of a run (timeout / approval gate). Never throws. @param {string} base
 * @param {string} key @param {string} runId @returns {Promise<void>} */
export async function stopRun(base, key, runId) {
  try {
    await fetch(`${base}/v1/runs/${runId}/stop`, { method: "POST", headers: authHeaders(key) });
  } catch {
    /* the run will still hit its own server-side limits; nothing more we can do */
  }
}

/** Decide what a polled run state means. @param {Record<string, unknown> | null} state
 * @returns {{ kind: "pending" } | { kind: "approval" } |
 *   { kind: "completed", output: string } | { kind: "ended", reason: string }} */
export function classifyRun(state) {
  const status = typeof state?.status === "string" ? state.status.toLowerCase() : "";
  if (status.includes("approval")) return { kind: "approval" };
  if (status === "completed") {
    const out = state?.output;
    const output = typeof out === "string" ? out : out == null ? "" : JSON.stringify(out);
    return { kind: "completed", output };
  }
  if (status === "failed" || status === "cancelled" || status === "canceled") {
    const why = typeof state?.error === "string" ? ` — ${state.error.slice(0, 200)}` : "";
    return { kind: "ended", reason: `${status}${why}` };
  }
  return { kind: "pending" };
}

/** Poll a run SYNCHRONOUSLY to a terminal state and return its `output` — the blocking counterpart
 * to hermes-tool's background watcher, for callers (the analysis worker) that need the findings
 * inline. Throws on failure/approval/timeout with a clear reason; stops the run on the last two so
 * nothing is left hanging. Transport read errors are transient — kept polling until the deadline.
 * @param {string} base @param {string} key @param {string} runId
 * @param {{ pollIntervalMs?: number, wallclockMs: number, signal?: AbortSignal }} opts
 * @returns {Promise<string>} */
export async function runToCompletion(base, key, runId, opts) {
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const ctrl = new AbortController();
  const onAbort = () => {
    ctrl.abort();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const deadline = Date.now() + opts.wallclockMs;
  try {
    for (;;) {
      if (Date.now() > deadline) {
        await stopRun(base, key, runId);
        throw new Error(
          `Hermes run ${runId} exceeded the ${Math.round(opts.wallclockMs / 60_000)}m limit and was stopped`,
        );
      }
      await sleep(pollIntervalMs, ctrl.signal);
      if (ctrl.signal.aborted) throw new Error(`Hermes run ${runId} was aborted`);
      let state;
      try {
        state = await fetchRun(base, key, runId, ctrl.signal);
      } catch {
        continue; // transient read error — keep polling until the deadline
      }
      const verdict = classifyRun(state);
      if (verdict.kind === "pending") continue;
      if (verdict.kind === "approval") {
        await stopRun(base, key, runId);
        throw new Error(`Hermes run ${runId} paused on an approval gate (unsupported headless)`);
      }
      if (verdict.kind === "ended") throw new Error(`Hermes run ${runId} ${verdict.reason}`);
      return verdict.output; // completed
    }
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
