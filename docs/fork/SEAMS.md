# Seams — our conflict-surface contract with upstream

Xenodot Twin is a **fork of `arthur0n/xenodot-forge`**, focused down to ONE domain: the
digital-twin viewer. We track upstream closely and pull its curated framework wins in via
`/sync-upstream` (see [`SYNC.md`](SYNC.md)), but we ship a **different product** — no game domain.

This file is the audited contract that keeps us mergeable: the identity files that stay OURS, the
few upstream-owned files we edit (behavioral seams), and — most important — the **exhaustive list of
intentional divergences the merge re-introduces every sync and we re-drop by design** (lineage is
preserved, so each merge brings the game payload back).

> **No rebrand codemod.** Unlike a white-label fork, we keep the `xenodot` plugin name and the
> `xenodot:` capability namespace **verbatim** (only the GitHub repo is `xenodot-twin`) — the fork
> folded its twin domain into that ONE plugin, so the `twin-*` capabilities live in `plugin/` beside
> the base and compose it as `xenodot:<name>`, and the base plugin literally IS the upstream `xenodot`
> plugin, trimmed and grown with twin content. Text identity (package/marketplace names, README,
> FEATURES) is small and diverges by hand; there is nothing to codemod.

## The one rule the analysis serves

On every conflict during a sync merge:

- **Game payload → drop it.** Gameplay agents/skills, the game orchestrator, the game starter, game
  roadmap docs, game art, game library records. These have no value for a viewer product. The full
  re-drop list is below.
- **Engine / twin / framework wins → take them.** Spine refactors, new CORE skills/hooks/MCP-tools,
  test-suite additions, security/self-improvement gates, Hermes/codex/graphify improvements, and
  the fork's twin surface (the `twin-*` files in `plugin/`, `starter-viewer/`,
  `ui/server/features/twin/`, `ui/orchestrator-viewer.md`, `docs/tutorials/`) — these are the point of
  the sync.
- **Identity → OURS, always.** `package.json` name/description, `.claude-plugin/marketplace.json`,
  `plugin/.claude-plugin/plugin.json` description, `README.md`, `FEATURES.md`.
- **Behavioral seams → keep our edit AND fold in upstream's real change** (the short table below).
- **Audit ledger → OURS, then reconcile.** `.claude/framework-audits/LEDGER.json` resolves OURS on
  every sync, then run the reconcile step: diff our finding ids against
  `git show upstream/main:.claude/framework-audits/LEDGER.json`. An id WE carry that upstream DROPPED
  means upstream fixed it → verify the fix actually landed in our tree, then prune our row. Import an
  upstream row only if its target ships in the twin (glob-check the cited path; never a game-scoped
  row). Retarget any line-cite a seam rename rotted. `LEDGER.md`/`ledger.html` are generated — never
  hand-merge them; run `npm run ledger` after.

## Additive-only areas (no conflict risk — upstream owns none of these)

- `docs/fork/**` — this contract + the sync runbook.
- `.claude/commands/sync-upstream.md` — the analysis-driven down-sync command.

## The twin domain is FORK-OWNED (upstream `e250d11`, 2026-07-08)

Upstream commit `e250d11` ("the twin domain moves to its exclusive fork") **removed the entire twin
domain from `arthur0n/xenodot-forge`** — 79 files: all of the old `plugin-twin/`, `starter-viewer/`,
`ui/orchestrator-viewer.md`, `ui/server/features/twin/`, `docs/tutorials/digital-twin.md`,
`ui/server/cli/materialize.test.js`, and the twin-wiring inside a set of shared framework files
(listed below). **This fork IS the twin's exclusive home from now on.** The relationship inverted:
the twin is no longer "developed upstream too," it is **fork-owned**, and upstream will never carry
it again.

**Ownership is PREFIX-based, not path-based.** This fork folded the old `plugin-twin/` into the ONE
`xenodot` plugin, so the twin content now lives INSIDE `plugin/` under a `twin-*` prefix:
`plugin/skills/twin-*`, `plugin/agents/{twin-architect,twin-scene-optimizer,twin-data-binder}.md`, the twin
pipeline in `plugin/tools/` (`verify_twin.sh`, `twin_publish_web.sh`, `bench_sweep.sh`, `sim/`,
`bridge/`, `web/`, `analyze/`, ...), `plugin/examples/*`, and `plugin/library/findings/twin-*`. These
are **fork-only** — upstream never carried a `plugin/skills/twin-import` (its twin lived under the
`plugin-twin/` it then deleted), so a `git merge` can NEVER modify/delete-conflict on them (that only
fires where both sides touch the same path). The `twin-*` prefix marks them OURS; everything under
`plugin/` that is NOT `twin-*` is base content that **tracks upstream** — an upstream merge now lands
in a `plugin/` that also holds our twin content, and the base files it touches resolve as ordinary
take-upstream (or seam) merges.

Consequence for every FUTURE sync: `git merge` re-applies `e250d11`'s deletions to the _whole-dir_
twin surfaces the fork still keeps at a path upstream also once had — **silently, with no conflict**
(modify/delete only fires where the fork also edited the file). So each sync MUST, after
`git merge --no-commit`, restore the protect-list from HEAD **before** committing, and resolve every
shared-file twin-unwiring to OURS:

**Protect-list — restore whole from HEAD every sync** (`git checkout HEAD -- <path>`) — the fork-only
whole-dir surfaces upstream deleted in `e250d11`:

```
starter-viewer  ui/orchestrator-viewer.md  ui/server/features/twin
docs/tutorials
```

> The twin capabilities once enumerated here file-by-file — the `twin-build` / `twin-analyze` /
> `twin-ship` skills + their `plugin/tools/` drivers (`twin_build.sh`, `analyze/`, `twin_ship.sh`,
> `twin_publish_web.sh`), the web/Grafana embed recipe (`plugin/tools/web/serve_coi.py` + the two Web
> export presets), the bench-sweep + perceptual pair (`plugin/tools/bench_sweep.sh` + `bench/`), and
> the plant + city demo kits (`plugin/examples/*`) — no longer need a protect line. After the fold they
> are `twin-*`-prefixed files under `plugin/` that upstream never carried, so a sync's `e250d11`
> re-deletion (of the long-gone `plugin-twin/`) cannot reach them and a merge cannot conflict on them.
> The only twin surfaces that still touch upstream-owned paths are the analysis-seam framework half
> under `ui/server/features/twin/` (whole-restored above) and the fork-only
> `ui/server/mcp-tools/analyze-tool.js` (a new filename upstream never carries; its one shared touch —
> registering the tool in `mcp-tools/ui-server.js` — is a behavioral seam tabled below). **Generated
> files are never hand-merged**: the library kind-indexes (`plugin/library/*/index.md`), the badge
> counts, and the `gen-skill-scope` projections are regenerated
> (`node ui/server/cli/gen-library-index.js --write`, `npm run badges`,
> `node ui/server/cli/gen-skill-scope.js --write`), never resolved conflict-by-hand.

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

| File                                | Our divergence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                      | `name` = `xenodot-twin`; twin `description`; `repository.url` → `arthur0n/xenodot-twin`. Keep `arthur0n` lines so provenance stays.                                                                                                                                                                                                                                                                                                                                                                      |
| `.claude-plugin/marketplace.json`   | Twin `name`/`metadata`/`owner`; lists the ONE `xenodot` plugin (`./plugin`). Keep the plugin `name` value verbatim.                                                                                                                                                                                                                                                                                                                                                                                      |
| `plugin/.claude-plugin/plugin.json` | `description` reframed as the engine-generic base. `name` stays `xenodot` (namespace — never rename).                                                                                                                                                                                                                                                                                                                                                                                                    |
| `README.md`                         | **Fully replaced** with the twin front page. Expect conflicts on upstream README edits; resolve by keeping ours.                                                                                                                                                                                                                                                                                                                                                                                         |
| `FEATURES.md`                       | **Fully replaced** with the twin catalog. The `## Agents (N)` section must list exactly the base agents (the pre-commit badge cross-check enforces it).                                                                                                                                                                                                                                                                                                                                                  |
| `package-lock.json`                 | Root `name`/`packages[""].name` = `xenodot-twin` (mirrors `package.json`). Regenerate with `npm install` on any identity change; a fresh clone must stay git-clean after install.                                                                                                                                                                                                                                                                                                                        |
| `docs/tutorials/digital-twin.md`    | Clone URL/dir + example-copy paths are `arthur0n/xenodot-twin` / `../xenodot-twin/…`; doctor counts + install hints reflect the twin (the ONE plugin). No `xenodot-forge` branding — the repo IS the twin product. (Also in the protect-list; keep OURS.)                                                                                                                                                                                                                                                |
| `ui/index.html`                     | Page `<title>` = `Xenodot Twin` **and** the top-bar wordmark = `Xenodot<b>Twin</b>` (the user-facing web-UI identity — never resurrect `Xenodot Forge`). Game-flavored help/placeholder copy also de-gamed: the "new design doc" quick action dispatches `twin-architect` (the real viewer design agent, not the dropped `game-designer`); the transcript/assets/skills modal copy uses neutral **project** wording. Behavioral text byte-identical; the neutral copy edits are **upstream candidates**. |

## Upstream files we are allowed to edit (behavioral seams — keep this list SHORT)

Each entry = the smallest change, plus why it can't be additive. On a sync, keep our edit AND fold in
upstream's real behavior change, hunk by hunk.

| File                                                                                               | Our edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why it can't be additive                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/server/core/config.js`                                                                         | `getProjectType()` returns `"viewer"` unconditionally; `PROJECT_TYPES = ["viewer"]`; `ORCHESTRATOR_PROMPT` reads `orchestrator-viewer.md`; `ORCHESTRATOR_VIEWER_PROMPT` aliases it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The domain resolver + orchestrator prompt are central resolved config; viewer-only collapses the game branch.                                                        |
| `ui/server/cli/new.js`                                                                             | Viewer-only: `--game` errors with a pointer to xenodot-forge; default target `../viewer`; always scaffolds `starter-viewer/`; passes `--viewer` to setup. Also de-brands the scaffolded `.gitignore` banner (`# Xenodot Forge …` → `# Xenodot …`).                                                                                                                                                                                                                                                                                                                                                                                                        | Scaffolding picks the starter + project type; the game path is gone. The banner is a literal string written into user projects — de-branding it edits that constant. |
| `ui/server/cli/setup.js`                                                                           | Viewer-only: `--game` errors; `projectType` is always `"viewer"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Setup writes the project type; game is unreachable.                                                                                                                  |
| `ui/server/features/skills/skill-registry.js`                                                      | `BUILDERS = ["godot-dev", "godot-refactor", "godot-visuals", "godot-assets"]` (dropped the gameplay specialists).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The `builders` audience token expands to this list; it must name only agents that ship.                                                                              |
| `ui/server/cli/onboarding.check.js`                                                                | Asserts `starter-viewer/` ships and scaffolds/boots a viewer (not `starter/`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The clean-install regression must target the shipped starter.                                                                                                        |
| `ui/server/core/session.test.js`                                                                   | Relabeled the `projectType: "game"` case as a generic non-viewer negative test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The pure gating fn still accepts any token; the label was game-specific.                                                                                             |
| `ui/server/cli/doctor.js`                                                                          | Terminal-install hint installs the ONE `xenodot` plugin from the `xenodot-twin` marketplace (`xenodot@xenodot-twin`); dropped the stale "twin is web-UI only / not in the marketplace" note.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The printed marketplace name + plugin must match our renamed marketplace that ships the one plugin.                                                                  |
| `plugin/agents/{godot-dev,godot-visuals,godot-assets}.md`                                          | Trimmed dropped game skills from `skills:` frontmatter AND reworded the game-flavored prose/descriptions for the viewer domain (route to twin agents, no pixel-art/level/gameplay guidance). godot-assets is now core-only.                                                                                                                                                                                                                                                                                                                                                                                                                               | The projection (`gen-skill-scope`) must match the skills that ship, and the orchestrator reads these descriptions to route.                                          |
| `plugin/skills/{agent-report,godot-code-rules,godot-verify,godot-runtime-smoke,graphify}/SKILL.md` | `agents:` audience tag retagged to remove dropped agents (`godot-playtester`, `bug-triage`, gameplay builders); `godot-verify` + `godot-runtime-smoke` bodies reworded off the dropped `godot-playthrough-bot`/pixel-art/gridmap cross-refs.                                                                                                                                                                                                                                                                                                                                                                                                              | An `agents:` token naming a dropped agent trips `gen-skill-scope`; a backticked dropped-skill body ref warns.                                                        |
| `ui/server/integrations/hermes/hermes-soul.md`                                                     | Header + opening paragraph reframed from "Xenodot Forge … game development" to the domain-NEUTRAL Xenodot framework family (games — Forge; digital-twin visualization — Twin). MUST stay neutral: it installs machine-global (`~/.hermes/SOUL.md`) and this machine runs BOTH seats — never twin-brand it.                                                                                                                                                                                                                                                                                                                                                | The soul is one prose baseline injected into every Hermes session; the game framing is inline text, not neutralizable by adding lines.                               |
| `ui/lib/personas/researcher/persona.js`                                                            | `brief` identity twin-branded ("Researcher coworker for the Xenodot Twin digital-twin visualization framework (Godot-family, GDScript)"); the behavioral sentences (FINDINGS ONLY, cite-primary) stay byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                                                     | The brief is an inline string constant used as the persona's system prompt; the identity phrase is embedded in it, not appendable.                                   |
| `ui/lib/personas/critic/persona.js`                                                                | `brief` identity twin-branded (same framing as researcher); the behavioral sentences (refute-first, verdict) stay byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Same — the brief is an inline system-prompt string constant; the identity phrase lives inside it.                                                                    |
| `ui/server/mcp-tools/hermes-tool.js`                                                               | Tool description reworded "the caller's game or codebase" → neutral "project". **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The description is an inline string constant the main agent reads every session the tool registers; the game word is embedded, not additive.                         |
| `ui/server/mcp-tools/promote-tool.js`                                                              | Tool description + zod `.describe()` strings reworded game → neutral "project" throughout. **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Prompt text is inline string constants (description + `.describe()`); the game framing is embedded in them, not appendable.                                          |
| `ui/server/mcp-tools/ui-server.js`                                                                 | Registers the fork-only `makeAnalyzeTool` (`mcp__ui__analyze`, the analysis-seam session dispatch surface) in the `ui` MCP server's `tools:` array (import + one entry). Fork-only feature — upstream has no analysis seam, so this never becomes an upstream PR.                                                                                                                                                                                                                                                                                                                                                                                         | The `tools:` array is a single literal upstream owns; a fork-only registration inside it conflicts whenever upstream adds/removes a tool, so it can't be additive.   |
| `ui/hermes-block.md`                                                                               | "never edits the game or framework" → neutral "project" (one phrase; dispatch/feedback instructions byte-identical). **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The block is appended verbatim to the Hive system prompt (session.js, `HERMES_BLOCK`); the game word sits inside a prose sentence, not appendable.                   |
| `ui/docs-block.md`                                                                                 | "never edits the game, runs the engine" → neutral "project" (one phrase; tools/routing/limits byte-identical). **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Appended verbatim to the Hive system prompt (session.js, `DOCS_BLOCK`); the game word sits inside the Limits sentence, not appendable.                               |
| `ui/codex-block.md`                                                                                | "your cwd is the game" and "a game-local skill/agent" → neutral "project" (two phrases; run/consent instructions byte-identical). **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Appended verbatim to the Hive system prompt (session.js, `CODEX_BLOCK`); the game words sit inside prose sentences, not appendable.                                  |
| `ui/agent-ui.css`                                                                                  | File-header product name `Xenodot Forge` → `Xenodot Twin` and the theme proper-noun `"The Forge Temple"` (+ its "Temple" framing) dropped (identity); the `.brand-word` comment `"FORGE"` → `"TWIN"` to track the wordmark; two domain comments (`game's transcripts/`, `game-local capability`) → neutral **project** (upstream candidates). **Visual values byte-identical** — only comments/text nodes moved; the generic blacksmith/foundry aesthetic (forge-green, molten, ember, the `forge-breathe` keyframe) is the design's VOICE and stays (de-brand, not restyle).                                                                             | The theme identity + product name are inline comment text atop one shared stylesheet; not neutralizable by adding lines.                                             |
| `ui/client/features/promotions/promotions.js`                                                      | Rendered status label `approved · ready to forge` → neutral `approved · ready to promote` (matches the board's own "promoting"/"promoted" vocabulary). **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                             | The label is an inline `STATUS_LABEL` string constant painted on the promotions board; the word is embedded, not appendable.                                         |
| `ui/client/features/project/project-tree.js`                                                       | Empty-project banner + shown setup commands: `your game` / `/path/to/your/game` → neutral `your project` / `/path/to/your/project`. **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Inline strings appended to the rendered "no project here" banner; the domain word sits inside prose + a shown command, not appendable.                               |
| `ui/client/features/assets/get-assets.js`                                                          | The rendered "Place" dropdown option `Game (assets/)` → `Project (assets/)` (+ its adjacent JSDoc `game's own assets/` / `game tree` → `project`). The `place` value token `"game"` stays (code identifier — the server API contract). **AND** the `wirePrompt` dispatch (+ its header comment) rewired off the dropped `asset-advisor`→`godot-dev` game-art gate to the twin roster: import/wiring via `xenodot:godot-assets`, plant props via the `xenodot:twin-asset-import` skill, verify via `godot-verify` (no `asset-advisor`, no `art-import`). The dropdown label is an **upstream candidate**; the dispatch rewire is NOT (game-agent removal). | The option label + the dispatch template are inline strings the user/orchestrator consume verbatim; naming a dropped agent is a dead dispatch, not appendable.       |
| `ui/client/features/agents/agents.js`                                                              | `ROLE_COLOR` + `DISPLAY` identity maps drop the dropped `game-designer`/`level-designer` cast and name the twin builders (`twin-architect`, `twin-scene-optimizer`, `twin-data-binder`); the fallback-label regex drops the `game`/`level` domain prefixes and adds `twin`; the `stripNs` JSDoc example uses a live twin agent. NOT an upstream candidate (game-agent removal).                                                                                                                                                                                                                                                                           | The color/display maps are inline object literals keyed by agent id; a dropped-agent key is a dead entry the fallback can't cover, not appendable.                   |
| `ui/lib/types.js`                                                                                  | Promotion typedef JSDoc `game-local` / `beyond this game` → neutral `project-local` / `beyond this project`. **Upstream candidate — neutral wording, offer as PR.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Inline JSDoc domain wording in the shared types module; embedded in the comment, not appendable.                                                                     |

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

### 2. Game skills (34) — NOT carried

Delete `plugin/skills/`:

`godot-3d-pixelation`, `godot-animation-libraries`, `godot-arena-spatial-design`, `godot-art-style`,
`godot-data-driven-composition`, `godot-effect-composition`, `godot-enemy-ai`,
`godot-enemy-ai-headless-smoke`, `godot-enemy-archetype`, `godot-first-person-controller`,
`godot-foliage`, `godot-greybox`, `godot-greybox-to-asset`, `godot-gridmap-level`,
`godot-hd-material-import`, `godot-looping-particle-vfx`, `godot-mesh-import`,
`godot-mesh-import-hd`, `godot-mesh-import-pixel-art`, `godot-navmesh-pathing-4-6`, `godot-oneshot-vfx`,
`godot-orthographic-follow-camera`, `godot-pixel-lighting`, `godot-playgrade`,
`godot-playthrough-bot`, `godot-procedural-model`, `godot-procedural-texture`, `godot-runtime-arena`,
`godot-shooter-enemy-combat`, `godot-stealth-perception`, `godot-texture-import`,
`godot-texture-import-pixel-art`,
`godot-travelling-projectile-3d`, `level-design-principles`.

> `godot-mesh-import-hd` + `godot-hd-material-import` are dropped too: they are FPS-flavored and
> structurally built ON the pixel-art import skills (they defer their core steps to
> `godot-mesh-import-pixel-art`), so they can't stand alone once those are gone. A viewer imports the
> building via `xenodot:twin-import`; NON-BIM equipment/props (vendor GLB/FBX, CC0 models) come
> in via `xenodot:twin-asset-import` (the twin-native replacement — mints a synthetic GlobalId so
> a prop joins the data layer), and ad-hoc one-off `.glb`/texture dressing falls to `godot-assets` on
> its core skills.

> The 2026-07-11 sync added two NEW upstream base skills — `godot-mesh-import` +
> `godot-texture-import` (the generic, un-suffixed import bases). They are **re-dropped each sync**
> too (added to the list above): nothing in this fork routes or composes them — they arrived
> game-framed and the viewer's import path is `xenodot:twin-import` (building) →
> `xenodot:twin-asset-import` (props) → `godot-assets` (ad-hoc dressing). Reverse only if a twin
> surface starts routing one: then retag it to `godot-assets` and neutralize its game framing (the
> NEW-skill rule below).

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

### 8. Game level-design UI (the "draw level" panel) — NOT carried

Delete the top-down tile-grid level painter and its server half — a whole game feature with no twin
equivalent (a digital-twin viewer builds geometry from converted BIM/CAD by IFC GlobalId import,
never from a hand-drawn wall/door/window floor-plan grid; the panel dispatched the dropped
`level-designer`→`game-designer` agents and the dropped `godot-gridmap-level`/`godot-greybox` skills):

- `ui/client/features/level-editor/draw-level.js` (the painter feature module — delete the folder).
- `ui/server/features/levels/{level-write,level-read}.js` (`POST /api/level` + `GET /api/levels`;
  writes `<project>/levels/drawn/` — delete the folder).

The merge re-introduces these upstream game files every sync (lineage preserved) — re-drop them, and
re-remove the wiring they touch in shared files, all of which upstream re-adds:

- `ui/client/core/main.js` — the `initDrawLevel` import + call.
- `ui/index.html` — the `🗺 draw level` chip + the `#draw-level-modal` block.
- `ui/agent-ui.css` — the `.draw-level-*` rule block (identity file; visual-only, no gate).
- `ui/server/core/index.js` — the `writeLevel`/`listLevels` imports, the `handleLevelPost` fn, and the
  `/api/level` + `/api/levels` route entries (already in the shared-file twin-unwiring list above).

## Gates — the tripwires for a missed re-drop or seam mistake

All must be green after a sync (`npm run validate` bundles the first four):

- `npm run check:skills` — skill-scope: the `agents:` tags ↔ agent `skills:` frontmatter must match,
  and `BUILDERS` must name only shipped agents. Catches a re-introduced game agent/skill or a stale
  audience tag.
- `npm run check:contamination` — the plugin's skills/agents/tools + library records must
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
skills). Identity: **5 files**. The `xenodot` namespace kept verbatim; the twin domain later folded into the one `plugin/` under a `twin-*` prefix.
