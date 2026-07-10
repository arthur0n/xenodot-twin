# Open items — after the 2026-07-09/10 implementation run (index items 2–8)

Everything actionable on `2026-07-09-implementation-index.md` is merged to `main`
(one no-ff snapshot per item; per-item execution logs in the
`2026-07-09-*-orchestration.md` files). This doc collects what is deliberately
STILL OPEN — carried out of those logs so nobody re-reads seven of them to find
the loose ends. Each entry names its source log.

## Human-paced (needs the human, by design)

1. **Vis-range perceptual fly-through** (item #4 log). The sweep's popping
   verdicts are "frame-reviewed, pending human fly-through" — an agent judged
   screenshot series, not live motion. Confirm by flying the street vantage on
   the unique-mesh city at the default config (and, if curious, `coarser`).
   Findings file to update: `twin-vis-range-recipe-2026-07-09.md`. Does not
   block anything — the shipped default is frame-clean.
2. **Marketing shots** (item #8 log). Shot-list lives in
   `twin-plant-asset-2026-07-10.md` (aerial tank farm by level, pump-skid temp
   ramp close-up, valve labels). Agents do not publish marketing material —
   shots and publication are yours.
3. **Safari web-bench cells** (item #6 log). Safari 0/12 cells BLOCKED by three
   macOS barriers that all need GUI/admin approval: Automation (AppleEvents)
   TCC, Screen Recording TCC, and Safari's "Allow remote automation" toggle.
   Grant any one path and re-run the sweep driver
   (`twindemo/twin-spikes/web-ceiling/driver/`) for the Safari columns; findings
   file to update: `twin-web-ceiling-2026-07-10.md` (currently says UNVERIFIED —
   never reads as "works in Safari").

## Machine setup (one-time, cheap)

4. **shellcheck not installed** (items #2, #6, #7 logs). Every shipped .sh
   passed `bash -n` + style-matched directives, but the real shellcheck floor
   never ran on this machine. `brew install shellcheck`, then run it over
   `plugin-twin/tools/{twin_build,verify_twin,twin_ship}.sh`.

## Follow-up items (framework work, when priorities allow)

5. **Occluder recipe bench** — **DONE** (`feat/occluder-bench`). Swept 5 volume
   gates × 3 real-shaped scenes: SCOPED WIN — real street-level win on
   many-unique-mesh scenes (ucity street cpu −0.15 ms / −9%, objects −55..−73%,
   lossless), net-negative on single buildings (duplex +0.16..+0.25 ms + interior
   over-cull SSIM 0.983), no-op on instanced/aerial; 10 m³ default kept (the
   measured sweet spot), `--occluder-min-volume=` added, stays opt-in. Rule-flaw
   noted: the "win at BOTH vantages" bar is structurally unreachable by occlusion
   (aerial no-op), verdict unaffected. Finding:
   `plugin-twin/library/findings/twin-occluder-recipe-2026-07-10.md`.
6. **Fade margin for aggressive vis classes** (item #4 findings). `coarser`/
   `aggressive` win up to −71% cpu but hard-pop at ~60 m; adoption is blocked on
   a measured `visibility_range_fade_mode`/begin-margin evaluation — measured
   before adopted, per the standing rule.
7. **Web UI chrome de-branding** (item #3 review, LOW-2). `ui/index.html`
   wordmark is still XenodotForge, help/placeholder text is game-flavored,
   `agent-ui.css` is the Forge Temple theme. Out of item #3's scope (model-read
   prompt text only) — a future UI-branding pass, seat-visible either way.
8. **Analysis seam MCP surface** (item #5 plan, phase-2). The CLI path is
   proven; `mcp__ui__analyze` (Hive-gated like `mcp__ui__hermes`) is the natural
   next surface. Also: Hermes-path model attribution echoes the config label
   (runs-API reply carries no model id) — precise attribution only exists on the
   openai-compatible adapter today.
9. **Upstream PR offers** (item #3 SEAMS flags). Five files went domain-neutral
   and are flagged "upstream candidate — offer as PR": `mcp-tools/hermes-tool.js`,
   `mcp-tools/promote-tool.js`, `ui/hermes-block.md`, `ui/docs-block.md`,
   `ui/codex-block.md`. Offering them to forge shrinks the sync seam.
10. **Plant instancing variant** (item #8 findings). The synthetic plant is a
    flavor/data-binding showcase, NOT an instancing one — the generator authors
    unique geometry per element (0 `IfcRepresentationMap`). If an
    instancing-showcase plant is ever wanted, extend `gen_plant_ifc.py` to emit
    mapped representations; the finding records the mechanism.

## Accepted-as-is (recorded so nobody re-litigates)

- **Soul legacy compare misses interior-CRLF** (item #3 review LOW-1) —
  pre-existing compare behavior, narrow edge; optional `\r\n` normalize in
  `hermes-soul-legacy.js` + `hermes-setup.js` if it ever bites.
- **Bundle sha256 hashes the UTF-8 re-encoding** (item #5 review LOW-3) — sim
  recordings are clean UTF-8; provenance-fidelity caveat only for exotic inputs.
- **Findings files >120-line chunk warnings** — several findings trip the
  non-blocking library length nudge; precedent accepted repeatedly.
- **Track A fallback license re-check** (item #8 log): if the Clinic HVAC model
  (CC0, 6.1 MB GLB, air-side only) is ever adopted, re-confirm CC0 via re3data
  record r3d100012506 first — duraark.eu itself is dead; the verified TIB mirror
  - pinned sha256 live in the twin-import skill.

## Parked by design (index items 9–12 — triggers, not backlog)

Semantic/master-data models, USD import, point clouds, simulation orchestration:
readiness docs only. Each names its trigger (a user shows up with the need, the
analysis seam hits flat-context limits, a sale is lost, a real solver exists).
Do nothing until a trigger fires — that is the index's own rule, restated here
so this doc is the one place that says what "done" left open.
