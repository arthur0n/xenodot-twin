// analysis-report.test.js — the framework-side report writer (features/twin/analysis-report.js):
// path safety (task validated against the whitelist, no traversal from a hostile task name), the
// report lands ONLY under reports/analysis/, frontmatter completeness (every required field incl.
// provider+model+bundle hash), and the pure prompt composer. created_at is injected so the suite is
// hermetic (the report is an artifact, not a golden file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  TASK_TYPES,
  isValidTask,
  sha256Hex,
  composeInstructions,
  buildFrontmatter,
  writeAnalysisReport,
} from "./analysis-report.js";

const CREATED_AT = "2026-07-09T13:45:30.000Z";

/** A complete writeAnalysisReport arg over a temp project. @param {Partial<Parameters<typeof
 * writeAnalysisReport>[0]>} [over] */
function args(over = {}) {
  const projectDir = mkdtempSync(path.join(tmpdir(), "analysis-report-"));
  return {
    projectDir,
    task: "summarize-window",
    workerId: "openai-compatible",
    provider: "openrouter.ai",
    model: "some-model-v2",
    bundleSha256: "a".repeat(64),
    window: { from_ms: 0, to_ms: 900 },
    body: "## Overview\n\nThe window shows steady values.\n",
    createdAt: CREATED_AT,
    ...over,
  };
}

test("writeAnalysisReport: lands at reports/analysis/<date>-<task>.md under the project", () => {
  const a = args();
  const out = writeAnalysisReport(a);
  assert.equal(out.filename, "2026-07-09-summarize-window.md");
  assert.equal(out.path, path.join(a.projectDir, "reports", "analysis", out.filename));
  assert.ok(existsSync(out.path));
  // and NOWHERE else — the only file under the project is the one report
  assert.equal(out.dir, path.join(a.projectDir, "reports", "analysis"));
});

test("writeAnalysisReport: frontmatter carries every required field", () => {
  const a = args();
  const out = writeAnalysisReport(a);
  const text = readFileSync(out.path, "utf8");
  assert.match(text, /^---\n/);
  assert.match(text, /\nkind: twin-analysis-report\n/);
  assert.match(text, /\ntask: summarize-window\n/);
  assert.match(text, /\nworker: openai-compatible\n/);
  assert.match(text, /\nprovider: openrouter\.ai\n/);
  assert.match(text, /\nmodel: some-model-v2\n/);
  assert.match(text, new RegExp(`\\nbundle_sha256: ${"a".repeat(64)}\\n`));
  assert.match(text, /\nwindow: \{ from_ms: 0, to_ms: 900 \}\n/);
  assert.match(text, /\ncreated_at: 2026-07-09T13:45:30\.000Z\n/);
  // body follows the closing fence, verbatim
  assert.match(text, /---\n\n## Overview\n\nThe window shows steady values\.\n$/);
});

test("writeAnalysisReport: a null window renders from_ms/to_ms as null", () => {
  const out = writeAnalysisReport(args({ window: { from_ms: null, to_ms: null } }));
  assert.match(readFileSync(out.path, "utf8"), /\nwindow: \{ from_ms: null, to_ms: null \}\n/);
});

test("writeAnalysisReport: rejects an unknown/hostile task name (no path traversal)", () => {
  // A traversal attempt as the task must be refused BEFORE any write — it isn't in TASK_TYPES.
  assert.throws(() => writeAnalysisReport(args({ task: "../../etc/passwd" })), /unknown task type/);
  assert.throws(
    () => writeAnalysisReport(args({ task: "summarize-window/../x" })),
    /unknown task type/,
  );
  assert.throws(() => writeAnalysisReport(args({ task: "not-a-task" })), /unknown task type/);
});

test("writeAnalysisReport: rejects a non-ISO created_at", () => {
  assert.throws(() => writeAnalysisReport(args({ createdAt: "not-a-date" })), /ISO-8601/);
});

test("isValidTask + TASK_TYPES: exactly the three v1 tasks", () => {
  assert.deepEqual(TASK_TYPES, ["narrate-anomalies", "summarize-window", "inspection-report"]);
  assert.equal(isValidTask("narrate-anomalies"), true);
  assert.equal(isValidTask("../../evil"), false);
});

test("buildFrontmatter: stable key order + closing delimiters", () => {
  const fm = buildFrontmatter({
    task: "inspection-report",
    workerId: "hermes",
    provider: "hermes",
    model: "hermes-4-70b",
    bundleSha256: "b".repeat(64),
    window: { from_ms: 100, to_ms: 200 },
    createdAt: CREATED_AT,
  });
  const lines = fm.split("\n");
  assert.equal(lines[0], "---");
  assert.equal(lines[1], "kind: twin-analysis-report");
  assert.equal(lines.at(-1), "---");
});

test("sha256Hex: matches node crypto for a known string", () => {
  // sha256("") — the empty-string digest is a well-known constant.
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("composeInstructions: appends the bundle JSON verbatim after the template, fenced", () => {
  const template = "# Task\n\nrole + honesty rules\n";
  const bundleJson = '{\n  "kind": "twin-analysis-bundle"\n}\n';
  const out = composeInstructions({ template, bundleJson });
  assert.match(out, /# Task\n\nrole \+ honesty rules/);
  assert.match(out, /```json\n\{\n {2}"kind": "twin-analysis-bundle"\n\}\n```/);
  // the bundle bytes appear verbatim inside the fence
  assert.ok(out.includes(bundleJson.trimEnd()));
});
