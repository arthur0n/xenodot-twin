// One-time setup: remember which engine project (Godot or a fork — Redot /
// Blazium) the framework points at, so you don't pass a path on every start.
// Merges the absolute path into .xenodot.json (gitignored) in the framework root,
// preserving any `engine` / `hermes` block already there (see config.js / docs/engines.md).
//
// Usage: npm run setup -- ../game        (or any path to your project)
//        npm run setup                    (defaults to ../game, the sibling folder)
//        npm run setup -- ../mytwin --viewer   (mark the project a digital-twin VIEWER —
//                                               loads plugin-twin + the viewer orchestrator)
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
  const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "game"));
  // Preserve any existing config (e.g. a manually-added `engine` / `hermes` block).
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {}
  // Project type: `--viewer` marks a digital-twin viewer; otherwise a previously saved "viewer"
  // is preserved and everything else normalizes to the "game" default — an old .xenodot.json
  // without the key keeps working, it just gains an explicit projectType on the next setup.
  const projectType = flag("viewer")
    ? "viewer"
    : saved.projectType === "viewer"
      ? "viewer"
      : "game";
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
