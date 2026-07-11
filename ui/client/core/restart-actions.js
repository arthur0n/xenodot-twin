// The TWO honest restart primitives, shared by every surface that needs to bind a change (the
// staleness chip, the Settings panel, the first-boot setup panel) — ONE mechanism each, not a
// copy per feature (docs step-0 RESTART TABLE decodes which change needs which):
//   - restartServer() — SERVER RESTART: binds config.js boot consts (project path, engine, port,
//     orchestrator prompt / *-block.md). POSTs /api/restart; the server exits with code 75 and
//     scripts/serve.sh relaunches. The socket drops → the transport auto-reconnects (?resume).
//   - newSession() — NEW SESSION: the SDK re-reads plugin skills/agents + the session-class config
//     blocks (hermes/codex/docs) at spawn. Reuses the existing "+ new" affordance: navigate with
//     no ?resume. Cheaper than a server restart; the honest fix for a skill/agent/session-block edit.
// NEVER auto-invoked — the click is the consent.
import { update } from "./store.js";

/** Restart the server (binds boot consts). The transport's auto-reconnect owns recovery. */
export function restartServer() {
  update((s) => ({ ...s, session: { ...s.session, status: "restarting server…" } }));
  void fetch("/api/restart", { method: "POST" }).catch(() => {
    /* the server exits mid-response — the reconnect logic owns recovery from here */
  });
}

/** End the current SDK session and spawn a fresh one (plugins + skills + session-blocks re-read). */
export function newSession() {
  location.href = location.pathname;
}
