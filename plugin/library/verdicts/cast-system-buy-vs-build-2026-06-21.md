# Cast System — Buy vs. Build Verdict

**Request** — Evaluate open-source ability/spell/cast systems for Godot 4.x; decide adopt vs. grow our own Cast System v1.
**Verdict** — Build our own. No adoptable candidate. v1 already cleaner architecture than all GDScript options.
**Date** — 2026-06-21
**Researched by** — Hermes (run_73ab9ddf779a48d680fdccf3e18d61f5)

---

## v1 state at decision point

Data-driven `.tres` Resources: `CastData = Effect[] × TargetResolver`; `GameContext`; gun stamps `CastData` onto projectile; projectile owns hit→effect; duck-typed `apply_damage` seam.
Parked (not yet built): prereq gate, AoE resolver, multi-event `EffectMap`.

---

## Candidates

| Addon                        | Source                                                                          | License | Godot                | Language                                | Last activity              | Verdict                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ------- | -------------------- | --------------------------------------- | -------------------------- | -------------------------------------------------------- |
| Forge Gameplay System        | [gamesmiths-guild/forge-godot](https://github.com/gamesmiths-guild/forge-godot) | MIT     | 4.6+                 | C# only                                 | v0.3.2 May 2026 (active)   | DEAD — C# only, GDScript project                         |
| OctoD / GGS                  | [OctoD/godot-gameplay-systems](https://github.com/OctoD/godot-gameplay-systems) | MIT     | 4.x                  | GDScript (migrating to C++ GDExtension) | active but split/migrating | SKIP — GDScript branch entering maintenance/life-support |
| MachiTwo/AbilitySystem       | [MachiTwo/AbilitySystem](https://github.com/MachiTwo/AbilitySystem)             | MIT     | 4.6                  | C++ GDExtension                         | v0.1.0-dev (early risk)    | SKIP — C++ internals not editable from GDScript          |
| kibble-cabal/ability-system  | [kibble-cabal/ability-system](https://github.com/kibble-cabal/ability-system)   | MIT     | 4+                   | C++ GDExtension                         | ~Feb 2024 (likely dormant) | SKIP — C++, dormant                                      |
| Relintai/entity_spell_system | [Relintai/entity_spell_system](https://github.com/Relintai/entity_spell_system) | MIT     | stuck 3.x/4.0 broken | Engine module                           | abandoned for G4           | SKIP — requires recompile, abandoned                     |
| gassygodot                   | Starkium/gassygodot                                                             | —       | —                    | —                                       | dead/bootstrap             | SKIP                                                     |

---

## Why build our own

No GDScript-native, Godot 4.3+-compatible, maintained ability system exists. The closest (OctoD GGS) is deprecating its GDScript branch in favour of C++ GDExtension. Forge is feature-complete but C# only. MachiTwo and kibble-cabal are C++ with no GDScript surface. Our v1 already achieves the key architecture split (Effect + TargetResolver as peer Resources) that none of the surveyed systems implement — they all embed targeting logic inside the ability activation method.

---

## Reference reading (not dependencies — study only when building parked pieces)

| Parked piece                                 | Reference                                                                                  | What to lift                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prereq gate (mana / cooldown / valid-target) | [OctoD GGS](https://github.com/OctoD/godot-gameplay-systems)                               | Tag-based gating: `tags_activation_required`, `tags_block`, `grant_tags_required`, `tags_to_remove_on_*`                                                                                   |
| AoE / radius TargetResolver                  | [MachiTwo/AbilitySystem — ASDelivery+ASPackage](https://github.com/MachiTwo/AbilitySystem) | Delivery taxonomy: melee Area / projectile / trap / radius → reproduce in GDScript as `AreaTargetResolver`, `RaycastTargetResolver`, `ShapeCastTargetResolver`, `ProjectileTargetResolver` |
| Multi-event effects / EffectMap              | [kibble-cabal/ability-system](https://github.com/kibble-cabal/ability-system)              | Effect subclass taxonomy + `LoopEffect` pattern for sequenced / repeating effects                                                                                                          |

**Intellectual ancestor**: willnationsdev's Targeter/Effect/Skill triad design — [godot-extended-libraries/godot-ideas discussion #29](https://github.com/godot-extended-libraries/godot-ideas/discussions/29). Closest in spirit to our v1 split; worth reading before extending.

---

## Install

N/A — build-our-own verdict.
