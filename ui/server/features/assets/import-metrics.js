// Read the IFC→twin import metrics the pipeline writes, so the assets panel can SHOW the pipeline
// result (JOIN %, import ms, element count) in the product — not only in a markdown finding. The
// contract is a `<model>.metrics.json` file: `ifc_convert.py --metrics` writes schema / shapes /
// elements / import_seconds; `check_twin_join.gd --json` merges the join_* verdict into the same
// file. This module just discovers + parses those files; nothing here runs the pipeline.
//
// Discovery is narrow and cheap: `*.metrics.json` directly under the game project's `models/` (the
// twin-import convention) plus the project root, non-recursive, capped. A GET producer (no per-
// connection state), sibling to tasks-store.js's readTasks. Numbers are coerced defensively: a
// merged file's ints come back as floats from GDScript's JSON (295.0), so counts are rounded.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { PROJECT_DIR } from "../../core/config.js";

/** @typedef {import("../../../lib/types.js").ImportMetric} ImportMetric */

const SUFFIX = ".metrics.json";
const MAX_CARDS = 24;

/** Directories scanned for `<model>.metrics.json`, in priority order. `models/` is the twin-import
 * convention; the project root catches an import run from the repo top. @returns {string[]} */
function scanDirs() {
  return [path.join(PROJECT_DIR, "models"), PROJECT_DIR];
}

/** Coerce an unknown JSON number to a finite number, else undefined. @param {unknown} v
 * @returns {number | undefined} */
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** A count field (elements/shapes/keys) — rounded, since a GDScript-merged file re-serializes ints
 * as floats. @param {unknown} v @returns {number | undefined} */
function count(v) {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n);
}

/** Normalize one parsed metrics object into the ImportMetric shape the client renders. Unknown
 * shapes yield null (skipped) — a corrupt file never breaks the panel.
 * @param {unknown} raw @param {string} file @returns {ImportMetric | null} */
function normalize(raw, file) {
  if (typeof raw !== "object" || raw === null) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    model: typeof o.model === "string" ? o.model : path.basename(file, SUFFIX),
    schema: typeof o.schema === "string" ? o.schema : undefined,
    shapes: count(o.shapes),
    elements: count(o.elements),
    import_seconds: num(o.import_seconds),
    timestamp: typeof o.timestamp === "string" ? o.timestamp : undefined,
    join_matched: count(o.join_matched),
    join_total: count(o.join_total),
    join_pct: num(o.join_pct),
    join_gate: typeof o.join_gate === "string" ? o.join_gate : undefined,
    sidecar_keys: count(o.sidecar_keys),
    playback_gate: typeof o.playback_gate === "string" ? o.playback_gate : undefined,
    file,
  };
}

/** Discover + parse every `<model>.metrics.json` under the scanned dirs. De-duplicates by absolute
 * path (models/ wins over root for the same name), newest `timestamp` first, capped at MAX_CARDS.
 * An absent dir or corrupt file is skipped, never thrown. @returns {ImportMetric[]} */
export function readImportMetrics() {
  /** @type {Map<string, ImportMetric>} */
  const byPath = new Map();
  for (const dir of scanDirs()) {
    /** @type {string[]} */
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(SUFFIX)) continue;
      const abs = path.join(dir, name);
      if (byPath.has(abs)) continue;
      try {
        const m = normalize(parseJSON(readFileSync(abs, "utf8")), abs);
        if (m) byPath.set(abs, m);
      } catch {
        // corrupt / unreadable — skip this file, keep the panel alive
      }
    }
  }
  return [...byPath.values()]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, MAX_CARDS);
}
