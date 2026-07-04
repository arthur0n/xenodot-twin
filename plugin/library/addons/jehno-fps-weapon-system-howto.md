---
type: addon
title: "Jehno Simple FPS Weapon System — how it works / correct setup"
description: "Digest for configuring the installed addon (game/addons/JehenoSimpleFPSWeaponSystem/) so we"
timestamp: 2026-06-18T18:32:13+01:00
---

# Jehno Simple FPS Weapon System — how it works / correct setup

Digest for configuring the installed addon (`game/addons/JehenoSimpleFPSWeaponSystem/`) so we
stop reverse-engineering it bug-by-bug. Cite this before touching the weapon resources, the
player scene, or the addon scripts.

## Top setup mistakes & correct fixes

### 1. No firing (silent)

- `type = NULL` (0) in the weapon resource → set `type = 1` (HITSCAN) or `2` (PROJECTILE).
- `nb_proj_shots = 0` or `nb_proj_shots_at_same_time = 0` → both must be ≥ 1.
- `total_ammo_in_mag = 0` → set to mag size.
- `damage_dropoff` Curve null → **crash before fire**; must have a Curve set.

### 2. Jump crash (null Curve)

- `desired_move_speed_curve` / `in_air_move_speed_curve` on **PlayerCharacter** (NOT the weapon
  resource) are Curve exports; `.sample()` is called every physics frame in jump/inair states →
  null = crash.
- Fix: inline `sub_resource type="Curve"` in the player `.tscn` (our scene now has these).

### 3. No sound

- `shoot_sound` null → silent (ok, not a crash).
- `shoot_sound_speed = 0.0` → AudioServer skips playback; **always set to `1.0`**.
- The **"SFX" bus must exist** — `weapon_sound_management()` hardcodes `bus = "SFX"`; if the bus
  is absent, sound is silent or errors. (`project.godot` must wire `default_bus_layout.tres`.)

### 4. "Pistol doesn't have a shoot animation" spam

- The shoot path skips the animation silently if `shoot_anim_name = ""` — it emits no error.
- The printed spam actually comes from `reload_manager_script.gd` line ~58, which checks
  `shoot_anim_name` instead of `reload_anim_name` (an addon bug) — non-blocking.
- Fix: leave `shoot_anim_name = ""` and silence the real source in reload_manager_script.gd;
  OR add animations named `"ShootAnimPistol"` / `"ReloadAnimPistol"` to the AnimationPlayer.

### 5. Weapon model invisible / wrong position

- The model position is overwritten **every frame** by
  `AnimationManager.weapon_model_positioning()` using `pos_val[0]` + `pos_val[1]` from the
  resource. The editor position is ignored at runtime.
- `pos_val[0] = Vector3(0.2, -0.12, -0.26)` = resting position (right/down/forward).
- `pos_val[1] = Vector3(0, 0, 0)` = resting rotation.
- The model must be on cull layer 1 (world layer); the eye Camera `cull_mask = 524287`.

### 6. Black-screen risk

- `ViewportCam` must have `current = false` — it is a transform proxy only, never the active
  camera. If it becomes current, only layer-20 renders → black screen.

### 7. WeaponManager position unsynced

- `WeaponManager._physics_process` sets its `global_rotation/position` =
  `viewport_cam.global_rotation/position`.
- `ViewportCam` copies `CameraHolder/CameraRecoilHolder/Camera` global_transform.
- If the weapon is offset, verify `viewport_camera_script.gd` @onready path
  `$"../../CameraHolder/CameraRecoilHolder/Camera"` resolves from ViewportCam's tree position.
- NOTE: do this sync in `_physics_process`, never behind an `await` in `_process` (an `await`
  there suspends the per-frame sync — the bug that broke pistol position + firing cadence).

### 8. `max_desired_move_speed = 30` is NOT a bug

- That field is the **bunny-hop accumulation cap**, not walk speed. Normal speed is
  `walk_speed` / `run_speed`. With `auto_bunny_hop = false`, 30 is never reached in normal play.

### 9. Input actions

- `InputManagementComponent` propagates keybinds to PlayerCharacter, CameraHolder, WeaponManager
  in `_ready()`. With `check_on_ready_if_inputs_registered = false`, missing actions are NOT
  auto-added → silent no-input. All action names must exist in the project InputMap:
  `move_forward`, `move_back`, `move_left`, `move_right`, `jump`, `shoot`, `reload`, `aim`.
