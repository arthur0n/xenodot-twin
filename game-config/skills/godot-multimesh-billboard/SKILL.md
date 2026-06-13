---
name: godot-multimesh-billboard
description: Spawn a dense billboard grass field as a MultiMeshInstance3D in Godot 4.x for a 3D pixel-art project — QuadMesh blades, camera-facing billboard via camera BASIS (orthographic-safe), alpha-scissor cutout, shadow casting disabled, and a fake-perspective UV trick to prevent blades from looking flat under an orthographic camera. Use this skill before building any MultiMesh foliage or vegetation, when billboard grass blades render edge-on or flat under an orthographic camera, when grass casts unwanted shadow patches on the ground, or when choosing between alpha-blend and alpha-scissor for foliage in a pixel-art SubViewport.
---

# Godot MultiMesh Billboard Grass

Dense pixel-art grass via `MultiMeshInstance3D`. Each blade is a `QuadMesh` camera-faced using the camera's **basis** (not `look_at` — orthographic has no vanishing point, so a perspective look-at causes edge-on blades as the camera moves). Alpha-scissor keeps edges crisp at low resolution; alpha-blend causes sort artifacts and partial-pixel fringing. Shadow casting is disabled on the mesh so blades don't cast patches on the ground.

## Requirements

- **godot-3d-pixelation** — grass renders inside the SubViewport; nearest-filter, AA off. Alpha-scissor is mandatory here; alpha-blend's sort artifacts are magnified at low res.
- **godot-pixel-lighting** — grass uses `render_mode unshaded` by design (flat-lit, cheap across hundreds of instances). Blades do NOT receive sun shadows; shadow casting is also off. Lit grass via `light_vertex` would be a separate slice that drops `unshaded`.
- **godot-code-rules** — GrassField GDScript must be strict typed; load before writing.
- **godot-verify** — run after any `.tscn`/`.gd` change.

## Scene structure

```
GrassField (Node3D)        ← has grass_field.gd
└── MultiMeshInstance3D    ← mesh = QuadMesh, cast_shadow = OFF
```

Shader file: `res://shaders/material/grass_billboard.gdshader`

## Steps

### 1 — Shader (`shaders/material/grass_billboard.gdshader`)

```glsl
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque;

uniform sampler2D blade_texture : source_color, filter_nearest;
uniform float alpha_scissor_threshold : hint_range(0.0, 1.0) = 0.5;

void vertex() {
    // Billboard: rotate the quad to face the camera using its BASIS, not look_at.
    // Orthographic cameras have no vanishing point — look_at would tilt blades as
    // the camera moves. Using the camera basis keeps every blade perfectly upright.
    MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
        INV_VIEW_MATRIX[0],
        INV_VIEW_MATRIX[1],
        INV_VIEW_MATRIX[2],
        MODEL_MATRIX[3]
    );

    // Fake-perspective UV: under orthographic, tall objects don't appear to recede.
    // Scale the UV horizontally at the top of the blade so it looks like it angles
    // away — gives depth without perspective projection.
    // UV.y == 0 is the top of the quad (Godot QuadMesh default).
    float perspective_scale = 1.0 - UV.y * 0.15;  // tweak 0.15 for strength
    UV.x = (UV.x - 0.5) * perspective_scale + 0.5;
    UV.x = clamp(UV.x, 0.0, 1.0);

    // No vertex displacement this slice. The godot-pixel-art-wind skill adds sway here.
}

void fragment() {
    vec4 col = texture(blade_texture, UV);
    ALPHA_SCISSOR_THRESHOLD = alpha_scissor_threshold;
    ALPHA = col.a;
    ALBEDO = col.rgb;
}
```

### 2 — GDScript (`entities/grass_field/grass_field.gd`)

```gdscript
# entities/grass_field/grass_field.gd
class_name GrassField
extends Node3D

@export var blade_count: int = 500
@export var spawn_radius: float = 10.0
@export var blade_width: float = 0.15
@export var blade_height: float = 0.6
# `seed` is a Godot global function — naming a var `seed` trips
# shadowed_global_identifier (warnings-as-error). Use spawn_seed.
@export var spawn_seed: int = 42

@onready var _multi: MultiMeshInstance3D = $MultiMeshInstance3D


func _ready() -> void:
    var mm := MultiMesh.new()
    mm.transform_format = MultiMesh.TRANSFORM_3D
    mm.instance_count = blade_count
    mm.mesh = _build_quad()
    _multi.multimesh = mm
    _multi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

    var rng := RandomNumberGenerator.new()
    rng.seed = spawn_seed
    for i: int in blade_count:
        var x: float = rng.randf_range(-spawn_radius, spawn_radius)
        var z: float = rng.randf_range(-spawn_radius, spawn_radius)
        mm.set_instance_transform(i, Transform3D(Basis(), Vector3(x, 0.0, z)))


func _build_quad() -> QuadMesh:
    var q := QuadMesh.new()
    q.size = Vector2(blade_width, blade_height)
    # Pivot at bottom: shift the quad up by half its height so it sits on y=0
    q.center_offset = Vector3(0.0, blade_height * 0.5, 0.0)
    return q
```

### 3 — Material

Assign a `ShaderMaterial` to `MultiMeshInstance3D.material_override`:

- Shader: `res://shaders/material/grass_billboard.gdshader`
- `blade_texture`: a pixel-art grass blade sprite (white silhouette on alpha, or a colored blade). **Required input.** If no blade sprite exists yet at this slice, render a solid-color placeholder blade AND flag the missing asset to the caller — do not silently work around it, so the user knows a real sprite is still owed.
- `alpha_scissor_threshold`: 0.5 (tweak if edges look jagged or blades disappear)

### 4 — Verify

```bash
tools/validate.sh
$GODOT --headless --path . --script tools/verify_scene.gd -- levels/open_world.tscn
$GODOT --headless --path . --quit-after 3 2>&1 | grep -E "SCRIPT ERROR|ERROR"
```

F5: blades should stand upright, face the camera as you Tab around, and cast no ground patches.

## Key rules

- **Always billboard via camera BASIS**, never `look_at` — orthographic cameras have no single vanishing point.
- **Always alpha-scissor**, never alpha-blend for foliage in this pixel-art SubViewport.
- **Always disable shadow casting** on the `MultiMeshInstance3D` for grass blades.
- Shader lives in `shaders/material/` — not `shaders/post/` (that folder is screen-space only).

## Later (follow-up slices)

- `godot-pixel-art-wind` — noise-driven vertex animation layered onto this shader's `vertex()`.
- `godot-pixel-art-quantization` — time quantization per-instance for low-framerate look.
- Player displacement — radial mask from player position, view-space axis split.
