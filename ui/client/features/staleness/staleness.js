// Staleness honesty chip. The server loads plugin skills/agents at session spawn and freezes the
// orchestrator prompt / *-block.md / project config at boot (docs step-0 RESTART TABLE), so an
// edit to those is NOT in the running server/session until a restart — and until now nothing said
// so, which was the whole complaint. This polls the cheap /api/staleness and, when a change isn't
// loaded, shows a topbar chip naming the newest offending file plus the ONE matching restart.
// NEVER auto-restarts — the click is the consent.
import { $ } from "../../core/dom.js";
import { fetchJSON } from "../../../lib/json.js";
import { update } from "../../core/store.js";

const POLL_MS = 12_000;

/** @typedef {{ server: { stale: boolean, path: string | null }, session: { stale: boolean, path: string | null } }} StalenessReport */

/** The trailing, human-recognizable part of a path (e.g. "skills/caveman/SKILL.md"). @param {string} p */
function short(p) {
  return p.split("/").slice(-2).join("/");
}

/** POST the server restart, then let the transport's auto-reconnect (?resume) bring us back on the
 * same port. The socket drops as the server exits → websocket.js shows "reconnecting…" and retries. */
function restartServer() {
  update((s) => ({ ...s, session: { ...s.session, status: "restarting server…" } }));
  void fetch("/api/restart", { method: "POST" }).catch(() => {
    /* the server exits mid-response — the reconnect logic owns recovery from here */
  });
}

/** End the current SDK session and spawn a fresh one (plugins + skills re-read at spawn). Reuses
 * the existing "+ new" affordance: navigate with no ?resume. */
function newSession() {
  location.href = location.pathname;
}

/** @param {StalenessReport} r */
function render(r) {
  const chip = $("stale-chip");
  // Server-stale wins: a server restart re-spawns the session too, so it's the honest superset.
  if (r.server.stale) {
    const p = r.server.path ?? "config";
    chip.textContent = `⟳ ${short(p)} changed — restart server`;
    chip.title = `${p} changed on disk after the server booted. Click to restart the server (same port) so it binds.`;
    chip.onclick = restartServer;
    chip.style.display = "";
  } else if (r.session.stale) {
    const p = r.session.path ?? "a skill";
    chip.textContent = `⟳ ${short(p)} changed — restart session`;
    chip.title = `${p} changed after this session started. Click to start a fresh session that loads it.`;
    chip.onclick = newSession;
    chip.style.display = "";
  } else {
    chip.style.display = "none";
    chip.onclick = null;
  }
}

async function poll() {
  try {
    render(/** @type {StalenessReport} */ (await fetchJSON("/api/staleness")));
  } catch {
    /* transient (e.g. mid-restart) — keep the last chip state, try again next tick */
  }
}

export function initStaleness() {
  void poll();
  setInterval(() => {
    void poll();
  }, POLL_MS);
}
