## What

Reword `game → project` in the three prompt blocks that are appended verbatim to the Hive
system prompt (`session.js`: `HERMES_BLOCK` / `DOCS_BLOCK` / `CODEX_BLOCK`):

- **`ui/hermes-block.md`** — `"It investigates; it never edits the game or framework."` →
  `"… it never edits the project or framework."`
- **`ui/docs-block.md`** — `"it never edits the game, runs the engine, or verifies a
scene"` → `"it never edits the project, runs the engine, …"`
- **`ui/codex-block.md`** — `"your cwd is the game"` → `"your cwd is the project"`, and
  `"Before a game-local skill/agent is promoted"` → `"Before a project-local skill/agent is
promoted"`.

3 files changed, 4 insertions(+), 4 deletions(-).

## Why

Each block is a fixed prose paragraph the orchestrator reads to know what the coworker
does. The "game" framing is incidental — "it never edits the project", "your cwd is the
project", "a project-local skill" describe the exact same tool contract and read correctly
for any downstream project (including the game). Neutralizing removes the only
domain-specific word in otherwise generic instructions.

Costs nothing: **dispatch / routing / limits text is byte-identical** — only the single
domain noun changed in each sentence.

## Diff summary

```
ui/codex-block.md  | 4 ++--
ui/docs-block.md   | 2 +-
ui/hermes-block.md | 2 +-
```

Verified: `git diff upstream/main` shows only the four reworded sentences; no structural or
routing changes.
