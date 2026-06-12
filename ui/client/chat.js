// Chat column — banners, user messages, and agent messages (with copy button).
import { $, el } from "./dom.js";
import { paint } from "./agents.js";
import { renderMarkdown } from "./markdown.js";

const chatScroll = $("chat-scroll");
export const scrollChat = () => {
  chatScroll.scrollTop = chatScroll.scrollHeight;
};

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
  head.append(paint(el("span", "agent-avatar", who.charAt(0).toUpperCase()), who));
  head.append(` ${who}`);
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
