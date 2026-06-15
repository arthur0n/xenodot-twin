// Health check for a game wired by the framework. Verifies onboarding actually
// landed: the Godot project, the installed agents + skills, the rtk hook, and
// (advisory) rtk on PATH. Exits non-zero on any HARD failure so it can gate
// `bootstrap` and CI.
//
// Usage: npm run doctor                  (the configured game, see config.js)
//        npm run doctor -- /path/to/game
//        node ui/server/doctor.js /path/to/game
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseJSON } from "../lib/json.js";
import { PROJECT_DIR } from "./config.js";

/**
 * @typedef {{ command?: string }} HookCmd
 * @typedef {{ hooks?: HookCmd[] }} HookEntry
 * @typedef {{ hooks?: { PreToolUse?: HookEntry[] } }} Settings
 */

const claude = path.join(PROJECT_DIR, ".claude");

/** Count files with a suffix in a dir (0 if missing).
 * @param {string} dir @param {string} suffix @returns {number} */
function countFiles(dir, suffix) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

/** Count immediate subdirectories (0 if missing). @param {string} dir @returns {number} */
function countDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** @returns {boolean} */
function hookInstalled() {
  try {
    const s = /** @type {Settings} */ (
      parseJSON(readFileSync(path.join(claude, "settings.json"), "utf8"))
    );
    return (s.hooks?.PreToolUse ?? []).some((e) =>
      (e.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes("rtk hook")),
    );
  } catch {
    return false;
  }
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

const agents = countFiles(path.join(claude, "agents"), ".md");
const skills = countDirs(path.join(claude, "skills"));

/** @type {{ ok: boolean, hard: boolean, label: string }[]} */
const checks = [
  {
    ok: existsSync(path.join(PROJECT_DIR, "project.godot")),
    hard: true,
    label: "project.godot present",
  },
  { ok: agents > 0, hard: true, label: `agents installed (${agents})` },
  { ok: skills > 0, hard: true, label: `skills installed (${skills})` },
  { ok: hookInstalled(), hard: true, label: "rtk hook in .claude/settings.json" },
  { ok: hasRtk(), hard: false, label: "rtk on PATH (optional — hook no-ops without it)" },
];

console.log(`doctor: checking ${PROJECT_DIR}`);
let hardFails = 0;
for (const c of checks) {
  const mark = c.ok ? "✓" : c.hard ? "✗" : "—";
  console.log(`  ${mark} ${c.label}`);
  if (!c.ok && c.hard) hardFails += 1;
}

if (hardFails > 0) {
  console.error(`doctor: ${hardFails} hard check(s) failed.`);
  process.exit(1);
}
console.log("doctor: OK");
