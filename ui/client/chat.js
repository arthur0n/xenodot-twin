// Chat column — banners, user messages, agent messages, and thinking indicator.
import { $, el } from "./dom.js";
import { paint, agentLabel, agentInitial } from "./agents.js";
import { renderMarkdown } from "./markdown.js";

const chatScroll = $("chat-scroll");
export const scrollChat = () => {
  chatScroll.scrollTop = chatScroll.scrollHeight;
};

/** @type {HTMLElement | null} */
let thinkingEl = null;

/** Show a pulsing "thinking…" indicator in the chat after the user message. */
export function showThinking() {
  clearThinking();
  const wrap = el("div", "msg-thinking");
  wrap.append(el("span", "thinking-dot"), el("span", "thinking-status", "thinking…"));
  thinkingEl = wrap;
  $("chat-inner").append(wrap);
  scrollChat();
}

/** Update the thinking indicator with the current tool being executed.
 * @param {string} verb @param {string} [detail] */
export function updateThinking(verb, detail) {
  if (!thinkingEl) return;
  const status = thinkingEl.querySelector(".thinking-status");
  if (status) status.textContent = detail ? `${verb} · ${detail.slice(0, 60)}` : verb;
}

/** Remove the thinking indicator. */
export function clearThinking() {
  thinkingEl?.remove();
  thinkingEl = null;
}

/** @param {string} text */
export function addBanner(text) {
  $("chat-inner").append(el("div", "session-banner", text));
  scrollChat();
}

/** @param {string} text */
export function addUser(text) {
  $("chat-inner").append(el("div", "msg-user", text));
  scrollChat();
}

/** @param {string} who @param {string} text */
export function addAgentMsg(who, text) {
  const wrap = el("div", "msg-agent");
  const head = el("span", "who");
  const label = agentLabel(who);
  head.append(paint(el("span", "agent-avatar", agentInitial(who)), who));
  head.append(` ${label}`);
  const copy = el("button", "copy-btn", "⧉");
  copy.title = "Copy message";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "✓";
      setTimeout(() => (copy.textContent = "⧉"), 1200);
    } catch {
      copy.textContent = "✕";
    }
  };
  const body = el("div", "body");
  body.append(renderMarkdown(text));
  wrap.append(head, copy, body);
  $("chat-inner").append(wrap);
  scrollChat();
}
