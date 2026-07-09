# Xenodot Twin

<p align="center"><img src="assets/full_logo.png" alt="Xenodot Twin" width="340"></p>

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Godot-family 4.x](https://img.shields.io/badge/Godot--family-4.x-blue.svg)
![Skills: 16](https://img.shields.io/badge/Skills-16-purple.svg)
![Agents: 10](https://img.shields.io/badge/Agents-10-orange.svg)
![Status: POC](https://img.shields.io/badge/Status-POC-yellow.svg)

An AI agent framework on the **Claude Code SDK** that works _with_ you to build **digital-twin
visualization apps on Godot** — using **a deliberate pipeline instead of a chat box**.

It takes a real building model (IFC/BIM or CAD), imports it into a Godot 3D scene, joins it to your
master data by element id, and drives it with **live time-series** and **recorded-history playback**.
You get a running viewer you can walk through, color by live values, click an element to read its
data, and scrub back through time.

**What it is honest about:** this is **visualization** — geometry + live data + history playback.
It is **not** a physics or process simulator. It doesn't model airflow, structural loads, or what a
system _would_ do under a hypothetical; it shows you what your model _is_ and what your data _says_,
clearly and in 3D.

## The pipeline

You don't describe a viewer and hope. You go through a short interview that cuts scope to one
buildable slice, locks a design doc, and only then hands off to a builder — and nothing is called
"done" until it passes real engine + twin gates.

```
idea → twin-architect    interviews you, refuses vague scope, writes a one-page design doc
     → twin-import        IFC/BIM → GLB + property sidecar, joined by GlobalId
     → scene-optimizer    measured LOD / MultiMesh / chunking to hit a frame budget
     → data-binder        master data + live time-series bound to the actual elements
     → twin-verify        headless engine checks + join / binding / playback gates
     → you                one look in the running viewer — that's your job
```

Design decisions move **before** inference, not during it. The gates are the point: a viewer that
connects but paints nothing, or a "verified" scene Godot silently dropped a property from, does not
pass.

## Measured, not claimed

Numbers from the spike + benchmark findings in [`plugin-twin/library/findings/`](plugin-twin/library/findings)
(one machine — M3 Pro, macOS/Metal, Godot 4.6.3; recipes generalize, percentages don't automatically):

- **Optimize: 4.4×.** A city block of repeated real BIM (114,400 mesh instances) goes **27.3 → 119.4
  fps** at the aerial vantage with chunked MultiMesh instancing (render-thread submit −98%). The
  optimizer is measured against a stated frame budget, not eyeballed.
- **Join: 100%.** IFC → GLB carries the IFC **GlobalId** as the node name, so the model joins to a
  master-data sidecar by id at ~100% of mesh nodes — verified headless as a gate, not by hand.
- **Playback: sha-gated.** Recorded history replays deterministically — `check_playback.gd` runs
  twice and the gate asserts an identical `PLAYBACK-HASH`, so "it replays the same" is a check, not a
  hope.
- **Import: ~1.1 s.** A 2.3 MB sample IFC converts to GLB + property sidecar in about a second
  (ifcopenshell in a Python 3.12 venv); live telemetry streams clean over a WebSocket at 10 Hz.

## Quickstart

Requires [Claude Code](https://claude.com/claude-code), Node 18+, and a Godot-family 4.x binary
(see [Requirements](#requirements)).

```bash
git clone https://github.com/arthur0n/xenodot-twin.git
cd xenodot-twin
npm install
npm run validate        # tsc + eslint + gates — should be green out of the box

npm run new -- ../plant  # scaffold a digital-twin VIEWER next door (projectType: viewer)
npm start ../plant       # web UI on http://localhost:8338
```

`npm run new -- <path>` scaffolds a viewer by default — there is no game path in this fork (see
[Lineage](#lineage)). It copies the viewer starter, remembers the path, materializes the plugin's
per-project tools, symlinks the shared library, and health-checks with `doctor`.

Prefer a detached server that survives the terminal? Use the launcher:

```bash
./start_server ../plant     # detached; logs + PID under .xenodot-run/
PORT=9000 ./start_server ../plant   # the UI defaults to port 8338; override with PORT
./stop_server
```

Then open the tutorial and the try-it kit — they're the fastest way in.

### The tutorial + try-it kit

- **[`docs/tutorials/digital-twin.md`](docs/tutorials/digital-twin.md)** — the complete from-scratch
  walkthrough: empty folder → a live, scrubbable twin of a real BIM model, with a green end-to-end
  gate. Every command and output was actually run.
- **[`plugin-twin/examples/`](plugin-twin/examples)** — the bundled kit the tutorial uses: a sample
  IFC (`Duplex_A_20110907.ifc`), an example `binding_map`, and an example `viewer.cfg`, so you don't
  have to source any files yourself.

## Requirements

- **[Claude Code](https://claude.com/claude-code)** — the agent runtime the framework drives via the
  SDK. A Claude subscription or an Anthropic API key (or a Bedrock/Vertex/gateway backend).
- **Node 18+** — the web UI + tooling (developed on Node 22).
- **A Godot-family 4.x binary** — Godot, Redot, or Blazium. Point the framework at it once; see
  [`docs/engines.md`](docs/engines.md). Developed against Godot 4.6.3.
- **Optional — Python 3.12 + [ifcopenshell](https://ifcopenshell.org/)** — only for IFC import.
  `uv venv --python 3.12 && uv pip install ifcopenshell` (system Python 3.14 has no wheel yet — the
  one real setup trap, covered in the tutorial). Not needed for GLB/CAD models or the examples once
  converted.

## What's inside

- **The web UI** (`ui/`) — a Node server + browser client that runs the agent team, streams their
  activity, surfaces approval gates and forms, holds a persistent task board, and lets you resume or
  compact sessions. `npm start` or `./start_server`.
- **The `xenodot` base plugin** (`plugin/`) — engine-generic agents (`godot-dev`, `godot-visuals`,
  `godot-assets`, `godot-refactor`, the researchers, `godot-docs-evangelist`) and Godot skills
  (`godot-verify`, `godot-code-rules`, `godot-composition`, `godot-export-builds`, `godot-main-scene`,
  …). Loaded into every session.
- **The `xenodot-twin` plugin** (`plugin-twin/`) — the digital-twin domain: `twin-architect`,
  `scene-optimizer`, `data-binder` and the `twin-import` / `twin-optimize` / `twin-bind-data` /
  `twin-playback` / `twin-verify` skills. It **composes** the base plugin via the `xenodot:`
  namespace rather than copying it.
- **The viewer starter** (`starter-viewer/`) — the minimal Godot project `new` scaffolds.

A full capability catalog is in [`FEATURES.md`](FEATURES.md).

## Design principles

- **Move design before inference.** The interview locks scope; the builder implements exactly that.
- **Gates over vibes.** Render health, join coverage, binding smoke, frame budget, playback
  determinism — all deterministic, all run before "done".
- **One system, not N parallel ones.** One join model, one data contract, one signal path — the
  architect decides the shape before builders fan out.
- **Data-driven both halves.** Every binding value lives in a named, addressable place, and code only
  reads it — a hardcoded id or inline threshold is a magic number even in a "data-driven" system.
- **The framework is yours to change.** Skills and rules are files; researchers pull new ones in when
  the pipeline hits friction. The framework you end up with isn't the one you started with.

## Lineage

Xenodot Twin is a **fork of [xenodot-forge](https://github.com/arthur0n/xenodot-forge)** — the same
web UI, agent spine, and Godot engine tooling, focused down to one domain. The game half (the game
orchestrator, gameplay agents, and game-genre skills) was stripped; the digital-twin domain and the
engine-generic core were kept.

It tracks upstream: `/sync-upstream` pulls curated framework improvements down from xenodot-forge and
re-drops the game payload each time. The full contract lives in
[`docs/fork/SEAMS.md`](docs/fork/SEAMS.md) (every intentional divergence — the re-drop checklist) and
[`docs/fork/SYNC.md`](docs/fork/SYNC.md) (the runbook).

## Honest limitations

- **Visualization, not simulation.** See above — no physics/process modeling.
- **POC.** It works end-to-end and the gates are real, but it's an experiment, not a product. Numbers
  are from one machine.
- **Godot for the viewport, not a mapping engine.** Great for a building/facility-scale 3D model with
  data bound to elements. It is not a planet-scale GIS globe.
- **Non-Claude models lose fidelity.** The pipeline is tuned for Claude's tool calls; other providers
  work through an API-compatible proxy but degrade.

## Integrations (opt-in, off by default)

- **Hermes** — an external deep-research agent with its own model/billing ([`HERMES.md`](HERMES.md)).
- **Codex** — OpenAI's Codex reviewer, on-demand via `/codex:review` ([`CODEX.md`](CODEX.md)).
- **Godot-docs MCP** — official Godot 4.x docs as an MCP source, powering `godot-docs-evangelist`.

## License

MIT — see [`LICENSE`](LICENSE). Built by [Arthur Nunes](https://github.com/arthur0n), forked from
Xenodot Forge.
