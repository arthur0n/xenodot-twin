# <Your game> — game conventions

This repo is the **game**. The AI framework that builds it — agents, `godot-*` skills, the
verify/gen tools, and the design→build→verify pipeline — loads from the **xenodot** Claude Code
plugin (the single source of truth); it is **not** in this repo. Its working files appear here
only as gitignored, generated paths: `tools/` (copied from the plugin) and `library/` (a symlink
to the plugin's knowledge base). Game-specific skills/agents you author live in this repo's
`.claude/` until you promote them to the framework (`npm run promote -- …`).

Record only **this game's** conventions below — keep it thin (decisions here, not in chat). Run the
`godot-project-baseline` skill first to establish the quality gates, folder layout, naming and
input map; then author this game's aesthetics (renderer, window, texture filters, art-style stack)
as a project-local `<game>-game-conventions` skill in `.claude/skills/` — the baseline skill
teaches the pattern.

## Understanding the codebase (graphify)

This game has an optional knowledge graph in `graphify-out/` (gitignored, built by the `graphify`
CLI). For codebase / architecture / "how does X work" questions, query the graph FIRST when
`graphify-out/graph.json` exists — `graphify query "<question>"` (or `path` / `explain`) returns a
scoped subgraph, far smaller than raw grep. Auto-refresh after edits is **opt-in** (AST-only,
free) — enable it with `touch graphify-out/.autoupdate`; otherwise run `graphify update .` after
big changes. No graph yet? `graphify .` builds one (semantic extraction of docs costs tokens).
See the `xenodot:graphify` skill.

## Project conventions

This game's declared genre/style live in its **profile** (`.xenodot/manifest.json` →
`profile`, set at `forge new` / `npm run setup`) — read it via `tools/forge-facts
profile.genre`. The profile decides which `genre-*`/`style-*` skills a session sees.

_(empty — the `godot-project-baseline` skill fills this in on first setup; your project-local
game-conventions skill appends the aesthetic decisions.)_
