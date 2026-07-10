// analyze-cli.test.js — the `npm run analyze` dispatch CLI, driven end-to-end as a spawned process
// (the real config → worker → report-writer path). A real in-process node:http server stands in for
// the openai-compatible endpoint: the success case asserts the request the CLI sent (model + the
// composed prompt = task template + bundle JSON) AND the report file the FRAMEWORK wrote. The
// unconfigured cases assert the graceful-absence message + nonzero exit (the hermes:check precedent).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../../lib/json.js";
import { headerLine, frameLine } from "../../../../plugin/tools/sim/recording.js";
import { buildBundle } from "../../../../plugin/tools/analyze/bundle.js";

const CLI = fileURLToPath(new URL("./analyze-cli.js", import.meta.url));
const FRAMEWORK_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Run the CLI with an env overlay. @param {string[]} argv @param {Record<string, string>} env
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} */
function runCli(argv, env) {
  return new Promise((resolve) => {
    execFile(
      "node",
      [CLI, ...argv],
      { cwd: FRAMEWORK_ROOT, env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === "number" ? err.code : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

/** A small but real bundle JSON written to a temp file. @param {string} dir @returns {string} path */
function writeBundle(dir) {
  const tags = [{ tag: "pump.temp", min: 0, max: 100 }];
  const lines = [headerLine(10, 42, tags)];
  for (let t = 0; t < 4; t++)
    lines.push(frameLine({ t_ms: t * 100, tag: "pump.temp", value: t * 20, seq: t }));
  const { json } = buildBundle({
    recording: { name: "rec.ndjson", text: lines.join("\n") + "\n" },
  });
  const p = path.join(dir, "bundle.json");
  writeFileSync(p, json);
  return p;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("analyze CLI: full cycle — posts the composed prompt, framework writes the report", async () => {
  /** @type {{ url: string, body: string } | null} */
  let captured = null;
  const server = http.createServer((req, res) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    req.on("data", (/** @type {Buffer} */ c) => chunks.push(c));
    req.on("end", () => {
      captured = { url: req.url ?? "", body: Buffer.concat(chunks).toString("utf8") };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          model: "test-model-served",
          choices: [{ message: { content: "## Overview\n\nSteady pump temperature.\n" } }],
        }),
      );
    });
  });
  await new Promise((r) =>
    server.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  const project = mkdtempSync(path.join(tmpdir(), "analyze-cli-proj-"));
  const bundlePath = writeBundle(project);
  try {
    const { code, stdout, stderr } = await runCli(
      ["--task", "summarize-window", "--bundle", bundlePath],
      {
        GAME_DIR: project,
        ANALYSIS_WORKER: "openai-compatible",
        ANALYSIS_API_URL: `http://127.0.0.1:${port}`,
        ANALYSIS_MODEL: "requested-model",
        ANALYSIS_API_KEY: "cli-key",
      },
    );
    assert.equal(code, 0, `CLI failed: ${stderr}`);

    // --- request the CLI sent ---
    assert.ok(captured, "the endpoint was called");
    const cap = /** @type {{ url: string, body: string }} */ (captured);
    assert.equal(cap.url, "/v1/chat/completions");
    const body = /** @type {{ model: string, messages: Array<{ content: string }> }} */ (
      parseJSON(cap.body)
    );
    assert.equal(body.model, "requested-model");
    const prompt = body.messages[0]?.content ?? "";
    assert.match(prompt, /# Task — summarize-window/); // the task template
    assert.match(prompt, /twin-analysis-bundle/); // the bundle JSON, appended verbatim
    assert.match(prompt, /Narrate the DATA, not a simulation/); // honesty rules embedded

    // --- report the FRAMEWORK wrote ---
    const written = /wrote (\S+\.md)/.exec(stdout)?.[1];
    assert.ok(written, `expected a report path in stdout: ${stdout}`);
    const reportPath = /** @type {string} */ (written);
    // it landed ONLY under reports/analysis/
    assert.equal(
      path.dirname(reportPath),
      path.join(project, "reports", "analysis"),
      "report must land under reports/analysis/",
    );
    assert.deepEqual(readdirSync(path.join(project, "reports", "analysis")).length, 1);
    const report = readFileSync(reportPath, "utf8");
    assert.match(report, /kind: twin-analysis-report/);
    assert.match(report, /task: summarize-window/);
    assert.match(report, /worker: "openai-compatible"/);
    assert.match(report, new RegExp(`provider: "127\\.0\\.0\\.1:${port}"`));
    assert.match(report, /model: "test-model-served"/); // the model the endpoint reported
    assert.match(report, /bundle_sha256: [0-9a-f]{64}/);
    assert.match(report, /window: \{ from_ms: 0, to_ms: 300 \}/);
    assert.match(report, /created_at: \d{4}-\d{2}-\d{2}T/);
    assert.match(report, /## Overview\n\nSteady pump temperature\./); // the worker's body
  } finally {
    await new Promise((r) =>
      server.close(() => {
        r(undefined);
      }),
    );
  }
});

test("analyze CLI: unconfigured openai-compatible → graceful message + exit 1, no report", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-cli-unconf-"));
  const bundlePath = writeBundle(project);
  const { code, stderr } = await runCli(["--task", "summarize-window", "--bundle", bundlePath], {
    GAME_DIR: project,
    ANALYSIS_WORKER: "openai-compatible",
    ANALYSIS_API_URL: "", // explicitly blank → unconfigured
    ANALYSIS_MODEL: "",
  });
  assert.equal(code, 1);
  assert.match(stderr, /worker 'openai-compatible' is not configured/);
  assert.match(stderr, /analysis\.apiUrl is not set/);
  assert.match(stderr, /No report was written/);
  // nothing under reports/analysis/
  assert.throws(() => readdirSync(path.join(project, "reports", "analysis")));
});

test("analyze CLI: unconfigured hermes worker → 'Hermes is off' + exit 1", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-cli-hermes-"));
  const bundlePath = writeBundle(project);
  const { code, stderr } = await runCli(["--task", "narrate-anomalies", "--bundle", bundlePath], {
    GAME_DIR: project,
    ANALYSIS_WORKER: "hermes",
    HERMES_ENABLED: "false",
  });
  assert.equal(code, 1);
  assert.match(stderr, /worker 'hermes' is not configured/);
  assert.match(stderr, /Hermes is off/);
});

test("analyze CLI: an unknown --task is rejected before any dispatch", async () => {
  const project = mkdtempSync(path.join(tmpdir(), "analyze-cli-badtask-"));
  const bundlePath = writeBundle(project);
  const { code, stderr } = await runCli(["--task", "make-stuff-up", "--bundle", bundlePath], {
    GAME_DIR: project,
    ANALYSIS_WORKER: "openai-compatible",
    ANALYSIS_API_URL: "http://127.0.0.1:1",
    ANALYSIS_MODEL: "m",
  });
  assert.equal(code, 1);
  assert.match(stderr, /unknown --task "make-stuff-up"/);
});

test("analyze CLI: --recording inline-bundles then dispatches (no pre-built bundle)", async () => {
  let called = false;
  const server = http.createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      called = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "m", choices: [{ message: { content: "body ok" } }] }));
    });
  });
  await new Promise((r) =>
    server.listen(0, "127.0.0.1", () => {
      r(undefined);
    }),
  );
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const project = mkdtempSync(path.join(tmpdir(), "analyze-cli-rec-"));
  const rec = path.join(project, "day.ndjson");
  const lines = [headerLine(10, 42, [{ tag: "x", min: 0, max: 100 }])];
  for (let t = 0; t < 3; t++) lines.push(frameLine({ t_ms: t * 100, tag: "x", value: t, seq: t }));
  writeFileSync(rec, lines.join("\n") + "\n");
  try {
    const { code, stdout, stderr } = await runCli(
      ["--task", "inspection-report", "--recording", rec],
      {
        GAME_DIR: project,
        ANALYSIS_WORKER: "openai-compatible",
        ANALYSIS_API_URL: `http://127.0.0.1:${port}`,
        ANALYSIS_MODEL: "m",
      },
    );
    assert.equal(code, 0, stderr);
    assert.equal(called, true);
    assert.match(stdout, /wrote .*inspection-report\.md/);
  } finally {
    await new Promise((r) =>
      server.close(() => {
        r(undefined);
      }),
    );
  }
});
