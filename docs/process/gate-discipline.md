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
6. File the RED and GREEN outputs verbatim in a `plugin/library/findings/` note.

The trap catalog exists so this is repeatable: you never reinvent the corruption per gate, and a new
gate joins the framework only once its RED→GREEN pair is on record.

## The shell recipe — let the EXIT trap own the terminal path (`tools/lib/verdict.sh`)

The "every terminal path writes its verdict artifact" corollary is easy to state and easy to VIOLATE
one path at a time. It did — four times. A gate's happy path writes a green `status.json` /
`retarget.json` / `--json` manifest; then someone finds a NEW way to exit (a setup failure before the
writer, a corrupt sidecar, a re-run against a fixture that still carries a prior PASS) and the stale
green survives, badging green on a dead run:

- `check_twin_join.gd` — a corrupt `--json` file was clobbered, dropping evidence (fix `0d7f9db`).
- `smoke_binding.gd` — a setup failure (`_binder == null`) exited FAIL without touching the status
  file, so a previously-green `binding_map.status.json` kept `/api/binding-status` badging GREEN on a
  dead map (fix `27423c6`).
- `twin_ship.sh --retarget` — `retarget.json` was written only inside the happy-path block, so a
  failing rerun left the stale PASS; and the retarget SMOKE could fail AFTER the PASS manifest was
  already written (fix `1c2a9a2`).

Each fix hand-added "write the FAIL verdict on THIS newly-noticed path too". That is patching the
symptom: the next unnoticed path reintroduces the class. The durable fix is to stop enumerating paths
and let ONE trap own the terminal:

> **Arm a fail-closed EXIT trap once, at the top of the gate. If the gate exits having neither marked
> its PASS final nor written an explicit FAIL, the trap writes an honest FAIL over whatever was there.
> A gate can no longer FORGET a terminal path, because it no longer enumerates them.**

`tools/lib/verdict.sh` is that trap, factored out as the shell twin of `tools/lib/gate_report.gd`
(which already did this for the `.gd` gates — the shell side simply had no equivalent). Source it the
way `checks.sh` is sourced, then:

```bash
XENO_GATE="twin-ship"
source "$SCRIPT_DIR/lib/verdict.sh"
verdict_arm "$MANIFEST_PATH" "$ARTIFACT"   # "" path ⇒ no --json ⇒ the writer is a no-op; trap still armed
verdict_stage preflight                     # label stamped into a fail-closed manifest
... work; each real failure routes through a _fail helper that calls verdict_fail then exits ...
verdict_pass                                # ONLY after the last thing that could fail — keeps the PASS
```

Trap-test it like any gate — same source, opposite verdicts, driven only by which terminal path is
taken (proven on this machine, Apple M3 Pro / Godot 4.6.3.stable):

1. **explicit FAIL** — a failing rerun (`--retarget … --model <bogus> --json`) against an artifact
   carrying a prior PASS `retarget.json` → the manifest becomes `{status:"FAIL", stage:"preflight", …}`,
   the stale PASS gone; exit 1.
2. **GREEN** — the SAME command with a real `--model` → the PASS manifest shape returns (no `status`
   field); exit 0.
3. **unrouted death** — the structural case the four fixes missed: seed a stale PASS, then exit on a
   path the gate NEVER routed through its fail helper (a `set -u` unbound var, a killed step) → the
   trap fail-closes to `{status:"FAIL", stage:"<last stage>", reason:"… exited on an unrouted path …"}`.
   Before `verdict.sh` this left the stale PASS; now it cannot.

The first consumer is `twin_ship.sh --retarget` (behavior and manifest shape byte-identical to the
former inline writer — the library only ADDS the trap that catches the paths the inline writer could
not). New shell gates adopt the same three calls and inherit the guarantee for free.

## Why this doc exists

Gates that were never trap-tested have shipped here and lied: a stale-green `status.json` survived a
setup failure (fixed twice), a silently-unbound binding id passed a smoke that never asserted it, and
a gate's own tool drifted out of `gdformat`/`gdlint`-clean because the framework's `npm run validate`
only lints JS — nothing ran the `.gd` gate through its own gate until a seat verify caught it. Each
was a check masquerading as a gate. Trap-testing is the discipline that turns the second into the
first, once, on the record.
