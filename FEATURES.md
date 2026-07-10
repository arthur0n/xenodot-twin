# Features

What Xenodot Twin actually does, as a capability catalog. For the philosophy,
positioning, and setup, see the [README](README.md); for the wire protocol, see
[`ui/PROTOCOL.md`](ui/PROTOCOL.md).

Counts below are badge-tracked (`npm run badges` rewrites them and cross-checks
the base-agent list against `plugin/agents/`; wired into pre-commit). The live
source of truth is the **Agents** tab in the UI and the plugin dirs
(`plugin/agents/`, `plugin/skills/`).

## The pipeline

```
idea → twin-architect   interviews you, refuses vague scope, writes a one-page design doc
     → twin-import       IFC/BIM → GLB + property sidecar, joined by GlobalId
     → scene-optimizer   measured LOD / MultiMesh / chunking to hit a frame budget
     → data-binder       master data + live time-series bound to the actual elements
     → twin-verify       headless engine checks + join / binding / playback gates
     → you               one look in the running viewer — that's your job
```

Design decisions move **before** inference, not during it. Push-back is the
product: nothing is reported "done" without passing real engine + twin checks.

## Multi-agent orchestration (the Hive)

- **One orchestrator per session** routes and coordinates; it never implements.
- **Background sub-agents** — builders run with `run_in_background`, so you keep
  messaging the Hive while they work; each can be stopped individually.
- **FleetView running strip** — one live chip per in-flight sub-agent. The client
  reconciles it against the server's authoritative running set, so a missed
  lifecycle event self-heals on the next snapshot (no stale cards).
- **Handoff-by-file** — a builder writes its full report to
  `.xenodot/handoffs/<slug>.md`; `handoff-summarizer` distills it to a ≤5-line
  digest the orchestrator acts on (long reports never truncate away).
- **Persistent task board** — `.xenodot/tasks.json`, survives sessions and resume.
- **Concurrent-build hygiene** — every agent shares one working tree (no
  per-agent worktree isolation, by design: faster, simpler). The orchestrator
  partitions scope to disjoint file sets, re-verifies a transient gate fail
  during a concurrent build, and accepts the residual race rather than chase it.

## Twin agents & skills (`xenodot:<name>`)

The digital-twin domain, folded into the one `xenodot` plugin (`twin-*` prefix). Three agents:

- `twin-architect` — the design gate: interviews you, owns the scene / join /
  overlay architecture, writes a `design/` doc small enough to build and verify
  in one step.
- `scene-optimizer` — heavy converted geometry: LOD, MultiMesh instancing,
  chunking, occlusion, draw-call cleanup — every change measured against a stated
  frame budget.
- `data-binder` — the data join: master data + time-series joined by IFC
  GlobalId, DataBus subscriptions, live value → material/label updates, element
  pick → property panel, and recorded-history playback.

Five twin skills: `twin-import` (IFC → GLB + property sidecar), `twin-optimize`
(measured ≥4.4× on repeated-geometry scenes), `twin-bind-data`, `twin-playback`
(sha-gated determinism), `twin-verify` — the composed gate `tools/verify_twin.sh`
that layers the base `xenodot:godot-verify` render floor under three twin-specific
gates (frame budget, data-binding smoke, GlobalId join coverage).

## Agents (13)

The framework's agents, all namespaced `xenodot:<name>` (one plugin — the
engine-generic base and the digital-twin domain ship together). Grouped by role:

- **Digital-twin domain** — `twin-architect` (the design gate — see above),
  `scene-optimizer` (heavy converted geometry: LOD, MultiMesh, chunking,
  occlusion, every change measured against a frame budget), `data-binder`
  (master data + time-series joined by IFC GlobalId, live overlays, playback).
- **Builders** — `godot-dev` (the default builder: scaffolding, main scene,
  camera/navigation rig, UI panels, exports, generic Godot glue), `godot-visuals`
  (the rendered look: lighting, environment, post-process), `godot-assets`
  (asset-import wiring — a sourced `.glb`/texture, HD meshes + PBR materials),
  `godot-refactor` (behaviour-preserving modularization into components).
- **Researchers (pull-based growth, human-gated)** — `addon-researcher`
  (buy-vs-build for free Godot addons), `skill-researcher` (find a skill when no
  base one fits), `cli-researcher` (new agent/tooling capabilities),
  `transcript-researcher` (harvest video knowledge into the library),
  `godot-docs-evangelist` (authoritative Godot API verification; needs the docs MCP).
- **Support** — `handoff-summarizer` (the ≤5-line builder-report digest).

## Skills (25)

Procedures (one canonical path, observable outcome), not references. Loaded by
the implementers that own them, not invoked directly. Across these domains:

- **Meta / procedural** — `agent-report`, `autonomous-main-goal`, `caveman`,
  `graphify`, `research-presenting`, `tasks-mcp`.
- **Godot core** — project conventions, typed-GDScript code rules, composition
  (SOLID via component nodes), the main-scene shell, docs lookup, export builds.
- **Verification** — `godot-verify` (scenes load, render, no silent drops) and
  runtime smoke.
- **Rendering** — screen-space post-process effects.

## Web UI

Runs the same agents from a browser (`npm start` / `./start_server` →
`http://localhost:8338`; override with `PORT=<n>`):

- **Chat** — composer + message history.
- **Activity feed + FleetView** — live event stream (tool calls, agent prose,
  transitions) and the running-agents strip.
- **Task board** — the persistent right-rail to-do list (agent- and user-owned).
- **Approval gates** — agent questions render as clickable choices
  (`AskUserQuestion`), typed **forms** (`mcp__ui__form`), and tool calls as
  allow/deny cards. Questions always reach you regardless of permission policy.
- **Promotions board** — approve/reject promoting a project-local skill/agent/tool
  into the framework plugin.
- **Sessions** — browse, resume (full context), and `compact` a session in place.
- **Settings** — Hermes, Codex, Godot-docs MCP toggles; model/provider; skill scope.
  **Set up** buttons run `codex:setup` / `hermes:setup` from the UI (restart to activate;
  Hermes still needs the one-time `hermes portal` browser auth).
- **Level editor** — grid-based scene sketching that hands off to a builder.
- **Get Assets** — request/upload PNG textures or `.glb` models; placed into the
  project (`assets/`) or the shared library (`x-shared-assets/`) and wired + verified.
- **Autonomous panel** — set a standing Main Goal and watch the check loop.
- **Project tree** — read-only browse of scenes/scripts/design docs.
- **Context meter** — live context-window usage (green→amber→red) per session.

## Verification & safety

- **`godot-verify` gate** — `verify_scene.gd` / `verify_render.gd`: scenes load,
  node paths resolve, properties aren't silently dropped, and frames actually
  render. Godot exits 0 on parse errors, so this exists because "verified" bugs shipped.
- **Twin gates (`tools/verify_twin.sh`)** — layered on top of the render floor:
  the **frame-budget** gate (bench vs the stated budget), the **data-binding
  smoke** (seeded simulator → assert the overlay state actually moved), the
  **GlobalId join coverage** check (every model node resolves to a data row), and
  **playback determinism** (`check_playback.gd` run twice → identical hash).
- **Typed-export NodePath gate** — `check_typed_export_nodepath` catches a silent Godot
  trap: a concretely-typed node-ref `@export` (e.g. `var x: Node3D`) assigned a `NodePath`
  in a `.tscn` resolves to **null** at runtime with no error — green validate, dead feature.
- **Permission policy** — per-session, live-switchable: `ask` (default, every
  un-allowlisted tool prompts) / `edits` (edits auto-allowed) / `all`.
- **PreToolUse safety hooks** — guard destructive operations and protect the
  lint/config files; the `rtk` command hook no-ops safely if rtk isn't installed.
- **Auto-deny visibility** — a headless sub-agent's un-reachable approval is
  surfaced in the activity log (and a banner) instead of dying silently.

## Autonomous mode

A standing **Main Goal** plus a recurring **check loop**: the Hive evaluates the
goal, dispatches the next slice each tick, and reports progress — still gated by
the same approvals. Off by default; set/cleared from the Autonomous panel
(`ui/server/features/autonomous/`, `mcp__ui__autonomous`,
`.xenodot/autonomous.json`).

## Integrations (opt-in, off by default)

- **Hermes** — an external research agent with its own model/provider/billing.
  The Hive dispatches it for deep web research; it stays advisory (a Xenodot
  researcher + you own the verdict). Setup: [`HERMES.md`](HERMES.md).
- **Codex** — OpenAI's Codex reviewer plugin, on-demand only via `/codex:review`;
  credentials live in the `codex` CLI, never in Xenodot. Setup: [`CODEX.md`](CODEX.md).
- **Godot-docs MCP** — official Godot 4.x docs as an MCP source, powering
  `godot-docs-evangelist`; enabled in Settings.

## Growth loop

A new skill/agent/tool starts **project-local** in `<viewer>/.claude/` and is
usable immediately. When one proves broadly useful, file a promotion
(`mcp__ui__promote`); you approve it on the board and run
`npm run promote -- …` to move it into the plugin. **Tools carry a domain** — _universal_
(scene-agnostic; promotable, materialises into every project) vs _project_ (hardcodes a
specific scene/dataset; stays local). A promotion guard rejects a project-domain tool so
site-specific checks don't pollute every viewer — see
[`docs/process/promotion.md`](docs/process/promotion.md). Researchers write findings back
into the knowledge base (`library/`, a symlink to `plugin/library/`).

## Provider flexibility

The Hive drives Claude Code through the Agent SDK, so **Amazon Bedrock, Google
Vertex, Azure Foundry, and enterprise gateways** are first-class backends (flip
the standard `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` / gateway env
vars). Non-Claude models route through an Anthropic-API-compatible proxy
(LiteLLM, claude-code-router). You're tied to an API _shape_, not a vendor — but
the pipeline is tuned for Claude's tool calls, so non-Claude models lose some fidelity.
