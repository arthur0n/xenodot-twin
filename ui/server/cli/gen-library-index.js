// Library gate — every shipped library record carries OKF-style YAML frontmatter
// (type/title/description, see plugin/library/README.md) and every kind folder carries an
// index.md listing its records, so agents navigate the library from one cheap read instead of
// globbing and the UI sidebar reads structured fields instead of regex-scraping prose. The
// frontmatter subset matches Google's Open Knowledge Format v0.1 (only `type` is required
// there; we also require title + description because the index and the sidebar render them).
// Mirrors gen-contamination.js: bare-node; wired into `npm run validate` and CI.
//   node ui/server/cli/gen-library-index.js            # verify — exits 1 on any violation/drift
//   node ui/server/cli/gen-library-index.js --write    # regenerate each kind's index.md
// Frontmatter PRESENCE is an ERROR (exits 1); chunk QUALITY (over-long, multi-topic, near-dup
// description) is a WARN-only signal — it never fails the build, it just points curation at the
// records worth re-chunking. Mechanizes "fix chunking, don't ask the model to sift".
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FRAMEWORK_PLUGIN_DIR, TWIN_PLUGIN_DIR } from "../core/config.js";
import { parseFrontmatter } from "../../lib/frontmatter.js";

// BOTH plugin libraries get the same gate + generated per-kind indexes: the base plugin's
// (ships to every game) and the twin plugin's (ships to every viewer project) — each generator
// output stays INSIDE its own library (plugin-twin/library/<kind>/index.md is generated there,
// never merged into the base indexes). A missing library (plain fork) is skipped.
const LIBRARIES = [
  { label: "plugin", dir: path.join(FRAMEWORK_PLUGIN_DIR, "library") },
  { label: "plugin-twin", dir: path.join(TWIN_PLUGIN_DIR, "library") },
].filter((l) => existsSync(l.dir));
const WRITE = process.argv.includes("--write");

/** Recursively collect record .md files (skips README.md, index.md, and archive/ raws).
 * @param {string} dir @param {string[]} [out] @returns {string[]} */
function records(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "archive") records(full, out);
    } else if (e.name.endsWith(".md") && e.name !== "README.md" && e.name !== "index.md") {
      out.push(full);
    }
  }
  return out;
}

// Warn-only chunk-quality heuristics (D2). A library record is a retrieval chunk: one topic,
// small enough to read whole. These flag the records that drift from that shape.
const MAX_RECORD_LINES = 120; // body lines; longer → probably several topics, split it
const DUP_DESC_JACCARD = 0.8; // ≥ this word-overlap between two descriptions → near-duplicate

/** Body line count + count of top-level (`#`) headings that sit OUTSIDE code fences (a fenced
 * `# comment` is not a topic). >1 real H1 ⇒ multi-topic record.
 * @param {string} body @returns {{ lines: number, h1s: number }} */
function bodyStats(body) {
  let h1s = 0;
  let fenced = false;
  const rows = body.replace(/\n$/, "").split("\n");
  for (const raw of rows) {
    const line = raw.trim();
    if (line.startsWith("```") || line.startsWith("~~~")) fenced = !fenced;
    else if (!fenced && /^# \S/.test(raw)) h1s++;
  }
  return { lines: body.trim() ? rows.length : 0, h1s };
}

/** Significant word set of a description, for near-duplicate comparison (drops short stopword-ish
 * tokens). @param {string} s @returns {Set<string>} */
function descWords(s) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 2),
  );
}

/** Jaccard overlap of two word sets. @param {Set<string>} a @param {Set<string>} b */
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

if (!LIBRARIES.length) {
  console.log("ok  library: no library folder");
  process.exit(0);
}

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];
let drifted = 0;
/** @type {string[]} */
const totals = [];

for (const { label, dir: LIBRARY } of LIBRARIES) {
  /** @type {Map<string, Array<{ rel: string, title: string, description: string }>>} */
  const byKind = new Map();
  /** @type {Array<{ rel: string, lines: number, h1s: number, words: Set<string> }>} */
  const recs = [];

  for (const file of records(LIBRARY)) {
    const rel = path.join(label, "library", path.relative(LIBRARY, file));
    const kindRel = path.relative(LIBRARY, file);
    const kind = kindRel.includes(path.sep) ? kindRel.split(path.sep)[0] : null;
    if (!kind) {
      errors.push(`${rel}: record sits at the library root — records live in library/<kind>/`);
      continue;
    }
    const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
    if (!data) {
      errors.push(`${rel}: no YAML frontmatter (records need type/title/description)`);
      continue;
    }
    for (const field of ["type", "title", "description"]) {
      const v = data[field];
      if (typeof v !== "string" || !v.trim())
        errors.push(`${rel}: frontmatter missing \`${field}\``);
    }
    if (typeof data.title !== "string" || typeof data.description !== "string") continue;
    const { lines, h1s } = bodyStats(body);
    recs.push({ rel, lines, h1s, words: descWords(data.description) });
    const list = byKind.get(kind) ?? [];
    list.push({
      rel: kindRel.slice(kind.length + 1),
      title: data.title,
      description: data.description,
    });
    byKind.set(kind, list);
  }

  // Chunk-quality warnings (non-blocking) — over-long, multi-topic, or near-duplicate records.
  for (const r of recs) {
    if (r.lines > MAX_RECORD_LINES)
      warnings.push(
        `${r.rel}: ${r.lines} lines (> ${MAX_RECORD_LINES}) — long record, split into focused chunks`,
      );
    if (r.h1s > 1)
      warnings.push(
        `${r.rel}: ${r.h1s} top-level \`#\` topics — multi-topic record, one chunk per topic`,
      );
  }
  for (let i = 0; i < recs.length; i++)
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i];
      const b = recs[j];
      if (!a || !b) continue;
      const sim = jaccard(a.words, b.words);
      if (sim >= DUP_DESC_JACCARD)
        warnings.push(
          `${a.rel} ~ ${b.rel}: near-duplicate description (${Math.round(sim * 100)}% word overlap) — merge or differentiate`,
        );
    }

  for (const [kind, list] of [...byKind.entries()].sort()) {
    list.sort((a, b) => a.rel.localeCompare(b.rel));
    const content =
      `# ${kind} — index\n\n` +
      "<!-- Generated by `npm run check:library -- --write` — do not edit by hand. -->\n\n" +
      list.map((r) => `- [${r.title}](${r.rel}) — ${r.description}`).join("\n") +
      "\n";
    const indexPath = path.join(LIBRARY, kind, "index.md");
    const current = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;
    if (current === content) continue;
    if (WRITE) {
      writeFileSync(indexPath, content);
      console.log(`wrote ${label}/library/${kind}/index.md (${list.length} records)`);
    } else {
      drifted++;
      errors.push(
        `${label}/library/${kind}/index.md: ${current === null ? "missing" : "stale"} — run \`npm run check:library -- --write\``,
      );
    }
  }

  totals.push(
    `${[...byKind.values()].reduce((n, l) => n + l.length, 0)} (${label}, ${byKind.size} kind index(es))`,
  );
}

if (warnings.length) {
  console.warn(`⚠  library: ${warnings.length} chunk-quality warning(s) (non-blocking):`);
  for (const w of warnings) console.warn(`    ${w}`);
}

if (errors.length) {
  console.error(`✗ library: ${errors.length} violation(s):`);
  for (const e of errors) console.error(`    ${e}`);
  console.error(
    "  Library records ship to EVERY game and feed the UI sidebar + kind indexes. Each record " +
      "needs OKF frontmatter (type/title/description — see plugin/library/README.md)" +
      (drifted ? "; regenerate indexes with `npm run check:library -- --write`." : "."),
  );
  process.exit(1);
}
console.log(`ok  library: records conform — ${totals.join(" + ")}; indexes current`);
