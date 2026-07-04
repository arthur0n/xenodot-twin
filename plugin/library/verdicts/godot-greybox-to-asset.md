---
type: verdict
title: "Verdict — godot-greybox-to-asset (greybox→asset MIGRATION skill)"
description: "ADOPTED 2026-06-27 — greybox-to-asset migration skill owning the level-scale replace workflow between godot-greybox and mesh-import."
timestamp: 2026-06-27T18:29:54+01:00
---

# Verdict — godot-greybox-to-asset (greybox→asset MIGRATION skill)

**Date** 2026-06-27 · **Researcher** skill-researcher · **Status** ADOPTED 2026-06-27 → `plugin/skills/godot-greybox-to-asset/SKILL.md`

## Gap (as understood)

`godot-greybox` BUILDS arena blockouts (BoxMesh cover, SpawnMarker3D, FallZone, NavigationRegion3D).
`godot-mesh-import-pixel-art` swaps ONE greybox node → ONE sourced `.glb` (scale, nest, collide).
NOTHING owns the level-scale REPLACE WORKFLOW between them: identify every greybox node → batch-source/
verify assets via the asset-advisor loop → swap each in place preserving transform+collision → safely
retire the greybox last. This is the headline task of the asset-improvement push (transcript S5, point #13).

## Library search

Cache `$HOME/.cache/xenodot/GodotPrompter` (refreshed, up-to-date). Searched all 50 skills.

- grep `greybox|blockout|graybox|prototyp.*replac|placeholder.*model` (case-insensitive) → **0 files**.
- Closest candidate `assets-pipeline` — read in full: import MECHANICS only (compression modes, `.glb`
  format, `-col`/`-convcol` name suffixes, Advanced-Import, `.tres` vs `.res`, threaded load). ZERO
  coverage of a migration/replace workflow. Also `3d-essentials` (materials/lighting/decals) and
  `scene-organization` (composition vs inheritance) — neither touches blockout replacement.

**Conclusion: the library has no greybox→asset migration pattern.** The workflow is authored from
transcript S5 + our existing skills + our conventions; no external skill is copied. The new skill is a
THIN ORCHESTRATOR over `godot-greybox`, `godot-mesh-import-pixel-art`, the asset-advisor classify/verify
loop, and `godot-verify` — not a parallel system.

## 6-bucket decomposition

**1 — From the source/idea (transcript S5).** Replace placeholder greybox with sourced building assets
that share ONE material; set collision per model; swap order = place asset → LOCK + hide the greybox
(transparent-magenta override, `use_collision` off) → delete the greybox LAST → decorate after walls land.

**2 — From the candidate (library).** No candidate. `assets-pipeline` offers only the import primitives
(suffixes, glTF settings) that `godot-mesh-import-pixel-art` already covers. Nothing migration-shaped.

**3 — No-brainers (adopt as-is).** The migration ORCHESTRATION as a new thin skill `godot-greybox-to-asset`:
identify greybox nodes → asset-advisor sources/verifies a batch → per-node 1:1 swap (delegated to
godot-mesh-import-pixel-art) preserving name+`position`+`rotation`+collision → retire greybox last →
re-bake nav → decorate. Swap-SAFETY (do the swaps, validate, THEN delete the greybox nodes — never delete
first) and the shared-material building-set guidance are the load-bearing, genuinely-new content.

**4 — Improvements (adopt but rework).** Transcript's "lock + transparent-magenta hide the greybox in the
editor while swapping" is a manual-editor crutch; for our hand-authored-`.tscn` + headless-verify flow,
rework it as: keep the greybox node in the scene as a visible fallback until the asset validates, then
delete in the SAME commit — magenta-hide is optional editor convenience, not the mechanism. Drop CSG
entirely (we use BoxMesh+GridMap). "Decorate after" becomes an explicit final, non-blocking step.

**5 — Not now, SYSTEM-park (framework, route to Later).** A headless `tools/migrate_greybox.gd` that
audits a level `.tscn` and REPORTS which nodes are still BoxMesh greybox vs swapped (a migration-progress
metric, mirroring godot-greybox's spatial audit). Useful once migrations span many levels; not needed for
the first pass. Park, don't build.

**6 — Definitely skip.** CSG greybox source (#3, we don't use it). Inherited-scene swap (banned by
mesh-import). Make-local swap (banned). Any second importer/build-path fork. Re-stating import suffix/PBR
mechanics (owned by mesh-import / the pending HD-material skill).

## Boundaries — what this skill OWNS vs delegates

| Concern                                                                                                                 | Owner                            |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Identify which nodes are greybox placeholders; order the swap; retire greybox LAST; shared-material set; decorate-after | **godot-greybox-to-asset (NEW)** |
| Source + classify + verify the `.glb`/textures for the batch                                                            | asset-advisor loop               |
| Per-node 1:1 swap: scale, nested instance, collider, NEAREST/material                                                   | godot-mesh-import-pixel-art      |
| Tileable wall/floor surface texture (not a prop)                                                                        | godot-texture-import-pixel-art   |
| Original blockout (cover, spawns, FallZone, nav, Transform3D ban)                                                       | godot-greybox                    |
| Load-pass / render / smoke gate after the swaps                                                                         | godot-verify                     |

## Recommendation

**ADOPT as a NEW thin skill `godot-greybox-to-asset`** (not extend godot-greybox: greybox is owned by
game-designer/level-designer and is about authoring SHAPE; migration is a godot-dev/asset-advisor BUILD
workflow — different agents, different phase). Reject the bucket-6 items; park bucket-5 progress-audit
tool to Later. Full SKILL.md drafted and ready below for the human-approved write.

## Final SKILL.md content (ready to write to `.claude/skills/godot-greybox-to-asset/SKILL.md` on adopt)

See the prepared content handed to the adopt gate (identical to the block surfaced via mcp**ui**ask).
CLAUDE.md "## Skills" one-liner:

> - godot-greybox-to-asset: migrate a greybox blockout to final sourced assets — identify each BoxMesh greybox node, batch-source/verify `.glb`/textures via the asset-advisor loop, swap each 1:1 in place preserving name+position+rotation+collision (delegating the per-node swap to godot-mesh-import-pixel-art / godot-texture-import-pixel-art), validate, then RETIRE the greybox nodes LAST (never delete first), re-bake nav, decorate after. The REPLACE half of the blockout loop (godot-greybox builds it). Orchestrator over godot-greybox + mesh/texture-import + asset-advisor + godot-verify; owns swap-order/safety + shared-material building-set, delegates per-node import + sourcing. NOT a parallel importer, NOT CSG, NOT inherited/make-local swaps.
