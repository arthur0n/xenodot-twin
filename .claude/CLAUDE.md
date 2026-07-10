# Xenodot Forge — framework spine rules

Rules for working **on the framework itself** (the Node/TS web UI and tooling under
`ui/`). The game's own rules live in the game project, not here — see `plugin/`, the
**xenodot** Claude Code plugin the framework loads into every game session.

## Always

- Prefix shell commands with `rtk` (a PreToolUse hook enforces it; see `.claude/settings.json`).
- Plain JS + JSDoc only — no `.ts` files. Types are checked via tsconfig `checkJs`.
- Node/CLI scripts live in `ui/server/` so eslint's node group + tsconfig type-check them.

## Before committing

- `npm run validate` (tsc + eslint, zero warnings) must pass.
- `npx prettier --write` keeps formatting clean (lint-staged also runs it on commit).

## Layout

- `ui/server/` — Node server + CLI scripts, grouped by domain: `core/` (+ `core/http/`),
  `integrations/{hermes,codex}/`, `features/{tasks,assets,levels,promotions,transcripts}/`,
  `mcp-tools/` (the in-process `makeXTool` SDK tools), and `cli/` (`setup`, `new`, `promote`,
  `doctor`, `materialize`, `update-badges`, `release-*`). New files go in the matching domain.
- `ui/client/` — browser modules, grouped by domain: `core/` (state, transport, dom/render
  helpers, `main.js` entry) and `features/{chat,activity,tasks,approvals,agents,settings,
sessions,promotions,project,level-editor,assets}/`. `ui/lib/` — shared JSDoc typedefs + helpers.
- `plugin/` — the **xenodot** Claude Code plugin: the framework's agents, skills, tools, hooks
  and knowledge base (`library/`). ONE plugin — the engine-generic base and the digital-twin
  domain (the `twin-*` prefix) ship together. The single source of truth, loaded into every
  session via the SDK `plugins` option (`session.js`) so projects need no copies; terminal use
  installs it once (`.claude-plugin/marketplace.json`). Capabilities namespace as `xenodot:<name>`.
- `starter-viewer/` — the minimal Godot viewer project + thin templates `forge new` scaffolds
  into a new digital-twin viewer.
- Never put project-specific files in the framework; it points at an external viewer (default
  `../viewer`), reads it in place, and the viewer stays pure project.
