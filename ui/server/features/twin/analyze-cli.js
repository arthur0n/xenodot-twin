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
import {
  FRAMEWORK_DIR,
  CONFIG_FILE,
  TWIN_PLUGIN_DIR,
  getAnalysisConfig,
} from "../../core/config.js";
import { parseJSON } from "../../../lib/json.js";
import { parseArgs } from "../../../../plugin-twin/tools/sim/stream.js";
import { buildBundle, SIZE_BUDGET_BYTES } from "../../../../plugin-twin/tools/analyze/bundle.js";
import { selectWorker } from "./analysis.js";
import {
  TASK_TYPES,
  isValidTask,
  composeInstructions,
  sha256Hex,
  writeAnalysisReport,
} from "./analysis-report.js";

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

/** Read a file as `{ name, text }` (basename + contents), or null for a falsy path. @param {string |
 * undefined} p @returns {{ name: string, text: string } | null} */
function readInput(p) {
  if (!p) return null;
  return { name: path.basename(p), text: readFileSync(p, "utf8") };
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

/** Resolve the bundle JSON to analyze: read `--bundle` verbatim, or inline-build it from
 * `--recording` (+ optional map/sidecar/window/tags) through the same packager the standalone CLI
 * uses, enforcing the size budget unless `--allow-oversize`. @param {Record<string, string>} args
 * @param {boolean} allowOversize @returns {string} the canonical bundle JSON */
function resolveBundleJson(args, allowOversize) {
  if (args.bundle && args.recording) fail("pass either --bundle or --recording, not both");
  if (args.bundle) return readFileSync(args.bundle, "utf8");
  if (!args.recording) fail("one of --bundle or --recording is required");
  const tagsArg = args.tags
    ? args.tags
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;
  const pts = numFlag(args, "points-per-tag");
  if (pts !== null && (!Number.isInteger(pts) || pts <= 0))
    fail("--points-per-tag must be a positive integer");
  const recording = readInput(args.recording);
  if (!recording) fail("--recording could not be read");
  const { json, bytes } = buildBundle({
    recording,
    map: readInput(args.map),
    sidecar: readInput(args.sidecar),
    fromMs: numFlag(args, "from-ms"),
    toMs: numFlag(args, "to-ms"),
    tags: tagsArg,
    pointsPerTag: pts ?? undefined,
  });
  if (bytes > SIZE_BUDGET_BYTES && !allowOversize)
    fail(
      `inline bundle is ${bytes} bytes — ${bytes - SIZE_BUDGET_BYTES} over the ${SIZE_BUDGET_BYTES}-byte budget. ` +
        "Narrow --from-ms/--to-ms, select --tags, lower --points-per-tag, or pass --allow-oversize",
    );
  return json;
}

/** A human provider label for the frontmatter: the endpoint host for openai-compatible, or the
 * worker id for hermes. Best-effort — a bare id is fine if the URL doesn't parse. @param {string}
 * workerId @param {string | null} apiUrl @returns {string} */
function providerLabel(workerId, apiUrl) {
  if (workerId === "hermes") return "hermes";
  if (!apiUrl) return workerId;
  try {
    return new URL(apiUrl).host || workerId;
  } catch {
    return workerId;
  }
}

/** The window block from a bundle document (defaults preserved on a malformed/empty bundle).
 * @param {string} bundleJson @returns {{ from_ms: number | null, to_ms: number | null }} */
function windowOf(bundleJson) {
  try {
    const doc = /** @type {{ window?: { from_ms?: unknown, to_ms?: unknown } }} */ (
      parseJSON(bundleJson)
    );
    const w = doc.window;
    return {
      from_ms: typeof w?.from_ms === "number" ? w.from_ms : null,
      to_ms: typeof w?.to_ms === "number" ? w.to_ms : null,
    };
  } catch {
    return { from_ms: null, to_ms: null };
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
  const bundleSha256 = sha256Hex(bundleJson);

  /** @type {string} */
  let template;
  try {
    template = readFileSync(path.join(tasksDir, `${task}.md`), "utf8");
  } catch {
    fail(`task template not found for "${task}" (${path.join(tasksDir, `${task}.md`)})`);
  }
  const instructions = composeInstructions({ template, bundleJson });

  const selected = selectWorker({ adapterOpts: deps.adapterOpts });
  if (!selected.ok) fail(selected.error);
  const worker = selected.worker;

  const ready = worker.configured();
  if (ready !== true) {
    // Graceful absence (guardrail 3): a clear message pointing at setup — not a crash — then exit 1.
    console.error(
      `analyze: worker '${worker.id}' is not configured — ${ready}\n` +
        "No report was written. Configure the worker (see above), then re-run.",
    );
    process.exit(EXIT_FAILURE);
  }

  console.log(
    `analyze: dispatching task '${task}' to worker '${worker.id}' (bundle sha256 ${bundleSha256.slice(0, 12)}…)`,
  );
  let result;
  try {
    result = await worker.analyze({ instructions });
  } catch (err) {
    fail(`worker '${worker.id}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const provider = providerLabel(worker.id, getAnalysisConfig().apiUrl);
  const written = writeAnalysisReport({
    projectDir,
    task,
    workerId: worker.id,
    provider,
    model: result.model,
    bundleSha256,
    window: windowOf(bundleJson),
    body: result.output,
    createdAt: now(),
  });
  console.log(
    `analyze: wrote ${written.path} — worker=${worker.id} model=${result.model} bundle_sha256=${bundleSha256}`,
  );
}

// CLI: `node ui/server/features/twin/analyze-cli.js …` (via `npm run analyze`)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAnalyzeCli(process.argv.slice(2)).catch((e) => {
    fail(e instanceof Error ? e.message : String(e));
  });
}
