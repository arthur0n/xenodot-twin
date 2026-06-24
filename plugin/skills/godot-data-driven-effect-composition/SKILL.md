---
name: godot-data-driven-effect-composition
agents: [godot-combat]
description: >-
  Engine-level, game-agnostic pattern for any "do WHAT to WHOM" system in Godot 4.x —
  abilities, spells, melee swings, traps, projectile payloads, pickups, status effects.
  Model the ability as a typed `Resource` (a `.tres`, never JSON) that owns an ordered
  list of `Effect` Resources (WHAT) paired with a `TargetResolver` Resource (WHOM); carry
  runtime state in a plain `RefCounted` Context DTO; keep effect application INSIDE the
  spawned/owning entity (no central manager until a multi-event or instigator-side need
  forces it); reach the target through a guarded duck-typed seam (`has_method` +
  `@warning_ignore`). New behaviour = a new `.tres` or a new `Effect` subclass, no
  call-site change. Use when designing a data-driven ability/effect/spell/skill system,
  when "what × whom" or "effect + target" composition appears, when abilities are about to
  be hardcoded per-script and should be authored data instead, or when choosing how to
  structure damage/heal/knockback/slow so designers edit resources not code. Includes a
  worked MELEE transfer sketch and the reference lineage (OctoD, MachiTwo, kibble-cabal,
  willnationsdev) to study when extending. Candidate for framework promotion. The concrete
  DiceOfFate instance of this pattern is the game-local `cast-system` skill.
---

# Data-driven effect composition (Godot 4.x)

Any "apply some effect to some target(s)" system — spells, melee, traps, pickups, projectile
payloads, status effects — wants the SAME shape, and most engines/addons get it wrong by
embedding targeting logic inside the ability's activation method. The reusable win is a
**two-axis split** authored as typed Resources: WHAT to do (`Effect`) is independent of WHOM
to do it to (`TargetResolver`), runtime values ride a lightweight Context DTO, and the
application loop lives in whatever entity owns the event — not a god-object manager. New
behaviour becomes a new `.tres` an author edits (or a small `Effect` subclass), never a
firing-path edit. This skill is the engine-level pattern; a project applies it concretely
(in DiceOfFate, the game-local `cast-system` skill).

## Requirements

- `godot-code-rules` (or the project's strict-typing equivalent) — Resources need explicit
  `class_name`, typed `@export`s and return types; the duck-typed target seam goes through a
  `has_method` guard + `@warning_ignore("unsafe_method_access")`.
- `godot-composition` (or equivalent) — `Effect` / `TargetResolver` / the ability Resource
  are DATA (calls down via duck-typed apply); the Context is a plain `RefCounted` DTO with no
  node lifecycle. NO autoload, NO central manager — the owning entity runs the loop.

## The pattern (four parts)

1. **Ability = a typed `Resource`** (`.tres`, not JSON). Holds metadata + an ordered
   `@export var effects: Array[Effect]` + an `@export var resolver: TargetResolver`. Prefer
   `.tres` over JSON: Godot gives typed sub-resources, editor authoring, and load-time type
   checks for free; JSON throws all of that away (the dev-vlog this pattern descends from
   lands on Resources too).
2. **`Effect` Resource = WHAT.** Tiny base with one virtual:

   ```gdscript
   class_name Effect
   extends Resource

   func apply(_target: Node, _ctx: AbilityContext) -> void:
       pass  # no-op base; override per concrete effect
   ```

   Concrete effects `@export` their tunables and reach the target via a **guarded duck-typed
   seam** — they assume no concrete target type, so the same `DamageEffect` works on an enemy,
   a destructible, a player:

   ```gdscript
   class_name DamageEffect
   extends Effect

   @export var amount: int = 1

   func apply(target: Node, _ctx: AbilityContext) -> void:
       if not target.has_method("apply_damage"):
           return  # no seam -> no-op, never a crash
       @warning_ignore("unsafe_method_access")
       target.apply_damage(amount)
   ```

3. **`TargetResolver` Resource = WHOM.** Answers "who receives the effects" independently of
   what the effects are:

   ```gdscript
   class_name TargetResolver
   extends Resource

   func resolve(_ctx: AbilityContext) -> Array[Node]:
       return []  # base; concrete returns hit body / radius query / instigator
   ```

   The simplest concrete returns the single hit body (`[ctx.target]`); richer ones do a radius
   query, a raycast, a shapecast, or return the instigator (self-buff). Swapping the resolver
   changes targeting with zero change to the effects.

4. **Context DTO** carries runtime state between the trigger and the effects — a plain
   `RefCounted`, never a node:

   ```gdscript
   class_name AbilityContext
   extends RefCounted

   var instigator: Node       # who caused it
   var target: Node           # the primary hit (if any)
   var origin: Vector3        # where it happened
   var normal: Vector3        # surface normal at hit
   ```

   Components may inject extra fields; keep it a dumb data bag.

**Application lives in the owning entity, not a manager.** The entity that owns the trigger
event (the spawned projectile on `body_entered`, the melee hitbox on overlap, the trap on
`body_entered`) runs the loop:

```gdscript
var ctx := AbilityContext.new()
ctx.instigator = self
ctx.target = body
# ... fill origin/normal ...
for t: Node in ability.resolver.resolve(ctx):
    for eff: Effect in ability.effects:
        eff.apply(t, ctx)
```

A central manager is an anti-pattern here until a real need forces it (see "When a manager
earns its place"). For a spawned object, an intermediate "instance" linking layer leaks
floating nodes — avoid it; let the spawned entity own its own hit→effect logic.

## Steps (apply the pattern to a new system)

1. **Name the ability Resource** for the domain (`SpellData`, `CastData`, `AbilityData`,
   `TrapData`). `class_name`, `extends Resource`, the two `@export`s above (+ any metadata).
2. **Write the `Effect` + `TargetResolver` bases** (the two snippets above) once per project;
   reuse across every system.
3. **Author concrete `Effect`s** for the domain (`DamageEffect`, `HealEffect`, `KnockbackEffect`,
   `SlowEffect`). Each duck-types ONE seam method on the target.
4. **Author concrete `TargetResolver`s** for the delivery: `HitTargetResolver` (single body),
   `RadiusTargetResolver` (group/area query), `RaycastTargetResolver`, `SelfTargetResolver`
   (returns `[ctx.instigator]`).
5. **Pick the owning entity** for each trigger and put the resolve→apply loop in its event
   handler. Build the Context there.
6. **Author `.tres` per ability** — mix effects + pick a resolver. New ability = new `.tres`,
   no code.
7. **Headless-smoke the data path**: load the `.tres`, build a Context, run the resolve+apply
   loop against a stub/real target, assert the observable (seam method called, state changed).
   Mirror the entity's exact loop lines so the test tracks the real path.

## Worked transfer: a melee swing (illustrative, not a build task)

The pattern is delivery-agnostic — swap only the resolver and the owning entity, REUSE the
effects:

- Owning entity: a melee `Area3D` hitbox on the weapon, enabled for the swing's active frames
  (instead of a spawned projectile).
- New resolver `MeleeContactResolver` — on apply, returns `area.get_overlapping_bodies()`
  filtered to a group, so one swing hits everything in the arc:

  ```gdscript
  class_name MeleeContactResolver
  extends TargetResolver

  func resolve(ctx: AbilityContext) -> Array[Node]:
      var out: Array[Node] = []
      # instigator carries the active hitbox Area3D for this swing
      if ctx.instigator is Area3D:
          for b: Node3D in (ctx.instigator as Area3D).get_overlapping_bodies():
              if b.is_in_group("enemies"):
                  out.append(b)
      return out
  ```

- **Same `DamageEffect` + `KnockbackEffect`, same Context, same loop** — only the resolver and
  the trigger node differ. A `melee_swing.tres` with `[DamageEffect(5), KnockbackEffect]` +
  `MeleeContactResolver` is a melee ability with zero new effect code. That reuse IS the
  payoff of splitting WHAT from WHOM.

## Where to look when extending (reference lineage — study, do NOT depend on)

These are reading sources, not dependencies; each is a C#/C++/migrating addon not adoptable
into a strict-typed GDScript project, but the design ideas transfer:

| Extending toward…                                                    | Reference                                                              | What to lift                                                                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Prereq / cost / cooldown gate before an ability fires                | OctoD `godot-gameplay-systems` (MIT)                                   | Tag-based gating: `tags_activation_required`, `tags_block`, `grant_tags_required`, `tags_to_remove_on_*`                           |
| Delivery taxonomy / AoE & radius / projectile / trap resolvers       | MachiTwo `AbilitySystem` — ASDelivery + ASPackage (MIT)                | Reproduce in GDScript as `AreaTargetResolver`, `RaycastTargetResolver`, `ShapeCastTargetResolver`, `ProjectileTargetResolver`      |
| Multi-event / sequenced / repeating effects (`on_tick`, `on_bounce`) | kibble-cabal `ability-system` (MIT)                                    | `Effect` subclass taxonomy + a `LoopEffect` pattern for sequenced/repeating application; an `EffectMap` of `event_key → [effects]` |
| The core split itself (closest intellectual ancestor)                | willnationsdev — godot-extended-libraries `godot-ideas` discussion #29 | Targeter / Effect / Skill triad — read before any structural extension                                                             |

## When a central manager earns its place (and not before)

Keep application in the owning entity for single-trigger abilities. Introduce a manager
component ONLY when:

- an ability fires **instigator-side** effects (self-heal, self-buff) with no spawned carrier, OR
- an ability is **multi-stage / multi-spawn** (spawns several carriers, sequences over time), OR
- a **prereq/cost gate** must validate before anything spawns (then the manager validates +
  builds the Context, but spawned carriers STILL own their own hit→effect).
  Until then a manager is a god-object that re-centralizes what the split decentralized.

## Verification checklist

- The project's strict-typing gate passes — every Resource typed, the duck-typed seam guarded.
- A new ability is authored as a `.tres` ONLY (new effect mix / resolver swap) with no
  call-site edit, and it works.
- Swapping the `resolver` on an existing `.tres` (e.g. Hit → Radius) changes who is affected
  without touching any `Effect`.
- An `Effect` applied to a target lacking the seam method **no-ops silently** (no crash).
- Headless smoke: load the `.tres`, run resolve+apply against a stub target, assert the seam
  method ran / state changed — and it FAILS if you break the loop (a test that can't fail
  proves nothing).
- The same `Effect` subclass is reused across at least two delivery systems (e.g. projectile
  - melee) — confirming WHAT is decoupled from WHOM.

## Error → Fix

| Symptom                                                                               | Fix                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect crashes on some targets                                                        | Don't assume a type — guard with `has_method` and no-op when the seam is absent.                                                                                                                                                                                                                                                                           |
| Targeting logic duplicated across abilities                                           | It belongs in a `TargetResolver` Resource, not in each effect/ability — extract it.                                                                                                                                                                                                                                                                        |
| Want JSON config                                                                      | Use `.tres` typed Resources instead — you get typed sub-resources, editor authoring, and load-time checks; JSON loses all three.                                                                                                                                                                                                                           |
| A central manager grew and owns everything                                            | Move application back into the owning entity; the manager only validates prereqs / builds Context for instigator-side or multi-stage casts.                                                                                                                                                                                                                |
| Spawned carrier's effects live in the manager → leaking linker nodes                  | Put hit→effect inside the spawned entity; reject an intermediate "instance" linking layer.                                                                                                                                                                                                                                                                 |
| `UNSAFE_METHOD_ACCESS` fails the strict gate                                          | Annotate the guarded duck-typed call with `@warning_ignore("unsafe_method_access")`; never lower warning levels.                                                                                                                                                                                                                                           |
| Context is a Node and leaks / needs freeing                                           | Make it a plain `RefCounted` DTO — no node lifecycle, no `queue_free`.                                                                                                                                                                                                                                                                                     |
| Adding a new resolver forces edits to every effect                                    | They're coupled — the effect must read only the resolved `target` + `ctx`, never query targets itself.                                                                                                                                                                                                                                                     |
| Two instances of the same ability share state / a stateful Effect bleeds across casts | A `.tres` loaded more than once SHARES its `@export` sub-resource objects (each `Effect` / `TargetResolver`) across every loader. Harmless while Effects are stateless (read-only `amount`); once an Effect holds mutable per-cast state, make it unique — `resource_local_to_scene = true` on the sub-resource, or `duplicate(true)` the ability at load. |

Pattern skill (framework-promotion candidate) abstracted from the DiceOfFate Cast system; the
concrete instance is the game-local `cast-system` skill. Reference lineage cited above is
MIT-licensed study material, not a dependency.
