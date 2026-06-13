---
name: godot-pixel-art-quantization
description: Add low-framerate "handdrawn" stylization to animated shaders in Godot 4.x by quantizing the TIME value fed to vertex animation — each blade or object snaps to discrete time steps instead of animating continuously, and a per-instance phase offset ensures they don't all snap on the same frame. Use this skill when grass or foliage animation looks too smooth/fluid for a pixel-art game, when all blades snap in unison (missing per-instance phase), when adding the handdrawn choppy-animation look to any TIME-driven shader, or when layering quantization on top of godot-pixel-art-wind.
---

# Godot Pixel-Art Quantization (low-framerate TIME snapping)

Quantizes the `TIME` built-in before feeding it to any animation (wind, water, etc.) so the shader updates in discrete steps — giving the "handdrawn, low-framerate" look of traditional pixel-art animation. A per-instance phase offset shifts each blade's snap boundary so they update on different frames rather than all popping at once.

## Requirements

- **godot-pixel-art-wind** — this skill modifies the `TIME` value that wind (or any animation) consumes. The wind shader must already be in place.
- **godot-verify** — run after changes.

## Steps

### 1 — Add uniforms to `shaders/material/grass_billboard.gdshader`

```glsl
uniform float animation_fps : hint_range(1.0, 24.0) = 8.0; // target framerate
```

### 2 — Quantize TIME inside `vertex()`, before the wind sample

Replace the raw `TIME` reference in the wind block with a quantized version:

```glsl
// Quantize TIME to discrete steps — the "handdrawn" snap
float frame_time = 1.0 / animation_fps;
float quantized_time = floor(TIME / frame_time) * frame_time;

// Per-instance phase: shift each blade's snap boundary so they don't all update
// on the same frame. Uses world XZ (same source as wind phase) — no extra data needed.
float snap_phase = fract(world_xz.x * 0.17 + world_xz.y * 0.31) * frame_time;
float t = (quantized_time + snap_phase) * wind_speed + phase;
```

Then use `t` in the noise samples (replace the original `t = TIME * wind_speed + phase;` line).

### Full vertex() wind block after applying quantization

```glsl
float sway_mask = 1.0 - UV.y;
vec2 world_xz = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xz;
float phase = fract(world_xz.x * 0.37 + world_xz.y * 0.59);

// Quantize
float frame_time = 1.0 / animation_fps;
float quantized_time = floor(TIME / frame_time) * frame_time;
float snap_phase = fract(world_xz.x * 0.17 + world_xz.y * 0.31) * frame_time;
float t = (quantized_time + snap_phase) * wind_speed + phase;

vec2 dir1 = wind_direction;
vec2 dir2 = vec2(-wind_direction.y, wind_direction.x) * 3.14159;
float n1 = smooth_noise(world_xz * 0.3 + dir1 * t);
float n2 = smooth_noise(world_xz * 0.3 + dir2 * t * 0.7);
float wind = (n1 * 0.7 + n2 * 0.3) * 2.0 - 1.0;

vec3 perp = vec3(-wind_direction.y, 0.0, wind_direction.x);
VERTEX += perp * wind * wind_strength * sway_mask;
```

### 3 — Tune in the Inspector

- `animation_fps = 8` — 8 fps is a good pixel-art default. Lower (4–6) = choppier/more stylized. Higher (12–24) = smoother.
- Keep `wind_speed` and `wind_strength` from the wind skill; they work independently of quantization.

### 4 — Verify

```bash
tools/validate.sh
$GODOT --headless --path . --quit-after 3 2>&1 | grep -E "SCRIPT ERROR|ERROR"
```

F5: blades should visibly snap between positions at the target fps — not smoothly interpolate. With `animation_fps = 8`, you should see ~8 distinct positions per second.

## Key rules

- **Quantize `TIME`, not the output angle** — quantizing the angle produces a hard snap every frame; quantizing `TIME` means the noise function itself steps, which is more natural.
- **Always add per-instance `snap_phase`** — without it, every blade snaps simultaneously (field "pulses" in unison).
- **`animation_fps` is an art parameter**, not a performance setting — it has no CPU/GPU cost impact.

## Applies beyond grass

The same `floor(TIME / frame_time) * frame_time` pattern works in any TIME-driven shader: water ripples, flag cloth, character outline wobble. It is a general pixel-art animation convention.
