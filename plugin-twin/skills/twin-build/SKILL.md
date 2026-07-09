---
name: twin-build
agents: [twin-architect]
description: >-
  The one-command twin pipeline — take an IFC/BIM model and end at a verified, data-bound viewer
  in a single run (tools/twin_build.sh). It chains the four existing tools (import → optimize →
  verify → summary) with the same gate discipline: loud stage labels, exit nonzero on the first
  failure, a SKIP is never a pass. Use it to build or rebuild a twin from an IFC, to get the exact
  boot command for the optimized scene, or as the acid test that the whole pipeline still works end
  to end. This skill is the OPERATOR MANUAL — when to run it and how to read each stage's failure;
  it does NOT re-teach the stages (import → twin-import, optimize → twin-optimize, verify →
  twin-verify, authoring the binding map → twin-bind-data). NOT for wiring a live MQTT source
  (that is the adapter work) and NOT a replacement for the per-stage skills when a stage fails.
---

# Twin build (IFC → verified, data-bound viewer, one command)

`tools/twin_build.sh <model.ifc>` is orchestration glue, nothing more: it runs the four tools you
would otherwise run by hand, in order, and stops at the first red gate.

```
model.ifc ─▶ import (ifc_convert.py) ─▶ optimize (optimize_scene.gd) ─▶ verify (verify_twin.sh) ─▶ summary
             .glb + _props.json           _opt.tscn + report            join + smoke + floor        boot command
```

It adds **no** new numbers — every result is the underlying gate's. If a stage fails, the fix lives
in that stage's own skill; this skill only tells you which one and how to read the failure.

## When to run it

- Bringing a fresh IFC into the viewer, or rebuilding after the model changed.
- As the end-to-end acid test after touching any pipeline tool (import, optimizer, gate, viewer).
- To get the exact `--model=` boot command for the optimized scene, painted live.

## When NOT to reach for it

- A single stage is failing and you already have artifacts — run that stage's tool directly
  (`tools/verify_twin.sh`, `tools/optimize_scene.gd`) for a tighter loop; twin_build just re-runs
  the whole chain.
- You need to author or fix the binding map — that is `twin-bind-data`, not a build flag.

## The command

```
tools/twin_build.sh <model.ifc> [--map binding_map.json] [--out-dir models/]
                    [--chunks auto|N] [--min-instances N] [--hints h.json]
                    [--occluders] [--vis-ranges] [--wire]
```

Only three flags change the OUTCOME; the rest are pass-through to the optimizer.

- **`--map <file>`** — the binding map for the data-binding smoke. Without it the smoke SKIPs
  loudly (see below); with it the join + smoke prove the twin is actually painted.
- **`--wire`** — the ONLY thing that touches user data: point `viewer.cfg [viewer] model=` at the
  optimized scene so a bare `$GODOT --path .` boots it. The previous file is kept as
  `viewer.cfg.bak`; comments and every other key survive (it rewrites only the `model=` line).
  Default (no `--wire`) never edits `viewer.cfg` — the summary just prints the boot command.
- **`--occluders` / `--vis-ranges`** — pass-through to the optimizer and **never default-on**:
  their recipes are unmeasured, so turning them on silently would break the "every number is
  gate-backed" promise. Only pass them when `twin-optimize` says the model wants them.

## Reading a stage failure

The script exits nonzero at the FIRST red gate. Map the label to the skill that owns the fix:

| Stage label          | What it means it hit                                   | Where the fix lives       |
| -------------------- | ------------------------------------------------------ | ------------------------- |
| `[1/5] preflight`    | no `project.godot`, no engine, or the `.venv-ifc` trap | this file + `twin-import` |
| `[2/5] import`       | `ifc_convert.py` failed (bad IFC, dead-URL HTML, …)    | `twin-import`             |
| `[3/5] optimize`     | `optimize_scene.gd` failed (see the `OPTIMIZE:` lines) | `twin-optimize`           |
| `[4/5] verify` join  | GlobalId join under threshold — GLB ≠ sidecar          | `twin-import`             |
| `[4/5] verify` smoke | binding smoke FAILED (a real red, not a SKIP)          | `twin-bind-data`          |

A **SKIP** inside verify is not a failure and does not stop the build (mirrors `verify_twin.sh`) —
but it is not a pass either. The summary calls out any SKIP and names the next step.

## The venv trap (preflight fails loud, never auto-fixes)

`ifcopenshell` ships **no wheel for Python 3.14** (the macOS system python). Preflight checks
`.venv-ifc/bin/python -c "import ifcopenshell"` and, if it's missing or broken, FAILs with the two
commands to fix it — it will **never** create the venv for you (`uv` may not be installed, and a
script that silently builds environments hides exactly the failure you need to see):

```bash
uv venv --python 3.12 .venv-ifc && source .venv-ifc/bin/activate
uv pip install ifcopenshell==0.8.5
```

That is the whole of `twin-import`'s Step 0 — see that skill for the version rationale and for
keeping the venv out of `res://`. Once it imports, re-run the build; nothing was half-built (the
check runs before any artifact is written).

## No binding map → the explicit handoff

If no map is discoverable (no `--map`, nothing in `viewer.cfg [twin] binding_map=`, no
`binding_map.json`), the build still completes import + optimize + join, the smoke SKIPs loudly,
and the summary prints:

```
binding smoke SKIPPED — no binding map wired into this build (a SKIP is not a pass).
NEXT: author a binding map with the twin-bind-data skill, then rerun with:
  tools/twin_build.sh <model.ifc> --map <binding_map.json>
```

That is the intended path for a new model: **build once to get the sidecar, author the map from it
with `twin-bind-data`, then rerun with `--map`** to turn the smoke green. A SKIPed smoke is an
un-painted twin, not a finished one.

## Error → Fix

| Symptom                                            | Fix                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `FAIL preflight — .venv-ifc … missing or broken`   | Create the pinned 3.12 venv (the two `uv` lines above); `twin-import` Step 0              |
| `FAIL preflight — no project.godot`                | Run from the Godot project root (where `project.godot` lives)                             |
| `FAIL — no such IFC model` / `no such binding map` | Path typo; the map path is only checked when you pass `--map`                             |
| `FAIL import` after "is not an IFC/STEP file"      | Dead-URL HTML, not a model — see `twin-import`'s dead-URL gotcha                          |
| `FAIL verify` on join-coverage                     | GLB and sidecar are from different converts, or `use-element-guids` was off — reconvert   |
| `FAIL verify` on binding-smoke (a real red)        | The map resolves but a binding doesn't move — debug with `twin-bind-data` / `twin-verify` |
| Smoke SKIPs and you expected it to run             | No map found — pass `--map`, or set `viewer.cfg [twin] binding_map=`                      |
| Booted viewer shows the OLD model after a build    | You didn't `--wire` (default leaves `viewer.cfg` alone) — pass `--wire` or use `--model=` |

## RTK note

Prefix shell commands with `rtk` as usual. The Godot binary (`$GODOT`) and the venv python run
without an rtk filter (passthrough). Never reference rtk inside the `.sh`/`.gd`/`.py` tools.
