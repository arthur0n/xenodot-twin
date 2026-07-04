---
type: tool-definition
title: "graphify for GDScript — tool definition"
description: "use as-is for design/concept graph; GDScript AST coverage is partial (symbols"
timestamp: 2026-06-24T18:13:57+01:00
---

# graphify for GDScript — tool definition

**Problem** — agents need to query codebase structure for code-quality targets (god scripts,
coupling, orphans, refactor scope) but have no tool bridging graphify's existing graph to
GDScript-specific relationships (class hierarchy, signal wiring, preload deps, @onready refs).

**Transport** — CLI (stateless; graphify is already a CLI).

**Verdict** — use as-is for design/concept graph; GDScript AST coverage is partial (symbols
extracted, no inter-.gd edges). No additional tool needed — the playbook below works within
current limits. If cross-.gd call/import graph is needed, that's a separate gap (tree-sitter
extractor — parked).

---

## GDScript Coverage: Ground Truth

Tested against `graphify-out/graph.json` (post `graphify update .`).

| Capability                      | Status | Evidence                                                                                        |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| .gd class/method names as nodes | YES    | 251 `file_type=code` nodes, e.g. `ArenaBuilder._emit_pieces \| entities/arena/arena_builder.gd` |
| signal declarations as nodes    | YES    | `Npc.died (signal)`, `BulletAmmoTracker.ammo_changed` — from .gd source                         |
| `contains` edges (file→symbol)  | NO     | 0 contains edges with .gd source                                                                |
| `calls` edges .gd→.gd           | NO     | 0 cross-.gd calls edges                                                                         |
| `references` edges .gd→.gd      | NO     | 0                                                                                               |
| `preload`/`load` import edges   | NO     | zero nodes; `graphify explain "preload"` → no node                                              |
| `@onready`/`$` node refs        | NO     | zero nodes                                                                                      |
| signal `emit`/`connect` edges   | NO     | zero                                                                                            |
| design/concept graph (.md)      | STRONG | 621 document + 197 concept nodes, 1202 edges, communities, god-nodes accurate                   |

**Root cause**: `graphify update .` re-extracts .gd via LLM text extraction (not tree-sitter AST).
It produces named concept-nodes per .gd file but builds no structural edges between them.
All real graph edges live in the .md semantic layer.

---

## Working Query Playbook

These commands tested and return useful results on our graph.

### 1. God-node / high-fan-in targets (refactor candidates)

```bash
# Top connected nodes = highest-leverage change points
graphify query "WaveManager"
# Returns 37-node BFS cluster; WaveManager=13 edges = #1 god node
# Action: scope any WaveManager change via this cluster before editing
```

```bash
# Find over-coupled system by concept
graphify query "Enemy archetype behaviour composition"
# Surfaces Community 12 (Enemy AI FSM, 21 nodes, cohesion 0.16)
```

### 2. Blast-radius scoping before a change

```bash
# Path between two concepts = change impact chain
graphify path "Enemy" "WaveManager"
# Returns: Enemy <--references-- Verify: Enemy Spawning + Navmesh --references--> WaveManager

graphify path "HealthComponent" "ArenaHud"
# Surfaces intermediary nodes = files that need review
```

### 3. Community / coupling audit

```bash
# Low-cohesion communities = split candidates
# From GRAPH_REPORT.md: Community 0 "Project Conventions & Skills" cohesion=0.06 (52 nodes) — too big
graphify query "project conventions skills quality"
# Lists all 52 nodes; identify which .gd files belong together vs scattered
```

### 4. Signal-wiring tracing (what we CAN do)

```bash
# Signal declarations ARE nodes; trace downstream
graphify query "Npc.died signal"
# Returns connections to WaveManager, ArenaHud etc. via .md edges

graphify query "ammo_changed signal"
# Traces BulletAmmoTracker → WeaponController → ArenaHud chain
```

### 5. Dead/orphan detection (partial)

```bash
# 162 isolated nodes reported in graph; query them
graphify query "isolated orphan unused"
# Returns concept-layer orphans; cross-ref with actual .gd to find dead code
# Better: check GRAPH_REPORT.md "Knowledge Gaps" section directly
```

### 6. Modularization targets (two-job scripts)

```bash
# High edge-count nodes in GRAPH_REPORT.md god-nodes list are the targets:
# WaveManager (13 edges), Enemy base (12 edges), CastData (10 edges)
graphify query "WaveManager spawn wave reset"
# Cluster shows: spawn logic, level progression, health, arena builder all coupled
# → WaveManager is a split candidate (spawn + reset + wave-counter = 3 jobs)
```

---

## Agent Workflow

### Pre-change: pick + scope

1. `cat graphify-out/GRAPH_REPORT.md` — identify god nodes + low-cohesion communities
2. `graphify query "<class or concept>"` — BFS cluster = blast radius
3. `graphify path "<A>" "<B>"` — confirm change chain between two subsystems

### During: refactor guidance

4. Load `godot-refactor` skill; use cluster from step 2 as the file set to read
5. `graphify query "<signal name>"` — find all .md-documented consumers of a signal before changing its arity

### Post-change: verify coupling dropped

6. `graphify update .` — re-extracts .gd symbols (no API cost, LLM-free)
7. Re-run `graphify query "<refactored class>"` — BFS count should shrink
8. Check GRAPH_REPORT.md god-nodes list; formerly 13-edge node should drop

### Integration with code-reviewer

- Before L1 review: agent runs `graphify path "<changed file concept>" "<dependent concept>"`
  and pastes the path into the code-reviewer prompt as "known blast radius"
- code-reviewer then checks signal arity at each hop

---

## Godot-Specific Caveats

| Static .gd gap              | What graphify misses                                          | Workaround                               |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| `preload("res://...")` deps | No import graph → can't detect circular preloads              | `grep -r "preload(" entities/`           |
| `@onready var x = $Node`    | No scene-path binding → can't verify node exists              | `tools/validate.sh` (L0 load check)      |
| `signal` emit sites         | Declared signals ARE nodes; `.emit()` call sites are not      | smoke tests (L2) assert signal fires     |
| `extends` inheritance       | Not in edge graph                                             | grep `extends ClassName` or read file    |
| `.tscn` scene-graph edges   | graphify reads .tscn as text; no structured node-tree parsing | manual scene read or `$GODOT --headless` |
| Runtime `connect()`         | Dynamic wiring invisible to static graph                      | L2 smoke tests only path                 |

**Critical**: cross-.gd coupling analysis (preload cycles, fan-in/out per file) requires a
tree-sitter-gdscript extractor — not currently available. The .md semantic graph is strong
for architecture-level reasoning; file-level coupling needs grep or a dedicated extractor.

---

## Interface

```
graphify query "<concept or class name>"   # BFS cluster, depth=2
graphify path "<A>" "<B>"                  # shortest path + intermediaries
graphify explain "<concept>"               # focused single-node context
graphify update <project-root>             # re-extract .gd symbols (no LLM)
```

Outputs to stdout. Artifacts in `graphify-out/` (graph.json, GRAPH_REPORT.md).

## Discovery

`tools/CAPABILITIES.md` entry (if registered):

```
graphify — semantic codebase graph (design/.md + .gd symbol nodes); query/path/explain for architecture reasoning; update re-syncs .gd symbols without LLM cost
```

## Home

External CLI (`graphify`). Graph lives at `graphify-out/`. No file under `tools/` required.

## Build

No build needed — graphify already installed, graph exists. Recommendation: add one-liner to
`tools/CAPABILITIES.md` so agents discover it. Run `graphify update .` after any significant
.gd restructure (not per-commit — after module extractions).

## Consumers

- `godot-refactor` skill: query god nodes + path before scoping a split
- `code-reviewer` agent: path blast-radius before L1 review
- `godot-runtime-smoke` skill: confirm signal node exists in graph before writing smoke test
