# Ship a twin, then retarget it by one line

This walkthrough takes a **green twin** and packages it as a single, retargetable **desktop
deployable** — an export-safe viewer build with its data (model, binding map, recording) staged
**beside** the executable — then proves the payoff: a receiver **retargets the shipped artifact by
editing one line of text, no re-export, the same binary**. It is the last step of the twin journey,
the sibling of the [plant tutorial](plant-twin.md): same asset, one step further down the pipeline.

> **What this demo is — read this first.** `tools/twin_ship.sh` produces a **deployable artifact**,
> not a signed installer. The build is **unsigned** — not code-signed or notarized (out of scope, full
> stop); on a Mac other than the build machine Gatekeeper warns on first open, and the shipped
> `README.txt` says so plainly with the two ways past it. And a ship **smoke asserts the boot log, not
> that the twin is correct** — you ship only a twin that already passed its gate (join + binding). The
> settled evidence this tutorial reproduces lives in two findings —
> [`twin-ship-2026-07-10.md`](../../plugin/library/findings/twin-ship-2026-07-10.md) (packaging + the
> `model=` swap contract) and
> [`twin-ship-retarget-2026-07-10.md`](../../plugin/library/findings/twin-ship-retarget-2026-07-10.md)
> (the one-line `url=` retarget, same binary) — and this tutorial inherits their honest framing rather
> than re-testing it.

The durable rule underneath it all is **data beside the build**
([`docs/process/data-beside-build.md`](../process/data-beside-build.md)): the `.pck` is **code +
starter scenes only**, the data is runtime-loaded from `data/` next to the binary, so a shipped twin
is retargeted by editing text — the same binary reads the new config on its next boot.

> **Every number below was actually run** on one machine (Apple M3 Pro / Metal, macOS Darwin 25.5,
> Godot 4.6.3.stable, Node 22, Python 3.12). The deterministic numbers — the recording sha256, the
> zip sha256, JOIN 18/18, the binary mtime — reproduce exactly because the assets and the archive are
> deterministic; the wall-clock times and the ~176 MB universal binary are this machine / this engine
> version's.

---

## Prerequisites

Everything the [plant tutorial](plant-twin.md) needed, **plus one host setup step for export**:

- **A green twin.** This tutorial starts where the plant tutorial ended — an optimized,
  join-verified `plant_opt.tscn` in a scaffolded viewer. If you have not built it, do the plant
  tutorial's one command first (`tools/twin_build.sh models/plant.ifc --map binding_map.json`).
- **Godot 4.x** — 4.6.3 here. `export GODOT=/Applications/Godot.app/Contents/MacOS/Godot`.
- **Export templates for the EXACT engine version.** Headless export needs the ~700 MB templates
  for `4.6.3.stable` (Editor → Manage Export Templates → Download and Install). Without them
  `twin_ship.sh` FAILs loud in preflight — it will not fake an export (skill
  [`godot-export-builds`](../../plugin/skills/godot-export-builds/SKILL.md) owns template install).

---

## Step 1 — author the export preset (once, committed)

`twin_ship.sh` matches an `export_presets.cfg` preset by its exact `name=`. Hand-author one per
platform and commit it. Only a few lines matter for a twin; here is the macOS preset with those
lines annotated:

```ini
[preset.0]
name="macOS"
platform="macOS"
runnable=true
export_filter="all_resources"
; Keep the DATA OUT of the pck — it ships beside the build, not baked in. Without this the exporter
; sweeps models/, recordings/, the sidecar and the map into the pck and the contract is broken.
exclude_filter="*.glb,*.gltf,*.import,models/*,recordings/*,dist/*,build/*,tools/*,viewer.cfg,binding_map.json,*_props.json"
export_path="dist/plant.app"

[preset.0.options]
; UNIVERSAL, not arm64 — Godot 4.6.3 ships NO arm64-only macOS template binary (arch="arm64" fails
; export). universal (x86_64 + arm64) is the safe default; it is why the binary is ~176 MB.
binary_format/architecture="universal"
; macOS REQUIRES a bundle identifier, or the export hard-fails. Any reverse-DNS string works unsigned.
application/bundle_identifier="com.xenodot.plant"
; Unsigned build (see the Gatekeeper note). Signing/notarization is out of scope.
codesign/codesign=0
```

A Linux preset is the same shape with `platform="Linux"`, `binary_format/architecture="x86_64"`,
and the identical `exclude_filter` (no ETC2/ASTC requirement on Linux). The full two-preset file
this session used is in the plant seat; the two lines you must not get wrong are the
**`exclude_filter`** (keeps data out of the pck) and **`binary_format/architecture="universal"`** on
macOS.

> **macOS also requires `textures/vram_compression/import_etc2_astc=true`** under `[rendering]` in
> `project.godot` — the macOS templates ship ONLY ASTC-compressed texture variants, and with it off
> the export aborts (`Target platform requires 'ETC2/ASTC'`). The scaffolded viewer already sets it
> (harmless in dev — runtime-loaded models are never texture-imported), and `twin_ship.sh` **asserts**
> it in preflight rather than editing `project.godot` behind your back.

---

## Step 2 — the one command: ship

Five loud stages — preflight → export → assemble → smoke → zip — exit 0 only if every non-SKIP gate
passed. Ship the optimized scene, bundle a recording (the first one becomes the smoke's playback
fixture), and ask for the deterministic zip:

```bash
export GODOT=/Applications/Godot.app/Contents/MacOS/Godot
tools/twin_ship.sh --preset macOS \
  --model models/plant_opt.tscn \
  --recording recordings/plant-shift.ndjson \
  --zip
```

The real tail of that run (host is macOS, so the smoke actually boots the binary):

```
twin-ship: PASS export (…/plant_opt.app)

== twin-ship [3/5] assemble (dist/plant_opt-macos) ==
SHIP-CFG: OK — dist/plant_opt-macos/plant_opt.app/Contents/MacOS/viewer.cfg (3 key(s))
twin-ship: PASS assemble (dist/plant_opt-macos)

== twin-ship [4/5] smoke ==
  running: Xenodot Twin Viewer --headless -- --quit-after=20 --recording=data/recordings/plant-shift.ndjson
    viewer: model loaded from data/plant_opt.tscn
    viewer: bindings resolved 8/8
    viewer: playback of data/recordings/plant-shift.ndjson (59900 ms)
    viewer: quit-after 20 frames reached
  assert OK  — model loaded from data/
  assert OK  — bindings resolved (>0 — 0/N is a broken map)
  assert OK  — recording playback started
  assert OK  — quit-after 20 frames reached
twin-ship: PASS smoke (Xenodot Twin Viewer booted from data/ beside the build)

== twin-ship [5/5] zip ==
twin-ship: PASS zip (dist/plant_opt-macos.zip, 59M — deterministic: find|sort order + zip -X)

twin-ship: OK
  artifact: dist/plant_opt-macos
  zip:      dist/plant_opt-macos.zip
```

The whole macOS ship took **~11.8 s wall** (`time`: 11.794 s total, 7.16 s user).

**The `bindings resolved 8/8` line is the payoff of `--headless` on a template build.** That count
comes from the **exported binary** resolving the binding map against the shipped model — the twin's
binding proof, delivered from the artifact itself, not from a dev-tree gate. (The eight plant tags
are six paints + two valve **labels**, all resolved — see the [plant tutorial](plant-twin.md#the-bindings--eight-plant-tags).)

### Artifact sizes (this run — plant twin over the optimized scene)

| piece                   | size                     | note                                                                         |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `plant_opt.app` (total) | 177 MB (185 386 191 B)   | dominated by the executable                                                  |
| in-bundle executable    | 176.2 MB (184 757 632 B) | the **universal** engine template binary (x86_64 + arm64) — NOT your data    |
| `.pck` (code + scenes)  | **51 660 B (50.4 KB)**   | code + starter scenes ONLY — data excluded, the contract held                |
| `data/` (beside build)  | 505 077 B (~493 KB)      | `plant_opt.tscn` 69 319 B + `binding_map.json` 4 823 B + recording 348 167 B |
| `plant_opt-macos.zip`   | **59 MB (61 752 584 B)** | deterministic (fixed sort order + `zip -X`)                                  |

The pck is **51 660 bytes** — code + starter scenes only; the ~493 KB of data is **not** in it, it
sits in `data/` beside the build. (Pck size scales with viewer code, not the asset — a different
twin ships a different pck; the _contract_, data beside the build, is what generalizes.)

---

## Step 3 — the layout contract (data beside the build, inside the bundle on macOS)

The exported binary lives at `plant_opt.app/Contents/MacOS/`, so `viewer.cfg` and `data/` are staged
**there**, beside it — where the export-safe viewer roots them
(`OS.get_executable_path().get_base_dir()` in template builds). The assembled tree (the assemble
stage prints it verbatim):

```
plant_opt-macos/
  README.txt
  plant_opt.app/Contents/MacOS/Xenodot Twin Viewer      # the executable (named by config/name, not the .app)
  plant_opt.app/Contents/MacOS/viewer.cfg               # rewritten to data/-relative paths, url= untouched
  plant_opt.app/Contents/MacOS/data/plant_opt.tscn
  plant_opt.app/Contents/MacOS/data/binding_map.json
  plant_opt.app/Contents/MacOS/data/recordings/plant-shift.ndjson
  plant_opt.app/Contents/Resources/Xenodot Twin Viewer.pck   # code + starter scenes only
```

The assemble stage rewrote the shipped `viewer.cfg`'s `[viewer] model=` / `[twin] binding_map=` /
`recording=` to their `data/`-relative paths (ConfigFile-validate then line-rewrite, comments
preserved — the `twin_build.sh --wire` idiom), leaving **`url=` untouched** for a site to edit.

---

## Step 4 — verify the zip as a clean stranger

The deliverable is the zip. Prove it the way a receiver will — unzip it to a clean path **outside any
project** and look at the tree:

```bash
mkdir -p /tmp/stranger && cd /tmp/stranger
unzip -q /path/to/plant_opt-macos.zip
find plant_opt-macos -type f | LC_ALL=C sort
```

Every file is where the layout contract says: the executable, `viewer.cfg`, and `data/` together
inside `Contents/MacOS/`, the pck under `Contents/Resources/`. And the archive is **deterministic** —
re-zipping the unchanged tree yields a byte-identical file:

```bash
shasum -a 256 plant_opt-macos.zip
# c4a34bf65600cb722dcfc9216753e6267d936d30527fcb0da1d7fa520b6da188
# re-zip the same tree (find|sort order + zip -X) → identical sha256:
# c4a34bf65600cb722dcfc9216753e6267d936d30527fcb0da1d7fa520b6da188
```

That determinism (a fixed `find | LC_ALL=C sort` input order plus `zip -X` to drop the platform
extra-field) is what lets a receiver diff two ships and trust that "nothing changed" means nothing
changed.

---

## Step 5 — retarget by ONE line (the payoff)

Here is the whole reason data lives beside the build. A site points the shipped twin at **its** live
source by editing the one line that is the site's to own — `[viewer] url=` — in the `viewer.cfg`
beside the executable. Nothing else. The verbatim one-line diff:

```diff
--- viewer.cfg.before
+++ viewer.cfg   (plant_opt.app/Contents/MacOS/viewer.cfg)
@@ -16,7 +16,7 @@
 model="data/plant_opt.tscn"
 ; Default live data source. The seeded sim (tools/sim/server.js) listens here by default.
-url="ws://localhost:8765"
+url="ws://localhost:8766"
```

Boot the **same binary** — no re-export — and it reads the new config:

```bash
BIN='plant_opt.app/Contents/MacOS/Xenodot Twin Viewer'
stat -f %m "$BIN"                       # mtime BEFORE: 1783779884
"$BIN" --headless -- --quit-after=20
#   viewer: model loaded from data/plant_opt.tscn
#   viewer: bindings resolved 8/8
#   viewer: playback of data/recordings/plant-shift.ndjson (59900 ms)
#   viewer: quit-after 20 frames reached
stat -f %m "$BIN"                       # mtime AFTER:  1783779884  — IDENTICAL
```

The executable's mtime is **`1783779884` before and after** — the config is read fresh at each boot,
nothing was rebuilt. A site repoints `url=` with a text edit; re-export only when the **code** changes.

---

## Step 6 — retarget the DATA files with the tool (`--retarget`)

`url=` is the site's edit. To swap the **model / binding map / recording** of an already-shipped
artifact — the integrator's edit — use `--retarget`, which makes the swap a first-class, **asserted**
capability instead of a hand copy. Here it swaps the optimized `.tscn` for the raw `.glb` (same plant,
both bind 8/8 — this proves the file-swap mechanism):

```bash
tools/twin_ship.sh --retarget dist/plant_opt-macos --model models/plant.glb --json
```

```
twin-ship: PASS retarget — model=data/plant.glb swapped; binary mtime UNCHANGED (1783779884); url= untouched (ws://localhost:8766)
    viewer: model loaded from data/plant.glb
    viewer: bindings resolved 8/8
    viewer: playback of data/recordings/plant-shift.ndjson (59900 ms)
    viewer: quit-after 20 frames reached
twin-ship: PASS retarget smoke — the swapped model booted painted from data/ (same binary)
twin-ship: OK (retarget)
```

It copies the new model into `data/`, rewrites `viewer.cfg`, then **asserts the same-binary invariant**
— the executable's mtime is UNCHANGED (`1783779884`, same as the ship) and `url=` is untouched
(`ws://localhost:8766`, the line I edited by hand above) — and fails loud if either moves. It boots
the same binary as a smoke and, host-matched, that smoke **PASSes**. `--json` writes `retarget.json`
beside the build — a manifest of exactly what a stranger may swap:

```json
{
  "status": "PASS",
  "smoke": "PASS",
  "binary": "Xenodot Twin Viewer",
  "binary_mtime": 1783779884,
  "swappable_without_re_export": {
    "model": "data/plant.glb",
    "binding_map": "data/binding_map.json",
    "recording": "data/recordings/plant-shift.ndjson"
  },
  "deployment_time_edit_by_site": { "url": "ws://localhost:8766" },
  "fixed_requires_re_export": ["the executable / pck (code + starter scenes)"]
}
```

> **The smoke contract — `status` can never out-run the boot.** In `--retarget` mode the smoke is
> `PASS | SKIP | FAIL`, and the manifest is stamped **after** the boot: `status == smoke`. A **PASS**
> writes `status:"PASS"` and exits 0; a **SKIP** (cross-platform, or `--no-smoke`) writes
> `status:"SKIP"`, prints no "OK" line, and exits non-zero — a SKIP is never a pass; a **FAIL** (the
> swapped model does not match the map, bindings 0/N) writes `status:"FAIL"` over any stale green and
> exits 1. The JSON can never claim a pass the boot did not earn.

### The receiver contract — who owns which line

| line / file                               | who owns it        | change without re-export?                                |
| ----------------------------------------- | ------------------ | -------------------------------------------------------- |
| `[viewer] url=`                           | the **site**       | **yes** — a one-line deployment edit (new live source)   |
| `[viewer] model=` + `data/<model>`        | the **integrator** | **yes** — `--retarget --model` (or edit + drop the file) |
| `[twin] binding_map=` + `data/<map>`      | the **integrator** | **yes** — `--retarget --map`                             |
| `[twin] recording=` + `data/recordings/*` | the **integrator** | **yes** — `--retarget --recording`                       |
| the executable / `.pck` (code + scenes)   | the **packager**   | **no** — re-export only (`twin_ship.sh --preset`)        |

---

## Step 7 — the honesty half: loud on a bad swap, loud on a foreign binary

**A bogus `model=` fails LOUD, never blank.** Point `model=` at a `data/` path with no file and boot
the same binary — the receiver who fat-fingers a swap must see it immediately, not ship a twin that
paints nothing:

```
ERROR: Cannot open file '.../data/NOPE.tscn'.
ERROR: Failed loading resource: .../data/NOPE.tscn.
ERROR: viewer: failed to load scene 'data/NOPE.tscn'
viewer: bindings resolved 0/8
```

Loud on the first boot. (The message is the `.tscn` `load()` path's; a bogus raw `.glb` reports
`failed to read model '…' (error 7)` — same contract, both loud.) That negative control is **part of
the contract**, not an edge case: if a missing model could boot blank, "retarget by editing text"
would be a trap.

**A cross-platform build SKIPs loud, never a fake green.** Exporting a non-host preset (Linux, on this
macOS host) assembles and zips fine, but the smoke cannot boot a Linux ELF on macOS, so it **SKIPs**
loudly and still exits 0:

```
twin-ship: PASS export (…/plant_opt.x86_64)
== twin-ship [3/5] assemble (dist/plant_opt-linux) ==
twin-ship: PASS assemble (dist/plant_opt-linux)      # flat layout: viewer.cfg + data/ + README.txt siblings, no bundle
== twin-ship [4/5] smoke ==
twin-ship: SKIP smoke — Linux build cannot run on this Darwin host (a SKIP is
  NOT a pass). Boot it on a Linux machine, or re-run there. To force anyway: --smoke.
```

The Linux ELF is 68 MB (71 075 864 B) — byte-identical to the house tutorial's Linux binary, because
it is the same engine template, model-independent. The assembled artifact is real; only its **boot**
is unverified on this host, and the tool says so instead of faking it. `--smoke` would force the boot
(and fail on the foreign binary — the caller's choice); `--no-smoke` skips. A SKIP is never a green.

---

## Wrinkles I actually hit

- **The dev-tree verify gate hit a toolchain drift; the ship smoke did not.** In this session
  `tools/twin_build.sh`'s verify leg FAILed before shipping — `gdformat` wanted to reformat three
  **framework tool** files (`smoke_binding.gd`, `check_twin_join.gd`, `gate_report.gd`, all pristine
  from HEAD), and `smoke_binding.gd` then threw `Parse Error: Casting "Variant" to "…" is unsafe
(Warning treated as error)` under this Godot's warnings-as-errors. That is a **toolchain drift in the
  dev-tree gate scripts**, not in the twin. I confirmed the twin was green by running the **join gate
  directly** (`check_twin_join.gd` → `JOIN: 18/18 (100.0%)`) and let the **ship's own boot smoke** —
  which runs the _exported_ binary, and the export excludes `tools/*` from the pck — supply the binding
  proof (`bindings resolved 8/8`). The drift can't reach the shipped artifact; the excluded tool
  scripts never enter the pck. If your `twin-verify` leg trips the same drift, run the join gate
  directly and trust the ship smoke, exactly as here.
- **`--retarget` runs from the project root, not the artifact dir.** It borrows the engine to rewrite
  the shipped `viewer.cfg` (comments preserved), so `cd` into the Godot project and pass the artifact
  dir as the argument — running it from inside the artifact FAILs preflight (no `project.godot`).
- **The in-bundle executable is named by `application/config/name`, not the `.app`.** Here that is
  `Xenodot Twin Viewer` (with spaces), so the direct-run command in the shipped `README.txt` is
  single-quoted to paste verbatim. Don't assume it matches the `.app` basename.

---

## Troubleshooting

- **`preflight — no export templates for 4.6.3.stable`.** A host setup step, not a project bug —
  install the ~700 MB templates for the **exact** engine version (Editor → Manage Export Templates).
  `twin_ship.sh` will not fake an export.
- **`preflight — macOS export needs ETC2/ASTC texture compression enabled`.** Add
  `textures/vram_compression/import_etc2_astc=true` under `[rendering]` in `project.godot` (the tool
  prints the exact line). The scaffolded viewer already has it.
- **`preflight — no preset named 'X'`.** The name is the quoted `name=` inside a `[preset.N]` block,
  not the platform. The tool lists the present names when it can't match.
- **`[4/5] smoke` assert MISS (bindings 0/N, no model).** The packaging worked; the **twin** is broken.
  Fix it with `twin-verify` / `twin-bind-data` and re-ship — do not debug it here.
- **`[4/5] smoke` SKIP.** Cross-platform (a SKIP, not a failure) — boot the artifact on its own OS.
- **A Web (WASM) demo does NOT ship through this tool.** Its data rides inside the pck as `res://`
  resources, not beside the build; ship web via `tools/twin_publish_web.sh` (see the
  [twin-ship skill](../../plugin/skills/twin-ship/SKILL.md) → "web builds are NOT this skill").

---

## Where to go deeper

- The operator manual — when to ship vs iterate, per-platform notes, reading each stage's failure:
  the [`twin-ship` skill](../../plugin/skills/twin-ship/SKILL.md).
- The durable rule: [`docs/process/data-beside-build.md`](../process/data-beside-build.md).
- The measured evidence this tutorial reproduces:
  [`twin-ship-2026-07-10.md`](../../plugin/library/findings/twin-ship-2026-07-10.md) (packaging +
  the `model=` swap contract) and
  [`twin-ship-retarget-2026-07-10.md`](../../plugin/library/findings/twin-ship-retarget-2026-07-10.md)
  (the one-line `url=` retarget to a new live source, same binary).
