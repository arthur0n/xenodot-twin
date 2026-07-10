# Handoff + internal roadmap — 2026-07-09

Written at the close of the two-day session that researched, built, forked and shipped
this product. Self-contained on purpose: the next session — **any model** — should be able
to pick up from this file plus the repo, with no prior conversation context.

## What this product is (one paragraph)

Xenodot Twin is an AI agent framework on the Claude Code SDK that works WITH you to build
**digital-twin visualization** apps on Godot: import a building/plant model (IFC → GLB with
every element joined to its property record), optimize it to interactive frame rates,
bind live sensor values to the actual 3D elements, and scrub recorded history — all
behind deterministic gates (`tools/verify_twin.sh`). Honest wording rule: say
_visualization_, not _simulation_, until simulation exists. Claude Code / Anthropic is
the system that supports twin **creation** (and, in the future, analysis and simulation);
other models will plug in later as analysis workers — see the roadmap.

## State of the world (verified at handoff)

- **This repo** (`github.com/arthur0n/xenodot-twin`): product-ready by clean-stranger
  acid test — clone → `npm install` → `validate`/`test` green → `npm run new -- ../house`
  scaffolds a viewer → tutorial (`docs/tutorials/digital-twin.md`) + bundled kit
  (`plugin-twin/examples/`) reach a live, data-painted twin with zero manual steps.
  16+6 skills, 10+3 agents, D10 audit dimension in place.
- **Upstream** (`github.com/arthur0n/xenodot-forge`): games only again; this fork pulls
  curated framework wins via `.claude/commands/sync-upstream.md`. The conflict contract
  and permanent divergences live in `docs/fork/SEAMS.md` — read it before ANY sync; the
  first sync proved git silently re-applies upstream's twin deletions unless the
  protect-list is restored.
- **Seats** (the self-improvement model): the human develops the framework FROM INSIDE
  each domain's workspace. `twindemo/` (repo `github.com/arthur0n/twindemo`) is the twin
  seat — its `house/` project and demos are the daily test bed; framework improvements
  commit in the seat's clone and push here; workspace files push to the twindemo repo.
  Mirror of the game seat (`mercenary/` ↔ `arthur0n/pain`).
- **Proven numbers** (one machine — M3 Pro/Metal, shadows off; caveats in
  `plugin-twin/library/findings/`): IFC→GLB ~1.1 s with 286/286 GlobalId join; optimizer
  ≥4.4× on repeated-geometry scenes (auto-chunked MultiMeshes, join preserved through
  optimization); live binding ~5 ms avg, 0 drops; playback determinism sha256-gated.
- **Marketing** (`docs/marketing/`): LinkedIn draft + long-form + demo shot list, staged,
  NOT published. The two research-refuted claims are permanent bans (see
  `docs/research/landscape-2026-07.md`): never claim hobby twins default to Unity; never
  claim a Cesium-for-Godot gap.

## Where an agent framework genuinely has an advantage — and where NONE

The filter applied to every research thread: _does agent orchestration + deterministic
gates + self-improving skills add real leverage here, or is this just software any team
writes once?_ Honest verdicts, including NONE.

**REAL advantage — proven already (double down):**

- **Import pipelines with fiddly, documented workflows.** The IFC path (venv trap, dead
  sample URLs, serializer flags, sidecar join) is exactly agent-shaped: encoded once in
  `twin-import`, executed reliably forever, gate-verified. Same shape for every future
  format.
- **Applying the engine's manual optimization toolkit.** Godot ships the tools but leaves
  them manual (occluders, visibility ranges, chunking); the measured win came from an
  agent-applied, gate-verified pass with honest per-scene judgment (chunks=auto, occlusion
  toggleable). This is the product's core differentiator — no competitor automates it.
- **Authoring the data layer as reviewable data.** Binding maps, hint sidecars, recording
  fixtures — agents emit JSON humans can diff, gates verify the join and the painting.
  The two-layer design (agent-authored data → deterministic tool materializes) is the
  house pattern; keep extending it.
- **Verification itself.** Every claim in the marketing material is backed by a gate.
  That discipline is the framework, not a feature of it.

**Advantage NONE or LOW (do not invest as if differentiating):**

- **Protocol stacks (OPC UA, BACnet, full MQTT brokers).** Classic write-once software;
  the peer-reviewed architecture keeps them at the edge anyway (the 3D scene never
  speaks OPC UA). Use existing bridges (Node-RED, Mosquitto); our seam is `sourceUrl`.
  An agent writes the adapter no better than a library does.
- **Streaming/tiling tech (competing with Cesium 3D Tiles, Omniverse).** Years of
  rendering engineering; not agent-shaped; not our fight.
- **Physics/process simulation engines.** Domain solvers, not orchestration. If
  "simulation" ever enters this product, it enters as _scenario authoring and what-if
  orchestration on top of an existing solver_ — where agents DO have leverage — never as
  building the solver.
- **Format parsers in C++ (native USD/point-cloud GDExtensions).** Not agent-shaped;
  the agent-shaped version is an offline conversion pipeline (like IFC), which IS viable.

## Internal roadmap

### Must Have (credibility for the first real user/demo)

1. ~~**MQTT source adapter behind `sourceUrl`.**~~ ✅ **DONE (2026-07-09, merged to `main`).**
   The first question every real visitor asks is "can it talk to my broker?" The relay seam
   was designed for exactly this; the sim's `stream.js`/`protocol.js` split means the adapter
   is a bounded Node module with tests. Research-validated architecture: edge bridge →
   MQTT/WS → viewer. Built per `2026-07-09-mqtt-adapter-plan.md`: dependency-free MQTT 3.1.1
   QoS-0 bridge at `plugin-twin/tools/bridge/` (`mqtt_protocol.js` + `map.js` + `mqtt_ws.js`),
   28 tests (codec + §4.7 mapping + in-process fake-broker integration), relay untouched, ships
   via the materializer under bare `node`. Live-validated broker→bridge→viewer paint against
   Mosquitto: `plugin-twin/library/findings/twin-mqtt-bridge-2026-07-09.md`.
2. ~~**One-command pipeline: import → optimize → verify.**~~ ✅ **DONE (2026-07-09, built on
   `feat/twin-build` — validated from the seat, pending merge to `main`).** Built per
   [`2026-07-09-twin-build-plan.md`](2026-07-09-twin-build-plan.md): `plugin-twin/tools/twin_build.sh`
   (preflight → import → optimize → verify → summary, loud stages, SKIP-is-not-pass) + the
   `twin-build` operator skill; the viewer now loads the optimizer's `.tscn` at runtime and the
   gate's binding smoke is pinned to that optimized scene. Clean-stranger seat run (fresh
   scaffold + bundled Duplex + example map, ONE command): all gates green — **join 286/286,
   binding-smoke 6/6**, exit 0 — in **~19.5 s cold**, measured with machine caveats in
   [`plugin-twin/library/findings/twin-build-2026-07-09.md`](../../plugin-twin/library/findings/twin-build-2026-07-09.md).
3. ~~**De-game the internal persona prompts.**~~ ✅ **DONE (2026-07-09, built on
   `feat/degame-personas` — landed + validated from the seat, pending merge to `main`).**
   Built per [`2026-07-09-degame-personas-plan.md`](2026-07-09-degame-personas-plan.md):
   `hermes-soul.md` reworded to domain-NEUTRAL family framing (both products named — the
   soul is machine-global, shared with the forge seat), both `personas/{researcher,critic}`
   briefs twin-branded with the behavioral sentences byte-identical, both MCP tools
   (`hermes`/`promote`) to neutral "project" wording, `cli/new.js` gitignore banner
   de-branded; plus the soul-upgrade trap fix (`LEGACY_SOUL_TEMPLATES` + replace-and-report
   in `hermes-setup.js`, legacy-soul WARN in `hermes-check.js`). Landed on the dev machine:
   `hermes:setup` reported replacing the legacy Xenodot soul template in `~/.hermes/SOUL.md`
   (now the neutral family text), HOME=tmp both-paths proven (legacy replaced / customized
   kept); `npm run validate` + `npm test` green.
4. ~~**Benched LOD/visibility-range recipe.**~~ ✅ **DONE (2026-07-09, built on
   `feat/vis-range-recipe` — swept from the seat, pending merge to `main`). Outcome: SCOPED WIN.**
   Phase 1 parameterized the pass (four `--vis-*` flags, `5853234`); a 6-config × 3-scene sweep
   (seat `a6c0707`) showed `--vis-ranges` is a large, beyond-noise win ONLY on many-unique-mesh
   scenes (unique-city aerial cpu 4.13 → 2.81 ms, **−32%** at defaults; **−71%** coarser;
   fps 163 → 530), essentially nothing on a realistic single building (duplex flat at street,
   ≤0.04 ms aerial), and a proven no-op on fully-instanced scenes (`vis_ranges_set==0`, negative
   control). Defaults 0.5/2 → 40/120 kept as-is (the perceptually-clean scoped winner);
   coarser/aggressive win more cpu but hard-pop at ~60 m and are NOT adopted without a fade margin
   (future work, measured-before-adoption). `--vis-ranges` stays opt-in in `twin-build`. Recipe +
   tables + machine caveats:
   [`plugin-twin/library/findings/twin-vis-range-recipe-2026-07-09.md`](../../plugin-twin/library/findings/twin-vis-range-recipe-2026-07-09.md).

### Nice to Have (differentiation + the human's stated direction)

5. ~~**Multi-model analysis seam.**~~ ✅ **DONE (2026-07-10, built on `feat/analysis-seam` —
   seat-validated, pending merge to `main`). Outcome: real non-Anthropic report, all guardrails
   held.** Built in three phases per
   [`2026-07-09-analysis-seam-plan.md`](2026-07-09-analysis-seam-plan.md): the seam IS the two
   contracts — `plugin-twin/tools/analyze/{bundle,stats}.js` packs a recording (+ binding map +
   property sidecar) into ONE deterministic, byte-stable, size-budgeted bundle (**data-in**), and the
   framework writes an advisory Markdown report to `reports/analysis/` naming its provider+model+bundle
   hash (**report-out**). The worker is a swappable adapter (`openai-compatible` endpoint, `hermes`, or
   a human pasting the bundle into any chat UI) driven by `npm run analyze`; `twin-analyze` is the
   operator skill. **AC4 (the point — a NON-Anthropic model):** seat run recorded a house-sim window
   (synth seed 42, 18 000 frames), packed an **87.6 KB** bundle (byte-identical on re-pack), and
   dispatched `summarize-window` through the **Hermes** worker to the user's own gateway (Nous Portal,
   `z-ai/glm-5.2`; frontmatter label `nousresearch/hermes-4-70b` — the documented "label only"
   caveat) — one billable run, first attempt. The returned report cites only stats-block numbers, names
   the bound IFC element per tag, flags `seed:42` as synthetic (no simulation claim), and proposes no
   action; all five guardrails demonstrated. Gateway was started by its documented mechanism for the one
   run and **stopped afterward** to restore the found (down) state. Worked example + measured run:
   [`plugin-twin/library/findings/twin-analyze-2026-07-10.md`](../../plugin-twin/library/findings/twin-analyze-2026-07-10.md)
   (report also at `plugin-twin/skills/twin-analyze/references/example-report.md`).
6. ~~**Web/Grafana embed story.**~~ ✅ **DONE (2026-07-10, built on `feat/web-embed` —
   seat-measured, pending merge to `main`). Outcome: FULL GRAFANA RECIPE (no-threads variant);
   Safari unverified.** Measured the browser WASM fps ceiling honestly before shipping, per
   [`2026-07-09-web-embed-plan.md`](2026-07-09-web-embed-plan.md): Phase 1 ran a 2-build × 3-scene ×
   2-vantage Chrome matrix (12/12 cells, live-bound, 0 drops; seat `b105cc9`). The **pre-declared
   ≥30 fps floor** (no-threads duplex street, live binding) **passed by ~4×** (120 fps display-capped,
   cpu 0.58 ms), and `thread_support` bought **zero** rendering fps (Godot 4's web renderer is
   single-threaded) — so the embeddable no-threads build costs nothing and **boots fully live-bound at
   120 fps inside a real Grafana text/HTML-panel iframe**, while the threads build is dead on arrival
   there (no `SharedArrayBuffer` — Grafana serves no COEP). Phase 3 shipped the recipe: the
   dependency-free COI server `plugin-twin/tools/web/serve_coi.py` (Python 3 stdlib — COOP+COEP,
   wasm/pck MIME, no-cache), the two annotated Web export presets
   (`plugin-twin/examples/export_presets.web-{nothreads,threads}.cfg`), tutorial + `twin-bind-data`
   relay-note sections (serve, `wss`-behind-https, the Grafana iframe snippet, the scale caveat), and
   CAPABILITIES/SEAMS entries. Two caveats are documented from the numbers: a **scale ceiling**
   (many-unique-mesh scenes — 28.6k individual meshes — fall to ~17 fps aerial at ~10× native CPU;
   optimize/instance first) and **Safari unverified on this machine** (three TCC barriers — a stated
   caveat, not "works in Safari"). Full matrix + verbatim Grafana outcomes + caveats:
   [`plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md`](../../plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md).
7. **`twin-ship` packaging skill.** A viewer deploys as build + model + sidecar +
   binding map + optional recording; base `godot-export-builds` doesn't bundle the data
   files. Small skill, closes the journey's last step.
8. **Second demo asset beyond the Duplex.** A plant/factory-flavored public model makes
   the industrial pitch land harder than a house (the city block covers scale; it
   doesn't cover "looks like my plant").

### Good to Have (speculative, revisit after real users)

9. **Semantic/master-data models (DTDL, ISA-95 → scene mapping).** Research found NO
   precedent in any engine — greenfield and differentiating, but speculative until a
   user asks. Agent-shaped (data transformation + authoring), so if demand appears the
   framework is the right tool. Park until then.
10. **USD import via offline conversion** (usd→glTF toolchains exist) — same pipeline
    shape as IFC; do when a user shows up with USD files.
11. **Point clouds** — same rule as USD.
12. **"Simulation"** — the word in the product's long-term vision. Enters only as
    scenario/what-if orchestration over an existing solver (see the NONE list), and only
    after visualization has users. Until then the honesty rule stands.

### Explicitly NOT on the roadmap

NONE verdicts mean **never BUILD ourselves — zero differentiation in building it**.
They are NOT "never in the product": every one stays open as a THIRD-PARTY INTEGRATION
seam, and the architecture already carries the receiving socket — protocol stacks arrive
as existing bridges behind `sourceUrl` (the MQTT adapter is this pattern's first
instance); streaming/tiling arrives by adopting an existing runtime if geo-context ever
matters (the refuted-claims research exists precisely so we know that door is open);
simulation arrives as third-party solvers — FMI/FMU co-simulation is the industrial
standard route — with the framework doing scenario authoring, orchestration and gating
on top; native format parsers get ADOPTED when they mature (GDIFC once it ships macOS,
native USD when the Godot proposal lands), with the offline-conversion pipeline covering
the meantime. In every case the framework keeps the agent-shaped work — integration,
authoring, verification — and the third party supplies the core tech. What is truly
never on the roadmap: competing head-on with Omniverse/Cesium/iTwin on their own turf.

## Open items carried over (not roadmap — hygiene)

- Forge (upstream, not this repo): open ledger finding `D10-import-layering-inversion`
  (HD import skills depend on the pixel-art skill for the generic core) — apply via its
  `/framework-audit-fix`.
- Xenomoon (sibling fork): two flagged pre-existing bugs — dangling audit-doc references
  and a broken pre-commit hook calling the absent `gen-ledger.js`.
- Human-paced: record the demo video (`docs/marketing/demo-script.md`), publish the
  post when ready (bans apply), decide `twindemo_test2/` cleanup (it holds the last
  acid-test evidence).

## Working rules the next session must honor (learned the hard way)

- **Workspace model:** one folder per project/experiment; the framework belongs to no
  project. Twin work happens ONLY from the twin seat (`twindemo/`), game work from the
  game seat. Every commit pushes upstream; downstreams evaluate before pulling.
- **Sync:** read `docs/fork/SEAMS.md` first, always. Restore the protect-list; upstream's
  twin deletions re-apply silently on every merge.
- **Quality bars:** zero magic numbers (named + documented, what AND why); size caps met
  by decomposition, never docstring compression; no cross-script private access; the
  human reviews line-by-line post-phase and expects a constants table when constants
  change; no ASCII tables in docs.
- **Launcher:** `./start_server` / `./stop_server` (never bare `npm start` in
  instructions) — and on shared machines always `PORT=<free>` (default-port start kills
  the current holder).
- **Honesty:** measured numbers carry their caveats; refuted claims stay banned; SKIPs
  are loud and are not passes.
