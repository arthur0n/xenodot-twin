// Health check for a game driven by the framework. Verifies the framework SOURCE (the
// xenodot plugin) is intact, the game is a valid engine project, and the per-game working
// files (tools copied, library linked) are materialized. Materializes first (idempotent),
// then checks. Exits non-zero on any HARD failure so it can gate `new` and CI.
//
// Usage: npm run doctor                  (the configured game, see config.js)
//        npm run doctor -- /path/to/game
//        node ui/server/cli/doctor.js /path/to/game
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  PROJECT_DIR,
  PROJECT_CONFIGURED,
  FRAMEWORK_PLUGIN_DIR,
  ENGINE,
  ENGINE_LABEL,
  PROFILE,
  RES_ASSET_MOUNT,
  ASSET_LIBRARY_EXTERNAL,
} from "../core/config.js";
import { prepareGame } from "./materialize.js";
import { readPromotions, approvedPending } from "../features/promotions/promotions-store.js";

/** Count files with a suffix in a dir (0 if missing). @param {string} dir @param {string} suffix */
function countFiles(dir, suffix) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

/** Count immediate subdirectories (0 if missing). @param {string} dir */
function countDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
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

/** @returns {boolean} */
function hasGraphify() {
  try {
    execFileSync("graphify", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function libraryLinked() {
  try {
    return lstatSync(path.join(PROJECT_DIR, "library")).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Whether the res://x-shared-assets mount is present — a real in-project dir (the default) or a
 * symlink into an external shared library. @returns {boolean} */
function assetMountReady() {
  try {
    lstatSync(path.join(PROJECT_DIR, RES_ASSET_MOUNT));
    return true;
  } catch {
    return false;
  }
}

// Honest unconfigured / missing states (D7-no-silent-sibling-dirs): there is nothing to check and,
// crucially, nothing to materialize — refuse rather than mkdir tools/ into a phantom seat. (The
// live session guard `projectDirMissing` covers the same for the spawn path; this covers the CLI.)
if (!PROJECT_CONFIGURED) {
  console.error(
    "doctor: no project configured. Name your viewer and point the framework at it:\n" +
      "  npm run setup -- <project-path>      (or scaffold one: npm run new -- <project-path>)\n" +
      "See the per-project workspace layout in the README Quickstart.",
  );
  process.exit(1);
}
if (!existsSync(PROJECT_DIR)) {
  console.error(
    `doctor: configured project directory is missing: ${PROJECT_DIR}\n` +
      "  repoint it: npm run setup -- <project-path>",
  );
  process.exit(1);
}

// Bring the project's generated files up to date (tools copied, library linked), then check.
prepareGame(PROJECT_DIR);

const pluginAgents = countFiles(path.join(FRAMEWORK_PLUGIN_DIR, "agents"), ".md");
const pluginSkills = countDirs(path.join(FRAMEWORK_PLUGIN_DIR, "skills"));

/** @type {{ ok: boolean, hard: boolean, label: string }[]} */
const checks = [
  {
    ok: existsSync(path.join(FRAMEWORK_PLUGIN_DIR, ".claude-plugin", "plugin.json")),
    hard: true,
    label: "xenodot plugin manifest present",
  },
  {
    ok: pluginAgents > 0 && pluginSkills > 0,
    hard: true,
    label: `plugin capabilities (${pluginAgents} agents, ${pluginSkills} skills)`,
  },
  {
    ok: existsSync(path.join(PROJECT_DIR, ENGINE.projectFile)),
    hard: true,
    label: `${ENGINE.projectFile} present (${ENGINE_LABEL} project)`,
  },
  {
    ok: existsSync(path.join(PROJECT_DIR, "tools", "validate.sh")),
    hard: true,
    label: "tools/ materialized into the game (gitignored)",
  },
  {
    ok: Boolean(ENGINE.bin),
    hard: false,
    label: ENGINE.bin
      ? `${ENGINE_LABEL} binary resolved ($GODOT=${ENGINE.bin})`
      : `${ENGINE_LABEL} binary not found — set GODOT=/path/to/${ENGINE.name} (agents will re-derive it per call)`,
  },
  {
    ok: existsSync(path.join(PROJECT_DIR, ".xenodot", "manifest.json")),
    hard: false,
    label: "facts manifest generated (.xenodot/manifest.json)",
  },
  {
    ok: Boolean(PROFILE.genre && PROFILE.style),
    hard: false,
    label:
      PROFILE.genre && PROFILE.style
        ? `profile declared (${PROFILE.genre}/${PROFILE.style}) — genre/style skills filtered to it`
        : "profile not declared — every genre/style skill preloads (filter fails open); set it: " +
          "npm run setup -- <game-path> --genre=… --style=…",
  },
  { ok: libraryLinked(), hard: false, label: "library/ symlinked to the plugin" },
  {
    ok: assetMountReady(),
    hard: false,
    label: ASSET_LIBRARY_EXTERNAL
      ? `${RES_ASSET_MOUNT}/ symlinked to the external asset library`
      : `${RES_ASSET_MOUNT}/ present in the project (in-project asset library)`,
  },
  { ok: hasRtk(), hard: false, label: "rtk on PATH (optional — hook no-ops without it)" },
  {
    ok: hasGraphify(),
    hard: false,
    label:
      "graphify on PATH (optional — codebase knowledge-graph; install: uv tool install graphifyy)",
  },
];

console.log(`doctor: checking ${PROJECT_DIR}`);
let hardFails = 0;
for (const c of checks) {
  const mark = c.ok ? "✓" : c.hard ? "✗" : "—";
  console.log(`  ${mark} ${c.label}`);
  if (!c.ok && c.hard) hardFails += 1;
}

// Soft: surface pending promotion requests so an approved capability never sits
// un-promoted just because the chat scrolled away (see promotions-store.js).
const requested = readPromotions().filter((p) => p.status === "requested").length;
const approved = approvedPending().length;
if (requested || approved) {
  console.log(
    `  ⇧ promotions: ${requested} awaiting a decision, ${approved} approved — ` +
      "run `npm run promote -- --pending` to apply the approved ones.",
  );
}

if (hardFails > 0) {
  console.error(`doctor: ${hardFails} hard check(s) failed.`);
  process.exit(1);
}
console.log("doctor: OK");
console.log(
  "  Terminal use: install the xenodot plugin once —\n" +
    "    /plugin marketplace add " +
    path.dirname(FRAMEWORK_PLUGIN_DIR) +
    "\n    /plugin install xenodot@xenodot-twin\n" +
    "  (The web UI loads it automatically — no install needed.)",
);
