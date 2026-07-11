// Graceful server restart for POST /api/restart — the "restart server" one-click that binds the
// config.js boot consts (orchestrator prompt, *-block.md, project/engine) a live session can't
// see (docs/handoff step-0 RESTART TABLE). The route acks upstream; here we finish in-flight work,
// tear every live session down via the SHARED teardown path (settles pending interactions, aborts
// the CLI, kills sub-agents), close the browser sockets + HTTP server, and exit with
// RESTART_EXIT_CODE so the visible supervisor (scripts/serve.sh) relaunches on the SAME port. No
// daemon, no magic — a plain while-loop honoring one exit code.
import { teardown } from "../connection.js";
import { allLive } from "../registry.js";

/** Exit code the server uses to ask the supervisor to relaunch it. MUST match RESTART_CODE in
 * scripts/serve.sh. Any OTHER exit code stops the supervisor loop (a genuine shutdown). */
export const RESTART_EXIT_CODE = 75;

/** Finish in-flight work and exit for a supervised relaunch.
 * @param {{ server: import("node:http").Server, wss: import("ws").WebSocketServer, heartbeat: ReturnType<typeof setInterval> }} deps */
export function gracefulRestart({ server, wss, heartbeat }) {
  for (const ls of allLive()) teardown(ls);
  for (const ws of wss.clients) {
    try {
      ws.close(4001, "server restarting");
    } catch {
      /* already closing */
    }
  }
  clearInterval(heartbeat);
  server.close(() => process.exit(RESTART_EXIT_CODE));
  // Backstop: a lingering half-closed socket must not wedge the restart.
  setTimeout(() => process.exit(RESTART_EXIT_CODE), 1500).unref();
}
