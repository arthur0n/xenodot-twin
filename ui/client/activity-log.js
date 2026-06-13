// Activity log — the right-hand stream of tool/agent events, plus the small
// display formatters (shorten / stripEnvPrefix / toolDetail) shared with the
// approval cards and the websocket dispatcher.
import { $, $$, el } from "./dom.js";
import { paint, agentLabel } from "./agents.js";
import { view } from "./state.js";

/** Tool name -> log "kind" (drives the verb-pill color and the filter chips).
 * @type {Record<string, string>} */
export const VERB_KIND = {
  Read: "read",
  Glob: "read",
  Grep: "read",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
  Bash: "bash",
  Task: "task",
  Agent: "task",
  Skill: "task",
};

/** @typedef {(row: HTMLElement) => boolean} FilterFn */
/** @type {Record<string, FilterFn>} */
const FILTERS = {
  all: () => true,
  tools: (row) => ["task", "bash", "session", "spawn"].includes(row.dataset.kind ?? ""),
  files: (row) => ["read", "edit", "write"].includes(row.dataset.kind ?? ""),
};
/** @param {string | null | undefined} key @returns {FilterFn} */
const filterFor = (key) => FILTERS[key ?? "all"] ?? FILTERS.all ?? (() => true);
const activeFilterFn = () => {
  const chip = /** @type {HTMLElement | null} */ (document.querySelector(".filter-chip.on"));
  return filterFor(chip?.dataset.filter);
};

function nowStr() {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")} ${ampm}`;
}

// The project dir is constant noise in paths and commands — strip it.
/** @param {string} [t] @returns {string} */
export const shorten = (t) =>
  view.projectDir && t
    ? t.replaceAll(view.projectDir + "/", "").replaceAll(view.projectDir, ".")
    : (t ?? "");

// Display-only: drop leading VAR=value && assignments from commands — the
// meaning starts after them (logs keep the full command).
/** @param {string} t @returns {string} */
export const stripEnvPrefix = (t) => t.replace(/^(?:\w+=\S+\s*&&\s*)+/, "");

/** @param {import("../lib/types.js").ToolInput} [input] @returns {string} */
export const toolDetail = (input) =>
  input?.file_path ??
  (input?.command ? stripEnvPrefix(input.command) : null) ??
  input?.pattern ??
  input?.skill ??
  input?.title ??
  (input ? JSON.stringify(input).slice(0, 120) : "");

/** @param {import("../lib/types.js").LogEntry} entry */
export function addLog(entry) {
  entry.detail = shorten(entry.detail);
  const row = el(
    "div",
    "log-row is-new" +
      (entry.kind === "say" ? " say" : "") +
      (entry.kind === "spawn" ? " spawn" : ""),
  );
  row.dataset.kind = entry.kind;
  row.append(el("span", "log-time", nowStr()));
  if (entry.kind === "spawn") {
    const who = el("span", "log-agent");
    who.append(paint(el("span", "", agentLabel(entry.agent)), entry.agent));
    who.append(el("span", "arrow", " ▸ "));
    who.append(paint(el("span", "", agentLabel(entry.child ?? "")), entry.child ?? ""));
    row.append(who);
  } else {
    row.append(paint(el("span", "log-agent", agentLabel(entry.agent)), entry.agent));
  }
  if (entry.kind === "say") {
    row.append(el("span", "log-text", entry.text));
  } else {
    row.append(el("span", `verb-pill verb-${entry.kind}`, entry.verb));
    const detail = el("span", "log-detail");
    detail.append(
      Object.assign(document.createElement("bdo"), { textContent: entry.detail ?? "" }),
    );
    row.append(detail);
  }
  if (!activeFilterFn()(row)) row.style.display = "none";
  $("log-scroll").prepend(row);
}

/** Wire the filter chips and the clear button. */
export function initActivityLog() {
  $$(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".filter-chip").forEach((c) => {
        c.classList.remove("on");
      });
      chip.classList.add("on");
      const fn = filterFor(chip.dataset.filter);
      $$(".log-row").forEach((row) => {
        row.style.display = fn(row) ? "" : "none";
      });
    });
  });
  $("clear-log").onclick = () => {
    $("log-scroll").replaceChildren();
  };
}
