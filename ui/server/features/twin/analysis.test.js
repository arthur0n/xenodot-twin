// analysis.test.js — the worker adapters (features/twin/analysis.js). The openai-compatible adapter
// is exercised against a real in-process node:http server (asserting request shape + every error
// path); the hermes adapter is exercised against a stubbed globalThis.fetch (the module seam the
// repo mocks the runs-API at, see mcp-tools/hermes-tool.test.js). Also a static guardrail: the
// adapter module imports NO node:fs / node:child_process — workers return strings, never touch disk.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../../lib/json.js";
import {
  openAiCompatibleAdapter,
  hermesAdapter,
  chatCompletionsUrl,
  selectWorker,
} from "./analysis.js";
import { modelsUrl } from "./analysis-check.js";

/** @typedef {{ method: string, url: string, headers: import("node:http").IncomingHttpHeaders, body: string }} Captured */

/** Start an in-process HTTP server. `handler(req, capturedBody, res)` writes the reply; the resolved
 * object exposes the base URL, the last captured request, and a close(). @param {(cap: Captured, res:
 * import("node:http").ServerResponse) => void} handler
 * @returns {Promise<{ url: string, last: () => Captured | null, close: () => Promise<void> }>} */
function startServer(handler) {
  /** @type {Captured | null} */
  let last = null;
  const server = http.createServer((req, res) => {
    const chunks = /** @type {Buffer[]} */ ([]);
    req.on("data", (/** @type {Buffer} */ c) => chunks.push(c));
    req.on("end", () => {
      last = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      handler(last, res);
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
          new Promise((r) =>
            server.close(() => {
              r();
            }),
          ),
      });
    });
  });
}

/** Reply with a JSON body + status. @param {import("node:http").ServerResponse} res @param {number}
 * status @param {unknown} payload */
function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// --- openai-compatible: request shape + success ---------------------------------

test("openai-compatible: posts to /v1/chat/completions with bearer + correct body; returns output+model", async () => {
  const srv = await startServer((_cap, res) => {
    json(res, 200, {
      model: "server-model-x",
      choices: [{ message: { role: "assistant", content: "the narration body" } }],
    });
  });
  try {
    const adapter = openAiCompatibleAdapter({
      apiUrl: srv.url,
      apiKey: "secret-key",
      model: "requested-model",
    });
    assert.equal(adapter.configured(), true);
    const result = await adapter.analyze({ instructions: "PROMPT TEXT" });
    // asserted request shape
    const cap = srv.last();
    assert.ok(cap);
    assert.equal(cap.method, "POST");
    assert.equal(cap.url, "/v1/chat/completions");
    assert.equal(cap.headers.authorization, "Bearer secret-key");
    const body =
      /** @type {{ model: string, messages: Array<{ role: string, content: string }> }} */ (
        parseJSON(cap.body)
      );
    assert.equal(body.model, "requested-model");
    assert.deepEqual(body.messages, [{ role: "user", content: "PROMPT TEXT" }]);
    // result: output is a STRING (guardrail — worker returns a string, no disk write)
    assert.equal(typeof result.output, "string");
    assert.equal(result.output, "the narration body");
    assert.equal(result.model, "server-model-x");
  } finally {
    await srv.close();
  }
});

test("openai-compatible: no bearer header when apiKey is null (local endpoints)", async () => {
  const srv = await startServer((_cap, res) => {
    json(res, 200, { choices: [{ message: { content: "ok" } }] });
  });
  try {
    const adapter = openAiCompatibleAdapter({ apiUrl: srv.url, apiKey: null, model: "m" });
    const result = await adapter.analyze({ instructions: "x" });
    assert.equal(srv.last()?.headers.authorization, undefined);
    // model falls back to the requested model when the reply omits it
    assert.equal(result.model, "m");
  } finally {
    await srv.close();
  }
});

test("openai-compatible: non-200 throws with the status", async () => {
  const srv = await startServer((_cap, res) => {
    json(res, 503, { error: "overloaded" });
  });
  try {
    const adapter = openAiCompatibleAdapter({ apiUrl: srv.url, apiKey: null, model: "m" });
    await assert.rejects(adapter.analyze({ instructions: "x" }), /got 503/);
  } finally {
    await srv.close();
  }
});

test("openai-compatible: malformed (non-JSON) body throws a clear error", async () => {
  const srv = await startServer((_cap, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("this is not json <<<");
  });
  try {
    const adapter = openAiCompatibleAdapter({ apiUrl: srv.url, apiKey: null, model: "m" });
    await assert.rejects(adapter.analyze({ instructions: "x" }), /non-JSON response/);
  } finally {
    await srv.close();
  }
});

test("openai-compatible: a well-formed reply with no message content throws", async () => {
  const srv = await startServer((_cap, res) => {
    json(res, 200, { choices: [{}] });
  });
  try {
    const adapter = openAiCompatibleAdapter({ apiUrl: srv.url, apiKey: null, model: "m" });
    await assert.rejects(adapter.analyze({ instructions: "x" }), /no message content/);
  } finally {
    await srv.close();
  }
});

test("openai-compatible: a hanging server trips the timeout", async () => {
  // Handler never replies → the adapter's short timeout aborts the fetch.
  const srv = await startServer(() => {});
  try {
    const adapter = openAiCompatibleAdapter(
      { apiUrl: srv.url, apiKey: null, model: "m" },
      { timeoutMs: 120 },
    );
    await assert.rejects(adapter.analyze({ instructions: "x" }), /timed out after 120ms/);
  } finally {
    await srv.close();
  }
});

test("openai-compatible: configured() names the missing setting", () => {
  assert.match(
    String(openAiCompatibleAdapter({ apiUrl: null, apiKey: null, model: "m" }).configured()),
    /analysis\.apiUrl is not set/,
  );
  assert.match(
    String(openAiCompatibleAdapter({ apiUrl: "http://x", apiKey: null, model: null }).configured()),
    /analysis\.model is not set/,
  );
});

test("chatCompletionsUrl: appends /v1/chat/completions to a base, leaves a full endpoint as-is", () => {
  assert.equal(chatCompletionsUrl("http://host:11434"), "http://host:11434/v1/chat/completions");
  assert.equal(chatCompletionsUrl("http://host/api/"), "http://host/api/v1/chat/completions");
  assert.equal(
    chatCompletionsUrl("https://x.ai/v1/chat/completions"),
    "https://x.ai/v1/chat/completions",
  );
});

test("chatCompletionsUrl: a /v1-terminated base (OpenRouter/vLLM documented form) never doubles /v1", () => {
  assert.equal(
    chatCompletionsUrl("https://openrouter.ai/api/v1"),
    "https://openrouter.ai/api/v1/chat/completions",
  );
  assert.equal(chatCompletionsUrl("http://host:8000/v1/"), "http://host:8000/v1/chat/completions");
});

test("modelsUrl (probe): mirrors the /v1 rule — no /v1/v1/models from a /v1-terminated base", () => {
  assert.equal(modelsUrl("https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1/models");
  assert.equal(modelsUrl("http://host:8000/v1/"), "http://host:8000/v1/models");
  assert.equal(modelsUrl("http://host:11434"), "http://host:11434/v1/models");
});

test("openai-compatible: a /v1-terminated apiUrl posts to /v1/chat/completions (not /v1/v1/…)", async () => {
  const srv = await startServer((_cap, res) => {
    json(res, 200, { choices: [{ message: { content: "ok" } }] });
  });
  try {
    const adapter = openAiCompatibleAdapter({ apiUrl: `${srv.url}/v1`, apiKey: null, model: "m" });
    await adapter.analyze({ instructions: "x" });
    assert.equal(srv.last()?.url, "/v1/chat/completions");
  } finally {
    await srv.close();
  }
});

// --- hermes adapter: reuses the runs-API bridge, faked at globalThis.fetch --------

test("hermes: creates a run then polls to completion, returning the findings + hermes model", async () => {
  /** @type {{ url: string, body: string }[]} */
  const calls = [];
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      (/** @type {string} */ url, /** @type {{ body?: string }} */ init) => {
        calls.push({ url, body: init?.body ?? "" });
        if (url.endsWith("/v1/runs"))
          return Promise.resolve(
            /** @type {Response} */ (
              /** @type {unknown} */ ({
                ok: true,
                status: 200,
                statusText: "OK",
                text: () => Promise.resolve(JSON.stringify({ run_id: "run-123" })),
              })
            ),
          );
        // GET /v1/runs/run-123 → completed
        return Promise.resolve(
          /** @type {Response} */ (
            /** @type {unknown} */ ({
              ok: true,
              status: 200,
              statusText: "OK",
              text: () =>
                Promise.resolve(JSON.stringify({ status: "completed", output: "HERMES FINDINGS" })),
            })
          ),
        );
      }
    )
  );
  const adapter = hermesAdapter(
    { enabled: true, apiUrl: "http://hermes.test///", apiKey: "k-server", model: "hermes-4-70b" },
    { pollIntervalMs: 5, wallclockMs: 5000 },
  );
  assert.equal(adapter.configured(), true);
  const result = await adapter.analyze({ instructions: "ANALYZE THIS" });
  assert.equal(result.output, "HERMES FINDINGS");
  assert.equal(result.model, "hermes-4-70b");
  // POST carried the composed prompt as the run input (slash-stripped base)
  assert.equal(calls[0]?.url, "http://hermes.test/v1/runs");
  const postBody = /** @type {{ input: string, instructions: string }} */ (
    parseJSON(calls[0].body)
  );
  assert.equal(postBody.input, "ANALYZE THIS");
  assert.match(postBody.instructions, /Narrate ONLY what the data shows/);
});

test("hermes: configured() reports off / missing url / missing key", () => {
  assert.match(
    String(hermesAdapter({ enabled: false, apiUrl: "u", apiKey: "k", model: "m" }).configured()),
    /Hermes is off/,
  );
  assert.match(
    String(hermesAdapter({ enabled: true, apiUrl: null, apiKey: "k", model: "m" }).configured()),
    /no API URL/,
  );
  assert.match(
    String(hermesAdapter({ enabled: true, apiUrl: "u", apiKey: null, model: "m" }).configured()),
    /no API key/,
  );
});

// --- selectWorker: registry + unknown-id error -----------------------------------

test("selectWorker: builds the configured adapter; unknown id is a clean error", () => {
  const okSel = selectWorker({
    analysisCfg: { worker: "openai-compatible", apiUrl: "http://x", apiKey: null, model: "m" },
    hermesCfg: { enabled: false, apiUrl: null, apiKey: null, model: "h" },
  });
  assert.equal(okSel.ok, true);
  assert.equal(okSel.ok && okSel.worker.id, "openai-compatible");

  const bad = selectWorker({
    analysisCfg: { worker: "nope", apiUrl: null, apiKey: null, model: null },
    hermesCfg: { enabled: false, apiUrl: null, apiKey: null, model: "h" },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.ok === false && /Unknown analysis worker "nope"/.test(bad.error), true);
});

// --- guardrail: the adapter module never imports fs / child_process --------------

test("guardrail: analysis.js + hermes-runs.js import no node:fs / node:child_process", () => {
  for (const rel of ["./analysis.js", "../../integrations/hermes/hermes-runs.js"]) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    // Match real import/require statements, not the words in a comment.
    assert.doesNotMatch(src, /from\s+["']node:fs["']/, `${rel} must not import node:fs`);
    assert.doesNotMatch(
      src,
      /from\s+["']node:child_process["']/,
      `${rel} must not import node:child_process`,
    );
    assert.doesNotMatch(
      src,
      /require\(["']node:(fs|child_process)["']\)/,
      `${rel} must not require fs/cp`,
    );
  }
});
