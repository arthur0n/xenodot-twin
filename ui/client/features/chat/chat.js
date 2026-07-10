// Chat column, rendered from the store: user messages, agent messages (markdown
// + copy), session banners, and the "thinking…" indicator. New entries are
// appended by index (never a full rebuild), so scroll position and existing
// nodes survive; the indicator stays pinned below the latest message.
import { $, el } from "../../core/dom.js";
import { paint, agentLabel, agentInitial } from "../agents/agents.js";
import { renderMarkdown } from "../../core/markdown.js";
import { subscribe, update } from "../../core/store.js";

const chatScroll = $("chat-scroll");
export const scrollChat = () => {
  chatScroll.scrollTop = chatScroll.scrollHeight;
};

/** Echo a user message into the chat — also used by the asset / transcript
 * wizards that post a prompt on the user's behalf. @param {string} text */
export function addUser(text) {
  update((s) => ({ ...s, chat: [...s.chat, { kind: "user", text }] }));
}

/** Show the pulsing "thinking…" indicator until the turn produces output. */
export function showThinking() {
  update((s) => ({ ...s, thinking: { active: true, label: "thinking…" } }));
}

/** @param {string} who @param {string} text @returns {HTMLElement} */
function agentMsg(who, text) {
  const wrap = el("div", "msg-agent");
  const head = el("span", "who");
  head.append(paint(el("span", "agent-avatar", agentInitial(who)), who), ` ${agentLabel(who)}`);
  const copy = el("button", "copy-btn", "⧉");
  copy.title = "Copy message";
  copy.onclick = () => {
    void navigator.clipboard.writeText(text).then(
      () => {
        copy.textContent = "✓";
        setTimeout(() => {
          copy.textContent = "⧉";
        }, 1200);
      },
      () => {
        copy.textContent = "✕";
      },
    );
  };
  const body = el("div", "body");
  body.append(renderMarkdown(text));
  wrap.append(head, copy, body);
  return wrap;
}

/** @param {import("../../core/store.js").ChatEntry} entry @returns {HTMLElement} */
function renderEntry(entry) {
  if (entry.kind === "user") return el("div", "msg-user", entry.text);
  if (entry.kind === "banner") return el("div", "session-banner", entry.text);
  return agentMsg(entry.who ?? "main", entry.text);
}

/** @type {HTMLElement | null} */
let thinkingEl = null;
/** How many of state.chat are already in the DOM. */
let rendered = 0;

/** @param {readonly import("../../core/store.js").ChatEntry[]} chat */
function onChat(chat) {
  const inner = $("chat-inner");
  const nearBottom = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 80;
  for (const entry of chat.slice(rendered)) inner.append(renderEntry(entry));
  rendered = chat.length;
  if (thinkingEl) inner.append(thinkingEl); // keep the indicator below the latest
  if (nearBottom) scrollChat();
}

/** @param {import("../../core/store.js").Thinking} t */
function onThinking(t) {
  if (!t.active) {
    thinkingEl?.remove();
    thinkingEl = null;
    return;
  }
  const label = t.label || "thinking…";
  if (!thinkingEl) {
    thinkingEl = el("div", "msg-thinking");
    thinkingEl.append(el("span", "thinking-dot"), el("span", "thinking-status", label));
    $("chat-inner").append(thinkingEl);
    scrollChat();
    return;
  }
  const status = thinkingEl.querySelector(".thinking-status");
  if (status) status.textContent = label;
}

export function initChat() {
  subscribe("chat", onChat);
  subscribe("thinking", onThinking);
}
