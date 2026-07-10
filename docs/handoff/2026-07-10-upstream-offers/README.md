# Upstream PR offers — open item #9 (neutral wording)

**Status: PREPARED, NOT SENT.** Three local branches sit off `upstream/main`, each a
minimal `game → project` wording change. Nothing has been pushed anywhere — no push to
`upstream`, no push of these branches to `origin`, no `gh pr create`. The human decides
whether to open them.

## Why offer these upstream

Every candidate is a **generic prose/JSDoc/label string** that happens to say "game". The
word carries no information even for the game product — a promote-tool description, a Hive
prompt block, or a "Place: Project (assets/)" dropdown reads identically whether the
downstream project is a game or a twin. Neutralizing it:

- costs upstream **nothing** (behavior/visual output byte-identical),
- makes the strings correct for **any** Xenodot-family project, and
- **shrinks this fork's sync seam** — every string upstream neutralizes is one row we
  delete from `docs/fork/SEAMS.md` and one hunk the next `/sync-upstream` merge stops
  re-introducing.

These are exactly the SEAMS rows flagged **"Upstream candidate — neutral wording, offer as
PR."**

## Prep facts

- `git fetch upstream` was run (read-only). Merge base is `e250d11`; `upstream/main` is at
  `64e7917`. All 9 candidate files **still exist upstream and still carry the exact game
  wording** — every offer applies cleanly against `upstream/main`.
- Branches were cut **off `upstream/main` directly** and edited in place (NOT cherry-picks
  of our commits) so no twin refactor rides along. In particular `hermes-tool.js` on our
  side also carries the `hermes-runs.js` extraction, which upstream does **not** have — the
  offer branch contains **only** the one-line wording change, none of that refactor.
- Committed with `--no-verify` on purpose: the twin repo's pre-commit hook runs
  prettier/badges/ledger, which would add fork-governance noise to a diff that must be
  exactly the wording change. Upstream runs its own CI.
- All six JS files pass `node --check` on their branch. The `.md` blocks are prose.

## Proposed grouping — 3 PRs (one per surface/audience)

| PR  | Branch                           | Files                                                                                                                                                     | Diffstat         |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | `offer/neutral-mcp-tool-wording` | `ui/server/mcp-tools/hermes-tool.js`, `ui/server/mcp-tools/promote-tool.js`                                                                               | 2 files, +6 −6   |
| 2   | `offer/neutral-prompt-blocks`    | `ui/hermes-block.md`, `ui/docs-block.md`, `ui/codex-block.md`                                                                                             | 3 files, +4 −4   |
| 3   | `offer/neutral-ui-strings`       | `ui/client/features/promotions/promotions.js`, `ui/client/features/project/project-tree.js`, `ui/client/features/assets/get-assets.js`, `ui/lib/types.js` | 4 files, +10 −10 |

Grouping is by **surface**: server-side MCP tool descriptions / Hive system-prompt blocks /
user-facing web-UI client strings. Each is one coherent reviewable theme; three small PRs
beat nine one-liners and beat one grab-bag. See per-PR files:
[`pr-1-mcp-tool-wording.md`](pr-1-mcp-tool-wording.md),
[`pr-2-prompt-blocks.md`](pr-2-prompt-blocks.md),
[`pr-3-ui-strings.md`](pr-3-ui-strings.md).

## Viability table (all 9 candidates VIABLE)

| File                                          | Upstream state @ `64e7917`                                          | Viable? | Branch                           |
| --------------------------------------------- | ------------------------------------------------------------------- | ------- | -------------------------------- |
| `ui/server/mcp-tools/hermes-tool.js`          | exists; still `"the caller's game or codebase"`                     | ✅      | `offer/neutral-mcp-tool-wording` |
| `ui/server/mcp-tools/promote-tool.js`         | exists; still `game-local` / `EVERY game` / `this game` ×5          | ✅      | `offer/neutral-mcp-tool-wording` |
| `ui/hermes-block.md`                          | exists; still `never edits the game or framework`                   | ✅      | `offer/neutral-prompt-blocks`    |
| `ui/docs-block.md`                            | exists; still `never edits the game, runs the engine`               | ✅      | `offer/neutral-prompt-blocks`    |
| `ui/codex-block.md`                           | exists; still `your cwd is the game` + `a game-local skill/agent`   | ✅      | `offer/neutral-prompt-blocks`    |
| `ui/client/features/promotions/promotions.js` | exists; still `approved · ready to forge`                           | ✅      | `offer/neutral-ui-strings`       |
| `ui/client/features/project/project-tree.js`  | exists; still `your game` + `/path/to/your/game` ×2                 | ✅      | `offer/neutral-ui-strings`       |
| `ui/client/features/assets/get-assets.js`     | exists; still `Game (assets/)` + `game's own assets/` + `game tree` | ✅      | `offer/neutral-ui-strings`       |
| `ui/lib/types.js`                             | exists; still `game-local` + `beyond this game`                     | ✅      | `offer/neutral-ui-strings`       |

**No non-viable candidates.** Upstream had not diverged on any of these strings, none was
already neutral upstream, and none entangles fork-only code (the branches are built off
upstream so fork-only refactors are structurally excluded).

### Deliberately NOT offered (recorded so nobody re-litigates)

The SEAMS table lists more `game → project`/de-brand edits than these 9; the rest are
**identity or fork-only** and must never go upstream:

- `ui/index.html`, `ui/agent-ui.css` (product name / theme identity — OURS), the two
  persona `brief` strings and `hermes-soul.md` (twin-branded / machine-global identity),
  and `ui/server/mcp-tools/ui-server.js` (registers the fork-only analyze tool). These are
  NOT wording-neutral offers; they are the fork's identity/feature divergences.
- Item #11's `get-assets.js` / `draw-level.js` dispatch-to-dropped-agents issue is a
  **functional rewire**, not a wording change — out of scope here (the `get-assets.js`
  offer above touches only the JSDoc + the visible option label, never the dispatch).

## Human step to open each PR

Nothing below has been run. For each branch (repeat for the other two):

```sh
cd /Users/arthurnunes/Library/MRHEWBUC-LOCAL/xenodot-twin

# PR 1
git push upstream offer/neutral-mcp-tool-wording
gh pr create --repo arthur0n/xenodot-forge \
  --base main --head offer/neutral-mcp-tool-wording \
  --title "refactor(mcp-tools): neutral 'project' wording in hermes/promote tool descriptions" \
  --body-file docs/handoff/2026-07-10-upstream-offers/pr-1-mcp-tool-wording.md

# PR 2
git push upstream offer/neutral-prompt-blocks
gh pr create --repo arthur0n/xenodot-forge \
  --base main --head offer/neutral-prompt-blocks \
  --title "refactor(prompts): neutral 'project' wording in the three Hive prompt blocks" \
  --body-file docs/handoff/2026-07-10-upstream-offers/pr-2-prompt-blocks.md

# PR 3
git push upstream offer/neutral-ui-strings
gh pr create --repo arthur0n/xenodot-forge \
  --base main --head offer/neutral-ui-strings \
  --title "refactor(ui): neutral 'project' wording in web-UI chrome strings" \
  --body-file docs/handoff/2026-07-10-upstream-offers/pr-3-ui-strings.md
```

> `gh pr create --head <branch>` pushes to a fork of the base repo by default. Because
> `upstream` here is the base repo itself (`arthur0n/xenodot-forge`) and you own it, the
> explicit `git push upstream <branch>` first puts the branch on the base repo so
> `--head offer/...` resolves without a cross-fork owner prefix. If you'd rather PR from a
> personal fork, push there instead and use `--head <you>:offer/...`.
>
> After merge, drop the corresponding rows from `docs/fork/SEAMS.md` (the "Upstream
> candidate" flags) so the sync seam shrinks — that is the whole point of the offer.
