// Contamination gate — the deterministic half of the "is this capability AGNOSTIC?" rubric, run over
// the plugin's OWN skills/agents/tools. promote-run.js blocks contamination at the game→plugin
// boundary; this is the ONLY thing that catches capabilities authored DIRECT-TO-PLUGIN (bypassing
// promote entirely, as the WIP enemy skills did). Shares the exact scanner with promote
// (ui/server/features/promotions/contamination.js), so there is one definition and no drift. Mirrors
// gen-skill-scope.js: bare-node; wired into `npm run validate`, the pre-commit hook, and CI.
//
// Scans the PROMOTABLE kinds (skills/agents/tools) plus EVERY shipped library record kind
// (verdicts/findings/addons/tools/sources/drafts/transcripts): a record pins one game the moment it
// names that game's scenes/codenames or judges content against "our stack", and the library ships
// to every game — so records get the same codename/path/provenance scan plus the records-only
// one-game-mapping signal (checkMapping). archive/ subdirs hold consumed RAW source backups (not
// framework-authored records) and are skipped.
//   node ui/server/cli/gen-contamination.js     # exits 1 on any contamination
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { FRAMEWORK_DIR, FRAMEWORK_PLUGIN_DIR, TWIN_PLUGIN_DIR } from "../core/config.js";
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

// BOTH plugin roots get the same gate: plugin-twin/ ships to every VIEWER project, so its
// content must be viewer-domain-generic by the exact same signals (codenames, absolute paths,
// sibling-game refs, provenance) — one scanner, no twin-specific vocabulary. A missing
// plugin-twin (a plain fork) is skipped.
const ROOTS = [FRAMEWORK_PLUGIN_DIR, TWIN_PLUGIN_DIR].filter((r) => existsSync(r));

/** @type {Array<{ file: string, signal: string, match: string, hint: string }>} */
const hits = [];
for (const root of ROOTS) {
  for (const { dir, checkRes } of DIRS) {
    const kindRoot = path.join(root, dir);
    if (!existsSync(kindRoot)) continue;
    hits.push(...scanPath(kindRoot, { checkRes, all: true }));
  }
  // Shipped library records — every kind, not just transcripts: a verdict/finding/addon/tool
  // record that names one game's scenes or codenames pins the library to that game. Same scan as
  // the promotable kinds plus the records-only one-game-mapping signal (checkMapping). Skip each
  // kind's archive/ (consumed RAW source backups, e.g. transcripts/archive/ video text — not
  // framework-authored records). scanPath recurses, so nested record dirs (addons/<pack>/) are covered.
  const RECORD_KINDS = [
    "verdicts",
    "findings",
    "addons",
    "tools",
    "sources",
    "drafts",
    "transcripts",
  ];
  for (const kind of RECORD_KINDS) {
    const kindRoot = path.join(root, "library", kind);
    if (!existsSync(kindRoot)) continue;
    for (const e of readdirSync(kindRoot, { withFileTypes: true })) {
      if (e.name === "archive" || e.name === "index.md") continue;
      hits.push(...scanPath(path.join(kindRoot, e.name), { checkMapping: true, all: true }));
    }
  }
}

const labels = ROOTS.map((r) => path.basename(r)).join(" + ");
if (hits.length) {
  console.error(`✗ contamination: ${hits.length} game-specific ref(s) in the plugin spine:`);
  for (const h of hits) {
    console.error(
      `    ${path.relative(FRAMEWORK_DIR, h.file)}: "${h.match}" (${h.signal}) — ${h.hint}`,
    );
  }
  console.error(
    "  The plugin ships to EVERY game and must stay agnostic. Strip the game-specific ref (the " +
      "game's own facts live game-local), or parameterize it — the same rule promote enforces.",
  );
  process.exit(1);
}
console.log(`ok  contamination: ${labels} skills/agents/tools + library records are agnostic`);
