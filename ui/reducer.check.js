// Pure-function checks for the store reducer — run with bare node:
//   node ui/reducer.check.js
// There is no test runner in this project, but reduce() is DOM-free and pure,
// so it can be exercised directly. These assert the fold behavior AND the
// identity-diff invariant the per-slice store subscription depends on. Not part
// of `npm run validate`; run by hand after touching reducer.js.
import assert from "node:assert/strict";
import { reduce } from "./client/core/reducer.js";
import { initialState } from "./client/core/store.js";

/** @typedef {import("./lib/types.js").ServerMsg} ServerMsg */
/** @typedef {import("./lib/types.js").ContentBlock} ContentBlock */

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

/** @param {ContentBlock[]} content @param {string} [subagent] @returns {ServerMsg} */
const assistant = (content, subagent) => ({
  type: "event",
  message: { type: "assistant", subagent_type: subagent, message: { content } },
});

/** @param {string} toolUseId @returns {ServerMsg} */
const toolResult = (toolUseId) => ({
  type: "event",
  message: {
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: toolUseId }] },
  },
});

/** @param {import("./lib/types.js").RunningAgentWire[]} agents @returns {ServerMsg} */
const running = (agents) => ({ type: "running", agents });

/** @param {Partial<import("./client/core/store.js").RunningAgent>} [over] @returns {import("./client/core/store.js").RunningAgent} */
const chip = (over = {}) => ({
  id: "tu",
  label: "w",
  desc: "build",
  started: 0,
  background: true,
  ...over,
});

check("tasks snapshot replaces tasks but keeps the chat ref (identity invariant)", () => {
  const s0 = initialState();
  const s1 = reduce(s0, {
    type: "tasks",
    tasks: [{ id: "t1", title: "x", owner: "agent", status: "pending", created: "" }],
  });
  assert.equal(s1.tasks.length, 1);
  assert.notEqual(s1.tasks, s0.tasks); // changed slice → new ref
  assert.equal(s1.chat, s0.chat); // untouched slice → same ref (per-slice notify)
});

check("main assistant text appends one chat entry and sets busy", () => {
  const s = reduce(initialState(), assistant([{ type: "text", text: "hello" }]));
  assert.equal(s.chat.length, 1);
  assert.equal(s.chat[0]?.kind, "agent");
  assert.equal(s.busy, true);
});

check("a sub-agent's text goes to the activity log, not the chat", () => {
  const s = reduce(initialState(), assistant([{ type: "text", text: "working" }], "godot-dev"));
  assert.equal(s.chat.length, 0);
  assert.equal(s.activity.at(-1)?.kind, "say");
});

check("a Task spawn adds a chip; its tool_result removes it", () => {
  let s = reduce(
    initialState(),
    assistant([
      { type: "tool_use", id: "tu", name: "Task", input: { subagent_type: "godot-dev" } },
    ]),
  );
  assert.equal(s.running.length, 1);
  s = reduce(s, toolResult("tu"));
  assert.equal(s.running.length, 0);
});

check("a backgrounded spawn's immediate tool_result does NOT remove its chip", () => {
  let s = reduce(
    initialState(),
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "w", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, toolResult("bg"));
  assert.equal(s.running.length, 1);
});

check("result clears foreground chips, keeps background, folds usage and busy", () => {
  let s = reduce(
    initialState(),
    assistant([{ type: "tool_use", id: "fg", name: "Task", input: { subagent_type: "f" } }]),
  );
  s = reduce(
    s,
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "b", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, {
    type: "event",
    message: {
      type: "result",
      subtype: "success",
      total_cost_usd: 0.25,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 4000,
      },
    },
  });
  assert.equal(s.running.length, 1);
  assert.equal(s.running[0]?.background, true);
  assert.equal(s.busy, false);
  // All four token classes are folded — cache reads included, not just in/out.
  assert.equal(s.usage.input, 100);
  assert.equal(s.usage.output, 50);
  assert.equal(s.usage.cacheCreate, 200);
  assert.equal(s.usage.cacheRead, 4000);
  assert.equal(s.usage.cost, 0.25);
});

check("idle clears busy + every running chip (the stuck-running backstop)", () => {
  let s = reduce(
    initialState(),
    assistant([
      {
        type: "tool_use",
        id: "bg",
        name: "Task",
        input: { subagent_type: "b", run_in_background: true },
      },
    ]),
  );
  s = reduce(s, assistant([{ type: "text", text: "thinking" }])); // sets busy
  assert.equal(s.running.length, 1);
  assert.equal(s.busy, true);
  s = reduce(s, { type: "idle" });
  assert.equal(s.running.length, 0); // even background chips clear: the session is over
  assert.equal(s.busy, false);
  assert.equal(s.thinking.active, false);
});

check("idle is identity-preserving when nothing is live", () => {
  const s0 = initialState();
  assert.equal(reduce(s0, { type: "idle" }), s0);
});

check("a background permission_denied logs to activity AND raises a banner", () => {
  const s = reduce(initialState(), {
    type: "permission_denied",
    toolName: "Write",
    agent: "skill-researcher",
    reason: "asyncAgent",
    background: true,
  });
  assert.equal(s.activity.at(-1)?.kind, "deny");
  assert.equal(s.chat.at(-1)?.kind, "banner");
});

check("a foreground permission_denied logs to activity only (no banner)", () => {
  const s = reduce(initialState(), {
    type: "permission_denied",
    toolName: "Bash",
    agent: "main",
    reason: "rule",
    background: false,
  });
  assert.equal(s.activity.at(-1)?.kind, "deny");
  assert.equal(s.chat.length, 0);
});

check("running snapshot drops a stale chip absent from the authoritative set", () => {
  const s0 = { ...initialState(), running: [chip({ taskId: "task-1" })] };
  const s1 = reduce(s0, running([])); // server: nothing live → the stale-card fix
  assert.equal(s1.running.length, 0);
  assert.notEqual(s1.running, s0.running);
});

check("running snapshot keeps a just-spawned chip not yet in the set (grace window)", () => {
  const s0 = { ...initialState(), running: [chip({ started: Date.now() })] };
  const s1 = reduce(s0, running([])); // its task_started hasn't landed in the snapshot yet
  assert.equal(s1.running.length, 1);
});

check("running snapshot keeps a matched chip's client fields and merges server taskId", () => {
  const s0 = { ...initialState(), running: [chip({ started: 123, stopping: true })] };
  const s1 = reduce(
    s0,
    running([
      { taskId: "task-1", toolUseId: "tu", label: "w", desc: "x", started: 999, background: true },
    ]),
  );
  assert.equal(s1.running.length, 1);
  assert.equal(s1.running[0]?.taskId, "task-1"); // gained from the server
  assert.equal(s1.running[0]?.started, 123); // client-only field preserved
  assert.equal(s1.running[0]?.stopping, true); // client-only field preserved
});

check("running snapshot adds a server chip the client never spawned", () => {
  const s1 = reduce(
    initialState(),
    running([
      { taskId: "task-1", toolUseId: "tu2", label: "w", desc: "b", started: 5, background: true },
    ]),
  );
  assert.equal(s1.running.length, 1);
  assert.equal(s1.running[0]?.id, "tu2");
  assert.equal(s1.running[0]?.label, "w");
});

check("an equivalent running snapshot is identity-preserving (no repaint)", () => {
  const s0 = { ...initialState(), running: [chip({ started: 123, taskId: "task-1" })] };
  const s1 = reduce(
    s0,
    running([
      {
        taskId: "task-1",
        toolUseId: "tu",
        label: "w",
        desc: "build",
        started: 123,
        background: true,
      },
    ]),
  );
  assert.equal(s1.running, s0.running); // same ref → per-slice notify skips it
});

console.log(`\n${passed} checks passed`);
