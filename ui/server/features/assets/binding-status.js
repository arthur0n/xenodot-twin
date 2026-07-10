// Read the bind-smoke resolution status the twin-verify gate writes, so the assets panel can SHOW a
// binding map's live resolution health (N/N resolved, green/red) in the product — not only in the
// viewer HUD or a markdown finding. The contract is a `<map>.status.json` file: `smoke_binding.gd
// --json` writes bind_smoke (OK|FAIL), resolved/total, the unresolved GlobalId list, and node/mmi
// target counts. This module just discovers + parses those files; nothing here runs the gate.
//
// A binding map is not shipped until BIND-SMOKE=N/N (docs/process/binding-ship-gate.md): a mistyped
// GlobalId resolves to a silent 0-of-N, so this badge (fed by the gate, not eyeballing) is the ship
// signal. Discovery mirrors import-metrics.js: `*.status.json` directly under the project's `models/`
// and the project root, non-recursive, capped. Numbers coerce defensively (GDScript JSON re-serializes
// ints as floats), a corrupt file is skipped so the panel stays alive.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { PROJECT_DIR } from "../../core/config.js";

/** @typedef {import("../../../lib/types.js").BindingStatus} BindingStatus */

const SUFFIX = ".status.json";
const MAX_CARDS = 12;

/** Directories scanned for `<map>.status.json`, in priority order. `models/` first, then the project
 * root (the twin-verify convention writes it next to the binding map at the root). @returns {string[]} */
function scanDirs() {
  return [path.join(PROJECT_DIR, "models"), PROJECT_DIR];
}

/** Coerce an unknown JSON number to a rounded finite count, else undefined (a GDScript-merged file
 * re-serializes ints as floats). @param {unknown} v @returns {number | undefined} */
function count(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;
}

/** The unresolved-GlobalId list as strings, or undefined when absent/malformed. @param {unknown} v
 * @returns {string[] | undefined} */
function idList(v) {
  if (!Array.isArray(v)) return undefined;
  return v.filter((s) => typeof s === "string");
}

/** Normalize one parsed status object into the BindingStatus shape the client renders. Unknown shapes
 * yield null (skipped) — a corrupt file never breaks the panel. @param {unknown} raw @param {string} file
 * @returns {BindingStatus | null} */
function normalize(raw, file) {
  if (typeof raw !== "object" || raw === null) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.resolved === undefined && o.total === undefined && o.bind_smoke === undefined) return null;
  return {
    map: typeof o.map === "string" ? o.map : path.basename(file, SUFFIX),
    bind_smoke: typeof o.bind_smoke === "string" ? o.bind_smoke : undefined,
    resolved: count(o.resolved),
    total: count(o.total),
    unresolved: idList(o.unresolved),
    node_targets: count(o.node_targets),
    mmi_targets: count(o.mmi_targets),
    bind_checked_at: typeof o.bind_checked_at === "string" ? o.bind_checked_at : undefined,
    file,
  };
}

/** Discover + parse every `<map>.status.json` under the scanned dirs. De-duplicates by absolute path
 * (models/ wins over root), newest `bind_checked_at` first, capped at MAX_CARDS. An absent dir or
 * corrupt file is skipped, never thrown. @returns {BindingStatus[]} */
export function readBindingStatus() {
  /** @type {Map<string, BindingStatus>} */
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
        const s = normalize(parseJSON(readFileSync(abs, "utf8")), abs);
        if (s) byPath.set(abs, s);
      } catch {
        // corrupt / unreadable — skip this file, keep the panel alive
      }
    }
  }
  return [...byPath.values()]
    .sort((a, b) => (b.bind_checked_at ?? "").localeCompare(a.bind_checked_at ?? ""))
    .slice(0, MAX_CARDS);
}
