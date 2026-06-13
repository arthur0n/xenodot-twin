// Client entry point. Loaded by index.html as <script type="module">; pulls in
// every feature module and performs the cross-cutting top-level wiring. The
// websocket module opens the session as a side effect of being imported.
import { setupResizer, restorePanelWidths } from "./resize.js";
import { initActivityLog } from "./activity-log.js";
import { initApprovalsPill } from "./approvals.js";
import { loadState, initProjectTabs } from "./project-tree.js";
import { loadSessions } from "./sessions.js";
import { initComposer } from "./composer.js";
import { initTranscript } from "./transcript.js";
import { initGetAssets } from "./get-assets.js";
import { send } from "./websocket.js";
import { $, $input } from "./dom.js";

restorePanelWidths();
setupResizer("resize-sidebar", "--sidebar-w", "left", 180, 420);
setupResizer("resize-activity", "--activity-w", "right", 260, 560);
initActivityLog();
initApprovalsPill();
initComposer();
initProjectTabs();
initGetAssets();
initTranscript();

$input("mode-select").onchange = () => {
  send({ type: "policy", value: $input("mode-select").value });
};
$("refresh").onclick = () => {
  void loadState();
};
$("new-session").onclick = () => {
  location.href = location.pathname;
};

void loadState();
void loadSessions();
