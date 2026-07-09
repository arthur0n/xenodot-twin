// Hermes connection probe — the fast feedback loop for "is my gateway reachable
// from Xenodot?". Hits the gateway's `GET /v1/models` (cheap, no model run, no
// billing) with the bearer key, so you can confirm URL + API_SERVER_KEY are right
// BEFORE going three approvals deep into a Hive loop.
//
//   • Importable: `checkHermes({ apiUrl, apiKey })` → a plain verdict object.
//       Used by the UI's `POST /api/hermes/check` (the ⚙ Settings "Test connection"
//       button) and could be reused elsewhere.
//   • Runnable:   `npm run hermes:check` probes the currently-saved config and prints
//       a one-line verdict — handy while standing Hermes up from the terminal.
//
// Remember the two keys (see HERMES.md): the value tested here is the LOCAL
// `API_SERVER_KEY` you invented for your gateway — NOT the billable provider key,
// which lives inside Hermes (`hermes setup`) and is never seen by Xenodot.
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { getHermesConfig } from "../../core/config.js";
import { isLegacySoul } from "./hermes-soul-legacy.js";

/** The verdict of one probe. `reachable` = the gateway answered at all; `authOk` =
 * the bearer key was accepted; `ok` = both, with a usable model list.
 * `caps` carries the runs-API feature flags the Hermes tool depends on (poll status + stream events).
 * @typedef {{
 *   ok: boolean,
 *   reachable: boolean,
 *   authOk: boolean,
 *   status?: number,
 *   models?: string[],
 *   tools?: string[],
 *   caps?: { runStatus: boolean, runEventsSse: boolean },
 *   error?: string,
 * }} HermesCheck */

const baseOf = (/** @type {string} */ url) => url.replace(/\/+$/, "");

/** Best-effort: enabled toolset names on the API path (`GET /v1/toolsets`). undefined if the
 * endpoint is missing/old. @param {string} base @param {string | null} key @param {AbortSignal} signal
 * @returns {Promise<string[] | undefined>} */
async function fetchEnabledTools(base, key, signal) {
  try {
    const res = await fetch(`${base}/v1/toolsets`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal,
    });
    if (!res.ok) return undefined;
    const body = /** @type {{ data?: Array<{ name?: string, enabled?: boolean }> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    return (body?.data ?? [])
      .filter((t) => t.enabled === true && typeof t.name === "string")
      .map((t) => /** @type {string} */ (t.name));
  } catch {
    return undefined;
  }
}

/** Best-effort: the runs-API feature flags from `GET /v1/capabilities` — the surface the Hermes
 * tool relies on (poll run status + stream events). undefined if the endpoint is missing/old.
 * @param {string} base @param {string | null} key @param {AbortSignal} signal
 * @returns {Promise<{ runStatus: boolean, runEventsSse: boolean } | undefined>} */
async function fetchCapabilities(base, key, signal) {
  try {
    const res = await fetch(`${base}/v1/capabilities`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal,
    });
    if (!res.ok) return undefined;
    const body = /** @type {{ features?: Record<string, unknown> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    const f = body?.features ?? {};
    return { runStatus: f.run_status === true, runEventsSse: f.run_events_sse === true };
  } catch {
    return undefined;
  }
}

/** Probe a Hermes gateway with `GET /v1/models`.
 * @param {{ apiUrl?: string | null, apiKey?: string | null }} cfg
 * @param {number} [timeoutMs] @returns {Promise<HermesCheck>} */
export async function checkHermes(cfg, timeoutMs = 8000) {
  const apiUrl = cfg.apiUrl ?? null;
  const apiKey = cfg.apiKey ?? null;
  if (!apiUrl) {
    return { ok: false, reachable: false, authOk: false, error: "No Hermes server URL set." };
  }
  const base = baseOf(apiUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => {
      ctrl.abort();
    },
    Math.max(1, timeoutMs),
  );
  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reachable: true,
        authOk: false,
        status: res.status,
        error: "Gateway reachable, but the server key was rejected — check API_SERVER_KEY.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        reachable: true,
        authOk: true,
        status: res.status,
        error: `Gateway responded ${res.status} ${res.statusText}.`,
      };
    }
    const body = /** @type {{ data?: Array<{ id?: string }> } | null} */ (
      safeParse(await res.text().catch(() => "{}"))
    );
    const models = (body?.data ?? []).map((m) => m.id).filter((id) => typeof id === "string");
    const tools = await fetchEnabledTools(base, apiKey, ctrl.signal);
    const caps = await fetchCapabilities(base, apiKey, ctrl.signal);
    return { ok: true, reachable: true, authOk: true, status: res.status, models, tools, caps };
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    return {
      ok: false,
      reachable: false,
      authOk: false,
      error: aborted
        ? `No response within ${Math.round(timeoutMs / 1000)}s — is \`hermes gateway\` running at ${base}?`
        : `Can't reach ${base}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON or null. @param {string} s @returns {unknown} */
function safeParse(s) {
  try {
    return parseJSON(s);
  } catch {
    return null;
  }
}

// --- CLI: `npm run hermes:check` -------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = getHermesConfig();
  if (!cfg.enabled) {
    console.log("Hermes is OFF — enable it in ⚙ Settings or `npm run hermes -- --hermes`.");
  }
  // Prompt-drift guard (WARN, never fail): a ~/.hermes/SOUL.md that verbatim-matches a PRIOR shipped
  // Xenodot template is an out-of-date copy of OURS — `npm run hermes:setup` will upgrade it in place.
  try {
    const soul = readFileSync(path.join(homedir(), ".hermes", "SOUL.md"), "utf8");
    if (isLegacySoul(soul)) {
      console.log(
        "⚠ ~/.hermes/SOUL.md is an OLD Xenodot soul template — run `npm run hermes:setup` to update it.",
      );
    }
  } catch {
    /* no SOUL.md yet — nothing to warn about */
  }
  // Toolsets that execute on YOUR machine — flag loudly if the API path has them.
  const MACHINE = ["terminal", "file", "code_execution", "browser", "process"];
  checkHermes(cfg)
    .then((r) => {
      if (!r.ok) {
        console.error(`✗ ${r.error ?? "Hermes unreachable."}`);
        process.exitCode = 1;
        return;
      }
      const list = r.models?.length ? ` — models: ${r.models.slice(0, 5).join(", ")}` : "";
      console.log(`✓ Hermes reachable at ${cfg.apiUrl}${list}`);
      if (r.tools) {
        console.log(`  API-path tools enabled: ${r.tools.join(", ") || "(none)"}`);
        const risky = r.tools.filter((t) => MACHINE.includes(t));
        console.log(
          risky.length
            ? `  ⚠ MACHINE ACCESS ENABLED: ${risky.join(", ")} — run on THIS machine. Restrict with \`npm run hermes:setup\`.`
            : "  ✓ no machine-access tools (terminal/file/code) on the API path.",
        );
      }
      if (r.caps) {
        console.log(
          r.caps.runStatus
            ? `  ✓ runs API ready (run_status${r.caps.runEventsSse ? " + events SSE" : ""}) — findings delivery supported.`
            : "  ⚠ gateway lacks run_status — the Hermes bridge can't read findings; update Hermes.",
        );
      }
    })
    .catch((e) => {
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    });
}
