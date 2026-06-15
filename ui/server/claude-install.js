// Deploy the framework's vendored game config (game-config/) into a game project's
// .claude/, WITHOUT overwriting files that already exist. Forkers run this once after
// `npm run setup`. Use --force for a clean reset: it overwrites existing files AND
// prunes orphans in agents/ and skills/ (so deletions upstream propagate), matching the
// mirror claude-sync writes. Other .claude/ files (settings.local.json, agent-memory,
// eval scratch) are left untouched.
//
// Usage: npm run claude:install               (target = configured game, see config.js)
//        npm run claude:install -- --force
//        node ui/server/claude-install.js /path/to/game [--force]
import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PROJECT_DIR, FRAMEWORK_DIR } from "./config.js";
import { parseJSON } from "../lib/json.js";

const SRC = path.join(FRAMEWORK_DIR, "game-config");
const force = process.argv.slice(2).includes("--force");
const dest = path.join(PROJECT_DIR, ".claude");

if (!existsSync(SRC)) {
  console.error(`claude:install: ${SRC} not found — run \`npm run claude:sync\` first.`);
  process.exit(1);
}

const tally = { created: 0, overwritten: 0, skipped: 0, merged: 0 };

/**
 * @typedef {{ command?: string }} HookCmd
 * @typedef {{ matcher?: string, hooks?: HookCmd[] }} HookEntry
 * @typedef {{ hooks?: { PreToolUse?: HookEntry[] } }} Settings
 */

/** Recursively copy src → dst, skipping existing files unless --force. The one
 * exception is `.claude/settings.json`: it is always *merged* (never wholesale
 * copied or overwritten), because a real game's settings.json carries the
 * consumer's own permissions — see mergeSettings.
 * @param {string} src @param {string} dst */
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(s, d);
    } else if (path.relative(SRC, s) === "settings.json") {
      mergeSettings(s, d);
    } else if (!existsSync(d)) {
      copyFileSync(s, d);
      tally.created++;
    } else if (force) {
      copyFileSync(s, d);
      tally.overwritten++;
    } else {
      tally.skipped++;
    }
  }
}

/** Splice the framework's rtk hook into the game's settings.json without
 * touching anything else the consumer has (permissions, other hooks). The
 * shipped settings.json contains only the rtk PreToolUse block; we add it iff an
 * equivalent isn't already present. Idempotent, and non-destructive even under
 * --force — we parse-and-rewrite, never overwrite the file wholesale. (This is
 * the file most games already have, so a plain skip/clobber would either drop
 * the hook or wipe their permissions.)
 * @param {string} srcPath @param {string} destPath */
function mergeSettings(srcPath, destPath) {
  // No existing file → the simple copy is already correct and complete.
  if (!existsSync(destPath)) {
    copyFileSync(srcPath, destPath);
    tally.created++;
    return;
  }

  const incoming = /** @type {Settings} */ (parseJSON(readFileSync(srcPath, "utf8")));
  const current = /** @type {Settings} */ (parseJSON(readFileSync(destPath, "utf8")));
  current.hooks ??= {};
  current.hooks.PreToolUse ??= [];

  // A hook counts as "ours" if any of its commands invokes `rtk hook`, so a
  // reformatted command or renamed matcher still reads as already-installed.
  const isOurs = (/** @type {HookEntry} */ e) =>
    (e.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes("rtk hook"));

  if (current.hooks.PreToolUse.some(isOurs)) {
    tally.skipped++;
    return;
  }

  for (const block of incoming.hooks?.PreToolUse ?? []) current.hooks.PreToolUse.push(block);
  writeFileSync(destPath, JSON.stringify(current, null, 2) + "\n");
  tally.merged++;
}

/** @returns {boolean} */
function hasRtk() {
  try {
    execFileSync("rtk", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// --force is a clean reset: mirror the parts game-config ships (agents/, skills/)
// by wiping them first, so files removed upstream don't linger. Without --force we
// only fill in missing files, so this prune never runs and nothing is destroyed.
if (force) {
  for (const part of ["agents", "skills"]) {
    rmSync(path.join(dest, part), { recursive: true, force: true });
  }
}

copyTree(SRC, dest);

console.log(
  `claude:install: ${dest} — created ${tally.created}, overwritten ${tally.overwritten}, merged ${tally.merged}, skipped ${tally.skipped}.`,
);
if (tally.skipped && !force) {
  console.log(
    `  ${tally.skipped} existing file(s) left untouched. Re-run with --force to overwrite.`,
  );
}
if (!hasRtk()) {
  console.log("  Note: `rtk` is not on PATH. The hook no-ops safely until you install it.");
}
console.log("  If the rtk hook doesn't fire, approve it once via /hooks in Claude Code.");
