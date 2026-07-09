// node:test coverage for session.js's exported seams — the permission gate
// (makeCanUseTool: policies, always-allow, autonomous bypass, the one-channel ask
// guard), the stream bookkeeping (trackMessage: chip lifecycle + denial surfacing),
// and the local-plugin gating (resolveSessionPlugins: codex iff enabled AND vendored).
// GAME_DIR points at a temp dir before import so board reads/writes stay isolated.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-session-"));
process.env.GAME_DIR = scratch;
const { denyIfQuestionOpen, makeCanUseTool, trackMessage } = await import("./session.js");
const { resolveSessionPlugins } = await import("./session-plugins.js");
const { docsDedupDecision, isImageRead } = await import("./ui-control.js");
const store = await import("../features/tasks/tasks-store.js");

/** @typedef {import("../../lib/types.js").OutMsg} OutMsg */
/** @typedef {import("../../lib/types.js").RunningAgentWire} RunningChip */

const NOW = "2026-01-01T00:00:00.000Z";

beforeEach(() => {
  rmSync(path.join(scratch, ".xenodot"), { recursive: true, force: true });
});

/** Build a canUseTool with a scripted waitFor and collecting log.
 * @param {{ policy?: string, autonomousActive?: boolean, reply?: unknown }} [opts] */
function makeGate(opts = {}) {
  /** @type {Array<{ kind: string, payload: unknown }>} */
  const waits = [];
  /** @type {Array<{ dir: string, obj: OutMsg }>} */
  const logged = [];
  const session = { policy: opts.policy ?? "ask", autonomousActive: opts.autonomousActive };
  const canUseTool = makeCanUseTool({
    session,
    sessionAllowed: new Set(),
    waitFor: /** @type {never} */ (
      (/** @type {string} */ kind, /** @type {unknown} */ payload) => {
        waits.push({ kind, payload });
        return Promise.resolve(opts.reply ?? { allow: true, always: false });
      }
    ),
    log: (dir, obj) => void logged.push({ dir, obj }),
    agentByTool: new Map([["tu-sub", "godot-dev"]]),
    formAgentQueue: [],
  });
  return { canUseTool, waits, logged, session };
}

test("policy ask: pauses for the user; deny returns a deny result", async () => {
  const { canUseTool, waits } = makeGate({ reply: { allow: false, always: false } });
  const res = await canUseTool(
    "Bash",
    { command: "ls" },
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(waits.length, 1);
  assert.equal(waits[0]?.kind, "permission");
  assert.equal(res.behavior, "deny");
});

test("policy ask + always: remembers the tool for the session (no second pause)", async () => {
  const { canUseTool, waits } = makeGate({ reply: { allow: true, always: true } });
  await canUseTool("Bash", {}, { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) });
  const res = await canUseTool(
    "Bash",
    {},
    { toolUseID: "tu-2", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(waits.length, 1);
  assert.equal(res.behavior, "allow");
});

test("policy edits: edit tools auto-allow, others still pause", async () => {
  const { canUseTool, waits } = makeGate({ policy: "edits" });
  const edit = await canUseTool(
    "Edit",
    {},
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(edit.behavior, "allow");
  assert.equal(waits.length, 0);
  await canUseTool("Bash", {}, { toolUseID: "tu-2", signal: /** @type {never} */ (undefined) });
  assert.equal(waits.length, 1);
});

const GET_CLASS = "mcp__godot-docs__godot_docs_get_class";

test("docs dedup: a repeat get_class is denied with a stub — never re-fetched, never paused", async () => {
  const { canUseTool, waits, logged } = makeGate({ policy: "all" });
  const first = await canUseTool(
    GET_CLASS,
    { className: "Plane" },
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(first.behavior, "allow");
  const second = await canUseTool(
    GET_CLASS,
    { className: "Plane" },
    { toolUseID: "tu-2", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(second.behavior, "deny");
  assert.match(String(second.message), /Plane/);
  assert.equal(waits.length, 0); // the human is never paused for a dedup
  assert.ok(logged.some((l) => /** @type {{ policy?: string }} */ (l.obj).policy === "docs-dedup"));
});

test("docsDedupDecision: first records + allows, repeat denies, non-docs & class-less pass", () => {
  /** @type {Set<string>} */
  const seen = new Set();
  assert.equal(docsDedupDecision(GET_CLASS, { className: "Node" }, seen), null);
  assert.ok(seen.has("Node"));
  assert.equal(docsDedupDecision(GET_CLASS, { className: "Node" }, seen)?.behavior, "deny");
  assert.equal(docsDedupDecision("Read", { className: "Node" }, seen), null);
  assert.equal(docsDedupDecision(GET_CLASS, {}, seen), null);
});

test("image Read: gated — denied when autonomous, forced to pause under policy all", async () => {
  // autonomous → hard deny with the stub (no human to approve)
  const auto = makeGate({ policy: "all", autonomousActive: true });
  const denied = await auto.canUseTool(
    "Read",
    { file_path: "/g/.godot/verify_render_last.png" },
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(denied.behavior, "deny");
  assert.match("message" in denied ? denied.message : "", /GATED|never read a frame/);

  // policy "all" (would normally auto-allow) → image Read still PAUSES for a human
  const gate = makeGate({ policy: "all", reply: { allow: false } });
  const res = await gate.canUseTool(
    "Read",
    { file_path: "/g/shot.png" },
    { toolUseID: "tu-2", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(gate.waits.length, 1); // NOT auto-allowed — human-gated
  assert.equal(res.behavior, "deny");
});

test("isImageRead: only image-path Reads, not code Reads or other tools", () => {
  assert.equal(isImageRead("Read", { file_path: "a.png" }), true);
  assert.equal(isImageRead("Read", { file_path: "a.JPG" }), true);
  assert.equal(isImageRead("Read", { file_path: "player.gd" }), false);
  assert.equal(isImageRead("Bash", { file_path: "a.png" }), false);
  assert.equal(isImageRead("Read", {}), false);
});

test("policy all / autonomous: everything auto-allows and is logged", async () => {
  for (const opts of [{ policy: "all" }, { policy: "ask", autonomousActive: true }]) {
    const { canUseTool, waits, logged } = makeGate(opts);
    const res = await canUseTool(
      "Bash",
      {},
      { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
    );
    assert.equal(res.behavior, "allow");
    assert.equal(waits.length, 0);
    assert.equal(logged.length, 1);
  }
});

test("AskUserQuestion: denied when the same question is already open on the board", async () => {
  store.addQuestion("Which art style?", ["pixel", "hd"], "main", NOW);
  const { canUseTool, waits } = makeGate();
  const res = await canUseTool(
    "AskUserQuestion",
    { questions: [{ question: "which ART style?" }] },
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(res.behavior, "deny");
  assert.equal(waits.length, 0);
  assert.match("message" in res ? res.message : "", /already open/);
});

test("AskUserQuestion: otherwise pauses and merges the user's answers into the input", async () => {
  const { canUseTool } = makeGate({ reply: { answers: { q1: "pixel" } } });
  const res = await canUseTool(
    "AskUserQuestion",
    { questions: [{ question: "Fresh question?" }] },
    { toolUseID: "tu-1", signal: /** @type {never} */ (undefined) },
  );
  assert.equal(res.behavior, "allow");
  assert.ok("updatedInput" in res && res.updatedInput);
});

test("denyIfQuestionOpen: null for malformed input and unmatched questions", () => {
  assert.equal(denyIfQuestionOpen(null), null);
  assert.equal(denyIfQuestionOpen({ questions: "not-an-array" }), null);
  assert.equal(denyIfQuestionOpen({ questions: [{ question: "never asked" }] }), null);
});

/** trackMessage deps bundle with collecting send. */
function makeTrack() {
  /** @type {OutMsg[]} */
  const sent = [];
  return {
    deps: {
      agentByTool: new Map(),
      bgSpawns: new Set(["tu-bg"]),
      /** @type {Map<string, string>} */ bgBoard: new Map(),
      /** @type {Map<string, RunningChip>} */ runningByTask: new Map(),
      /** @type {Map<string, number>} */ lastSeen: new Map(),
      send: (/** @type {OutMsg} */ obj) => void sent.push(obj),
    },
    sent,
  };
}

test("trackMessage: task lifecycle — started fills the running set, notification settles it", () => {
  const { deps, sent } = makeTrack();
  trackMessage(
    /** @type {never} */ ({
      type: "system",
      subtype: "task_started",
      task_id: "task-1",
      tool_use_id: "tu-bg",
      subagent_type: "godot-dev",
      description: "build the HUD",
    }),
    deps,
  );
  assert.equal(deps.runningByTask.size, 1);
  assert.equal(deps.runningByTask.get("task-1")?.background, true);
  assert.ok(deps.lastSeen.has("task-1"));
  assert.ok(deps.bgBoard.has("task-1")); // bridged onto the board (backgrounded spawn)

  trackMessage(
    /** @type {never} */ ({
      type: "system",
      subtype: "task_notification",
      task_id: "task-1",
      status: "completed",
    }),
    deps,
  );
  assert.equal(deps.runningByTask.size, 0);
  assert.equal(deps.lastSeen.has("task-1"), false);
  assert.equal(deps.bgBoard.size, 0);
  const running = sent.filter((m) => m.type === "running").at(-1);
  assert.ok(running?.type === "running");
  assert.deepEqual(running.agents, []);
});

test("trackMessage: assistant tool_use records the raising agent for approval labeling", () => {
  const { deps } = makeTrack();
  trackMessage(
    /** @type {never} */ ({
      type: "assistant",
      subagent_type: "godot-enemy",
      message: { content: [{ type: "tool_use", id: "tu-9", input: { run_in_background: true } }] },
    }),
    deps,
  );
  assert.equal(deps.agentByTool.get("tu-9"), "godot-enemy");
  assert.ok(deps.bgSpawns.has("tu-9"));
});

// ---- resolveSessionPlugins: the plugin-array gating seam (codex iff enabled AND vendored).
// Temp fixture dirs stand in for the vendored codex plugin — the real dir may not exist while
// this framework is being built, and the seam must existsSync-guard regardless.
const pluginScratch = mkdtempSync(path.join(tmpdir(), "xeno-plugins-"));
const baseDir = path.join(pluginScratch, "plugin");
const codexDir = path.join(pluginScratch, "codex");
mkdirSync(baseDir);
mkdirSync(codexDir);
const missingDir = path.join(pluginScratch, "not-there");

test("resolveSessionPlugins: the xenodot spine always loads; codex off → base only", () => {
  const plugins = resolveSessionPlugins({
    baseDir,
    codexEnabled: false,
    codexDir,
  });
  assert.deepEqual(plugins, [{ type: "local", path: baseDir, skipMcpDiscovery: true }]);
});

test("resolveSessionPlugins: codex gates on enabled AND vendored; order is spine, codex", () => {
  const off = resolveSessionPlugins({
    baseDir,
    codexEnabled: true,
    codexDir: missingDir, // enabled but not vendored → nothing
  });
  assert.deepEqual(off, [{ type: "local", path: baseDir, skipMcpDiscovery: true }]);
  const all = resolveSessionPlugins({
    baseDir,
    codexEnabled: true,
    codexDir,
  });
  assert.deepEqual(
    all.map((p) => p.path),
    [baseDir, codexDir],
  );
  assert.deepEqual(all[1], { type: "local", path: codexDir, skipMcpDiscovery: true });
});

test("trackMessage: an SDK auto-deny surfaces as a labeled permission_denied event", () => {
  const { deps, sent } = makeTrack();
  trackMessage(
    /** @type {never} */ ({
      type: "system",
      subtype: "permission_denied",
      tool_use_id: "tu-unknown",
      tool_name: "mcp__ui__form",
      decision_reason_type: "asyncAgent",
    }),
    deps,
  );
  const denial = sent.find((m) => m.type === "permission_denied");
  assert.ok(denial?.type === "permission_denied");
  assert.equal(denial.agent, "background");
  assert.equal(denial.background, true);
});
