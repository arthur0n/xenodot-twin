// First-boot setup panel (shown when NO project is configured — state.configured === false). It
// REPLACES the old empty-state confusion with a panel that GUIDES to the onboarding scripts (it
// never hides them): the live environment audit (GET /api/onboard-status — the SAME check logic as
// `npm run onboard:check`), the per-project workspace layout, copy-paste commands, and a
// configure-project FORM. The form validates a path server-side (exists + project.godot) and, on
// success, persists projectDir — it NEVER scaffolds (that stays a script). projectDir is read once
// at server boot, so a successful save says "restart server to bind" and offers the one-click
// restart (POST /api/restart), reusing the staleness chip's mechanism — one lever, not two.
import { $, $input, el } from "../../core/dom.js";
import { fetchJSON, postJSON } from "../../../lib/json.js";
import { restartServer } from "../../core/restart-actions.js";

let opened = false;

/** Render the environment audit rows into the panel. Each Check is `{ mark, line, fix? }`. */
async function loadEnv() {
  const box = $("setup-env");
  box.replaceChildren(el("div", "muted", "checking environment…"));
  /** @type {{ checks: { mark: string, line: string, fix?: string }[] }} */
  let data;
  try {
    data = /** @type {any} */ (await fetchJSON("/api/onboard-status"));
  } catch {
    box.replaceChildren(el("div", "muted", "couldn't run the environment audit"));
    return;
  }
  box.replaceChildren();
  for (const c of data.checks) {
    const row = el("div", "setup-check");
    row.append(el("span", "setup-check-mark", c.mark), el("span", "setup-check-line", c.line));
    box.append(row);
    if (c.mark === "✗" && c.fix) box.append(el("div", "setup-check-fix", `fix: ${c.fix}`));
  }
}

/** Show a post-save "saved — restart server to bind" affordance with the one-click restart.
 * @param {string} dir */
function showSaved(dir) {
  const notice = $("setup-notice");
  notice.replaceChildren();
  notice.append(
    el(
      "span",
      undefined,
      `Saved → ${dir}. projectDir is read at server boot, so restart to bind it.`,
    ),
  );
  const btn = el("button", "btn primary", "Restart server");
  btn.onclick = restartServer;
  notice.append(btn);
  notice.style.display = "";
  $("setup-error").textContent = "";
}

/** Validate + persist the typed project path (server-side; never scaffolds). */
async function configure() {
  const err = $("setup-error");
  err.textContent = "";
  $("setup-notice").style.display = "none";
  const path = $input("setup-path").value.trim();
  try {
    const res = /** @type {{ ok?: true, dir?: string, error?: string }} */ (
      await postJSON("/api/project", { path })
    );
    if (res.error) {
      err.textContent = res.error;
      return;
    }
    showSaved(res.dir ?? path);
  } catch {
    err.textContent =
      "Save failed — is the server up to date? Try: npm run onboard:project -- <path>";
  }
}

/** Open the panel when unconfigured. Idempotent — populates + opens once per load.
 * @param {import("../../../lib/types.js").ProjectState} state */
export function maybeOpenSetup(state) {
  if (state?.configured) return;
  if (opened) return;
  opened = true;
  $("setup-notice").style.display = "none";
  $("setup-error").textContent = "";
  void loadEnv();
  $("setup-modal").style.display = "";
}

/** Wire the panel's buttons once (from main.js). */
export function initSetup() {
  $("setup-configure").onclick = () => {
    void configure();
  };
  $("setup-refresh-env").onclick = () => {
    void loadEnv();
  };
  $input("setup-path").addEventListener("keydown", (e) => {
    if (e.key === "Enter") void configure();
  });
}
