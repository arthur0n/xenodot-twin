// tools/analyze/bundle.js — the analysis seam's DATA-IN packager (Contract 1).
//
// Reads a twin recording (NDJSON, tools/sim/recording.js) plus an optional binding map and
// property sidecar, and emits ONE deterministic JSON document — the "analysis bundle" a swappable
// worker (another model, or a human pasting into a chat UI) narrates. The bundle carries:
//   • header    — schema version + kind, sha256 of every input file (provenance: a report is only
//                 as honest as the bytes it saw), the recording header passed through, the window
//                 actually analyzed;
//   • stats     — per-tag deterministic statistics (tools/analyze/stats.js);
//   • series    — a stride-decimated [t_ms, value] series per tag (default POINTS_PER_TAG);
//   • bindings  — tag → GlobalId(s) → a curated sidecar subset (name, type, level) so a worker can
//                 say "the pump on level 2", not "tag pump_1".
//
//   node tools/analyze/bundle.js --recording recordings/day.ndjson \
//       [--map binding_map.json] [--sidecar models/duplex_props.json] \
//       [--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] \
//       [--allow-oversize] --out bundle.json
//
// Byte-stable output: key order is FIXED by construction (like recording.js), arrays are used for
// every tag-keyed collection (sorted by tag — never an object map, whose integer-like keys V8 may
// reorder), and all numbers are plain doubles. Same inputs + same flags ⇒ byte-identical bundle.
//
// Size budget ENFORCED: a default bundle targets ≤ SIZE_BUDGET_BYTES so it inlines into any
// provider's context. Over budget, the CLI FAILS LOUDLY (nonzero exit, no file written) and points
// at the levers — unless --allow-oversize downgrades it to a loud warning. The pure buildBundle()
// never writes or exits; the CLI wrapper owns the fs + the budget gate.
//
// Dependency-free by design: the materialized tools/ ships no package.json, so this must run under
// a bare `node` (see tools/sim/server.js's header for the full rationale).
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "../sim/stream.js";
import { RECORDING_KIND } from "../sim/recording.js";
import { filterWindow, groupByTag, seriesOf, tagStats, decimate } from "./stats.js";

/** @typedef {import("../sim/recording.js").RecordingFrame} RecordingFrame */
/** @typedef {import("./stats.js").TagStats} TagStats */
/** @typedef {import("./stats.js").Sample} Sample */
/** @typedef {import("./stats.js").Limit} Limit */

/** Bundle schema version. Bump ONLY on a breaking shape change. */
export const SCHEMA_VERSION = 1;

/** The `kind` discriminator every bundle carries, so a worker can reject arbitrary JSON. */
export const BUNDLE_KIND = "twin-analysis-bundle";

/** Stable provenance string naming the producer (no code version — schema_version carries shape). */
export const GENERATED_BY = "tools/analyze/bundle.js";

/** Default decimated points per tag. ~200 keeps a day of data legible AND small; stride
 * decimation is deterministic and dumb on purpose (stats.js `decimate`). */
export const DEFAULT_POINTS_PER_TAG = 200;

/** Size budget in bytes (~100 KB) so a default bundle inlines into any provider's context,
 * including Hermes' runs-API instruction string. Documented AND enforced by the CLI. */
export const SIZE_BUDGET_BYTES = 100 * 1024;

/** Sidecar pset property keys that name an element's storey/level, in priority order — the first
 * one found (scanning psets in sorted name order) is the curated `level`. Covers the common Revit
 * conventions across element types: hosted elements carry `Level`/`Reference Level`, walls carry
 * `Base Constraint` (e.g. "Level 1"). */
const LEVEL_KEYS = ["Level", "Reference Level", "Base Level", "Base Constraint"];

/** Process exit status for any CLI failure — conventional POSIX nonzero. */
const EXIT_FAILURE = 1;

/** One input file as text + its display name (basename — absolute paths would leak into the
 * bundle and hurt cross-machine stability; the sha256 is the real provenance). */
/** @typedef {{ name: string, text: string }} InputFile */

/** The provenance record for one input file, as it appears in the bundle. */
/** @typedef {{ name: string, bytes: number, sha256: string }} InputMeta */

/** The bundle's `inputs` block: the recording always, map/sidecar when supplied. */
/** @typedef {{ recording: InputMeta, map: InputMeta | null, sidecar: InputMeta | null }}
 * InputsBlock */

/** A parsed sidecar entry — untyped fields narrowed on use. */
/** @typedef {{ ifc_class?: unknown, name?: unknown, psets?: unknown }} SidecarEntry */

/** The recording header, passed through into the bundle. */
/** @typedef {{ version: number, kind: string, hz: number, seed: number,
 *   tags: { tag: string, min: number, max: number }[] }} RecordingHeader */

/** A curated binding element: the sidecar fields a narration would cite. */
/** @typedef {{ global_id: string, name: string | null, type: string | null,
 *   level: string | number | null }} BindingElement */

/** Total-order string compare by code unit — deterministic across machines (unlike locale-aware
 * localeCompare). @param {string} a @param {string} b @returns {number} */
function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** sha256 of a UTF-8 string (node:crypto — deterministic, dependency-free). @param {string} text
 * @returns {string} */
function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** JSON.parse laundered through `unknown` (keeps the module free of unchecked `any` under strict
 * checkJs); returns null on malformed input. @param {string} text @returns {unknown} */
function tryParse(text) {
  try {
    return /** @type {unknown} */ (JSON.parse(text));
  } catch {
    return null;
  }
}

/** A finite number, or a fallback. @param {unknown} u @param {number} fallback @returns {number} */
function numOr(u, fallback) {
  return typeof u === "number" && Number.isFinite(u) ? u : fallback;
}

/** A string, or null. @param {unknown} u @returns {string | null} */
function strOrNull(u) {
  return typeof u === "string" ? u : null;
}

/** Parse and validate the recording NDJSON: line 1 is the header (kind-checked), the rest are
 * frames (malformed frames skipped — the same tolerance as the sim's live recorder).
 * @param {string} text @returns {{ header: RecordingHeader, frames: RecordingFrame[] }} */
function parseRecording(text) {
  const lines = text.split("\n").filter((l) => l.length > 0);
  const first = lines[0];
  if (first === undefined) throw new Error("recording is empty");
  const header = parseHeader(first);
  /** @type {RecordingFrame[]} */
  const frames = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseFrame(lines[i]);
    if (f) frames.push(f);
  }
  return { header, frames };
}

/** Narrow the header line into a RecordingHeader, throwing on a wrong/absent `kind` (so a random
 * NDJSON file that merely looks frame-shaped is rejected). @param {string} line
 * @returns {RecordingHeader} */
function parseHeader(line) {
  const parsed = tryParse(line);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("recording header is not a JSON object");
  }
  const h = /** @type {{ version?: unknown, kind?: unknown, hz?: unknown, seed?: unknown,
   *   tags?: unknown }} */ (parsed);
  const kind = typeof h.kind === "string" ? h.kind : "";
  if (kind !== RECORDING_KIND) {
    throw new Error(`recording header kind '${kind}' is not '${RECORDING_KIND}'`);
  }
  return {
    version: numOr(h.version, 0),
    kind,
    hz: numOr(h.hz, 0),
    seed: numOr(h.seed, 0),
    tags: headerTagsOf(h.tags),
  };
}

/** Narrow the header's tag table (each row: tag name + [min,max]). @param {unknown} u
 * @returns {{ tag: string, min: number, max: number }[]} */
function headerTagsOf(u) {
  if (!Array.isArray(u)) return [];
  const list = /** @type {readonly unknown[]} */ (u);
  /** @type {{ tag: string, min: number, max: number }[]} */
  const rows = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const r = /** @type {{ tag?: unknown, min?: unknown, max?: unknown }} */ (item);
    if (typeof r.tag !== "string") continue;
    rows.push({ tag: r.tag, min: numOr(r.min, NaN), max: numOr(r.max, NaN) });
  }
  return rows;
}

/** Narrow one frame line, or null if it isn't a valid `{t_ms,tag,value,seq}` frame. @param
 * {string | undefined} line @returns {RecordingFrame | null} */
function parseFrame(line) {
  if (line === undefined) return null;
  const parsed = tryParse(line);
  if (typeof parsed !== "object" || parsed === null) return null;
  const f = /** @type {{ t_ms?: unknown, tag?: unknown, value?: unknown, seq?: unknown }} */ (
    parsed
  );
  if (
    typeof f.t_ms !== "number" ||
    typeof f.tag !== "string" ||
    typeof f.value !== "number" ||
    typeof f.seq !== "number"
  ) {
    return null;
  }
  return { t_ms: f.t_ms, tag: f.tag, value: f.value, seq: f.seq };
}

/** Pull the `bindings` array out of a parsed map file as rows with still-untyped fields (the same
 * laundering as tools/sim/stream.js). @param {unknown} parsed
 * @returns {{ tag?: unknown, min?: unknown, max?: unknown, globalid?: unknown }[]} */
function bindingsOf(parsed) {
  if (typeof parsed !== "object" || parsed === null) return [];
  const raw = /** @type {{ bindings?: unknown }} */ (parsed).bindings;
  if (!Array.isArray(raw)) return [];
  const list = /** @type {readonly unknown[]} */ (raw);
  /** @type {{ tag?: unknown, min?: unknown, max?: unknown, globalid?: unknown }[]} */
  const out = [];
  for (const item of list) {
    if (typeof item === "object" && item !== null) {
      out.push(
        /** @type {{ tag?: unknown, min?: unknown, max?: unknown, globalid?: unknown }} */ (item),
      );
    }
  }
  return out;
}

/** Parse a binding map into per-tag limits + per-tag GlobalId lists (map order, deduped). @param
 * {string} text @returns {{ limits: Map<string, Limit>, globalIds: Map<string, string[]> }} */
function parseMap(text) {
  const bindings = bindingsOf(tryParse(text));
  /** @type {Map<string, Limit>} */
  const limits = new Map();
  /** @type {Map<string, string[]>} */
  const globalIds = new Map();
  for (const b of bindings) {
    const tag = strOrNull(b.tag);
    if (tag === null) continue;
    const min = numOr(b.min, NaN);
    const max = numOr(b.max, NaN);
    if (Number.isFinite(min) && Number.isFinite(max) && !limits.has(tag)) {
      limits.set(tag, { min, max });
    }
    const gid = strOrNull(b.globalid);
    if (gid !== null) {
      const arr = globalIds.get(tag) ?? [];
      if (!arr.includes(gid)) arr.push(gid);
      globalIds.set(tag, arr);
    }
  }
  return { limits, globalIds };
}

/** Parse a property sidecar (object keyed by GlobalId) into a lookup map. @param {string} text
 * @returns {Map<string, SidecarEntry>} */
function parseSidecar(text) {
  const parsed = tryParse(text);
  /** @type {Map<string, SidecarEntry>} */
  const map = new Map();
  if (typeof parsed !== "object" || parsed === null) return map;
  for (const [id, val] of Object.entries(/** @type {Record<string, unknown>} */ (parsed))) {
    if (typeof val === "object" && val !== null) map.set(id, /** @type {SidecarEntry} */ (val));
  }
  return map;
}

/** The curated `level` for a sidecar entry: the first LEVEL_KEYS hit, scanning psets in sorted
 * name order (deterministic). null when none. @param {unknown} psets @returns {string | number |
 * null} */
function extractLevel(psets) {
  if (typeof psets !== "object" || psets === null) return null;
  const groups = /** @type {Record<string, unknown>} */ (psets);
  const names = Object.keys(groups).sort(cmpStr);
  for (const key of LEVEL_KEYS) {
    for (const gn of names) {
      const grp = groups[gn];
      if (typeof grp !== "object" || grp === null) continue;
      const v = /** @type {Record<string, unknown>} */ (grp)[key];
      if (typeof v === "string" || typeof v === "number") return v;
    }
  }
  return null;
}

/** Curate one GlobalId against the sidecar (nulls when absent). @param {string} gid @param
 * {SidecarEntry | undefined} entry @returns {BindingElement} */
function curateElement(gid, entry) {
  return {
    global_id: gid,
    name: entry ? strOrNull(entry.name) : null,
    type: entry ? strOrNull(entry.ifc_class) : null,
    level: entry ? extractLevel(entry.psets) : null,
  };
}

/** The `[min,max]` limit for a tag: the binding map's (preferred), else the recording header's tag
 * table (finite only), else null. @param {string} tag @param {Map<string, Limit>} mapLimits
 * @param {Map<string, Limit>} headerLimits @returns {Limit | null} */
function limitFor(tag, mapLimits, headerLimits) {
  return mapLimits.get(tag) ?? headerLimits.get(tag) ?? null;
}

/** Finite [min,max] limits keyed by tag, from the recording header's tag table. @param
 * {RecordingHeader} header @returns {Map<string, Limit>} */
function headerLimitsOf(header) {
  /** @type {Map<string, Limit>} */
  const limits = new Map();
  for (const t of header.tags) {
    if (Number.isFinite(t.min) && Number.isFinite(t.max))
      limits.set(t.tag, { min: t.min, max: t.max });
  }
  return limits;
}

/** The window block: resolved inclusive bounds (requested flag wins; else the analyzed frames'
 * t_ms extent; null when the window is empty) + the analyzed frame count. @param
 * {RecordingFrame[]} frames @param {number | null} fromMs @param {number | null} toMs
 * @returns {{ from_ms: number | null, to_ms: number | null, frames: number }} */
function buildWindow(frames, fromMs, toMs) {
  let minT = null;
  let maxT = null;
  for (const f of frames) {
    if (minT === null || f.t_ms < minT) minT = f.t_ms;
    if (maxT === null || f.t_ms > maxT) maxT = f.t_ms;
  }
  return { from_ms: fromMs ?? minT, to_ms: toMs ?? maxT, frames: frames.length };
}

/** The inputs provenance block (fixed key order). @param {InputFile} recording @param {InputFile |
 * null | undefined} map @param {InputFile | null | undefined} sidecar @returns {InputsBlock} */
function buildInputs(recording, map, sidecar) {
  const one = (/** @type {InputFile} */ f) => ({
    name: f.name,
    bytes: Buffer.byteLength(f.text),
    sha256: hashText(f.text),
  });
  return {
    recording: one(recording),
    map: map ? one(map) : null,
    sidecar: sidecar ? one(sidecar) : null,
  };
}

/** Per-tag stats + decimated series for the included tags (sorted), sharing one grouping pass.
 * @param {Map<string, RecordingFrame[]>} byTag @param {string[]} tags @param {Map<string, Limit>}
 * mapLimits @param {Map<string, Limit>} headerLimits @param {number} pointsPerTag
 * @returns {{ stats: TagStats[], series: { tag: string, points: Sample[] }[] }} */
function buildStatsAndSeries(byTag, tags, mapLimits, headerLimits, pointsPerTag) {
  /** @type {TagStats[]} */
  const stats = [];
  /** @type {{ tag: string, points: Sample[] }[]} */
  const series = [];
  for (const tag of tags) {
    const frames = byTag.get(tag);
    if (frames === undefined || frames.length === 0) continue;
    stats.push(tagStats(tag, frames, limitFor(tag, mapLimits, headerLimits)));
    series.push({ tag, points: decimate(seriesOf(frames), pointsPerTag) });
  }
  return { stats, series };
}

/** Binding context for the included tags that carry GlobalIds (sorted). @param {string[]} tags
 * @param {Map<string, string[]>} globalIds @param {Map<string, SidecarEntry> | null} sidecar
 * @returns {{ tag: string, global_ids: string[], elements: BindingElement[] }[]} */
function buildBindings(tags, globalIds, sidecar) {
  /** @type {{ tag: string, global_ids: string[], elements: BindingElement[] }[]} */
  const out = [];
  for (const tag of tags) {
    const gids = globalIds.get(tag);
    if (gids === undefined || gids.length === 0) continue;
    const elements = sidecar ? gids.map((g) => curateElement(g, sidecar.get(g))) : [];
    out.push({ tag, global_ids: gids, elements });
  }
  return out;
}

/** Serialize a bundle to canonical bytes: pretty-printed (readable for a human pasting it into a
 * chat UI) + a trailing newline, deterministic because key order is fixed by construction. @param
 * {object} bundle @returns {string} */
export function serializeBundle(bundle) {
  return JSON.stringify(bundle, null, 2) + "\n";
}

/** Build the analysis bundle — PURE: no fs, no exit. Returns the document, its canonical JSON, and
 * the byte size (so the CLI can gate on the budget). @param {{
 *   recording: InputFile, map?: InputFile | null, sidecar?: InputFile | null,
 *   fromMs?: number | null, toMs?: number | null, tags?: string[] | null, pointsPerTag?: number
 * }} opts */
export function buildBundle(opts) {
  const pointsPerTag = opts.pointsPerTag ?? DEFAULT_POINTS_PER_TAG;
  const fromMs = opts.fromMs ?? null;
  const toMs = opts.toMs ?? null;
  const { header, frames } = parseRecording(opts.recording.text);
  const parsedMap = opts.map ? parseMap(opts.map.text) : null;
  const sidecar = opts.sidecar ? parseSidecar(opts.sidecar.text) : null;

  const tagFilter = opts.tags && opts.tags.length > 0 ? new Set(opts.tags) : null;
  const windowFrames = filterWindow(frames, fromMs, toMs).filter(
    (f) => tagFilter === null || tagFilter.has(f.tag),
  );
  const byTag = groupByTag(windowFrames);
  const tags = [...byTag.keys()].sort(cmpStr);

  const mapLimits = parsedMap?.limits ?? /** @type {Map<string, Limit>} */ (new Map());
  const globalIds = parsedMap?.globalIds ?? /** @type {Map<string, string[]>} */ (new Map());
  const { stats, series } = buildStatsAndSeries(
    byTag,
    tags,
    mapLimits,
    headerLimitsOf(header),
    pointsPerTag,
  );

  const bundle = {
    schema_version: SCHEMA_VERSION,
    kind: BUNDLE_KIND,
    generated_by: GENERATED_BY,
    inputs: buildInputs(opts.recording, opts.map, opts.sidecar),
    recording_header: header,
    window: buildWindow(windowFrames, fromMs, toMs),
    points_per_tag: pointsPerTag,
    stats,
    series,
    bindings: buildBindings(tags, globalIds, sidecar),
  };
  const json = serializeBundle(bundle);
  return { bundle, json, bytes: Buffer.byteLength(json) };
}

// --- CLI wrapper: the only place that touches the filesystem / process exit ---

/** Read a file as an InputFile (basename + text), or null when the path is falsy. @param {string |
 * undefined} p @returns {InputFile | null} */
function readInput(p) {
  if (!p) return null;
  return { name: path.basename(p), text: readFileSync(p, "utf8") };
}

/** Parse the numeric flag `name`, or null when absent; exits on a non-numeric value. @param
 * {Record<string, string>} args @param {string} name @returns {number | null} */
function numFlag(args, name) {
  const raw = args[name];
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`--${name} must be a number (got '${raw}')`);
  return n;
}

/** Print a message + usage to stderr and exit nonzero. @param {string} msg @returns {never} */
function fail(msg) {
  console.error(
    `bundle: ${msg}\n` +
      "usage: bundle.js --recording <file.ndjson> [--map M] [--sidecar S] " +
      "[--from-ms A --to-ms B] [--tags t1,t2] [--points-per-tag N] [--allow-oversize] --out <bundle.json>",
  );
  process.exit(EXIT_FAILURE);
}

/** Enforce the size budget: over budget with no --allow-oversize ⇒ fail loudly (no file written);
 * with the override ⇒ a loud warning. @param {number} bytes @param {boolean} allowOversize
 * @returns {void} */
function enforceBudget(bytes, allowOversize) {
  if (bytes <= SIZE_BUDGET_BYTES) return;
  const over = bytes - SIZE_BUDGET_BYTES;
  const detail =
    `bundle is ${bytes} bytes — ${over} over the ${SIZE_BUDGET_BYTES}-byte budget. ` +
    "Narrow the window (--from-ms/--to-ms), select --tags, or lower --points-per-tag";
  if (!allowOversize) fail(`${detail}; or pass --allow-oversize to write it anyway`);
  console.warn(`bundle: WARNING — ${detail}. Writing anyway (--allow-oversize).`);
}

/** CLI entry: read inputs, build, enforce the budget, write, summarize. @param {string[]} argv
 * @returns {void} */
function main(argv) {
  // Extract the boolean flag BEFORE parseArgs (the sim's parser pairs every --flag with the next
  // token, so a bare boolean left in place would swallow the following flag's value).
  const allowOversize = argv.includes("--allow-oversize");
  const args = parseArgs(argv.filter((a) => a !== "--allow-oversize"));
  if (!args.recording || !args.out) fail("--recording and --out are required");
  const tagsArg = args.tags
    ? args.tags
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;
  const pts = numFlag(args, "points-per-tag");
  if (pts !== null && (!Number.isInteger(pts) || pts <= 0)) {
    fail("--points-per-tag must be a positive integer");
  }

  const { json, bytes, bundle } = buildBundle({
    recording: /** @type {InputFile} */ (readInput(args.recording)),
    map: readInput(args.map),
    sidecar: readInput(args.sidecar),
    fromMs: numFlag(args, "from-ms"),
    toMs: numFlag(args, "to-ms"),
    tags: tagsArg,
    pointsPerTag: pts ?? undefined,
  });
  enforceBudget(bytes, allowOversize);
  writeFileSync(args.out, json);
  console.log(
    `bundle: wrote ${args.out} — bytes=${bytes} tags=${bundle.stats.length} ` +
      `frames=${bundle.window.frames} sha256=${hashText(json)}`,
  );
}

// CLI: `node tools/analyze/bundle.js …`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
