// Project sidebar — tabbed: Assets | Agents | Skills, scanned live from
// /api/state. Assets is the file tree rooted at the project folder; Agents
// and Skills list what exists and offer a "+ new …" starter that pre-fills
// the composer (the designer interview takes it from there).
import { $, $$, el, fillComposer } from "./dom.js";
import { fetchJSON, parseJSON } from "../lib/json.js";
import { view } from "./state.js";

const COLLAPSE_KEY = "xenodot-collapsed";
const TAB_KEY = "xenodot-side-tab";

/** @type {Record<string, boolean>} */
const collapsed = (() => {
  try {
    return /** @type {Record<string, boolean>} */ (
      parseJSON(localStorage.getItem(COLLAPSE_KEY) ?? "{}")
    );
  } catch {
    return {};
  }
})();

const persistCollapsed = () => {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
  } catch {}
};

/** @type {import("../lib/types.js").ProjectState | null} */
let state = null;

let activeTab = (() => {
  try {
    return localStorage.getItem(TAB_KEY) ?? "assets";
  } catch {
    return "assets";
  }
})();

/** Starter prompts for the "+ new …" buttons — scope-first, per the
 * framework's interview-before-build loop. */
const NEW_PROMPTS = {
  agents:
    "create a new agent for this project: interview me about its purpose, " +
    "when it should run, and which tools it needs — then write .claude/agents/<name>.md",
  skills:
    "create a new skill for this project: interview me about the procedure " +
    "it encodes and its verification gate — then write .claude/skills/<name>/SKILL.md",
};

/**
 * A collapsible group of items, persisted by label.
 * @template T
 * @param {HTMLElement} parent
 * @param {string} label
 * @param {T[]} items
 * @param {(it: T) => HTMLElement} render
 */
function group(parent, label, items, render) {
  const g = el("div", "tree-group");
  if (collapsed[label] ?? true) g.classList.add("collapsed"); // collapsed by default
  const head = el("div", "tree-group-head");
  head.append(el("span", "chev", "▾"), ` ${label} `, el("span", "count", String(items.length)));
  head.onclick = () => {
    g.classList.toggle("collapsed");
    collapsed[label] = g.classList.contains("collapsed");
    persistCollapsed();
  };
  g.append(head);
  if (!items.length) g.append(el("div", "tree-empty", "none yet"));
  else
    items.forEach((it) => {
      g.append(render(it));
    });
  parent.append(g);
}

/** @param {import("../lib/types.js").LibraryEntry} d @returns {HTMLElement} */
function libraryItem(d) {
  const item = el("div", "tree-item");
  if (d.verdict) {
    const v = d.verdict.toLowerCase();
    const dot = el("span", "verdict-dot", "●");
    dot.style.color = v.startsWith("adopted")
      ? "var(--green)"
      : v.startsWith("rejected")
        ? "var(--red)"
        : "var(--amber)";
    dot.title = d.verdict;
    item.append(dot, " ");
  }
  item.append(d.title + " ", el("span", "desc", `— ${d.verdict ?? "researching…"}`));
  return item;
}

/** The Assets tab: project root first, groups nested inside it.
 * @param {HTMLElement} tree @param {import("../lib/types.js").ProjectState} s */
function renderAssets(tree, s) {
  const ROOT = "__root";
  const root = el("div", "tree-root");
  if (collapsed[ROOT] === true) root.classList.add("collapsed"); // expanded by default
  const head = el("div", "tree-root-head");
  head.append(el("span", "chev", "▾"), el("span", "tree-root-name", s.name + "/"));
  head.onclick = () => {
    root.classList.toggle("collapsed");
    collapsed[ROOT] = root.classList.contains("collapsed");
    persistCollapsed();
  };
  const nest = el("div", "tree-nest");
  group(nest, "Design docs", s.designDocs, (d) => {
    const item = el("div", "tree-item", d.path + " ");
    item.append(el("span", "desc", `— ${d.title}`));
    return item;
  });
  group(nest, "Addon library", s.library ?? [], libraryItem);
  group(nest, "Scenes", s.scenes, (f) => el("div", "tree-item", f));
  group(nest, "Scripts", s.scripts, (f) => el("div", "tree-item", f));
  root.append(head, nest);
  tree.append(root);
}

/** @param {string} tab @param {string} label @returns {HTMLElement} */
function newItemBtn(tab, label) {
  const btn = el("button", "new-item-btn", `+ ${label}`);
  btn.onclick = () => {
    fillComposer(tab === "agents" ? NEW_PROMPTS.agents : NEW_PROMPTS.skills);
  };
  return btn;
}

/** @param {HTMLElement} tree @param {import("../lib/types.js").ProjectState} s */
function renderAgents(tree, s) {
  if (!s.agents.length) tree.append(el("div", "tree-empty", "none yet"));
  s.agents.forEach((a) => {
    const item = el("div", "tree-item", a.name + " ");
    if (a.model) item.append(el("span", "desc", `(${a.model})`));
    tree.append(item);
  });
  tree.append(newItemBtn("agents", "new agent"));
}

/** @param {HTMLElement} tree @param {import("../lib/types.js").ProjectState} s */
function renderSkills(tree, s) {
  if (!s.skills.length) tree.append(el("div", "tree-empty", "none yet"));
  s.skills.forEach((f) => {
    tree.append(el("div", "tree-item", f));
  });
  tree.append(newItemBtn("skills", "new skill"));
}

/** Re-render the active tab panel from the cached state. */
function renderTab() {
  const counts = state
    ? {
        assets: state.designDocs.length + state.scenes.length + state.scripts.length,
        agents: state.agents.length,
        skills: state.skills.length,
      }
    : null;
  $$(".side-tab").forEach((t) => {
    t.classList.toggle("on", t.dataset.tab === activeTab);
    const count = t.querySelector(".count");
    if (count && counts)
      count.textContent = String(counts[/** @type {keyof typeof counts} */ (t.dataset.tab)] ?? "");
  });
  const tree = $("project-tree");
  tree.replaceChildren();
  if (!state) return;
  if (activeTab === "agents") renderAgents(tree, state);
  else if (activeTab === "skills") renderSkills(tree, state);
  else renderAssets(tree, state);
}

/** Wire the Assets | Agents | Skills tab buttons (once, from main.js). */
export function initProjectTabs() {
  $$(".side-tab").forEach((t) => {
    t.addEventListener("click", () => {
      activeTab = t.dataset.tab ?? "assets";
      try {
        localStorage.setItem(TAB_KEY, activeTab);
      } catch {}
      renderTab();
    });
  });
}

export async function loadState() {
  const s = /** @type {import("../lib/types.js").ProjectState} */ (await fetchJSON("/api/state"));
  state = s;
  view.projectDir = s.dir;
  $("proj-name").textContent = s.found ? s.name : "no project";
  $("proj-path").textContent = s.dir.replace(/^\/Users\/[^/]+/, "~");
  renderBanner(s);
  renderTab();
}

/** When the target folder has no Godot project, explain how to point the
 * framework at one instead of showing silently-empty panels. The framework
 * only reads the project — it stays in your own repo, wherever it lives.
 * @param {import("../lib/types.js").ProjectState} s */
function renderBanner(s) {
  const banner = $("project-banner");
  if (s.found) {
    banner.style.display = "none";
    return;
  }
  banner.replaceChildren();
  banner.append(el("strong", undefined, "No Godot project here yet."));
  banner.append(el("div", "banner-path", `Looking in: ${s.dir.replace(/^\/Users\/[^/]+/, "~")}`));
  banner.append(
    el(
      "div",
      undefined,
      "Point the framework at your game (it only reads it — your project stays in its own repo):",
    ),
  );
  const code = el("div", "banner-code");
  code.append(el("div", undefined, "npm run setup -- /path/to/your/game"));
  code.append(el("div", undefined, "# then restart, or one-off: npm start /path/to/your/game"));
  banner.append(code);
  banner.style.display = "";
}
