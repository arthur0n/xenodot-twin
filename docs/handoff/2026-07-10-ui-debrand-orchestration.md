# Orchestration plan — open item #7: web UI chrome de-branding

Companion to `2026-07-10-open-items.md` item 7 and the umbrella orchestration doc.
Origin: item #3's scoped review LOW-2 — the de-game item fixed every MODEL-READ
prompt surface, but the web UI chrome still ships Forge/game branding:
`ui/index.html` wordmark (`Xenodot<b>Forge</b>`), game-flavored help/placeholder
copy (~lines 208/284/320/322/560 at review time — re-verify), and
`ui/agent-ui.css` themed as "The Forge Temple".

## Working rules

- Branch: `feat/ui-debrand` off `main` (post item-#6 merge, `9181b16`).
- SCOPE = DE-BRANDING, NOT REDESIGN: wordmark → Xenodot Twin, game-flavored
  user-visible copy → twin/domain-appropriate wording, CSS theme NAMES/comments
  de-gamed. The visual design (colors, layout, spacing) does NOT change — a
  restyle is design work nobody asked for. Byte-level visual parity except
  where text itself is the pixel.
- The de-game discipline carries: behavioral/functional copy stays intact;
  only identity/domain phrases move. Where wording is generic, prefer neutral
  (upstream-adoptable) over twin-branded — same rule that made the item-#3
  prompt blocks upstream candidates.
- ui/ files are upstream-shared: SEAMS rows required for every edited file
  (check how index.html/agent-ui.css are currently listed; extend, flag
  upstream candidates where neutral).
- The seat UI on PORT 8339 serves this code — the UI test is LIVE this time:
  restart 8339 from the updated clone, screenshot the door, verify wordmark +
  no game copy. Never touch 8338.
- Sweep bar (acceptance): `grep -rni "forge\|game" ui/index.html ui/agent-ui.css
ui/*.css` → every remaining hit classified (code identifier / intentional /
  historical); zero unexplained user-visible game branding.

## Single phase — implement + prove (subagent: Opus)

Inventory sweep first (the item-#3 lesson: the named lines are point-in-time),
then the edits, SEAMS rows, and proofs: sweep classification table, npm
validate/test green, prettier clean, and the live-serve check from the seat
clone (orchestrator re-verifies).

## Orchestrator gates

1. Line-by-line diff review (it's mostly strings — read them all).
2. Independent scoped review only if the diff turns out non-trivial
   (proportionality per the umbrella rules; a pure-strings diff may take
   orchestrator-only review — decide on sight, log the call).
3. LIVE UI test: sync seat clone, restart 8339, screenshot + sweep the served
   HTML.
4. Merge no-ff, push, umbrella + open-items updated — then item #8.

## Status log

- [x] Implemented + reviewed — `44262a4` (7 files, +55/−50, strings only).
      Inventory-first caught more than the review's point-in-time list (client
      feature JS + types.js user-visible strings; stale game-designer quick-action
      → twin-architect, a real dropped-agent reference). Aesthetic smithy palette
      identifiers retained (design voice; de-brand ≠ restyle) — visual values
      byte-identical, comment/text nodes only in CSS. SEAMS rows + 4 upstream
      candidates. Post-edit sweep: zero unexplained user-visible branding.
- [x] Proportionality call: orchestrator line-by-line review only (pure-strings
      diff, serve-checked); no separate review agent.
- [x] Live UI test: seat clone synced, 8339 restarted — served HTML shows
      Xenodot Twin wordmark + title, 0 forge/game hits. 8338 untouched.
- [x] Merged to main (no-ff `532df68`), pushed. Item #7 CLOSED. FOLLOW-UP
      flagged into open-items: get-assets/draw-level feature-dispatch PROMPTS still
      name dropped agents (asset-advisor/level-designer/game-designer) — functional
      rewiring to twin agents, beyond de-brand scope.
