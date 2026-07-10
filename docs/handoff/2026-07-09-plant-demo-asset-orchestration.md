# Orchestration plan — executing Nice-to-Have #8 (plant demo asset)

Companion to `2026-07-09-plant-demo-asset-plan.md` (the WHAT). Same protocol that
closed items #2–#7: Opus subagent per phase, orchestrator review between, independent
scoped review + seat check before merge. LAST actionable index item (9–12 are
do-nothing-until-trigger readiness docs).

## Working rules

- Branch: `feat/plant-demo-asset` off `main` (post item-#7 merge, `40ddfa3`).
- Track decision rule is the plan's: real model qualifies → headline asset, Track B
  dropped/parked; else Track B ships labeled "synthetic demonstration model"
  everywhere — never imply provenance (honesty bar non-negotiable).
- NOTICE bar per Duplex precedent: provenance, defensible redistribution, pinned
  sha256, WORKING mirror URL verified at build time (the dead-URL trap), IFC header
  check, size. License unclear → OUT regardless of looks.
- Sourcing spike TIMEBOXED — a day of plan-time, one subagent run here; verdicts
  (incl. dead URLs) written down so future sessions never re-walk them.
- Vendoring ceiling ~15 MB; bigger → download-with-pinned-sha256.
- Marketing shots: flag as human-paced, never publish (plan's own ban).

## Phase 1 — sourcing spike (subagent: Opus, timeboxed)

Track A candidates verified live (Clinic MEP/handover variants, xBIM demo/test repo
siblings, IfcOpenShell test collections, Auckland repo): URL alive, license clear,
`ISO-10303-21;` header, converts via ifc_convert.py, entity census (pump/tank/valve/
flow classes), join %, size. Verdict per candidate written down. Decision: Track A
winner or Track B. If B: de-risk stub — prove ifcopenshell in .venv-ifc can author a
minimal IfcTank+IfcPump file that converts + joins before committing to the track.

## Phase 2 — kit build (subagent: Opus, scope per track)

Asset in place (vendor/download/generate), binding_map.plant.example.json against
real GlobalIds (≥6 tags, ≥3 equipment classes), viewer.cfg.plant.example, NOTICE
entry or generator + doc header, gate green in a fresh clean-stranger scaffold from
the seat (kit README only).

## Phase 3 — demo integration (subagent: Opus)

Optimizer before/after findings addendum (plant profile vs duplex — likely more
instancing wins), one recorded plant session committed (feeds the analysis seam —
cross-plan payoff), examples README "which demo when", marketing shot-list note
(flagged human-paced), SEAMS += new example files (+ generator if B), roadmap/index
tick naming the track.

## Orchestrator gates

1. Line-by-line diff review per phase; Phase 1 extra: verify the license claims of
   any Track A winner myself before Phase 2 builds on it.
2. Independent scoped review before merge (acceptance criteria 1–6).
3. Seat check: boot the plant twin from the kit, painted, orchestrator-verified.
4. Merge no-ff to main, push, log. Index items 9–12 then get a closing note (triggers
   not fired — nothing to build), loop ends or reports completion.

## Status log

- [x] Phase 1 done + reviewed — seat commit `0af9e28`
      (twin-spikes/plant-sourcing/: VERDICTS.md, stub, evidence). DECISION: TRACK B
      (synthetic), Track A parked with a named fallback (Clinic HVAC: CC0, 6.1 MB GLB,
      100% join — but air-side only, zero pump/tank/valve → fails criterion 3; Clinic
      MEP has equipment but 125 MB IFC / 1 pump / hospital plumbing → fails size+flavor).
      Track B de-risked: stub IfcTank+IfcPump (IFC4) with real GlobalIds+psets converts
      and joins 2/2 100%. Gotcha recorded: IfcTank/IfcPump are IFC4-only (absent in
      IFC2X3). Dead URLs written down (buildingsmartalliance artifact URLs host-down,
      duraark.eu ECONNREFUSED — data survives at verified TIB mirror with pinned sha;
      Auckland repo = JS-SPA walk-cost trap). Orchestrator license gate moot (no real
      model shipped); CC0 re-check note (re3data r3d100012506) recorded should the
      fallback ever be used. Timebox deviation accepted: converting the 125 MB MEP made
      the size verdict evidence-based.
- [x] Phase 2 done + reviewed — `57a5065` (+866: gen_plant_ifc.py 409L in examples/
      — placement justified, demo generator ≠ pipeline tool, keeps user scaffolds clean;
      vendored plant.ifc 15,989 B IFC4 seed-42 with "synthetic demonstration model" in
      the STEP header; 8-tag/3-class binding map with self-documenting rows +
      re-derivation instructions; viewer.cfg variant; NOTICE generator entry; README
      kit block). Determinism proven byte-identical (seeded PRNG-derived guids, pinned
      timestamps — never guid.new()). Clean-stranger via twin_build.sh from fresh seat
      scaffold twin-plant-validate/ (left, mirrors twin-build-validate precedent):
      JOIN 18/18 100%, BIND-SMOKE 8/8 resolved 6 painted + 2 valve label-response,
      playback deterministic, twin-build: OK. Phase 3 owes: big-preset optimizer
      findings (default shows 0 instancing — below threshold, expected), plant
      recording, which-demo-when, SEAMS, roadmap tick.
- [x] Phase 3 done — demo integration on `feat/plant-demo-asset`. Optimizer findings addendum
      `twin-plant-asset-2026-07-10.md`: ran optimize_scene.gd on BOTH the vendored default (18 elem)
      and a `--tanks 40 --pumps 30` big preset (189 elem) — **groups_instanced 0/18 and 0/189,
      multimeshes 0, est_draw_items unchanged** at both scales. HONEST verdict CORRECTS the spike
      hypothesis: the plant is NOT an instancing showcase — the generator authors unique per-element
      geometry (0 `IfcRepresentationMap` vs the Duplex's 227) so every element is a distinct mesh
      resource; scale makes it worse, not better. Big IFC is a scratch artifact (generator+seed
      reproduce it — NOT vendored). Recording `plant-shift.ndjson` (4800 frames / 59.9 s / 8 tags,
      byte-identical on re-record, seat `twin-plant-validate/recordings/` per the `house-day.ndjson`
      precedent — recordings are project content, not vendored in examples/). README "which demo when"
      line; SEAMS protect-list += 6 plant example files (belt-and-suspenders); twin-import skill += 3
      dead URLs + verified TIB mirror (pinned sha256) + IfcTank/IfcPump-IFC4-only gotcha; roadmap #8
      ticked naming TRACK B (synthetic); index status updated. Marketing shot-list note in the finding,
      flagged human-paced (agents do not publish). `npm run validate` + `npm test` (185) green;
      prettier clean; findings index regenerated.
- [ ] Scoped review + seat check
- [ ] Merged to main, index ticked
