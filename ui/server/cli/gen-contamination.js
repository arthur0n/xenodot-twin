// Contamination gate — the deterministic half of the "is this capability AGNOSTIC?" rubric, run over
// the plugin's OWN skills/agents/tools. promote-run.js blocks contamination at the game→plugin
// boundary; this is the ONLY thing that catches capabilities authored DIRECT-TO-PLUGIN (bypassing
// promote entirely, as the WIP enemy skills did). Shares the exact scanner with promote
// (ui/server/features/promotions/contamination.js), so there is one definition and no drift. Mirrors
// gen-skill-scope.js: bare-node; wired into `npm run validate`, the pre-commit hook, and CI.
//
// Scans the PROMOTABLE kinds (skills/agents/tools) plus library/transcripts/ (shipped records:
// digests are game-mapping docs and belong game-local — design/library/transcripts/ — so any
// transcript left in the plugin library must read agnostic; one-game mapping language fails it).
//   node ui/server/cli/gen-contamination.js     # exits 1 on any contamination
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { FRAMEWORK_PLUGIN_DIR } from "../core/config.js";
import { scanPath } from "../features/promotions/contamination.js";

// res:// is checked for TOOLS only — a tool with a hardcoded game scene breaks other games' gates,
// whereas skills/agents cite res:// convention paths as legitimate illustrative examples.
// Mapping language ("our game/stack") is checked for RECORDS only — in an agent/skill prompt it is
// agnostic (resolves to whatever game the session points at); in a shipped record it pins one game.
const DIRS = [
  { dir: "skills", checkRes: false },
  { dir: "agents", checkRes: false },
  { dir: "tools", checkRes: true },
];

/** @type {Array<{ file: string, signal: string, match: string, hint: string }>} */
const hits = [];
for (const { dir, checkRes } of DIRS) {
  const root = path.join(FRAMEWORK_PLUGIN_DIR, dir);
  if (!existsSync(root)) continue;
  hits.push(...scanPath(root, { checkRes, all: true }));
}

// Shipped transcript records: top-level digests only — transcripts/archive/ holds consumed RAW
// video text (source backups, not framework-authored records) and must not be judged as records.
const TRANSCRIPTS = path.join(FRAMEWORK_PLUGIN_DIR, "library", "transcripts");
if (existsSync(TRANSCRIPTS))
  for (const e of readdirSync(TRANSCRIPTS, { withFileTypes: true }))
    if (e.isFile() && e.name.endsWith(".md"))
      hits.push(...scanPath(path.join(TRANSCRIPTS, e.name), { checkMapping: true, all: true }));

if (hits.length) {
  console.error(`✗ contamination: ${hits.length} game-specific ref(s) in the plugin spine:`);
  for (const h of hits) {
    console.error(
      `    ${path.relative(FRAMEWORK_PLUGIN_DIR, h.file)}: "${h.match}" (${h.signal}) — ${h.hint}`,
    );
  }
  console.error(
    "  The plugin ships to EVERY game and must stay agnostic. Strip the game-specific ref (the " +
      "game's own facts live game-local), or parameterize it — the same rule promote enforces.",
  );
  process.exit(1);
}
console.log("ok  contamination: plugin skills/agents/tools are agnostic");
