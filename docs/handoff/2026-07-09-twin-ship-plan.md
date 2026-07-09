# Implementation plan — `twin-ship`: package build + model + data as one deployable

Roadmap Nice-to-Have #7 (see `2026-07-09-roadmap-handoff.md`). Plan only. Roadmap calls
it "small skill, closes the journey's last step" — investigation says the SKILL is small
but the viewer is not export-safe today; that viewer work is the real item.

## What exists (verified)

- **Base skill** (`plugin/skills/godot-export-builds/SKILL.md`): headless
  `--export-release`, desktop-first doctrine, export-template prerequisite (~700 MB,
  exact engine version), butler/itch upload, web gated behind a renderer spike.
  Game-shaped: exports the pck/binary only — no concept of data files.
- **A twin deploys as**: build + model (GLB or optimized `.tscn`) + property sidecar +
  binding map + `viewer.cfg` + optional recordings. All read at RUNTIME by design (the
  no-editor-import contract).

## Gaps found — the viewer breaks in an exported build (this IS the work)

1. **Model loading breaks when exported.** `main.gd:_load_model` does
   `ProjectSettings.globalize_path("res://…")` then `GLTFDocument.append_from_file`.
   In an exported build, `globalize_path` on a packed `res://` path returns nothing
   usable (pck contents have no OS filesystem path) — and the GLB isn't in the pck
   anyway (non-imported, no include_filter). Today's viewer can load a model in a dev
   checkout ONLY. Fix: read bytes via `FileAccess.get_file_as_bytes(path)` (works for
   res://-in-pck, user://, and OS paths uniformly) → `gltf.append_from_buffer`. GLBs
   are self-contained (no external refs in our pipeline), so no base-path concerns.
   This also simplifies dev behavior — one code path, no globalize.
2. **Config is frozen at export time.** `data_bus.gd` `CONFIG_PATH := "res://viewer.cfg"`
   (main.gd same) — exported builds read the packed copy; a deployed site could never
   point at ITS broker/model without re-exporting. Fix: in exported builds
   (`OS.has_feature("template")`), look for `viewer.cfg` NEXT TO THE EXECUTABLE first
   (macOS: `.app/Contents/MacOS` — recipe documents the bundle layout), fall back to
   the packed copy. Dev behavior unchanged.
3. **Data files beside the build need resolvable paths.** Bare relative paths currently
   root under `res://` (`main.gd:_globalized`). In exported builds they should root
   against the executable dir instead — same `OS.has_feature("template")` branch. The
   optimized-`.tscn` case (self-contained `.scn` — `_save_scene` bundles the meshes as
   subresources) should load via `ResourceLoader.load` from an OS path; VERIFY in the
   phase-1 smoke, with the documented fallback being `ProjectSettings.load_resource_pack`
   (a second data-only pck mounted at boot) if external `.scn` load misbehaves in
   templates.
4. **No headless proof for a shipped artifact.** Nothing can currently assert "this zip
   actually boots and paints". Add a tiny `--quit-after=<frames>` user arg to `main.gd`
   (counted in `_process`, then `quit()`): the ship gate runs the EXPORTED binary
   headless with a recording and asserts the boot log (`viewer: model loaded`, bindings
   resolved count, playback frames injected). Named constant, documented as the ship
   smoke's hook; no behavior without the flag.

Ship layout decision (the "data-beside-build" contract): data does NOT go in the pck.
Rationale: runtime-load is the product's contract; the deploy value is swapping
model/map/recording per site WITHOUT re-exporting; sidecars and maps are reviewable
data, not baked assets. The pck carries code + starter scenes only.

```
dist/<name>-<platform>/
  <build binary / .app / .exe + pck>
  viewer.cfg                 # points at data/ paths + the site's source url
  data/
    model.glb | model_opt.tscn
    model_props.json
    binding_map.json
    recordings/*.ndjson      # optional
  README.txt                 # how to run, what to edit (url=, model=)
```

## The tool + the skill

**`plugin-twin/tools/twin_ship.sh`** (materialized; same discipline as verify_twin.sh):

```
tools/twin_ship.sh --preset <name> [--model <path>] [--map <path>] [--sidecar <path>]
                   [--recording <path>]... [--out dist/] [--zip] [--smoke]
```

1. **Preflight** — `xeno_resolve_engine`; preset exists in `export_presets.cfg`; export
   templates present (fail with the base skill's install pointer); artifact paths exist
   (default discovery mirrors verify_twin.sh's model+sidecar precedence).
2. **Export** — headless `--export-release` (delegates to the base skill's flow; this
   tool does not reinvent export debugging — its SKILL.md sends export failures there).
3. **Assemble** — the layout above; rewrites the shipped `viewer.cfg` `[viewer] model=`
   / `[twin] binding_map=` / `recording=` to the `data/` relative paths (ConfigFile
   round-trip, same no-sed rule as twin-build's `--wire`).
4. **Smoke** (`--smoke`, default ON when the platform matches the host) — run the
   exported binary `--headless -- --quit-after=N --recording=data/<fixture>`; assert
   the log lines. SKIPs loudly for cross-platform exports (can't run a Windows build
   on macOS — a SKIP is not a pass).
5. **Zip** (`--zip`) — deterministic file order; prints the artifact path + size.

**`plugin-twin/skills/twin-ship/SKILL.md`** — when to ship vs iterate, the layout
contract, per-platform notes (macOS .app data placement + Gatekeeper/notarization
HONESTY note: unsigned builds warn on open; signing is out of scope, say so), butler
upload only via the base skill, and the explicit boundary: web builds ship via the
web-embed recipe (sibling plan `2026-07-09-web-embed-plan.md`), not this skill, until
that plan's measurement lands.

## Phasing

1. **Viewer export-compat** (framework, `starter-viewer/`): `append_from_buffer` load;
   executable-adjacent `viewer.cfg` + data resolution behind `OS.has_feature("template")`;
   `--quit-after=`. Full gate green; dev-checkout behavior byte-identical (the gate's
   binding smoke + playback checks are the regression net). Manual proof: export the
   house viewer by hand, boot it with data beside the build, see it painted — this
   de-risks gap 3's `.tscn` question before any tooling exists.
2. **`twin_ship.sh`**: stages above + `--smoke` + `--zip`. Prove happy path + each
   preflight failure (no templates, bad preset, missing sidecar).
3. **Skill + seat validation + docs**: ship the house twin from `twindemo/` (macOS at
   minimum; Linux export as the cross-platform SKIP demonstration), unzip on a clean
   path, run from the README instructions only — clean-stranger rule applied to the
   artifact. Findings note with artifact sizes. CAPABILITIES entry; SEAMS protect-list
   += `tools/twin_ship.sh`, `skills/twin-ship/`; tutorial gains the final "ship it"
   section; roadmap tick.

## Acceptance criteria

1. Dev-checkout viewer behavior unchanged (gate green before/after phase 1; no
   globalize-path code remains in the model load).
2. Exported macOS build loads model + map + recording from `data/` beside the build —
   proven by the `--smoke` log assertions AND one human windowed boot.
3. Shipped `viewer.cfg` edits (new `url=`, different `model=`) take effect WITHOUT
   re-export — the data-swap contract, tested by hand once.
4. Cross-platform export SKIPs the smoke loudly, never silently passes.
5. Optimized-`.tscn` shipping either works via OS-path load (proven) or the plan's
   pck-fallback is implemented and documented — no silent "GLB only".
6. SEAMS/CAPABILITIES/tutorial/roadmap updated in the same change set.

## Out of scope (named)

- Code signing / notarization / installers — documented as not provided; unsigned-build
  warnings stated honestly in the skill and shipped README.
- Web builds (sibling plan owns the browser story; this skill points there).
- Auto-update, telemetry, licensing of shipped artifacts.
- itch.io/butler beyond delegating to the base skill (industrial users don't itch;
  the zip is the product).
- CI matrix builds — one host, per-platform presets, smoke where runnable.
