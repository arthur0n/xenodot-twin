// `npm run binding` — the terminal/seat surface for authoring a binding map WITHOUT hand-grepping a
// 22 MB `<model>_props.json`. Lists candidate GlobalIds out of a model's IFC property sidecar,
// filtered by IFC class / Name (+ best-effort storey), so a human or agent picks joins instead of
// scanning the whole file. It wraps the SAME shared core (features/assets/binding-candidates.js) the
// `mcp__ui__find_binding_candidates` tool and the `/api/binding-candidates` UI endpoint call, so the
// three surfaces can never drift (the analyze-cli.js ↔ analyze-tool.js precedent). Operator-run, so
// it keeps absolute paths (a human typed them) — confinement is only the model-callable tool's job.
//
//   npm run binding -- --class IfcWall --name balkon           # auto-picks the single model
//   npm run binding -- --model Schependomlaan --class IfcDoor --limit 20
//   npm run binding -- --sidecar models/Duplex_A_20110907_props.json --class IfcWall --json
//
// Prints a candidate table + a VERDICT line to stdout; `--json` emits the machine artifact instead.
// A bad/absent/ambiguous sidecar is a graceful message + exit 1, never a stack trace.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FRAMEWORK_DIR, CONFIG_FILE } from "../core/config.js";
import { parseJSON } from "../../lib/json.js";
import { parseArgs } from "../../../plugin-twin/tools/sim/stream.js";
import {
  SidecarError,
  resolveSidecarPath,
  loadSidecar,
  queryCandidates,
} from "../features/assets/binding-candidates.js";

const EXIT_FAILURE = 1;

const USAGE =
  "usage: npm run binding -- [--model M | --sidecar path] [--class IfcWall] [--name substr] " +
  "[--storey substr] [--limit N] [--offset K] [--json]";

/** Resolve the project root to scan for sidecars. Mirrors analyze-cli's precedence WITHOUT config's
 * argv scan (this CLI's `--model <value>` would leave a non-`--` token config could misread as a
 * path): GAME_DIR → `.xenodot.json` projectDir → `../game`. @returns {string} */
function resolveProjectDir() {
  if (process.env.GAME_DIR) return path.resolve(process.env.GAME_DIR);
  try {
    const saved = /** @type {{ projectDir?: string }} */ (
      parseJSON(readFileSync(CONFIG_FILE, "utf8"))
    );
    if (saved.projectDir) return path.resolve(saved.projectDir);
  } catch {
    /* absent/invalid — fall through to the default sibling */
  }
  return path.resolve(FRAMEWORK_DIR, "..", "game");
}

/** Print a FAIL verdict (stdout, greppable like the OK path — verdict on EVERY terminal path) plus
 * the message + usage to stderr, and exit nonzero. @param {string} msg @returns {never} */
function fail(msg) {
  console.log(`VERDICT: BINDING-CANDIDATES FAIL — ${msg}`);
  console.error(`binding: ${msg}\n${USAGE}`);
  process.exit(EXIT_FAILURE);
}

/** Parse a numeric flag or undefined; exits on a non-numeric value. @param {Record<string, string>}
 * args @param {string} name @returns {number | undefined} */
function numFlag(args, name) {
  const raw = args[name];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`--${name} must be a number (got '${raw}')`);
  return n;
}

/** Render the human table (the `--json` path prints the raw result instead).
 * @param {string} label @param {import("../features/assets/binding-candidates.js").CandidateResult} r */
function printTable(label, r) {
  console.log(`# ${label}`);
  console.log(
    `matched ${r.matched} of ${r.total} — showing ${r.count} (offset ${r.offset}, limit ${r.limit})`,
  );
  console.log(
    "classes: " + (r.classes.map((c) => `${c.ifcClass}×${c.count}`).join(", ") || "(none)"),
  );
  for (const c of r.candidates) {
    const st = c.storey ? `  [${c.storey}]` : "";
    console.log(`  ${c.globalId}  ${c.ifcClass}  ${c.name ?? "(unnamed)"}${st}`);
  }
  if (r.offset + r.count < r.matched)
    console.log(
      `… ${r.matched - r.offset - r.count} more — re-run with --offset ${r.offset + r.limit}`,
    );
  // Verdict line (every terminal path): the honest signal a seat can grep for.
  console.log(`VERDICT: BINDING-CANDIDATES OK — ${r.matched} match, ${r.count} shown`);
}

/** Run the binding-candidates CLI. Injectable projectDir keeps it testable. @param {string[]} argv
 * @param {{ projectDir?: string }} [deps] @returns {void} */
export function runBindingCli(argv, deps = {}) {
  const args = parseArgs(argv);
  const asJson = argv.includes("--json");
  const projectDir = deps.projectDir ?? resolveProjectDir();
  try {
    // parseArgs omits absent flags (undefined) and gives "" to a value-less one; both read as
    // "no filter" downstream (resolveSidecarPath treats "" as absent, queryCandidates trims it).
    const absPath = resolveSidecarPath({
      projectDir,
      sidecar: args.sidecar,
      model: args.model,
    });
    const { sidecar, bytes } = loadSidecar(absPath);
    const result = queryCandidates(sidecar, {
      ifcClass: args.class,
      name: args.name,
      storey: args.storey,
      limit: numFlag(args, "limit"),
      offset: numFlag(args, "offset"),
    });
    if (asJson) {
      console.log(
        JSON.stringify({ sidecar: absPath, bytes, verdict: "BINDING-CANDIDATES OK", ...result }),
      );
      return;
    }
    printTable(`${path.basename(absPath)} (${(bytes / 1e6).toFixed(1)} MB)`, result);
  } catch (err) {
    if (err instanceof SidecarError) fail(err.message);
    throw err;
  }
}

// CLI: `node ui/server/cli/binding-candidates.js …` (via `npm run binding`)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBindingCli(process.argv.slice(2));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
