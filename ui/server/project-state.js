// Live project inventory — scanned on every /api/state request so it never
// drifts from what's actually on disk.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR, PROJECT_FOUND } from "./config.js";

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

/** @returns {import("../lib/types.js").ProjectState} */
export function projectState() {
  const dir = PROJECT_DIR;
  let name = path.basename(dir);
  try {
    const match = readFileSync(path.join(dir, "project.godot"), "utf8").match(
      /config\/name="([^"]+)"/,
    );
    if (match?.[1]) name = match[1];
  } catch {}
  const agentsDir = path.join(dir, ".claude", "agents");
  const skillsDir = path.join(dir, ".claude", "skills");
  return {
    name,
    dir,
    // false → PROJECT_DIR has no project.godot; the UI shows a setup banner
    // instead of empty panels (see loadState in project-tree.js).
    found: PROJECT_FOUND,
    designDocs: walk(path.join(dir, "design"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => ({ path: f, title: firstHeading(path.join(dir, f)) })),
    // Addon research catalog (written by addon-researcher) — the verdict line
    // makes adopt/reject visible from the sidebar without opening docs.
    library: walk(path.join(dir, "library"), [".md"], [], dir)
      .filter((f) => !f.endsWith("README.md"))
      .map((f) => {
        const full = path.join(dir, f);
        let verdict = null;
        try {
          verdict =
            readFileSync(full, "utf8")
              .match(/^\*\*Verdict\*\*\s*[—-]\s*(.+)$/m)?.[1]
              ?.trim() ?? null;
        } catch {}
        return { path: f, title: firstHeading(full), verdict };
      }),
    scenes: walk(dir, [".tscn"], [], dir),
    scripts: walk(dir, [".gd"], [], dir),
    agents: existsSync(agentsDir)
      ? readdirSync(agentsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => {
            const model = readFileSync(path.join(agentsDir, f), "utf8").match(
              /^model:\s*(\S+)/m,
            )?.[1];
            return { name: f.replace(/\.md$/, ""), model: model ?? null };
          })
      : [],
    skills: existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [],
  };
}
