# 3D Fire VFX (GPUParticles3D billboard) — transcript digest

**Source** — `godot-3d-fire-vfx.md` (raw now in `transcripts/archive/godot-3d-fire-vfx.md`). Tutorial: "bring the fire" — particle-based 3D fire in Godot.
**Why harvested** — about to build a 3D FIRE VFX effect for the FPS (could tie to the new FIRE `DamageType` / fire resistance later).

**Technique** — PARTICLES, not shader/flipbook/mesh. Two GPUParticles3D (fire + sparks), each a quad-mesh draw pass + ParticleProcessMaterial, StandardMaterial3D set to **particle billboard** + unshaded + vertex-color-as-albedo so the process material's color ramp drives tint. Plus an OmniLight3D flicker via an autoplay AnimationPlayer. **Lifecycle = PERSISTENT LOOPING emitter** (continuously emits, never frees) — the opposite of a fire-and-free one-shot.

**Points**
| # | Point (technique/claim) | Valid for our stack? | Already learned? | Where / gap | Verdict |
|---|---|---|---|---|---|
| 1 | Particles vs custom shader — pick particles for dynamic/moving fire | holds | partial | godot-oneshot-vfx = particles; shader path = `shaders/material/` (contract) but no fire shader | particles fits; shader alt parked |
| 2 | Source a fire texture from online VFX generator (effect-texture-maker, "explosion 2"), colors off, export PNG | holds w/ caveat | partial | asset-advisor loop sources PNG → `assets/textures/`; HD-vs-pixel import filter is an OPEN art decision (CLAUDE.md pixel-art residue note) | asset-request, not a code skill |
| 3 | GPUParticles3D + quad draw mesh + ParticleProcessMaterial; +gravity rise, sphere emit, +Y vel, scale curve, lifetime 1.2, RotY rand, amount ~50 | holds | partial | godot-oneshot-vfx owns the GPUParticles3D rig BUT only `one_shot=true` burst-then-free; continuous/looping process-material tuning (gravity/ramp/scale-curve) NOT covered | gap — looping fire emitter |
| 4 | StandardMaterial3D: albedo tex, transparency alpha, unshaded, vertex_color use_as_albedo, **billboard = particle billboard** | holds | gap | no skill states the particle-billboard + vertex-color-albedo material recipe (oneshot rig assumes a preset mesh/material) | gap |
| 5 | ParticleProcessMaterial Color ramp over lifetime + alpha curve for smooth fade | holds | gap | not in any skill | gap |
| 6 | Sparks = 2nd GPUParticles3D, circle tex, blend=add, ring emit, crazy random scale curve = flicker, render_priority over fire | holds | gap | additive billboard sparks + render_priority layering not covered | gap |
| 7 | Parent both under a Node3D ("VFX fire") for organization | holds | covered | godot-composition (scene as unit of composition) | covered |
| 8 | OmniLight3D + autoplay AnimationPlayer animating `light_energy` = flicker glow; light must not cast shadow (perf) | holds w/ caveat | partial | oneshot-vfx reuses MuzzleFlash OmniLight as shadowless **tween** pulse; here it's a **persistent animated** light — shadow-off perf rule carries over | partial |

**Godot 3 vs 4** — clean. All API is Godot 4 (GPUParticles3D, ParticleProcessMaterial, particle-billboard mode, draw-pass mesh). No Particles/ParticlesMaterial (3.x) references. Forward+ compatible (GPUParticles3D supported; only Compatibility renderer lacks features). No conflicts with CLAUDE.md conventions.

**Mapping summary** — covered 1, partial 4, gap 4 (no conflicts). Core gap = the **persistent looping fire emitter** lifecycle is NOT godot-oneshot-vfx (that is burst → `finished` → `queue_free`); fire never fires `finished` and must be placed/attached/removed deliberately. Material recipe (particle billboard + vertex-color-albedo + ramp/alpha curves) and additive sparks layer are uncovered.

**Recommended next** (for the current fire build)

- **skill-researcher** — evaluate a `godot-looping-particle-vfx` (or fire-specific) skill: persistent GPUParticles3D emitter lifecycle (attach/detach, no `finished`/free), billboard + vertex-color-albedo + ramp/alpha-curve material recipe, additive flicker sparks, shadowless animated flicker light. Sibling to godot-oneshot-vfx (fire-and-free), NOT a replacement. This is the gap blocking a clean fire build.
- **game-designer** — decide what fire IS in-game: ambient/world prop (looping) vs fire-typed cast/burning status effect (ties to FIRE `DamageType` + fire resistance, via cast-system). Lifecycle (looping vs timed) depends on this answer.

**Later** (valid, not needed this iteration)

- Custom flame shader path (`shaders/material/`) — more flexible/surface-fit; parked, particles chosen.
- Online VFX-texture sourcing + HD-vs-pixel filter/mipmap import reconciliation — asset-advisor + art-director call when sourcing the fire PNG.
