// Write a raw transcript pasted in the web UI into the game's transcripts/ drop
// zone, where transcript-researcher harvests it. This is the UI's only
// project-write path, so it stays narrow: the name is slugified to
// [a-z0-9-] and the file is confined to <project>/transcripts/.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR } from "./config.js";

/** @param {string} s @returns {string} */
function slug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "transcript"
  );
}

/**
 * Write `text` to <project>/transcripts/<slug(name)>.md, suffixing -2, -3, … to
 * avoid clobbering an existing file.
 * @param {string} name @param {string} text
 * @returns {{ path: string } | { error: string }}
 */
export function writeTranscript(name, text) {
  if (!text.trim()) return { error: "empty transcript text" };
  const dir = path.join(PROJECT_DIR, "transcripts");
  const stem = slug(name);
  let file = path.join(dir, `${stem}.md`);
  if (!file.startsWith(dir + path.sep)) return { error: "invalid name" }; // defense in depth
  mkdirSync(dir, { recursive: true });
  let n = 2;
  while (existsSync(file)) file = path.join(dir, `${stem}-${n++}.md`);
  writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
  return { path: path.relative(PROJECT_DIR, file) };
}
