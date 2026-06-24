---
name: godot-data-driven-enemy
agents: [godot-combat]
description: >-
  Engine-level, game-agnostic pattern for data-driven, trait-mixing ENEMIES in Godot 4.x —
  author each enemy as a typed `.tres` ARCHETYPE Resource (stats + an ordered
  `Array[PackedScene]` of behaviour pieces) that drives ONE generic enemy scene, instead of
  one `extends Enemy` subclass per type. Behaviours are STATEFUL child component NODES
  (`extends EnemyBehaviour extends Node`, instanced under an `Abilities` container at spawn,
  reached through guarded `has_method` seams) — NOT stateless `Effect` Resources, because
  enemy behaviour is per-frame and hooks engine seams (`_physics_process`, hover spring, dive
  tween, magnet hit-counter). Composing `[MagnetBehaviour]` onto tank stats yields a
  tank-magnet, `[ShooterAttack]` onto tank stats a tank-shooter — new combos with NO new
  subclass. Use when enemy variants are about to multiply into a subclass-per-type explosion,
  when "trait-mixing", "tank that also shoots", "data-driven enemy", "enemy archetype",
  "compose enemy behaviours", or "enemy variant without a new class" appears, or when adding
  the 4th+ enemy type. Coexists with / migrates from existing `extends Enemy` subclasses
  incrementally. Composes godot-enemy-ai (FSM stays — NO behaviour trees), godot-composition
  (child component nodes), godot-fps-enemy-combat (the apply_damage/died contract), and mirrors
  godot-data-driven-effect-composition (the Resource-graph analogue) — cross-references all four,
  duplicates none. The enemy sibling of the effect-composition pattern.
---

# Data-driven, trait-mixing enemies (Godot 4.x)

Past three or four enemy types, a `extends Enemy` subclass per variant explodes combinatorially:
a "tank that also pulls bullets" or a "tank that also shoots" needs a new subclass for every
stat × behaviour pair, and shared logic gets copy-pasted across siblings. The reusable win is to
split an enemy into **stats authored as data** and **behaviours composed as nodes**: one typed
`.tres` ARCHETYPE carries the numbers (health, speed, ranges, score, tint) plus an ordered list
of behaviour-piece scenes; ONE generic `enemy.tscn` reads that archetype at spawn, seeds its
stats, and instances each listed behaviour as a child node under an `Abilities` container. New
enemy = a new `.tres` an author edits (or a new behaviour node), not a new subclass. Trait-mixing
falls out for free: list `[MagnetBehaviour]` with tank stats → a tank-magnet; list
`[ShooterAttack]` with tank stats → a tank-shooter — combos impossible by single-inheritance.

This is the enemy sibling of `godot-data-driven-effect-composition`. Both author behaviour as a
typed Resource graph, but the **carrier differs** — and that difference is the whole skill.

## The key design insight — node-behaviours, NOT resource-effects

`godot-data-driven-effect-composition` models a cast/spell as a Resource owning stateless
`Effect` Resources, each a fire-once `apply(target, ctx)`. **Do NOT reuse `Effect` for enemy
behaviour.** An enemy behaviour is the wrong shape for a stateless Resource:

- it is **per-frame** (`_physics_process`: hover spring, magnet contact poll, bob sine),
- it is **stateful per instance** (dive-in-progress guard, telegraph re-entry lock, hit counter,
  magnet group membership, accumulated bob time),
- it **hooks engine seams** (`move_and_slide`, `create_tween`, `look_at`, nav-velocity callbacks),
- it **owns child nodes / materials** (the magnet bubble mesh, tinted surface materials).

A `Resource` has no `_physics_process`, no scene-tree lifecycle, and is SHARED across every
loader (a `.tres` loaded twice shares its sub-resources) — fatal for per-instance state. So the
ARCHETYPE is the data analogue of `CastData` (typed `.tres`, `@export` stat list + an ordered
piece list), but the pieces it lists are **NODES** (`extends EnemyBehaviour extends Node`),
instanced fresh per enemy, exactly the child-component model `godot-composition` prescribes for
stateful per-entity behaviour. Data rides the Resource; live behaviour rides nodes.

|                        | `godot-data-driven-effect-composition` (cast) | THIS skill (enemy)                          |
| ---------------------- | --------------------------------------------- | ------------------------------------------- |
| Carrier                | typed `Resource` (`CastData`)                 | typed `Resource` (`EnemyArchetype`)         |
| Piece                  | `Effect` **Resource**, stateless              | `EnemyBehaviour` **Node**, stateful         |
| Lifecycle              | `apply(target, ctx)` fire-once                | `bind(enemy)` + `_physics_process` + tweens |
| Shared across loaders? | yes (stateless, fine)                         | NO — fresh node instance per enemy          |
| New behaviour          | new `Effect` subclass / new `.tres`           | new `EnemyBehaviour` scene / new `.tres`    |

## Requirements

- `godot-code-rules` (or the project's strict-typing gate) — `EnemyArchetype` and every behaviour
  is strict typed GDScript: line-1 path header, `class_name`, typed `@export`s/returns; numeric
  stats use `@export_range`, grouped with `@export_group`; the duck-typed behaviour seams go
  through a `has_method` guard + `@warning_ignore("unsafe_method_access")`. Load BEFORE writing.
- `godot-composition` — behaviours are component child NODES under an `Abilities` container;
  signals up / calls down. `bind(enemy)` is calls-down; behaviours do not reach up except through
  the enemy's public seams. Modularize on demand — extract a behaviour only when a variant needs it.
- `godot-enemy-ai` — the enemy keeps its native nav + node-FSM. Behaviours plug INTO the existing
  `perform_attack` / movement seams; they do NOT replace the FSM. **NO behaviour trees** (banned
  by that skill) — FSM stays, archetype only swaps how-it-fights / how-it-moves.
- `godot-fps-enemy-combat` — the archetype MUST preserve the duck-typed `on_hit()` / `apply_damage`
  / `died(enemy)` contract and the child `HealthComponent`. Stats only seed `HealthComponent`;
  they do not change the hit/death seam.
- `godot-data-driven-effect-composition` — read for the Resource-authoring feel; the archetype
  mirrors its `.tres` + `@export`-list shape. Do NOT reuse its `Effect` base for behaviour
  (see the insight above).

## Project conventions

Engine-agnostic shape; adapt paths/names to the host project.

- Archetype Resource: `EnemyArchetype extends Resource` — stats only (`@export_range` each numeric
  - `tint_color`, `display_name`) plus `@export var behaviours: Array[PackedScene]`. No per-frame
    logic. Put the data class with the project's reusable enemy lib (e.g. `tools/lib/enemy/`).
- Behaviour base: `EnemyBehaviour extends Node` — defines the OPTIONAL seam methods (below) as
  no-op virtuals. Put it beside the archetype.
- Behaviour pieces: one scene+script per piece in `entities/enemy/behaviours/` (e.g.
  `magnet_behaviour.gd`, `shooter_attack.gd`, `flying_movement.gd`), each `extends EnemyBehaviour`,
  owning its own `@export` tunables, tints, child nodes.
- Generic enemy scene: the ONE `entities/enemy/enemy.tscn` (`class_name Enemy`), with an
  `Abilities: Node` child (the behaviour container) and a child `HealthComponent`.
- Archetypes: `.tres` files in `archetypes/` (`grunt.tres`, `tank.tres`, `tank_magnet.tres`, …).
- Node names PascalCase; files/folders snake_case.

## The pattern (four parts)

1. **`EnemyArchetype` Resource = the data** (`.tres`, not JSON). Stats + an ordered piece list:

   ```gdscript
   class_name EnemyArchetype
   extends Resource

   @export_group("Identity")
   @export var display_name: String = "Grunt"
   @export var tint_color: Color = Color.WHITE

   @export_group("Stats")
   @export_range(1, 50, 1) var max_health: int = 2
   @export_range(0.5, 20.0, 0.1) var move_speed: float = 3.5
   @export_range(1, 100, 1) var score_value: int = 1
   # ... patrol_speed, detect_range, attack_range, escape_range, attack_cooldown ...

   @export_group("Behaviours")
   ## Ordered behaviour-component scenes (each root extends EnemyBehaviour).
   ## Empty = default melee. Instanced under Enemy/Abilities at spawn.
   @export var behaviours: Array[PackedScene] = []
   ```

2. **`EnemyBehaviour` Node base = the seam contract.** Optional virtuals the enemy calls only via
   `has_method` — a behaviour overrides just the ones for its role:

   ```gdscript
   class_name EnemyBehaviour
   extends Node

   ## Called once after instancing under Abilities. Store the enemy ref here.
   func bind(_enemy: Node) -> void: pass

   # Attack role — overrides the default melee:
   func do_attack() -> void: pass

   # Movement role — overrides the default gravity-nav walk:
   func wants_nav_velocity() -> bool: return false   # true = I drive movement
   func drive_move(_speed: float, _delta: float) -> void: pass
   func drive_stop(_delta: float) -> void: pass
   func blocks_nav_velocity() -> bool: return false  # true = suppress nav callback (e.g. mid-dive)
   func pre_set_destination(point: Vector3) -> Vector3: return point  # e.g. flyer clamps Y
   ```

   A behaviour is per-frame/stateful by overriding `_physics_process` and holding its own vars —
   that is exactly why it is a Node, not a Resource.

3. **The generic `Enemy` reads the archetype at spawn.** In `_ready()`: seed stats, then instance
   - bind behaviours, then preserve the bottom-up HealthComponent ordering:

   ```gdscript
   @export var archetype: EnemyArchetype
   @onready var _abilities: Node = $Abilities
   @onready var _health_comp: HealthComponent = $HealthComponent

   func _ready() -> void:
       if archetype != null:
           health = archetype.max_health
           score_value = archetype.score_value
           move_speed = archetype.move_speed
           # ... other stats ...
           if archetype.tint_color != Color.WHITE:
               _apply_tint(archetype.tint_color)
           for scene: PackedScene in archetype.behaviours:
               var beh: Node = scene.instantiate()
               _abilities.add_child(beh)
               if beh.has_method("bind"):
                   @warning_ignore("unsafe_method_access")
                   beh.bind(self)
       # Seed HealthComponent AFTER stats, then reset — child _ready ran first (bottom-up).
       _health_comp.max_health = health
       _health_comp.reset()
       _health_comp.died.connect(_on_health_comp_died)
   ```

4. **The enemy's seams delegate to bound behaviours, else fall back.** Each seam loops `Abilities`
   children, duck-checks the role method, delegates if present, else runs the built-in default:

   ```gdscript
   func perform_attack() -> void:
       for child: Node in _abilities.get_children():
           if child.has_method("do_attack"):
               @warning_ignore("unsafe_method_access")
               child.do_attack()
               return
       _default_melee_lunge()   # archetype-free / behaviour-free path unchanged

   func move_along_path(speed: float, delta: float) -> void:
       for child: Node in _abilities.get_children():
           if child.has_method("wants_nav_velocity"):
               @warning_ignore("unsafe_method_access")
               if child.wants_nav_velocity():
                   @warning_ignore("unsafe_method_access")
                   child.drive_move(speed, delta)
                   return
       _default_gravity_walk(speed, delta)
   ```

   The enemy stays THIN: it owns nav / perception / health / death; behaviours own how-it-fights
   and how-it-moves. The hit/death contract (`on_hit` → `apply_damage` → HealthComponent → `died`)
   is untouched by the archetype — `godot-fps-enemy-combat` still holds.

**Trait-mixing is the payoff.** A behaviour piece is delivery-agnostic — it binds to whatever stats
the archetype carries. So:

- `tank_magnet.tres` = tank stats + `behaviours = [MagnetBehaviour]` → tanky AND pulls bullets.
- `tank_shooter.tres` = tank stats + `behaviours = [ShooterAttack]` → tanky AND fires telegraphed shots.
- `tank.tres` / `runner.tres` = pure stat + tint, `behaviours = []` → no behaviour node at all.

None of these is a subclass. That reuse — one behaviour piece composing with any stat set — IS the
win, exactly as splitting WHAT-from-WHOM is in the effect-composition skill.

## Steps (apply the pattern to a project)

1. **Write `EnemyArchetype`** (part 1) — stats your enemy needs, `@export_range`'d + grouped, plus
   `behaviours: Array[PackedScene]`. Author one `grunt.tres` with no behaviours that reproduces the
   plain enemy — proves the generic scene + archetype path before any behaviour exists.
2. **Write `EnemyBehaviour`** (part 2) — the no-op virtual base. One file, reused by every piece.
3. **Add the seams to the generic `Enemy`** (parts 3–4) — `@export var archetype`, the `_ready()`
   seed+instance loop, and the `has_method`-guarded delegation in `perform_attack` / movement /
   nav-velocity. Keep every built-in default as the no-archetype fallback so existing subclasses
   and the bare scene still work.
4. **Extract behaviour pieces from existing subclasses** — MOVE the logic, don't rewrite it. An
   attack subclass becomes a `do_attack()` behaviour; a movement subclass (flyer) becomes a
   `wants_nav_velocity` + `drive_move`/`drive_stop` behaviour. Each `extends EnemyBehaviour`, owns
   its `@export`s, does setup in `bind()` (groups, tints, child nodes, deferred lifts).
5. **Author archetypes** — mix stats + a behaviour list per `.tres`. A trait-mix is a new `.tres`
   only (e.g. tank stats + `[MagnetBehaviour]`); no code.
6. **Spawn by archetype** — give the wave/spawner an `EnemyArchetype` slot; when set, instance the
   generic scene and assign `enemy.archetype = …` BEFORE `add_child` so `_ready()` seeds from it.
   Leave existing PackedScene spawn slots as a fallback (see migration).
7. **Headless-smoke the seams** (`godot-runtime-smoke`) — boot the generic scene with an archetype,
   assert `HealthComponent.max_health == archetype.max_health`, simulate hits → `died` fires once,
   `score_value` matches; for a trait-mix assert the behaviour's observable (in its group / a
   `perform_attack()` spawns a projectile). A smoke that can't fail proves nothing.

## Incremental migration (NO big-bang rewrite)

The archetype path is ADDITIVE — `@export var archetype` defaults null, and when null the enemy
uses its manually-set `@export` stats exactly as before. So a project migrates one type at a time:

1. Land the generic scene + archetype reading with `archetype == null` falling through to today's
   behaviour. Existing `extends Enemy` subclasses keep working untouched.
2. Migrate the **trivial stat-only variants first** (tank, runner = stats+tint, no behaviour) —
   cheapest, frees those subclasses immediately.
3. **Extract** a complex subclass's logic into a behaviour piece (step 4) — but KEEP the standalone
   subclass working in parallel. Extraction enables trait-mixing without deleting the shipped variant.
4. The spawner accepts archetype-or-PackedScene per slot, so archetype and subclass enemies coexist
   in the same wave. Delete a subclass only once its behaviour piece is proven in a smoke + a windowed run.

This avoids a flag-day rewrite: each slice is independently buildable, verifiable, and shippable.

## Verification checklist

- Strict-typing gate passes — archetype + every behaviour typed, every duck-typed seam guarded.
- A grunt archetype with `behaviours = []` reproduces the plain enemy: walks, patrols, chases,
  takes its hits, dies, emits `died` once, awards score.
- A NEW enemy is authored as a `.tres` ONLY (stat mix + behaviour list) with no script edit, and
  the enemy in-game shows those stats AND that behaviour.
- A trait-mix proves composition: a tank+magnet archetype is tanky (full hit count) AND pulls
  bullets (in the magnet group, bubble visible); a tank+shooter is tanky AND fires — neither
  exists as a subclass.
- `HealthComponent.max_health` after spawn equals `archetype.max_health` (stats seeded, bottom-up
  reset preserved); the `on_hit`/`apply_damage`/`died` contract is unchanged.
- An archetype-driven enemy and a legacy subclass enemy coexist in one wave with no errors.
- Headless smoke asserts the seams and FAILS if the seed loop or delegation is broken.

## Error → Fix

| Symptom                                                                                         | Fix                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behaviour modelled as an `Effect` Resource — no `_physics_process`, state bleeds across enemies | Wrong carrier. Enemy behaviour is stateful/per-frame → a child `Node` (`extends EnemyBehaviour`), not a Resource. Resource is for the stateless cast `Effect` only.                                                                                        |
| All enemies of a type flash/tint together, or share a counter                                   | A `.tres` shares its sub-resources across loaders, AND a shared material flashes everyone. Behaviours are fresh node instances per enemy; `duplicate()` materials before mutating (`set_surface_override_material`).                                       |
| `HealthComponent.max_health` stays at the component default, not the archetype's                | Child `_ready()` runs before the parent's (bottom-up). Seed `_health_comp.max_health = health` then `_health_comp.reset()` in the ENEMY's `_ready()`, after applying archetype stats.                                                                      |
| `bind()` reads `global_position` and it's wrong / zero                                          | `_ready()`/`bind()` fire before the spawner sets `global_position`. Defer position-dependent setup with `call_deferred` (e.g. a flyer's hover lift).                                                                                                       |
| `UNSAFE_METHOD_ACCESS` on `child.do_attack()` / `beh.bind()` fails the gate                     | Guard with `has_method` then annotate the call `@warning_ignore("unsafe_method_access")`; never lower warning levels.                                                                                                                                      |
| Adding a behaviour forces edits to `enemy.gd`                                                   | The enemy must only loop `Abilities` + duck-check role methods; a new piece is a new scene + a `.tres` listing it, never a call-site edit. If you're editing the enemy per behaviour, the seam set is too narrow — widen the contract once, not per piece. |
| Tempted to reach for a behaviour tree for multi-step behaviour                                  | Banned by `godot-enemy-ai`. The FSM stays; a behaviour plugs into `do_attack`/movement seams and runs its own tween/timer state internally.                                                                                                                |
| Two attack behaviours on one archetype, only the first fires                                    | This contract resolves the FIRST `do_attack` child (single attack role). Multi-attack stacking / behaviour priority is out of scope — park it until a combo needs it.                                                                                      |
| Wanted JSON for archetypes                                                                      | Use `.tres` typed Resources — typed sub-resources (the `PackedScene` list), editor authoring, load-time checks; JSON loses all three.                                                                                                                      |
| Big-bang migration broke shipped enemies                                                        | Migrate incrementally: `archetype == null` falls through to legacy `@export` stats; move stat-only variants first; keep extracted subclasses running in parallel until their behaviour piece is proven.                                                    |

Pattern skill (framework). The enemy sibling of `godot-data-driven-effect-composition`; composes
`godot-enemy-ai` (FSM, no BTs), `godot-composition` (child component nodes), and
`godot-fps-enemy-combat` (the hit/death contract) — cross-referenced, not duplicated.
