// Staleness honesty: does the RUNNING server/session still match what's on disk? The SDK loads
// plugin skills/agents at query() spawn, and config.js readFileSync's the orchestrator prompt,
// the *-block.md prompt files, and the project/engine config ONCE at boot — so editing any of
// those does NOT reach a live server/session (see docs/handoff step-0 RESTART TABLE). This module
// compares on-disk mtimes/content against the server boot time and the newest session spawn time,
// so the UI can say — honestly — that a change is not loaded yet and offer the matching one-click
// restart. NO fs watchers: a shallow mtime walk over a handful of plugin folders + a few file
// stats, throttled by a short cache, scanned only when the client polls /api/staleness.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import {
  FRAMEWORK_PLUGIN_DIR,
  FRAMEWORK_DIR,
  UI_DIR,
  CONFIG_FILE,
  PROJECT_CONFIGURED,
} from "./config.js";

/** @typedef {{ server: { stale: boolean, path: string | null }, session: { stale: boolean, path: string | null } }} StalenessReport */

/** When this server process booted — the moment config.js's boot consts (orchestrator prompt,
 * *-block.md, project/engine) were frozen. A source with a newer mtime than this is not loaded
 * until a SERVER RESTART. */
export const SERVER_BOOT_MS = Date.now();

/** Newest FRESH SDK session spawn (not a reattach). The SDK re-reads plugin skills/agents at each
 * spawn, so a plugin .md edited after this is not in the running session until a NEW SESSION.
 * 0 until the first session spawns → no session-stale signal before there's a session. */
let sessionSpawnMs = 0;
/** Record a fresh session spawn (called from handleConnection's non-reattach path). */
export function noteSessionSpawn() {
  sessionSpawnMs = Date.now();
}

// Server-stale file sources: readFileSync'd ONCE at config import (config.js), so a live session
// reuses the module constant — only a server restart re-reads them.
const SERVER_FILES = [
  path.join(UI_DIR, "orchestrator-viewer.md"),
  path.join(UI_DIR, "hermes-block.md"),
  path.join(UI_DIR, "codex-block.md"),
  path.join(UI_DIR, "docs-block.md"),
];

// Session-stale source dirs: the SDK loads these at query() spawn (session.js `plugins`), so a
// running session holds its loaded copy; only a NEW session re-reads them.
const SESSION_DIRS = [
  path.join(FRAMEWORK_PLUGIN_DIR, "skills"),
  path.join(FRAMEWORK_PLUGIN_DIR, "agents"),
];

// .xenodot.json fields that are boot consts (PROJECT_DIR / ENGINE / PROFILE / assetLibrary): a
// change needs a SERVER restart. Compared by CONTENT (not mtime), so a Settings-panel
// hermes/codex/docs save — same file, different block, session-level — does not false-trigger a
// server-stale chip. (The hermes/codex/docs blocks carry their own restart messaging in Settings.)
const STRUCTURAL_KEYS = ["projectDir", "engine", "profile", "assetLibrary"];
/** Canonical JSON of just the server-boot-const config fields, or "" if unreadable. */
function structuralConfig() {
  try {
    const saved = /** @type {Record<string, unknown>} */ (
      parseJSON(readFileSync(CONFIG_FILE, "utf8")) ?? {}
    );
    /** @type {Record<string, unknown>} */
    const picked = {};
    for (const k of STRUCTURAL_KEYS) if (k in saved) picked[k] = saved[k];
    return JSON.stringify(picked);
  } catch {
    return "";
  }
}
const BOOT_STRUCTURAL = structuralConfig();

/** Newest .md mtime (and its path) under `dir`, recursively. Cheap: a shallow readdir walk,
 * .md only, no file reads. @param {string} dir
 * @param {{ mtime: number, file: string | null }} best @returns {{ mtime: number, file: string | null }} */
function newestMd(dir, best) {
  if (!existsSync(dir)) return best;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      best = newestMd(full, best);
    } else if (entry.name.endsWith(".md")) {
      const m = statSync(full).mtimeMs;
      if (m > best.mtime) best = { mtime: m, file: full };
    }
  }
  return best;
}

/** Newest mtime (+path) among an explicit file list. @param {string[]} files */
function newestFile(files) {
  let best = { mtime: 0, file: /** @type {string | null} */ (null) };
  for (const f of files) {
    try {
      const m = statSync(f).mtimeMs;
      if (m > best.mtime) best = { mtime: m, file: f };
    } catch {
      /* missing/optional source — skip */
    }
  }
  return best;
}

/** Path shortened to a framework-relative form for the chip label. @param {string | null} f */
function rel(f) {
  return f ? path.relative(FRAMEWORK_DIR, f) : null;
}

const THROTTLE_MS = 4000;
/** @type {{ at: number, value: StalenessReport } | null} */
let cache = null;

/** Compare on-disk sources against boot/spawn times. Throttled so rapid polls don't re-walk.
 * @returns {StalenessReport} */
export function stalenessReport() {
  // Unconfigured is Phase 2's honest setup panel — don't fight it with a chip.
  if (!PROJECT_CONFIGURED)
    return { server: { stale: false, path: null }, session: { stale: false, path: null } };
  const now = Date.now();
  if (cache && now - cache.at < THROTTLE_MS) return cache.value;

  // session-stale: newest plugin skill/agent .md after the running session spawned.
  let sess = { mtime: 0, file: /** @type {string | null} */ (null) };
  for (const d of SESSION_DIRS) sess = newestMd(d, sess);
  const sessionStale = sessionSpawnMs > 0 && sess.mtime > sessionSpawnMs;

  // server-stale: a boot-const file changed after boot, or the structural config changed.
  const srv = newestFile(SERVER_FILES);
  const fileStale = srv.mtime > SERVER_BOOT_MS;
  const configChanged = structuralConfig() !== BOOT_STRUCTURAL;
  const serverStale = fileStale || configChanged;
  const serverFile = fileStale ? srv.file : configChanged ? CONFIG_FILE : null;

  const value = {
    server: { stale: serverStale, path: serverStale ? rel(serverFile) : null },
    session: { stale: sessionStale, path: sessionStale ? rel(sess.file) : null },
  };
  cache = { at: now, value };
  return value;
}
