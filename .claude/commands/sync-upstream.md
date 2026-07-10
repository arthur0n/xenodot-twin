---
description: Pull curated framework updates DOWN from the source (arthur0n/xenodot-forge, "xenodot") into THIS xenodot-twin fork. Human-gated and analysis-driven — review the incoming commits, merge on a throwaway sync branch, resolve each conflict by judgment (identity → OURS; game payload → drop; engine/twin/framework win → take; seam files → keep our seam + upstream behavior), re-drop the SEAMS.md divergences, then run the gates + validate. Never pushes, never touches the trunk.
argument-hint: "[--from <remote>] [--branch <branch>] [--no-test]"
allowed-tools: Bash, Read, Edit
model: opus
---

# Sync upstream — pull the source's curated wins into our xenodot-twin fork

This is the **down** direction: the source (`arthur0n/xenodot-forge`, "xenodot") moves all the time,
and this repo — the digital-twin **xenodot-twin** product — rides its curated framework parts while
shipping a **different product** (one domain: the viewer; **no game payload**). The mechanical parts
are deterministic (fetch, branch, the gates, validate) — but the **merge is analysis, not a recipe**:
you decide, conflict by conflict, what is a framework/twin win we take and what is game payload we
drop. See `docs/fork/SYNC.md` (the runbook) and `docs/fork/SEAMS.md` (the conflict-surface contract +
the exhaustive re-drop checklist).

> Direction check: this is `xenodot-forge → xenodot-twin`. We only ever FETCH from the source; our
> one publish target is `origin` (`arthur0n/xenodot-twin`). Never push to a xenodot-forge repo.

## The one rule the analysis serves

We track upstream closely but ship a viewer-only product. So on every conflict:

- **Game payload → drop it.** Gameplay agents/skills, the game orchestrator, the game starter, game
  roadmap docs, game art, game library records. The full re-drop list is `SEAMS.md` → "Intentional
  upstream divergences." That list is the step-5 checklist — the merge re-adds those files by design
  (lineage is preserved), so each sync re-drops them.
- **Engine / twin / framework wins → take them,** plus our behavioral seam edits.
- **Identity → OURS, always.** `package.json` name/description, `.claude-plugin/marketplace.json`,
  `plugin/.claude-plugin/plugin.json` description, `README.md`, `FEATURES.md`.
- **No rebrand codemod.** We keep the `xenodot` plugin name + `xenodot:` namespace verbatim (only the
  GitHub repo is `xenodot-twin`) — the fork ships ONE plugin, with the `twin-*` capabilities in
  `plugin/` beside the base. Identifiers never need re-flipping; there is nothing to codemod.

## Arguments

Parse `$ARGUMENTS`: `--from <remote>` (the source remote, default `upstream`), `--branch <branch>`
(default `main`), `--no-test` (skip the slow `npm run test:onboarding` gate — faster, less safe;
still runs validate). Let `REF = <remote>/<branch>`.

## Steps

1. **Preflight (deterministic — stop if it fails).** Confirm a clean tree
   (`git status --porcelain` empty; if not, stop and tell the user to commit/stash). Confirm you're on
   the trunk (`git branch --show-current` = `main`); if not, stop. Resolve the remote:
   `git remote get-url <remote>`. It MUST be a **`xenodot-forge`** repo — the source we pull FROM. If
   it resolves to `arthur0n/xenodot-twin` (our own publish target / `origin`), stop: that's the wrong
   direction. If the remote is missing, tell the user to add it
   (`git remote add upstream https://github.com/arthur0n/xenodot-forge.git`) and stop.

2. **Fetch + review the incoming work (ANALYZE — a checkpoint, not a rubber stamp).**
   `git fetch <remote> <branch>`, then `git log --oneline --reverse main..$REF` and
   `git diff --stat main..$REF | tail -40`. If empty → already current, say so and stop. Otherwise
   **read** the commit list and triage what's landing into three buckets, and say so to the human
   before touching anything:
   - **Framework / twin wins we want** — spine refactors, new CORE skills/hooks/MCP-tools, test-suite
     additions, security/self-improvement gates, Hermes/codex/graphify improvements, and the fork's
     twin surface (the `twin-*` skills/agents in `plugin/`, `starter-viewer/`,
     `ui/server/features/twin/`, `ui/orchestrator-viewer.md`, `docs/tutorials/`). These are the point
     of the sync.
   - **Game payload we'll drop** — gameplay `godot-*` skills/agents, the game orchestrator, `starter/`,
     game roadmap docs, game library records. Cross-check against `SEAMS.md`.
   - **Identity hunks we resolve as OURS** — `package.json`, `.claude-plugin/marketplace.json`,
     `plugin/.claude-plugin/plugin.json`, `README.md`, `FEATURES.md`.
     If a large release is landing (dozens of commits), say so — the merge below is a real analysis
     session. Name anything that would regress our product (a re-game-ing of the default, a new game
     skill the viewer doesn't use).

3. **Branch — never touch the trunk.** `git switch -C sync-upstream-<branch>`. All work happens here;
   `main` is only advanced by the human after they review this branch.

4. **Merge, then resolve each conflict by JUDGMENT (the core analysis step).**
   `git merge --no-ff $REF`. List the unmerged files (`git diff --name-only --diff-filter=U`) and
   decide each — never blanket `-X`:
   - **Identity** (`package.json`, `marketplace.json`, base `plugin.json`, `README.md`, `FEATURES.md`)
     → **OURS**: `git checkout --ours -- <file>` then `git add <file>`. Take a real structural change
     by hand only if non-cosmetic; the twin identity always wins. (`FEATURES.md`'s `## Agents (N)`
     section must still list exactly the shipped base agents — the badge cross-check enforces it.)
   - **Behavioral seam files** (`SEAMS.md` → "Upstream files we are allowed to edit":
     `ui/server/core/config.js`, `ui/server/cli/{new,setup}.js`,
     `ui/server/features/skills/skill-registry.js` (`BUILDERS`), `ui/server/cli/onboarding.check.js`,
     `ui/server/core/session.test.js`, the three trimmed builder agents, the retagged skills) →
     **keep our seam edit AND fold in upstream's real behavior change**, hunk by hunk. Our viewer-only
     resolver stays; upstream's new logic lands around it.
   - **Everything else** → take upstream (framework/twin win). Then finish the merge: `git commit`
     (no args — keep the merge message). Show the human the conflict list + your per-file decision.

5. **Re-drop the intentional divergences (SEAMS.md checklist — the merge re-added them).**
   Per `SEAMS.md` → "Intentional upstream divergences", delete:
   - **Game agents** — `plugin/agents/{godot-enemy,godot-weapons-abilities,godot-player,godot-vfx,
game-designer,level-designer,godot-playtester,art-director,asset-advisor,bug-triage}.md`.
   - **Game skills (30)** — the `plugin/skills/godot-*` gameplay/aesthetic/level set + `godot-playgrade`
     - `godot-playthrough-bot` + `level-design-principles` (exact list in `SEAMS.md` §2).
   - **Game orchestrator** — `ui/orchestrator.md` (keep `orchestrator-viewer.md`).
   - **Game starter** — `starter/` (keep `starter-viewer/`).
   - **Game roadmap docs** — `docs/roadmap/{first_game,fps_poc,itch_demo}.md`.
   - **Game art** — `assets/{fps_poc.png,VoidInk_style.md}` (keep `assets/logo*.png`).
   - **Game library records** — `plugin/library/{addons,verdicts,drafts}/` + `tools/game-observe.md`.
     Then regenerate: `node ui/server/cli/gen-library-index.js --write` and `npm run badges`. Watch for
     **new** game-only content this release adds (grep the new `godot-*` files); drop it too, then note
     it so `SEAMS.md`'s list can be extended. Commit the re-drop.

6. **Fix seam fallout (deterministic).** If the merge changed builder agents or skill audiences, re-run
   `node ui/server/cli/gen-skill-scope.js --write` to see the projected `skills:` blocks and sync each
   agent's frontmatter; confirm `BUILDERS` in `skill-registry.js` names only shipped agents.
   `git commit -am "sync: re-fit seams"`.

7. **Gates (deterministic — run them, read the result, don't eyeball it).**
   `npm run validate` (tsc + eslint zero-warnings + structure + skill-scope + contamination + library)
   — it exits non-zero and prints offenders if game payload or a stale audience leaked into the spine.
   If it fails, that's a resolution or re-drop mistake from steps 4–6 — fix those files and re-run.
   Never route around it. Then `npm test` (node:test suite + reducer + skills) and `npm run badges`.

8. **Onboarding regression (unless `--no-test`).** `npm run test:onboarding` — the clean-install gate
   that a fresh `forge new` scaffolds and boots a **viewer**. Fix what the merge broke before handoff.

9. **Report + hand off (STOP — never push, never fast-forward the trunk).** Summarize: how many commits
   pulled + the release version, which wins we took, which divergences we re-dropped, which identity /
   seam conflicts and how each resolved, gates = clean, validate + tests = green. Tell the human the
   `sync-upstream-<branch>` branch is ready and THEY advance the trunk + publish:
   ```
   git switch main && git merge --ff-only sync-upstream-<branch>
   git push origin main
   ```
   This command's authority ends at the sync branch.

## Never

- **Never push** and never fast-forward/merge into `main` — your output is the sync branch for the
  human to review. Publishing (`git push origin main`) is theirs.
- **Never push to a xenodot-forge repo** — it's the fetch-only source.
- **Never blanket `-X theirs`/`-X ours`.** Resolve conflicts file-by-file with visible reasoning —
  that analysis is the whole point of using a command here.
- **Never take game payload.** Re-drop the `SEAMS.md` divergences every sync; the gates (step 7–8) are
  the tripwire — never silence them.
- **Never rename the plugin or namespace.** The fork ships ONE `xenodot` plugin; its `twin-*`
  capabilities live in `plugin/` beside the base and compose it as `xenodot:<name>`. A rename breaks
  those references. There is no rebrand codemod.
