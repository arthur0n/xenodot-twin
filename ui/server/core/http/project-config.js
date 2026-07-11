// POST /api/project — the first-boot setup panel's "configure project" form. It takes an EXPLICIT
// path, validates it server-side (exists + has the engine project file), and on success persists
// `projectDir` to `.xenodot.json`. It NEVER scaffolds — scaffolding stays an explicit script
// (`npm run onboard:project -- <path>`); an invalid/empty path returns exactly that, pointing there.
// projectDir is a SERVER-BOOT const (config.js reads it once), so a successful save reports
// needsRestart — the panel offers the Phase-3 restart action (POST /api/restart) to bind it.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { ENGINE, saveConfig } from "../config.js";

/** Validate a user-supplied project path WITHOUT writing anything: it must be a non-empty path to
 * an existing directory that already holds the engine project file (project.godot). This is the
 * NEVER-SCAFFOLD guarantee — a missing project file is an honest error, not a silent `new`.
 * @param {string | undefined} raw @returns {{ ok: true, dir: string } | { error: string }} */
export function validateProjectPath(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return {
      error:
        "Enter the path to an existing project. To scaffold a NEW one, run: npm run onboard:project -- <path>",
    };
  }
  const dir = path.resolve(trimmed);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return {
      error: `No directory at ${dir}. To scaffold it, run: npm run onboard:project -- ${trimmed}`,
    };
  }
  if (!existsSync(path.join(dir, ENGINE.projectFile))) {
    return {
      error: `${dir} has no ${ENGINE.projectFile} — it isn't a project yet. This form never scaffolds; run: npm run onboard:project -- ${trimmed}`,
    };
  }
  return { ok: true, dir };
}

/** POST /api/project handler: validate the body's `path`, and on success persist projectDir.
 * @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
export function handleProjectPost(req, res) {
  /** @type {Buffer[]} */
  const chunks = [];
  req.on("data", (/** @type {Buffer} */ c) => {
    chunks.push(c);
  });
  req.on("end", () => {
    /** @type {{ ok: true, dir: string, needsRestart: true } | { error: string }} */
    let result;
    try {
      const body = /** @type {{ path?: string }} */ (
        parseJSON(Buffer.concat(chunks).toString("utf8") || "{}")
      );
      const v = validateProjectPath(body.path);
      if ("error" in v) {
        result = v;
      } else {
        const saved = saveConfig({ projectDir: v.dir });
        result = "error" in saved ? saved : { ok: true, dir: v.dir, needsRestart: true };
      }
    } catch {
      result = { error: "bad request" };
    }
    res.writeHead("error" in result ? 400 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  });
}
