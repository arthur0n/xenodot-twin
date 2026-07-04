---
type: verdict
title: "Skill eval — enemy hit/death/kill-confirm combat contract (2026-06-17)"
description: "Researcher record. Gap surfaced by bug-triage (Track H): no durable contract for"
timestamp: 2026-07-04T19:59:56.818Z
---

# Skill eval — enemy hit/death/kill-confirm combat contract (2026-06-17)

Researcher record. Gap surfaced by bug-triage (Track H): no durable contract for
enemy health / `died` signal / `on_hit()` shootability / projectile→enemy→weapon
kill-confirm. Built ad-hoc against an ABSENT contract → let duplicate-signal /
stuck-bullet bugs in (since fixed in projectile.gd / weapon.gd and documented on the
firing side in `godot-travelling-projectile-3d`).

## De-facto contract already in the repo (3 seams)

- `entities/enemy/enemy.gd` — `@export health:int` (1=one-shot; tank=3), `@export
score_value:int`, `signal died(enemy:Enemy)`, duck-typed `on_hit()`:
  decrement `_health`; >0 → non-fatal red flash (per-mesh, Make-Unique, restore
  saved overrides); ≤0 → death sfx (reparent-before-free) + `died.emit(self)` +
  white flash-and-`queue_free`. Per-mesh effects walk `find_children(..MeshInstance3D..)`
  (kitbash .glb = many meshes).
- `entities/projectile/projectile.gd` — `body_entered` `CONNECT_ONE_SHOT` →
  `hit.emit(body)` → duck-typed `body.on_hit()` if `has_method` → despawn. (Owned by
  `godot-travelling-projectile-3d`; firing/despawn side already documented there.)
- `entities/weapon/weapon.gd` — `_on_projectile_hit` → `hit_confirmed.emit()`; if
  `target.has_signal("died")` and `not is_connected` → `connect("died",
_on_target_died, CONNECT_ONE_SHOT)` → `kill_confirmed.emit()`. The idempotent
  guard is the fix for the stuck-bullet / "already connected" bug on multi-hit
  enemies.

Hitmarker = every hit (`hit_confirmed`); kill cue = fatal hit (`kill_confirmed`).

## Library search (GodotPrompter cache)

No dedicated enemy-combat / health / damage / kill-confirm skill dir. Closest:
`skills/component-system/SKILL.md` — has a `HealthComponent` (take_damage,
`health_changed`/`died`) + `HurtboxComponent` + `HitboxComponent` pattern, but as
SEPARATE sibling component nodes wired by `@export`, with C# variants. Heavier than
this project's contract (health int + `died` + duck-typed `on_hit()` directly on the
CharacterBody3D) and its component-explosion contradicts CLAUDE.md "modularize ON
DEMAND only". Pattern noted; shape NOT adopted. `ai-navigation/references/
chase-attack.md` covers enemy-attacks-player, not shootability/death.

## Verdict

Recommend **(b) NEW dedicated skill `godot-enemy-combat`**.

- (a) extend `godot-enemy-ai` — rejected: enemy-ai is large + native-nav focused;
  combat is orthogonal to the patrol/chase FSM and would couple a "patrolling enemy"
  skill to weapon kill-confirm it doesn't need. enemy-ai's `perform_attack()` stub is
  enemy-ATTACKS-player — a different concern, stays there.
- (c) reject / no change — rejected: contract is documented NOWHERE durable; absence
  is exactly what let the bugs in; recurring across enemy types (grunt/runner/magnet/
  tank).
- (b) new skill — owns the enemy shootability contract (health+score+died+on_hit+
  flash+death-sfx) and the weapon hit/kill-confirm seam. References
  `godot-travelling-projectile-3d` (projectile.hit side + idempotent connect),
  `godot-composition` (duck-typed `on_hit`/`has_signal`, signals-up), `godot-audio`
  (reparent-before-free death sfx), `godot-enemy-ai` (the Enemy entity it attaches to).

Target path on adopt: `.claude/skills/godot-enemy-combat/SKILL.md`.
CLAUDE.md "## Skills" line: see researcher report.

Status: PENDING human decision gate (do not auto-adopt).
