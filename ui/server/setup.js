// One-time setup: remember which Godot project the framework points at, so you
// don't pass a path on every start. Writes the absolute path to .xenodot.json
// (gitignored) in the framework root.
//
// Usage: npm run setup -- ../game        (or any path to your Godot project)
//        npm run setup                    (defaults to ../game, the sibling folder)
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CONFIG_FILE, FRAMEWORK_DIR } from "./config.js";

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "game"));

writeFileSync(CONFIG_FILE, JSON.stringify({ projectDir: target }, null, 2) + "\n");

console.log(`Saved game project path → ${CONFIG_FILE}`);
console.log(`  projectDir: ${target}`);
if (existsSync(path.join(target, "project.godot"))) {
  console.log(`  ✓ Godot project found. Run: npm start`);
} else {
  console.log(`  ⚠ No project.godot there yet. Clone your game into it, e.g.:`);
  console.log(`      git clone <your-godot-project> "${target}"`);
}
