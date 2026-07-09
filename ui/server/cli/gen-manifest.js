// Generate the per-game facts manifest — the deterministic answer to questions agents otherwise
// re-derive on every task: where is the engine binary, what's the render config, how do I
// build/verify/drive this game, what tools exist. Written into the game tree at
// .xenodot/manifest.json (gitignored, like tools/) by prepareGame() — so it regenerates on server
// startup, `doctor`, and `forge new`, and is exposed to the session as $XENODOT_MANIFEST.
//
// It does NOT regenerate tools/CAPABILITIES.md — that registry is a curated framework artifact
// (rich invocation docs) copied in by materializeTools; the manifest only POINTS at it and lists
// the materialized tool files, so the "do we already have it?" check is one read, not a re-glob.
//
// Idempotent and timestamp-free: the file changes only when a project fact changes, so repeated
// materialize runs don't churn it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ENGINE, PROFILE, RES_ASSET_MOUNT } from "../core/config.js";

/** @typedef {import("../../lib/profile.js").Profile} Profile */
/** @typedef {{ renderer: string|null, engine_version: string|null, viewport_width: number|null,
 *   viewport_height: number|null, stretch_mode: string, stretch_aspect: string,
 *   stretch_scale_mode: string|null }} RenderConfig */
/** @typedef {{ engine: { name: string, bin: string|null, version: string|null, projectFile: string },
 *   profile: Profile, render: RenderConfig, commands: Record<string,string>,
 *   input_actions: string[],
 *   layout: { entry_point: string|null, tools_dir: string, library: string, asset_mount: string },
 *   capabilities: { registry: string, tools: string[] } }} Manifest */

/** Strip one layer of surrounding double quotes from a project.godot scalar. @param {string} v */
const unquote = (v) => v.replace(/^"(.*)"$/, "$1");

/** Tolerant line parser for project.godot's INI-ish format. Captures single-line `key=value`
 * pairs (keys are already slash-namespaced, e.g. `window/size/viewport_width`) and, within the
 * `[input]` section, just the action NAMES (the `name={` headers) — never the multi-line event
 * dicts. @param {string} text @returns {{ flat: Record<string,string>, inputActions: string[] }} */
function parseProjectGodot(text) {
  /** @type {Record<string,string>} */
  const flat = {};
  /** @type {string[]} */
  const inputActions = [];
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";")) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1] ?? "";
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (section === "input") {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) inputActions.push(key);
      continue;
    }
    flat[key] = line.slice(eq + 1).trim();
  }
  return { flat, inputActions };
}

/** Build the render-config block from parsed project.godot facts — the ground truth the
 * godot-verify skill insists on, so agents stop re-reading [display]/config/features to get it.
 * @param {Record<string,string>} flat @returns {RenderConfig} */
function renderBlock(flat) {
  const features = [...(flat["config/features"] ?? "").matchAll(/"([^"]*)"/g)].map(
    (m) => m[1] ?? "",
  );
  const renderer = features.find((f) => /Forward|Mobile|Compatibility/.test(f)) ?? null;
  /** @param {string} k @returns {number|null} */
  const num = (k) => (flat[k] != null ? Number(flat[k]) : null);
  return {
    renderer,
    engine_version: features[0] ?? null,
    viewport_width: num("window/size/viewport_width"),
    viewport_height: num("window/size/viewport_height"),
    stretch_mode: flat["window/stretch/mode"] ? unquote(flat["window/stretch/mode"]) : "disabled",
    stretch_aspect: flat["window/stretch/aspect"] ? unquote(flat["window/stretch/aspect"]) : "keep",
    stretch_scale_mode: flat["window/stretch/scale_mode"]
      ? unquote(flat["window/stretch/scale_mode"])
      : null,
  };
}

/** List materialized tool entry points (a pointer to the curated registry, not a copy of it):
 * the runnable `*.gd`/`*.sh` files directly under tools/, excluding the `.uid` sidecars and the
 * tools/lib/ runtime stdlib. @param {string} toolsDir @returns {string[]} */
function listTools(toolsDir) {
  try {
    return readdirSync(toolsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(gd|sh)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Write <projectDir>/.xenodot/manifest.json with the deterministic project facts. Cheap (parse
 * one project.godot, list one dir) and safe when project.godot is absent (a fresh starter) — the
 * engine/commands block is still useful. @param {string} projectDir @returns {Manifest} */
export function generateManifest(projectDir) {
  const projectFile = path.join(projectDir, ENGINE.projectFile);
  const { flat, inputActions } = existsSync(projectFile)
    ? parseProjectGodot(readFileSync(projectFile, "utf8"))
    : { flat: {}, inputActions: [] };

  const render = renderBlock(flat);
  const mainScene = flat["run/main_scene"] ? unquote(flat["run/main_scene"]) : null;

  /** @type {Manifest} */
  const manifest = {
    // How agents find + run the engine — the fact re-derived 600+ times in the session logs.
    engine: {
      name: ENGINE.name,
      bin: ENGINE.bin, // resolved + persisted by config.js; also exported as $GODOT
      version: render.engine_version,
      projectFile: ENGINE.projectFile,
    },
    // The DECLARED {genre, style} (not derivable from the project tree) — stamped from
    // .xenodot.json's `profile` block (the write-of-record, see config.js PROFILE) on every
    // regen, so this derived-only file can be wiped freely without losing the declaration.
    // Drives which genre-*/style-* skills a session sees (M2). Nulls = never declared.
    profile: PROFILE,
    // Effective render pipeline — read this instead of re-parsing project.godot's [display].
    render,
    // Canonical build/verify/drive commands (the "/run" payload). $GODOT is preset in the session.
    commands: {
      validate: "tools/validate.sh",
      verify_scene: "$GODOT --headless --path . --script tools/verify_scene.gd",
      smoke: "$GODOT --headless --path . --quit-after 3",
      render_check: "$GODOT --path . --resolution 640x360 -s tools/verify_render.gd",
      screenshot: "$GODOT --path . --resolution 640x360 -s tools/capture_screenshot.gd",
    },
    input_actions: inputActions,
    layout: {
      entry_point: mainScene,
      tools_dir: "tools/",
      library: "library/", // symlink to the plugin knowledge base
      asset_mount: `res://${RES_ASSET_MOUNT}/`,
    },
    // Pointer to the curated registry + the materialized tool files — answers "do we already
    // have a tool for this?" in one read, without re-globbing tools/ and library/tools/.
    capabilities: {
      registry: "tools/CAPABILITIES.md",
      tools: listTools(path.join(projectDir, "tools")),
    },
  };

  const outDir = path.join(projectDir, ".xenodot");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

// CLI: `node ui/server/cli/gen-manifest.js [projectDir]`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PROJECT_DIR } = await import("../core/config.js");
  const arg = process.argv[2];
  // A flag-shaped arg must never resolve to a target dir (`--help` became a real dir once).
  if (arg?.startsWith("-")) {
    console.error(
      `gen-manifest: ${arg} is not a project path. Usage: node ui/server/cli/gen-manifest.js [projectDir]`,
    );
    process.exit(1);
  }
  const target = arg ? path.resolve(arg) : PROJECT_DIR;
  const m = generateManifest(target);
  console.log(
    `gen-manifest: ${target}/.xenodot/manifest.json — engine ${m.engine.name} ${m.engine.version ?? "?"} ` +
      `(bin ${m.engine.bin ?? "unresolved"}), profile ${m.profile.genre ?? "?"}/${m.profile.style ?? "?"}, ` +
      `${m.input_actions.length} input actions, ${m.capabilities.tools.length} tools.`,
  );
}
