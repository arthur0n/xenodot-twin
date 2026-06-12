// Minimal markdown → DOM for agent chat messages. Covers the subset agents
// actually emit: paragraphs, **bold**, *italic*, `code`, fenced blocks,
// #-headings, bullet / numbered lists, and links. Builds real nodes via
// textContent — raw model output never reaches innerHTML.
import { el } from "./dom.js";

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|((?<![\w`])_[^_\n]+_(?!\w))/g;

/** Append `text` to `target`, resolving inline markdown spans.
 * @param {HTMLElement} target @param {string} text */
function inline(target, text) {
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) target.append(text.slice(last, m.index));
    if (m[1]) target.append(el("code", "", m[1].slice(1, -1)));
    else if (m[2])
      inline(/** @type {HTMLElement} */ (target.appendChild(el("strong"))), m[2].slice(2, -2));
    else if (m[3] || m[7]) {
      const src = /** @type {string} */ (m[3] ?? m[7]);
      inline(/** @type {HTMLElement} */ (target.appendChild(el("em"))), src.slice(1, -1));
    } else if (m[4] && m[5] && m[6]) {
      const a = /** @type {HTMLAnchorElement} */ (el("a", "", m[5]));
      a.href = m[6];
      a.target = "_blank";
      a.rel = "noreferrer";
      target.append(a);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) target.append(text.slice(last));
}

/** Fenced code block: consumes lines from `i` (the opening ```).
 * @param {string[]} lines @param {number} i
 * @returns {{ node: HTMLElement, next: number }} */
function fence(lines, i) {
  const buf = [];
  let j = i + 1;
  while (j < lines.length && !(lines[j] ?? "").startsWith("```")) {
    buf.push(lines[j]);
    j++;
  }
  const pre = el("pre");
  pre.append(el("code", "", buf.join("\n")));
  return { node: pre, next: j + 1 };
}

/** Run of list items (bullet or numbered) starting at `i`.
 * @param {string[]} lines @param {number} i @param {RegExp} marker @param {string} tag
 * @returns {{ node: HTMLElement, next: number }} */
function list(lines, i, marker, tag) {
  const node = el(tag);
  let j = i;
  while (j < lines.length && marker.test(lines[j] ?? "")) {
    inline(
      /** @type {HTMLElement} */ (node.appendChild(el("li"))),
      (lines[j] ?? "").replace(marker, ""),
    );
    j++;
  }
  return { node, next: j };
}

const BULLET = /^\s*[-*]\s+/;
const NUMBER = /^\s*\d+\.\s+/;
const HEADING = /^(#{1,4})\s+/;

/** Run of plain lines → one paragraph, single newlines kept as <br>.
 * @param {string[]} lines @param {number} i
 * @returns {{ node: HTMLElement, next: number }} */
function paragraph(lines, i) {
  const p = el("p");
  let j = i;
  while (j < lines.length) {
    const line = lines[j] ?? "";
    if (
      !line.trim() ||
      line.startsWith("```") ||
      BULLET.test(line) ||
      NUMBER.test(line) ||
      HEADING.test(line)
    )
      break;
    if (j > i) p.append(el("br"));
    inline(p, line);
    j++;
  }
  return { node: p, next: j };
}

/** @param {string} text @returns {DocumentFragment} */
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    /** @type {{ node: HTMLElement, next: number }} */
    let block;
    if (line.startsWith("```")) block = fence(lines, i);
    else if (HEADING.test(line)) {
      const h = el("p", "md-h");
      inline(h, line.replace(HEADING, ""));
      block = { node: h, next: i + 1 };
    } else if (BULLET.test(line)) block = list(lines, i, BULLET, "ul");
    else if (NUMBER.test(line)) block = list(lines, i, NUMBER, "ol");
    else block = paragraph(lines, i);
    frag.append(block.node);
    i = block.next;
  }
  return frag;
}
