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
   block anything — the shipped default is frame-clean. **Also now (item #6):**
   fly the aggressive cutoff with `--vis-fade-margin=5 --vis-fade-mode=self` and
   confirm the 5 m alpha ramp perceptually kills the ~60 m pop (frame-reviewed +
   matched-diff only so far); if 5 m reads too quick, margin 12 is the pop-optimal
   fallback (but costs ~⅓ of the win). Findings file:
   `twin-vis-fade-2026-07-10.md`. Forward+ only — irrelevant to the web build.
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
6. **Fade margin for aggressive vis classes** — **DONE** (`feat/vis-fade-margin`).
   Added `--vis-fade-margin` / `--vis-fade-mode` and swept the fade band on the
   unique-mesh city at street: the **aggressive tier is adoptable with
   `--vis-fade-margin=5 --vis-fade-mode=self`** — 97% median retention of its cpu
   win (fade cost within the 0.03 ms noise floor), the hard pop replaced by an
   alpha ramp. Margin 12 is pop-optimal but fails the 80% bar (69% median); the
   coarser tier fails at both margins; aerial fade is free. **Forward+ ONLY** —
   the Compatibility renderer (web export) treats the fade as DISABLED, so the pop
   returns there. Ships as recommended-with-caveat, **still gated on the human
   fly-through below (see item 1 — same convention)** before it's more than
   opt-in guidance; no optimizer constant changed. Finding:
   `plugin-twin/library/findings/twin-vis-fade-2026-07-10.md`. PLUS: the sweep
   driver was promoted into a reusable framework tool `plugin-twin/tools/bench_sweep.sh`
   (+ `tools/bench/merge_sweep.py`, example matrix) — the third spike to hand-roll
   the optimize→bench→merge loop earned it.
7. **Web UI chrome de-branding** (item #3 review, LOW-2). `ui/index.html`
   wordmark is still XenodotForge, help/placeholder text is game-flavored,
   `agent-ui.css` is the Forge Temple theme. Out of item #3's scope (model-read
   prompt text only) — a future UI-branding pass, seat-visible either way.
8. **Analysis seam MCP surface** (item #5 plan, phase-2). The CLI path is
   proven; `mcp__ui__analyze` (Hive-gated like `mcp__ui__hermes`) is the natural
   next surface. Also: Hermes-path model attribution echoes the config label
   (runs-API reply carries no model id) — precise attribution only exists on the
   openai-compatible adapter today.
9. **DONE (2026-07-10)** — Upstream PR offers OPENED with human approval:
   xenodot-forge PRs #1 (mcp-tool wording), #2 (prompt blocks), #3 (ui strings)
   — 9 files, wording-only, prepared as minimal diffs against upstream/main
   (prep record: `2026-07-10-upstream-offers/`). Original entry:
   Five files went domain-neutral
   and are flagged "upstream candidate — offer as PR": `mcp-tools/hermes-tool.js`,
   `mcp-tools/promote-tool.js`, `ui/hermes-block.md`, `ui/docs-block.md`,
   `ui/codex-block.md`. Offering them to forge shrinks the sync seam.
10. **ASSESSED — NO-BUILD (2026-07-10, orchestrator verdict).** The plant is
    the flavor/data-binding showcase by design; the instancing showcase ALREADY
    exists (instanced c2 city: 224 groups, 34,800→964 draw items, measured).
    Building a mapped-representation plant variant would duplicate a proven
    capability for no current demo or user need — the finding's own wording
    ("if ever wanted") names the trigger, and it has not fired. TRIGGER-IZED
    like index items 9–12: build when a demo/user needs an instanced plant at
    scale; mechanism recorded in `twin-plant-asset-2026-07-10.md`.

11. **UI feature-dispatch prompts name dropped agents** (found during item #7's
    de-brand): `ui/client/features/assets/get-assets.js` (wirePrompt) and
    `draw-level.js` still dispatch `asset-advisor`/`level-designer`/
    `game-designer` — agents this fork dropped — with game art/level-pipeline
    instructions. Fixing means REWIRING the features to twin agents
    (twin-architect/data-binder/scene-optimizer), a functional change beyond
    de-branding. Until then those two panels dispatch to nonexistent agents.

12. **Seat→core promotions #1 + #2 — DONE** (`feat/seat-promotions`, post-audit of
    "what got built in the test repo that belongs in the framework"). Promoted the
    bench_sweep **perceptual mode** — the fade spike's `pop_series.gd` (windowed
    pop-capture) + `pop_analyze.py` (ffmpeg adjacent + matched-position diff) —
    into `plugin-twin/tools/bench/` as the documented perceptual v2 (standalone
    companions in the bench_sweep family, not a `.sh` stage), and the **city scale
    scene generator** `house-twin/scripts/gen_city.gd` → `plugin-twin/examples/gen_city.gd`
    (demo asset, examples/, never materialized, per the `gen_plant_ifc.py`
    precedent). Parity proven: promoted `pop_analyze` reproduces the spike's matched
    numbers exactly (aggressive vs fade12 peak ydelta 0.164 @ z=99, mean 0.033, min
    SSIM 0.9962); promoted `gen_city --grid=10` → 28,600 meshes / 224 groups /
    groups_instanced 0 / vis_ranges_set 7700 at defaults, matching the vissweep
    census. `shot_city.gd` was assessed and LEFT in the seat (screenshot convenience,
    not a findings-reproduction dependency — see the seat note). SEAMS protect-list,
    CAPABILITIES, twin-optimize SKILL updated. Follow-ups 13–14 below trigger-ized.

13. **web-ceiling browser-bench drivers — TRIGGER-IZED (no build).** The web-ceiling
    spike's headed-Chrome bench drivers — `web_bench.gd` (the in-viewer bench overlay)
    - `driver/chrome_bench.mjs` + `driver/chrome_console.mjs` (CDP scrapers) — proved
      the web GPU/renderer ceiling once (finding:
      `plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md`) but stayed
      seat-local: a single-use measurement, not a recurring gate. **Trigger:** promote
      them into `plugin-twin/tools/web/` (beside `serve_coi.py`) when web benching
      RECURS — a Godot engine upgrade to re-measure the WebGL/WebGPU ceiling, the Safari
      WebDriver cells becoming runnable (three blockers today), or renderer work that
      needs a browser frame-budget number. Until a second web-bench need shows up, the
      reference `.gd` + `.mjs` in the spike are the record.

14. **Retention math into `merge_sweep.py` — TRIGGER-IZED (no build).** The fade sweep
    computed adoption RETENTION — `(OFF − fade) / (OFF − no-fade-base)`, per-family
    same-block OFF — by hand in its seat `merge.py`, not in the promoted
    `tools/bench/merge_sweep.py` (which stops at cpu/object deltas vs a named baseline
    - noise-floor flagging). Generalizing retention needs a schema for "which config
      is the win-baseline vs the OFF-baseline" and thermal-block grouping — real design,
      justified only by a second consumer. **Trigger:** fold retention into
      `merge_sweep.py` when a SECOND retention-gated recipe appears (another
      win-with-a-cost knob whose adoption bar is "keep ≥X% of the base win"). One data
      point is a spike computation; two is a tool feature.

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
