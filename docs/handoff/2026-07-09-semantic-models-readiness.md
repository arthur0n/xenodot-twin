# Readiness plan — semantic/master-data models (DTDL, ISA-95 → scene mapping)

Roadmap Good-to-Have #9 (see `2026-07-09-roadmap-handoff.md`). PARKED BY DESIGN — the
roadmap's own verdict is "speculative until a user asks". This is a readiness doc, not a
build plan: the trigger, the shape the build would take, and the first bounded steps —
so the session that picks it up starts from thought, not from zero. Deliberately
lighter than the Must-Have plans.

## Do not build until (the trigger, any one of)

1. A real user/prospect shows up with DTDL twin definitions (Azure Digital Twins
   ecosystem) or an ISA-95 equipment hierarchy and asks to see it on the scene.
2. The analysis seam (`2026-07-09-analysis-seam-plan.md`) demonstrably suffers from
   flat context — reports that can't say "all pumps on line 2" because nothing knows
   what a line is.
3. A demo/sale is documented as lost for lack of hierarchy/asset-model support.

Absent a trigger, the only permitted work is keeping this doc current.

## Why it's worth a readiness doc at all

Research (`docs/research/landscape-2026-07.md`) found NO precedent in ANY engine for
mapping DTDL/ISA-95 asset models onto a scene graph — only ad-hoc property
dictionaries. Greenfield + agent-shaped (data transformation, reviewable-artifact
authoring, gate verification — exactly the house pattern), so if demand appears the
framework is the right tool and first mover is available. That combination (park it,
but stay ready) is why this doc exists.

## What exists today that the build would stand on (verified)

- **Sidecar**: `ifc_convert.py` emits a FLAT map `GlobalId → {ifc_class, name, psets,
qtos}` — no spatial containment, no system membership. (IFC itself HAS
  IfcRelContainedInSpatialStructure / IfcSystem — the converter just doesn't walk
  them. That's the cheapest hierarchy source when the time comes.)
- **The two-layer house pattern**: agent-authored JSON (binding maps, hint sidecars) →
  deterministic materializer (TwinHints) → gate. The semantic layer is the SAME shape,
  one level up.
- **Plant demo asset** (plan `2026-07-09-plant-demo-asset-plan.md`): when built, it is
  the natural first hierarchy target (site → area → line → equipment over a tank farm).

## The shape (so nobody re-derives it under deadline)

A third sidecar, same discipline as the other two:

- **`semantic_map.json`** (agent-authored, human-diffable): hierarchy nodes (ISA-95
  levels or DTDL twin graph nodes) with ids, labels, level/type, parent, and
  `globalIds: [...]` membership. DTDL ingestion = a transform from DTDL JSON-LD
  interfaces/relationships INTO this file (agents write the transform output; the file
  stays the contract — workers/UI never parse DTDL directly).
- **Deterministic materializer** (mirror of TwinHints): stamps group membership as
  node/instance metadata (`twin_semantic: [node ids]`) so the viewer can
  select/filter/color BY hierarchy node; extends `check_twin_join`-style gating with
  "every semantic node resolves ≥1 GlobalId; every referenced GlobalId exists" —
  the join invariant, one level up.
- **Consumers**: viewer group-select/isolate (area/line highlighting); binding maps
  gain hierarchical tag derivation (`site.area.line.pump_1.temp`); the analysis bundle
  (`tools/analyze/bundle.js`) gains a `hierarchy` section so reports can aggregate by
  line — that last one is where the money is per trigger #2.
- **IFC-native head start** (no DTDL required): extend `ifc_convert.py` to also emit
  spatial containment + IfcSystem membership into the sidecar (`contained_in`,
  `systems` fields). Cheap, deterministic, real data — likely phase 1 of any triggered
  build, and defensible even standalone if a trigger never comes.

## First bounded steps when triggered (a spike, not a program)

1. Ingest the TRIGGERING artifact (the user's DTDL file / ISA-95 export) — the real
   thing, not a synthetic one; its quirks decide the transform's shape.
2. Hand-author `semantic_map.json` for the plant demo asset; materialize; one viewer
   interaction (isolate a line) + one analysis report aggregated by area.
3. Only then decide the DTDL transform's automation level (agent-run per-import vs
   tool). Gate + skill (`twin-semantics`) come with the decision, not before.

## Never (scope fence, from the roadmap's NONE list)

- Building an ontology engine or ISA-95/DTDL COMPLIANCE layer.
- Live Azure Digital Twins service integration (that's a source adapter behind the
  relay seam if ever — a different plan).
- Blocking any current work on this file's existence.
