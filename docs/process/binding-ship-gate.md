# Convention — a binding map is not shipped until `BIND-SMOKE=N/N`

A `binding_map.json` binds live tags to model geometry by IFC GlobalId. The one failure mode that
hides is a **silent unbound tag**: a mistyped or copy-pasted GlobalId that is a valid 22-char string
but is absent from the model resolves to **0 targets**. The viewer boots, the HUD still shows the
other tags moving, and nothing flags the dead row — a `0-of-N` looks exactly like a working map from
across the room.

**So the gate, not the eye, is the ship criterion.** The bind smoke (`tools/smoke_binding.gd`, run by
`tools/verify_twin.sh`) resolves every row against the real scene and reports `BIND-SMOKE=<resolved>/
<total>`. A map ships only at `BIND-SMOKE=N/N`. `resolved < total` is **RED** — the runtime is loud
(`push_warning` names the dead GlobalId, per `twin-bind-data`'s "unknown GlobalId → loud" contract)
and the gate exits non-zero.

## The mechanics

- **Author against the sidecar — query, don't grep.** List valid GlobalIds filtered by IFC class /
  Name so you PICK joins instead of scanning a 22 MB `<model>_props.json` by hand: `npm run binding --
--model <model> --class IfcWall` (terminal/seat), the `mcp__ui__find_binding_candidates` tool (agent
  session), or the _browse binding candidates_ box on each imported-model assets card
  (`/api/binding-candidates`) — one shared core behind all three. Take the 22-char GlobalId **key**,
  never the example map's own ids. Recipe: skill `twin-bind-data` → "Authoring a map against real
  GlobalIds". (Discovery is now _assisted_; the smoke below is still the ship gate.)
- **Smoke with `--json`.** `smoke_binding.gd --json=binding_map.status.json` writes
  `{bind_smoke, resolved, total, unresolved[], node_targets, mmi_targets}` on **every** terminal path
  (pass and fail), so the count is machine-readable.
- **See it in the product.** The framework assets panel reads that status (`/api/binding-status`) and
  renders a green/red `N/N resolved` badge, so resolution health is visible in the UI, not only in the
  viewer HUD or a finding. A planted bad id flips the badge red with the unresolved GlobalId listed.

## Why a convention and not just a gate

The gate has always resolved the map; what was missing was the **discipline** that a passing viewer
render is not proof. A silent 0-of-N renders a beautiful, wrong twin. `BIND-SMOKE=N/N` — counted by
the gate and badged in the UI — is the line between "looks bound" and "is bound".

Proven end-to-end on the Schependomlaan real building (IFC2X3, 3505/3505 join): the red→green pair
and the in-UI badge flip are recorded in
`plugin-twin/library/findings/twin-bind-overlay-2026-07-10.md`.
