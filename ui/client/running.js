// Running-agents panel — shows every sub-agent currently in flight (the
// orchestrator can run several at once), each as a colored chip with its task
// and an elapsed timer. Replaces the old single-agent status bar.
import { $, el } from "./dom.js";
import { paint, agentLabel } from "./agents.js";

/** @typedef {{ label: string, desc: string, started: number, elapsed?: HTMLElement }} Running */
/** @type {Map<string, Running>} */
const running = new Map(); // tool_use id -> running agent
/** @type {ReturnType<typeof setInterval> | undefined} */
let timer;

/** @param {number} seconds @returns {string} */
function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  return m ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

function tick() {
  const now = Date.now();
  for (const r of running.values()) {
    if (r.elapsed) r.elapsed.textContent = fmt(Math.floor((now - r.started) / 1000));
  }
}

function render() {
  const box = $("running-agents");
  box.replaceChildren();
  if (!running.size) {
    box.style.display = "none";
    clearInterval(timer);
    timer = undefined;
    return;
  }
  for (const r of running.values()) {
    // paint the chip so --agent-color flows to its border, dot, and name.
    const chip = paint(el("div", "running-agent"), r.label);
    chip.append(el("span", "status-dot"));
    chip.append(el("span", "agent-name", agentLabel(r.label)));
    if (r.desc) chip.append(el("span", "running-target", r.desc));
    r.elapsed = el("span", "elapsed", "0s");
    chip.append(r.elapsed);
    box.append(chip);
  }
  box.style.display = "";
  timer ??= setInterval(tick, 1000);
  tick();
}

/** @param {string} id @param {string} label @param {string} [desc] */
export function startAgent(id, label, desc) {
  running.set(id, { label, desc: desc ?? "", started: Date.now() });
  render();
}

/** @param {string} id */
export function stopAgent(id) {
  if (running.delete(id)) render();
}

/** Clear all running agents — backstop at end of turn. */
export function clearAll() {
  if (running.size) {
    running.clear();
    render();
  }
}
