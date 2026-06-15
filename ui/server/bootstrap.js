// One-command onboarding: take a fresh (or empty) game folder to a wired,
// runnable project in a single step. Optionally scaffolds the minimal starter,
// remembers the path, installs agents + skills + the rtk hook, then runs doctor.
//
// Usage: npm run bootstrap -- ../game --starter   (scaffold a runnable game, then wire it)
//        npm run bootstrap -- ../game             (wire an existing Godot project)
//        npm run bootstrap -- ../game --force      (also clean-reset agents/skills)
import { existsSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server
const FRAMEWORK_DIR = path.join(here, "..", "..");

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const target = path.resolve(
  argv.find((a) => !a.startsWith("--")) ?? path.join(FRAMEWORK_DIR, "..", "game"),
);
const wantStarter = flags.includes("--starter");
const force = flags.includes("--force");

/** Run a child step, inheriting stdio so its output streams through.
 * Throws (and aborts bootstrap) on a non-zero exit. @param {string[]} args */
const node = (...args) => execFileSync("node", args, { stdio: "inherit" });

// 1. Scaffold the starter into a new/empty target if asked and there's no project there yet.
if (wantStarter && !existsSync(path.join(target, "project.godot"))) {
  cpSync(path.join(FRAMEWORK_DIR, "starter"), target, { recursive: true });
  console.log(`bootstrap: scaffolded starter → ${target}`);
} else if (wantStarter) {
  console.log(`bootstrap: ${target} already has a project.godot — keeping it, skipping starter.`);
}

// 2. Remember the path (writes .xenodot.json).
node(path.join(here, "setup.js"), target);

// 3. Install agents + skills + hook (merges settings.json, never clobbers it).
node(path.join(here, "claude-install.js"), target, ...(force ? ["--force"] : []));

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

console.log(`\nbootstrap: done. Next:\n    cd ${target} && claude`);
