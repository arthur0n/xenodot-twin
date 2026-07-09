# Orchestration plan — executing Must-Have #3 (de-game the persona prompts)

Companion to `2026-07-09-degame-personas-plan.md` (the WHAT). Execution HOW, same
protocol that closed item #2 (`2026-07-09-twin-build-orchestration.md`): Opus subagent
per phase, orchestrator line-by-line review between, merge to `main` only after scoped
review + live UI spot-check.

## Working rules

- Branch: `feat/degame-personas` off `main` (post item-#2 merge, `b49dd78`).
- Phase 1 = wording + soul-trap fix (single commit). Phase 2 = land on this machine +
  prove (setup/check runs, validate/test, live UI spot-check).
- HARD CONSTRAINT carried from the plan: `~/.hermes/SOUL.md` is MACHINE-GLOBAL and this
  machine runs BOTH seats (forge + twin). Soul wording must be domain-NEUTRAL family
  framing — never twin-branded. Personas + MCP tool text are per-repo → personas
  twin-branded, tools neutral "project" wording (upstream candidates).
- Behavioral persona sentences (FINDINGS ONLY, refute-first, cite-primary) stay
  byte-identical — diff must show only identity phrases moved.
- Re-verify the plan's file refs against current `main` first (point-in-time doc).

## Phase 1 — wording + trap fix (subagent: Opus)

Files: `hermes-soul.md` (header + first para only), both persona briefs, both MCP tool
descriptions, `cli/new.js` gitignore banner, `hermes-setup.js`
`LEGACY_SOUL_TEMPLATES` + replace-and-report, `hermes-check.js` legacy warning,
`docs/fork/SEAMS.md` rows (incl. upstream-candidate flags).

## Phase 2 — land + prove (subagent: Opus)

`npm run hermes:setup` replaces the legacy soul on THIS machine (reports it),
`hermes:check` clean; `HOME=<tmp>` both-paths test (legacy replaced / customized kept);
`npm run validate` + `npm test` green; live spot-check via web UI (PORT=8339 twin seat,
NEVER 8338): researcher + critic transcripts show new briefs, tool listing shows neutral
hermes/promote descriptions. Roadmap + index tick.

## Orchestrator gates

1. Line-by-line diff review per phase.
2. Independent scoped review over the branch diff before merge.
3. UI simulation from the seat (web UI on 8339).
4. Acceptance criteria 1–5 from the plan, one by one.
5. Merge no-ff to `main`, push, log updated — then next index item.

## Status log

- [x] Phase 1 done + reviewed — `5e9980e` on `feat/degame-personas`. Soul neutral
      (family framing, both products named), personas twin-branded with behavioral
      sentences byte-identical (context lines in diff), both MCP tools neutral "project",
      gitignore banner de-branded. Trap fix: new `hermes-soul-legacy.js` (frozen verbatim
      snapshot, byte-verified vs HEAD; shared module because hermes-setup.js runs main()
      at import) + ensureSoul legacy-replace branch before custom-keep + hermes:check
      WARN. 3-path HOME=tmp proofs real; validate + 126 tests green. Deviation accepted:
      one new additive file instead of inline constants (drift avoidance).
- [x] Phase 2 done + reviewed — `f7fc95e` (roadmap/index tick). Machine soul WAS the
      legacy template → setup replaced it (`✓ Replaced a legacy Xenodot soul template`),
      check clean, both HOME=tmp paths proven (legacy replaced / custom kept byte-identical).
      validate green, 126/126 tests. Live wire spot-check degraded gracefully per plan:
      running 8339 server is the seat clone on main (no hot-reload) + Hermes gateway down
      (:8642 stale pid) → proven at the seam instead (imported branch persona.brief +
      MCP registrations; /game/i count 0). Setup also wrote standard machine-global hermes
      config defaults (backed up: config.yaml.xenodot.bak + scratchpad snapshots).
- [x] ADDENDUM done + reviewed — `4c34450`: Phase 2 sweep caught 3 prompt blocks the
      plan inventory missed (hermes/docs/codex blocks, all appended to the Hive system
      prompt by session.js). 4 domain phrases neutralized, behavioral text byte-identical,
      SEAMS rows added (upstream candidates), plan gained an execution-time addendum so
      its inventory stays truthful. Acceptance criterion 1 passes post-addendum.
- [x] Scoped review (independent Opus): MERGE-READY, 0 blockers. Snapshot byte-equal
      to pre-change HEAD verified; ensureSoul check order correct; no code path writes
      twin-branded text to the machine soul. LOW-1: interior-CRLF soul misses the trimmed
      compare (pre-existing behavior, optional normalize later). LOW-2: web UI chrome
      (index.html wordmark, agent-ui.css Forge theme) still game-branded — OUT of this
      item's scope (model-read prompt text only); candidate future UI-branding item.
      UI spot-check: seam-level proof (branch persona briefs + tool registrations,
      /game/i = 0); over-the-wire blocked by Hermes gateway down + 8339 serving the seat
      clone on main — per the plan's graceful-degradation clause.
- [x] Acceptance criteria 1–5 met. Merged to main (no-ff), index + roadmap ticked.
      Item #3 CLOSED.
