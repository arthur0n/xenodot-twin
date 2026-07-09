// One-time setup: remember which engine project (Godot or a fork — Redot /
// Blazium) the framework points at, so you don't pass a path on every start.
// Merges the absolute path into .xenodot.json (gitignored) in the framework root,
// preserving any `engine` / `hermes` block already there (see config.js / docs/engines.md).
//
// Usage: npm run setup -- ../viewer      (or any path to your digital-twin viewer project)
//        npm run setup                    (defaults to ../viewer, the sibling folder)
// Every project is a digital-twin VIEWER (loads plugin-twin + the viewer orchestrator); the game
// domain lives upstream in xenodot-forge, so `--game` is refused here.
//
// Hermes (external researcher) can be switched on here too — these only touch the
// `hermes` block, never the project path (use the web UI ⚙ Settings panel for the same):
//        npm run hermes -- --hermes --hermes-key=sk-… --hermes-model=anthropic/claude-opus-4.7
//        npm run hermes -- --hermes-off
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import {
  CONFIG_FILE,
  FRAMEWORK_DIR,
  ENGINE,
  ENGINE_LABEL,
  saveHermesConfig,
} from "../core/config.js";

const argv = process.argv.slice(2);
/** @param {string} name @returns {boolean} */
const flag = (name) => argv.includes(`--${name}`);
// xenodot-twin is viewer-only — refuse a game marker rather than write an unreachable projectType.
if (flag("game")) {
  console.error(
    "setup: xenodot-twin is viewer-only — there is no game domain here. Use xenodot-forge for games.",
  );
  process.exit(1);
}
/** @param {string} name @returns {string | undefined} */
const val = (name) =>
  argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");

// Any --hermes* flag means this run is (also) about the Hermes block.
const hermesArgs = argv.some((a) => a.startsWith("--hermes"));

if (hermesArgs) {
  /** @type {{ enabled?: boolean, apiUrl?: string, apiKey?: string, model?: string }} */
  const patch = {};
  if (flag("hermes")) patch.enabled = true;
  if (flag("hermes-off")) patch.enabled = false;
  if (val("hermes-key") != null) patch.apiKey = val("hermes-key");
  if (val("hermes-model") != null) patch.model = val("hermes-model");
  if (val("hermes-url") != null) patch.apiUrl = val("hermes-url");
  const res = saveHermesConfig(patch);
  if ("error" in res) {
    console.error(`Failed to write Hermes config: ${res.error}`);
    process.exit(1);
  }
  console.log(`Saved Hermes config → ${CONFIG_FILE}`);
  console.log(`  enabled: ${patch.enabled ?? "(unchanged)"}`);
  if (patch.model != null) console.log(`  model:   ${patch.model}`);
  if (patch.apiUrl != null) console.log(`  apiUrl:  ${patch.apiUrl}`);
  if (patch.apiKey != null) console.log(`  apiKey:  (saved, hidden)`);
}

// Project-path setup: skip entirely on a Hermes-only run (no explicit path arg), so
// `npm run hermes` never clobbers the saved project path with the ../game default.
const arg = argv.find((a) => !a.startsWith("--"));
if (arg || !hermesArgs) {
  const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "viewer"));
  // Preserve any existing config (e.g. a manually-added `engine` / `hermes` block).
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {}
  // Project type: xenodot-twin ships one domain, so every project is a digital-twin viewer
  // (loads plugin-twin + the viewer orchestrator). `--viewer` is accepted but redundant.
  const projectType = "viewer";
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...saved, projectDir: target, projectType }, null, 2) + "\n",
  );

  console.log(`Saved project path → ${CONFIG_FILE}`);
  console.log(`  projectDir: ${target}`);
  console.log(`  projectType: ${projectType}`);
  if (existsSync(path.join(target, ENGINE.projectFile))) {
    console.log(`  ✓ ${ENGINE_LABEL} project found. Run: npm start`);
  } else {
    console.log(`  ⚠ No ${ENGINE.projectFile} there yet. Clone your game into it, e.g.:`);
    console.log(`      git clone <your-project> "${target}"`);
  }
}
