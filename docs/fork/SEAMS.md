# Seams — our conflict-surface contract with upstream

Xenodot Twin is a **fork of `arthur0n/xenodot-forge`**, focused down to ONE domain: the
digital-twin viewer. We track upstream closely and pull its curated framework wins in via
`/sync-upstream` (see [`SYNC.md`](SYNC.md)), but we ship a **different product** — no game domain.

This file is the audited contract that keeps us mergeable: the identity files that stay OURS, the
few upstream-owned files we edit (behavioral seams), and — most important — the **exhaustive list of
intentional divergences the merge re-introduces every sync and we re-drop by design** (lineage is
preserved, so each merge brings the game payload back).

> **No rebrand codemod.** Unlike a white-label fork, we keep the `xenodot` / `xenodot-twin` plugin
> names and the `xenodot:` / `xenodot-twin:` capability namespaces **verbatim** — cross-plugin
> frontmatter (`plugin-twin/**` composes base skills as `xenodot:<name>`) depends on them, and the
> base plugin literally IS the upstream `xenodot` plugin, trimmed. Text identity (package/marketplace
> names, README, FEATURES) is small and diverges by hand; there is nothing to codemod.

## The one rule the analysis serves

On every conflict during a sync merge:

- **Game payload → drop it.** Gameplay agents/skills, the game orchestrator, the game starter, game
  roadmap docs, game art, game library records. These have no value for a viewer product. The full
  re-drop list is below.
- **Engine / twin / framework wins → take them.** Spine refactors, new CORE skills/hooks/MCP-tools,
  test-suite additions, security/self-improvement gates, Hermes/codex/graphify improvements, and
  anything under `plugin-twin/`, `starter-viewer/`, `ui/server/features/twin/`,
  `ui/orchestrator-viewer.md`, `docs/tutorials/` — these are the point of the sync.
- **Identity → OURS, always.** `package.json` name/description, `.claude-plugin/marketplace.json`,
  `plugin/.claude-plugin/plugin.json` description, `README.md`, `FEATURES.md`.
- **Behavioral seams → keep our edit AND fold in upstream's real change** (the short table below).

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/fork/**` — this contract + the sync runbook.
- `.claude/commands/sync-upstream.md` — the analysis-driven down-sync command.
- Everything under `plugin-twin/`, `starter-viewer/`, `ui/server/features/twin/`,
  `ui/orchestrator-viewer.md`, `ui/server/core/session-plugins.js` — these already exist upstream
  (the twin is developed upstream too); we simply keep them whole.

## Identity — resolve as OURS (fully diverged)

| File                                | Our divergence                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | `name` = `xenodot-twin`; twin `description`; `repository.url` → `arthur0n/xenodot-twin`. Keep `arthur0n` lines so provenance stays.                            |
| `.claude-plugin/marketplace.json`   | Twin `name`/`metadata`/`owner`; **lists BOTH plugins** — `xenodot` (`./plugin`) and `xenodot-twin` (`./plugin-twin`). Keep both plugin `name` values verbatim. |
| `plugin/.claude-plugin/plugin.json` | `description` reframed as the engine-generic base. `name` stays `xenodot` (namespace — never rename).                                                          |
| `README.md`                         | **Fully replaced** with the twin front page. Expect conflicts on upstream README edits; resolve by keeping ours.                                               |
| `FEATURES.md`                       | **Fully replaced** with the twin catalog. The `## Agents (N)` section must list exactly the base agents (the pre-commit badge cross-check enforces it).        |

## Upstream files we are allowed to edit (behavioral seams — keep this list SHORT)

Each entry = the smallest change, plus why it can't be additive. On a sync, keep our edit AND fold in
upstream's real behavior change, hunk by hunk.

| File                                                                                                                                             | Our edit                                                                                                                                                                            | Why it can't be additive                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ui/server/core/config.js`                                                                                                                       | `getProjectType()` returns `"viewer"` unconditionally; `PROJECT_TYPES = ["viewer"]`; `ORCHESTRATOR_PROMPT` reads `orchestrator-viewer.md`; `ORCHESTRATOR_VIEWER_PROMPT` aliases it. | The domain resolver + orchestrator prompt are central resolved config; viewer-only collapses the game branch. |
| `ui/server/cli/new.js`                                                                                                                           | Viewer-only: `--game` errors with a pointer to xenodot-forge; default target `../viewer`; always scaffolds `starter-viewer/`; passes `--viewer` to setup.                           | Scaffolding picks the starter + project type; the game path is gone.                                          |
| `ui/server/cli/setup.js`                                                                                                                         | Viewer-only: `--game` errors; `projectType` is always `"viewer"`.                                                                                                                   | Setup writes the project type; game is unreachable.                                                           |
| `ui/server/features/skills/skill-registry.js`                                                                                                    | `BUILDERS = ["godot-dev", "godot-refactor", "godot-visuals", "godot-assets"]` (dropped the gameplay specialists).                                                                   | The `builders` audience token expands to this list; it must name only agents that ship.                       |
| `ui/server/cli/onboarding.check.js`                                                                                                              | Asserts `starter-viewer/` ships and scaffolds/boots a viewer (not `starter/`).                                                                                                      | The clean-install regression must target the shipped starter.                                                 |
| `ui/server/core/session.test.js`                                                                                                                 | Relabeled the `projectType: "game"` case as a generic non-viewer negative test.                                                                                                     | The pure gating fn still accepts any token; the label was game-specific.                                      |
| `plugin/agents/{godot-dev,godot-visuals,godot-assets}.md`                                                                                        | Trimmed game-aesthetic skills from `skills:` frontmatter (pixel-art, foliage, procedural placeholders, gridmap, playthrough-bot, greybox-to-asset, art-style).                      | The projection (`gen-skill-scope`) must match the skills that ship; those skills were dropped.                |
| `plugin/skills/{agent-report,godot-code-rules,godot-verify,godot-hd-material-import,godot-mesh-import-hd,godot-runtime-smoke,graphify}/SKILL.md` | `agents:` audience tag retagged to remove dropped agents (`godot-playtester`, `asset-advisor`, `bug-triage`, gameplay builders).                                                    | An `agents:` token naming a dropped agent trips `gen-skill-scope`; retag to the surviving audience.           |

## Intentional upstream divergences (re-drop on EVERY sync)

The merge re-introduces all of these because lineage is preserved — that's by design. Re-drop each.
After a sync, the deterministic gates below are the tripwire for a missed re-drop.

### 1. Game agents — NOT carried

Delete `plugin/agents/`:

`godot-enemy.md`, `godot-weapons-abilities.md`, `godot-player.md`, `godot-vfx.md`,
`game-designer.md`, `level-designer.md`, `godot-playtester.md`, `art-director.md`,
`asset-advisor.md`, `bug-triage.md`.

Keep the 10 base agents: `godot-dev`, `godot-refactor`, `godot-visuals`, `godot-assets`,
`godot-docs-evangelist`, `addon-researcher`, `skill-researcher`, `cli-researcher`,
`transcript-researcher`, `handoff-summarizer`. (Roster authority: `ui/orchestrator-viewer.md` — the
viewer routes to exactly these.)

### 2. Game skills (30) — NOT carried

Delete `plugin/skills/`:

`godot-3d-pixelation`, `godot-animation-libraries`, `godot-arena-spatial-design`, `godot-art-style`,
`godot-data-driven-composition`, `godot-effect-composition`, `godot-enemy-ai`,
`godot-enemy-ai-headless-smoke`, `godot-enemy-archetype`, `godot-first-person-controller`,
`godot-foliage`, `godot-greybox`, `godot-greybox-to-asset`, `godot-gridmap-level`,
`godot-looping-particle-vfx`, `godot-mesh-import-pixel-art`, `godot-navmesh-pathing-4-6`,
`godot-oneshot-vfx`, `godot-orthographic-follow-camera`, `godot-pixel-lighting`, `godot-playgrade`,
`godot-playthrough-bot`, `godot-procedural-model`, `godot-procedural-texture`, `godot-runtime-arena`,
`godot-shooter-enemy-combat`, `godot-stealth-perception`, `godot-texture-import-pixel-art`,
`godot-travelling-projectile-3d`, `level-design-principles`.

Keep the 17 base skills: `agent-report`, `autonomous-main-goal`, `caveman`, `godot-code-rules`,
`godot-composition`, `godot-docs`, `godot-export-builds`, `godot-hd-material-import`,
`godot-main-scene`, `godot-mesh-import-hd`, `godot-project-conventions`, `godot-runtime-smoke`,
`godot-screen-effects`, `godot-verify`, `graphify`, `research-presenting`, `tasks-mcp`.

> After a new upstream release: any NEW `godot-*` skill/agent that lands is game payload UNLESS the
> viewer orchestrator routes to it or a twin agent composes it. Judge it, drop it if game, and add it
> to this list.

### 3. Game orchestrator — NOT carried

Delete `ui/orchestrator.md` (game routing). Keep `ui/orchestrator-viewer.md`; `config.js`
`ORCHESTRATOR_PROMPT` reads the viewer file (a seam edit above).

### 4. Game starter — NOT carried

Delete `starter/`. Keep `starter-viewer/`.

### 5. Game roadmap docs — NOT carried

Delete `docs/roadmap/first_game.md`, `docs/roadmap/fps_poc.md`, `docs/roadmap/itch_demo.md`. Keep
`docs/tutorials/`, `docs/process/`, `docs/handoff/`, `docs/engines.md`, `docs/self-improvement*.md`.

### 6. Game art — NOT carried

Delete `assets/fps_poc.png`, `assets/VoidInk_style.md`. Keep `assets/logo*.png` (text-neutral
lineage logo).

### 7. Game library records — NOT carried

Delete `plugin/library/addons/` (game addons + jeh3no-salvage FPS scripts), `plugin/library/verdicts/`
(game skill-eval verdicts), `plugin/library/drafts/` (game mesh-import draft), and
`plugin/library/tools/game-observe.md`. Then regenerate indexes: `npm run check:library -- --write`
(or `node ui/server/cli/gen-library-index.js --write`).

Keep the engine-generic records: `plugin/library/README.md`, `findings/godot-resource-registry.md`,
`sources/{asset,model,skill}-sources.md`, and `tools/{feedback,gdscript-linter,graphify-gdscript,
scene-screenshot,tscn-name-clash-lint,verify-render-action}.md`.

## Gates — the tripwires for a missed re-drop or seam mistake

All must be green after a sync (`npm run validate` bundles the first four):

- `npm run check:skills` — skill-scope: the `agents:` tags ↔ agent `skills:` frontmatter must match,
  and `BUILDERS` must name only shipped agents. Catches a re-introduced game agent/skill or a stale
  audience tag.
- `npm run check:contamination` — the plugin + plugin-twin skills/agents/tools + library records must
  stay domain-agnostic.
- `npm run check:library` — every record carries OKF frontmatter and each kind's index is current.
- `npm run check:structure` + `npm run check` (tsc) + `npm run lint`.
- `npm test` — the node:test suite + reducer + skills checks (session-plugin gating, etc.).
- `npm run badges` — the pre-commit cross-check: `FEATURES.md` `## Agents (N)` must list exactly the
  shipped base agents (no ghosts, none missing).
- `npm run test:onboarding` — the clean-install regression: a fresh `forge new` scaffolds and boots
  a **viewer**.

## Baseline divergence count (v0.2.1 fork point, upstream `37ee71c`)

Dropped: **10 game agents + 30 game skills + 1 game orchestrator + 1 game starter + 3 roadmap docs +
2 art files + 4 game library record groups**. Seam-edited: **8 framework files/dirs**. Identity: **5
files**. Namespaces + `plugin-twin/` kept verbatim.
