# Gate discipline — a check is not a gate until it is trap-tested

The framework's credibility rests on its gates. A green checkmark is worthless if it would print
**regardless of input** — that is theatre, not verification. This is the durable rule that keeps
every twin gate honest.

## The rule

> **A check is not a gate until it is trap-tested: proven to go RED, then GREEN, under ONE unchanged
> command on ONE fixture.**

Same command. Same fixture. Same threshold. Opposite verdicts, driven only by the input changing
from corrupt to sound. Until you have shown that pair, you have a check that PRINTS a verdict, not a
gate that DECIDES one — and you may not claim it gates anything.

Corollaries (already enforced across `tools/verify_twin.sh`):

- **A SKIP is never a pass.** A gate that cannot run (no display, no fixture, no model/sidecar pair)
  says so loudly, with the exact command to run it for real. It never returns green by default.
- **Every terminal path writes its verdict artifact** — including setup failures. A gate that dies
  before deciding must not leave a stale green `status.json`/`--json` behind that a later reader
  (a UI badge, CI) mistakes for a pass. Every verdict field is rewritten on every run.
- **Real numbers, one machine.** A verdict carries the actual matched/total, hash, or frame_ms — and
  the one-machine caveat (engine version, renderer, shadows) when the number is measured, not counted.

## How to trap-test

1. Byte-back up the fixture (`cp fixture fixture.orig`) — the trap lives in a scratch copy, never a
   tracked file edited in place.
2. Apply ONE named, reversible corruption from the **trap catalog** in the `twin-verify` skill
   (sidecar-key truncation for JOIN, a bad GlobalId for BIND-SMOKE, a diverging value for PLAYBACK).
3. Run the gate's exact command → capture the verbatim RED output (the `FAIL` line + its diagnostic).
4. Restore (`cp fixture.orig fixture`) → run the SAME command → capture the verbatim GREEN output.
5. Confirm it composes: the same corruption surfaces through `tools/verify_twin.sh`, not just the
   standalone gate script.
6. File the RED and GREEN outputs verbatim in a `plugin-twin/library/findings/` note.

The trap catalog exists so this is repeatable: you never reinvent the corruption per gate, and a new
gate joins the framework only once its RED→GREEN pair is on record.

## Why this doc exists

Gates that were never trap-tested have shipped here and lied: a stale-green `status.json` survived a
setup failure (fixed twice), a silently-unbound binding id passed a smoke that never asserted it, and
a gate's own tool drifted out of `gdformat`/`gdlint`-clean because the framework's `npm run validate`
only lints JS — nothing ran the `.gd` gate through its own gate until a seat verify caught it. Each
was a check masquerading as a gate. Trap-testing is the discipline that turns the second into the
first, once, on the record.
