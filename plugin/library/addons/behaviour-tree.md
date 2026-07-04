---
type: addon
title: "Behaviour Tree Addon — Buy vs Build"
description: "REJECTED — build trait-mixing via godot-enemy-archetype (behaviour-node"
timestamp: 2026-07-04T19:34:45+01:00
---

# Behaviour Tree Addon — Buy vs Build

**Request** — evaluate whether converting a flat-flag `EnemyArchetype` Resource into a
behaviour-node PackedScene mix (trait-mixing) warrants adopting a BT addon.

**Verdict** — REJECTED — build trait-mixing via `godot-enemy-archetype` (behaviour-node
PackedScene composition). BT addon NOT adopted. Convention "NO behaviour trees" stays.

---

## Research inputs (three convergent, 2026-07)

1. **Godot docs (authoritative):** Godot 4.6 has NO native behaviour tree. BT = addon-only.
   Native intended AI structure = node composition + hand-rolled FSM + NavigationAgent3D /
   Area3D / RayCast3D. `AnimationNodeStateMachine` is animation-only.

2. **Skill researcher:** `godot-enemy-archetype` skill IS the trait-mixing pattern.
   `EnemyArchetype.tres` = stats + ordered `Array[PackedScene]` behaviour nodes. Worked
   examples (`tank_shooter`, `tank_magnet`) already demonstrated. "Sentry that heals" =
   new `HealBehaviour` node + new `.tres`. BT addons conflict with composition-over-autoloads
   - the NO-BT convention; no demonstrated need.

3. **Hermes (Iovino et al. 2024, arxiv 2405.16137 + game-AI sources):** Trait-mixing is
   CAPABILITY COMPOSITION, not CONTROL-FLOW decomposition. Composable behaviour-node
   components solve it without touching FSM control flow. BTs earn their keep
   (O(1) subtree swaps, reactive preemption) only when 3+ traits mutually interrupt each
   other mid-action. A small flat-flag archetype set is well below that threshold.

---

## Candidates (on record; not adopted)

| Addon   | Source                               | License | Godot      | Language        | Last activity   | Notes                                                                                                                                                   |
| ------- | ------------------------------------ | ------- | ---------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LimboAI | https://github.com/limbonaut/limboai | MIT     | 4.6-compat | C++ GDExtension | Active (v1.8)   | Includes HSM + `BTState` — BT embeddable INSIDE FSM state; best escape hatch. Cost: binary dep + export-template friction + GDExtension ABI-break risk. |
| Beehave | https://github.com/bitbrain/beehave  | MIT     | 4.6-compat | GDScript (pure) | Active (v2.9.2) | Node-based BT, no C++ dep. NO HSM — would REPLACE the FSM entirely. Weaker blackboard than LimboAI. Higher rewrite cost.                                |

---

## Why rejected

Trait-mixing ("tank that also shoots", "sentry that heals") is CAPABILITY COMPOSITION: add a
`HealBehaviour` PackedScene child, wire its signals, done. This does NOT require decomposing
control flow — the existing FSM (Patrol / Alert / Aggro / Search) stays untouched. BTs solve
a different problem: deeply nested priority trees where traits preempt each other mid-action.

A small archetype set with flat flags and no mutual mid-action interruption is well below
the threshold where a BT pays off. Adding a BT addon at that stage would:

- Introduce a C++ binary dependency (LimboAI) or replace the FSM wholesale (Beehave).
- Conflict with composition-over-autoloads convention.
- Add `BTState` / blackboard concepts to onboard at zero demonstrated gameplay gain.

The `godot-enemy-archetype` skill already captures the right pattern. Use it.

---

## Convention (unchanged)

`CLAUDE.md` convention "enemy AI = native nav + node-FSM, NO behaviour trees" STAYS.

If the hybrid is ever adopted (see escape hatch below), the convention becomes:
"FSM with optional BT-in-state (LimboAI `BTState` only, inside Aggro state)."

---

## Escape hatch + revisit trigger

**Escape hatch (if needed):** LimboAI `BTState` hybrid — keep the outer FSM, embed a BT
ONLY inside the `AggroState`. Incremental, not a rewrite. LimboAI is MIT, Godot-4.6-compat,
includes HSM; the `BTState` node bridges FSM ↔ BT cleanly.

**Revisit trigger:** an enemy whose aggro logic is a deep priority tree of **3+ traits that
mutually interrupt each other mid-action**, OR a near-fully-connected FSM transition graph
(8+ states). At that point re-evaluate LimboAI's `BTState` hybrid.

Do NOT revisit for simple trait accumulation (more `.tres` files, more behaviour-node
children). That is exactly what `godot-enemy-archetype` is for.

---

## Open questions to watch (from Hermes)

- **Max simultaneous traits per enemy** — if a single enemy gains >5 active behaviour nodes,
  check whether trait ordering (the `Array[PackedScene]` index) is sufficient or if
  priority/interrupt logic becomes necessary.
- **Trait-to-trait communication** — if two behaviour nodes need shared state (e.g.
  `HealBehaviour` checks whether `ShootBehaviour` is mid-burst), a lightweight blackboard
  Resource on the enemy may be needed before a full BT is warranted.

---

## Later

- **LimboAI** — https://github.com/limbonaut/limboai — MIT, C++ GDExtension, v1.8, Godot
  4.6-compat; best option IF revisit trigger fires. `BTState` = embed BT in Aggro state,
  keep FSM outer shell. Re-evaluate then.
- **Beehave** — https://github.com/bitbrain/beehave — MIT, pure GDScript, v2.9.2; lower
  dep risk but requires FSM replacement. Only if a pure-GDScript constraint is hard.
- **`enemy-ai.md`** — already lists LimboAI in "Later"; this doc is the BT-specific verdict.
  No overlap in scope.
