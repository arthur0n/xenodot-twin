// Write a pixel-art PNG uploaded from the web UI into the game's
// assets/textures/ folder, where godot-dev wires it. Sibling to
// transcript-write.js and equally narrow: PNG only, name slugified to
// [a-z0-9-], confined to <project>/assets/textures/, never clobbers.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR } from "./config.js";

const MAX_BYTES = 5_000_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @param {string} s @returns {string} */
function slug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "texture"
  );
}

/**
 * Decode a `data:image/png;base64,…` URL and write it to
 * <project>/assets/textures/<slug(name)>.png, suffixing -2, -3, … to avoid
 * clobbering. Returns the project-relative path or an error.
 * @param {string} name @param {string} dataUrl
 * @returns {{ path: string } | { error: string }}
 */
export function writeAsset(name, dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m) return { error: "PNG only — upload a .png with a transparent background" };
  const buf = Buffer.from(m[1] ?? "", "base64");
  if (buf.length > MAX_BYTES) return { error: "image too large (max 5 MB)" };
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return { error: "not a valid PNG" };

  const dir = path.join(PROJECT_DIR, "assets", "textures");
  const stem = slug(name);
  let file = path.join(dir, `${stem}.png`);
  if (!file.startsWith(dir + path.sep)) return { error: "invalid name" }; // defense in depth
  mkdirSync(dir, { recursive: true });
  let n = 2;
  while (existsSync(file)) file = path.join(dir, `${stem}-${n++}.png`);
  writeFileSync(file, buf);
  return { path: path.relative(PROJECT_DIR, file) };
}
