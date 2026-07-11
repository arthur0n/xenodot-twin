// Live project inventory — scanned on every /api/state request so it never
// drifts from what's actually on disk.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  PROJECT_DIR,
  PROJECT_CONFIGURED,
  PROJECT_FOUND,
  ENGINE,
  FRAMEWORK_PLUGIN_DIR,
  hermesPublicConfig,
  codexPublicConfig,
  docsPublicConfig,
} from "../config.js";
import { parseFrontmatter } from "../../../lib/frontmatter.js";
import { twinPublicConfig } from "../../features/twin/twin-data.js";

/**
 * @param {string} dir
 * @param {string[]} exts
 * @param {string[]} [out]
 * @param {string} [base]
 * @returns {string[]}
 */
function walk(dir, exts, out = [], base = dir) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, base);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(path.relative(base, full));
  }
  return out;
}

/** @param {string} file @returns {string} */
function firstHeading(file) {
  try {
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith("# "));
    return line ? line.slice(2).trim() : path.basename(file);
  } catch {
    return path.basename(file);
  }
}

/** Collect agents (name + model) across dirs; earlier dirs win on name clash (plugin first,
 * then the game's own unpromoted agents). @param {string[]} dirs */
function collectAgents(dirs) {
  /** @type {Map<string, { name: string, model: string | null }>} */
  const seen = new Map();
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".md")) continue;
      const name = f.replace(/\.md$/, "");
      if (seen.has(name)) continue;
      let model = null;
      try {
        model = readFileSync(path.join(d, f), "utf8").match(/^model:\s*(\S+)/m)?.[1] ?? null;
      } catch {
        /* unreadable — leave model null */
      }
      seen.set(name, { name, model });
    }
  }
  return [...seen.values()];
}

/** Collect skill folder names across dirs (deduped, plugin first). @param {string[]} dirs */
function collectSkills(dirs) {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) seen.add(e.name);
  }
  return [...seen];
}

/** @returns {import("../../../lib/types.js").ProjectState} */
export function projectState() {
  const dir = PROJECT_DIR;
  // Honest name for the unconfigured state — no phantom seat is implied (D7-no-silent-sibling-dirs).
  let name = PROJECT_CONFIGURED ? path.basename(dir) : "(no project configured)";
  try {
    const match = readFileSync(path.join(dir, ENGINE.projectFile), "utf8").match(
      /config\/name="([^"]+)"/,
    );
    if (match?.[1]) name = match[1];
  } catch {}
  return {
    name,
    dir,
    // false → PROJECT_DIR has no project.godot; the UI shows a setup banner
    // instead of empty panels (see loadState in project-tree.js).
    found: PROJECT_FOUND,
    designDocs: walk(path.join(dir, "design"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => ({ path: f, title: firstHeading(path.join(dir, f)) })),
    // Research record catalog (addon/tool/skill researchers) — records carry OKF-style
    // YAML frontmatter (type/title/description, gated by `npm run check:library`), so the
    // sidebar shows the verdict without opening docs. index.md files are generated
    // navigation, not records.
    library: walk(path.join(dir, "library"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md") && !f.endsWith("index.md"))
      .map((f) => {
        const full = path.join(dir, f);
        /** @type {import("../../../lib/frontmatter.js").FrontmatterData | null} */
        let fm = null;
        try {
          fm = parseFrontmatter(readFileSync(full, "utf8")).data;
        } catch {}
        return {
          path: f,
          title: typeof fm?.title === "string" && fm.title ? fm.title : firstHeading(full),
          type: typeof fm?.type === "string" && fm.type ? fm.type : null,
          description:
            typeof fm?.description === "string" && fm.description ? fm.description : null,
        };
      }),
    scenes: walk(dir, [".tscn"], [], dir),
    scripts: walk(dir, [".gd"], [], dir),
    // Capabilities come from the xenodot plugin (the framework source); a game may also
    // carry its own unpromoted agents/skills in .claude/. Show both, plugin first.
    agents: collectAgents([
      path.join(FRAMEWORK_PLUGIN_DIR, "agents"),
      path.join(dir, ".claude", "agents"),
    ]),
    skills: collectSkills([
      path.join(FRAMEWORK_PLUGIN_DIR, "skills"),
      path.join(dir, ".claude", "skills"),
    ]),
    // External Hermes researcher config for the settings panel — key-free (hasKey only).
    hermes: hermesPublicConfig(),
    // Optional Codex reviewer config for the settings panel — secret-free (enabled + vendored).
    codex: codexPublicConfig(),
    // Optional Godot-docs MCP config for the settings panel — secret-free (just enabled).
    docs: docsPublicConfig(),
    // Configured twin data source (the relay's `sourceUrl` seam) for the settings panel — a LIVE
    // ws:// source is integrator-side and not hostable; a published demo bakes url="" (a baked
    // recording). Read-only: the bridge/viewer run outside the web UI, only the config is shown.
    // Userinfo (user:pass@) is redacted here so bridge-embedded operator credentials never reach
    // the client — the on-disk config and the live relay keep the real URL.
    twin: twinPublicConfig(),
  };
}
