// forge new — take a folder to a runnable, framework-driven game in one step: scaffold the
// starter (when empty), remember the path, and materialize the plugin's per-game files
// (tools copied, library symlinked — both gitignored), then health-check.
//
// The framework's agents/skills are NOT copied into the game — they load from the xenodot
// plugin: automatically in the web UI, and in terminal Claude Code after a one-time
// `/plugin install` (printed by doctor). The committed game stays pure game.
//
// Usage: npm run new -- ../mygame           (scaffold an empty folder, or wire an existing Godot project)
//        npm run new -- ../mygame --genre=genre-fps --style=style-hd   (declare the profile up front;
//        without flags, setup.js prompts on a TTY — see ui/lib/profile.js)
import { existsSync, cpSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

const argv = process.argv.slice(2);
// Only the profile flags are forwarded (to setup.js); any OTHER flag-shaped arg
// (`--help`/`--project`) must fail loudly, not silently scaffold the default sibling
// path (or, resolved raw, a literal `--help/` dir).
const profileFlags = argv.filter((a) => a.startsWith("--genre=") || a.startsWith("--style="));
const flagArg = argv.find((a) => a.startsWith("-") && !profileFlags.includes(a));
if (flagArg) {
  console.error(
    `new: ${flagArg} is not a project path. Usage: npm run new -- ../mygame [--genre=…] [--style=…]`,
  );
  process.exit(1);
}
const target = path.resolve(
  argv.find((a) => !a.startsWith("-")) ?? path.join(FRAMEWORK_DIR, "..", "game"),
);

/** Run a child step, inheriting stdio so its output streams through. @param {string[]} args */
const node = (...args) => execFileSync("node", args, { stdio: "inherit" });

/** Make sure the game ignores the framework's generated/working paths, so they're never
 * committed (the scaffolded starter already lists these; this covers an existing project).
 * @param {string} dir */
function ensureIgnores(dir) {
  const file = path.join(dir, ".gitignore");
  const need = [
    "/tools/",
    "/library",
    "/x-shared-assets",
    "/transcripts/",
    ".xenodot/",
    ".claude/projects/",
  ];
  let cur = "";
  try {
    cur = readFileSync(file, "utf8");
  } catch {
    /* no .gitignore yet */
  }
  const lines = cur.split(/\r?\n/);
  const missing = need.filter((p) => !lines.includes(p));
  if (!missing.length) return;
  const block =
    "\n# Xenodot Forge generated/working files — not repo content\n" + missing.join("\n") + "\n";
  if (cur) appendFileSync(file, block);
  else writeFileSync(file, block.trimStart());
  console.log(`new: added ${missing.length} ignore rule(s) to ${file}`);
}

// 1. Scaffold the starter (project + thin CLAUDE.md + .claude/settings.json + .gitignore)
//    into an empty/new target. An existing Godot project is kept and wired in place.
const starterDir = path.join(FRAMEWORK_DIR, "starter");
if (!existsSync(path.join(target, "project.godot"))) {
  if (!existsSync(starterDir)) {
    console.error(`new: ${starterDir} is missing — cannot scaffold. Is the framework complete?`);
    process.exit(1);
  }
  cpSync(starterDir, target, { recursive: true });
  console.log(`new: scaffolded ${path.basename(starterDir)} → ${target}`);
} else {
  console.log(`new: ${target} already has a project.godot — wiring it in place.`);
}
ensureIgnores(target);

// 2. Remember the path + the game's profile ({genre, style} — flags here, or setup.js
//    prompts on a TTY thanks to inherited stdio). Writes .xenodot.json.
node(path.join(here, "setup.js"), target, ...profileFlags);

// 3. Materialize the plugin's per-game files: tools/ copied, library/ symlinked.
node(path.join(here, "materialize.js"), target);

// 4. Health check — fails loudly if anything didn't land.
node(path.join(here, "doctor.js"), target);

console.log(
  `\nnew: done. Next:\n    npm start ${target}      # web UI — loads the xenodot plugin automatically\n  or open ${target} in terminal Claude Code after the one-time /plugin install above.`,
);
