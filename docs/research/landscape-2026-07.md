# Digital-twin landscape research — July 2026

The research that preceded this fork, preserved because its conclusions still drive the
roadmap and its **refuted claims are permanent bans** for any marketing material.

Method: a 104-agent orchestrated research run (2026-07-08) — 5 parallel search angles,
22 sources fetched, 109 claims extracted, 25 adversarially verified by 3-vote panels:
**23 confirmed, 2 refuted, 0 left unverified.** Time-sensitive facts were verified
against sources current as of July 2026 and dated below; re-verify before reusing in
2027+ material. Build-side findings (spike verdicts, optimizer benchmarks) live
separately in `plugin-twin/library/findings/`.

## Confirmed landscape (high confidence unless noted)

**Godot is already a proven industrial digital-twin frontend — with asterisks.**
[Open-Industry-Project](https://github.com/Open-Industry-Project/Open-Industry-Project)
(MIT, 776★, active through 2026) is a warehouse/manufacturing simulator built on Godot;
its [OIPComms](https://github.com/Open-Industry-Project/oip-comms) GDExtension speaks
OPC UA (open62541), Modbus TCP, EtherNet/IP, Siemens S7, Beckhoff ADS, UR RTDE and MQTT
(Eclipse Paho) through a thread-safe polled tag buffer. Asterisks: it ships a custom
Godot fork (not a plugin on stock Godot) and OIPComms built Windows-only at research
time — it validates feasibility, it is not a drop-in dependency.

**IFC import existed but not for us.**
[GDIFC](https://godotengine.org/asset-library/asset/4212) (GDExtension wrapping
IfcOpenShell + web-ifc) loads IFC 2x3/4.0/4.3 with property sets preserved — but at
research time it was 1.1.1-alpha, single-author, targeted Godot 4.2 and shipped **no
macOS binaries** (verified empirically: unusable here). That is why this framework's
`twin-import` uses an offline ifcopenshell→GLB pipeline instead.

**Godot's native optimization toolkit is real but manual** (verified against official
4.4 docs + empirically in Phase 2): built-in occlusion culling (Embree CPU raster —
strongest indoors, occluders manually placed/baked, measurably net-negative on flat
untextured scenes), automatic mesh LOD on import, visibility ranges (manual HLOD), and
MultiMesh instancing to millions — **without per-instance culling**, which is why this
framework's optimizer does region chunking. "Ships natively" must never be read as
"works automatically at Unreal-HLOD convenience".

**The import-format gap is the opportunity.** Godot 4.4's official format list is
exactly five entries — glTF (recommended), .blend, DAE, OBJ, FBX. **USD, IFC and point
clouds (LAS/E57) are absent natively**; built-in USD remains an open proposal
([godot-proposals #7436](https://github.com/godotengine/godot-proposals/issues/7436)).
Industrial data arrives in precisely the missing formats.

**The validated data architecture** (peer-reviewed: MDPI _Machines_ 2024,
doi 10.3390/machines12110759; independently corroborated by Springer LNNS and HiveMQ UNS
patterns): OPC UA clients acquire at the edge, a bridge (e.g. Node-RED + Mosquitto)
converts to MQTT, the 3D viewer consumes downstream via MQTT/WebSocket — **the 3D scene
never speaks OPC UA directly.** This framework's `sourceUrl` relay seam is where that
bridge plugs in.

**OpenTwins is the blueprint and the gap at once**
([Computers in Industry 2023](https://www.sciencedirect.com/science/article/pii/S0166361523001574),
[arXiv:2301.05560](https://arxiv.org/abs/2301.05560)): the strongest open-source
3D-IoT digital-twin stack embeds a Unity WebGL scene in Grafana with live value
push-down and bidirectional click-through — and it depends on **proprietary Unity** for
its 3D layer. The fully-open-engine slot was unoccupied at research time. Its paper also
asserts (medium confidence — single 2023 source, self-interested framing, hedged
wording, 2024 follow-ups corroborate) that developers "may struggle to find …
open-source tools for the development of effective 3D-IoT-AI-powered digital twins".

**The business precedent is Cesium for Unreal**
([cesium.com/platform/cesium-for-unreal](https://cesium.com/platform/cesium-for-unreal/)):
a vendor ships its core 3D-visualization capability as a free, Apache-2.0 plugin for a
third-party engine (3D Tiles streaming, hierarchical LOD) and monetizes separately —
proof that a niche open plugin can be a front door.

**Demand is real but niche-scale** (portfolio positioning, not a market): a commercial
Udemy course, _Industrial Digital Twins for Automation — Godot and CoDeSys_, had ~710
enrolled students at ~4.6 rating (December 2025 archive snapshot). Evidence of training
adoption; promo signups inflate the count.

## REFUTED — never claim these anywhere

Both adversarially killed 0–3 in verification. Using them would be factually wrong:

- ~~"Hobby digital-twin projects default to Unity rather than Godot."~~ Refuted.
- ~~"Cesium offers no Godot runtime / there is a Cesium-for-Godot gap."~~ Refuted — do
  not pitch that gap.

## Open questions at research time → roadmap seeds

- **MQTT/OPC-UA bridging**: does OIPComms (or anything) run on stock Godot 4.4+
  cross-platform, or does connectivity belong outside the engine? (This framework chose
  outside: edge bridge → WebSocket relay. An MQTT source adapter behind `sourceUrl` is
  the v2 candidate.)
- **Web (WASM) ceiling**: can Godot web export sustain large instanced scenes well
  enough for the OpenTwins-style Grafana-embed pattern where Unity WebGL dominates?
  (Phase 0 proved a 500k-instance scene _boots_ at ~38 MB; browser fps unmeasured.)
- **Semantic/master-data models**: no verified precedent — in any engine — for mapping
  DTDL / ISA-95 asset hierarchies onto a scene graph; only ad-hoc property dictionaries
  exist. Greenfield if ever attempted.
- **Historical playback**: no verified precedent surfaced for scrubbing a 3D scene
  through time-series history — which is why this framework's playback + determinism
  gate is original work.
- **USD and point clouds**: unaddressed here; the format gap above still stands.

## Honesty notes for anything public

- This framework does **visualization + live data + history playback** — not physics or
  process simulation. Say "digital-twin visualization" until simulation exists.
- The measured numbers (4.4×+ optimizer gain, 100% GlobalId join, sha256-gated playback,
  ~1.1 s IFC import) come from one machine (Apple M3 Pro, Metal, shadows off) — always
  carry the caveats stated in `plugin-twin/library/findings/`.
