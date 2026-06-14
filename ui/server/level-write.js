// Write a hand-drawn blockout grid from the "Draw Level" UI into the game's
// levels/drawn/current.json. The grid is a BUILD-TIME spatial reference: the
// level-designer briefs it and godot-dev builds a GridMap level from it (skill:
// godot-gridmap-level) — it is NOT loaded at runtime. Sibling to asset-write.js:
// narrow, validated, and confined to <project>/levels/drawn/.
// Structure codes: 0 = floor, 1 = wall, 2 = door, 3 = window, 4 = item. Items
// carry an id via the `items` list ({id,x,y}; same id = same item); `rooms`
// ({id,x,y}) tags cells into numbered room regions (same id = one room).
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PROJECT_DIR } from "./config.js";

const MAX_CELLS = 256 * 256; // generous cap; a sane "for an idea" grid is ~16–128/side
const MAX_TILE = 4; // 0 floor · 1 wall · 2 door · 3 window · 4 item
const MAX_ID = 99; // item / room id range
const MAX_TAGS = 2000; // defensive cap on items / rooms list length

/**
 * Validate a list of numbered cell tags ({id,x,y}) against the grid bounds.
 * Used for both `items` and `rooms`.
 * @param {unknown} raw @param {number} width @param {number} height
 * @returns {{ id: number, x: number, y: number }[]}
 */
function parseTags(raw, width, height) {
  /** @type {{ id: number, x: number, y: number }[]} */
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (const item of /** @type {unknown[]} */ (raw)) {
    if (typeof item !== "object" || item === null) continue;
    const t = /** @type {{ id?: unknown, x?: unknown, y?: unknown }} */ (item);
    const id = Math.trunc(Number(t.id));
    const x = Math.trunc(Number(t.x));
    const y = Math.trunc(Number(t.y));
    const inBounds = x >= 0 && x < width && y >= 0 && y < height;
    if (id >= 1 && id <= MAX_ID && inBounds && out.length < MAX_TAGS) out.push({ id, x, y });
  }
  return out;
}

/**
 * Validate a blockout grid and write it to <project>/levels/drawn/current.json.
 * Shape: { width, height, cell_size?, cells: number[], items?: {id,x,y}[], rooms?: {id,x,y}[] }
 * row-major, structure codes 0..4.
 * @param {unknown} grid
 * @returns {{ path: string, width: number, height: number, painted: number } | { error: string }}
 */
export function writeLevel(grid) {
  if (typeof grid !== "object" || grid === null) return { error: "no grid data" };
  const g =
    /** @type {{ width?: unknown, height?: unknown, cell_size?: unknown, cells?: unknown, items?: unknown, rooms?: unknown }} */ (
      grid
    );
  const width = Number(g.width);
  const height = Number(g.height);
  const cellSize = g.cell_size == null ? 2 : Number(g.cell_size);
  const { cells } = g;

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { error: "width/height must be positive integers" };
  }
  if (width * height > MAX_CELLS) return { error: "grid too large" };
  if (!Array.isArray(cells) || cells.length !== width * height) {
    return { error: "cells length must equal width*height" };
  }
  if (!(cellSize > 0) || cellSize > 100) return { error: "cell_size out of range" };

  /** @type {number[]} */
  const norm = cells.map((c) => {
    const n = Math.trunc(Number(c));
    return Number.isFinite(n) && n >= 0 && n <= MAX_TILE ? n : 0;
  });

  const items = parseTags(g.items, width, height);
  const rooms = parseTags(g.rooms, width, height);

  const dir = path.join(PROJECT_DIR, "levels", "drawn");
  const file = path.join(dir, "current.json");
  if (!file.startsWith(dir + path.sep)) return { error: "invalid path" }; // defense in depth
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ width, height, cell_size: cellSize, cells: norm, items, rooms }) + "\n",
  );

  return {
    path: path.relative(PROJECT_DIR, file),
    width,
    height,
    painted: norm.reduce((a, b) => a + (b ? 1 : 0), 0),
  };
}
