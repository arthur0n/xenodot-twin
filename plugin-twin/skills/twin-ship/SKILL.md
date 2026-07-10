---
name: twin-ship
agents: [twin-architect]
description: >-
  Package an export-safe viewer build together with its swappable data tree as ONE deployable
  (tools/twin_ship.sh) — the last step of the twin journey. It exports the desktop build headless,
  stages the model + sidecar + binding map + recordings in a `data/` folder BESIDE the executable
  (never baked into the pck), rewrites the shipped viewer.cfg to those data/-relative paths, boots the
  exported binary as a smoke gate, and zips the artifact deterministically — so a site retargets
  `url=`/`model=` WITHOUT re-exporting (the data-beside-build contract). This skill is the OPERATOR
  MANUAL — when to ship vs iterate, the layout contract, the recommended export preset, per-platform
  notes (macOS .app data placement + the honest unsigned/Gatekeeper warning), and how to read each
  stage's failure. It does NOT re-teach export debugging (that is `xenodot:godot-export-builds`) or
  butler/itch upload (also the base skill). NOT for web builds — those ship via the web-embed recipe
  (tutorial + `serve_coi.py`), not this skill.
---

# Twin ship (export-safe build + swappable data → one deployable)

`tools/twin_ship.sh --preset <name>` takes the export-safe viewer and packages it WITH its data as a
single, retargetable artifact. It is orchestration glue over five loud stages — it reinvents nothing:
the export delegates to the base export doctrine, the cfg rewrite reuses `twin_build.sh`'s `--wire`
idiom, and every gate follows the house discipline (loud stage labels, exit nonzero on the FIRST
failure, a SKIP is never a pass).

```
export (--export-release) ─▶ assemble (data/ beside build) ─▶ smoke (boot the binary) ─▶ zip
  base godot-export-builds     the data-beside-build contract    exported-binary log        deterministic
```

```
tools/twin_ship.sh --preset <name> [--model <path>] [--map <path>] [--sidecar <path>]
                   [--recording <path>]... [--out dist/] [--zip] [--smoke|--no-smoke]
```

`--preset` (the `export_presets.cfg` `name=`) is the only required flag; model / sidecar / map default
by the same discovery precedence as `verify_twin.sh` (flag → `viewer.cfg` → newest `models/*.glb` /
sibling `_props.json` / `binding_map.json`). Recordings are optional; the first one bundled is the
smoke's playback fixture.

## When to ship — and when to iterate instead

- **Ship** when the twin passes its gate (`twin-verify` green: join + binding smoke + playback
  determinism) and a site needs a runnable artifact — a stakeholder demo, an on-prem deploy, a handoff
  where the recipient has no Godot checkout. The zip IS the product (industrial users don't itch).
- **Iterate** — do NOT ship — while any gate is red or SKIPping. A `twin-ship` smoke asserts the boot
  log, not that the twin is _correct_; a shippable-but-unverified twin is a broken build packaged
  neatly. Run `twin-build` / `twin-verify` to green first, then ship.
- **Don't re-ship to change a site's target.** Editing `url=` or `model=` on the shipped artifact is a
  text edit, not a rebuild (see the contract below). Re-export only when the _code_ changed.

## The data-beside-build contract (the reason this skill exists)

Data does **NOT** go in the pck. The pck carries **code + starter scenes only**; the model, property
sidecar, binding map and recordings are staged in a `data/` folder **beside the executable**, and the
shipped `viewer.cfg` points at them with `data/`-relative paths. The export-safe viewer (phase 1)
roots `viewer.cfg` and bare data paths against `OS.get_executable_path().get_base_dir()` in template
builds, so it finds them at runtime.

```
dist/<name>-<platform>/
  <build binary / .app / .x86_64>        # the pck (code + starter scenes) rides inside this
  viewer.cfg                             # points at data/ paths + the site's source url=
  data/
    model.glb | model_opt.tscn           # runtime-loaded (GLTFDocument / ResourceLoader), never imported
    model_props.json                     # property sidecar (review data)
    binding_map.json                     # tag → GlobalId
    recordings/*.ndjson                  # optional playback fixtures
  README.txt                             # how to run + what to edit
```

**Why beside, not baked:** runtime-load is the product's contract (the no-editor-import rule), and the
deploy value is swapping model/map/recording **per site without re-exporting**. A `viewer.cfg` edit
(new `url=` for this site's broker, a different `model=` under `data/`) takes effect on the next boot
of the _same_ binary — proven on the shipped artifact, no rebuild. The sidecar and map are reviewable
data, not opaque baked assets. This is the whole point; don't "simplify" it by including the data in
the pck.

## The recommended export preset (hand-author `export_presets.cfg`, commit it)

One preset per platform, matched on the CLI by its exact `name=`. The two lines that matter for a
twin, annotated:

```ini
[preset.0]
name="macOS"
platform="macOS"
runnable=true
export_filter="all_resources"
# Keep the DATA OUT of the pck — it ships beside the build, not baked in. Without this the exporter
# sweeps models/, recordings/, the sidecar and the map into the pck and the contract is broken.
exclude_filter="*.glb,*.gltf,*.import,models/*,recordings/*,dist/*,build/*,tools/*,viewer.cfg,binding_map.json,*_props.json"
export_path="dist/<name>.app"

[preset.0.options]
# UNIVERSAL, not arm64. Godot 4.6.3 ships NO arm64-only macOS template binary — an arch="arm64" preset
# fails export ("template binary not found"). universal (x86_64 + arm64) is the safe default; it makes
# the executable large (~170 MB — it carries both slices) but that is the engine binary, not your data.
binary_format/architecture="universal"
# Unsigned build (see the Gatekeeper note). Signing/notarization is out of scope.
codesign/codesign=0
```

**macOS also requires** `textures/vram_compression/import_etc2_astc=true` under `[rendering]` in
`project.godot` — the macOS templates ship ONLY ASTC-compressed texture variants, and with it off the
export aborts (`Target platform requires 'ETC2/ASTC'`). The export-safe viewer already sets this (it is
harmless in dev — models load at runtime, so nothing is texture-imported). `twin_ship.sh` **asserts**
it in preflight and prints the exact line rather than editing `project.godot` behind your back.

A Linux preset is the same shape with `platform="Linux"`, `binary_format/architecture="x86_64"`, and
the same `exclude_filter`. No ETC2/ASTC requirement on Linux.

## Per-platform notes

- **macOS — data goes INSIDE the bundle.** The executable lives at `<name>.app/Contents/MacOS/`, so
  `viewer.cfg` and `data/` are staged **there** (`.app/Contents/MacOS/viewer.cfg`,
  `.app/Contents/MacOS/data/…`), beside the binary — that is where the export-safe viewer roots them.
  The in-bundle executable is named by `project.godot` `application/config/name` (NOT the `.app`
  basename), which may contain spaces; the README's direct-run command single-quotes the full path so
  it pastes verbatim.
  - **Unsigned build — the honest warning.** These builds are NOT code-signed or notarized (out of
    scope, full stop — this skill does not sign). On a Mac other than the build machine, Gatekeeper
    warns on first open ("cannot be opened because the developer cannot be verified" / "damaged"). The
    shipped `README.txt` states this plainly and gives the two ways past it (right-click → Open →
    Open, or `xattr -dr com.apple.quarantine <name>.app`). Say it plainly to the user too — do not
    imply the artifact is signed.
- **Linux — flat layout.** A single `<name>.x86_64` ELF with `viewer.cfg`, `data/` and `README.txt`
  as siblings in the dist dir (no bundle). `chmod +x` if the exec bit didn't survive transport.
- **Windows — flat + sibling `.pck`.** `<name>.exe` (+ the `.pck` unless embedded), same `data/`
  layout beside it; SmartScreen shows the unsigned-build "Windows protected your PC" prompt.
- **Cross-platform smoke SKIPs — loudly, never a pass.** The smoke can only boot a binary of the HOST
  platform (you cannot run a Linux ELF or a Windows PE on macOS). Exporting a non-host preset assembles
  and zips fine but the smoke prints a loud `SKIP` and exits 0 — "boot it on a `<platform>` machine".
  `--smoke` forces it (and fails on a non-host binary — the caller's choice); `--no-smoke` skips. A
  SKIP is never a green — boot the artifact on its own platform before you trust it.

## Reading a stage failure

The script exits nonzero at the FIRST red gate. Map the stage to the skill that owns the fix:

| Stage label               | What it means it hit                                                                                   | Where the fix lives                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `[1/5] preflight`         | no `project.godot` / engine, bad `--preset` name, no templates, macOS ETC2/ASTC off, missing model/map | this file + `xenodot:godot-export-builds` (templates)                    |
| `[2/5] export`            | the engine reported an `ERROR` / no non-empty binary (exit codes lie)                                  | `xenodot:godot-export-builds`                                            |
| `[3/5] assemble`          | the `viewer.cfg` rewrite failed (not valid Godot INI)                                                  | check `viewer.cfg` parses                                                |
| `[4/5] smoke` assert MISS | the exported binary booted but a log line is missing (model not loaded, bindings 0, no playback)       | `twin-verify` / `twin-bind-data` — the twin is broken, not the packaging |
| `[4/5] smoke` SKIP        | cross-platform (a SKIP, not a failure) — run it on the target OS                                       | not a bug — boot on that platform                                        |

A **preflight** template failure (`no export templates for <ver>`) is a host setup step, not a project
bug — install the ~700 MB templates for the exact engine version per `xenodot:godot-export-builds`;
`twin_ship.sh` will not fake the export. A **verify-class** smoke miss (bindings 0/N, no model) means
the _twin_ is broken — the packaging worked; fix the twin with `twin-verify` / `twin-bind-data` and
re-ship. Do not debug export failures here — the base doctrine owns template mismatches, preset
platform-string typos, and arch-with-no-matching-template.

## Uploading (butler / itch) — via the base skill only

If you want the artifact on itch.io, `butler push` it — but that is `xenodot:godot-export-builds`'
territory (it owns `butler login`, the channel-per-platform mapping, and `--userversion`). This skill
produces the artifact; it does not upload. Industrial users don't itch — for them the zip is the
deliverable, handed over directly.

## Boundary — web builds are NOT this skill

A Web (WASM) build does not ship through `twin_ship.sh`. It has a different runtime (no
executable-adjacent filesystem, browser fetch instead), a different serving story (cross-origin
isolation headers), and its own measured recipe. Ship web via the **web-embed recipe**: the tutorial's
"Put it on the web (and embed it in Grafana)" section + the two annotated Web presets +
`tools/web/serve_coi.py` (skill `twin-bind-data` → "Serving to the browser / Grafana embed"). Do not
add a Web preset to `twin_ship.sh` — point at that recipe.

## Out of scope (named)

- Code signing / notarization / installers — NOT provided; the unsigned-build warning is stated
  honestly in the skill and the shipped `README.txt`.
- Web builds — the web-embed recipe owns the browser story (above).
- Auto-update, telemetry, licensing of shipped artifacts.
- CI matrix builds — one host, per-platform presets, smoke where runnable.

## RTK note

Prefix shell commands with `rtk` as usual. The Godot binary (`$GODOT`) runs without an rtk filter
(passthrough) — and never pipe export output through `rtk grep`, so `ERROR`/`template` lines aren't
filtered. Never reference rtk inside the `.sh`/`.gd` tools.

Measured seat artifact sizes + the layout contract, proven end-to-end (clean-stranger unzip, README-only
run, windowed boot, the data-swap contract): `plugin-twin/library/findings/twin-ship-2026-07-10.md`.
