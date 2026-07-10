// Binding-candidate tool: the agent's surface for authoring a binding map WITHOUT hand-grepping a
// 22 MB `<model>_props.json`. `mcp__ui__find_binding_candidates` lists candidate GlobalIds filtered
// by IFC class / Name (+ best-effort storey), so a session picks joins instead of scanning the whole
// sidecar into context. It wraps the SAME shared core (features/assets/binding-candidates.js) the
// `binding-candidates` CLI and the `/api/binding-candidates` UI endpoint call, so a query can never
// mean three different things (the analyze-tool ↔ analyze-cli split).
//
// READ-ONLY, so it auto-allows (config.BINDING_TOOL is in uiControlAllow's PLAIN_ALLOW_TOOLS) — but
// "read-only" is only safe if it can't be pointed at an arbitrary file. The LOAD-BEARING control is
// therefore CONFINEMENT: the model-supplied `sidecar` (or the dir a `model` resolves within) must
// resolve inside the project root, realpath-checked (symlink-safe). The check is the shared core's
// confineToRoot — the SAME function the /api/binding-candidates HTTP endpoint uses, so both
// untrusted-input surfaces carry the identical guarantee (a lexical-only check on either would pass
// an in-root symlink pointing outside — arbitrary-file disclosure). The tool NEVER dumps the sidecar:
// it returns a bounded page (limit ≤ 200) plus the class histogram and the true `matched` count, so
// the agent pages with `offset` rather than slurping 3.5k rows.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import path from "node:path";
import { realpathSync } from "node:fs";
import { PROJECT_DIR } from "../core/config.js";
import {
  SidecarError,
  confineToRoot,
  resolveSidecarPath,
  loadSidecar,
  queryCandidates,
} from "../features/assets/binding-candidates.js";

/** A tool text result, in the shape the agent SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

/** Render a candidate result as a compact text table (never the raw sidecar). @param {string} label
 * @param {import("../features/assets/binding-candidates.js").CandidateResult} r @returns {string} */
function render(label, r) {
  const head =
    `${label}: ${r.matched} of ${r.total} elements match — showing ${r.count} ` +
    `(offset ${r.offset}, limit ${r.limit}).`;
  const classes = r.classes.length
    ? "classes: " + r.classes.map((c) => `${c.ifcClass}×${c.count}`).join(", ")
    : "classes: (none)";
  if (r.count === 0) return `${head}\n${classes}`;
  const rows = r.candidates.map((c) => {
    const st = c.storey ? `  [${c.storey}]` : "";
    return `  ${c.globalId}  ${c.ifcClass}  ${c.name ?? "(unnamed)"}${st}`;
  });
  const more =
    r.offset + r.count < r.matched
      ? `\n… ${r.matched - r.offset - r.count} more — re-call with offset ${r.offset + r.limit}.`
      : "";
  return `${head}\n${classes}\nGlobalId  class  name:\n${rows.join("\n")}${more}`;
}

/** Build the find_binding_candidates tool. No session-scoped closure (a pure read of the project's
 * own sidecars), registered unconditionally like the analyze tool. */
export function makeBindingTool() {
  return tool(
    "find_binding_candidates",
    "List candidate IFC GlobalIds to bind in a binding map, filtered by IFC class and/or Name, so " +
      "you PICK joins instead of hand-grepping the model's `<model>_props.json` sidecar. Returns a " +
      "bounded page (GlobalId + class + name [+ storey]) plus a class histogram and the true match " +
      "count — page with `offset`, never dump the whole model. Read-only; confined to the project's " +
      "own sidecars. Use before authoring/fixing a binding_map.json, then verify with smoke_binding.gd.",
    {
      sidecar: z
        .string()
        .optional()
        .describe(
          "Path to a `<model>_props.json` (relative to the project root, or absolute in-project). " +
            "Omit to auto-pick: with one model in models/ it's used; with several, pass `model` or this.",
        ),
      model: z
        .string()
        .optional()
        .describe('Model stem, e.g. "Schependomlaan" → models/Schependomlaan_props.json.'),
      ifcClass: z
        .string()
        .optional()
        .describe(
          'IFC class filter, case-insensitive, prefix match: "IfcWall" catches IfcWall AND ' +
            'IfcWallStandardCase; "IfcDoor" only IfcDoor. Omit to see every class in the histogram.',
        ),
      name: z.string().optional().describe("Case-insensitive substring match on the element Name."),
      storey: z
        .string()
        .optional()
        .describe(
          "Best-effort storey-label substring — usually absent (the sidecar rarely records storey); " +
            "class + name are the reliable filters.",
        ),
      limit: z
        .number()
        .optional()
        .describe("Page size (default 25, max 200). NEVER returns the whole model."),
      offset: z.number().optional().describe("Page offset into the matched set (default 0)."),
    },
    async (input) => {
      try {
        const realRoot = realpathSync(PROJECT_DIR);
        const sidecarArg = input.sidecar
          ? confineToRoot(realRoot, input.sidecar, "sidecar")
          : undefined;
        const absPath = resolveSidecarPath({
          projectDir: realRoot,
          sidecar: sidecarArg,
          model: input.model,
        });
        // A confined `sidecar` was already checked lexically, but the FILE it names (and any
        // `model`-resolved path in models/) can itself be a symlink pointing outside the root —
        // re-confine the final path so no branch escapes.
        confineToRoot(realRoot, absPath, "sidecar");
        const { sidecar, bytes } = loadSidecar(absPath);
        const result = queryCandidates(sidecar, {
          ifcClass: input.ifcClass,
          name: input.name,
          storey: input.storey,
          limit: input.limit,
          offset: input.offset,
        });
        const label = `${path.basename(absPath)} (${(bytes / 1e6).toFixed(1)} MB)`;
        return ok(render(label, result));
      } catch (err) {
        if (err instanceof SidecarError) return ok(`find_binding_candidates: ${err.message}`);
        throw err;
      }
    },
  );
}
