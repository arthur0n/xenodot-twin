# <Your twin> — viewer conventions

This repo is a **digital-twin viewer**, not a game. It renders an external 3D model and
live process data on top of it; it has no gameplay, levels, or win state. The AI framework
that builds it — agents, `godot-*`/`twin-*` skills, the verify/gen tools — loads from the
**xenodot** (+ **xenodot-twin**) Claude Code plugins (the single source of truth); it is
**not** in this repo. Its working files appear here only as gitignored, generated paths:
`tools/` (copied from the plugin) and `library/` (a symlink to the plugin's knowledge base).
Twin-specific skills/agents you author live in this repo's `.claude/` until you promote
them to the framework (`npm run promote -- …`).

Record only **this twin's** conventions below — keep it thin (decisions here, not in chat).

## Layout

- `main.tscn` / `main.gd` — the viewer shell: environment, camera rig (Tab toggles
  orbit/fly, Esc exits fly), runtime model loading, placeholder grid when no model is set.
- `core/` — infrastructure: `data_bus.gd` (the DataBus autoload), `camera_rig.gd`.
- `overlay/` — HUD (`overlay.tscn`) + reusable binders (`tag_label_3d.gd`, a Label3D
  pinned to one tag with a green→red value ramp).
- `models/` — GLB models + `<name>_props.json` property sidecars (gitignored; delivered by
  `twin-import`). Models load at **runtime** via GLTFDocument — never imported as assets.
- `viewer.cfg` — per-deployment config: `[viewer] url="ws://..."` (DataBus source) and
  `model="res://models/….glb"` (auto-load on boot). `--model=<path>` / `--screenshot=<png>`
  user args (after `--`) override/extend it.

## DataBus contract

`DataBus` (autoload, `core/data_bus.gd`) is the single ingress for live data. One JSON
object per WebSocket packet: `{"tag", "value", "seq", "sent_ms"}`. It emits
`tag_update(tag: String, value: float, seq: int, latency_ms: float)` and
`connection_changed(up: bool)`; consumers only ever connect to these two signals — nothing
else in the project touches sockets. Access it by PATH, typed via a preload const
(`const DataBusScript := preload("res://core/data_bus.gd")` +
`@onready var _data_bus: DataBusScript = get_node("/root/DataBus")`), never by the
`DataBus` global — the per-file `--check-only` gate does not inject autoload names
(godot-code-rules). It reconnects forever (fresh peer per attempt, 1 s
delay, quiet while the source is down) and exposes `stats()` (frames/drops/reconnects/
latency) for the overlay and verification bots.

## Verify

`xenodot:godot-verify` is the deterministic gate (format → lint → strict parse → scenes →
smoke), and `xenodot-twin:twin-verify` layers the twin checks (model join, DataBus liveness)
on top. The strict warnings-as-errors block in `project.godot` is the contract — never
weaken it.

## Project conventions

_(empty — the `godot-project-conventions` skill fills this in on first setup.)_
