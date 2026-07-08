# Token-audit ledger

Running record for `/token-audit`. The hive's session logs are mined a couple at a
time for turns we could make deterministic (a script/tool/hook instead of an agent/LLM call).

**How to use:** read this file first. Skip any session already in `Covered sessions`. After a
run, add the analyzed tags below and append ONE super-brief entry under `Audits`. Keep it
scannable — this is the memory the next run learns from, not a report.

Entry template:

```
### <YYYY-MM-DD> — sessions: <tag>, <tag>
- Offenders: <top 1–3: wasteful pattern + rough token/$ cost>
- Opportunity: <deterministic replacement for an agent/LLM turn> → task <id>
- Process note: <improvement to this command/loop, or "none">
```

## Covered sessions

<!-- one session-tag per line (the part between `session-` and `.ndjson`); newest at the bottom -->

2026-07-03T10-35-55-045Z
2026-07-03T18-42-56-256Z
2026-07-04T22-05-02-866Z
2026-07-05T14-52-32-766Z
2026-07-06T07-39-33-283Z
2026-07-07T07-15-06-288Z
2026-07-08T06-40-55-221Z

## Audits (newest first)

### 2026-07-08 — sessions: 07-03T10-35, 07-03T18-42, 07-04T22-05, 07-05T14-52, 07-06T07-39, 07-07T07-15, 07-08T06-40

- Offenders: (1) `mcp__godot-docs__godot_docs_get_class` re-fetches **immutable** Godot API docs — same classes pulled repeatedly across the 4 big sessions (Plane ×4, CPUParticles3D ×4, NavigationAgent3D ×3, Viewport/NavMesh/Camera3D ×2), each dump ~20.7k chars (~5k tok). ~11 redundant full-class dumps ≈ 55k+ tok of content that never changes within/across a session. (2) Costliest turns are pure `cache_read` on the standing orchestrator context (top turn $161, 384k cache-read tok) — inherent to long orchestrator runs, NOT convertible.
- Opportunity: cache/memoize `godot_docs_get_class` by class name (docs are pinned to the engine version — deterministic) so a class is fetched at most once; optionally return a member-filtered view instead of the full class dump. → **TASK (owner:user)** [id `godot-docs-memoize`, apply via `/token-audit-fix godot-docs-memoize`]: "Memoize godot-docs MCP class lookups (immutable → fetch each class once); optional member-filtered view. Replaces ~11+ redundant 20k-char class dumps/session ≈ 55k+ tok." — _mcp**ui**tasks board not reachable from terminal session; task recorded here for the human to file._
- Discarded (checked, not offenders): `tools/validate.sh` runs 63/196/96/21× but output is already compact (~72 chars, "validate: OK"/PASS lines) — no win. Heavy same-file re-Reads (outpost_alpha.tscn ×56, player.tscn ×50) are legitimate — files mutate between edits, so a re-read reflects current state; not deterministically replaceable. Agent dispatches (26–53/session) are all judgment-heavy game work (build FSM, playgrade, design) — correct agent use.
- Cross-ref: metric direction "tokens per **accepted change**, not total tokens" filed as framework-audit `D9-tokens-per-accepted-change` (numerator = usage.js; denominator = promotions.json/tasks.json). This audit's per-turn totals feed that ratio once the denominator is wired.
- Process note: `jq` tool-result extraction for Bash commands is corrupted by multi-line heredocs (uniq counts physical lines, not commands) — the reliable size signal is **aggregating tool_result char-length by tool name** (map tool_use_id→name, sum lengths). That one query surfaced the godot-docs offender the freq counts hid; recommend adding it as the primary step-3 sweep. Also: `mcp__ui__tasks` is unavailable in a plain terminal session — step 6 should note the ledger is the fallback sink.
