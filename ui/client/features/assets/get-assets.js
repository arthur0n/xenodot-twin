// "Get assets" — the human-in-the-loop art-sourcing loop, in a modal (the
// sidebar was too cramped). Two parts:
//   1. Open asset requests — owner:"user" tasks the agent filed (via the
//      mcp__ui__request_asset tool) when it hit an art gap: titled "Asset: <name>"
//      with the kind + tailored brief in the note ("[texture|model] <brief>"). The
//      brief is contextual to what's being built, never hardcoded.
//   2. Sources — the stable catalog of free, no-signup CC0/CC-BY asset libraries
//      (3D models + PBR textures). Style-specific generators (e.g. pixel-art) live in
//      the game's loaded art specialization, not here.
// For each request the user supplies a file two ways — pick a local file (native
// dialog) or paste its local path — and chooses a destination "place": the game's own
// assets/ (default) or the external shared-asset library (res://x-shared-assets, for
// free-library example assets kept out of the game tree). The server (POST /api/asset)
// copies it into <place>/textures/ (PNG) or <place>/models/ (GLB), routed by file type. The panel
// stays open so several requests can be filled in one session; each then asks the
// orchestrator to import + wire it via godot-assets (a plant prop that should join
// the data layer goes through the xenodot-twin:twin-asset-import skill), then verify.
// CANDIDATE — NOT IMPLEMENTED (honest scope, do not wire without a plan). A natural future home for a
// "shipped deliverables" row: a downloadable card per `tools/twin_ship.sh` artifact (name, model,
// size, platform, the retarget.json manifest of what a receiver may swap — see
// docs/process/data-beside-build.md). Nothing in ui/client surfaces ship artifacts today — the ship
// tool writes to dist/ on disk and the zip is handed over directly (industrial users don't itch).
// This comment marks the candidate seam so it is not "discovered" as if it already existed.
import { $, el } from "../../core/dom.js";
import { fetchJSON, postJSON } from "../../../lib/json.js";
import { send } from "../../core/websocket.js";
import { addUser } from "../chat/chat.js";
import { loadState } from "../project/project-tree.js";

/** Free sources — style-neutral CC0/CC-BY asset libraries (3D models + PBR textures),
 * the stable WHERE. Style-specific generators live in the game's loaded art
 * specialization: library/sources/model-sources.md (3D models),
 * library/sources/asset-sources.md (pixel-art textures).
 * @type {{ name: string, url: string, fit: string }[]} */
const GENERATORS = [
  {
    name: "Poly Pizza",
    url: "https://poly.pizza/",
    fit: "no login · .glb 3D models · CC0/CC-BY · furniture/props",
  },
  {
    name: "Kenney",
    url: "https://kenney.nl/assets",
    fit: "no signup · CC0 model packs · consistent style",
  },
  {
    name: "Quaternius",
    url: "https://quaternius.com/",
    fit: "no signup · CC0 model packs",
  },
  {
    name: "Poly Haven",
    url: "https://polyhaven.com/",
    fit: "no signup · CC0 · HD models + PBR textures + HDRIs",
  },
  {
    name: "OpenGameArt",
    url: "https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=10&field_art_licenses_tid%5B%5D=4929",
    fit: "no signup · CC0 · one-off props (convert to .glb)",
  },
];

const ASK_RE = /^asset:\s*/i;
const KIND_RE = /^\[(texture|model)\]\s*/i;

// Requests the user filled this page-session. The server marks a supplied task
// in_progress, but the GET /api/tasks refetch can race the websocket task_update —
// so we also drop fulfilled ids locally, removing the card immediately and keeping
// it gone across reopen.
/** @type {Set<string>} */
const fulfilled = new Set();

/** @param {string} s @returns {string} */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "texture";

/** @typedef {"texture"|"model"} Kind */
/** @typedef {{ id: string, name: string, kind: Kind, prompt: string, dest: string }} Ask */

/** @param {string} name @param {Kind} kind @param {"game"|"shared"} [place] @returns {string} */
const destFor = (name, kind, place) => {
  const root = place === "shared" ? "x-shared-assets" : "assets";
  return kind === "model"
    ? `${root}/models/${slug(name)}.glb`
    : `${root}/textures/${slug(name)}.png`;
};

/** Open asset requests from the task board (owner:user, "Asset: …", not done/in-progress).
 * The note carries "[texture|model] <brief>"; we split the kind hint off the brief.
 * @returns {Promise<Ask[]>} */
async function loadAsks() {
  try {
    const tasks = /** @type {import("../../../lib/types.js").Task[]} */ (
      await fetchJSON("/api/tasks")
    );
    return tasks
      .filter(
        (t) =>
          t.owner === "user" &&
          t.status !== "done" &&
          t.status !== "in_progress" &&
          !fulfilled.has(t.id) &&
          ASK_RE.test(t.title),
      )
      .map((t) => {
        const name = t.title.replace(ASK_RE, "").trim() || "texture";
        const note = t.note ?? "";
        const km = KIND_RE.exec(note);
        /** @type {Kind} */
        const kind = km?.[1]?.toLowerCase() === "model" ? "model" : "texture";
        return {
          id: t.id,
          name,
          kind,
          prompt: note.replace(KIND_RE, ""),
          dest: destFor(name, kind),
        };
      });
  } catch {
    return [];
  }
}

/** @param {File} file @returns {Promise<string>} */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      resolve(/** @type {string} */ (r.result));
    };
    r.onerror = () => {
      reject(new Error("read failed"));
    };
    r.readAsDataURL(file);
  });
}

/** @param {Ask} ask @param {string} savedPath @returns {string} */
function wirePrompt(ask, savedPath) {
  const task = ask.id ? ` (task ${ask.id})` : "";
  if (savedPath.endsWith(".glb")) {
    return (
      `I sourced the "${ask.name}" model and saved it to ${savedPath}${task}. ` +
      `Import and wire it into the viewer scene: if it's plant equipment / a prop that should join the ` +
      `data layer, use the xenodot-twin:twin-asset-import skill (it mints a synthetic IFC GlobalId so the ` +
      `prop binds to master data); otherwise dispatch godot-assets to bring it in as ad-hoc scene dressing ` +
      `— import, verify the .glb format + scale/units, scale it to the prop's real footprint, and instance ` +
      `it in place of the matching placeholder node (keep its name + position). Then verify with godot-verify ` +
      `and mark the task done once it renders.`
    );
  }
  return (
    `I sourced the "${ask.name}" texture and saved it to ${savedPath}${task}. ` +
    `Dispatch godot-assets to import it (set filter / mipmaps / material from the project's art direction, ` +
    `and check type / dimensions / alpha against the request) and wire it into the matching material — ` +
    `e.g. the relevant StandardMaterial3D albedo — then verify with godot-verify and mark the task done ` +
    `once it renders.`
  );
}

/** Send the asset body to the server, then hand wiring to the orchestrator and
 * refresh the cards. Does NOT close the modal — many requests can be filled in one
 * session. @param {Ask} ask
 * @param {{ name: string, dataUrl?: string, srcPath?: string, place?: "game"|"shared" }} body
 * @param {HTMLElement} errEl @returns {Promise<void>} */
async function saveAndWire(ask, body, errEl) {
  errEl.textContent = "";
  /** @type {{ path?: string, error?: string }} */
  let data;
  try {
    data = /** @type {{ path?: string, error?: string }} */ (await postJSON("/api/asset", body));
  } catch {
    errEl.textContent = "Save failed — restart the UI server (npm start) and try again.";
    return;
  }
  if (!data.path) {
    errEl.textContent = data.error ?? "Could not save the asset.";
    return;
  }
  if (ask.id) fulfilled.add(ask.id);
  void loadState();
  const prompt = wirePrompt(ask, data.path);
  addUser(prompt);
  send({ type: "user_input", text: prompt });
  if (ask.id) send({ type: "task_update", op: "update", id: ask.id, status: "in_progress" });
  void refresh();
}

/** @param {Ask} ask @param {File} file @param {"game"|"shared"} place @param {HTMLElement} errEl
 * @returns {Promise<void>} */
async function upload(ask, file, place, errEl) {
  errEl.textContent = "";
  /** @type {string} */
  let dataUrl;
  try {
    dataUrl = await fileToDataUrl(file);
  } catch {
    errEl.textContent = "Could not read that file.";
    return;
  }
  await saveAndWire(ask, { name: ask.name, dataUrl, place }, errEl);
}

/** @param {Ask} ask @param {string} value @param {"game"|"shared"} place @param {HTMLElement} errEl
 * @returns {Promise<void>} */
async function submitPath(ask, value, place, errEl) {
  const srcPath = value.trim();
  if (!srcPath) {
    errEl.textContent = "Enter a local file path first.";
    return;
  }
  await saveAndWire(ask, { name: ask.name, srcPath, place }, errEl);
}

/** Native file picker that saves the chosen file on selection.
 * @param {() => Ask} getAsk @param {() => "game"|"shared"} getPlace @param {HTMLElement} errEl
 * @returns {HTMLElement} */
function pickControl(getAsk, getPlace, errEl) {
  const label = el("label", "btn primary", "Pick file…");
  label.style.cursor = "pointer";
  const input = /** @type {HTMLInputElement} */ (el("input"));
  input.type = "file";
  input.accept = "image/png,.glb,model/gltf-binary";
  input.style.display = "none";
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void upload(getAsk(), f, getPlace(), errEl);
  };
  label.append(input);
  return label;
}

/** Text field + button to supply the asset by a local path (no byte transfer).
 * @param {() => Ask} getAsk @param {() => "game"|"shared"} getPlace @param {HTMLElement} errEl
 * @param {string} placeholder @returns {HTMLElement} */
function pathRow(getAsk, getPlace, errEl, placeholder) {
  const row = el("div", "asset-path-row");
  const input = /** @type {HTMLInputElement} */ (el("input", "form-input"));
  input.placeholder = placeholder;
  const go = () => {
    void submitPath(getAsk(), input.value, getPlace(), errEl);
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") go();
  };
  const btn = el("button", "btn ghost", "Use path");
  btn.onclick = go;
  row.append(input, btn);
  return row;
}

/** A copy-to-clipboard button for the contextual prompt. @param {string} text @returns {HTMLElement} */
function copyBtn(text) {
  const btn = el("button", "btn ghost", "copy prompt");
  btn.onclick = () => {
    void navigator.clipboard?.writeText(text);
    btn.textContent = "copied";
    setTimeout(() => {
      btn.textContent = "copy prompt";
    }, 1200);
  };
  return btn;
}

/** Destination "place" selector: the project's own assets/ (default) or the external
 * shared-asset library (res://x-shared-assets) — for free-library example assets kept out of
 * the project tree. @returns {{ row: HTMLElement, get: () => "game"|"shared",
 * onChange: (cb: () => void) => void }} */
function placeSelect() {
  const row = el("div", "asset-place-row");
  row.append(el("span", "desc", "Place: "));
  const sel = /** @type {HTMLSelectElement} */ (el("select", "form-input"));
  const game = /** @type {HTMLOptionElement} */ (el("option", undefined, "Project (assets/)"));
  game.value = "game";
  const shared = /** @type {HTMLOptionElement} */ (
    el("option", undefined, "Shared (x-shared-assets/)")
  );
  shared.value = "shared";
  sel.append(game, shared);
  row.append(sel);
  return {
    row,
    get: () => (sel.value === "shared" ? "shared" : "game"),
    onChange: (cb) => {
      sel.onchange = cb;
    },
  };
}

/** Card for one open asset request. @param {Ask} ask @returns {HTMLElement} */
function askCard(ask) {
  const card = el("div", "asset-card");
  card.append(el("div", "modal-head", ask.name));
  const sub = el("div", "modal-sub", `${ask.kind} → ${ask.dest}`);
  card.append(sub);
  if (ask.prompt) {
    const ta = /** @type {HTMLTextAreaElement} */ (el("textarea", "form-input"));
    ta.value = ask.prompt;
    ta.rows = 3;
    ta.readOnly = true;
    card.append(ta);
  }
  const errEl = el("div", "modal-error");
  const getAsk = () => ask;
  const place = placeSelect();
  place.onChange(() => {
    sub.textContent = `${ask.kind} → ${destFor(ask.name, ask.kind, place.get())}`;
  });
  card.append(place.row);
  const actions = el("div", "modal-actions");
  if (ask.prompt) actions.append(copyBtn(ask.prompt));
  actions.append(pickControl(getAsk, place.get, errEl));
  card.append(actions);
  card.append(
    pathRow(
      getAsk,
      place.get,
      errEl,
      `or paste a local path, e.g. ~/Downloads/${slug(ask.name)}.${ask.kind === "model" ? "glb" : "png"}`,
    ),
  );
  card.append(errEl);
  return card;
}

/** Ad-hoc card when there's no pending request — name it, then pick or path it.
 * @returns {HTMLElement} */
function adhocCard() {
  const card = el("div", "asset-card");
  card.append(
    el("div", "modal-sub", "No open requests — supply an ad-hoc texture (.png) or model (.glb):"),
  );
  const nameInput = /** @type {HTMLInputElement} */ (el("input", "form-input"));
  nameInput.placeholder = "name, e.g. grass_blade";
  card.append(nameInput);
  const errEl = el("div", "modal-error");
  // The file type decides texture vs model on the server; kind here is just a default.
  /** @returns {Ask} */
  const getAsk = () => {
    const name = nameInput.value.trim() || "texture";
    return { id: "", name, kind: "texture", prompt: "", dest: destFor(name, "texture") };
  };
  const place = placeSelect();
  card.append(place.row);
  const actions = el("div", "modal-actions");
  actions.append(pickControl(getAsk, place.get, errEl));
  card.append(actions);
  card.append(
    pathRow(getAsk, place.get, errEl, "or paste a local path, e.g. ~/Downloads/grass.png"),
  );
  card.append(errEl);
  return card;
}

/** @typedef {import("../../../lib/types.js").ImportMetric} ImportMetric */

/** One "fact" cell for the import card: a label + value, or nothing when the value is absent so a
 * half-written metrics file shows only what it has. @param {string} label @param {string | undefined} value
 * @returns {HTMLElement | null} */
function fact(label, value) {
  if (value === undefined || value === "") return null;
  const cell = el("span", "desc");
  cell.append(el("strong", undefined, label + " "), document.createTextNode(value));
  return cell;
}

/** A card showing one IFC→twin import's result (JOIN %, import ms, element count) read from its
 * `<model>.metrics.json` — the pipeline result, visible in the product. @param {ImportMetric} m
 * @returns {HTMLElement} */
function importCard(m) {
  const card = el("div", "asset-card");
  card.append(el("div", "modal-head", m.model ?? "model"));
  const join =
    m.join_total !== undefined
      ? `${m.join_matched ?? 0}/${m.join_total}` +
        (m.join_pct !== undefined ? ` (${m.join_pct.toFixed(1)}%)` : "")
      : undefined;
  const facts = [
    fact("schema", m.schema),
    fact("JOIN", join),
    fact("import", m.import_seconds !== undefined ? `${m.import_seconds.toFixed(1)} s` : undefined),
    fact("elements", m.elements !== undefined ? String(m.elements) : undefined),
    fact("shapes", m.shapes !== undefined ? String(m.shapes) : undefined),
  ].filter((c) => c !== null);
  const row = el("div", "asset-metrics-row");
  facts.forEach((c) => {
    if (c) row.append(c);
  });
  card.append(row);
  // Gate-verdict strip: one pass/fail badge per gate that wrote its verdict into this metrics file
  // (check_twin_join.gd / check_playback.gd `--json`, via the shared GateReport writer). Each badge
  // renders only when its verdict is present — a green→red flip here IS the gate's UI surface.
  const strip = gateStrip([
    ["join", m.join_gate],
    ["playback", m.playback_gate],
  ]);
  if (strip) card.append(strip);
  if (m.model) card.append(candidateBrowser(m.model));
  return card;
}

/** @typedef {{ globalId: string, ifcClass: string, name: string | null, storey?: string }} Candidate */
/** @typedef {{ matched: number, total: number, count: number, candidates: Candidate[],
 *   classes: { ifcClass: string, count: number }[], error?: string }} CandidateResult */

/** The binding-candidate browser under an import card: type an IFC class ("IfcWall") or a name
 * substring and list candidate GlobalIds to bind, so authoring a binding_map.json is a PICK, not a
 * hand-grep of the model's 22 MB `<model>_props.json`. Reads GET /api/binding-candidates (the same
 * shared core as the CLI + mcp tool); a value starting "ifc" filters by class, else by name. Shows a
 * bounded page + the class histogram — never the whole model. @param {string} model model stem
 * @returns {HTMLElement} */
function candidateBrowser(model) {
  const wrap = el("div", "asset-candidate-browser");
  const row = el("div", "asset-path-row");
  const input = /** @type {HTMLInputElement} */ (el("input", "form-input"));
  input.placeholder = "bind: IFC class (IfcWall) or name substring…";
  const out = el("div", "modal-sub");
  const run = () => {
    void browseCandidates(model, input.value.trim(), out);
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") run();
  };
  const btn = el("button", "btn ghost", "browse binding candidates");
  btn.onclick = run;
  row.append(input, btn);
  wrap.append(row, out);
  return wrap;
}

/** Fetch + render one page of binding candidates into `out`. A missing sidecar (model not imported
 * with ifc_convert.py, or ambiguous) is an honest one-line message, never a thrown error.
 * @param {string} model @param {string} query @param {HTMLElement} out @returns {Promise<void>} */
async function browseCandidates(model, query, out) {
  out.replaceChildren(el("span", "desc", "querying sidecar…"));
  const params = new URLSearchParams({ model, limit: "8" });
  if (query) params.set(/^ifc/i.test(query) ? "class" : "name", query);
  /** @type {CandidateResult} */
  let r;
  try {
    r = /** @type {CandidateResult} */ (await fetchJSON(`/api/binding-candidates?${params}`));
  } catch {
    out.replaceChildren(
      el("div", "modal-sub", "no property sidecar for this model — run ifc_convert.py first"),
    );
    return;
  }
  if (r.error) {
    out.replaceChildren(el("div", "modal-sub", r.error));
    return;
  }
  out.replaceChildren();
  out.append(
    el("div", "desc", `${r.matched} of ${r.total} match — showing ${r.count}`),
    el(
      "div",
      "desc",
      "classes: " + (r.classes.map((c) => `${c.ifcClass}×${c.count}`).join(", ") || "(none)"),
    ),
  );
  for (const c of r.candidates) {
    const line = el(
      "div",
      "tree-item-path",
      `${c.globalId}  ${c.ifcClass}  ${c.name ?? "(unnamed)"}`,
    );
    out.append(line);
  }
}

/** Build a gate-verdict strip: a `✓/✗ <label> gate OK|FAIL` badge for every gate whose verdict is
 * present. Returns null when no gate reported (so the card shows no empty strip). The colours match
 * the binding N/N badge (green pass / red fail). @param {[string, string | undefined][]} gates
 * @returns {HTMLElement | null} */
function gateStrip(gates) {
  const present = gates.filter(([, verdict]) => typeof verdict === "string");
  if (present.length === 0) return null;
  const strip = el("div", "asset-gate-strip");
  for (const [label, verdict] of present) {
    const ok = verdict === "OK";
    const badge = el("span", "desc", ok ? `✓ ${label} gate OK` : `✗ ${label} gate FAIL`);
    badge.style.color = ok ? "#3fb950" : "#f85149";
    strip.append(badge);
  }
  return strip;
}

/** Fetch + render the import-metrics cards, with an honest empty state when nothing has been
 * imported yet. @returns {Promise<void>} */
async function renderImports() {
  const host = $("assets-imports");
  host.replaceChildren();
  /** @type {ImportMetric[]} */
  let metrics;
  try {
    metrics = /** @type {ImportMetric[]} */ (await fetchJSON("/api/import-metrics"));
  } catch {
    metrics = [];
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    host.append(
      el(
        "div",
        "modal-sub",
        "No imported models yet — run the twin-import pipeline (ifc_convert.py --metrics + " +
          "check_twin_join.gd --json) and the model's JOIN %, import time and element count appear here.",
      ),
    );
    return;
  }
  metrics.forEach((m) => {
    host.append(importCard(m));
  });
}

/** @typedef {import("../../../lib/types.js").BindingStatus} BindingStatus */

/** A card showing one binding map's live resolution health read from its `<map>.status.json` (written
 * by the twin-verify bind smoke, `smoke_binding.gd --json`). The N/N badge is the ship signal: green
 * when every tag resolved, red on a silent-unbound tag — the unresolved GlobalIds are listed so the
 * operator sees exactly which row is a typo. @param {BindingStatus} s @returns {HTMLElement} */
function bindingCard(s) {
  const card = el("div", "asset-card");
  card.append(el("div", "modal-head", s.map ?? "binding_map.json"));
  const total = s.total ?? 0;
  const resolved = s.resolved ?? 0;
  const ok = s.bind_smoke === "OK" && total > 0 && resolved === total;
  const badge = el("span", "desc", `${resolved}/${total} resolved`);
  badge.style.color = ok ? "#3fb950" : "#f85149";
  badge.style.fontWeight = "600";
  const row = el("div", "asset-metrics-row");
  row.append(badge);
  const targets = fact(
    "targets",
    s.node_targets !== undefined
      ? `${s.node_targets} node${s.mmi_targets ? ` · ${s.mmi_targets} mmi` : ""}`
      : undefined,
  );
  if (targets) row.append(targets);
  card.append(row);
  const gate = el("span", "desc", ok ? "✓ BIND-SMOKE OK" : "✗ BIND-SMOKE FAIL");
  gate.style.color = ok ? "#3fb950" : "#f85149";
  card.append(gate);
  if (s.unresolved?.length) {
    const miss = el("div", "modal-sub", `unbound GlobalId: ${s.unresolved.join(", ")}`);
    miss.style.color = "#f85149";
    card.append(miss);
  }
  return card;
}

/** Fetch + render the binding-status cards, with an honest empty state when no map has been smoked
 * yet. @returns {Promise<void>} */
async function renderBindings() {
  const host = $("assets-bindings");
  host.replaceChildren();
  /** @type {BindingStatus[]} */
  let statuses;
  try {
    statuses = /** @type {BindingStatus[]} */ (await fetchJSON("/api/binding-status"));
  } catch {
    statuses = [];
  }
  if (!Array.isArray(statuses) || statuses.length === 0) {
    host.append(
      el(
        "div",
        "modal-sub",
        "No binding maps smoked yet — run the bind gate (smoke_binding.gd --json, via " +
          "verify_twin.sh) and the map's N/N resolved status appears here.",
      ),
    );
    return;
  }
  statuses.forEach((s) => {
    host.append(bindingCard(s));
  });
}

/** @param {{ name: string, url: string, fit: string }} g @returns {HTMLElement} */
function genRow(g) {
  const item = el("div", "tree-item");
  const link = /** @type {HTMLAnchorElement} */ (el("a", "tree-item-path", g.name + " ↗"));
  link.href = g.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.style.color = "inherit";
  link.style.textDecoration = "none";
  item.append(link, el("span", "desc", `— ${g.fit}`));
  return item;
}

async function refresh() {
  await renderImports();
  await renderBindings();
  const asksEl = $("assets-asks");
  asksEl.replaceChildren();
  const asks = await loadAsks();
  if (!asks.length) {
    asksEl.append(adhocCard());
  } else {
    asks.forEach((a) => {
      asksEl.append(askCard(a));
    });
  }

  const gens = $("assets-generators");
  gens.replaceChildren();
  GENERATORS.forEach((g) => {
    gens.append(genRow(g));
  });
}

function open() {
  $("assets-error").textContent = "";
  $("assets-modal").style.display = "";
  void refresh();
}
function close() {
  $("assets-modal").style.display = "none";
}

export function initGetAssets() {
  const trigger = document.getElementById("assets-open");
  if (trigger) trigger.onclick = open;
  const closeBtn = document.getElementById("assets-close");
  if (closeBtn) closeBtn.onclick = close;
  const modal = document.getElementById("assets-modal");
  if (modal)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
}
