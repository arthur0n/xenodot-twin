# Implementation plan — second demo asset: a plant/factory-flavored model

Roadmap Nice-to-Have #8 (see `2026-07-09-roadmap-handoff.md`). Plan only. The city block
covers SCALE; nothing covers "looks like my plant". The sim's built-in demo tags
(`stream.js DEMO_TAGS`: pump temp/flow, tank level, valve position, motor rpm) were
already written in plant vocabulary — the data story has been waiting for the geometry.

## The bar an asset must clear (set by the Duplex precedent)

`plugin-twin/examples/NOTICE.md` is the template: provenance stated, redistribution
defensible, sha256 pinned, a WORKING mirror URL documented (the canonical buildingSMART
sample URLs are dead — the documented trap; never trust a sample URL unverified), IFC
header check (`ISO-10303-21;`), size stated. Plus pipeline qualification:

1. Converts via `tools/ifc_convert.py` with GlobalId join ≥ the gate's 95% floor.
2. Contains industrial entity classes — census via a one-liner over the STEP file
   (`IFCPUMP|IFCTANK|IFCVALVE|IFCFLOWSEGMENT|IFCFLOWMOVINGDEVICE|IFCDISTRIBUTIONELEMENT…`)
   — enough distinct, bindable equipment for a ~6–10 tag binding map.
3. Vendorable size (Duplex is 2.3 MB; soft ceiling ~15 MB for an in-repo example —
   bigger goes download-with-pinned-sha256 instead of vendored).

## Two tracks — real preferred, synthetic guaranteed

**Track A — real public industrial-flavored IFC (timeboxed sourcing spike).**
Candidates to verify AT BUILD TIME (availability/licensing verified then, not assumed
now — the dead-URL trap applies to this very list):

- The **Clinic** model's MEP/handover variants — same buildingSMART "Common BIM Files"
  family as the Duplex (same license story), and the MEP discipline model carries
  pumps, AHUs, ducts, pipes — the most plant-looking thing in that family.
- The xBIM demo/test repos (the working Duplex mirror lives there — they host other
  models; check siblings first since one mirror already proved stable).
- IfcOpenShell's test-file collections; the Auckland Open IFC Model Repository.
- Any model failing license clarity is OUT regardless of looks — the NOTICE honesty
  bar is non-negotiable.

**Track B — synthetic plant IFC, generated with ifcopenshell (the fallback that also
scales).** A seat-side `gen_plant_ifc.py` (runs in the existing `.venv-ifc`; ifcopenshell
can AUTHOR IFC, not just read it): parametric tank farm / pump skid — N tanks
(IfcTank), pump rows (IfcPump), connecting pipe runs (IfcFlowSegment), valves
(IfcValve), each with real GlobalIds and property sets (capacity, line id, service).
Because it emits genuine IFC, the ENTIRE pipeline is exercised unmodified — import,
sidecar join, optimize (pipe segments are repeated geometry → instancing-friendly, a
good optimizer showcase), bind, verify. Self-owned licensing, honest "synthetic
demonstration model" label everywhere it appears, and a scale knob the marketing
shots can use. Track B proceeds even if Track A succeeds IF cheap enough at review —
but only Track A satisfies "public model" fully; a synthetic-only outcome is recorded
as such in the roadmap tick.

Decision rule after the spike: real model qualifies → it's the headline asset and
Track B is dropped or parked; no real model qualifies → Track B ships, and the docs
say "synthetic" plainly (honesty rule — never imply provenance).

## The kit (either track)

Mirror the Duplex kit exactly — same file trio, same zero-manual-steps contract:

- The model (vendored if ≤ ~15 MB, else `--download` instructions with pinned sha256
  in the README + NOTICE; the twin-import skill gains the mirror URL either way).
- `binding_map.plant.example.json` — authored via `twin-bind-data` against real
  GlobalIds from the converted model: tank levels, pump temp/flow, valve positions,
  motor rpm — the DEMO_TAGS vocabulary, now bound to plant geometry. Ranges double as
  sim ranges (existing contract: the sim derives its tag table from the map).
- `viewer.cfg.plant.example` — points at the plant model + map.
- NOTICE.md entry (Track A) or the generator + its doc header (Track B).
- Both kits coexist: the house stays the tutorial's teaching asset (small, fast);
  the plant is the pitch asset. Examples README grows a "which demo when" line.

## Verification + numbers (the asset must EARN its place)

- Full `verify_twin.sh` green on the plant project: join ≥95%, binding smoke painting
  plant equipment, playback determinism on a recorded plant session.
- Optimizer before/after on the plant model (pipes/tanks = repeated geometry) —
  findings addendum in `plugin-twin/library/findings/` with the standard machine
  caveats; if the plant model shows a different optimization profile than the duplex
  (likely: more instancing wins), that's new content for the skill.
- One recorded demo session (`recordings/plant-shift.ndjson`-style) so playback +
  the future analysis seam (`2026-07-09-analysis-seam-plan.md`) have industrial data
  to chew on — cross-plan payoff, cheap to record while validating.

## Phasing

1. **Sourcing spike (timeboxed — a day, not a quest):** verify Track A candidates
   (header, license, convert, entity census, join %); write the verdict down
   (including dead URLs found — future sessions shouldn't re-walk them; extend the
   twin-import skill's dead-URL note). Decide track.
2. **Kit build:** asset in place (vendor/download/generate), binding map authored
   against real GlobalIds, viewer.cfg variant, NOTICE/generator docs, gate green in a
   fresh scaffold from the seat (`twindemo/`, clean-stranger: kit README only).
3. **Demo integration:** optimizer findings addendum, one recording committed,
   examples README "which demo when", marketing shot-list note (human-paced item —
   flag, don't publish), SEAMS protect-list += new example files (+ generator if
   Track B), roadmap tick naming the track taken.

## Acceptance criteria

1. Clean-stranger path: fresh scaffold + plant kit README → painted plant twin, no
   manual fixes; `verify_twin.sh` green.
2. NOTICE bar met: provenance/license/sha256/mirror all stated (Track A) OR generator
   - "synthetic" labeling everywhere (Track B). No unverifiable claims.
3. Binding map binds ≥6 tags across ≥3 equipment classes (pump/tank/valve at minimum)
   to real GlobalIds.
4. Findings addendum with plant-model optimizer numbers + caveats.
5. Sourcing spike verdicts written down, dead URLs recorded in the skill.
6. SEAMS/examples README/roadmap updated in the same change set.

## Out of scope (named)

- City-scale plant (the city block already covers scale; this covers FLAVOR).
- Textures/materials beautification passes — geometry + data binding is the pitch,
  not renders (marketing shots use what the viewer shows).
- Point-cloud or USD plant sources (roadmap items 10/11, parked).
- Publishing any marketing material (human-paced, bans apply).
- DTDL/ISA-95 semantic mapping of the plant hierarchy (roadmap item 9, parked until
  a user asks).
