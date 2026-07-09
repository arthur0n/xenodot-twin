# A game framework grew a digital-twin viewer in a day

_Draft companion piece — your voice, you publish. dev.to / blog length._

I build games with a framework called Xenodot Forge. The idea behind it is boring on purpose: instead of describing a game to an AI and pasting back whatever it returns, you move the decisions to _before_ inference — a structured interview cuts scope, a locked design doc gets written, and only then does a dev agent implement it. Every step ends at an engine-level check that catches what Godot silently drops. The orchestrator (I call it the Hive) routes work to sub-agents and never writes code itself.

This week I wanted to know whether that machinery was actually general, or whether it only knew how to make games. So I pointed it at a digital-twin viewer: load a building's IFC/BIM model into an open-source game engine, bind live sensor readings to the real 3D elements, and replay recorded history on a timeline. It came together in one day of orchestrated phases. Here's how it went, honestly, including the parts that didn't work.

## Phase 0 — research before code

Before writing anything, the Hive ran a deep-research pass: 104 agents across 22 sources, adversarially verified — 23 claims confirmed, 2 refuted. The refutations mattered more than the confirmations, because they killed two "everybody knows" assumptions I'd have built on: that hobbyist digital twins default to Unity, and that there's no Cesium runtime for Godot. Both are wrong. What the research _did_ confirm is the real opening: the open-source-engine angle. OpenTwins, for instance, still leans on proprietary Unity for its 3D layer; and Cesium-for-Unreal is the precedent that a free engine plugin can be a serious vendor's front door. That's the niche this sits in — small, but real.

## Phase 1 — spikes to retire the scary risks

Three unknowns could have sunk the whole thing, so each got a throwaway spike.

**Getting BIM data in.** IFC is the industry exchange format; Godot has never heard of it. The pipeline that worked: convert IFC to GLB with a serializer setting that writes each element's GlobalId as the mesh node name, plus a sidecar JSON of properties keyed by the same GlobalId. That shared key is the whole design — GLB node names, the property sidecar, and live sensor tags all join on the IFC GlobalId. The Duplex sample (2.3 MB) converted in ~1.1s, and every element joined to its record. One trap cost real time: ifcopenshell has no wheel for current Python, so the toolchain is pinned to Python 3.12.

**Getting live data in.** A WebSocket stream at 10 Hz ran clean — zero drops, reconnect survival. But the peer API had four sharp edges that each independently break the stream (poll every frame; drain _all_ queued packets, not one; the connect call is async so you gate on ready-state; fresh peer per reconnect). Worth a spike to find before it's buried in a feature.

**Getting scale.** A million instances via chunked MultiMesh. The verdict was nuanced, not a win banner: chunking helps a walkthrough camera (+39% fps) and _hurts_ an overview camera (−12%) — so it has to be a toggle, and the primary camera decides. Occlusion culling on flat scenes was net-negative (it's CPU raster work). Both findings survived into the shipped optimizer as switches rather than defaults.

## Phase 2 — the optimizer, and the regression I'm glad I measured

The optimizer collapses repeated geometry into instanced MultiMeshes. On a synthetic city — a real duplex model duplicated into a 20×20 grid, 114,400 meshes — the aerial view went from 27.3 to 119.4 fps. That's +337% on paper, but the honest number is "at least 4.4×," because the optimized scene is _still_ hitting the display's 120 Hz cap; the true ceiling is higher. Render-thread submit time dropped 98% (28.98 ms to 0.56 ms), draw calls fell 95%. The optimizer ran in 1.3s on that scene.

The part I want to keep visible: the _default_ chunk count regressed. At 8×8 chunks on ~100-instance groups, the tool made 14,336 tiny multimeshes of ~2 instances each — pure per-object overhead — and aerial fps _dropped_ 58% (120 → 50). Two chunks won everything. That turned a hand-wavy "auto chunk sizing, TODO" note into a measured requirement, and the fix ships as `--chunks=auto`.

One more honest read: Godot's Forward+ renderer already auto-merges identical surfaces, so the naive "N meshes = N draw calls" pitch overstates the before-cost — what the optimizer actually removes at scale is culling and submit overhead, which is exactly where the 27 fps went. On a weaker GPU I'd re-measure before repeating any of these numbers.

## Phase 3 — live values driving the scene

With import and optimization solid, binding was almost anticlimactic — which is the point of the shared join key. An agent emits a JSON binding map (GlobalId → visual response); the runtime resolves each to a node or a specific MultiMesh instance and drives an albedo ramp (green→red) or a floating label with the value. Live values arrive at roughly 5 ms with zero dropped frames.

Two design choices carried the weight. First, a **two-layer split**: a data layer (agent-authored JSON — regenerable, diffable) and a runtime layer (typed at load, never crashes on a bad row). The agent's output is _data_, not code, so it's reviewable and reproducible. Second, everything flows through one seam — `DataBus.inject` — so bindings, labels, and the overlay never know or care where a frame came from. That seam is what made the next phase cheap.

## Phase 4 — time-series playback, gated on determinism

Because live and recorded frames enter through the same seam, playback was mostly a player that reads an NDJSON recording and injects frames on an accumulated `delta × speed` clock — never wall-clock, so it's frame-rate independent. You load a recording, scrub, play, pause, change speed. The overlay stays honest about what it's showing: green for LIVE, amber for PLAYBACK, red for OFFLINE — a replay never pretends to be live, and the transport stats keep that true (injected frames count separately from received ones).

The gate is the interesting bit. Playback is proven deterministic by construction: synthesize a fixture (byte-reproducible per seed, it prints its own sha256), then run the same recording through the same seeks twice and assert the two output hashes are identical. Same input, identical output, every run — that equality _is_ the test. It runs headless in CI.

## What transferred, what was greenfield

The reused-as-is list is longer than the new list, which is the whole story: scene optimization, headless verification harnesses, deterministic seeded fixtures, the agent-emits-data discipline, and the plugin-vs-project separation (the twin ships as a plugin loaded into a viewer project; the project stays pure content). Genuinely new: the IFC importer, the sensor relay, and the playback timeline. For a "totally different domain," the surface built from scratch was small.

## The honest scars

- **Chunks=8 regressed.** The old default was net-negative at real instance densities; only measuring caught it.
- **Occlusion culling costs CPU** and lost to the no-occlusion control on flat scenes — shipped as a toggle, off by default.
- **The headless renderer lies.** Under Godot's dummy renderer, instance-color writes never surface, so per-instance color equality simply isn't assertable headlessly — that check is honestly marked windowed-only rather than faked green.
- **Benchmark clocks drift cold vs warm**, and on macOS window occlusion freezes rendering and turns process-loop fps into a phantom number. The bench measures frames-drawn deltas and render-thread time instead, and warms up before sampling.
- **Duplicated GlobalIds** across copied buildings mean per-instance binding would paint every copy identically — real multi-building sites need unique ids upstream. The join gate proves "every rendered instance resolves to a record," not unique-id coverage; I wrote that limit down rather than letting 100% imply more than it does.

## What a v2 would need

This is a proof of concept and a portfolio piece, not a product. If it were going to a real site, the honest gap list is: an **MQTT bridge** (the relay already has the seam where one source fans out to many viewers — MQTT plugs in there), **USD** import alongside IFC, and **automatic level-of-detail generation** so large sites degrade gracefully instead of relying on a single optimization pass. None of those are research risks anymore; they're just work.

The takeaway I actually care about: agent orchestration plus deterministic gates made a day's worth of unfamiliar work _reviewable_. Every phase left a number, a gate, or a written-down limitation. That's the part that transfers to any domain, game or not.
