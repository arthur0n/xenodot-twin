---
name: twin-asset-import
agents: [twin-architect, data-binder]
domain: twin
description: >-
  Bring a NON-BIM 3D asset into a digital-twin viewer — a vendor equipment model (pump, valve, rack,
  skid) or a CC0 prop delivered as GLB/FBX, which has no IFC GlobalId. Covers the runtime GLTFDocument
  load (GLB-only; FBX is converted first), meters/units sanity against the BIM scene, PBR materials
  under Forward+, and — the crux — how a prop with no intrinsic GlobalId JOINS the data layer by
  MINTING a synthetic GlobalId that binding_map.gd's node index will target, plus a props sidecar so
  the property panel and join gate treat it exactly like a BIM element. Use when dropping a sourced
  equipment model or prop into the viewer, when a vendor model imports at 1000x scale or pitch-black,
  or when a prop must respond to a live tag but has no guid to bind to. NOT the IFC/BIM pipeline
  (twin-import MINTS nothing — its guids are intrinsic), NOT instance batching (twin-optimize), NOT
  the live-stream wiring itself (twin-bind-data consumes the join this skill produces).
---

# Twin asset-import (non-BIM props → runtime load → synthetic-GlobalId join)

The BIM building enters through `twin-import`, where the **IFC GlobalId is intrinsic** — the
serializer stamps it into every node name. A vendor pump or a CC0 rack has **no GlobalId at all**.
So this skill's one invariant is the mirror of that one: **you MINT the join key.** A non-BIM prop
becomes a first-class twin element the moment its addressable node carries a synthetic 22-char id
that the binding runtime resolves exactly like a real IFC node — same channel, same responses, same
gate. Skip the mint and the prop is decorative geometry the data layer can never reach.

```
vendor.glb / vendor.fbx ──(fbx→glb if needed)──▶ prop.glb
prop.glb ──GLTFDocument (runtime)──▶ node renamed to a SYNTHETIC GlobalId ──▶ live binding
                                  └─▶ prop_props.json (synthetic id → {name, source, …})
```

## Step 0 — GLB in hand, or convert first (the runtime is GLB-only)

The viewer loads models at **runtime with `GLTFDocument`** (`main.gd._load_model`), and
`GLTFDocument.append_from_file` reads **glTF/GLB only** — it cannot read FBX. So an FBX vendor
model is converted to GLB as an offline build step (the same shape as `twin-import`'s
`ifc_convert.py`: the converter is host toolchain, not project runtime):

```bash
rtk fbx2gltf -b -i vendor_pump.fbx -o prop_pump          # → prop_pump.glb (binary)
# or a headless Blender export, if the FBX needs cleanup/re-origin first
```

A GLB delivered straight from a vendor or a CC0 catalog needs no conversion — go to step 1. Keep
the source FBX and any converter out of the Godot project's `res://` (gitignore it); only the GLB
ships as loadable model data.

## Step 1 — load at RUNTIME (same contract as twin-import)

No editor import, no `.import` files — a prop is model data the viewer opens in place, identical to
the building. Reuse the existing seam (`main.gd._load_model` globalizes `res://` then
`append_from_file`); a prop is just an additional GLB alongside the model:

```gdscript
var gltf := GLTFDocument.new()
var state := GLTFState.new()
var err := gltf.append_from_file(ProjectSettings.globalize_path(glb_path), state)
if err != OK:
    push_error("prop load failed: %s" % err)
    return
var prop := gltf.generate_scene(state)
model_host.add_child(prop)
```

`append_from_file` wants a real filesystem path — globalize a `res://` path first (the building
importer hits the same rule).

## Step 2 — scale & units sanity (measure the AABB, never eyeball)

glTF's unit is the **metre**, Y-up, right-handed — and `twin-import` yields the BIM building in
metres — so a spec-clean vendor GLB drops in at true scale next to the model. But CAD-exported
vendor models frequently bake the wrong unit: a pump that should stand ~`1.5 m` arrives at that many
**millimetres** (a ~1000x giant) or centimetres (~100x), or Z-up (lying on its side). Do NOT judge
this against the building by eye — **measure**:

```gdscript
# world-AABB diagonal of the loaded prop vs its known real-world size
var bounds := AABB()
for mi: MeshInstance3D in prop.find_children("*", "MeshInstance3D", true, false):
    bounds = bounds.merge(mi.global_transform * mi.get_aabb())
print("prop span m: ", bounds.size)     # ~1.5 expected → 1500 means millimetres
```

Fix at the **source export** (set the exporter's unit to metres, up-axis to Y) whenever you can
re-export; otherwise apply ONE uniform scale (and any axis basis) on the prop's root node at load.
A per-order-of-magnitude mismatch is a unit error, not a modelling error — correct the unit, don't
hand-tune a scale factor per prop.

## Step 3 — materials under Forward+

`GLTFDocument` maps glTF metallic-roughness PBR to `StandardMaterial3D`/ORM automatically, and
Forward+ renders it natively — vendor albedo, metal, roughness, emissive, and transparency come
through as authored. Gotchas: a `.glb` embeds its textures (safe); a `.gltf` + external images needs
those files kept beside it. A vendor export in the legacy specular-glossiness workflow must be
reconverted to metallic-roughness first (glTF core is metallic-roughness only). A prop reading flat
black usually shipped an emissive/unlit setup or lost its textures in an FBX round-trip.

**Leave the imported material alone.** When a tag drives this prop, `binding_map.gd` creates a
**fresh per-target `StandardMaterial3D` `material_override`** — it never mutates the imported
material — so the prop keeps its PBR look until a live value paints over it. That per-target
discipline (one override per resolved site, so duplicate ids don't clash) is `twin-bind-data`'s
contract; you inherit it for free by joining as a plain node target (step 4).

## Step 4 — join the data layer: MINT a synthetic GlobalId (the crux)

Read `core/binding_map.gd` honestly before wiring this. Its resolution index (`build_index` →
`_walk`) offers exactly two locator channels, and only ONE fits a single prop:

- **`node`** — a node whose NAME is a GlobalId: exactly `GLOBALID_LEN` chars, every char in the IFC
  base64 alphabet `GLOBALID_CHARS` (`0-9A-Za-z_$`), Godot's dedup suffix stripped to the prefix.
  Drives `albedo_ramp`/`label` on the node's own material — **this is the channel a prop uses.**
- **`mmi`** — a `MultiMeshInstance3D` carrying the `twin_globalids` meta (index = instance position).
  This is `twin-optimize`'s **batched-instance** channel. It is NOT a single-prop join: `_walk`
  will happily read a `twin_globalids` meta off a plain `MeshInstance3D`, but `_apply_mmi_colour`
  and `_is_mmi_wired` both require the host to be a `MultiMeshInstance3D`, so on an un-batched prop
  the meta resolves to locators that **silently paint nothing**. Do not reach for the meta here.

So the join for a prop is: **name its addressable node a synthetic GlobalId**, and it enters the
index through the `node` channel indistinguishable from a real IFC element. Mint the id from a
stable per-asset slug, reserving a leading token so a synthetic id can never collide with a real IFC
guid nor with another prop (the constants mirror `core/binding_map.gd`, so nothing is a bare
literal):

```gdscript
const SYNTH_PREFIX := "PROP$"     # reserved head — no real IFC guid begins this way
const SYNTH_FILL := "0"           # a member of GLOBALID_CHARS, used only to pad

# Exactly GLOBALID_LEN chars, all in GLOBALID_CHARS → binding_map.gd accepts it as a "node".
func synth_globalid(slug: String) -> String:
    var body := (SYNTH_PREFIX + slug.to_upper().replace("-", "_")).left(GLOBALID_LEN)
    return body.rpad(GLOBALID_LEN, SYNTH_FILL)
```

Apply it as the node name — bake it into the source GLB (rename the node in Blender before shipping,
so the id travels with the asset and `_walk` finds it with zero runtime code — **preferred**), or
rename at load when you cannot re-export the vendor GLB:

```gdscript
var prop := gltf.generate_scene(state)
prop.name = synth_globalid("pump-01")     # the JOIN KEY, not a display name
model_host.add_child(prop)
```

Then a props **sidecar** keyed by the synthetic id (the non-BIM sibling of `twin-import`'s
`model_props.json`) lets the property panel and the join gate treat the prop as an element:

```json
{
  "PROP$PUMP_010000000000": {
    "ifc_class": "(non-BIM prop)",
    "name": "Coolant pump 01",
    "source": "vendor GLB — coolant_pump.glb",
    "psets": {}
  }
}
```

And the binding-map row is now completely ordinary — the synthetic id sits in `globalid` where a real
guid would (schema: `twin-bind-data`):

```json
{
  "tag": "pump_1.temp",
  "globalid": "PROP$PUMP_010000000000",
  "min": 20.0,
  "max": 90.0,
  "response": "albedo_ramp",
  "ramp": ["#00ff00", "#ff0000"]
}
```

### Collision-free naming

`binding_map.gd` keys on the `GLOBALID_LEN`-char **prefix** (dedup suffixes stripped), and one
GlobalId can resolve to many locators — all driven by the one binding (the documented
duplicate-GlobalId caveat). So each prop's synthetic id must be **unique across its full length**:
two props sharing that prefix collapse into one binding and both light up together. Keep slugs
distinct; if a slug is long enough that the prefix truncation would alias two props, shorten or
namespace it before minting. Vendor display names inside the GLB are safe — they are not 22-char
base64, so `_globalid_from_name` rejects them; only the one node you rename carries a key.

## Step 5 — verify via `xenodot:twin-verify`

After importing a prop, run `tools/verify_twin.sh` (skill `twin-verify`) — the prop rides the same
gates as a BIM import:

- **Join coverage** (`check_twin_join.gd`): the synthetic-id node counts as a named
  `MeshInstance3D`, so pass the prop's sidecar (or a sidecar merged with the model's) as `--sidecar`
  and confirm the prop's id lands in `JOIN=<matched>/<total>` at ~100%.
- **Binding smoke** (seeded sim → DataBus → binding): bind a sim tag to the prop's synthetic id and
  assert the node target's `material_override.albedo_color` is non-white AND moves between samples —
  a prop is a `node` target, so this is headless-safe (no windowed-only MMI caveat).
- **Render health** (windowed, `xenodot:godot-verify` layer): the eyes-on check that scale and
  materials are right — a giant, invisible, or pitch-black prop is the silent-drop signature this
  layer exists to catch.

## twin-import vs twin-asset-import — never blur them

Same runtime-load contract, same join-key SHAPE (a `GLOBALID_LEN`-char base64 node name), same
sidecar shape, same `twin-verify` gates. The ONE difference is where the key comes from:

- **`twin-import`** — BIM/IFC. The GlobalId is **intrinsic**; `use-element-guids` stamps it. You
  never invent an id, and a missing guid is a conversion bug to fix, not a gap to fill.
- **`twin-asset-import`** (this skill) — non-BIM props. There IS no intrinsic id; you **mint** a
  synthetic one and own its uniqueness. A prop that "won't bind" is almost always an unminted or
  colliding id, not a stream problem.

Route a building to `twin-import`; route a pump/valve/rack/skid or a CC0 prop here. Sourcing
catalogs for CC0/vendor models live in the knowledge base (`library/sources/model-sources.md`);
a genuinely un-sourceable prop is a `mcp__ui__request_asset` call, never a hand-built generator.

## RTK note

Prefix shell commands with `rtk` as usual; `$GODOT`, `fbx2gltf`, and `tools/verify_twin.sh` run
without an rtk filter (passthrough). Never reference rtk inside `.gd` files.
