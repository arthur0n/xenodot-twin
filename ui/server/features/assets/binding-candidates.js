// Core over the IFC property sidecar (`<model>_props.json`, written by ifc_convert.py) that turns the
// hand-grep chore "which GlobalIds am I allowed to bind?" into a filtered query. The sidecar is
// `{ GlobalId: { ifc_class, name, psets, quantities } }`, keyed by the exact join key a binding map
// needs (smoke_binding.gd only GATES a map — nothing AUTHORS it, so every seat greps a 22 MB JSON by
// hand). This module is the SHARED CORE the `mcp__ui__find_binding_candidates` tool, the
// `binding-candidates` CLI, and the `/api/binding-candidates` UI endpoint all call, so a candidate
// query can never mean three different things (the analysis-dispatch precedent). It is pure over a
// parsed sidecar plus path resolution across the project's `models/`. Confinement lives here too, as
// ONE exported check (confineToRoot, realpath-based) shared by BOTH untrusted-input surfaces — the
// model-callable MCP tool and the browser-callable HTTP endpoint — so they carry the identical
// symlink-safe guarantee; only the operator-run CLI is unconfined (a human typed the path, the same
// split as analyze-cli.js vs analyze-tool.js).
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";

/** The IFC property-sidecar filename suffix ifc_convert.py writes (`<stem>_props.json`). */
export const SIDECAR_SUFFIX = "_props.json";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const MAX_CLASS_ROWS = 40;

/** A graceful input error (bad/absent/ambiguous sidecar) — callers map it to a tool result or a CLI
 * message + nonzero exit, never a stack trace (the AnalyzeInputError precedent). */
export class SidecarError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "SidecarError";
  }
}

/** Confine an untrusted path to the project root — the LOAD-BEARING control on the MCP tool AND the
 * HTTP endpoint (both accept caller-supplied paths and auto-allow/serve without a human gate). A
 * relative path resolves against the root; the result must BE the root or inside it, compared
 * REALPATH-first so an in-root symlink pointing outside is caught (a lexical resolve+startsWith
 * would pass it — arbitrary-file disclosure). A nonexistent leaf can't be realpath'd, so the deepest
 * EXISTING ancestor is realpath'd and the tail rejoined: an in-root missing file stays in-root (its
 * later read fails gracefully), while a symlinked ancestor escaping the root is still caught.
 * Mirrors analyze-tool.js's confinePath. Throws SidecarError on escape — WITHOUT echoing the root
 * (the message may be served to a browser).
 * @param {string} realRoot the realpath of the project root @param {string} p untrusted path
 * @param {string} name the arg name (for the message) @returns {string} the resolved in-root path */
export function confineToRoot(realRoot, p, name) {
  const resolved = path.resolve(realRoot, p);
  let head = resolved;
  let tail = "";
  /** @type {string} */
  let effective;
  for (;;) {
    try {
      effective = path.join(realpathSync(head), tail);
      break;
    } catch {
      const parent = path.dirname(head);
      if (parent === head) {
        effective = resolved; // nothing on the path exists — lexical check is exact here
        break;
      }
      tail = path.join(path.basename(head), tail);
      head = parent;
    }
  }
  if (effective !== realRoot && !effective.startsWith(realRoot + path.sep))
    throw new SidecarError(
      `${name} resolves outside the project root — this surface only reads the project's own IFC ` +
        "sidecars (confinement rule: caller-supplied paths never leave the project root)",
    );
  return resolved;
}

/**
 * @typedef {Object} Candidate
 * @property {string} globalId  the IFC GlobalId — the binding-map join key
 * @property {string} ifcClass  the IFC entity class (e.g. IfcWallStandardCase)
 * @property {string | null} name  the element Name (may be null in the IFC)
 * @property {string} [storey]  best-effort storey label (usually absent — see extractStorey)
 */

/**
 * @typedef {Object} CandidateResult
 * @property {number} total  elements in the sidecar
 * @property {number} matched  elements passing the filter (pre-pagination)
 * @property {number} offset  page offset applied
 * @property {number} limit  page size applied
 * @property {number} count  rows in `candidates` (this page)
 * @property {Candidate[]} candidates  the page of matches, deterministically ordered
 * @property {{ ifcClass: string, count: number }[]} classes  class histogram over the matched set
 *   (with no filter this is the whole-file histogram — the "what classes exist?" discovery answer)
 */

/** Directories scanned for `<model>_props.json`, in priority order — `models/` (the twin-import
 * convention) then the project root. Mirrors import-metrics.js/binding-status.js scanDirs.
 * @param {string} projectDir @returns {string[]} */
function scanDirs(projectDir) {
  return [path.join(projectDir, "models"), projectDir];
}

/** Every `<model>_props.json` discoverable under the project, de-duplicated by basename (`models/`
 * wins over the root), sorted by name. An absent dir is skipped, never thrown.
 * @param {string} projectDir @returns {{ name: string, abs: string }[]} */
export function listSidecars(projectDir) {
  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const dir of scanDirs(projectDir)) {
    /** @type {string[]} */
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.endsWith(SIDECAR_SUFFIX) && !byName.has(name))
        byName.set(name, path.join(dir, name));
    }
  }
  return [...byName.entries()]
    .map(([name, abs]) => ({ name, abs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve which sidecar to query. Precedence: an explicit `sidecar` path (absolute, or relative to
 * the project root) wins; else a `model` stem is matched to `<model>_props.json`; else the single
 * discovered sidecar is used, and 0-or-many is a SidecarError that lists the choices. Does NOT
 * confine the path — that is the caller's job on model-supplied input (see the module header).
 * @param {{ projectDir: string, sidecar?: string, model?: string }} opts @returns {string} abs path */
export function resolveSidecarPath({ projectDir, sidecar, model }) {
  if (sidecar) {
    const abs = path.isAbsolute(sidecar) ? sidecar : path.resolve(projectDir, sidecar);
    if (!existsSync(abs)) throw new SidecarError(`sidecar not found: ${abs}`);
    return abs;
  }
  const found = listSidecars(projectDir);
  const names = found.map((f) => f.name).join(", ") || "(none)";
  if (model) {
    const want = model.endsWith(SIDECAR_SUFFIX) ? model : model + SIDECAR_SUFFIX;
    const hit = found.find((f) => f.name === want);
    if (!hit) throw new SidecarError(`no sidecar for model '${model}' — available: ${names}`);
    return hit.abs;
  }
  const only = found[0];
  if (found.length === 1 && only) return only.abs;
  if (found.length === 0)
    throw new SidecarError(
      `no <model>_props.json under ${path.join(projectDir, "models")} or ${projectDir} — run ` +
        "ifc_convert.py to write the property sidecar first",
    );
  throw new SidecarError(`multiple sidecars — pass --model or --sidecar. available: ${names}`);
}

/** Load + parse a sidecar. Returns the parsed dict and its on-disk byte size (reported so a caller
 * can surface the "we did not make you grep 22 MB" cost). A missing file, unparseable JSON, or a
 * non-object top level is a SidecarError, never a throw. NB: the whole file is parsed (matching the
 * repo's readFileSync+parseJSON idiom); on this machine a 23.6 MB sidecar parses in well under a
 * second — measured, one-machine caveat applies.
 * @param {string} absPath @returns {{ sidecar: Record<string, unknown>, bytes: number }} */
export function loadSidecar(absPath) {
  /** @type {string} */
  let text;
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    throw new SidecarError(`cannot read sidecar: ${absPath}`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = parseJSON(text);
  } catch {
    throw new SidecarError(`sidecar is not valid JSON: ${absPath}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new SidecarError(`sidecar is not a { GlobalId: {…} } object: ${absPath}`);
  return {
    sidecar: /** @type {Record<string, unknown>} */ (parsed),
    bytes: Buffer.byteLength(text),
  };
}

/** Best-effort storey label for one element, read from its psets. IMPORTANT: ifc_convert.py's
 * sidecar records `ifc_class`, `name`, `psets`, `quantities` — it does NOT capture spatial
 * containment, so most models (Schependomlaan and Duplex both) carry no per-element storey and this
 * returns undefined. It fires only when the authoring tool happened to write a storey-named property
 * into a pset. The `storey` filter is therefore a best-effort convenience; `ifcClass` + `name` are
 * the load-bearing filters. @param {Record<string, unknown>} entry @returns {string | undefined} */
function extractStorey(entry) {
  const psets = entry.psets;
  if (typeof psets !== "object" || psets === null) return undefined;
  for (const props of Object.values(/** @type {Record<string, unknown>} */ (psets))) {
    if (typeof props !== "object" || props === null) continue;
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (props))) {
      const kl = k.toLowerCase();
      if (kl.includes("storey") && typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return undefined;
}

/** Clamp a requested page size to [1, MAX_LIMIT], defaulting when absent/invalid. @param {unknown} v
 * @returns {number} */
function clampLimit(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** Clamp a requested offset to a non-negative integer. @param {unknown} v @returns {number} */
function clampOffset(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Class passes when there's no filter, or the class EQUALS or STARTS WITH it (so `IfcWall` catches
 * `IfcWallStandardCase`). @param {string} want lowercased filter @param {string} cl lowercased class
 * @returns {boolean} */
function classPasses(want, cl) {
  return !want || cl === want || cl.startsWith(want);
}

/** A case-insensitive substring gate that passes when there's no filter. @param {string} want
 * lowercased filter @param {string | undefined} value @returns {boolean} */
function textPasses(want, value) {
  return !want || (value ?? "").toLowerCase().includes(want);
}

/** Match one sidecar entry against the (already lowercased) filters, returning the Candidate to keep
 * or null to skip. Split out of queryCandidates to keep that function under the complexity cap.
 * @param {string} globalId @param {unknown} raw @param {{ wantClass: string, wantName: string,
 *   wantStorey: string }} f @returns {Candidate | null} */
function matchEntry(globalId, raw, f) {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = /** @type {Record<string, unknown>} */ (raw);
  const ifcClass = typeof entry.ifc_class === "string" ? entry.ifc_class : "";
  if (!ifcClass || !classPasses(f.wantClass, ifcClass.toLowerCase())) return null;
  const name = typeof entry.name === "string" ? entry.name : null;
  if (!textPasses(f.wantName, name ?? undefined)) return null;
  const storey = extractStorey(entry);
  // A storey filter excludes elements carrying no storey (textPasses would let "" through when the
  // filter is set, so guard explicitly).
  if (f.wantStorey && !textPasses(f.wantStorey, storey)) return null;
  return storey ? { globalId, ifcClass, name, storey } : { globalId, ifcClass, name };
}

/** Query candidate GlobalIds out of a parsed sidecar. `ifcClass` matches case-insensitively when the
 * element's class EQUALS or STARTS WITH the filter (so `IfcWall` catches `IfcWall` AND
 * `IfcWallStandardCase` — what a binder wants); `name` is a case-insensitive substring; `storey` is a
 * case-insensitive substring over the best-effort storey (elements with no storey are excluded when a
 * storey filter is given). Results are ordered by (class, name, GlobalId) so pagination is stable.
 * Never returns the full 3.5k rows — the page is bounded by `limit` (≤ MAX_LIMIT); the caller reads
 * `matched` for the true count and pages with `offset`.
 * @param {Record<string, unknown>} sidecar @param {{ ifcClass?: string, name?: string,
 *   storey?: string, limit?: number, offset?: number }} [opts] @returns {CandidateResult} */
export function queryCandidates(sidecar, opts = {}) {
  const filters = {
    wantClass: opts.ifcClass?.trim().toLowerCase() ?? "",
    wantName: opts.name?.trim().toLowerCase() ?? "",
    wantStorey: opts.storey?.trim().toLowerCase() ?? "",
  };
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);

  const entries = Object.entries(sidecar);
  /** @type {Candidate[]} */
  const matches = [];
  /** @type {Map<string, number>} */
  const classCounts = new Map();

  for (const [globalId, raw] of entries) {
    const cand = matchEntry(globalId, raw, filters);
    if (!cand) continue;
    classCounts.set(cand.ifcClass, (classCounts.get(cand.ifcClass) ?? 0) + 1);
    matches.push(cand);
  }

  matches.sort(
    (a, b) =>
      a.ifcClass.localeCompare(b.ifcClass) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.globalId.localeCompare(b.globalId),
  );

  const classes = [...classCounts.entries()]
    .map(([ifcClass, count]) => ({ ifcClass, count }))
    .sort((a, b) => b.count - a.count || a.ifcClass.localeCompare(b.ifcClass))
    .slice(0, MAX_CLASS_ROWS);

  const page = matches.slice(offset, offset + limit);
  return {
    total: entries.length,
    matched: matches.length,
    offset,
    limit,
    count: page.length,
    candidates: page,
    classes,
  };
}
