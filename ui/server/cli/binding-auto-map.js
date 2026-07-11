// `npm run binding:auto` — the terminal/seat surface that AUTHORS a binding map from a model's IFC
// property sidecar in one shot, instead of hand-writing one row at a time (what `npm run binding`
// helps with) or hand-grepping a 22 MB `<stem>_props.json`. It resolves the sidecar exactly like
// `npm run binding` (the SAME features/assets/binding-candidates.js core — --model stem, explicit
// --sidecar, or the single discovered one) and feeds it to the shared generator core
// (plugin/tools/gen_binding_map.js buildBindingMap), so this CLI, twin_build.sh --auto-map, and the
// materialized tools/gen_binding_map.js all produce the SAME map (one core, no drift).
//
//   npm run binding:auto -- --model Schependomlaan            # write models/Schependomlaan_auto_binding_map.json
//   npm run binding:auto -- --sidecar models/plant_props.json --out my_map.json --max 8
//   npm run binding:auto                                      # auto-picks the single model, prints to stdout
//
// Operator-run (a human typed the path), so it keeps absolute paths — confinement is the
// model-callable tool's job, not this CLI's (mirrors binding-candidates.js). A bad/absent/ambiguous
// sidecar or a geometry-free model is a graceful message + exit 1, never a stack trace.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FRAMEWORK_DIR, CONFIG_FILE } from "../core/config.js";
import { parseJSON } from "../../lib/json.js";
import { parseArgs } from "../../../plugin/tools/sim/stream.js";
import { buildBindingMap } from "../../../plugin/tools/gen_binding_map.js";
import { SidecarError, resolveSidecarPath, loadSidecar } from "../features/assets/binding-candidates.js";

const EXIT_FAILURE = 1;

const USAGE =
  "usage: npm run binding:auto -- [--model M | --sidecar path] [--out map.json] [--max N] " +
  "[--min-instances N] [--min V] [--max-value V]";

/** Resolve the project root to scan for sidecars — mirrors binding-candidates.js exactly (GAME_DIR →
 * `.xenodot.json` projectDir → `../game`), so `--model` resolves the same way on both surfaces.
 * @returns {string} */
function resolveProjectDir() {
  if (process.env.GAME_DIR) return path.resolve(process.env.GAME_DIR);
  try {
    const saved = /** @type {{ projectDir?: string }} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
    if (saved.projectDir) return path.resolve(saved.projectDir);
  } catch {
    /* absent/invalid — fall through to the default sibling */
  }
  return path.resolve(FRAMEWORK_DIR, "..", "game");
}

/** Print a FAIL verdict (stdout, greppable like the OK path) + message/usage to stderr, exit nonzero.
 * @param {string} msg @returns {never} */
function fail(msg) {
  console.log(`VERDICT: BINDING-AUTO-MAP FAIL — ${msg}`);
  console.error(`binding:auto: ${msg}\n${USAGE}`);
  process.exit(EXIT_FAILURE);
}

/** Parse a numeric flag or undefined; exits on a non-numeric value. @param {Record<string, string>}
 * args @param {string} name @returns {number | undefined} */
function numFlag(args, name) {
  const raw = args[name];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`--${name} must be a number (got '${raw}')`);
  return n;
}

/** Run the auto-map CLI. Injectable projectDir keeps it testable. @param {string[]} argv
 * @param {{ projectDir?: string }} [deps] @returns {void} */
export function runAutoMapCli(argv, deps = {}) {
  const args = parseArgs(argv);
  const projectDir = deps.projectDir ?? resolveProjectDir();
  try {
    const absPath = resolveSidecarPath({ projectDir, sidecar: args.sidecar, model: args.model });
    const { sidecar, bytes } = loadSidecar(absPath);
    const map = buildBindingMap(sidecar, {
      max: numFlag(args, "max"),
      minInstances: numFlag(args, "min-instances"),
      minValue: numFlag(args, "min"),
      maxValue: numFlag(args, "max-value"),
    });
    if (map.bindings.length === 0)
      fail(
        `'${path.basename(absPath)}' has no geometric element to bind (only spatial/grouping classes) ` +
          "— nothing to paint. Point at a model with geometry, or author a map by hand.",
      );
    const json = JSON.stringify(map, null, 2) + "\n";
    // Default output path derives from the sidecar stem, co-located beside it (the map lives with
    // the model it binds). Explicit --out wins; absolute or project-relative both honoured.
    const out = args.out
      ? path.isAbsolute(args.out)
        ? args.out
        : path.resolve(projectDir, args.out)
      : absPath.replace(/_props\.json$/, "_auto_binding_map.json");
    writeFileSync(out, json);
    console.log(
      `VERDICT: BINDING-AUTO-MAP OK — ${map.bindings.length} binding(s) → ${out} ` +
        `(from ${path.basename(absPath)}, ${(bytes / 1e6).toFixed(1)} MB)`,
    );
  } catch (err) {
    if (err instanceof SidecarError) fail(err.message);
    throw err;
  }
}

// CLI: `node ui/server/cli/binding-auto-map.js …` (via `npm run binding:auto`)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runAutoMapCli(process.argv.slice(2));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
