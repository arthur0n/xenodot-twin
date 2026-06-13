// "Draw level" — sketch a top-down blockout in the browser and ship it to the
// game as a tile grid the guided-level builder extrudes at runtime. Sibling to
// get-assets.js — same modal → POST → file → user_input handoff plumbing.
// Prototype, "for an idea": a small 24×16 grid with a numbered ruler + a palette
// of tile types, sized so every cell is visible (no zoom needed).
// Tile codes: 0 floor · 1 wall · 2 door · 3 window · 4 item.
import { $, el } from "./dom.js";
import { fetchJSON, postJSON } from "../lib/json.js";
import { send } from "./websocket.js";
import { addUser } from "./chat.js";
import { loadState } from "./project-tree.js";

const GRID_W = 24; // cells across (X)
const GRID_H = 16; // cells down (Z) — small + rectangular so every cell is visible
const CELL_PX = 22; // on-canvas size of one cell, in px
const RULER = 18; // px margin on top + left for ruler numbers
const PAD = 14; // px margin on right + bottom so the last ruler number isn't clipped
const MAJOR = 4; // a heavier gridline + a ruler number every N cells
const CELL_SIZE = 1; // default world units/cell; the level-designer settles the real scale

/** The brush palette. id 0 = erase (paint floor). @type {{ id: number, label: string, color: string }[]} */
const PALETTE = [
  { id: 1, label: "Wall", color: "#5cc99a" },
  { id: 2, label: "Door", color: "#e0a44a" },
  { id: 3, label: "Window", color: "#5aa6d9" },
  { id: 4, label: "Item 1", color: "#a87de0" },
  { id: 5, label: "Item 2", color: "#e0635f" },
  { id: 6, label: "Item 3", color: "#e069b4" },
  { id: 7, label: "Item 4", color: "#45c8c0" },
  { id: -1, label: "Number", color: "#e8e8e8" },
  { id: 0, label: "Erase", color: "" },
];

/** Tile codes, row-major (width = GRID_W). @type {Uint8Array} */
const cells = new Uint8Array(GRID_W * GRID_H);
/** Numbered markers: cell indices in placement order (shown number = index + 1). @type {number[]} */
const labels = [];
let brush = 1; // active tile id (-1 = number/marker mode; default: Wall)
let painting = false;
let lastX = -1;
let lastY = -1;
/** Saved drawn levels for the load picker (name -> grid).
 * @type {Map<string, { width: number, height: number, cells: number[], labels?: { n: number, x: number, y: number }[] }>} */
const saved = new Map();

/** @param {number} v @returns {string} */
function colorFor(v) {
  switch (v) {
    case 1:
      return "#5cc99a";
    case 2:
      return "#e0a44a";
    case 3:
      return "#5aa6d9";
    case 4:
      return "#a87de0";
    case 5:
      return "#e0635f";
    case 6:
      return "#e069b4";
    case 7:
      return "#45c8c0";
    default:
      return "";
  }
}

/** @returns {HTMLCanvasElement} */
const canvasEl = () => /** @type {HTMLCanvasElement} */ ($("draw-level-canvas"));

function render() {
  const canvas = canvasEl();
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const gridRight = RULER + GRID_W * CELL_PX;
  const gridBottom = RULER + GRID_H * CELL_PX;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // painted cells
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const v = cells[y * GRID_W + x];
      if (v) {
        ctx.fillStyle = colorFor(v);
        ctx.fillRect(RULER + x * CELL_PX, RULER + y * CELL_PX, CELL_PX, CELL_PX);
      }
    }
  }

  // grid lines — every cell, heavier every MAJOR cells
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_W; i++) {
    ctx.strokeStyle = i % MAJOR === 0 ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.09)";
    const gx = RULER + i * CELL_PX + 0.5;
    ctx.beginPath();
    ctx.moveTo(gx, RULER);
    ctx.lineTo(gx, gridBottom);
    ctx.stroke();
  }
  for (let j = 0; j <= GRID_H; j++) {
    ctx.strokeStyle = j % MAJOR === 0 ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.09)";
    const gy = RULER + j * CELL_PX + 0.5;
    ctx.beginPath();
    ctx.moveTo(RULER, gy);
    ctx.lineTo(gridRight, gy);
    ctx.stroke();
  }

  // ruler numbers along the top + left, every MAJOR cells
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (let i = 0; i <= GRID_W; i += MAJOR) {
    ctx.fillText(String(i), RULER + i * CELL_PX, RULER * 0.5);
  }
  for (let j = 0; j <= GRID_H; j += MAJOR) {
    ctx.fillText(String(j), RULER * 0.5, RULER + j * CELL_PX);
  }

  // numbered markers, drawn on top of the tiles (white text, dark outline)
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.lineWidth = 3;
  labels.forEach((idx, i) => {
    const cx = RULER + (idx % GRID_W) * CELL_PX + CELL_PX / 2;
    const cy = RULER + Math.floor(idx / GRID_W) * CELL_PX + CELL_PX / 2;
    const t = String(i + 1);
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(t, cx, cy);
    ctx.fillStyle = "#fff";
    ctx.fillText(t, cx, cy);
  });
}

/** @param {number} x @param {number} y @param {number} v */
function setCell(x, y, v) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
  cells[y * GRID_W + x] = v;
}

/** Fill cells along a line (Bresenham) so fast drags leave no gaps.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} v */
function paintLine(x0, y0, x1, y1, v) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setCell(x, y, v);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Grid cell under a pointer event, or {x:-1} if outside the grid.
 * @param {PointerEvent} e @returns {{ x: number, y: number }} */
function cellAt(e) {
  const canvas = canvasEl();
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  const x = Math.floor((px - RULER) / CELL_PX);
  const y = Math.floor((py - RULER) / CELL_PX);
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return { x: -1, y: -1 };
  return { x, y };
}

/** Paint the active tile brush (or erase, on right-button) under a pointer event.
 * @param {PointerEvent} e */
function paintAt(e) {
  const { x, y } = cellAt(e);
  if (x < 0) {
    lastX = -1;
    lastY = -1;
    return;
  }
  const v = (e.buttons & 2) !== 0 ? 0 : brush;
  if (lastX >= 0) paintLine(lastX, lastY, x, y, v);
  else setCell(x, y, v);
  lastX = x;
  lastY = y;
  render();
}

/** Number mode: left-click tags a cell with the next number; right-click removes it.
 * @param {PointerEvent} e */
function stampNumber(e) {
  const { x, y } = cellAt(e);
  if (x < 0) return;
  const idx = y * GRID_W + x;
  const at = labels.indexOf(idx);
  if ((e.buttons & 2) !== 0) {
    if (at >= 0) labels.splice(at, 1);
  } else if (at < 0) {
    labels.push(idx);
  }
  render();
}

/** Build the tile palette buttons and wire selection. */
function buildPalette() {
  const wrap = $("draw-level-palette");
  wrap.replaceChildren();
  PALETTE.forEach((p) => {
    const btn = el("button", "draw-level-swatch");
    btn.setAttribute("aria-pressed", String(p.id === brush));
    const dot = el("span", "draw-level-dot");
    if (p.color) {
      dot.style.background = p.color;
    } else {
      dot.style.background = "var(--well)";
      dot.style.border = "1px dashed var(--border-strong)";
    }
    btn.append(dot, document.createTextNode(p.label));
    btn.onclick = () => {
      brush = p.id;
      Array.from(wrap.children).forEach((c) => {
        c.setAttribute("aria-pressed", String(c === btn));
      });
    };
    wrap.append(btn);
  });
}

/** Load a saved level's grid onto the canvas (view + continue editing).
 * @param {{ width: number, height: number, cells: number[], labels?: { n: number, x: number, y: number }[] }} lv */
function applyLevel(lv) {
  const err = $("draw-level-error");
  if (lv.width !== GRID_W || lv.height !== GRID_H) {
    err.textContent = `Saved at ${lv.width}×${lv.height}; the painter is ${GRID_W}×${GRID_H} — can't load.`;
    return;
  }
  err.textContent = "";
  cells.fill(0);
  cells.set(lv.cells.slice(0, GRID_W * GRID_H));
  labels.length = 0;
  const ls = (lv.labels ?? []).slice().sort((a, b) => a.n - b.n);
  for (const l of ls) {
    const idx = l.y * GRID_W + l.x;
    if (idx >= 0 && idx < GRID_W * GRID_H && !labels.includes(idx)) labels.push(idx);
  }
  render();
}

/** Fetch the saved levels and (re)fill the load picker. */
async function loadLevels() {
  const sel = /** @type {HTMLSelectElement} */ ($("draw-level-load"));
  /** @type {{ name: string, width: number, height: number, cells: number[], labels?: { n: number, x: number, y: number }[] }[]} */
  let list;
  try {
    list =
      /** @type {{ name: string, width: number, height: number, cells: number[], labels?: { n: number, x: number, y: number }[] }[]} */ (
        await fetchJSON("/api/levels")
      );
  } catch {
    return;
  }
  saved.clear();
  sel.replaceChildren();
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "— load saved —";
  sel.append(ph);
  for (const lv of list) {
    saved.set(lv.name, lv);
    const o = document.createElement("option");
    o.value = lv.name;
    o.textContent = `${lv.name} (${lv.width}×${lv.height})`;
    sel.append(o);
  }
}

function open() {
  $("draw-level-error").textContent = "";
  $("draw-level-modal").style.display = "";
  void loadLevels();
  render();
}
function close() {
  $("draw-level-modal").style.display = "none";
}

async function exportLevel() {
  const err = $("draw-level-error");
  err.textContent = "";
  let nWall = 0;
  let nDoor = 0;
  let nWindow = 0;
  let nI1 = 0;
  let nI2 = 0;
  let nI3 = 0;
  let nI4 = 0;
  for (const c of cells) {
    if (c === 1) nWall++;
    else if (c === 2) nDoor++;
    else if (c === 3) nWindow++;
    else if (c === 4) nI1++;
    else if (c === 5) nI2++;
    else if (c === 6) nI3++;
    else if (c === 7) nI4++;
  }
  const nItems = nI1 + nI2 + nI3 + nI4;
  if (nWall + nDoor + nWindow + nItems === 0 && labels.length === 0) {
    err.textContent = "Paint at least one tile or number first.";
    return;
  }
  const grid = {
    width: GRID_W,
    height: GRID_H,
    cell_size: CELL_SIZE,
    cells: Array.from(cells),
    labels: labels.map((idx, i) => ({ n: i + 1, x: idx % GRID_W, y: Math.floor(idx / GRID_W) })),
  };
  /** @type {{ path?: string, error?: string }} */
  let data;
  try {
    data = /** @type {{ path?: string, error?: string }} */ (
      await postJSON("/api/level", { grid })
    );
  } catch {
    err.textContent = "Export failed — restart the UI server (npm start) and try again.";
    return;
  }
  if (!data.path) {
    err.textContent = data.error ?? "Could not save the level.";
    return;
  }
  close();
  void loadState();
  const summary = `${nWall} wall, ${nDoor} door, ${nWindow} window, ${nItems} item${nItems === 1 ? "" : "s"} (types ${nI1}/${nI2}/${nI3}/${nI4}), ${labels.length} numbered marker${labels.length === 1 ? "" : "s"}`;
  const prompt =
    `I drew a level (${summary}) and saved the grid to ${data.path} ` +
    `(${GRID_W}×${GRID_H}; tile codes 0 floor, 1 wall, 2 door, 3 window, 4/5/6/7 = four item types by colour; ` +
    `plus a "labels" list of numbered markers {n,x,y} that identify specific cells). ` +
    `Dispatch the level-designer agent: have it read the grid, ask me what the level is ABOUT (the concept) ` +
    `first, then the name, scene details (metres per cell, wall height, what door/window/each item type and each ` +
    `numbered marker become, player spawn, theme); it writes a brief to design/levels/<name>.md and ALWAYS hands ` +
    `off to the game-designer agent, which folds it into a design doc and dispatches godot-dev to build the NAMED ` +
    `guided level (levels/<name>.tscn via levels/guided_level.gd, merge wall runs, register in main.gd) and verify with godot-verify.`;
  addUser(prompt);
  send({ type: "user_input", text: prompt });
}

export function initDrawLevel() {
  const trigger = document.getElementById("draw-level-open");
  if (trigger) trigger.onclick = open;
  const closeBtn = document.getElementById("draw-level-close");
  if (closeBtn) closeBtn.onclick = close;
  const exportBtn = document.getElementById("draw-level-export");
  if (exportBtn) exportBtn.onclick = () => void exportLevel();
  const clearBtn = document.getElementById("draw-level-clear");
  if (clearBtn)
    clearBtn.onclick = () => {
      cells.fill(0);
      labels.length = 0;
      render();
    };

  const loadSel = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("draw-level-load")
  );
  if (loadSel)
    loadSel.onchange = () => {
      const lv = saved.get(loadSel.value);
      if (lv) applyLevel(lv);
    };

  buildPalette();

  const canvas = canvasEl();
  if (canvas) {
    canvas.width = RULER + GRID_W * CELL_PX + PAD;
    canvas.height = RULER + GRID_H * CELL_PX + PAD;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (brush === -1) {
        stampNumber(e);
        return;
      }
      painting = true;
      lastX = -1;
      lastY = -1;
      paintAt(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (painting) paintAt(e);
    });
    canvas.addEventListener("pointerup", () => {
      painting = false;
      lastX = -1;
      lastY = -1;
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  const modal = document.getElementById("draw-level-modal");
  if (modal)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
}
