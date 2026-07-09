// Analysis worker adapters — the swappable "other model" half of the analysis seam. Each adapter is
// a thin object `{ id, configured(), analyze({instructions}) }` that takes a fully-composed prompt
// string (task template + honesty rules + bundle JSON) and returns `{ output, model }`. The worker
// NEVER touches the filesystem: it returns a string and nothing else (guardrail 1 — the framework's
// report writer owns every write). This module is deliberately free of `node:fs`/`node:child_process`
// so that guarantee is greppable.
//
// Two adapters ship in v1:
//   • openai-compatible — one `/v1/chat/completions` POST covering OpenRouter, local llama.cpp/Ollama,
//     vLLM, and most hosted models. Config: `.xenodot.json` `analysis` block (or ANALYSIS_* env).
//   • hermes — reuses the Hermes runs-API bridge (integrations/hermes/hermes-runs.js): POST a run,
//     poll it to completion, return the findings. Connection comes from the `hermes` config block.
//
// Graceful absence (guardrail 3): an unconfigured worker's `configured()` returns a reason STRING
// (never throws) so the CLI can print it and exit cleanly.
import { getAnalysisConfig, getHermesConfig } from "../../core/config.js";
import { baseOf, createRun, runToCompletion } from "../../integrations/hermes/hermes-runs.js";

/** @typedef {{ output: string, model: string }} AnalyzeResult */
/** An analysis worker adapter. `configured()` returns `true` when ready, else a human reason string.
 * `analyze` takes the composed prompt and resolves to the worker's narration + the model that wrote it.
 * @typedef {{
 *   id: string,
 *   configured: () => true | string,
 *   analyze: (arg: { instructions: string }) => Promise<AnalyzeResult>,
 * }} AnalysisWorker */

/** Default per-request timeout for the openai-compatible POST (analysis prompts are long; a slow
 * local model still finishes well under this). */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** How long to wait for a Hermes run to be ACCEPTED (the POST returns fast). */
export const HERMES_CREATE_TIMEOUT_MS = 30_000;
/** Wall-clock cap on a Hermes analysis run before it is stopped (findings drafting is bounded). */
export const HERMES_WALLCLOCK_MS = 15 * 60_000;

/** System framing layered onto a Hermes analysis run — the task template in the `input` carries the
 * full honesty rules + structure; this reaffirms them and pins the "final message = report body"
 * contract Hermes runs headless under. */
const HERMES_INSTRUCTIONS =
  "You are analyzing digital-twin telemetry for the Xenodot analysis seam. Narrate ONLY what the " +
  "data shows — never claim a physics simulation, a solver, or a live sensor unless the bundle says " +
  "so; it is telemetry being summarized. Every number you cite must come from the bundle's stats or " +
  "series. Your FINAL message IS the entire report body — no preamble, no questions back. Follow the " +
  "task instructions in the input exactly.";

/** Resolve the chat-completions endpoint from a configured base URL. Convention matches the other
 * integrations (Hermes treats its `apiUrl` as a base and appends `/v1/...`): a bare host/base gets
 * `/v1/chat/completions` appended; a URL that already ends in `/chat/completions` is used verbatim
 * (so a user who pasted the full endpoint isn't second-guessed). @param {string} apiUrl @returns {string} */
export function chatCompletionsUrl(apiUrl) {
  const trimmed = baseOf(apiUrl);
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/v1/chat/completions`;
}

/** POST the chat-completions request under an abort timeout; throws a clear timeout/reach error.
 * @param {string} id @param {string} url @param {string | null} apiKey @param {string} model
 * @param {string} instructions @param {number} timeoutMs @returns {Promise<Response>} */
async function postChatCompletion(id, url, apiKey, model, instructions, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Bearer is optional — many local endpoints (Ollama/llama.cpp) accept none.
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: instructions }] }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (ctrl.signal.aborted)
      throw new Error(`analysis worker '${id}' timed out after ${timeoutMs}ms contacting ${url}`, {
        cause: err,
      });
    throw new Error(
      `analysis worker '${id}' could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Read + validate a `/v1/chat/completions` reply into `{ output, model }`; throws on non-200,
 * non-JSON, or a missing message. @param {string} id @param {Response} res @param {string}
 * fallbackModel @returns {Promise<AnalyzeResult>} */
async function readChatCompletion(id, res, fallbackModel) {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `analysis worker '${id}' got ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const raw = await res.text().catch(() => "");
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `analysis worker '${id}' returned a non-JSON response: ${raw.slice(0, 200) || "(empty)"}`,
      { cause: err },
    );
  }
  const body =
    /** @type {{ choices?: Array<{ message?: { content?: unknown } }>, model?: unknown }} */ (
      parsed
    );
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new Error(
      `analysis worker '${id}' response had no message content — malformed /chat/completions reply.`,
    );
  const usedModel = typeof body.model === "string" && body.model ? body.model : fallbackModel;
  return { output: content, model: usedModel };
}

/** The openai-compatible adapter. @param {{ apiUrl: string | null, apiKey: string | null, model:
 * string | null }} cfg @param {{ timeoutMs?: number }} [opts] @returns {AnalysisWorker} */
export function openAiCompatibleAdapter(cfg, opts = {}) {
  const id = "openai-compatible";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    id,
    configured() {
      if (!cfg.apiUrl)
        return "analysis.apiUrl is not set — point it at an OpenAI-compatible endpoint (OpenRouter, Ollama, vLLM, …) in .xenodot.json `analysis` block or the ANALYSIS_API_URL env var.";
      if (!cfg.model)
        return "analysis.model is not set — name the model in .xenodot.json `analysis.model` or the ANALYSIS_MODEL env var.";
      return true;
    },
    async analyze({ instructions }) {
      const apiUrl = cfg.apiUrl;
      const model = cfg.model;
      if (!apiUrl || !model) throw new Error(`analysis worker '${id}' is not configured`);
      const url = chatCompletionsUrl(apiUrl);
      const res = await postChatCompletion(id, url, cfg.apiKey, model, instructions, timeoutMs);
      return readChatCompletion(id, res, model);
    },
  };
}

/** The Hermes adapter — reuses the runs-API bridge (create → poll to completion). No toolsets are
 * sent on the run (the POST carries only {input, instructions}, exactly as the Hermes MCP tool does),
 * so machine-access toolsets stay off the analysis path (guardrail 5); the gateway's own toolset
 * policy still governs, surfaced by `npm run hermes:check`. @param {{ enabled: boolean, apiUrl: string
 * | null, apiKey: string | null, model: string }} hermesCfg @param {{ createTimeoutMs?: number,
 * wallclockMs?: number, pollIntervalMs?: number }} [opts] @returns {AnalysisWorker} */
export function hermesAdapter(hermesCfg, opts = {}) {
  const id = "hermes";
  const createTimeoutMs = opts.createTimeoutMs ?? HERMES_CREATE_TIMEOUT_MS;
  const wallclockMs = opts.wallclockMs ?? HERMES_WALLCLOCK_MS;
  return {
    id,
    configured() {
      if (!hermesCfg.enabled)
        return 'Hermes is off — enable it in ⚙ Settings or `npm run hermes`, then set analysis.worker to "hermes".';
      if (!hermesCfg.apiUrl)
        return "Hermes has no API URL — configure it in ⚙ Settings or via `npm run hermes`.";
      if (!hermesCfg.apiKey)
        return "Hermes has no API key — set the local API_SERVER_KEY in ⚙ Settings.";
      return true;
    },
    async analyze({ instructions }) {
      const apiUrl = hermesCfg.apiUrl;
      const apiKey = hermesCfg.apiKey;
      if (!apiUrl || !apiKey) throw new Error(`analysis worker '${id}' is not configured`);
      const base = baseOf(apiUrl);
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        ctrl.abort();
      }, createTimeoutMs);
      /** @type {string} */
      let runId;
      try {
        // input = the composed analysis prompt (task template + honesty rules + bundle JSON).
        runId = await createRun(base, apiKey, instructions, HERMES_INSTRUCTIONS, ctrl.signal);
      } catch (err) {
        if (ctrl.signal.aborted)
          throw new Error(`analysis worker '${id}' — Hermes did not accept the run within 30s.`, {
            cause: err,
          });
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const output = await runToCompletion(base, apiKey, runId, {
        wallclockMs,
        pollIntervalMs: opts.pollIntervalMs,
      });
      if (!output.trim())
        throw new Error(
          `analysis worker '${id}' — Hermes run ${runId} returned an empty findings body.`,
        );
      return { output, model: hermesCfg.model };
    },
  };
}

/** The worker registry: adapter id → factory bound to its config source. `openai-compatible` reads
 * the `analysis` block; `hermes` reads the `hermes` block. @type {Record<string, (opts: {
 * analysisCfg: ReturnType<typeof getAnalysisConfig>, hermesCfg: ReturnType<typeof getHermesConfig>,
 * adapterOpts?: object }) => AnalysisWorker>} */
const WORKERS = {
  "openai-compatible": ({ analysisCfg, adapterOpts }) =>
    openAiCompatibleAdapter(analysisCfg, adapterOpts ?? {}),
  hermes: ({ hermesCfg, adapterOpts }) => hermesAdapter(hermesCfg, adapterOpts ?? {}),
};

/** Every known worker id (for error messages + the probe). @type {string[]} */
export const WORKER_IDS = Object.keys(WORKERS);

/** Select the configured worker adapter. Discriminated on `ok`: `{ ok: true, worker }`, or
 * `{ ok: false, error }` when the configured `analysis.worker` id is unknown. Config sources are
 * injectable for tests. @param {{ analysisCfg?: ReturnType<typeof getAnalysisConfig>, hermesCfg?:
 * ReturnType<typeof getHermesConfig>, adapterOpts?: object }} [opts]
 * @returns {{ ok: true, worker: AnalysisWorker } | { ok: false, error: string }} */
export function selectWorker(opts = {}) {
  const analysisCfg = opts.analysisCfg ?? getAnalysisConfig();
  const hermesCfg = opts.hermesCfg ?? getHermesConfig();
  const make = WORKERS[analysisCfg.worker];
  if (!make)
    return {
      ok: false,
      error: `Unknown analysis worker "${analysisCfg.worker}". Known workers: ${WORKER_IDS.join(", ")}. Set analysis.worker in .xenodot.json or the ANALYSIS_WORKER env var.`,
    };
  return { ok: true, worker: make({ analysisCfg, hermesCfg, adapterOpts: opts.adapterOpts }) };
}
