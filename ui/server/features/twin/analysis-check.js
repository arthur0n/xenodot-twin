// Analysis-worker probe — the fast "is my analysis worker configured and reachable?" feedback loop,
// mirroring `npm run hermes:check`. Confirms the selected worker (openai-compatible | hermes) is
// configured, then does a cheap, no-cost reachability check (no model run, no billing):
//   • openai-compatible → GET {base}/v1/models with the optional bearer key.
//   • hermes            → delegates to checkHermes (GET /v1/models on the gateway).
//
//   • Importable: `checkAnalysis()` → a plain verdict object.
//   • Runnable:   `npm run analysis:check` prints a one-line verdict + exits nonzero when not ready
//                 (same precedent as hermes:check — unconfigured/unreachable is a failure to report).
import { pathToFileURL } from "node:url";
import { getAnalysisConfig, getHermesConfig } from "../../core/config.js";
import { parseJSON } from "../../../lib/json.js";
import { baseOf } from "../../integrations/hermes/hermes-runs.js";
import { checkHermes } from "../../integrations/hermes/hermes-check.js";
import { selectWorker } from "./analysis.js";

/** One probe verdict. `configured` = the worker has the settings it needs; `reachable` = the
 * endpoint answered; `ok` = ready to dispatch. @typedef {{ ok: boolean, worker: string, configured:
 * boolean, reachable?: boolean, models?: string[], status?: number, error?: string }} AnalysisCheck */

/** Derive the models-list probe URL from a configured base. Mirrors chatCompletionsUrl's rule for
 * `/v1`-terminated bases (the documented OpenRouter/vLLM form): strip a trailing `/v1` before
 * appending, so the probe never emits `/v1/v1/models`. @param {string} apiUrl @returns {string} */
export function modelsUrl(apiUrl) {
  return `${baseOf(apiUrl).replace(/\/v1$/, "")}/v1/models`;
}

/** Probe the openai-compatible endpoint with `GET {base}/v1/models`. @param {string} apiUrl @param
 * {string | null} apiKey @param {number} timeoutMs @returns {Promise<AnalysisCheck>} */
async function probeOpenAiCompatible(apiUrl, apiKey, timeoutMs) {
  const base = baseOf(apiUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => {
      ctrl.abort();
    },
    Math.max(1, timeoutMs),
  );
  try {
    const res = await fetch(modelsUrl(apiUrl), {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: ctrl.signal,
    });
    if (!res.ok)
      return {
        ok: false,
        worker: "openai-compatible",
        configured: true,
        reachable: true,
        status: res.status,
        error: `Endpoint responded ${res.status} ${res.statusText}.`,
      };
    const raw = await res.text().catch(() => "");
    /** @type {{ data?: Array<{ id?: unknown }> } | null} */
    let body = null;
    try {
      body = /** @type {{ data?: Array<{ id?: unknown }> }} */ (parseJSON(raw));
    } catch {
      body = null;
    }
    /** @type {string[]} */
    const models = [];
    for (const m of body?.data ?? []) if (typeof m.id === "string") models.push(m.id);
    return { ok: true, worker: "openai-compatible", configured: true, reachable: true, models };
  } catch (err) {
    return {
      ok: false,
      worker: "openai-compatible",
      configured: true,
      reachable: false,
      error: ctrl.signal.aborted
        ? `No response within ${Math.round(timeoutMs / 1000)}s — is the endpoint up at ${base}?`
        : `Can't reach ${base}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Probe the configured analysis worker. @param {number} [timeoutMs] @returns {Promise<AnalysisCheck>} */
export async function checkAnalysis(timeoutMs = 8000) {
  const cfg = getAnalysisConfig();
  const selected = selectWorker();
  if (!selected.ok)
    return { ok: false, worker: cfg.worker, configured: false, error: selected.error };
  const worker = selected.worker;
  const ready = worker.configured();
  if (ready !== true) return { ok: false, worker: worker.id, configured: false, error: ready };

  if (worker.id === "hermes") {
    const h = await checkHermes(getHermesConfig(), timeoutMs);
    return {
      ok: h.ok,
      worker: "hermes",
      configured: true,
      reachable: h.reachable,
      models: h.models,
      status: h.status,
      error: h.error,
    };
  }
  // openai-compatible — configured() guarantees apiUrl.
  return probeOpenAiCompatible(/** @type {string} */ (cfg.apiUrl), cfg.apiKey, timeoutMs);
}

// --- CLI: `npm run analysis:check` -------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkAnalysis()
    .then((r) => {
      if (!r.configured) {
        console.error(`✗ analysis worker '${r.worker}' not configured — ${r.error}`);
        process.exitCode = 1;
        return;
      }
      if (!r.ok) {
        console.error(`✗ analysis worker '${r.worker}' unreachable — ${r.error}`);
        process.exitCode = 1;
        return;
      }
      const list = r.models?.length ? ` — models: ${r.models.slice(0, 5).join(", ")}` : "";
      console.log(`✓ analysis worker '${r.worker}' ready${list}`);
    })
    .catch((e) => {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    });
}
