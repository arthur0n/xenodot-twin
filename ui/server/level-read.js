// Read the drawn levels saved under <project>/levels/drawn/ so the Draw Level
// tool can load one back onto the canvas (view + continue editing). Read-only
// sibling of level-write.js.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../lib/json.js";
import { PROJECT_DIR } from "./config.js";

/** @typedef {{ name: string, width: number, height: number, cells: number[], labels: { n: number, x: number, y: number }[] }} SavedLevel */

/**
 * Parse one levels/drawn/<file> into a SavedLevel, or null if unreadable.
 * @param {string} dir @param {string} file @returns {SavedLevel | null}
 */
function readLevel(dir, file) {
  try {
    const raw = parseJSON(readFileSync(path.join(dir, file), "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const j =
      /** @type {{ width?: unknown, height?: unknown, cells?: unknown, labels?: unknown }} */ (raw);
    if (!Array.isArray(j.cells)) return null;
    return {
      name: file.replace(/\.json$/, ""),
      width: Number(j.width) || 0,
      height: Number(j.height) || 0,
      cells: j.cells.map((c) => Number(c)),
      labels: Array.isArray(j.labels)
        ? /** @type {unknown[]} */ (j.labels).map((l) => {
            const o = /** @type {{ n?: unknown, x?: unknown, y?: unknown }} */ (l);
            return { n: Number(o.n), x: Number(o.x), y: Number(o.y) };
          })
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * List the drawn levels (levels/drawn/*.json) with their grids.
 * @returns {SavedLevel[]}
 */
export function listLevels() {
  const dir = path.join(PROJECT_DIR, "levels", "drawn");
  /** @type {SavedLevel[]} */
  const out = [];
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return out;
  }
  for (const f of files) {
    const lv = readLevel(dir, f);
    if (lv) out.push(lv);
  }
  return out;
}
