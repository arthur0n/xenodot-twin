// node:test coverage for the analyze tool (mcp-tools/analyze-tool.js) — the mcp__ui__analyze dispatch
// surface. It wraps the SAME shared core the CLI does (features/twin/analysis-dispatch.js), so this
// suite proves the SURFACE: registration + gating, the happy path against a real in-process
// openai-compatible server (request shape + report content + the tool's advisory return), the
// inline-recording path, and each graceful-failure mode (unconfigured, bad task, bundle-not-found).
// The five seam guardrails are asserted ON this surface. GAME_DIR points at a temp dir BEFORE import
// (isolated project root) and every worker is configured via ANALYSIS_* env, so the suite is
// hermetic — no real gateway, no SDK session.
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";
import { headerLine, frameLine } from "../../../plugin-twin/tools/sim/recording.js";
import { buildBundle } from "../../../plugin-twin/tools/analyze/bundle.js";

process.env.GAME_DIR = mkdtempSync(path.join(tmpdir(), "xeno-analyze-tool-"));
const { makeAnalyzeTool } = await import("./analyze-tool.js");
const { uiControlAllow } = await import("../core/ui-control.js");
const { ANALYZE_TOOL } = await import("../core/config.js");

/** The real task-template dir (the tool composes the reviewed template + bundle). */
const TASKS_DIR = fileURLToPath(
  new URL("../../../plugin-twin/skills/twin-analyze/tasks/", import.meta.url),
);

/** First text block of a tool result. @param {unknown} r @returns {string} */
function textOf(r) {
  return /** @type {{ content: { text?: string }[] }} */ (r).content[0]?.text ?? "";
}

/** Fill the optional keys the SDK's InferShape keeps required (as `| undefined`). @param {{ task:
 * string, bundle?: string, recording?: string, map?: string, sidecar?: string, fromMs?: number,
 * toMs?: number, tags?: string[], pointsPerTag?: number, allowOversize?: boolean }} input */
function args(input) {
  return {
    bundle: undefined,
    recording: undefined,
    map: undefined,
    sidecar: undefined,
    fromMs: undefined,
    toMs: undefined,
    tags: undefined,
    pointsPerTag: undefined,
    allowOversize: undefined,
    ...input,
  };
}

/** A small but real bundle JSON written to a temp file. @param {string} dir @returns {string} path */
function writeBundle(dir) {
  const lines = [headerLine(10, 42, [{ tag: "pump.temp", min: 0, max: 100 }])];
  for (let t = 0; t < 4; t++)
    lines.push(frameLine({ t_ms: t * 100, tag: "pump.temp", value: t * 20, seq: t }));
  const { json } = buildBundle({
    recording: { name: "rec.ndjson", text: lines.join("\n") + "\n" },
  });
  const p = path.join(dir, "bundle.json");
  writeFileSync(p, json);
  return p;
}

/** Start an in-process openai-compatible server. `reply` writes the body; the resolved object exposes
 * the URL, the last captured request, and close(). @param {(res: import("node:http").ServerResponse)
 * => void} reply @returns {Promise<{ url: string, last: () => { url: string, body: string } | null,
 * close: () => Promise<void> }>} */
function startServer(reply) {
  /** @type {{ url: string, body: string } | null} */
  let last = null;
  const server = http.createServer((req, res) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    req.on("data", (/** @type {Buffer} */ c) => chunks.push(c));
    req.on("end", () => {
      last = { url: req.url ?? "", body: Buffer.concat(chunks).toString("utf8") };
      reply(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        last: () => last,
        close: () =>
          new Promise((r) => {
            server.close(() => {
              r(undefined);
            });
          }),
      });
    });
  });
}

/** Reply 200 with a chat-completions body naming `model` + `content`. @param {string} model
 * @param {string} content */
function completion(model, content) {
  return (/** @type {import("node:http").ServerResponse} */ res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model, choices: [{ message: { content } }] }));
  };
}

const ANALYSIS_ENV = ["ANALYSIS_WORKER", "ANALYSIS_API_URL", "ANALYSIS_MODEL", "ANALYSIS_API_KEY"];
beforeEach(() => {
  for (const k of ANALYSIS_ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ANALYSIS_ENV) delete process.env[k];
});

// --- registration + gating -------------------------------------------------------

test("registration: the factory builds an 'analyze' tool with a handler", () => {
  const t = makeAnalyzeTool();
  assert.equal(t.name, "analyze");
  assert.equal(typeof t.handler, "function");
});

test("gating: mcp__ui__analyze is NOT auto-allowed — it falls through to the per-call gate", () => {
  // Absence from uiControlAllow IS the consent model: like the hermes tool, every dispatch hits the
  // permission gate (a real model call + a report write), never auto-allowed.
  assert.equal(uiControlAllow(ANALYZE_TOOL, {}, "main"), null);
  assert.equal(ANALYZE_TOOL, "mcp__ui__analyze");
});

test("registration: ui-server.js registers makeAnalyzeTool in the ui MCP server", () => {
  const src = readFileSync(fileURLToPath(new URL("./ui-server.js", import.meta.url)), "utf8");
  assert.match(src, /import \{ makeAnalyzeTool \}/);
  assert.match(src, /makeAnalyzeTool\(\)/);
});

// --- happy path: prebuilt bundle → report + advisory return ----------------------

test("happy path: dispatches the composed prompt, framework writes the report, returns an advisory summary + path", async () => {
  const srv = await startServer(
    completion("served-model-x", "## Overview\n\nSteady pump temperature.\n"),
  );
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-proj-"));
  const bundlePath = writeBundle(project);
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = srv.url;
  process.env.ANALYSIS_MODEL = "requested-model";
  process.env.ANALYSIS_API_KEY = "tool-key";
  try {
    const t = makeAnalyzeTool({
      projectDir: project,
      tasksDir: TASKS_DIR,
      now: () => "2026-07-10T12:00:00.000Z",
    });
    const out = await t.handler(args({ task: "summarize-window", bundle: bundlePath }), {});
    const text = textOf(out);

    // --- request the tool sent ---
    const cap = srv.last();
    assert.ok(cap, "the endpoint was called");
    assert.equal(cap.url, "/v1/chat/completions");
    const body = /** @type {{ model: string, messages: { content: string }[] }} */ (
      parseJSON(cap.body)
    );
    assert.equal(body.model, "requested-model");
    const prompt = body.messages[0]?.content ?? "";
    assert.match(prompt, /# Task — summarize-window/); // the reviewed task template
    assert.match(prompt, /twin-analysis-bundle/); // bundle JSON appended verbatim
    assert.match(prompt, /Narrate the DATA, not a simulation/); // honesty rules embedded

    // --- report the FRAMEWORK wrote (guardrail 1: only under reports/analysis/) ---
    const reportPath = /(\/\S+\.md)/.exec(text)?.[1];
    assert.ok(reportPath, `expected a report path in the tool return: ${text}`);
    assert.equal(path.dirname(reportPath), path.join(project, "reports", "analysis"));
    assert.equal(readdirSync(path.join(project, "reports", "analysis")).length, 1);
    const report = readFileSync(reportPath, "utf8");
    // guardrail 4: provider + model + bundle hash all named in the frontmatter
    assert.match(report, /kind: twin-analysis-report/);
    assert.match(report, /task: summarize-window/);
    assert.match(report, /worker: "openai-compatible"/);
    assert.match(report, /model: "served-model-x"/);
    assert.match(report, /bundle_sha256: [0-9a-f]{64}/);
    assert.match(report, /## Overview\n\nSteady pump temperature\./); // the worker's body

    // --- the tool's return: advisory summary + path, NEVER the raw worker body (guardrail 2) ---
    assert.match(text, /Analysis complete/);
    assert.match(text, /ADVISORY input only/);
    assert.match(text, /worker=openai-compatible/);
    assert.match(text, /bundle_sha256=[0-9a-f]{64}/);
    assert.doesNotMatch(text, /Steady pump temperature/); // the narration is in the FILE, not the return
  } finally {
    await srv.close();
  }
});

// --- inline recording path -------------------------------------------------------

test("inline recording: builds a bundle from --recording then dispatches, framework writes the report", async () => {
  const srv = await startServer(completion("m", "body ok"));
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-rec-"));
  const rec = path.join(project, "day.ndjson");
  const lines = [headerLine(10, 42, [{ tag: "x", min: 0, max: 100 }])];
  for (let t = 0; t < 3; t++) lines.push(frameLine({ t_ms: t * 100, tag: "x", value: t, seq: t }));
  writeFileSync(rec, lines.join("\n") + "\n");
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = srv.url;
  process.env.ANALYSIS_MODEL = "m";
  try {
    const t = makeAnalyzeTool({
      projectDir: project,
      tasksDir: TASKS_DIR,
      now: () => "2026-07-10T00:00:00.000Z",
    });
    const out = await t.handler(args({ task: "inspection-report", recording: rec }), {});
    const text = textOf(out);
    assert.match(text, /Analysis complete/);
    const reportPath = /(\/\S+inspection-report\.md)/.exec(text)?.[1];
    assert.ok(reportPath, `expected an inspection-report path: ${text}`);
    assert.ok(existsSync(reportPath));
  } finally {
    await srv.close();
  }
});

// --- graceful failure modes (guardrail 3 + path safety) --------------------------

test("unconfigured worker: graceful tool result, no crash, no report written", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-unconf-"));
  const bundlePath = writeBundle(project);
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = ""; // explicitly blank → unconfigured
  process.env.ANALYSIS_MODEL = "";
  const t = makeAnalyzeTool({ projectDir: project, tasksDir: TASKS_DIR });
  const out = await t.handler(args({ task: "summarize-window", bundle: bundlePath }), {});
  const text = textOf(out);
  assert.match(text, /worker 'openai-compatible' is not configured/);
  assert.match(text, /analysis\.apiUrl is not set/);
  assert.match(text, /No report was written/);
  assert.equal(existsSync(path.join(project, "reports", "analysis")), false);
});

test("unconfigured hermes worker: 'Hermes is off' graceful message, no report", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-hermes-"));
  const bundlePath = writeBundle(project);
  process.env.ANALYSIS_WORKER = "hermes";
  process.env.HERMES_ENABLED = "false";
  try {
    const t = makeAnalyzeTool({ projectDir: project, tasksDir: TASKS_DIR });
    const out = await t.handler(args({ task: "narrate-anomalies", bundle: bundlePath }), {});
    assert.match(textOf(out), /worker 'hermes' is not configured/);
    assert.match(textOf(out), /Hermes is off/);
    assert.equal(existsSync(path.join(project, "reports", "analysis")), false);
  } finally {
    delete process.env.HERMES_ENABLED;
  }
});

test("task whitelist (zod enum): traversal/unknown tasks are rejected at the arg boundary", () => {
  // The real production gate: the SDK validates input against the tool's zod schema before the
  // handler ever runs. A traversal string or an unknown task fails the enum — a bad task can never
  // reach path construction.
  const enumField = makeAnalyzeTool().inputSchema.task;
  assert.equal(enumField.safeParse("../../etc/passwd").success, false);
  assert.equal(enumField.safeParse("make-stuff-up").success, false);
  assert.equal(enumField.safeParse("summarize-window").success, true);
});

test("task whitelist (defence in depth): a non-whitelist task is a graceful no-op — no dispatch, no path built", async () => {
  // If a bad task somehow bypassed the enum, the shared core's guard + the report writer's whitelist
  // stop it BEFORE any worker call or path build (guardrail 1's path safety).
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-badtask-"));
  const bundlePath = writeBundle(project);
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = "http://127.0.0.1:1";
  process.env.ANALYSIS_MODEL = "m";
  const t = makeAnalyzeTool({ projectDir: project, tasksDir: TASKS_DIR });
  const out = await t.handler(args({ task: "../../etc/passwd", bundle: bundlePath }), {});
  assert.match(textOf(out), /unknown task "\.\.\/\.\.\/etc\/passwd"/);
  assert.match(textOf(out), /No report was written/);
  assert.equal(existsSync(path.join(project, "reports", "analysis")), false);
});

test("bundle-not-found: graceful tool result, no report written", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-nobundle-"));
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = "http://127.0.0.1:1";
  process.env.ANALYSIS_MODEL = "m";
  const t = makeAnalyzeTool({ projectDir: project, tasksDir: TASKS_DIR });
  const out = await t.handler(
    args({ task: "summarize-window", bundle: path.join(project, "does-not-exist.json") }),
    {},
  );
  assert.match(textOf(out), /could not read --bundle/);
  assert.match(textOf(out), /no report was written/);
  assert.equal(existsSync(path.join(project, "reports", "analysis")), false);
});

test("guardrail (adapters fs-unreachable): the worker adapter module this surface dispatches through imports no node:fs / node:child_process", () => {
  // This surface routes through the SAME worker adapters as the CLI (features/twin/analysis.js). That
  // module must stay free of disk/process access (guardrails 1 + 5) — the FRAMEWORK writes the report,
  // the worker only returns a string. (The shared dispatch core DOES read files — it is the framework
  // side, not a worker — so this assertion targets the adapter module, greppably.)
  const src = readFileSync(
    fileURLToPath(new URL("../features/twin/analysis.js", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(src, /from\s+["']node:fs["']/);
  assert.doesNotMatch(src, /from\s+["']node:child_process["']/);
  assert.doesNotMatch(src, /require\(["']node:(fs|child_process)["']\)/);
});

test("bad input: both --bundle and --recording is a graceful rejection", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-tool-both-"));
  const bundlePath = writeBundle(project);
  process.env.ANALYSIS_WORKER = "openai-compatible";
  process.env.ANALYSIS_API_URL = "http://127.0.0.1:1";
  process.env.ANALYSIS_MODEL = "m";
  const t = makeAnalyzeTool({ projectDir: project, tasksDir: TASKS_DIR });
  const out = await t.handler(
    args({ task: "summarize-window", bundle: bundlePath, recording: bundlePath }),
    {},
  );
  assert.match(textOf(out), /pass either --bundle or --recording, not both/);
});
