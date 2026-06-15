// One-time setup: remember which engine project (Godot or a fork — Redot /
// Blazium) the framework points at, so you don't pass a path on every start.
// Merges the absolute path into .xenodot.json (gitignored) in the framework root,
// preserving any `engine` block already there (see config.js / docs/engines.md).
//
// Usage: npm run setup -- ../game        (or any path to your project)
//        npm run setup                    (defaults to ../game, the sibling folder)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../lib/json.js";
import { CONFIG_FILE, FRAMEWORK_DIR, ENGINE, ENGINE_LABEL } from "./config.js";

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "game"));

// Preserve any existing config (e.g. a manually-added `engine` block).
/** @type {Record<string, unknown>} */
let saved = {};
try {
  saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
} catch {}
writeFileSync(CONFIG_FILE, JSON.stringify({ ...saved, projectDir: target }, null, 2) + "\n");

console.log(`Saved project path → ${CONFIG_FILE}`);
console.log(`  projectDir: ${target}`);
if (existsSync(path.join(target, ENGINE.projectFile))) {
  console.log(`  ✓ ${ENGINE_LABEL} project found. Run: npm start`);
} else {
  console.log(`  ⚠ No ${ENGINE.projectFile} there yet. Clone your game into it, e.g.:`);
  console.log(`      git clone <your-project> "${target}"`);
}
