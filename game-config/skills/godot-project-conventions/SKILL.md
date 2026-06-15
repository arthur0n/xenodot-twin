---
name: godot-project-conventions
description: Establish or verify a Godot 4.x 3D pixel-art project's baseline — renderer, window/stretch, folder layout, naming, input map — and record it in CLAUDE.md as the single source of truth. Use FIRST in any new project, on "set up the project" / "start a POC" / "initialize the game", or whenever another godot-* skill is about to run and CLAUDE.md has no "## Project conventions" section yet.
---

# Godot Project Conventions

This skill is the keystone: it makes project-wide decisions once, applies them to `project.godot`, and writes them into `CLAUDE.md`. All other `godot-*` skills must read `CLAUDE.md` before acting and must not contradict it.

## Requirements

- Godot **4.3+** project (a `project.godot` file exists; if not, ask the user to create the project in the editor first — do not hand-write a `project.godot` from scratch).
- Run this **before** any other godot-\* skill on a fresh project.

## Procedure

1. **Check for existing conventions.** If `CLAUDE.md` already has a `## Project conventions` section, read it, report any conflicts with the defaults below to the user, and stop — do not overwrite established decisions without explicit approval.

2. **Apply settings** (edit `project.godot` directly, or instruct the user for editor-only steps):
   - Renderer: **Forward+** (`rendering/renderer/rendering_method="forward_plus"`). Required by the normal-roughness texture used in outline shaders. Non-negotiable for this art style; flag to the user if the project targets web export (Compatibility-only), since that drops normal-based outlines.
   - Window: base size **1920×1080**; Stretch Mode `canvas_items`, Aspect `keep`.
   - Physics/render layers: layer 1 = world, layer 2 = player, layer 3 = enemies (extend, never renumber).

3. **Create folder layout** (only the folders needed now; create others on demand):

   ```
   res://scenes/      main and composition scenes
   res://entities/    player, NPCs, props (one folder per entity)
   res://levels/      level scenes / blockouts
   res://shaders/post/  post-process shaders
   res://resources/   shared .tres resources
   ```

4. **Define input actions** in the Input Map: `move_left`, `move_right`, `move_forward`, `move_back` (WASD + arrows), `jump` (Space). Use these exact names; controller skills depend on them.

5. **Write the conventions to `CLAUDE.md`** (create the file if absent, append the section if the file exists). Use this exact template, filling in anything the user customized:

```markdown
## Project conventions

- Engine: Godot 4.3+ (reversed-Z). Renderer: Forward+ (required by outline shaders).
- Art style: 3D pixel art. 3D content renders inside a SubViewport (skill: godot-3d-pixelation); post-process effects attach to the camera inside it.
- Camera: projection is genre-dependent. The pixel-art look comes from the SubViewport downscale (godot-3d-pixelation), not the camera. Orthographic fixed-angle (skill: godot-orthographic-follow-camera) is the default for top-down/iso games; first-person/third-person genres use a perspective eye-camera inside the SubViewport. Switching projection only trades the texel-snapping behaviour — flag it, don't forbid it.
- Folders: scenes/, entities/, levels/, shaders/post/, resources/.
- Naming: node names PascalCase; files and folders snake_case; one scene per entity in entities/<name>/.
- Input actions: move_left, move_right, move_forward, move_back, jump.
- Shader contract: single post-process shader at res://shaders/post/post_process.gdshader; helpers get_linear_depth(), get_normal() (skill: godot-screen-effects).
- Code rules: strict typed GDScript (skill: godot-code-rules) — warnings-as-errors, gdlint/gdformat, validate gate.
- Rule for AI sessions: read this section before structural changes; load godot-code-rules before writing or editing any .gd file; record new project-wide decisions here, not in chat.
```

## Verification checklist

- [ ] `CLAUDE.md` contains the `## Project conventions` section.
- [ ] `project.godot` shows `rendering_method="forward_plus"` (absence of the key also means Forward+, the default).
- [ ] The five folders exist; Input Map lists the five actions.
- [ ] Project opens and runs (F5) without errors (gray screen is fine at this stage).

## Error → Fix

| Symptom                                                              | Fix                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conventions section exists but conflicts with these defaults         | Existing project decisions win; report differences, don't overwrite                                                                                                                                                                                                                                                                                                                |
| Project must export to web                                           | Compatibility renderer forced → normal-based outline features unavailable; record the limitation in CLAUDE.md                                                                                                                                                                                                                                                                      |
| Input actions already exist with other names                         | Map skill names onto the existing ones in CLAUDE.md instead of duplicating actions                                                                                                                                                                                                                                                                                                 |
| Tab/Enter/arrow input action does nothing at runtime (verify passes) | Wrong `physical_keycode` integer. Non-printable keys use Godot's `KEY_*` values, which verify can't validate — only an F5 play-test catches it. KEY_TAB=4194306, KEY_ENTER=4194309, KEY_ESCAPE=4194305, KEY_SPACE=32; arrows L/U/R/D=4194319/4194320/4194321/4194322; modifiers SHIFT=4194325/CTRL=4194326/ALT=4194328. Printable letters/digits use the ASCII value (A=65, 0=48). |
