# Readiness plan — "simulation" as scenario orchestration over an existing solver

Roadmap Good-to-Have #12, the last roadmap item (see `2026-07-09-roadmap-handoff.md`).
PARKED HARDEST of all: the roadmap admits the word into the long-term vision only as
scenario/what-if orchestration on top of an EXISTING solver, only after visualization
has real users. Until then the honesty rule stands absolute: the product says
_visualization_, never _simulation_. Readiness altitude.

## Do not build until (BOTH required, unlike the other readiness docs)

1. Visualization has real users (not demos — people using twins built with this).
2. A concrete solver exists on the other side: a user's own FMU/model, or a
   solver-owning partner. The framework NEVER supplies the solver (roadmap NONE-list:
   physics/process engines are domain solvers, not orchestration).

## The insight that makes this cheap when it comes

**The recording contract is the universal adapter.** A solver run is just another
producer of the tag stream the product already speaks end to end:

- Wire: `{tag, value, seq, sent_ms}` (DataBus contract).
- File: twin-recording NDJSON (`plugin-twin/tools/sim/recording.js` — header + frames,
  byte-reproducible, hash-gated playback determinism ALREADY exists as a gate).

So "simulation support" requires ZERO viewer changes: solver outputs → mapped to tags
→ an NDJSON recording → the existing playback scrubs it; the existing determinism gate
(same inputs ⇒ same sha256) extends naturally to "same FMU + same scenario ⇒ same
recording". What-if comparison is two recordings side by side — playback and the
analysis seam (`2026-07-09-analysis-seam-plan.md`: bundle → report) consume solver
output for free the day it exists. Everything the framework would add is upstream of
an interface that is already built and gated.

## Pre-derived shape (the agent-shaped 20%)

The industrial-standard route the roadmap names: **FMI/FMU co-simulation.**

- **`scenario.json`** (agent-authored, human-diffable — the two-layer pattern's third
  outing after binding maps and hint sidecars): FMU reference + parameter overrides +
  input schedules (step/ramp events over time) + run length/step + output→tag mapping
  (FMU variable → twin tag, ranges for the colour ramps — the same row shape binding
  maps carry).
- **Deterministic runner** (`tools/simulate/run_fmu.py`-shaped, FMPy or equivalent in
  a pinned venv — the ifcopenshell playbook again): scenario in → twin-recording
  NDJSON out, header carrying scenario hash + FMU hash for provenance. Determinism
  caveat recorded honestly at build time: FMU co-simulation is deterministic per
  solver/tolerance settings, and the gate pins them; cross-machine bit-identity gets
  VERIFIED, not assumed.
- **Agent leverage** (why this belongs to the framework at all): authoring scenarios
  from a plain-language what-if ("valve 3 stuck at 40% from t=120s"), sweeping
  parameter grids into recording sets, and drafting the comparison narrative via the
  analysis seam. The solver stays a black box.
- **Gates**: scenario-schema check; run reproducibility (hash); tag-mapping join
  (every mapped tag exists in the binding map / every FMU output referenced exists —
  the join invariant's fourth appearance).

## First bounded steps at trigger

1. Run THE USER'S FMU under FMPy by hand; dump variables; write one scenario.json for
   one what-if they actually asked; generate the recording; scrub it in their viewer.
   (One afternoon if the FMU behaves; the FMU never behaves — which is the point of
   encoding it in a skill afterward.)
2. Hash-gate the rerun. Only then: runner tool + `twin-simulate` skill + schema.
3. Product wording changes LAST: "simulation" enters copy only when the gate is green
   on a real solver — the word is unlocked by the gate, not the plan.

## Never (scope fence)

- Writing solvers, physics engines, or numerical methods of any kind.
- Closed-loop control of real equipment (advisory/what-if only — same trust boundary
  the MQTT plan draws for the write path).
- Claiming "simulation" in any material before the gate exists (standing ban).
- Letting this doc's existence pull work forward — it closes the roadmap's planning
  pass; it does not open a workstream.
