# Orchestration plan — executing the open-items doc (2026-07-10)

Companion to `2026-07-10-open-items.md`. Same protocol that closed index items 2–8
(see the `2026-07-09-*-orchestration.md` logs): Opus subagent per item (or phase),
orchestrator line-by-line review, independent scoped review for anything
non-trivial, seat/UI check, merge no-ff to main + push before the next item.
Items are smaller than the index items — one umbrella log here instead of one doc
per item; an item that grows phases gets its own companion doc.

## Triage (from the open-items doc's own buckets)

- SKIPPED — human-paced by design: vis-range fly-through (#1), marketing shots
  (#2), Safari bench cells (#3). They stay in the open-items doc; nothing for
  agents to do.
- SKIPPED — accepted-as-is bucket: recorded precisely so nobody re-litigates.
- SKIPPED — parked 9–12 triggers: unchanged.
- AGENT QUEUE (order = cheap floors first, then measured work, then surfaces):
  1. #4 shellcheck floor (machine setup + fix findings)
  2. #5 occluder recipe bench (measurement; vis-range harness reusable)
  3. #6 fade margin for aggressive vis classes (measurement; extends #5's session
     if convenient — decide at plan time, don't force)
  4. #7 web UI chrome de-branding
  5. #8 analysis seam MCP surface (mcp**ui**analyze)
  6. #9 upstream PR offers (PREPARE branches/diffs; opening anything on the
     upstream repo is outward-facing — orchestrator asks the human first)
  7. #10 plant instancing variant (CONDITIONAL — the doc says "if ever wanted";
     assess cost/benefit when reached, a NO-BUILD verdict is a valid close)

## Working rules carried forward

- Quality over speed; every number gate-backed; SKIP never a pass; honest
  negatives are shippable outcomes; seat evidence to twindemo, framework work to
  xenodot-twin main via no-ff merges.
- brew installs limited to dev tooling explicitly named by the open item
  (shellcheck); nothing else lands machine-wide without a note here.
- PORT 8339 only for the twin UI (8338 is forge's).

## Status log

- [x] #4 shellcheck floor — merged `82b3f61`. shellcheck 0.11.0 installed (the
      authorized machine-wide install). 20 tracked scripts swept: 2 real fixes
      (SC2181 verify_twin playback synthesis — behavior identical under set -u;
      dead rtk-hook patterns), 2 targeted suppressions with inline justification,
      rest resolved by -x + source-paths honoring existing directives. Floor
      institutionalized: check:sh in validate (hard-fail if shellcheck absent —
      silent skip would recreate the gap) + lint-staged graceful-skip; injected
      violation proven exit 1. Full gate + twin_build happy path green.
      Proportionality call: line-by-line orchestrator review only, no separate
      review agent (+8/−4 source diff + one new gate file).
- [x] #5 occluder bench — merged `8dfbc90`. Stays opt-in with measured guidance:
      ucity street −0.15 ms lossless at the 10 m³ default (measured sweet spot),
      duplex net-negative + interior artifact published, aerial structural no-op,
      instanced 0 occluders. Full log: 2026-07-10-occluder-bench-orchestration.md.
      Lesson institutionalized: measurement rules worded per-vantage-class from
      now on (the both-vantages bar was unreachable for occlusion).
- [x] #6 fade margin — merged. Aggressive vis tier adopts
      --vis-fade-margin=5 --vis-fade-mode=self (97% retention, cost ≤ noise,
      pending human fly-through); Forward+-only caveat (web keeps the pop);
      coarser+fade fails. PLUS human-directed bench_sweep tool promotion
      (declarative matrix sweeps, determinism asserts, SKIP-never-a-pass).
      Full log: 2026-07-10-fade-margin-orchestration.md.
- [x] #7 UI de-branding — merged `532df68`. Wordmark/copy de-branded (strings
      only, visual parity), stale game-designer quick-action → twin-architect,
      live-verified on 8339 (0 branding hits in served HTML). NEW follow-up
      recorded as open-items #11: feature-dispatch prompts still name dropped
      agents (functional rewiring). Full log: 2026-07-10-ui-debrand-orchestration.md.
- [ ] #8 analysis MCP surface
- [ ] #9 upstream PR offers (prepared; human gate before opening)
- [ ] #10 plant instancing variant (assessed)
