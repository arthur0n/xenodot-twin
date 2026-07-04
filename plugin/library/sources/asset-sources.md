---
type: source-list
title: "Asset Sources — free pixel-art generators (interim sourcing loop)"
description: "adopt the web-link + human-in-the-loop loop below as the interim"
timestamp: 2026-06-15T22:28:18+01:00
---

# Asset Sources — free pixel-art generators (interim sourcing loop)

**Request** — Pixel-art textures the agent pipeline can't author itself: grass-blade
sprite (8–32px, alpha, vertical taper), tree billboard (~32×48px, alpha), seamless
ground tile. The shader is already wired (`blade_texture` + `use_texture` in
`shaders/material/grass_billboard.gdshader`), the SubViewport + nearest-filter pipeline
is in place, and `assets/textures/` is waiting.

**Verdict** — adopt the **web-link + human-in-the-loop loop** below as the interim
solution. This is a registry of external _generators_ (sibling to `skill-sources.md`),
not a single addon verdict. Explicitly a prototype path: okay quality, fast, not final.
A **local model** is `parked` (see bottom) until volume/consistency justifies the setup.

This is the framework's answer when a task is **blocked on missing art** — the asset
analogue of `addon-researcher` for missing systems. The **asset-advisor** agent is the
specialist that drives it: it writes the tailored generation prompt (before) and verifies
the uploaded PNG (after). Surfaced in the web UI under the **Get Assets** tab; the loop
also lives in `CLAUDE.md` → "Sourcing art assets".

## The loop

1. Open **Get Assets** (the 🎨 button in the composer). It lists any open `Asset: <name>`
   requests the orchestrator filed (each with a tailored generation prompt) alongside the
   generators below. No open request? Use the ad-hoc upload (name it yourself).
2. Generate the PNG on a source below, then **upload it in the modal** — the forge server
   writes it to `assets/textures/<name>.png` (snake_case) and the upload asks the orchestrator
   to run **asset-advisor** (verify-after), which checks the PNG and, on PASS, dispatches the
   wiring to godot-dev (on FAIL it returns a corrected prompt to re-gen). (You can also drop
   the file there by hand — then ask for an asset-advisor check.)
3. Import in Godot: **Filter = Nearest, Mipmaps = Off** (pixel-art crispness). The grass
   shader already forces `filter_nearest` at the sampler; this import setting matters for
   `StandardMaterial3D` users (ground/tree).
4. Wire it (a godot-dev task — auto-dispatched on upload, not done by the orchestrator):
   - Grass → in `resources/grass_blade_material.tres`, bind the texture to
     `shader_parameter/blade_texture` and set `shader_parameter/use_texture = true`.
   - Tree / ground → replace the flat `StandardMaterial3D` albedo in
     `levels/open_world.tscn` (tree as a billboard quad, or mesh + texture for the POC).
5. Run `godot-verify` (layers 1–3) — confirm it loads and renders crisp, no black screen.

## Sources

| Source                 | URL                                          | Free / signup                                         | Output                                                                                    | Fit                                           | Verdict                    |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| pixler.dev             | https://pixler.dev/                          | Free, **no signup** (15 gen/day)                      | Transparent PNG; characters, items, props, backgrounds; commercial license                | grass blade, tree, props                      | adopt — primary            |
| SEELE AI               | https://www.seeles.ai/features/tools/sprite  | Free, **no login**                                    | Transparent PNG **+ JSON frame metadata**, sprite sheets; explicitly Godot 4 import notes | sprite variants, sheets                       | adopt — primary            |
| SpriteLab              | https://spritelab.dev/                       | Free tier "Squire" (25 + 5/day); **account required** | Transparent PNG, sprite packs (up to 25 variants), walk/rotation anims, 16–128px          | tree, item/prop packs, variants               | adopt — secondary (signup) |
| Perchance AI Pixel Art | https://perchance.org/ai-pixel-art-generator | Free, no signup (per listing — confirm in browser)    | Text→pixel images, downloadable                                                           | tree, characters, quick concepts              | adopt — fallback           |
| Pixelorama             | https://www.pixelorama.org/                  | Free, open-source (desktop + itch web)                | Full editor; **tilemap mode** for hand-tiling, alpha-trim, downscale touch-up             | seamless ground; cleanup of any generated PNG | adopt — editor/cleanup     |

## Prompts (copy-paste)

- **Grass blade** — "single pixel-art grass blade, vertical taper from wide base to thin
  tip, side-on, flat 2D, ~16×32, transparent background, no outline, SNES style". Make
  2–3 silhouette variants to break up the repeated quad. Downscale + alpha-trim in Pixelorama.
- **Tree billboard** — "single pixel-art tree, ~32×48, side-on billboard view, stylized
  canopy, transparent background, retro 16-bit, no ground shadow".
- **Ground tile** — "seamless tileable pixel-art ground texture, grass with dirt patches,
  top-down, 32×32, no visible seams, repeats cleanly".

## Known gaps (don't over-promise)

- **Seamless ground is the weak spot.** Generic AI sprite generators rarely guarantee
  tileability — edges won't match. Options, in order: use a generator's tileable mode if
  it has one; hand-fix seams in **Pixelorama**'s tilemap mode; or accept a single
  non-tiling ground patch for the prototype and note it.
- **Tiny sprites (8×16) with clean alpha:** generators output large canvases → downscale
  with nearest-neighbor and alpha-trim afterward (Pixelorama), or the blade will be mushy.
- Per-site free tiers and signup walls drift — re-confirm before relying on one.

## Later — parked: local generation (v2)

When per-image clicking becomes the bottleneck (many variants, consistent style, batch
runs), stand up a **local pixel-art model** on Apple Silicon (MPS):

- **Pixel Art Diffusion XL** (SDXL checkpoint) or a small sprite LoRA (e.g. pixel-art-xl),
  run via **ComfyUI** or `diffusers` with the MPS backend.
- Trade-off: real setup cost (model download, ComfyUI graph, prompt tuning) vs. no
  per-image clicking, repeatable seeds, consistent palette. Not worth it for the POC's
  handful of textures — revisit when the asset count or style-consistency need grows.
- Verdict: `parked`. Promote to a fresh `library/local-pixel-gen.md` verdict + a
  godot-dev/tooling task when adopted.
