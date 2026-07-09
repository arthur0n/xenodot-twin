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

## The twin domain is now FORK-OWNED (upstream `e250d11`, 2026-07-08)

Upstream commit `e250d11` ("the twin domain moves to its exclusive fork") **removed the entire twin
domain from `arthur0n/xenodot-forge`** — 79 files: all of `plugin-twin/`, `starter-viewer/`,
`ui/orchestrator-viewer.md`, `ui/server/features/twin/`, `docs/tutorials/digital-twin.md`,
`ui/server/cli/materialize.test.js`, and the twin-wiring inside a set of shared framework files
(listed below). **This fork IS the twin's exclusive home from now on.** The relationship inverted:
the twin is no longer "developed upstream too," it is **fork-owned**, and upstream will never carry
it again.

Consequence for every FUTURE sync: `git merge` re-applies `e250d11`'s deletions to any twin file the
fork hasn't diverged since the merge base — **silently, with no conflict** (modify/delete only fires
where the fork also edited the file). So each sync MUST, after `git merge --no-commit`, restore the
protect-list from HEAD **before** committing, and resolve every shared-file twin-unwiring to OURS:

**Protect-list — restore whole from HEAD every sync** (`git checkout HEAD -- <path>`):

```
plugin-twin  starter-viewer  ui/orchestrator-viewer.md  ui/server/features/twin
docs/tutorials  ui/server/cli/materialize.test.js
```

**Shared-file twin-unwiring — reject to OURS every sync** (upstream's `e250d11` stripped twin
awareness from these; the fork keeps its twin wiring — restore from HEAD, then fold in any SEPARABLE
non-twin improvement by hand):

```
ui/server/core/{config,index,session,session-plugins,session.test}.js
ui/server/cli/{new,setup,doctor,materialize,gen-skill-scope,gen-contamination,gen-library-index}.js
ui/server/features/promotions/{promote,promote-run,promote-run.test}.js
ui/server/features/skills/{skills,skill-registry,skills.check}.js
tsconfig.json  eslint.config.js  .prettierignore
README.md / FEATURES.md (twin-section shrink — identity, always OURS)
```

> At the `e250d11` sync these carried NO separable improvement (the commit was a pure strip); the
> three that ALSO received a real `b7053ae` improvement (`session.js` preToolGate rewire,
> `session.test.js` image-read gate tests, `gen-skill-scope.js` name-convention warn) were resolved
> as **fork HEAD + only the `b7053ae` hunks re-applied** (`git checkout HEAD -- <f>` then apply just
> that commit's diff), never taking `e250d11`'s twin removals.

## Identity — resolve as OURS (fully diverged)

| File                                | Our divergence                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | `name` = `xenodot-twin`; twin `description`; `repository.url` → `arthur0n/xenodot-twin`. Keep `arthur0n` lines so provenance stays.                                                                                                                     |
| `.claude-plugin/marketplace.json`   | Twin `name`/`metadata`/`owner`; **lists BOTH plugins** — `xenodot` (`./plugin`) and `xenodot-twin` (`./plugin-twin`). Keep both plugin `name` values verbatim.                                                                                          |
| `plugin/.claude-plugin/plugin.json` | `description` reframed as the engine-generic base. `name` stays `xenodot` (namespace — never rename).                                                                                                                                                   |
| `README.md`                         | **Fully replaced** with the twin front page. Expect conflicts on upstream README edits; resolve by keeping ours.                                                                                                                                        |
| `FEATURES.md`                       | **Fully replaced** with the twin catalog. The `## Agents (N)` section must list exactly the base agents (the pre-commit badge cross-check enforces it).                                                                                                 |
| `package-lock.json`                 | Root `name`/`packages[""].name` = `xenodot-twin` (mirrors `package.json`). Regenerate with `npm install` on any identity change; a fresh clone must stay git-clean after install.                                                                       |
| `docs/tutorials/digital-twin.md`    | Clone URL/dir + example-copy paths are `arthur0n/xenodot-twin` / `../xenodot-twin/…`; doctor counts + install hints reflect the twin (both plugins). No `xenodot-forge` branding — the repo IS the twin product. (Also in the protect-list; keep OURS.) |
| `ui/index.html`                     | Page `<title>` = `Xenodot Twin` (the user-facing web-UI title). Never resurrect `Xenodot Forge`.                                                                                                                                                        |

## Upstream files we are allowed to edit (behavioral seams — keep this list SHORT)

Each entry = the smallest change, plus why it can't be additive. On a sync, keep our edit AND fold in
upstream's real behavior change, hunk by hunk.

| File                                                                                               | Our edit                                                                                                                                                                                                                                     | Why it can't be additive                                                                                                    |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ui/server/core/config.js`                                                                         | `getProjectType()` returns `"viewer"` unconditionally; `PROJECT_TYPES = ["viewer"]`; `ORCHESTRATOR_PROMPT` reads `orchestrator-viewer.md`; `ORCHESTRATOR_VIEWER_PROMPT` aliases it.                                                          | The domain resolver + orchestrator prompt are central resolved config; viewer-only collapses the game branch.               |
| `ui/server/cli/new.js`                                                                             | Viewer-only: `--game` errors with a pointer to xenodot-forge; default target `../viewer`; always scaffolds `starter-viewer/`; passes `--viewer` to setup.                                                                                    | Scaffolding picks the starter + project type; the game path is gone.                                                        |
| `ui/server/cli/setup.js`                                                                           | Viewer-only: `--game` errors; `projectType` is always `"viewer"`.                                                                                                                                                                            | Setup writes the project type; game is unreachable.                                                                         |
| `ui/server/features/skills/skill-registry.js`                                                      | `BUILDERS = ["godot-dev", "godot-refactor", "godot-visuals", "godot-assets"]` (dropped the gameplay specialists).                                                                                                                            | The `builders` audience token expands to this list; it must name only agents that ship.                                     |
| `ui/server/cli/onboarding.check.js`                                                                | Asserts `starter-viewer/` ships and scaffolds/boots a viewer (not `starter/`).                                                                                                                                                               | The clean-install regression must target the shipped starter.                                                               |
| `ui/server/core/session.test.js`                                                                   | Relabeled the `projectType: "game"` case as a generic non-viewer negative test.                                                                                                                                                              | The pure gating fn still accepts any token; the label was game-specific.                                                    |
| `ui/server/cli/doctor.js`                                                                          | Terminal-install hint installs BOTH plugins from the `xenodot-twin` marketplace (`xenodot@xenodot-twin` + `xenodot-twin@xenodot-twin`); dropped the stale "twin is web-UI only / not in the marketplace" note.                               | The printed marketplace name + plugin list must match our renamed marketplace that ships both plugins.                      |
| `plugin/agents/{godot-dev,godot-visuals,godot-assets}.md`                                          | Trimmed dropped game skills from `skills:` frontmatter AND reworded the game-flavored prose/descriptions for the viewer domain (route to twin agents, no pixel-art/level/gameplay guidance). godot-assets is now core-only.                  | The projection (`gen-skill-scope`) must match the skills that ship, and the orchestrator reads these descriptions to route. |
| `plugin/skills/{agent-report,godot-code-rules,godot-verify,godot-runtime-smoke,graphify}/SKILL.md` | `agents:` audience tag retagged to remove dropped agents (`godot-playtester`, `bug-triage`, gameplay builders); `godot-verify` + `godot-runtime-smoke` bodies reworded off the dropped `godot-playthrough-bot`/pixel-art/gridmap cross-refs. | An `agents:` token naming a dropped agent trips `gen-skill-scope`; a backticked dropped-skill body ref warns.               |

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

### 2. Game skills (32) — NOT carried

Delete `plugin/skills/`:

`godot-3d-pixelation`, `godot-animation-libraries`, `godot-arena-spatial-design`, `godot-art-style`,
`godot-data-driven-composition`, `godot-effect-composition`, `godot-enemy-ai`,
`godot-enemy-ai-headless-smoke`, `godot-enemy-archetype`, `godot-first-person-controller`,
`godot-foliage`, `godot-greybox`, `godot-greybox-to-asset`, `godot-gridmap-level`,
`godot-hd-material-import`, `godot-looping-particle-vfx`, `godot-mesh-import-hd`,
`godot-mesh-import-pixel-art`, `godot-navmesh-pathing-4-6`, `godot-oneshot-vfx`,
`godot-orthographic-follow-camera`, `godot-pixel-lighting`, `godot-playgrade`,
`godot-playthrough-bot`, `godot-procedural-model`, `godot-procedural-texture`, `godot-runtime-arena`,
`godot-shooter-enemy-combat`, `godot-stealth-perception`, `godot-texture-import-pixel-art`,
`godot-travelling-projectile-3d`, `level-design-principles`.

> `godot-mesh-import-hd` + `godot-hd-material-import` are dropped too: they are FPS-flavored and
> structurally built ON the pixel-art import skills (they defer their core steps to
> `godot-mesh-import-pixel-art`), so they can't stand alone once those are gone. A viewer imports the
> building via `xenodot-twin:twin-import`; NON-BIM equipment/props (vendor GLB/FBX, CC0 models) come
> in via `xenodot-twin:twin-asset-import` (the twin-native replacement — mints a synthetic GlobalId so
> a prop joins the data layer), and ad-hoc one-off `.glb`/texture dressing falls to `godot-assets` on
> its core skills.

Keep the 16 base skills: `agent-report`, `autonomous-main-goal`, `caveman`, `godot-code-rules`,
`godot-composition`, `godot-docs`, `godot-export-builds`, `godot-main-scene`,
`godot-project-baseline`, `godot-runtime-smoke`, `godot-screen-effects`, `godot-verify`,
`graphify`, `library-record-writing`, `research-presenting`, `tasks-mcp`.

> Upstream `322e4da` renamed `godot-project-conventions` → `godot-project-baseline` (rewritten
> game-agnostic: quality gates + way-of-work only; aesthetics move to a PROJECT-LOCAL skill). We took
> the rename — it's the exact improvement the fork wanted (our kept copy was pixel-art flavored). Its
> "Example skeleton" block still teaches a 3D-pixel-art aesthetic as the illustrative project-local
> payload; kept as a generic pattern example (the base plugin is the engine-generic Godot base — the
> example demonstrates the project-local pattern, it isn't a twin default). Upstream `b7053ae` added
> `library-record-writing` (shared record-writing method for the `*-researcher` agents) — a generic
> CORE skill, taken.

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

Dropped: **10 game agents + 32 game skills + 1 game orchestrator + 1 game starter + 3 roadmap docs +
2 art files + 4 game library record groups**. Seam-edited: **9 framework files/dirs** (config, new,
setup, skill-registry, onboarding, session.test, doctor, the 3 trimmed builders, the retagged
skills). Identity: **5 files**. Namespaces + `plugin-twin/` kept verbatim.
