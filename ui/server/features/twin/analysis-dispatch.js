// Analysis dispatch core — the orchestration BOTH dispatch surfaces share: the `npm run analyze`
// CLI (analyze-cli.js) and the `mcp__ui__analyze` tool (mcp-tools/analyze-tool.js). Extracted so the
// two surfaces can never drift (the hermes-runs.js precedent): the seam's guardrails are enforced
// here, once, and each surface is a thin adapter that maps this module's typed results onto its own
// idiom (a CLI exits + logs; the tool returns a graceful advisory string).
//
// Two pieces:
//   • resolveBundleJson — read `--bundle` verbatim OR inline-build from `--recording` (+ optional
//     map/sidecar/window/tags) through the SAME packager the standalone CLI uses, enforcing the size
//     budget. Bad input throws AnalyzeInputError (never a bare ENOENT), so both surfaces can present
//     it cleanly; matched-nothing tags come back as `warnings`, not a thrown error.
//   • dispatchAnalysis — compose the worker prompt, select the configured worker, and — only if it is
//     configured — run it and have the FRAMEWORK write the report. Returns a discriminated outcome
//     (never throws for the expected failure modes: unknown worker, unconfigured, worker error), so a
//     surface can report each gracefully. The worker still never touches disk (guardrail 1); the
//     report lands only under reports/analysis/ (guardrails 1 + 4, enforced by writeAnalysisReport).
import { readFileSync } from "node:fs";
import path from "node:path";
import { getAnalysisConfig } from "../../core/config.js";
import { parseJSON } from "../../../lib/json.js";
import {
  buildBundle,
  unmatchedTags,
  SIZE_BUDGET_BYTES,
} from "../../../../plugin-twin/tools/analyze/bundle.js";
import { selectWorker } from "./analysis.js";
import {
  isValidTask,
  composeInstructions,
  sha256Hex,
  writeAnalysisReport,
} from "./analysis-report.js";

/** A caller-facing input problem (bad flags, unreadable/oversized bundle) — distinct from a bug so a
 * surface can present the `.message` verbatim (CLI: fail + exit; tool: graceful advisory) rather than
 * dumping a stack. */
export class AnalyzeInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "AnalyzeInputError";
  }
}

/** Read a file as `{ name, text }` (basename + contents) or null for a falsy path; a read failure is
 * re-thrown as an AnalyzeInputError naming the flag. @param {string | undefined | null} p
 * @param {string} flag @returns {{ name: string, text: string } | null} */
function readInput(p, flag) {
  if (!p) return null;
  try {
    return { name: path.basename(p), text: readFileSync(p, "utf8") };
  } catch (err) {
    throw new AnalyzeInputError(
      `could not read ${flag} ${p}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** A human provider label for the frontmatter: the endpoint host for openai-compatible, or the
 * worker id for hermes. Best-effort — a bare id is fine if the URL doesn't parse. @param {string}
 * workerId @param {string | null} apiUrl @returns {string} */
export function providerLabel(workerId, apiUrl) {
  if (workerId === "hermes") return "hermes";
  if (!apiUrl) return workerId;
  try {
    return new URL(apiUrl).host || workerId;
  } catch {
    return workerId;
  }
}

/** The window block from a bundle document (defaults preserved on a malformed/empty bundle).
 * @param {string} bundleJson @returns {{ from_ms: number | null, to_ms: number | null }} */
export function windowOf(bundleJson) {
  try {
    const doc = /** @type {{ window?: { from_ms?: unknown, to_ms?: unknown } }} */ (
      parseJSON(bundleJson)
    );
    const w = doc.window;
    return {
      from_ms: typeof w?.from_ms === "number" ? w.from_ms : null,
      to_ms: typeof w?.to_ms === "number" ? w.to_ms : null,
    };
  } catch {
    return { from_ms: null, to_ms: null };
  }
}

/** Inline-build a bundle from a recording (+ optional map/sidecar/window/tags) through the same
 * packager the standalone CLI uses, enforcing the size budget unless `allowOversize`. Throws
 * AnalyzeInputError on bad input; matched-nothing tags come back as `warnings`. @param {{ recording:
 * string, map?: string | null, sidecar?: string | null, fromMs?: number | null, toMs?: number |
 * null, tags?: string[] | null, pointsPerTag?: number | null, allowOversize: boolean }} arg
 * @returns {{ json: string, warnings: string[] }} */
function inlineBundle(arg) {
  const { recording, map, sidecar, fromMs, toMs, tags, pointsPerTag, allowOversize } = arg;
  if (pointsPerTag != null && (!Number.isInteger(pointsPerTag) || pointsPerTag <= 0))
    throw new AnalyzeInputError("--points-per-tag must be a positive integer");
  const rec = readInput(recording, "--recording");
  if (!rec) throw new AnalyzeInputError("--recording could not be read");
  const tagsArg = tags && tags.length > 0 ? tags : null;
  const {
    json,
    bytes,
    bundle: built,
  } = buildBundle({
    recording: rec,
    map: readInput(map, "--map"),
    sidecar: readInput(sidecar, "--sidecar"),
    fromMs: fromMs ?? null,
    toMs: toMs ?? null,
    tags: tagsArg,
    pointsPerTag: pointsPerTag ?? undefined,
  });
  /** @type {string[]} */
  const warnings = [];
  const missing = unmatchedTags(built, tagsArg);
  if (missing.length > 0)
    warnings.push(
      `--tags matched no frames for: ${missing.join(", ")}. ` +
        "Check the tag names against the recording header's tag table (typos filter silently).",
    );
  if (bytes > SIZE_BUDGET_BYTES && !allowOversize)
    throw new AnalyzeInputError(
      `inline bundle is ${bytes} bytes — ${bytes - SIZE_BUDGET_BYTES} over the ${SIZE_BUDGET_BYTES}-byte budget. ` +
        "Narrow --from-ms/--to-ms, select --tags, lower --points-per-tag, or pass --allow-oversize",
    );
  return { json, warnings };
}

/** Resolve the bundle JSON to analyze: read `--bundle` verbatim, or inline-build it from
 * `--recording` (see inlineBundle). Bad input throws AnalyzeInputError; tags that matched no frames
 * are returned as `warnings` (non-fatal). @param {{ bundle?: string | null, recording?: string |
 * null, map?: string | null, sidecar?: string | null, fromMs?: number | null, toMs?: number | null,
 * tags?: string[] | null, pointsPerTag?: number | null, allowOversize?: boolean }} arg
 * @returns {{ json: string, warnings: string[] }} */
export function resolveBundleJson(arg) {
  const { bundle, recording } = arg;
  if (bundle && recording)
    throw new AnalyzeInputError("pass either --bundle or --recording, not both");
  if (bundle) {
    const file = readInput(bundle, "--bundle");
    // readInput only returns null for a falsy path; `bundle` is truthy here.
    return { json: /** @type {{ text: string }} */ (file).text, warnings: [] };
  }
  if (!recording) throw new AnalyzeInputError("one of --bundle or --recording is required");
  return inlineBundle({ ...arg, recording, allowOversize: arg.allowOversize ?? false });
}

/** @typedef {{ path: string, filename: string, dir: string }} WrittenReport */
/** The outcome of a dispatch. `ok:true` carries the written report + provenance; each `ok:false`
 * kind is an EXPECTED failure a surface reports gracefully (never a thrown crash).
 * @typedef {(
 *   | { ok: true, report: WrittenReport, task: string, workerId: string, provider: string, model: string, bundleSha256: string, window: { from_ms: number | null, to_ms: number | null } }
 *   | { ok: false, kind: "bad-task", task: string }
 *   | { ok: false, kind: "no-template", task: string, path: string }
 *   | { ok: false, kind: "select-error", error: string }
 *   | { ok: false, kind: "unconfigured", workerId: string, reason: string }
 *   | { ok: false, kind: "worker-failed", workerId: string, error: string }
 * )} DispatchOutcome */

/** Dispatch a resolved bundle to the configured worker and (only when it is configured) have the
 * FRAMEWORK write the report. Pure of process/console I/O — it returns a DispatchOutcome the caller
 * renders. `onDispatch` fires once the worker is chosen + configured, right before the (possibly
 * long) model call, so a surface can show "dispatching …". @param {{ projectDir: string, tasksDir:
 * string, task: string, bundleJson: string, now: () => string, adapterOpts?: object, onDispatch?:
 * (info: { workerId: string, bundleSha256: string }) => void }} arg @returns {Promise<DispatchOutcome>} */
export async function dispatchAnalysis(arg) {
  const { projectDir, tasksDir, task, bundleJson, now } = arg;
  // Whitelist guard (defence in depth — the CLI validates argv and the tool uses a zod enum, so a
  // stray task never reaches here; writeAnalysisReport whitelists again before any path is built).
  if (!isValidTask(task)) return { ok: false, kind: "bad-task", task };
  const bundleSha256 = sha256Hex(bundleJson);
  const templatePath = path.join(tasksDir, `${task}.md`);
  /** @type {string} */
  let template;
  try {
    template = readFileSync(templatePath, "utf8");
  } catch {
    return { ok: false, kind: "no-template", task, path: templatePath };
  }
  const instructions = composeInstructions({ template, bundleJson });

  const selected = selectWorker({ adapterOpts: arg.adapterOpts });
  if (!selected.ok) return { ok: false, kind: "select-error", error: selected.error };
  const worker = selected.worker;

  const ready = worker.configured();
  // Graceful absence (guardrail 3): report the reason, write nothing.
  if (ready !== true)
    return { ok: false, kind: "unconfigured", workerId: worker.id, reason: ready };

  arg.onDispatch?.({ workerId: worker.id, bundleSha256 });
  /** @type {{ output: string, model: string }} */
  let result;
  try {
    result = await worker.analyze({ instructions });
  } catch (err) {
    return {
      ok: false,
      kind: "worker-failed",
      workerId: worker.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const provider = providerLabel(worker.id, getAnalysisConfig().apiUrl);
  const window = windowOf(bundleJson);
  const report = writeAnalysisReport({
    projectDir,
    task,
    workerId: worker.id,
    provider,
    model: result.model,
    bundleSha256,
    window,
    body: result.output,
    createdAt: now(),
  });
  return {
    ok: true,
    report,
    task,
    workerId: worker.id,
    provider,
    model: result.model,
    bundleSha256,
    window,
  };
}
