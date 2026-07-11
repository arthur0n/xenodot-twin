// Settings entry — the Settings (⚙) modal (Hermes researcher, Codex code-reviewer, Godot docs MCP)
// plus the wiring that boots all three settings surfaces. The Skills (🧩) modal lives in
// ./settings-skills.js and the first-run wizard in ./skill-setup-wizard.js; this module imports
// their init + the connection helpers, keeping each surface in its own file.
// Skills default to framework-only (skillOverrides "*": "off" in starter/.claude/settings.json);
// the Skills panel lets the user opt in built-in/workspace.
import { $, $input, el } from "../../core/dom.js";
import { fetchJSON, postJSON } from "../../../lib/json.js";
import { restartServer, newSession } from "../../core/restart-actions.js";
import {
  CUSTOM,
  fillModels,
  toggleCustom,
  testConnection,
  testCodex,
  runIntegrationSetup,
} from "./settings-connection.js";
import { initSkills } from "./settings-skills.js";
import { initSkillSetup, maybeAutoOpenSkillSetup } from "./skill-setup-wizard.js";

// Re-exported so main.js keeps importing it from ./settings.js (it lives in the wizard module).
export { maybeAutoOpenSkillSetup };

/** Snapshot of what /api/state returned when the panel opened — so save() can diff and report
 * ONLY the classes that actually changed (no false "restart" nag). @type {{ hermesEnabled: boolean,
 * hermesUrl: string, hermesModel: string, codexEnabled: boolean, docsEnabled: boolean,
 * engineBin: string, port: number } | null} */
let loaded = null;

async function open() {
  $("settings-notice").style.display = "none";
  $("settings-error").textContent = "";
  $("hermes-status").textContent = "";
  $("hermes-status").className = "settings-status";
  $("codex-status").textContent = "";
  $("codex-status").className = "settings-status";
  $("docs-status").textContent = "";
  $("docs-status").className = "settings-status";
  $("twin-source-status").textContent = "";
  $("twin-source-status").className = "settings-status";
  try {
    const state = /** @type {import("../../../lib/types.js").ProjectState} */ (
      await fetchJSON("/api/state")
    );
    const h = state.hermes;
    $input("hermes-enabled").checked = h.enabled;
    $input("hermes-url").value = h.apiUrl ?? "";
    $input("hermes-key").value = "";
    $input("hermes-key").placeholder = h.hasKey
      ? "key saved — leave blank to keep it"
      : "paste your Hermes API key";
    fillModels(h.models, h.model);
    const c = state.codex;
    $input("codex-enabled").checked = c.enabled;
    if (c.enabled && !c.vendored) {
      $("codex-status").textContent =
        "Switched on, but the plugin isn't vendored — run npm run codex:setup.";
    }
    $input("docs-enabled").checked = state.docs.enabled;
    // Server & engine (boot-const fields) — the binary path is not a secret, so prefill it verbatim.
    $input("engine-bin").value = state.engine.bin ?? "";
    $input("server-port").value = String(state.engine.port);
    loaded = {
      hermesEnabled: h.enabled,
      hermesUrl: h.apiUrl ?? "",
      hermesModel: h.model,
      codexEnabled: c.enabled,
      docsEnabled: state.docs.enabled,
      engineBin: state.engine.bin ?? "",
      port: state.engine.port,
    };
    const twinStatus = $("twin-source-status");
    const sourceUrl = state.twin?.sourceUrl ?? null;
    if (sourceUrl) {
      twinStatus.className = "settings-status ok";
      twinStatus.textContent = `● LIVE — ${sourceUrl} (integrator-side; not hostable)`;
    } else {
      twinStatus.className = "settings-status";
      twinStatus.textContent = '○ none — a published demo bakes url="" (baked recording)';
    }
  } catch {
    $("settings-error").textContent = "Couldn't load settings — is the server up to date?";
  }
  $("settings-modal").style.display = "";
}

function close() {
  $("settings-modal").style.display = "none";
}

/** Report what a successful save needs to take effect, reusing the SAME two restart primitives the
 * staleness chip uses (one mechanism, not two). The reconcile (docs step-0 RESTART TABLE):
 *   - SESSION-class (hermes/codex/docs) — the staleness chip deliberately does NOT watch these
 *     (it content-diffs only the structural boot fields), so THIS panel is their sole reporter:
 *     "takes effect on the next session" + the existing "+ new" action. No double-reporting.
 *   - SERVER-class (engine bin, port) — boot consts: "restart server to bind" + the restart action.
 * @param {boolean} sessionChanged @param {boolean} serverChanged */
function reportSave(sessionChanged, serverChanged) {
  const notice = $("settings-notice");
  notice.replaceChildren();
  if (serverChanged) {
    const row = el("div", "settings-notice-row");
    row.append(el("span", undefined, "Engine/port saved — read at server boot. Restart to bind:"));
    const btn = el("button", "btn primary", "Restart server");
    btn.onclick = restartServer;
    row.append(btn);
    notice.append(row);
  }
  if (sessionChanged) {
    const row = el("div", "settings-notice-row");
    row.append(el("span", undefined, "Saved — takes effect on the next session:"));
    const btn = el("button", "btn ghost", "New session");
    btn.onclick = newSession;
    row.append(btn);
    notice.append(row);
  }
  notice.style.display = "";
}

async function save() {
  const err = $("settings-error");
  err.textContent = "";
  err.style.color = "";
  $("settings-notice").style.display = "none";
  const sel = /** @type {HTMLSelectElement} */ ($("hermes-model"));
  const model = sel.value === CUSTOM ? $input("hermes-model-custom").value.trim() : sel.value;
  const key = $input("hermes-key").value.trim();
  /** @type {{ enabled: boolean, apiUrl: string, model: string, apiKey?: string }} */
  const hermes = {
    enabled: $input("hermes-enabled").checked,
    apiUrl: $input("hermes-url").value.trim(),
    model,
  };
  if (key) hermes.apiKey = key; // blank → server keeps the saved key
  const codex = { enabled: $input("codex-enabled").checked };
  const docs = { enabled: $input("docs-enabled").checked };
  const engineBin = $input("engine-bin").value.trim();
  const port = Number($input("server-port").value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    err.textContent = "Port must be a whole number between 1 and 65535.";
    return;
  }
  try {
    const res = /** @type {{ error?: string }} */ (
      await postJSON("/api/settings", { hermes, codex, docs, engine: { bin: engineBin }, port })
    );
    if (res.error) {
      err.textContent = res.error;
      return;
    }
  } catch {
    err.textContent = "Save failed — restart the UI server (npm start) and try again.";
    return;
  }
  // Diff against what the panel opened with, so we only offer the restart(s) that are actually due.
  // A null snapshot (loaded never set) makes every `?.` field undefined → treated as changed.
  const sessionChanged =
    hermes.enabled !== loaded?.hermesEnabled ||
    hermes.apiUrl !== loaded?.hermesUrl ||
    model !== loaded?.hermesModel ||
    Boolean(key) ||
    codex.enabled !== loaded?.codexEnabled ||
    docs.enabled !== loaded?.docsEnabled;
  const serverChanged = engineBin !== loaded?.engineBin || port !== loaded?.port;
  if (!sessionChanged && !serverChanged) {
    close();
    return;
  }
  reportSave(sessionChanged, serverChanged);
}

export function initSettings() {
  $("settings-btn").onclick = () => {
    void open();
  };
  $("settings-cancel").onclick = close;
  $("settings-save").onclick = () => {
    void save();
  };
  $("hermes-test").onclick = () => {
    void testConnection();
  };
  $("codex-test").onclick = () => {
    void testCodex();
  };
  $("codex-setup").onclick = () => {
    void runIntegrationSetup("codex-status", "/api/codex/setup", "Setting up Codex…");
  };
  $("hermes-setup").onclick = () => {
    void runIntegrationSetup(
      "hermes-status",
      "/api/hermes/setup",
      "Setting up Hermes… (installs the local agent)",
    );
  };
  $("hermes-model").addEventListener("change", () => {
    toggleCustom("");
  });
  $("settings-modal").addEventListener("click", (e) => {
    if (e.target === $("settings-modal")) close();
  });

  // The Skills (🧩) modal and the first-run wizard own their own buttons + state.
  initSkills();
  initSkillSetup();
}
