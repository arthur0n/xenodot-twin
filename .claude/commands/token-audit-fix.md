---
description: Apply a token-audit opportunity by id — capture the BEFORE metric, apply the deterministic replacement, capture AFTER, and record the landed delta (or moved:false) in the permanent token history. Closes the token loop. Manual, human-run. Forge-local (not shipped).
argument-hint: "<opp-id>"
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Agent, Skill, mcp__ui__ask
model: opus
---

# Apply a token fix — close the loop with a measured before/after

FIRST load CAVEMAN and acknowledge to the user.
The fix arm of `/token-audit`. The audit **finds + measures**; this command **applies** exactly
the opportunity you name, then **proves** it with a before/after number. It never invents fixes and
never applies an id you didn't pass. Run it caveman.

## The loop this closes

`/token-audit` = Measure → File. This = Fix → Verify (Δ) → Adapt. The number is the point: an LLM
prose guess is not evidence — the `token-history` CLI supplies both the BEFORE and the AFTER, so we
can see whether the change actually moved spend.

## Where the data lives (repo-relative; cwd = forge root)

- **Opportunities:** `.claude/token-audits/history.json` — `records[].opportunities[]`, each `{id,
estSavingTok, landed, moved, deltaTok, deltaCost, result}`. This is the PERMANENT time-series
  (append-only; `history.md` is a generated view — never hand-edit). Prose context for the id is in
  `.claude/token-audits/LEDGER.md`.
- **The measurement tool:** `node ui/server/cli/token-history.js` — `snapshot` (print metrics, write
  nothing), `land` (record the outcome). Never edit `history.json` by hand.
- **Fix targets:** the deterministic replacement the opportunity named — a script, a `plugin/tools/`
  or game `tools/` entry, a hook, or an MCP-server config. Touching framework OR game code here is
  fine: the domain-separation rule is about the two LEDGERS staying separate, not a ban on token
  fixes editing code.
- **Search with the Grep TOOL or full-path `/opt/homebrew/bin/rg`, NEVER bash `grep`** (the `rtk`
  hook mangles matches).

## Steps

1. **Resolve the id.** Read `history.json`; find the `opportunities[]` entry with that id. If it's
   missing, or already `landed:true` with `moved` confirmed, **say so and stop**. Read its
   `LEDGER.md` prose so you understand the deterministic replacement it proposed.

2. **Confirm the plan.** State: the id, the exact replacement, the files it will touch, and HOW the
   delta will be measured (see step 3). For a wide-blast or destructive change, confirm via
   `mcp__ui__ask` if available; else state plainly and proceed (the human agreed by passing the id).

3. **Capture BEFORE.** Pick the measure that this fix changes and snapshot it now:
   - **Computable-now fix** (the replacement's effect is measurable from current data — e.g. a script
     that shrinks a tool's output, a hook that filters payload): capture the concrete before-number
     (bytes/tokens) with a deterministic command, and note it.
   - **Forward-looking fix** (the effect only shows in FUTURE sessions — e.g. memoizing an MCP docs
     lookup so later runs stop re-fetching): capture the global baseline
     `node ui/server/cli/token-history.js snapshot --global` — the trend line the next audit checks.

4. **Apply the deterministic replacement.** Make the change the opportunity named — script / `tools/`
   entry / hook / MCP config. Keep it minimal and deterministic; this is the whole point (no model in
   the hot path afterward).

5. **Verify the change is sound.** If a framework file changed: `rtk npm run validate` (tsc + eslint,
   zero warnings) and `rtk npx prettier --write` the touched files. If a game/script/hook: exercise it
   once and show it works. Never leave the gate red — fix or revert.

6. **Capture AFTER + record the outcome.** Re-run the same measure.
   - Computable-now: compute `Δtok`/`Δ$`, then
     `node ui/server/cli/token-history.js land --opp <id> --moved true|false --delta-tok <n> --delta-cost <n> --result "<one line>"`.
     `--moved false` (metric didn't move) is a valid, honest outcome — record it so the loop ADAPTS
     (revert or rethink) instead of assuming success.
   - Forward-looking: `... land --opp <id> --moved pending --result "applied <what>; Δ confirmed on the next /token-audit run"`.
     The next audit's `global` snapshot is the confirmation; a later run flips `pending → true|false`.

7. **Self-critique.** Improve the loop, not just the fix. Note anything that tripped the apply — a
   mis-scoped opportunity, a measure that wasn't actually computable, an adapt the history should make
   easier. Carry it into the run report + commit message (and `LEDGER.md` Process note if it belongs
   to the audit side). If a safe fix to THIS command or the CLI is obvious, make it here.

8. **Report — terse.** id · what was applied · files changed · BEFORE→AFTER (or `pending`) · verify
   result · self-critique note. This summary + git are the fix record.

## Domain separation (positive rule)

- Token fixes are recorded ONLY in `.claude/token-audits/` (history.json + LEDGER.md). Keep the two
  loops linked by REFERENCE, not by routing.
- If applying this fix reveals a framework-quality issue (a convention, an agent/skill defect), hand
  it to the human to file on `.claude/framework-audits/LEDGER.json` — that stays a manual hand-off.

## Never

- Apply an id the human didn't pass, or invent an opportunity not in `history.json`.
- Edit `history.json` / `history.md` by hand — go through `token-history.js` (append/land).
- Claim a saving without a before/after number — `moved:false`/`pending` are honest; a guess is not.
- Leave `npm run validate` failing — green gate or revert.
- Run shell without `rtk`.
