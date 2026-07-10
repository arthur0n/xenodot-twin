---
type: finding
title: "twin-gate-trap — the JOIN gate bites: 3505/3505 OK → 3100/3505 FAIL → OK, one command"
description: "Proof the GlobalId join-coverage gate is a real trap-catcher, not theatre: on the Schependomlaan seat a named, reversible sidecar-key truncation (drop 408 trailing keys, a partial IFC property extraction) flips check_twin_join.gd from JOIN 3505/3505 (100%) OK to 3100/3505 (88.4%) FAIL and back to OK under one unchanged command — and surfaces through the composed verify_twin.sh too. A DIFFERENT gate/trap than the binding-overlay unit's bind-smoke/unbound-tag pair. Also lands the framework harvest: a shared gate-report verdict writer, a trap catalog, docs/process/gate-discipline.md, and a UI gate-verdict strip whose badges flip red→green in a real browser."
timestamp: 2026-07-10T20:00:00+01:00
tags:
  [
    twin-verify,
    gate,
    join-coverage,
    trap-test,
    red-green,
    gate-discipline,
    gate-report,
    ui-badge,
    reproducibility,
  ]
---

# twin-gate-trap — proving a gate actually gates (red → green, one unchanged command)

The differentiator over "an agent that builds a viewer": a gate is only a gate if it goes **RED on
bad input and GREEN on good**, under one unchanged command on one fixture. This is that proof for the
**GlobalId join-coverage** gate (`tools/check_twin_join.gd`), run on the `xt-poc2` Schependomlaan
twin (6/6 green seat). It is a **different gate and a different trap** than the binding-overlay unit's
bind-smoke / unbound-tag pair — the two units prove two different gates, not the same one twice.

One-machine caveat: Apple M3 Pro, Metal, shadows off, Godot 4.6.3.stable, gdformat/gdlint 4.5.0,
ifcopenshell as installed in `.venv-ifc`. Fixture: `models/Schependomlaan.glb` (3505 mesh nodes) +
`models/Schependomlaan_props.json` (3508 GlobalId keys).

## The trap (named, reversible, single file, byte-backed-up)

Simulate a **partial / aborted IFC property extraction**: the sidecar writer processed only the first
3100 of 3508 products before dying, so a contiguous trailing block of 408 GlobalId keys is missing.
The edit is one file, reversible, and the original was byte-backed-up before touching it:

```bash
cp models/Schependomlaan_props.json models/Schependomlaan_props.json.orig   # byte backup
python3 -c "import json; p='models/Schependomlaan_props.json'; d=json.load(open(p)); \
  k=list(d.keys()); json.dump({x:d[x] for x in k[:3100]}, open(p,'w'))"       # drop 408 trailing keys
# … capture RED …
cp models/Schependomlaan_props.json.orig models/Schependomlaan_props.json    # restore (sha identical)
```

The restored file's SHA-256 matched the backup byte-for-byte (`2c1ed115dbe9…400ffe`).

## RED — verbatim (corrupted sidecar), exit 1

Command (the identical baseline command, unchanged):

```
$GODOT --headless --path . --script tools/check_twin_join.gd -- \
    --scene=models/Schependomlaan.glb --sidecar=models/Schependomlaan_props.json
```

```
SIDECAR_KEYS=3100
JOIN-SOURCES: mesh_nodes=3505 multimesh_ids=0
MISS_SAMPLE=["1aosfa1i1FE8Yy19Vu7K8F", "0ekbFk1v17_RdKwDCAIChx", "1Ix30zFZz3d92sIz$T_XCL", "2D0kiGPOL269V91_yWkgm2", "03AldB3qrAAvfaa6RuJUzJ"]
JOIN: 3100/3505 (88.4%)
JOIN-GATE: FAIL (min 95.0%)
```

Exit code: **1**. The `MISS_SAMPLE` names real missing GlobalIds — the diagnostic points at the
dropped block, not a synthetic assertion.

## GREEN — verbatim (restored sidecar), exit 0

Same command, unchanged, after `cp …orig …`:

```
SIDECAR_KEYS=3508
JOIN-SOURCES: mesh_nodes=3505 multimesh_ids=0
JOIN: 3505/3505 (100.0%)
JOIN-GATE: OK (min 95.0%)
```

Exit code: **0**. Same fixture, same command, same threshold — opposite verdicts, driven only by the
input flipping corrupt → sound. **That red→green pair is the whole proof.**

## It composes — through `verify_twin.sh`, not just the standalone script

The composed gate a real CI/agent run uses surfaces the same failure (RED exits at the join step,
after the static floor passes; GREEN runs the whole stack):

```
# corrupted:
verify-twin: PASS format … PASS smoke
JOIN: 3100/3505 (88.4%)
JOIN-GATE: FAIL (min 95.0%)
verify-twin: FAIL join-coverage — see JOIN/MISS_SAMPLE lines above         # exit 1
# repaired:
JOIN: 3505/3505 (100.0%)  →  verify-twin: PASS join-coverage
BIND-SMOKE: OK — 6 node target(s) … 0 drops  →  verify-twin: PASS binding-smoke
verify-twin: PASS playback-determinism (… over 160 frame(s))
verify-twin: OK                                                            # exit 0
```

## Incidental catch — the gate's own tool had drifted out of gate-clean

Setting up the composed run, the **static floor caught `tools/check_twin_join.gd` itself** as neither
`gdformat`- nor `gdlint`-clean (`would reformat …`; lines >100 chars). The `--json` verdict feature
had been added to that gate without ever being run through the gate's own `verify_twin.sh`, because
the framework's `npm run validate` only lints the JS UI (tsc + eslint) — **nothing runs the shipped
`.gd` gate scripts through gdformat/gdlint except a seat verify**. A real, latent gap; the composed
gate did its job. Fixed as part of the harvest (all four gate files now `gdformat --check` +
`gdlint`-clean under the seat config), and codified in `docs/process/gate-discipline.md`.

## Framework harvest (delivered, invocable)

- **Tool — shared verdict writer.** `plugin-twin/tools/lib/gate_report.gd` (`GateReport.merge_write`)
  now owns the merge / corrupt-file-sibling / write / `<GATE>-JSON:` mechanics; `check_twin_join.gd`,
  `smoke_binding.gd`, and `check_playback.gd` (the last gaining a `--json` verdict it never had) all
  call it, so every gate emits ONE machine-readable shape and none can drift. Proven: one metrics
  file carried `import_ms` + `join_*` (OK) + `playback_*` (OK) merged side by side from three
  independent invocations; the corrupt-file path preserved a non-JSON original and wrote the verdict
  to a `.join.json` sibling instead of clobbering it.
- **Skill — trap catalog.** `skills/twin-verify/SKILL.md` gained a "Machine-readable verdicts" section
  and a **Trap catalog** table: the named, reproducible corruption that makes each gate go RED
  (sidecar-key truncation → JOIN, bad GlobalId → BIND-SMOKE, diverging value → PLAYBACK), so future
  units trap-test without reinventing the corruption.
- **Convention.** `docs/process/gate-discipline.md` (new): _a check is not a gate until it is
  trap-tested — proven RED then GREEN under one unchanged command on one fixture._
- **UI surface — gate-verdict strip.** The assets import card already flipped a JOIN badge from
  `<model>.metrics.json`; it now renders a **strip** (`gateStrip`) with a badge per gate present —
  JOIN and the newly-surfaced PLAYBACK (`import-metrics.js` + `ImportMetric` typedef extended).
- **Verification gate — observed in-UI flip.** With the UI server pointed at the seat, a corrupted
  metrics file rendered `✗ join gate FAIL  ✗ playback gate FAIL` in red (`rgb(248,81,73)`) and the
  repaired file rendered `✓ join gate OK  ✓ playback gate OK` in green (`rgb(63,185,80)`) — captured
  in a **real headed browser** over CDP (spikes: `badge_red.png` / `badge_green.png`), not just a log.

`npm run validate` (tsc + eslint, zero warnings) exits 0 with the UI changes; all four gate `.gd`
files are `gdformat --check` + `gdlint`-clean under the seat config.
