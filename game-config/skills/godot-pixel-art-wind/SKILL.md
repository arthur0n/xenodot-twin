---
name: godot-pixel-art-wind
description: Add noise-driven vertex wind animation to a billboard grass shader in Godot 4.x — two divergence-rotated noise samples (one scaled by π to kill repetition), per-instance world-position phase offset so every blade sways independently, rotation around the wind-perpendicular axis for stable direction across camera angles. Use this skill when adding wind animation to billboard grass, when all grass blades sway in unison (missing per-instance phase), when wind direction looks wrong or slides under an orthographic camera, or when layering animation on top of godot-multimesh-billboard.
---

# Godot Pixel-Art Wind (noise-driven vertex animation)

Layered on top of `godot-multimesh-billboard`. Adds a noise-driven sway to the `vertex()` function of `grass_billboard.gdshader`. Two noise samples at diverging angles — one scaled by an irrational (π) — kill the visible tiling repetition that a single noise produces. Each blade is phase-shifted by its world-position so blades don't all hit the peak sway at the same moment.

## Requirements

- **godot-multimesh-billboard** — this skill extends that shader's `vertex()`. The billboard logic and fake-perspective UV must already be present.
- **godot-verify** — run after changes.

## Steps

### 1 — Extend `shaders/material/grass_billboard.gdshader`

Add these uniforms at the top:

```glsl
uniform float wind_speed : hint_range(0.0, 5.0) = 1.0;
uniform float wind_strength : hint_range(0.0, 0.5) = 0.08;
uniform vec2 wind_direction = vec2(1.0, 0.0); // world XZ
```

Add a noise helper function (place before `vertex()`):

```glsl
float noise2d(vec2 p) {
    // Cheap 2D value noise — enough for wind, no texture dependency
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float smooth_noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    return mix(
        mix(noise2d(i), noise2d(i + vec2(1.0, 0.0)), f.x),
        mix(noise2d(i + vec2(0.0, 1.0)), noise2d(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}
```

Replace the `VERTEX = VERTEX;` placeholder in `vertex()` with:

```glsl
// Wind: only the top of the blade sways (UV.y == 0 is top in QuadMesh default)
float sway_mask = 1.0 - UV.y; // 1 at top, 0 at pivot

// Per-instance phase: offset by world-space XZ position so blades are out of sync
vec2 world_xz = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xz;
float phase = fract(world_xz.x * 0.37 + world_xz.y * 0.59); // deterministic, no rand()

float t = TIME * wind_speed + phase;

// Two noise samples at diverging angles — one scaled by π to kill repetition
vec2 dir1 = wind_direction;
vec2 dir2 = vec2(-wind_direction.y, wind_direction.x) * 3.14159; // perpendicular × π
float n1 = smooth_noise(world_xz * 0.3 + dir1 * t);
float n2 = smooth_noise(world_xz * 0.3 + dir2 * t * 0.7);
float wind = (n1 * 0.7 + n2 * 0.3) * 2.0 - 1.0; // remap to [-1, 1]

// Rotate the sway around the wind-perpendicular axis for stable direction
vec3 perp = vec3(-wind_direction.y, 0.0, wind_direction.x);
VERTEX += perp * wind * wind_strength * sway_mask;
```

### 2 — Verify

```bash
tools/validate.sh
$GODOT --headless --path . --quit-after 3 2>&1 | grep -E "SCRIPT ERROR|ERROR"
```

F5: blades should sway independently — no synchronized snapping. Adjust `wind_speed` and `wind_strength` in the Inspector.

## Key rules

- **Always mask sway by `1.0 - UV.y`** so the blade pivots at its base, not its center.
- **Phase via world position**, not `instance_custom` — the MultiMesh doesn't set custom data by default; world pos is free.
- **Two noise samples with one scaled by π** — a single noise produces visible tile seams across the field.
- **Rotate around the wind-perpendicular axis** so sway direction is stable across camera angles.

## Later

- `godot-pixel-art-quantization` — quantize `TIME` before feeding to wind so sway snaps to low-framerate steps.
- Player displacement — add a radial push to `VERTEX` based on player world position passed as a uniform.
