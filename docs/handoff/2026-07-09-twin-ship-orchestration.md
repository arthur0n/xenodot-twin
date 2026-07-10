# Orchestration plan — executing Nice-to-Have #7 (`twin-ship`)

Companion to `2026-07-09-twin-ship-plan.md` (the WHAT). Same protocol that closed
items #2–#6: Opus subagent per phase, orchestrator review between, independent scoped
review + seat check before merge.

## Working rules

- Branch: `feat/twin-ship` off `main` (post item-#6 merge, `3daa1a8`).
- The viewer export-compat work IS the item (the skill is small); phase 1 is the
  risk phase — dev-checkout behavior must stay byte-identical (gate is the net).
- Ship-layout contract fixed by the plan: data does NOT go in the pck; pck = code +
  starter scenes only; per-site swap without re-export is the product value.
- Honesty rules carried: unsigned-build Gatekeeper warning stated plainly; web builds
  point at the web-embed recipe (item #6, landed); cross-platform smoke SKIPs loudly.
- Godot 4.6.3 export templates: web variant proven present (item #6); Phase 1 must
  verify the macOS desktop template before relying on it — install if the documented
  path allows, else flag.
- Gap-3 de-risk rule from the plan: the optimized-.tscn OS-path load question is
  answered by a MANUAL export proof in Phase 1, before any tooling exists.

## Phase 1 — viewer export-compat (framework; subagent: Opus)

`starter-viewer/main.gd` + `data_bus.gd`: FileAccess bytes → append_from_buffer
(kills globalize_path in model load, one code path); executable-adjacent viewer.cfg

- data-path rooting behind OS.has_feature("template") (dev unchanged);
  --quit-after=N user arg (named constant, no behavior without flag). Full gate green;
  manual export proof: house viewer exported by hand, data beside build, painted;
  .tscn OS-path load verified (or pck-fallback decision recorded).

## Phase 2 — `twin_ship.sh` (framework; subagent: Opus)

Five stages (preflight/export/assemble/smoke/zip) per plan; ConfigFile-style cfg
rewrite (no sed — reuse the --wire idiom); --smoke default-on host-platform, loud
SKIP cross-platform; deterministic zip. Prove happy path + each preflight failure.

## Phase 3 — skill + seat validation + docs (subagent: Opus)

twin-ship SKILL.md (boundaries per plan); clean-stranger artifact test from the seat
(unzip clean path, README-only run); Linux export as the SKIP demo; findings note
with sizes; CAPABILITIES/SEAMS/tutorial "ship it" section/roadmap+index tick.

## Orchestrator gates

1. Line-by-line diff review per phase; Phase 1 extra bar: no globalize-path remains
   in model load; dev behavior byte-identical via gate.
2. Independent scoped review before merge (acceptance criteria 1–6 explicitly).
3. Seat check orchestrator-verifiable part: run the shipped artifact's smoke, edit
   shipped viewer.cfg (data-swap contract) and confirm it takes effect.
4. Merge no-ff to main, push, log — then next index item.

## Status log

- [x] Phase 1 done + reviewed — `84106ba` (main.gd +56/−13, data_bus.gd +19/−2,
      project.godot +4). All 4 gaps closed: buffer-load GLB (no globalize_path left —
      comment-only hit), static config_path() on data_bus (DRY, exe-adjacent first in
      template builds), \_rooted_path exe-dir rooting, --quit-after hook (0 = no
      behavior). Proofs: gate green with PLAYBACK-HASH IDENTICAL pre/post (dev
      byte-identical), manual macOS export boots headless from data/ beside build
      (GLB + map + recording), windowed boot real Metal GPU, data-swap glb→tscn without
      re-export + loud negative control. .TSCN VERDICT: OS-path load WORKS (0
      ext_resources, self-contained) — pck fallback NOT needed (acceptance 5 answered).
      Deviation accepted: project.godot import_etc2_astc=true (macOS arm64 export hard
      requirement, harmless in dev, commented) — Phase 2 preflight should assert it.
- [x] Phase 2 done + reviewed — `8d8d7c3` (twin_ship.sh 578L + extracted 95L
      cfg-rewrite .gd, strict-clean). All 5 stages proven real: macOS happy path (pck
      1.07MB→46.9K once data excluded — contract held), data-swap on assembled artifact
      glb→tscn without re-export + loud negative, 5 preflight failure modes exit 1,
      Linux export → smoke SKIP loud exit 0 (forced --smoke exits 1 — caller's choice,
      no fake pass), zip deterministic (double-hash equal; find|LC_ALL=C sort + zip -X).
      4 REAL bugs found+fixed during proving: export false-pass on half-built .app (now
      gates on ERROR lines + non-empty executable, exit codes lie), macOS in-bundle
      binary named by config/name not preset basename (discovered), cfg-rewrite .gd
      strict-warnings clean rewrite, trailing && exit-1. Carry-forward for Phase 3
      SKILL.md: recommended preset = universal arch (4.6.3 ships no arm64-only
      template) + exclude_filter _.glb,_.import,dist/_,build/_ etc.
- [x] Phase 3 done + reviewed — `a083f4b` (REAL clean-stranger catch: README's
      direct-run path used the model stem but the in-bundle binary is named by
      config/name — a stranger got file-not-found; tool now prints the quoted full
      path) + `f9e292d` (SKILL.md 172L with preset carry-forwards + Gatekeeper honesty
  - web-embed boundary, findings 157L with REAL sizes — honest correction: house
    pck 75,380B not the minimal-viewer 46.9K, contract still held — tutorial "ship
    it" section, CAPABILITIES, SEAMS, roadmap/index tick, twin-architect
    reciprocity, skills 16+9). Clean-stranger artifact proof: unzip to clean path,
    README-only run, windowed Metal boot painted with live HUD; acceptance-3
    cfg-swap on unchanged-mtime binary; Linux SKIP demo. Seat md5-restored.
- [x] Scoped review (independent Opus, incl. delegated orchestrator seat check —
      full reproduction from the SKILL's own preset instructions): merge-after-fixes →
      `88ffa4c` verified: MEDIUM-1 documented preset missing bundle_identifier (export
      hard-fail reproduced following the skill verbatim; now documented both places),
      MEDIUM-2 smoke accepted "bindings resolved 0/6" (tightened to [1-9][0-9]\*/,
      0/6 rejection proven end-to-end on a constructed bogus map, contrast with old
      pattern shown), LOW-3 export gate now benign-filters before ERROR grep
      (checks.sh idiom), NIT-4 empty-vs-missing file message distinguished. AC 1–6
      all PASS per independent reproduction (data-swap on unchanged-mtime binary,
      Linux SKIP, zip double-hash). Space-safe throughout; no cfg-rewrite drift.
- [x] Merged to main (no-ff), index + roadmap ticked. Item #7 CLOSED.
