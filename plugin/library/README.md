# Library — warm knowledge (never auto-loaded)

Nothing here loads into an agent's context automatically. These are durable **records** and **source lists** the self-improvement loops consult on demand, and that a human reads to understand past decisions. Hot knowledge (always- or trigger-loaded) lives in `CLAUDE.md` and `.claude/skills/`; this folder is everything worth keeping that should NOT cost tokens on every task.

## The one convention — role decides home

Every framework artifact is one of four roles. The role decides the home; each home carries its own index, so the next agent can find it without re-researching.

| The thing is…                                           | Role        | Home                           | Index (where the next agent looks)        |
| ------------------------------------------------------- | ----------- | ------------------------------ | ----------------------------------------- |
| knowledge an agent **loads to learn how**               | skill       | `.claude/skills/godot-<name>/` | the `## Skills` list in `CLAUDE.md`       |
| code an agent **runs**                                  | tool        | `tools/<name>`                 | `tools/CAPABILITIES.md`                   |
| reusable **runtime code** the game preloads             | stdlib      | `tools/lib/<name>.gd`          | `tools/CAPABILITIES.md` (Runtime library) |
| a **verdict / definition kept** so we don't re-research | record      | `library/<kind>/<slug>.md`     | the folder (+ the UI sidebar)             |
| **where to fetch** external raw material                | source list | `library/sources/<thing>.md`   | the file itself                           |
| always-relevant **routing / convention**                | —           | `CLAUDE.md` (one line)         | —                                         |

Decide by what the thing _does_: **run it (headless) → `tools/`; reuse it as a function the game preloads at runtime → `tools/lib/`; load it to learn → `.claude/skills/`; remember a decision → `library/<kind>/`; a fetch-list → `library/sources/`; always-on → `CLAUDE.md`.** The form follows the role — a skill is multi-file so it is a folder; an index is a flat list so it is one file; records are many small docs so they are a folder of them.

## Record format — OKF frontmatter + kind index

Every record opens with YAML frontmatter in the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) v0.1 subset — flat scalars plus inline `[a, b]` arrays, nothing nested:

```yaml
---
type: addon | tool-definition | verdict | finding | source-list | draft
title: "<human name — what the sidebar and index show>"
description: "<one-line verdict/summary — the line that saves opening the doc>"
timestamp: <ISO 8601, when the verdict landed>
resource: <external URL the record is about, when there is one>
tags: [optional, categorical]
---
```

`type`, `title`, `description` are required (gated); the rest are optional. The UI sidebar and each kind's generated `index.md` render `title` + `description`, so keep `description` a real verdict, not metadata. Each kind folder carries an `index.md` (one line per record) so the next agent navigates from one cheap read; regenerate with `npm run check:library -- --write` (in the forge), or append your record's line by hand. `npm run validate` fails on missing frontmatter or a stale index. Conforming to OKF keeps these records readable by any OKF consumer, no framework required.

## What's in this folder

**Records** — one doc per thing we evaluated; never re-researched once a verdict exists. Foldered by kind:

- `addons/<slug>.md` — addon buy-vs-build verdicts (**addon-researcher**; template in `.claude/agents/addon-researcher.md`). The UI sidebar reads each doc's frontmatter `description`, so keep it the verdict line.
- `tools/<slug>.md` — CLI tool-definitions: the build spec + registry entry (**cli-researcher**; template in `.claude/agents/cli-researcher.md`). The runnable tool itself lands in `tools/` and registers in `tools/CAPABILITIES.md` — the definition here is the _why/spec_, the tool there is the _what you run_.
- **Transcript digests are NOT here — they live game-local** at `design/library/transcripts/<slug>.md`
  (**transcript-researcher**; template in `.claude/agents/transcript-researcher.md`). A digest maps a
  source against ONE game's stack ("valid for our stack?"), so it is game-coupled by construction and
  must not ship in a library every game receives; a reusable technique a digest surfaces graduates
  through **skill-researcher** into a skill (the agnostic form). The contamination gate
  (`npm run check:contamination`) fails any digest reintroduced here. Raws live in the project
  `transcripts/` drop zone and move to `transcripts/archive/` once harvested.

**Sources** — registries of _where to fetch_ external raw material; never bundled, downloaded at runtime to a per-user cache. The file IS the registry:

- `sources/skill-sources.md` — external skill collections (**skill-researcher**).
- `sources/asset-sources.md` — free texture/PNG generators (**asset-advisor**).
- `sources/model-sources.md` — free CC0 / low-poly 3D model sites (**asset-advisor**).

A record is OUR verdict (an output); a source list points OUT to the world (an input). That is why they sit on separate shelves.
