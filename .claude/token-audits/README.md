# Token-audit loop — how it works

The token loop tracks **$/token spend only**, in its **own domain**. It is deliberately kept
**separate** from the framework-audit loop (`.claude/framework-audits/`): that loop is code +
conventions and must run free — token concerns never merge into it or distract it. The two are
linked by **reference only** (a one-line cross-ref in each ledger). If a token audit surfaces a
framework-quality issue, that is a **manual hand-off** to the human, never an auto-route.

## The closed loop

```
/token-audit       Measure → File     (find offenders, record numbers, file an opportunity)
/token-audit-fix   Fix → Verify (Δ)   (apply the deterministic replacement, prove before/after)
                   → Adapt            (moved:false is honest — revert/rethink on no-move)
```

## Files

| file           | lifecycle                                                                                                                                                   | who writes it  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `LEDGER.md`    | **EPHEMERAL** prose memory — `Covered sessions` + the latest offenders/opportunities, so the next run doesn't repeat work. Hand-appended by `/token-audit`. | `/token-audit` |
| `history.json` | **PERMANENT** append-only numeric time-series (the "token wiki"). NEVER pruned — it is history. The comparison backbone.                                    | the CLI only   |
| `history.md`   | GENERATED view of `history.json` (trend table + opportunity outcomes).                                                                                      | generated      |

**Opposite lifecycles on purpose:** the framework ledger is ephemeral (applied findings are
DELETED — git is the record); the token history is permanent (the trend is the whole point).

## The measurement CLI — `ui/server/cli/token-history.js` (`npm run token-history`)

Numbers are captured **deterministically by the script**, never as an LLM prose guess.

```bash
node ui/server/cli/token-history.js append --sessions a,b --offender "…" --opp id:55000 --note "…"
node ui/server/cli/token-history.js snapshot --sessions a,b   # print metrics, write nothing (fix-arm BEFORE/AFTER)
node ui/server/cli/token-history.js snapshot --global         # the longitudinal trend line
node ui/server/cli/token-history.js land --opp id --moved true|false|pending [--delta-tok N] [--delta-cost N] [--result "…"]
```

**Never edit `history.json` / `history.md` by hand — go through the CLI.** It is self-contained
(its own NDJSON parser; no import of the framework's `usage.js`) so the token loop can evolve its
metrics without touching framework code — leave the small parse duplication alone.

## Reading the trend

Each run covers **different** sessions, so raw `covered.cost` is not comparable run-to-run. The
trend lives in the **normalized** columns (`hitRate`, `$/turn`) and the **`global` snapshot** — the
longitudinal line that should improve as fixes land. An opportunity's `moved` + `deltaTok`/`deltaCost`
answers the only question that matters: _did the change actually reduce spend?_

Not a CI gate — this is a record, not a check. It is intentionally out of `npm run validate` so it
can never block or distract framework work.
