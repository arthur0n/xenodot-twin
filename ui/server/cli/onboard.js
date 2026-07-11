// npm run onboard — the ONE stepwise on-ramp from a fresh clone to a running viewer. No magic: it is
// a THIN sequencer that PRINTS each numbered step and runs the same standalone script you could run
// yourself. Each step is also a script of its own (onboard:check / :project / :verify), so nothing
// here hides work — the sequencer only orders it and stops at the first blocker.
//
//   npm run onboard                     # audit the machine + the configured seat (idempotent)
//   npm run onboard -- ../viewer        # + scaffold/wire that seat before verifying
//
// On an already-wired repo this is an all-green audit in seconds that creates nothing.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "../core/config.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const passthrough = process.argv.slice(2); // e.g. a project path, forwarded to :project

/** Run one onboarding step as its own process, streaming its output. Returns true on exit 0.
 * @param {number} n @param {string} title @param {string} script @param {string[]} args */
function step(n, title, script, args = []) {
  console.log(`\n━━ Step ${n}/3 · ${title} ━━`);
  try {
    execFileSync("node", [path.join(here, script), ...args], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(" Xenodot Twin — onboarding (3 explicit steps)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// 1. Environment audit — required tools must be present; advisory ones print their exact fix.
if (!step(1, "environment audit  (onboard:check)", "onboard-check.js")) {
  console.error("\nonboard: stopped — fix the required tool above, then re-run `npm run onboard`.");
  process.exit(1);
}

// 2. Project — scaffold/wire the named seat (path passed through), or audit the configured one.
if (!step(2, "project seat       (onboard:project)", "onboard-project.js", passthrough)) {
  console.error(
    "\nonboard: stopped — name your viewer and pass its path:\n  npm run onboard -- <project-path>",
  );
  process.exit(1);
}

// 3. Verify — prove the real seat is wired and (with an engine) boots headless.
if (!step(3, "verify seat        (onboard:verify)", "onboard-verify.js")) {
  console.error("\nonboard: stopped — the seat did not verify (above).");
  process.exit(1);
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(" onboard: done. Start the web UI:");
console.log("");
console.log("     npm start");
console.log(`     → open http://localhost:${PORT}`);
console.log("");
console.log(
  " The UI setup panel covers project path, engine + ports, and Hermes/Codex/docs toggles.",
);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
