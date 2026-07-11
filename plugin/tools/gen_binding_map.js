// tools/gen_binding_map.js — turn a property sidecar (`<stem>_props.json`, written by
// ifc_convert.py OR usd_convert.py) into a VALID binding map (`{version, bindings:[…]}`) with ZERO
// hand-authoring. Sidecar-generic: an IFC entry carries `ifc_class`, a USD entry carries
// `{type, prim_path}` — `classOf()` reads either, and the sidecar KEY (GlobalId or sanitized prim
// path) becomes the binding's stable join id unchanged.
// The "bring your own IFC" seam: nothing else synthesizes a map today (binding-candidates.js only
// LISTS candidate GlobalIds), so a stranger's file could import + join but never paint. This picks
// a small spread of real elements across distinct IFC classes and emits the schema binding_map.gd
// validates (starter-viewer/core/binding_map.gd _parse_binding) and the sim derives its tag table
// from (sim/stream.js tagsFromMap).
//
// Dependency-free by design (same rule as sim/server.js): it is MATERIALIZED into every viewer
// project at tools/gen_binding_map.js and must run under a bare `node` (no package.json in the
// materialized tools/), so twin_build.sh --auto-map can call it in a scaffolded seat. The framework
// npm surface (ui/server/cli/binding-auto-map.js, `npm run binding:auto`) imports buildBindingMap
// from here too — ONE core, no drift.
//
// DETERMINISM: buildBindingMap is a PURE function of (sidecar, opts) — no wall-clock, no RNG, no
// seed. The same sidecar yields a byte-identical map every run (the twin pipeline's determinism
// contract; unlike the gate reports, no timestamp is written). Candidates are picked in a fixed
// (class, name, GlobalId) order.
//
// SMOKE-PASS GUARANTEE: verify_twin.sh's binding smoke (tools/smoke_binding.gd) demands (b) EVERY
// binding resolves to >=1 target and (c) >=1 NODE-target's albedo both non-white AND moving. The
// optimizer (optimize_scene.gd) only collapses geometry into a MultiMeshInstance3D when a
// (mesh,material) group has >= --min-instances members (default 8); a class with FEWER than that
// many elements can never be batched, so every one of its elements stays a plain node. So we (1)
// pick only from GEOMETRIC classes (non-geometric ones — spaces, storeys, systems — carry no mesh
// and would resolve 0 targets, failing (b)); (2) order guaranteed-node classes (count <
// min-instances) FIRST so the earliest picks are node targets, satisfying (c). All bindings use the
// albedo_ramp response so any node pick drives the paint the smoke samples.
//
//   node tools/gen_binding_map.js --sidecar models/foo_props.json [--out models/foo_auto_binding_map.json]
//                                 [--max 12] [--min-instances 8] [--min 0] [--max-value 100]
// Writes the map to --out (or stdout with no --out) and prints a VERDICT line to stderr.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Default cap on the number of bindings the generated map carries. ~12 is enough to read as a
 * populated twin (colour spread across the model) without turning the whole scene into a light show
 * or bloating the map; the smoke only needs 1 node target, the rest are demonstration. */
const DEFAULT_MAX_BINDINGS = 12;

/** Mirror of optimize_scene.gd DEFAULT_MIN_INSTANCES — a (mesh,material) group needs this many
 * members before the optimizer collapses it into a MultiMeshInstance3D. A class with fewer TOTAL
 * elements than this can never be batched, so its elements are GUARANTEED plain nodes (the smoke's
 * node-drive assertion needs at least one). Kept in sync with the optimizer's default; overridable
 * with --min-instances to match a non-default optimize run. */
const DEFAULT_MIN_INSTANCES = 8;

/** Default value range every synthesized tag spans — a neutral 0..100 (percent-like) window. The
 * sim reads [min,max] straight from the map (sim/stream.js tagsFromMap) and the binder normalizes
 * the live value into it for the colour lerp, so the exact numbers only set the ramp's scale. */
const DEFAULT_MIN_VALUE = 0;
const DEFAULT_MAX_VALUE = 100;

/** The default two-colour ramp (dark → cyan) every binding paints across [min,max]. A single honest
 * default (matches the plant example's flow ramp) — a generated map makes no claim about which
 * colour "means" what; the author retunes per tag. Low is near-black so an un-driven target reads as
 * unlit and a live one visibly brightens. */
const DEFAULT_RAMP = ["#14142a", "#39d0ff"];

/** IFC classes that (as a rule) carry NO render mesh in the GLB ifc_convert.py writes — spatial
 * containers, groupings, systems, and void/virtual elements. Binding one would resolve 0 targets in
 * the scene and FAIL the smoke's "every binding resolved" assertion, so they are excluded from
 * candidate selection. Matched case-insensitively by prefix (so IfcSpace catches IfcSpaceType).
 * Deliberately conservative: only classes that are non-geometric across essentially all exporters. */
const NON_GEOMETRIC_PREFIXES = [
  "ifcproject",
  "ifcsite",
  "ifcbuilding", // IfcBuilding / IfcBuildingStorey (IfcBuildingElement* are NOT matched — see isGeometric)
  "ifcspace",
  "ifcspatialzone",
  "ifczone",
  "ifcsystem",
  "ifcgroup",
  "ifcgrid",
  "ifcannotation",
  "ifcopeningelement",
  "ifcvirtualelement",
  "ifcrelspaceboundary",
];

/** Recognizable, reliably-geometric classes given a mild ordering bonus so a generated map leads
 * with elements a BIM author recognizes at a glance (walls, doors, equipment) rather than exotic
 * proxies. Not a whitelist — any geometric class can be picked; this only nudges ordering. Prefix,
 * case-insensitive. */
const RECOGNIZABLE_PREFIXES = [
  "ifcwall",
  "ifcdoor",
  "ifcwindow",
  "ifcslab",
  "ifccolumn",
  "ifcbeam",
  "ifcstair",
  "ifcroof",
  "ifccovering",
  "ifctank",
  "ifcpump",
  "ifcvalve",
  "ifcflowsegment",
  "ifcflowterminal",
  "ifcfurnishingelement",
  "ifcsanitaryterminal",
];

/** `IfcBuildingElement` (and the `IfcBuildingElementProxy` catch-all) ARE geometric despite sharing
 * the `ifcbuilding` prefix with the non-geometric IfcBuilding/IfcBuildingStorey — special-cased. */
const GEOMETRIC_OVERRIDE_PREFIX = "ifcbuildingelement";

/** The join-class of a sidecar entry, format-generically. An IFC entry (ifc_convert.py) carries
 * `ifc_class` (e.g. "IfcPump") — used verbatim, so the IFC path is unchanged and byte-identical. A
 * USD entry (usd_convert.py) has NO class field: its sidecar is `{type, prim_path, name, attributes}`,
 * so the "class" is derived from the prim path's PARENT segment (`/Plant/Tanks/TK_101` → "Tanks"),
 * which groups siblings the way an IFC class groups its instances — a meaningful spread for the
 * round-robin. The prim `type` ("Mesh") would collapse every element into one bucket, so it is only
 * the last-ditch fallback. Returns "" (⇒ skipped) when nothing usable is present.
 * @param {Record<string, unknown>} entry @returns {string} */
function classOf(entry) {
  const ifcClass = entry.ifc_class;
  if (typeof ifcClass === "string" && ifcClass) return ifcClass;
  const primPath = entry.prim_path;
  if (typeof primPath === "string" && primPath) {
    const segs = primPath.split("/").filter(Boolean);
    if (segs.length >= 2) return segs[segs.length - 2] ?? "";
    if (segs.length === 1) return segs[0] ?? "";
  }
  const type = entry.type;
  if (typeof type === "string" && type) return type;
  return "";
}

/** @param {string} ifcClass @returns {boolean} true when the class reliably carries render geometry. */
function isGeometric(ifcClass) {
  const cl = ifcClass.toLowerCase();
  if (cl.startsWith(GEOMETRIC_OVERRIDE_PREFIX)) return true;
  return !NON_GEOMETRIC_PREFIXES.some((p) => cl.startsWith(p));
}

/** @param {string} ifcClass @returns {boolean} */
function isRecognizable(ifcClass) {
  const cl = ifcClass.toLowerCase();
  return RECOGNIZABLE_PREFIXES.some((p) => cl.startsWith(p));
}

/** A short, human tag stem derived from an IFC class: drop the `Ifc` prefix and a `StandardCase` /
 * `Type` / `Element` suffix, keep only lowercased letters/digits (so `IfcWallStandardCase` → `wall`,
 * `IfcFlowSegment` → `flowsegment`). Falls back to `elem` if nothing survives.
 * @param {string} ifcClass @returns {string} */
function shortLabel(ifcClass) {
  let s = ifcClass.replace(/^Ifc/i, "").replace(/(StandardCase|Element|Type)$/i, "");
  s = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return s || "elem";
}

/** One candidate element pulled from the sidecar. @typedef {{ globalId: string, ifcClass: string,
 *  name: string | null }} Element */

/** Group the sidecar's geometric elements by IFC class, each class's list sorted by (name, GlobalId)
 * so selection is deterministic. Non-object entries, entries missing a string `ifc_class`, and
 * non-geometric classes are skipped. @param {Record<string, unknown>} sidecar
 * @returns {Map<string, Element[]>} */
function collectByClass(sidecar) {
  /** @type {Map<string, Element[]>} */
  const byClass = new Map();
  for (const [globalId, raw] of Object.entries(sidecar)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = /** @type {Record<string, unknown>} */ (raw);
    const ifcClass = classOf(entry);
    if (!ifcClass || !isGeometric(ifcClass)) continue;
    const name = typeof entry.name === "string" ? entry.name : null;
    const bucket = byClass.get(ifcClass) ?? [];
    bucket.push({ globalId, ifcClass, name });
    byClass.set(ifcClass, bucket);
  }
  for (const bucket of byClass.values()) {
    bucket.sort(
      (a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.globalId.localeCompare(b.globalId),
    );
  }
  return byClass;
}

/** Order the classes for round-robin selection. Sort key, ascending: (1) guaranteed-node classes
 * first — those with FEWER than `minInstances` elements can never be MMI-batched, so an early pick
 * from one satisfies the smoke's node-drive assertion; (2) recognizable classes before exotic ones;
 * (3) alphabetical, the deterministic tiebreak. @param {Map<string, Element[]>} byClass
 * @param {number} minInstances @returns {string[]} */
function orderClasses(byClass, minInstances) {
  return [...byClass.keys()].sort((a, b) => {
    const aNode = (byClass.get(a)?.length ?? 0) < minInstances ? 0 : 1;
    const bNode = (byClass.get(b)?.length ?? 0) < minInstances ? 0 : 1;
    if (aNode !== bNode) return aNode - bNode;
    const aRec = isRecognizable(a) ? 0 : 1;
    const bRec = isRecognizable(b) ? 0 : 1;
    if (aRec !== bRec) return aRec - bRec;
    return a.localeCompare(b);
  });
}

/** Round-robin one element per class across `order`, cycling until `max` elements are picked or the
 * classes are exhausted — a spread across distinct classes rather than N of one. Deterministic given
 * the deterministic `order` and per-class sort. @param {Map<string, Element[]>} byClass
 * @param {string[]} order @param {number} max @returns {Element[]} */
function pickElements(byClass, order, max) {
  /** @type {Element[]} */
  const picked = [];
  /** @type {Map<string, number>} */
  const cursor = new Map();
  let progressed = true;
  while (picked.length < max && progressed) {
    progressed = false;
    for (const cl of order) {
      if (picked.length >= max) break;
      const bucket = byClass.get(cl) ?? [];
      const i = cursor.get(cl) ?? 0;
      const el = bucket[i];
      if (el === undefined) continue;
      picked.push(el);
      cursor.set(cl, i + 1);
      progressed = true;
    }
  }
  return picked;
}

/** @typedef {Object} BindingMapOptions
 * @property {number} [max] cap on bindings (default 12)
 * @property {number} [minInstances] optimizer batch threshold to reason about node residency (default 8)
 * @property {number} [minValue] tag range floor (default 0)
 * @property {number} [maxValue] tag range ceiling (default 100)
 * @property {string[]} [ramp] two hex colours low→high (default dark→cyan) */

/** @typedef {Object} BindingRow
 * @property {string} tag @property {string} globalid @property {number} min @property {number} max
 * @property {string} response @property {string[]} ramp @property {string} ifc @property {string} note */

/** @typedef {Object} BindingMap
 * @property {number} version @property {string} _about @property {BindingRow[]} bindings */

/** Build a valid binding map from a parsed sidecar. Pure + deterministic (see the module header).
 * Returns `{version, _about, bindings}`; `bindings` is empty only when the sidecar carries no
 * geometric element at all (the caller surfaces that as a FAIL). @param {Record<string, unknown>}
 * sidecar @param {BindingMapOptions} [opts] @returns {BindingMap} */
export function buildBindingMap(sidecar, opts = {}) {
  const max = opts.max ?? DEFAULT_MAX_BINDINGS;
  const minInstances = opts.minInstances ?? DEFAULT_MIN_INSTANCES;
  const minValue = opts.minValue ?? DEFAULT_MIN_VALUE;
  const maxValue = opts.maxValue ?? DEFAULT_MAX_VALUE;
  const ramp = opts.ramp ?? DEFAULT_RAMP;

  const byClass = collectByClass(sidecar);
  const order = orderClasses(byClass, minInstances);
  const picked = pickElements(byClass, order, max);

  /** @type {Map<string, number>} */
  const tagCounter = new Map();
  /** @type {BindingRow[]} */
  const bindings = picked.map((el) => {
    const stem = shortLabel(el.ifcClass);
    const n = (tagCounter.get(stem) ?? 0) + 1;
    tagCounter.set(stem, n);
    return {
      tag: `${stem}_${n}.state`,
      globalid: el.globalId,
      min: minValue,
      max: maxValue,
      response: "albedo_ramp",
      ramp: [...ramp],
      ifc: `${el.ifcClass} / ${el.name ?? "(unnamed)"}`,
      note: "auto-generated binding — retune min/max/ramp/response for this element's real telemetry.",
    };
  });

  const classes = [...new Set(picked.map((e) => e.ifcClass))].length;
  return {
    version: 1,
    _about:
      `Auto-generated binding map (tools/gen_binding_map.js) — ${bindings.length} tag(s) across ` +
      `${classes} class(es), picked from the property sidecar. Each row binds a synthesized ` +
      `tag to a REAL element by its stable id (IFC GlobalId, or USD prim path); the sim ` +
      `(tools/sim/server.js --map) derives ` +
      `its tag table + [min,max] from here, so data and geometry never drift. The ramps/ranges are ` +
      `neutral defaults — retune each row for the element's real telemetry before shipping.`,
    bindings,
  };
}

/** Parse `--flag value` / `--flag=value` argv into a map. Local copy (sim/stream.js's parseArgs is
 * not materialized beside this file). @param {string[]} argv @returns {Record<string, string>} */
function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      out[a.slice(2)] = argv[i + 1] ?? "";
      i++;
    }
  }
  return out;
}

/** Parse + validate the sidecar file at `path` into a `{GlobalId:{…}}` object, or throw a plain
 * Error with a stranger-legible message. @param {string} path @returns {Record<string, unknown>} */
export function loadSidecarFile(path) {
  /** @type {string} */
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`cannot read sidecar '${path}' — run ifc_convert.py to write it first`);
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`sidecar '${path}' is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error(`sidecar '${path}' is not a { GlobalId: {…} } object`);
  return /** @type {Record<string, unknown>} */ (parsed);
}

/** Parse a numeric flag, or the fallback when absent; throws on a non-numeric value.
 * @param {Record<string, string>} args @param {string} name @param {number} fallback @returns {number} */
function numFlag(args, name, fallback) {
  const raw = args[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number (got '${raw}')`);
  return n;
}

/** CLI: read the sidecar, build the map, write it to --out (or stdout), print a VERDICT to stderr.
 * @param {string[]} argv @returns {void} */
export function runCli(argv) {
  const args = parseArgs(argv);
  const sidecarPath = args.sidecar;
  if (!sidecarPath) {
    console.error(
      "gen_binding_map: FAIL — --sidecar <models/<stem>_props.json> is required\n" +
        "usage: node tools/gen_binding_map.js --sidecar <props.json> [--out <map.json>] [--max N]",
    );
    process.exit(1);
  }
  const sidecar = loadSidecarFile(sidecarPath);
  const map = buildBindingMap(sidecar, {
    max: numFlag(args, "max", DEFAULT_MAX_BINDINGS),
    minInstances: numFlag(args, "min-instances", DEFAULT_MIN_INSTANCES),
    minValue: numFlag(args, "min", DEFAULT_MIN_VALUE),
    maxValue: numFlag(args, "max-value", DEFAULT_MAX_VALUE),
  });
  if (map.bindings.length === 0) {
    console.error(
      `gen_binding_map: FAIL — '${sidecarPath}' has no geometric element to bind (only spatial/` +
        "grouping classes). Nothing to paint; author a map by hand against a model with geometry.",
    );
    process.exit(1);
  }
  const json = JSON.stringify(map, null, 2) + "\n";
  if (args.out) {
    writeFileSync(args.out, json);
    console.error(
      `gen_binding_map: OK — ${map.bindings.length} binding(s) → ${args.out} ` +
        `(VERDICT: GEN-BINDING-MAP OK)`,
    );
  } else {
    process.stdout.write(json);
    console.error(
      `gen_binding_map: OK — ${map.bindings.length} binding(s) (VERDICT: GEN-BINDING-MAP OK)`,
    );
  }
}

// CLI entry: `node tools/gen_binding_map.js …`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runCli(process.argv.slice(2));
  } catch (e) {
    console.error(`gen_binding_map: FAIL — ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
