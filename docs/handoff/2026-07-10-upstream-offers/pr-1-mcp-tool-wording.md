## What

Reword `game → project` in the two MCP tool descriptions that the main agent reads every
session the tool registers:

- **`ui/server/mcp-tools/hermes-tool.js`** — the Hermes dispatch instructions: `"the
caller's game or codebase"` → `"the caller's project or codebase"`.
- **`ui/server/mcp-tools/promote-tool.js`** — the `promote` tool `description` and three
  zod `.describe()` strings: `game-local` → `project-local`, `EVERY game gets it` → `EVERY
project gets it`, `not specific to this game` → `not specific to this project`, `beyond
this game` → `beyond this project`.

2 files changed, 6 insertions(+), 6 deletions(-).

## Why

These are inline string constants injected into the agent's prompt — generic capability
descriptions of what the promote/hermes tools do. The word "game" adds no information: the
promotion mechanism (local capability → framework plugin) and the "never edit the caller's
tree" contract are identical for any downstream project. "project" is the accurate generic
term and reads correctly for the game product too.

Costs nothing: **behavior is byte-identical** — prompt text only, no logic touched. The
promote `place`/name value tokens and the server API contract are untouched.

## Diff summary

```
ui/server/mcp-tools/hermes-tool.js  | 2 +-
ui/server/mcp-tools/promote-tool.js | 10 +++++-----
```

- `hermes-tool.js:89` — one word in the "you NEVER edit the caller's …" sentence.
- `promote-tool.js:17,18,20` (description) + `:28` (name `.describe`) + `:37` (reason
  `.describe`).

Verified: `node --check` passes on both files; `git diff upstream/main` shows only the
lines above.
