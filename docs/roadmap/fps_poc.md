# Roadmap — First-Person Shooter POC (active)

> **The next end-to-end proof for the Xenodot Forge pipeline: a playable first-person shooter
> in the 3D-pixel-art style.** Builds on the completed foundation POC (`first_game.md`) and
> replaces the retired apartment idea (`itch_demo.md`).
>
> **Reuses as-is** from the foundation POC: the SubViewport pixelation rig (godot-3d-pixelation),
> sun+shadow pixel lighting (godot-pixel-lighting), and the depth/normal outline post-process
> (godot-screen-effects). The pixel-art look is the **downscale**, not the camera — so it carries
> over unchanged to a first-person perspective view.
>
> **Diverges from the foundation POC** on the camera: an FPS uses a **perspective eye-camera
> inside the SubViewport**, not the orthographic follow rig (godot-orthographic-follow-camera).
> This is sanctioned by the camera convention in `CLAUDE.md` (projection is genre-dependent).
>
> **Single source of truth:** edit this file here, in the game repo. `npm run claude:sync`
> (wired into xenodot-forge's pre-commit) auto-mirrors `docs/roadmap/` → `xenodot-forge/docs/roadmap/`.
> Do NOT hand-edit the framework copy — it is overwritten on sync.

## How to read this roadmap

Every phase runs **through the pipeline** — game-designer (scope each slice into `design/<slug>.md`)
→ godot-dev (build) → godot-verify (gate) → human F5. The orchestrator never hand-codes game files.
**New capabilities** enter via the self-improvement spine: flag the gap → researcher → human
adopt/reject → registers back. **Only the verifier flips a phase's status (📋/🔨/✅)**, after
running that phase's gate check. The phases below are the planned shape; game-designer owns the
detailed scope and may split any phase.

## Track A — Core FPS loop

| Phase                             | Work                                                                                                                                                 | Reuses / needs                                                                                                  | Status | Gate (observable, F5)                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| **A1 Perspective rig**            | Swap the camera to a perspective eye-camera mounted inside the SubViewport; confirm the pixel-art downscale + outlines still hold under perspective. | reuse godot-3d-pixelation, godot-screen-effects; diverge from godot-orthographic-follow-camera                  | 📋     | F5: first-person perspective view, still pixelated, outlines intact, no distortion.                |
| **A2 First-person controller** 🔬 | Body + capsule + eye-camera; mouse-look (capture + pitch clamp), camera-relative move + jump. New input actions `shoot` + mouse-look.                | **gap → skill-researcher** (FP controller skill; must coexist with / override godot-orthographic-follow-camera) | 📋     | F5: mouse looks around (clamped pitch), WASD moves relative to facing, jump works, mouse captured. |
| **A3 Weapon & projectiles** 🔬    | Fire on input: projectile spawn → move → despawn, with a fire-rate Timer cooldown.                                                                   | **gap → skill-researcher** (projectile + fire-rate skill)                                                       | 📋     | F5: clicking fires capped by cooldown; projectiles travel and despawn; hit registers on a target.  |
| **GATE: SHOOTABLE**               | —                                                                                                                                                    | —                                                                                                               | ⛔     | One F5 run: look + move + jump + fire at a static target, all readable in pixel-art.               |

## Track B — Arena & targets

| Phase                    | Work                                                                                                                                                            | Reuses / needs                                       | Status | Gate                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| **B1 Arena greybox**     | A small enclosed arena to move and shoot in (BoxMesh/GridMap greybox — never final art).                                                                        | skill godot-gridmap-level or hand blockout per scope | 📋     | F5: walk the whole arena, walls collide, lit + pixelated.               |
| **B2 Targets / enemies** | Static or simple-moving targets that react to a projectile hit. Enemy-follow AI is **out of the source video** (off-video) — harvest separately if/when needed. | scoped by game-designer                              | 📋     | F5: a projectile hit visibly affects a target (despawn / state change). |

## Out of scope (do not let agents drift into these)

Networked/multiplayer, weapon inventory/switching UI, ammo/reload economy, enemy pathfinding AI
(until separately scoped), save/load, win/loss/objective screens, the dice/fate mechanic,
particles/VFX beyond the existing outline pass, monetization, export/ship (this is a local POC).

## Open questions

- **Controller skill shape** — does the FP controller fully replace `godot-orthographic-follow-camera`
  for this genre, or sit beside it as a sibling skill the project selects per game? (skill-researcher to recommend.)
- **Target vs enemy** — B2 starts with static/simple targets; whether real enemy AI is in scope
  is a game-designer call once the core loop is shootable.
