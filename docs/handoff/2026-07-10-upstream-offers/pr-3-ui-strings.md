## What

Reword `game → project` in the user-facing web-UI chrome strings (no logic, no value
tokens):

- **`ui/client/features/promotions/promotions.js`** — the `STATUS_LABEL` for approved
  promotions: `"approved · ready to forge"` → `"approved · ready to promote"` (matches the
  board's own "promoting"/"promoted" vocabulary).
- **`ui/client/features/project/project-tree.js`** — the empty-project banner + the two
  shown setup commands: `"Point the framework at your game …"` → `"… at your project …"`,
  and `/path/to/your/game` → `/path/to/your/project` (setup + one-off start lines).
- **`ui/client/features/assets/get-assets.js`** — the "Place" dropdown **option label**
  `"Game (assets/)"` → `"Project (assets/)"` and its adjacent JSDoc (`game's own assets/`,
  `game tree` → `project`). The `place` **value** token (`game.value = "game"`) is a server
  API contract and is left unchanged.
- **`ui/lib/types.js`** — the `Promotion` typedef JSDoc: section header `game-local →
framework plugin` → `project-local → …`, `the capability's game-local name` →
  `project-local name`, `beyond this game` → `beyond this project`.

4 files changed, 10 insertions(+), 10 deletions(-).

## Why

These are the strings a user actually sees (a status label, an onboarding banner, a
dropdown option) plus the JSDoc describing them. "game" is incidental domain flavor — "your
project", "Project (assets/)", "project-local" describe the same UI and the same promotion
concept, and read correctly for the game product too. The one place "game" is load-bearing
— the `place` value the client sends to the server — is deliberately kept.

Costs nothing: **rendered output and behavior are identical** — only display text and
comments changed; the API value token stays `"game"`.

## Diff summary

```
ui/client/features/assets/get-assets.js     | 6 +++---
ui/client/features/project/project-tree.js  | 6 +++---
ui/client/features/promotions/promotions.js | 2 +-
ui/lib/types.js                             | 6 +++---
```

Verified: all four files pass `node --check`; `git diff upstream/main` shows only label /
banner / JSDoc text (and confirms `game.value = "game"` is untouched).
