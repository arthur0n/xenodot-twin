// Analyze tool: the phase-2 dispatch surface for the multi-model analysis seam — `mcp__ui__analyze`.
// It makes the seam the `npm run analyze` CLI proved (recording → bundle → other-model narration →
// advisory report) reachable from a Hive session, WITHOUT duplicating a line of that orchestration:
// it calls the SAME shared core (features/twin/analysis-dispatch.js) the CLI does, so the two can
// never drift. The CLI stays canonical.
//
// GATING: like the Hermes tool, this is a REAL side effect (a billable model call + a report file),
// so it has NO auto-allow branch in canUseTool (it is absent from uiControlAllow) — every dispatch
// hits the per-call permission gate (allow/deny in the web UI). Registration is unconditional, like
// the siblings; the gate, not the registry, is the consent surface.
//
// The five seam guardrails hold on this surface exactly as on the CLI, because the enforcement lives
// in the shared core + the report writer, not here: (1) the worker returns only a string — the
// FRAMEWORK writes the report, under reports/analysis/ and nowhere else; (2) this tool RETURNS an
// advisory summary + the report path — never the raw worker output as an action, and it applies
// nothing; (3) an unconfigured worker is a graceful tool result (never a throw); (4) the report names
// provider+model+bundle hash; (5) no machine-access toolset is on any worker path (the adapter module
// carries no fs/child_process). The task is a zod enum of the whitelist, so traversal/unknown tasks
// are rejected at the arg boundary before any path is built (writeAnalysisReport whitelists again).
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import path from "node:path";
import { PROJECT_DIR, TWIN_PLUGIN_DIR } from "../core/config.js";
import { TASK_TYPES } from "../features/twin/analysis-report.js";
import {
  AnalyzeInputError,
  resolveBundleJson,
  dispatchAnalysis,
} from "../features/twin/analysis-dispatch.js";

/** A tool text result, in the shape the agent SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

/** Render the successful outcome as an ADVISORY summary + the report path (never the raw worker
 * body). @param {Extract<import("../features/twin/analysis-dispatch.js").DispatchOutcome, { ok: true }>}
 * o @param {string[]} warnings @returns {string} */
function summarize(o, warnings) {
  const warn = warnings.length ? `\nwarnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}` : "";
  return (
    "Analysis complete — the FRAMEWORK wrote the advisory report (the worker never touched disk):\n" +
    `  ${o.report.path}\n` +
    `task=${o.task} worker=${o.workerId} provider=${o.provider} model=${o.model} ` +
    `bundle_sha256=${o.bundleSha256}` +
    warn +
    "\n\nThis is ADVISORY input only — it applies nothing and moves nothing. Read the report (it names " +
    "its provider+model+bundle hash), then decide what, if anything, to do.\n" +
    "Known attribution limit: the openai-compatible worker reports the endpoint's `body.model`; the " +
    "hermes worker echoes the configured model label."
  );
}

/** The tool's argument surface — mirrors the CLI flags. `task` is a zod enum of the whitelist, so a
 * traversal/unknown task is rejected at the arg boundary (before any path is built). */
const ANALYZE_SCHEMA = {
  task: z
    .enum(/** @type {[string, ...string[]]} */ (TASK_TYPES))
    .describe(
      "Which reviewed task template to run: 'summarize-window' (faithful summary of one window), " +
        "'narrate-anomalies' (plain-language narration of seq-gaps / range-crossings / step-deltas), " +
        "or 'inspection-report' (an inspection-report skeleton from binding context).",
    ),
  bundle: z
    .string()
    .optional()
    .describe(
      "Path to an existing bundle.json (packed by `node tools/analyze/bundle.js …`). Mutually " +
        "exclusive with `recording`.",
    ),
  recording: z
    .string()
    .optional()
    .describe(
      "Path to a recording .ndjson to inline-build a bundle from (the same packager the CLI uses). " +
        "Mutually exclusive with `bundle`.",
    ),
  map: z
    .string()
    .optional()
    .describe("Optional path to a binding_map.json (only with `recording`)."),
  sidecar: z
    .string()
    .optional()
    .describe("Optional path to a property sidecar JSON (only with `recording`)."),
  fromMs: z.number().optional().describe("Optional window start (ms) for inline bundling."),
  toMs: z.number().optional().describe("Optional window end (ms) for inline bundling."),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tag whitelist to select from the recording (only with `recording`)."),
  pointsPerTag: z
    .number()
    .optional()
    .describe("Optional per-tag downsample cap (positive integer) for inline bundling."),
  allowOversize: z
    .boolean()
    .optional()
    .describe(
      "Permit an inline bundle over the ~100 KB size budget (loud — narrow the window/tags first).",
    ),
};

const DESCRIPTION =
  "Run the multi-model analysis seam on twin telemetry: an OTHER (non-Anthropic) model narrates a " +
  "window of a recording, and the FRAMEWORK writes its narration as an advisory Markdown report " +
  "under reports/analysis/. ADVISORY ONLY — it applies nothing, moves no scene, gates no build; " +
  "you read the report and decide. Pick a `task` (summarize-window | narrate-anomalies | " +
  "inspection-report) and supply EITHER `bundle` (a bundle.json you already packed) OR `recording` " +
  "(+ optional map/sidecar/window/tags to inline-build it, same packager as the CLI). The worker " +
  "is configured in .xenodot.json `analysis` (or the `hermes` block); if it is unconfigured this " +
  "returns a graceful message — nothing is written. `npm run analyze` is the canonical CLI; this " +
  "is the same seam from the session. Gated (allow/deny) per call — it is a real model call + a " +
  "file write.";

/** Render a non-ok dispatch outcome as a graceful advisory (never throws). @param {Exclude<
 * import("../features/twin/analysis-dispatch.js").DispatchOutcome, { ok: true }>} o @returns {string} */
function renderFailure(o) {
  switch (o.kind) {
    case "bad-task":
      return `analyze: unknown task "${o.task}" — one of: ${TASK_TYPES.join(", ")}. No report was written.`;
    case "no-template":
      return `analyze: no task template for "${o.task}" (${o.path}). No report was written.`;
    case "select-error":
      return `analyze: ${o.error} No report was written.`;
    case "unconfigured":
      // Graceful absence (guardrail 3): a clear message pointing at setup — not a crash.
      return (
        `analyze: worker '${o.workerId}' is not configured — ${o.reason}\n` +
        "No report was written. Configure the worker in .xenodot.json `analysis` (or the `hermes` " +
        "block), then re-run."
      );
    case "worker-failed":
      return `analyze: worker '${o.workerId}' failed: ${o.error}. No report was written.`;
  }
}

/** Build the analyze tool. Deps are injectable so tests stay hermetic (real project/tasks dirs +
 * live clock by default). @param {{ projectDir?: string, tasksDir?: string, now?: () => string,
 * adapterOpts?: object }} [deps] */
export function makeAnalyzeTool(deps = {}) {
  const projectDir = deps.projectDir ?? PROJECT_DIR;
  const tasksDir = deps.tasksDir ?? path.join(TWIN_PLUGIN_DIR, "skills", "twin-analyze", "tasks");
  const now = deps.now ?? (() => new Date().toISOString());
  return tool("analyze", DESCRIPTION, ANALYZE_SCHEMA, async (input) => {
    // 1) Resolve the bundle JSON (read a prebuilt one, or inline-build from a recording). Bad input
    // is a graceful advisory, never a throw (guardrail 3's spirit at the arg boundary).
    /** @type {{ json: string, warnings: string[] }} */
    let resolved;
    try {
      resolved = resolveBundleJson({
        bundle: input.bundle,
        recording: input.recording,
        map: input.map,
        sidecar: input.sidecar,
        fromMs: input.fromMs ?? null,
        toMs: input.toMs ?? null,
        tags: input.tags ?? null,
        pointsPerTag: input.pointsPerTag ?? null,
        allowOversize: input.allowOversize ?? false,
      });
    } catch (err) {
      if (err instanceof AnalyzeInputError)
        return ok(`analyze: ${err.message} — no report was written.`);
      return ok(
        `analyze: could not prepare the bundle: ${err instanceof Error ? err.message : String(err)} — no report was written.`,
      );
    }

    // 2) Dispatch through the shared core (compose → select → run → framework writes the report).
    const outcome = await dispatchAnalysis({
      projectDir,
      tasksDir,
      task: input.task,
      bundleJson: resolved.json,
      now,
      adapterOpts: deps.adapterOpts,
    });
    return ok(outcome.ok ? summarize(outcome, resolved.warnings) : renderFailure(outcome));
  });
}
