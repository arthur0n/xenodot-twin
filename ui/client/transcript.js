// "Add transcript" — paste a raw video transcript; the framework writes it into
// the game's transcripts/ drop zone (POST /api/transcript) and kicks off the
// source-driven harvest by prompting the orchestrator to run transcript-researcher.
import { $, $input } from "./dom.js";
import { postJSON } from "../lib/json.js";
import { send } from "./websocket.js";
import { addUser } from "./chat.js";
import { loadState } from "./project-tree.js";

function open() {
  $("transcript-modal").style.display = "";
  $input("transcript-title").focus();
}
function close() {
  $("transcript-modal").style.display = "none";
}

/** Build the harvest prompt the orchestrator acts on. @param {string} path @param {string} building */
function harvestPrompt(path, building) {
  const why = building ? `We're about to build ${building}. ` : "";
  return `${why}Harvest the new transcript at ${path} with transcript-researcher first, then bring me its recommendations.`;
}

async function submit() {
  const textEl = /** @type {HTMLTextAreaElement} */ ($("transcript-text"));
  const text = textEl.value.trim();
  const err = $("transcript-error");
  if (!text) {
    err.textContent = "Paste the transcript text first.";
    textEl.focus();
    return;
  }
  err.textContent = "";
  const title = $input("transcript-title").value.trim();
  const building = $input("transcript-building").value.trim();
  /** @type {{ path?: string, error?: string }} */
  let data;
  try {
    data = /** @type {{ path?: string, error?: string }} */ (
      await postJSON("/api/transcript", { name: title || "transcript", text })
    );
  } catch {
    err.textContent = "Save failed — restart the UI server (npm start) and try again.";
    return;
  }
  if (!data.path) {
    err.textContent = data.error ?? "Could not save the transcript.";
    return;
  }
  // Reset, close, refresh the file tree, then start the pipeline over the session.
  textEl.value = "";
  $input("transcript-title").value = "";
  $input("transcript-building").value = "";
  close();
  void loadState();
  const prompt = harvestPrompt(data.path, building);
  addUser(prompt);
  send({ type: "user_input", text: prompt });
}

export function initTranscript() {
  $("transcript-open").onclick = open;
  $("transcript-cancel").onclick = close;
  $("transcript-submit").onclick = () => {
    void submit();
  };
  // Click the dimmed backdrop (not the panel) to dismiss.
  $("transcript-modal").addEventListener("click", (e) => {
    if (e.target === $("transcript-modal")) close();
  });
}
