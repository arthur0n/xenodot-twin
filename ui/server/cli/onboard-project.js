// onboard:project — the SECOND onboarding step: point the framework at a viewer project (scaffold an
// empty dir into the starter, or wire an existing project.godot in place), then materialize + doctor.
//
// It adds NO new scaffolding logic and NO new defaults — it is `npm run new` under a clearer name:
// it delegates to new.js (which chains setup → materialize → doctor). Its only additions are the
// per-project workspace framing and idempotency: on an already-configured, healthy seat it reports
// that and creates NOTHING (so `npm run onboard` on a wired repo stays an all-green audit).
//
//   node ui/server/cli/onboard-project.js <project-path>   # scaffold or wire the seat
//   node ui/server/cli/onboard-project.js                  # audit-only: report the configured seat
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROJECT_DIR,
  PROJECT_CONFIGURED,
  PROJECT_FOUND,
  ENGINE,
  ENGINE_LABEL,
} from "../core/config.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli

const LAYOUT =
  "Per-project workspace — the framework clone and the viewer sit SIDE BY SIDE under one\n" +
  "folder YOU named, e.g.:\n" +
  "\n" +
  "  my-twin/\n" +
  "  ├── xenodot-twin/   ← this framework clone (you are here)\n" +
  "  └── viewer/         ← the viewer this wires — pass its path:\n" +
  "\n" +
  "      npm run onboard:project -- ../viewer\n";

const pathArg = process.argv.slice(2).find((a) => !a.startsWith("-"));

if (!pathArg) {
  // No path given: idempotent audit branch. A configured, healthy seat is the all-green case —
  // nothing to create. An unconfigured seat needs a path, so guide and exit non-zero (the sequencer
  // stops here rather than trying to verify a phantom seat).
  if (PROJECT_CONFIGURED && PROJECT_FOUND) {
    console.log(`onboard:project: already configured — ${PROJECT_DIR}`);
    console.log(`  ✓ ${ENGINE_LABEL} project found (${ENGINE.projectFile}). Nothing created.`);
    process.exit(0);
  }
  if (PROJECT_CONFIGURED && !PROJECT_FOUND) {
    console.error(
      `onboard:project: configured at ${PROJECT_DIR}, but no ${ENGINE.projectFile} is there yet.\n` +
        `  Scaffold/clone your viewer into it, or repoint:\n` +
        `    npm run onboard:project -- <project-path>`,
    );
    process.exit(1);
  }
  console.error(
    "onboard:project: no project configured yet — name your viewer and pass its path.\n\n" + LAYOUT,
  );
  process.exit(1);
}

// A path was given: delegate to the blessed scaffold/wire path (new.js → setup → materialize →
// doctor). No duplication — this is exactly `npm run new`, framed as an onboarding step.
const target = path.resolve(pathArg);
console.log(`onboard:project: wiring ${target}\n`);
console.log(LAYOUT + "\n");
try {
  execFileSync("node", [path.join(here, "new.js"), ...process.argv.slice(2)], { stdio: "inherit" });
} catch {
  process.exit(1); // new.js already printed the failure
}
// Belt: confirm a project.godot actually landed (new.js scaffolds or wires; a bare non-empty dir
// with no project.godot would slip through otherwise).
if (!existsSync(path.join(target, ENGINE.projectFile))) {
  console.error(
    `onboard:project: ${target} has no ${ENGINE.projectFile} after wiring — check the output above.`,
  );
  process.exit(1);
}
