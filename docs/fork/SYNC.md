# Upstream sync — pull framework changes in, never push back

Xenodot Twin is a **fork of `arthur0n/xenodot-forge`**. The relationship is **one-way**: we fetch
upstream's curated framework improvements and merge them into our viewer-focused product; we never
push to xenodot-forge. Our one publish target is `origin` (`arthur0n/xenodot-twin`).

Direction: `xenodot-forge → xenodot-twin` (**down** into the fork). This is the opposite of the
white-label case — we KEEP the engine + twin payload and DROP the game payload. The conflict rules
are in [`SEAMS.md`](SEAMS.md); this is the runbook.

## Remotes

```
origin    https://github.com/arthur0n/xenodot-twin.git    OUR repo — the publish target
upstream  https://github.com/arthur0n/xenodot-forge.git   the forked source — FETCH ONLY
```

If `upstream` is missing: `git remote add upstream https://github.com/arthur0n/xenodot-forge.git`.

## Routine sync

Drive it with the **`/sync-upstream`** command (analysis-driven — the merge is judgment, not a
recipe). It fetches upstream, shows you the incoming commits, merges on a throwaway
`sync-upstream-main` branch, resolves each conflict by rule (identity → OURS; game payload → drop;
engine/twin/framework → take; seam files → keep our edit + upstream behavior), re-drops the
[`SEAMS.md`](SEAMS.md) divergences, runs the gates, and STOPS. It never pushes and never touches the
trunk.

```
/sync-upstream                 # from = upstream, branch = main; --no-test to skip onboarding
```

Then review the sync branch and advance + publish yourself:

```bash
git switch main && git merge --ff-only sync-upstream-main
git push origin main
```

## Under the hood, in order

1. `git fetch upstream main`; review `main..upstream/main` (commits + diffstat). Empty → current.
2. `git switch -C sync-upstream-main` — never work on the trunk.
3. `git merge --no-ff upstream/main` — resolve each conflict file-by-file (never blanket `-X`):
   identity → OURS; the SEAMS seam files → keep our edit + fold upstream's real change; everything
   else → take upstream.
4. Re-drop the [`SEAMS.md`](SEAMS.md) "Intentional upstream divergences" (the merge re-added them):
   game agents, game skills, `ui/orchestrator.md`, `starter/`, game roadmap docs, game art, game
   library records. Then regenerate library indexes (`node ui/server/cli/gen-library-index.js
--write`) and the badges (`npm run badges`).
5. Fix any seam fallout: `BUILDERS`, the retagged skill audiences, the trimmed builder frontmatter —
   re-run `gen-skill-scope.js --write` to see the projected `skills:` blocks and sync them.
6. Gates (all green): `npm run validate` (tsc + lint + structure + skills + contamination + library),
   `npm test`, `npm run badges`, and unless `--no-test`, `npm run test:onboarding`.

## Conflicts

A conflict appears where upstream edited a line we also changed — a seam file in
[`SEAMS.md`](SEAMS.md), or an identity file. There is **no rebrand codemod**: we keep the `xenodot`
plugin name and the `xenodot:` namespace verbatim (only the GitHub repo is `xenodot-twin`), so
identifiers never need re-flipping. Resolve to keep our version PLUS upstream's real behavior change,
then let the gates catch anything left over.

## Never

- **Never push to xenodot-forge** — it's fetch-only. Publishing goes to `origin` (xenodot-twin).
- **Never blanket `-X theirs`/`-X ours`** — resolve conflicts file-by-file with visible reasoning.
- **Never carry the game payload** — re-drop the SEAMS divergences every sync; `check:skills` +
  `check:contamination` + `test:onboarding` are the tripwires.
- **Never rename the plugin or namespace** — the fork ships ONE `xenodot` plugin; its `twin-*`
  capabilities live in `plugin/` beside the base and compose it as `xenodot:<name>`. A rename breaks
  those references.
