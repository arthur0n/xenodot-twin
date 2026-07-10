---
type: finding
title: "extensibility spine — friction grown into a shell verdict library, and a forecast producer painted through the unmodified seam"
description: "Two proofs the framework boundary is a door, not a wall. (A) The stale-green/stale-manifest bug class recurred FOUR times across independent implementers (check_twin_join.gd 0d7f9db, smoke_binding.gd 27423c6, twin_ship.sh --retarget twice 1c2a9a2) — each fix hand-added a FAIL write on one newly-noticed terminal path. Grew the framework response instead of patching again: tools/lib/verdict.sh, a shared shell verdict emitter (the shell twin of gate_report.gd) whose armed EXIT trap OWNS the terminal path — a gate can no longer forget one. Wired into twin_ship.sh --retarget as first consumer, manifest shape byte-identical. Trap-tested on one unchanged command: failing rerun -> FAIL{preflight} over a stale PASS (exit 1); real model -> PASS shape restored (exit 0); unrouted death -> trap fail-closes to FAIL{assemble, 'exited on an unrouted path'} where the four fixes would have left stale green. shellcheck 0.11 clean, zero new disables; gate-discipline.md + twin-verify SKILL grown. (B) A dependency-free forecast producer (tools/sim/forecast.js) publishes PREDICTED values (least-squares projection, horizon 30 ticks) in the IDENTICAL wire shape {tag,value,seq,sent_ms}; the unmodified Schependomlaan viewer painted them through the SAME url= the sim uses — bindings 6/6, HUD facade_roof.temp=23.049 matching the producer's projection at seq 56 exactly, sweeping to 14.163 at seq 63. git diff on core/data_bus.gd + core/binding_map.gd EMPTY; viewer.cfg untouched. Honest boundary: the HUD labels the connection 'LIVE' and cannot distinguish forecast from live — the seam is origin-agnostic precisely because the viewer does not care. One machine: Apple M3 Pro, Metal, shadows off, Godot 4.6.3.stable."
timestamp: 2026-07-10T21:00:00+01:00
tags:
  [
    extensibility,
    verdict-library,
    stale-green,
    gate-discipline,
    trap,
    shellcheck,
    twin-ship,
    forecast,
    predicted-values,
    databus,
    origin-agnostic,
    no-core-change,
    viz-not-sim,
    metal,
  ]
---

# Extensibility spine — the boundary is a door

Two independent proofs that a stranger extends this framework without touching its core: (A) a real,
four-times-recurring friction was grown into a shared capability that structurally prevents its
recurrence; (B) a new kind of data source — a producer of PREDICTIONS — painted a real building
through the one unmodified DataBus seam. Both are on record with RED→GREEN pairs, not claims.

## Part A — friction observed 4× → capability grown → recurrence structurally prevented

### The friction (cited, not invented)

The stale-green / stale-manifest class: a gate's happy path writes a green verdict artifact
(`status.json` / `retarget.json` / `--json`), then a NEW terminal path exits without rewriting it, so
a later reader (a UI badge, CI) inherits a pass the run never earned. It recurred four times, across
independent implementers, each fix hand-adding "write the FAIL verdict on THIS path too":

- `check_twin_join.gd` — a corrupt `--json` file was clobbered, dropping evidence (fix **0d7f9db**).
- `smoke_binding.gd` — a setup failure (`_binder == null`) exited FAIL without touching the status
  file; a previously-green `binding_map.status.json` kept `/api/binding-status` badging GREEN on a
  dead map (fix **27423c6**).
- `twin_ship.sh --retarget` — `retarget.json` was written only inside the happy-path block, so a
  failing rerun left the stale PASS; and the retarget SMOKE could fail AFTER the PASS manifest was
  already written — a PASS-written-before-the-check-that-fails variant (fix **1c2a9a2**).

The `.gd` gates had been unified under `tools/lib/gate_report.gd` (`GateReport.merge_write` rewrites
every field on every run). The SHELL gates had no equivalent — each hand-rolled its own manifest I/O,
and each hand-rolled a new missed path.

### The capability grown

`plugin-twin/tools/lib/verdict.sh` — the shell twin of `gate_report.gd`. It stops enumerating terminal
paths and lets ONE armed EXIT trap own the terminal:

```bash
XENO_GATE="twin-ship"
source "$SCRIPT_DIR/lib/verdict.sh"
verdict_arm "$MANIFEST_PATH" "$ARTIFACT"   # "" path ⇒ no --json ⇒ writer is a no-op; trap still armed
verdict_stage preflight                     # label stamped into a fail-closed manifest
...  # every real failure routes through _rfail → verdict_fail → _fail (writes FAIL, then fails loud)
verdict_pass                                # ONLY after the last thing that could fail — keeps the PASS
```

If the script exits having neither marked `verdict_pass` nor written an explicit `verdict_fail` — the
exact way the four bugs slipped through — the trap writes a fail-closed FAIL over whatever green was
there. The handler is INLINE (not a named function) so no trap-only function trips shellcheck SC2317
across versions: **zero new disables**, and `check:sh` (shellcheck 0.11.0 local, `-x`) is clean.

First consumer: `twin_ship.sh --retarget`. The former inline `_rfail` writer became a thin shim over
`verdict_fail`; the FAIL manifest shape (`{status, stage, reason, artifact}`) and the PASS manifest
are **byte-identical** — the library only ADDS the trap that catches paths the inline writer could not.

### Trap-tested — same command, opposite verdicts (this machine)

Against the seat's shipped Schependomlaan artifact (a scratch copy carrying a prior PASS
`retarget.json`), one unchanged `--retarget … --json` command:

1. **RED (explicit)** — `--model <bogus>` → `retarget.json` becomes
   `{status:"FAIL", stage:"preflight", reason:"--retarget: no such model …"}`, stale PASS gone; exit 1.
2. **GREEN** — same command, real `--model` → PASS manifest returns (no `status` field); exit 0; the
   `WORK` scratch dir cleaned by the verdict trap (no leftover tmp).
3. **RED (unrouted)** — the structural case the four fixes missed. A harness seeds a stale PASS then
   exits on a path never routed through the fail helper (`exit 7`) → the trap fail-closes to
   `{status:"FAIL", stage:"assemble", reason:"… exited on an unrouted path (exit 7) …"}`. Before
   `verdict.sh` this left the stale PASS; now it cannot.

Grown alongside: `docs/process/gate-discipline.md` gained "The shell recipe — let the EXIT trap own the
terminal path", and the `twin-verify` SKILL now documents the shell verdict library beside
`gate_report.gd`. This is the seat-learning → framework-capability round trip: a repeated implementer
mistake became a shared tool that removes the class, not another patch.

### Promotion path (human-gated)

This is a framework-repo change, so it lands via the framework-repo review path named in
`docs/process/promotion.md`: staged as a local, **unpushed** commit for human review — the framework
analogue of a seat's `mcp__ui__promote {kind,name,reason}` → `.xenodot/promotions.json` → human
approves → `npm run promote -- --pending`. Nothing pushed; the human is the gate.

## Part B — a forecast producer, painted through the unmodified seam

### The producer

`plugin-twin/tools/sim/forecast.js` — a dependency-free `node` source emitting the IDENTICAL DataBus
wire shape as `tools/sim/server.js`: `{tag, value, seq, sent_ms}`, same RFC 6455 framing
(`protocol.js`) and CLI/tag-table plumbing (`stream.js`, `--map` derives tags + ranges from the binding
map). The one difference is the value: each is a **forecast** — a least-squares linear projection over
a short seed window (`--window 20`), extrapolated a fixed horizon (`--horizon 30` ticks) PAST the
window's end and clamped to `[min,max]`. The projection is done in the PRODUCER; the framework does not
forecast anything — it visualizes what the producer publishes.

Standalone gate: run on the seat's real 6-tag Schependomlaan map, a bare `ws://` client read valid
frames — 6/6 tags, keys `sent_ms,seq,tag,value`. No Godot involved.

### Painted through one unmodified seam

The seat's UNMODIFIED viewer was pointed at the forecaster using the SAME field every source uses —
here, the forecaster simply ran on the seat's EXISTING `url="ws://localhost:8765"`, so even
`viewer.cfg` was untouched: a different producer behind the identical address. Windowed boot →
`viewer: bindings resolved 6/6`; HUD:

- Frame 1: `tags: 6 | facade_roof.temp=23.049 seq=56` — and the forecaster's own projection for that
  tag at seq 56 computes to **23.049** exactly: the twin is painting the predicted value.
- Frame 2 (~2 s later): `facade_roof.temp=14.163 seq=63` — the forecast stream swept toward the cold
  end; a live-updating prediction, not a static frame. Still 6/6 resolved.

Empty-core-diff proof (captured to the seat's `spikes/extensibility/empty-core-diff.txt`):
`git diff --stat -- core/data_bus.gd core/binding_map.gd` is EMPTY, both files tracked and clean,
`viewer.cfg` unmodified. Adding a whole new CLASS of source cost zero edits to any shipped runtime
file.

### The seam, stated honestly

The bind is `GlobalId → tag namespace`. Any producer that publishes `{tag, value, seq, sent_ms}` to the
`url=`/`sourceUrl` field paints identically: a seeded sim, an MQTT bridge, a recording, or this
forecaster. That is why **"visualization, not simulation" is a STATED CHOICE, not a limitation** — the
framework paints whatever a producer sends; simulation stays out of scope by design, and a producer of
predictions is just a third thing behind the same door.

Honest boundary (per the plan, not glossed): the HUD labels the connection **`DataBus: LIVE`** and has
no notion of "forecast" vs "live" — it shows `facade_roof.temp=23.049` the same whether that number is
a sensor reading, a replayed frame, or a projection. That is not a gap to hide; it is the mechanism.
The seam is origin-agnostic *because* the viewer does not care where the number came from. Labelling a
value as predicted vs measured would be a producer-metadata concern layered ON TOP, not a core change.
Copy discipline: the forecast is visualization of externally-produced predictions — the framework does
not simulate or forecast; the producer does.

## One-machine caveat

All measurements: Apple M3 Pro, Metal Forward+, shadows off, macOS Darwin 25.5, Godot 4.6.3.stable,
shellcheck 0.11.0. Evidence: `spikes/extensibility/{forecast_paint.png, forecast_paint_2.png,
forecast-stats.json, empty-core-diff.txt}` in the disposable xt-poc2 seat.
