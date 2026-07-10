// Analysis report writer — Contract 2 (report-out). The FRAMEWORK writes the report, never the
// worker: a worker returns only a body string; this module wraps it in provenance frontmatter and
// drops it under `reports/analysis/` in the project, and nowhere else (guardrails 1 + 4). See
// plugin-twin/skills/twin-analyze/references/report-format.md — this implements that contract.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/** The v1 task types. A report's `task` MUST be one of these — it is validated before any write, so
 * a stray/hostile task name can never traverse out of `reports/analysis/` (the filename is
 * `<date>-<task>.md` and `<task>` is whitelisted here). */
export const TASK_TYPES = ["narrate-anomalies", "summarize-window", "inspection-report"];

/** The only directory a report may land in, relative to the project root. */
export const REPORTS_DIR_PARTS = ["reports", "analysis"];

/** sha256 of a UTF-8 string (hex). @param {string} text @returns {string} */
export function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** True when `task` is a known task type. @param {string} task @returns {boolean} */
export function isValidTask(task) {
  return TASK_TYPES.includes(task);
}

/** Compose the worker prompt: the reviewed task template followed by the bundle JSON appended
 * VERBATIM (fenced so a chat-UI paste renders it). Pure + deterministic given its inputs.
 * @param {{ template: string, bundleJson: string }} arg @returns {string} */
export function composeInstructions({ template, bundleJson }) {
  return (
    `${template.trimEnd()}\n\n` +
    "--- ANALYSIS BUNDLE (verbatim JSON — the ONLY source of numbers) ---\n\n" +
    "```json\n" +
    `${bundleJson.trimEnd()}\n` +
    "```\n"
  );
}

/** Render a number-or-null for the YAML window inline map. @param {number | null} n @returns {string} */
const numOrNull = (n) => (typeof n === "number" ? String(n) : "null");

/** Encode an UNTRUSTED scalar for YAML: JSON-encode it (YAML is a JSON superset, so a JSON string
 * is one well-formed double-quoted YAML scalar). `model` comes back from the endpoint's own
 * response body — a newline or a `: ` inside it must not break or inject frontmatter (guardrail 4).
 * @param {string} s @returns {string} */
const yamlStr = (s) => JSON.stringify(s);

/** Build the machine-readable frontmatter block (report-format.md). Worker/provider-influenced
 * scalars (worker, provider, model) are JSON-encoded; `task` is whitelisted (TASK_TYPES) and the
 * hash is hex, so they stay plain. @param {{ task: string, workerId: string, provider: string,
 * model: string, bundleSha256: string, window: { from_ms: number | null, to_ms: number | null },
 * createdAt: string }} f @returns {string} */
export function buildFrontmatter(f) {
  return [
    "---",
    "kind: twin-analysis-report",
    `task: ${f.task}`,
    `worker: ${yamlStr(f.workerId)}`,
    `provider: ${yamlStr(f.provider)}`,
    `model: ${yamlStr(f.model)}`,
    `bundle_sha256: ${f.bundleSha256}`,
    `window: { from_ms: ${numOrNull(f.window.from_ms)}, to_ms: ${numOrNull(f.window.to_ms)} }`,
    `created_at: ${f.createdAt}`,
    "---",
  ].join("\n");
}

/** The date segment (YYYY-MM-DD) of an ISO-8601 timestamp. @param {string} iso @returns {string} */
function isoDate(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(iso);
  if (!m?.[1]) throw new Error(`created_at must be an ISO-8601 timestamp (got '${iso}')`);
  return m[1];
}

/** Write an analysis report to `<projectDir>/reports/analysis/<date>-<task>.md`. The framework owns
 * this write; the worker supplied only `body`. `createdAt` is injectable so tests stay hermetic (the
 * report is an artifact, not a golden file — a real run uses a live timestamp). Returns the absolute
 * path written. @param {{ projectDir: string, task: string, workerId: string, provider: string,
 * model: string, bundleSha256: string, window: { from_ms: number | null, to_ms: number | null },
 * body: string, createdAt: string }} arg @returns {{ path: string, filename: string, dir: string }} */
export function writeAnalysisReport(arg) {
  if (!isValidTask(arg.task))
    throw new Error(
      `unknown task type "${arg.task}" — one of: ${TASK_TYPES.join(", ")} (guards the report path)`,
    );
  const date = isoDate(arg.createdAt);
  const filename = `${date}-${arg.task}.md`;
  // Defence in depth: the filename is built only from a validated task + a digit/dash date, so it can
  // never contain a path separator — assert it anyway before touching the filesystem.
  if (filename.includes("/") || filename.includes("\\") || filename.includes(".."))
    throw new Error(`refusing to write an unsafe report filename: ${filename}`);
  const dir = path.join(arg.projectDir, ...REPORTS_DIR_PARTS);
  mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, filename);
  const frontmatter = buildFrontmatter({
    task: arg.task,
    workerId: arg.workerId,
    provider: arg.provider,
    model: arg.model,
    bundleSha256: arg.bundleSha256,
    window: arg.window,
    createdAt: arg.createdAt,
  });
  writeFileSync(outPath, `${frontmatter}\n\n${arg.body.trimEnd()}\n`);
  return { path: outPath, filename, dir };
}
