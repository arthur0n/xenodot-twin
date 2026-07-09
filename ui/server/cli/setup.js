// One-time setup: remember which engine project (Godot or a fork — Redot /
// Blazium) the framework points at, so you don't pass a path on every start.
// Merges the absolute path into .xenodot.json (gitignored) in the framework root,
// preserving any `engine` / `hermes` block already there (see config.js / docs/engines.md).
//
// Usage: npm run setup -- ../game        (or any path to your project)
//        npm run setup                    (defaults to ../game, the sibling folder)
//
// The game's profile ({genre, style}, see ui/lib/profile.js) is captured here too:
// --genre=…/--style=… flags win; missing values prompt on a TTY; non-interactive
// runs leave the profile unset (a soft state doctor points out — never a failure):
//        npm run setup -- ../game --genre=genre-topdown-iso --style=style-hd
//
// Hermes (external researcher) can be switched on here too — these only touch the
// `hermes` block, never the project path (use the web UI ⚙ Settings panel for the same):
//        npm run hermes -- --hermes --hermes-key=sk-… --hermes-model=anthropic/claude-opus-4.7
//        npm run hermes -- --hermes-off
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { parseJSON } from "../../lib/json.js";
import { GENRES, STYLES, validateProfile } from "../../lib/profile.js";
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

/** One profile question: numbered menu of known values plus free text (the enum is a
 * soft allow-list — a custom tag is accepted with a warning downstream). Enter picks
 * `fallback` (a labeled safe default for style, skip/null for genre — guessing a genre
 * would make M2 hide the correct skills, so there is no genre default).
 * @param {import("node:readline").Interface} rl @param {string} kind
 * @param {string[]} options @param {string | null} fallback
 * @returns {Promise<string | null>} */
async function askProfileValue(rl, kind, options, fallback) {
  console.log(`\n${kind}:`);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt}`);
  });
  const hint = fallback ? `Enter = ${fallback}` : "Enter = skip";
  const answer = (
    await /** @type {Promise<string>} */ (
      new Promise((resolve) => {
        rl.question(`  choice [number, custom value, or ${hint}]: `, resolve);
      })
    )
  ).trim();
  if (answer === "") return fallback;
  const picked = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
  return picked ?? answer;
}

// Project-path setup: skip entirely on a Hermes-only run (no explicit path arg), so
// `npm run hermes` never clobbers the saved project path (or profile) with defaults.
const arg = argv.find((a) => !a.startsWith("--"));
if (arg || !hermesArgs) {
  const target = path.resolve(arg ?? path.join(FRAMEWORK_DIR, "..", "game"));
  // Preserve any existing config (e.g. a manually-added `engine` / `hermes` block).
  /** @type {Record<string, unknown>} */
  let saved = {};
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {}

  // Profile ({genre, style}) — precedence: CLI flags → already-saved value →
  // interactive prompt (TTY only) → left unset. Absence is a soft state (doctor
  // warns); no fabricated default — a wrong genre would filter the WRONG skills (M2).
  const flagGenre = val("genre");
  const flagStyle = val("style");
  for (const [name, v] of [
    ["genre", flagGenre],
    ["style", flagStyle],
  ]) {
    if (typeof v === "string" && v.trim() === "") {
      console.error(`setup: --${name}= needs a value, e.g. --${name}=${name}-…`);
      process.exit(1);
    }
  }
  // A saved profile only carries over when re-running setup for the SAME game — the
  // profile describes the game, not the framework seat, so pointing at a new game must
  // never silently inherit the previous game's genre/style.
  const sameGame =
    typeof saved.projectDir === "string" && path.resolve(saved.projectDir) === target;
  const prev = /** @type {{ genre?: string | null, style?: string | null }} */ (
    (sameGame ? saved.profile : undefined) ?? {}
  );
  let rawGenre = flagGenre ?? prev.genre ?? null;
  let rawStyle = flagStyle ?? prev.style ?? null;
  if (rawGenre == null || rawStyle == null) {
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log("\nGame profile — drives which genre-*/style-* skills sessions load.");
      rawGenre ??= await askProfileValue(rl, "Genre", GENRES, null);
      // style-hd is the neutral M3 baseline, so Enter is a safe labeled default here.
      rawStyle ??= await askProfileValue(rl, "Style", STYLES, "style-hd");
      rl.close();
    } else {
      console.log(
        "  profile: left unset (non-interactive, no --genre/--style) — declare later:\n" +
          `    npm run setup -- ${target} --genre=… --style=…`,
      );
    }
  }
  const { profile, warnings } = validateProfile({ genre: rawGenre, style: rawStyle });
  for (const w of warnings) console.warn(`  ⚠ ${w}`);

  // Note: an old .xenodot.json may carry a stale `projectType` key from the retired viewer
  // domain — it is preserved by the spread and ignored everywhere (harmless unknown key).
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ ...saved, projectDir: target, profile }, null, 2) + "\n",
  );

  console.log(`Saved project path → ${CONFIG_FILE}`);
  console.log(`  projectDir: ${target}`);
  console.log(
    `  profile:    genre=${profile.genre ?? "(unset)"} style=${profile.style ?? "(unset)"}`,
  );
  if (existsSync(path.join(target, ENGINE.projectFile))) {
    console.log(`  ✓ ${ENGINE_LABEL} project found. Run: npm start`);
  } else {
    console.log(`  ⚠ No ${ENGINE.projectFile} there yet. Clone your game into it, e.g.:`);
    console.log(`      git clone <your-project> "${target}"`);
  }
}
