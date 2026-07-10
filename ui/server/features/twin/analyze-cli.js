// `npm run analyze` — the v1 dispatch surface for the analysis seam. Loads (or inline-builds) an
// analysis bundle, wraps the chosen task template around it, hands the composed prompt to the
// configured worker (openai-compatible | hermes), and the FRAMEWORK writes the returned narration to
// reports/analysis/<date>-<task>.md. The worker never writes a file (guardrail 1).
//
//   npm run analyze -- --task summarize-window --bundle bundle.json
//   npm run analyze -- --task narrate-anomalies --recording recordings/day.ndjson [--map M --sidecar S …]
//
// Unconfigured worker → a clear graceful-absence message pointing at setup, exit 1 (matching the
// `npm run hermes:check` precedent — the job could not be produced). No stack trace on config gaps.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FRAMEWORK_DIR, CONFIG_FILE, TWIN_PLUGIN_DIR } from "../../core/config.js";
import { parseJSON } from "../../../lib/json.js";
import { parseArgs } from "../../../../plugin/tools/sim/stream.js";
import { TASK_TYPES, isValidTask } from "./analysis-report.js";
// The dispatch orchestration (bundle resolution + worker select/run + report write) lives in one
// shared module so this CLI and the mcp__ui__analyze tool can never drift (the hermes-runs.js
// precedent). This file stays the arg-parsing + process (exit/stdout) adapter around it.
import {
  AnalyzeInputError,
  resolveBundleJson as resolveBundleJsonCore,
  dispatchAnalysis,
} from "./analysis-dispatch.js";

const EXIT_FAILURE = 1;

const USAGE =
  "usage: npm run analyze -- --task <" +
  TASK_TYPES.join("|") +
  "> (--bundle <bundle.json> | --recording <rec.ndjson> [--map M] [--sidecar S] " +
  "[--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] [--allow-oversize])";

/** Resolve the project root the report is written into. Deliberately NOT `config.PROJECT_DIR`: that
 * value is derived from `process.argv` positionals, and this CLI's own `--task <value>` leaves a
 * non-`--` token in argv that config would misread as a project path. Mirror config's env/saved/
 * default precedence WITHOUT the argv scan: GAME_DIR → `.xenodot.json` projectDir → `../game`.
 * @returns {string} */
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

/** Print a message + usage to stderr and exit nonzero. @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`analyze: ${msg}\n${USAGE}`);
  process.exit(EXIT_FAILURE);
}

/** Parse a numeric flag or null; exits on a non-numeric value. @param {Record<string, string>} args
 * @param {string} name @returns {number | null} */
function numFlag(args, name) {
  const raw = args[name];
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`--${name} must be a number (got '${raw}')`);
  return n;
}

/** Resolve the bundle JSON to analyze via the shared core, adapting argv-shaped flags to it: numeric
 * flags parsed (exit on non-numeric), `--tags` split, warnings printed, an AnalyzeInputError mapped
 * to the CLI's fail (message + usage + exit 1). @param {Record<string, string>} args @param {boolean}
 * allowOversize @returns {string} the canonical bundle JSON */
function resolveBundleJson(args, allowOversize) {
  const tags = args.tags
    ? args.tags
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;
  try {
    const { json, warnings } = resolveBundleJsonCore({
      bundle: args.bundle,
      recording: args.recording,
      map: args.map,
      sidecar: args.sidecar,
      fromMs: numFlag(args, "from-ms"),
      toMs: numFlag(args, "to-ms"),
      tags,
      pointsPerTag: numFlag(args, "points-per-tag"),
      allowOversize,
    });
    for (const w of warnings) console.warn(`analyze: WARNING — ${w}`);
    return json;
  } catch (err) {
    if (err instanceof AnalyzeInputError) fail(err.message);
    throw err;
  }
}

/** Run the analyze CLI. Injectable env (projectDir/tasksDir/now/adapterOpts) keeps it testable; the
 * process entrypoint below wires the real config. @param {string[]} argv @param {{ projectDir?:
 * string, tasksDir?: string, now?: () => string, adapterOpts?: object }} [deps] @returns {Promise<void>} */
export async function runAnalyzeCli(argv, deps = {}) {
  const projectDir = deps.projectDir ?? resolveProjectDir();
  const tasksDir = deps.tasksDir ?? path.join(TWIN_PLUGIN_DIR, "skills", "twin-analyze", "tasks");
  const now = deps.now ?? (() => new Date().toISOString());

  const allowOversize = argv.includes("--allow-oversize");
  const args = parseArgs(argv.filter((a) => a !== "--allow-oversize"));

  const task = args.task;
  if (!task) fail("--task is required");
  if (!isValidTask(task)) fail(`unknown --task "${task}" — one of: ${TASK_TYPES.join(", ")}`);

  const bundleJson = resolveBundleJson(args, allowOversize);

  const outcome = await dispatchAnalysis({
    projectDir,
    tasksDir,
    task,
    bundleJson,
    now,
    adapterOpts: deps.adapterOpts,
    onDispatch: ({ workerId, bundleSha256 }) => {
      console.log(
        `analyze: dispatching task '${task}' to worker '${workerId}' (bundle sha256 ${bundleSha256.slice(0, 12)}…)`,
      );
    },
  });

  if (outcome.ok) {
    console.log(
      `analyze: wrote ${outcome.report.path} — worker=${outcome.workerId} model=${outcome.model} bundle_sha256=${outcome.bundleSha256}`,
    );
    return;
  }
  switch (outcome.kind) {
    case "bad-task":
      fail(`unknown --task "${outcome.task}" — one of: ${TASK_TYPES.join(", ")}`);
      break;
    case "no-template":
      fail(`task template not found for "${outcome.task}" (${outcome.path})`);
      break;
    case "select-error":
      fail(outcome.error);
      break;
    case "unconfigured":
      // Graceful absence (guardrail 3): a clear message pointing at setup — not a crash — then exit 1.
      console.error(
        `analyze: worker '${outcome.workerId}' is not configured — ${outcome.reason}\n` +
          "No report was written. Configure the worker (see above), then re-run.",
      );
      process.exit(EXIT_FAILURE);
      break;
    case "worker-failed":
      fail(`worker '${outcome.workerId}' failed: ${outcome.error}`);
      break;
  }
}

// CLI: `node ui/server/features/twin/analyze-cli.js …` (via `npm run analyze`)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAnalyzeCli(process.argv.slice(2)).catch((e) => {
    fail(e instanceof Error ? e.message : String(e));
  });
}
