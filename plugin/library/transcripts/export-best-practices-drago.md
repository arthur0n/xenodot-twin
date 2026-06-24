# 7 @export uses + @tool (D Rago Games) — transcript digest

**Source** — `godot-export-best-practices.md` (raw now in `transcripts/archive/`). Video: D Rago Games, "7 uses of @export".
**Scope clarification** — Video is about **Inspector `@export` annotations** (typed fields → Inspector widgets), NOT project export/packaging-to-a-build. The other "export" sense (`--export-release`, `export_presets.cfg`) is `godot-export-builds` and is unrelated here.
**Why harvested** — improving conventions/build practices for COMPLEX SYSTEM EXPORTS (typed `@export` on custom Resource subclasses: Cast system `CastData`, designed `HealthComponent`).

**Points**
| # | Point (technique/claim) | Valid for our stack? | Already learned? | Where / gap | Verdict |
|---|---|---|---|---|---|
| 1 | `@export_range(min,max,step)` → Inspector slider; constrains values, removes manual clamp/typo bugs | holds | gap | not in code-rules/cast-system/any skill | **gap (now)** — tunables (speed/jump/gravity, DamageEffect.amount, Health max_hp) belong in ranges |
| 2 | `@export_enum("a","b")` → drop-down; self-documenting, kills magic strings/ints | holds | gap | not covered | gap (Later — no enum-shaped field demands it this iter) |
| 3 | `@export_group("Name")` → collapsible Inspector section for related vars | holds | gap | not covered | **gap (now)** — CastData/HealthComponent already have many flat `@export`s |
| 4 | `@export_category("Name")` → top-level header above groups | holds with caveat | gap | not covered. Caveat: category bleeds into child nodes in Inspector; use sparingly per Godot docs | gap (Later) |
| 5 | `@export_flags("a","b")` → bitmask checkboxes, one int for multi-select | holds | gap | not covered | Later — no bitmask field today (parked AoE/abilities could use) |
| 6 | `@export_file("*.png")` / `@export_dir` → path picker, avoids hardcoded-path typos | holds with caveat | partial | code-rules `.uid` row + Resource refs. Caveat: for our typed Resource refs we use `@export var x: SomeResource` (typed pick), not raw path strings; file/dir hints only for genuine path strings | out of scope mostly |
| 7 | `@tool` → script runs in editor; live Inspector feedback, editor-time validation/preview | holds with caveat | gap | not covered. Caveat: `@tool` runs code at edit time — guard `Engine.is_editor_hint()`, no game-state assumptions, can crash editor; strict-typed-GDScript still applies | **gap (now)** — `@tool _validate_property`/setters could fail-fast bad CastData/Health authoring at edit time |
| — | Resource `@export` serialization, default-sharing gotcha, RefCounted-vs-Resource, `.uid` gen | (context, not in video) | covered | code-rules (`.uid` row, shared-sub-resource Error→Fix), confirmed godot-docs facts, cast-system | covered — no action |
| — | naming noun_verb; "stop at flat @export" framing | holds | n/a | style aside | trivia, skip |

**Recommended next** — complex-system export = Inspector authoring ergonomics + edit-time safety. Two acts:

- Export-hint + `@tool`-validation convention for custom Resources/components (range/group on tunables; optional `@tool _validate_property` fail-fast). No `godot-*` skill owns Inspector `@export_*` hints → **skill-researcher** (find/adopt an "export-hints / Inspector authoring" skill, or fold into a code-rules update). Pts 1,3,7.
- If skill-researcher finds nothing adoptable → small **CLAUDE.md / godot-code-rules convention** add: "complex-system Resources use `@export_range` on numeric tunables + `@export_group` to structure; `@tool` only with `Engine.is_editor_hint()` guard." (Convention edit is orchestrator/human, not me.)

**Later** — `@export_enum` (pt 2), `@export_category` (pt 4, category-bleed caveat), `@export_flags` (pt 5, fits parked AoE/abilities), `@export_file/dir` (pt 6, only for real path strings — typed Resource picks already cover our case).
