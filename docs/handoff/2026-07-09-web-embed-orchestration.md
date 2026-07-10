# Orchestration plan — executing Nice-to-Have #6 (web/Grafana embed story)

Companion to `2026-07-09-web-embed-plan.md` (the WHAT). Same protocol that closed
items #2–#5: Opus subagent per phase, orchestrator review between, independent scoped
review + seat check before merge.

## Working rules

- Branch: `feat/web-embed` off `main` (post item-#5 merge, `71e90da`).
- MEASUREMENT-FIRST item: all three outcomes shippable (full Grafana recipe /
  companion-tab-only / negative). Never force an outcome; the findings file ships in
  every case.
- **Pre-declared usability floor (named BEFORE measuring, per the plan's rule):
  the embeddable (no-threads) variant is "usable" iff it holds ≥30 fps at the street
  vantage on the optimized duplex with live binding active. City scene informs
  scale guidance but does not gate usability.**
- Spike tooling stays seat-local (twindemo/twin-spikes/); only Phase 3 promotes the
  recipe + tool into the framework, scope per outcome.
- Browser-measurement honesty: what could not be scraped programmatically is
  labeled (e.g. Safari console access); browser + Godot versions pinned; vsync cap
  noted (sub-cap frame_ms is the differentiator, same as native).
- Grafana iframe attempts: local Grafana (docker fine) — both variants attempted,
  the expected threads failure IS a finding. If Grafana cannot run on this machine,
  record why and flag; do not fake.

## Phase 1 — measure (seat spike; subagent: Opus)

Web exports (threads + no-threads) of optimized duplex + c2-optimized city from the
s3-scale spike lineage; COI serve via the spike's serve.py; matrix 2 builds × 2
scenes × 2 browsers (Chrome, Safari; Firefox opportunistic) × 2 vantages (native
bench coordinates), live sim→ws→DataBus binding active; record fps/frame_ms, load
to first frame, transfer sizes, memory, DataBus frames/drops; 2 Grafana iframe
attempts; evidence committed to the seat repo.

## Phase 2 — decide from data (orchestrator + subagent analysis in Phase 1 report)

Apply the pre-declared floor → pick outcome (recipe / companion-tab / negative).
Orchestrator sanity-checks numbers vs the floor before Phase 3 scope is fixed.

## Phase 3 — ship the recipe (framework; subagent: Opus, scope per outcome)

serve_coi tool promotion (runtime decision recorded), annotated export preset
examples, tutorial + relay-notes docs citing only measured numbers, findings file
`twin-web-ceiling-<date>.md` (ships in EVERY outcome), CAPABILITIES/SEAMS/roadmap
tick naming the outcome.

## Orchestrator gates

1. Line-by-line diff review per phase; numbers sanity vs the pre-declared floor.
2. Independent scoped review before merge.
3. Seat check: serve a build locally, confirm COI headers via curl, boot in a
   browser (orchestrator-verifiable part).
4. Acceptance criteria 1–5.
5. Merge no-ff to main, push, log — then next index item.

## Status log

- [x] Phase 1 done + reviewed — seat commit `b105cc9`
      (twin-spikes/web-ceiling/: NOTES.md tables, chrome_raw.jsonl + summary, verbatim
      Grafana console logs both variants, overlay + CDP drivers, presets). Chrome 12/12
      cells (2 builds × 3 scenes × 2 vantages, live binding 6/6, 0 drops). FLOOR: PASS
      ~4× (no-threads duplex street 120 fps display-capped, cpu 0.58 ms). Threads vs
      no-threads: no delta beyond noise (Godot 4 web renderer single-threaded) — the
      embeddable variant costs nothing. Ceiling: 28.6k-unique-mesh city ~17 fps aerial
      (cpu ~41 ms ≈ 10× native Metal) — the added third scene (accepted deviation; the
      planned two never broke the cap, no ceiling to report without it). Grafana:
      threads iframe DOA (SharedArrayBuffer missing — no COEP on Grafana doc, verbatim
      console), no-threads BOOTS live-bound at 120 fps inside a real Grafana panel.
      Safari 0/12 BLOCKED: three TCC/interactive barriers (Automation, Screen
      Recording, safaridriver remote-automation toggle) — standing open item for the
      user, honestly flagged, not faked. Load ~40 MB, <1 s first frame localhost.
- [x] Phase 2 decision recorded — FULL GRAFANA RECIPE (no-threads variant), plan's
      first outcome. Caveats named for Phase 3 docs: (1) scale ceiling — optimize/
      instance many-unique-mesh scenes; (2) Safari unverified on this machine.
- [x] Phase 3 shipped on `feat/web-embed` (pending scoped review + merge). Promoted the COI
      server → `plugin-twin/tools/web/serve_coi.py` (**runtime: python3 stdlib** — dependency-free,
      matches `ifc_convert.py`, promotes the exact server the ceiling was measured through, rides the
      recursive tools copy with a shebang chmod; COOP+COEP + wasm/pck MIME + no-cache, `--dir`/`--port`);
      the two annotated presets `plugin-twin/examples/export_presets.web-{nothreads,threads}.cfg`; the
      findings file `plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md` (full Chrome 12/12
      matrix, both verbatim Grafana outcomes, Safari-blocked caveat, seat `b105cc9` provenance);
      tutorial and `twin-bind-data` relay-note web-embed sections; and CAPABILITIES/SEAMS/roadmap/index
      housekeeping. Proofs: `serve_coi` curl'd (COOP/COEP + `application/wasm` + no-store) and booted
      the real spike build in Chrome live-bound (120 fps, 6/6, 0 drops); the nothreads example preset
      drove a real headless Godot web export; the materializer lands `tools/web/serve_coi.py` at mode
      755; `npm run validate` + `npm test` green, prettier clean.
- [ ] Scoped review + seat check
- [ ] Merged to main, index ticked
