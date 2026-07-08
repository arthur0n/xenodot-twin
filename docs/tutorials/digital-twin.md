# Digital-twin viewer, from scratch

This is the complete walkthrough that takes an empty folder to a **live, scrubbable digital twin
of a real BIM model** — colored walls driven by streaming telemetry, deterministic playback, and
a green end-to-end gate. Every command and output snippet below was actually run on macOS
(Godot 4.6.3, Node 22, Python 3.12); the wrinkles are the ones a stranger really hits, with the
fix that cleared each.

It uses the bundled **try-it kit** ([`plugin-twin/examples/`](../../plugin-twin/examples/)) — the
sample IFC, an example `binding_map`, and an example `viewer.cfg` — so you don't have to source
any files yourself.

You build two things that sit side by side (the standard framework + project layout):

```
your-workspace/
├── xenodot-forge/      the framework (a clone of this repo)
├── house/              the viewer project the framework scaffolds for you
└── x-shared-assets/    shared-asset library (models/textures), symlinked into the project
```

`x-shared-assets/` is created by scaffolding as a sibling at the workspace root and symlinked
into the project at `res://x-shared-assets/` — it holds assets the project uses but keeps
outside its own tree, so the project stays pure. (This tutorial's model loads from `models/`
instead, so you won't touch it, but the scaffold reports creating it in Step 2.)

The framework never contains twin/game content — it points at an external project (`house/`
here), reads it in place, and the project stays pure. That is why there are two repos.

---

## Prerequisites

- **Claude Code** — the framework is driven by Claude Code + the bundled `xenodot` plugin. You can
  do the whole pipeline by hand from a terminal (this tutorial does), or drive it from the web UI
  and let the agent Hive run the steps (see _Driving it from the web UI_ at the end).
- **Godot 4.x** — 4.6.3 here. Export the path once so every command can find it:
  ```bash
  export GODOT=/Applications/Godot.app/Contents/MacOS/Godot
  ```
- **Node 18+** — 22 here. The framework is plain JS + JSDoc.
- **`uv` + Python 3.12** — only for the IFC import step. `ifcopenshell` ships **no wheel for
  Python 3.14** (the current macOS system Python), so the converter runs in a pinned 3.12 venv.
  `brew install uv python@3.12` covers it.

---

## Step 1 — clone the framework and prove it's green

Clone the framework into `your-workspace/xenodot-forge`:

```bash
cd your-workspace
git clone https://github.com/arthur0n/xenodot-forge.git xenodot-forge
cd xenodot-forge
npm install
```

> Note: the experimental `xenodot-twin` plugin — and this kit — ship in the **twin release**. If
> your clone has no `plugin-twin/` directory, you're on a plain fork; pull the branch/release that
> carries the twin plugin before continuing.

`npm install` pulls ~277 packages (a few seconds on a warm cache, up to a minute cold). Then prove
a stranger's install is green:

```bash
npm run validate   # tsc + eslint (zero warnings) + structure/skills/contamination/library checks
npm test           # unit tests + reducer + skills checks
```

Expected tail of `npm test`:

```
# tests <n>
# pass <n>
# fail 0
```

**Wrinkle worth knowing (now fixed):** a fresh clone should be green out of the box. Earlier
clones could fail `npm run validate` on a stale generated index — e.g.
`plugin/library/verdicts/index.md: stale` — because an older index generator had left a
one-character escaping drift behind. That's been regenerated and committed, so you shouldn't
hit it. If you ever do see a `: stale` line, the error prints the exact fix —
`npm run check:library -- --write` — after which `validate` exits 0.

---

## Step 2 — scaffold the viewer project

From inside the clone, scaffold a **viewer** (the digital-twin flavor) into a sibling folder:

```bash
npm run new -- ../house --viewer
```

This scaffolds `starter-viewer/`, records the project path + type, materializes the plugin's
per-project files, and health-checks. The output confirms the shape:

```
new: scaffolded starter-viewer → .../your-workspace/house
  projectType: viewer
materialize: ... tools copied 22/22, twin tools added 15 (0 collision(s)), library created, library-twin created, x-shared-assets created.
doctor: ... ✓ plugin capabilities (20 agents, 47 skills)  ✓ library-twin/ symlinked
doctor: OK
```

What landed and what stayed put:

- The clone gets its **own** `.xenodot.json` (`projectDir` → `your-workspace/house`,
  `projectType: viewer`). If you also have the framework checked out elsewhere, that other
  `.xenodot.json` is untouched — each checkout remembers its own project.
- `house/tools/` (the twin tooling: `ifc_convert.py`, `sim/`, `verify_twin.sh`, …) and
  `house/library`, `house/library-twin`, `house/x-shared-assets` are **symlinked/copied and
  gitignored** — framework-generated, never committed into the project.
- The framework's agents/skills are **not** copied into the project. The web UI loads the
  `xenodot` plugin automatically. For terminal Claude Code, doctor prints the one-time install:
  ```
  /plugin marketplace add /path/to/your-workspace/xenodot-forge
  /plugin install xenodot@xenodot-forge
  ```
  (Note: the experimental `xenodot-twin` plugin is web-UI-only for now — terminal sessions run
  without the twin skills.)

---

## Step 3 — engine sanity (boot the empty shell)

Before any content, confirm the scaffold boots clean. The viewer with no model draws a lit
placeholder grid:

```bash
cd ../house
$GODOT --headless --path . --quit-after 120
```

Expected: the Godot banner and **nothing else** — zero errors, zero warnings. If you see script
parse errors here, stop and fix them before importing anything.

(A plain game boot like this does **not** build `.godot/global_script_class_cache.cfg` — only an
editor import pass does — so it doesn't pre-empt the `class_name` "not declared" wrinkle. You
don't need to worry about that here: the gate's scene-verify leg self-heals the cache, which is
why Step 7 passes on a fresh project. See Troubleshooting if you hit it running tools by hand.)

---

## Step 4 — the IFC import (real geometry, real join key)

The twin's spine is one invariant: **the IFC GlobalId is the join key everywhere** — the GLB's
node names carry it, the property sidecar is keyed by it, and live tags bind through it.

**Get the model.** Use the sample bundled in the kit — copy it into `house/` (or a `downloads/`
folder at the workspace root):

```bash
cp ../xenodot-forge/plugin-twin/examples/Duplex_A_20110907.ifc .
head -c 13 Duplex_A_20110907.ifc    # must print: ISO-10303-21;
```

That header check matters: the canonical buildingSMART sample URLs are **dead** and serve an HTML
error page that "converts" into garbage. A real IFC (a STEP file) starts with `ISO-10303-21;`. If
you fetch a fresh copy instead of using the bundled one, a working mirror for the Duplex model is
`https://raw.githubusercontent.com/andyward/XBimDemo/master/Xbim.TestApp/Duplex_A_20110907.ifc`
(see [`plugin-twin/examples/NOTICE.md`](../../plugin-twin/examples/NOTICE.md) for provenance).

**Build the Python venv** (pinned to 3.12; `.venv` is gitignored by the starter). Keep it _inside_
`house/` — it's a host build toolchain, not project runtime; Godot never touches Python:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python ifcopenshell==0.8.5
.venv/bin/python -c "import ifcopenshell; print(ifcopenshell.version)"    # → 0.8.5
```

**Convert** IFC → GLB (node names = GlobalIds) + a property sidecar keyed by the same ids:

```bash
.venv/bin/python tools/ifc_convert.py Duplex_A_20110907.ifc \
  --glb models/duplex.glb --sidecar models/duplex_props.json
```

Expected (≈1 second wall-clock for this 2.3 MB model):

```
opened Duplex_A_20110907.ifc schema=IFC2X3
GLB written: models/duplex.glb — 286 shapes in 0.9s
sidecar: models/duplex_props.json — 295 elements in 0.1s
total wall-clock: 1.0s
```

The GLB + sidecar under `models/` are **gitignored** — they're runtime-loaded data
(`GLTFDocument` at runtime, no editor import), rebuilt from the IFC whenever you need them.

---

## Step 5 — the bindings and the viewer config

`binding_map.json` maps home telemetry tags to real IFC elements by their 22-char GlobalId. The
kit ships one ready to use — copy it in:

```bash
cp ../xenodot-forge/plugin-twin/examples/binding_map.example.json binding_map.json
cp ../xenodot-forge/plugin-twin/examples/viewer.cfg.example viewer.cfg
```

The example ids are for **this** IFC and are deterministic across converts of the same file, so
they work as-is. For any _other_ model, re-derive them from the sidecar you just generated, and
**verify** before authoring — never trust ids copied from another model:

```bash
node -e 'const s=require("./models/duplex_props.json"); const id="2O2Fr$t4X7Zf8NOew3FNqI"; console.log(s[id]?.ifc_class, "|", s[id]?.name)'
# → IfcWallStandardCase | Basic Wall:Exterior - Brick on Block:138157
```

This project's story is six bindings — a compact smart home:

- `living_room.temp`, `kitchen.temp`, `bedroom_1.temp` — each zone's temperature (18–30 °C) painted
  on its exterior brick wall, cold blue `#1e63ff` → warm red `#ff2f2f`. Together they read as a
  whole-house heat map from outside.
- `boiler.temp` — 40–80 °C on the foundation wall by the utility area (hotter range, same ramp).
- `solar.output_w` — rooftop PV output 0–5000 W on the flat roof slab, dark slate `#14142a` →
  bright amber `#ffcf3f`.
- `entrance_door.open` — open state (0–1) as a floating label above the door, green `#37d67a`
  when closed, red `#ff5252` when open.

Each row is `{tag, globalid, min, max, response, ramp, …}` where `response` is `albedo_ramp`
(paint the element) or `label` (float a status label). The file is self-documenting — its
`_about` key and each row's `ifc`/`note` keys explain every value — and the sim derives its tag
list and each tag's range **from this file**, so data and geometry can never drift.

`viewer.cfg` (Godot INI) ties it together. The important bits:

```ini
[viewer]
model="res://models/duplex.glb"
url="ws://localhost:8765"     ; the sim listens here by default

[twin]
binding_map="binding_map.json"
frame_budget_ms=16.7          ; the 60 fps floor the gate checks (1000/60)
; recording= is left UNSET so a plain boot is LIVE
```

---

## Step 6 — record a deterministic fixture

The data source is `tools/sim/server.js` (a seeded WebSocket sim). For scrubbable playback you
synthesize a fixture from the same generator — no network, byte-reproducible per (seed, seconds,
hz):

```bash
mkdir -p recordings
node tools/sim/record.js --out recordings/house-day.ndjson --seconds 60 --map binding_map.json
```

Expected:

```
record: wrote recordings/house-day.ndjson — frames=3600 duration_ms=59900 tags=6 sha256=361bc6e...
```

`recordings/` is **committed** (unlike `models/`) — the fixture is repo content.

---

## Step 7 — the gate

`tools/verify_twin.sh` is the whole-pipeline gate. Run it with `GODOT` exported. From a session
with a **real display** add `TWIN_BENCH=1` to run the windowed frame-budget leg too:

```bash
TWIN_BENCH=1 tools/verify_twin.sh
```

The legs and what green looks like:

```
verify-twin: PASS format / lint / parse / scenes / scene-errors / smoke   (the static floor)
JOIN: 286/286 (100.0%)
verify-twin: PASS join-coverage (models/duplex.glb vs models/duplex_props.json)
BIND-SMOKE: OK — 6 node target(s), 0 mmi target(s), 90 frames, 0 drops
verify-twin: PASS binding-smoke (binding_map.json @ seed 42, ws://localhost:8899)
verify-twin: PASS playback-determinism (PLAYBACK-HASH: 9e75d12…, seeks=966,1933, --fixed-fps 60)
BENCH: {"fps":1122.3,"frame_ms":0.89,"draw_calls":1028,...}
verify-twin: PASS frame-budget (frame_ms=0.89 <= budget 16.7ms)
verify-twin: OK
```

Notes:

- **join 286/286 (100%)** — every mesh node matched a sidecar key. A low ratio means the GLB was
  built without `use-element-guids`, or GLB and sidecar came from different conversions.
- **BIND-SMOKE** drives the real viewer headless: seeded sim → DataBus → binding → moving albedo.
  It reports `driven=5 … moved=5` for six bindings because one (the door) is a **label**, not a
  paint — that's correct, not a miss.
- Without `TWIN_BENCH=1` (or in headless CI) the frame-budget leg **SKIPs loudly** — a SKIP is not
  a pass. It needs a real window to measure honest frames.

---

## Step 8 — see it

**Live.** Two moves — start the sim, launch the viewer (it connects to `ws://localhost:8765` by
default and paints):

```bash
node tools/sim/server.js --map binding_map.json &      # terminal 1
$GODOT --path .                                         # terminal 2
```

The duplex loads, the HUD reads **LIVE** (green), and the walls paint into a heat map — cool
bedrooms blue, warm living/kitchen red, the solar roof teal, a floating door label. Stop the sim
and the HUD goes **OFFLINE** (red); restart it and the viewer reconnects on its own.

**Playback** (no sim needed) — pass the recording on the command line:

```bash
$GODOT --path . -- --recording=recordings/house-day.ndjson
```

The HUD turns amber **PLAYBACK**, a timeline bar appears at the bottom, and the fixture plays
through the _same_ binding runtime live data uses.

**Controls:**

- `Tab` — toggle the camera between **ORBIT** (left-drag rotate, wheel zoom) and **FLY** (mouse
  look, WASD move, Q/E down/up, Shift faster, Esc back to orbit). Fly inside for interior detail.
- `Space` — play/pause (only while the timeline bar is visible, i.e. in playback).
- Timeline bar — drag the slider to scrub; the speed button cycles 0.25× / 0.5× / 1× / 2× / 4×.

---

## Driving it from the web UI

Instead of running the steps by hand you can let the agent Hive do them. From the clone, launch
the server **detached** with the bundled launcher (it writes a PID + log under `.xenodot-run/`
and keeps running after you close the terminal):

```bash
./start_server                # serves the web UI on :8338, loads the xenodot plugin automatically
# ...
./stop_server                 # stops it (reads .xenodot-run/ui.pid)
```

Open **http://localhost:8338**. Watch the boot with `tail -f .xenodot-run/ui.log` — it prints the
URL and the project it's pointed at.

> **Sharp edge — the default port auto-reclaims.** `./start_server` on the default port first
> `lsof`s whoever is listening on **8338** and **kills it** before starting, so it always comes up
> fresh. That's convenient solo, but brutal if you already have another framework session serving
> on 8338 — it will silently take that session down. On any machine that might already be running
> the framework, **always start on a free port**:
>
> ```bash
> PORT=8339 ./start_server     # picks 8339; only reclaims 8339, never touches 8338
> ```
>
> A given `PORT` only reclaims that same port, so a distinct port is safe.

Then talk to the Hive in plain language, for example:

- _"Import this IFC into the viewer: `Duplex_A_20110907.ifc` — convert it, verify the GlobalId
  join, and load it at runtime."_ → runs the twin-import pipeline (Step 4).
- _"Bind living-room, kitchen and bedroom temperatures, the boiler, the solar roof and the front
  door to real elements, then author `viewer.cfg`."_ → the binding work (Step 5).
- _"Record a 60-second fixture and run the twin gate."_ → Steps 6–7.

The web UI relays a real data source into the viewer through the framework's `/twin-data` relay;
for this demo the "real source" is the seeded sim, so start
`node tools/sim/server.js --map binding_map.json` first and the frames fan out to the browser.

**Switching back to a game.** The forge points at one project at a time via `.xenodot.json`. To go
back to a normal (non-viewer) game, re-point it — `npm run new -- ../game` for a fresh scaffold, or
`npm run doctor -- ../game` to re-wire an existing one — and the web UI serves that game with the
plain `xenodot` plugin (no twin skills). Each command takes the path as `--game`-style argument, so
nothing is destroyed by switching.

---

## Wrinkles I actually hit (and the fix for each)

- **Fresh-clone `validate` used to fail on a stale library index (now fixed).** `npm run validate`
  once reported `plugin/library/verdicts/index.md: stale` — a one-char escaping drift an older
  index generator had left behind. It's been regenerated and committed, so current clones are
  green. If you ever see a `: stale` line again, the error prints the fix:
  `npm run check:library -- --write`, then re-run `validate` (exits 0).
- **User flags need the `--` separator.** Everything after a bare `--` is passed to the game;
  before it, Godot eats unknown flags silently. So `$GODOT --path . --screenshot=x.png` is a
  no-op (the engine swallows `--screenshot`), while `$GODOT --path . -- --screenshot=<abs path>`
  actually reaches the viewer. Same for `--recording=`. Use an **absolute** path for the shot.
- **`--screenshot` fires too fast for live data.** The built-in `-- --screenshot=<abs path>`
  captures after ~12 frames (~0.2 s) — faster than a WebSocket connect + the first 10 Hz frame, so an
  automated live shot can catch the walls still grey (`tags: 0 | waiting for data`). For a
  data-painted capture, let the stream flow first (a live window a human screenshots), or lengthen
  the settle. Playback shots don't have this problem — the data is local and paints immediately.
- **Default camera frames the gable end.** The auto-frame points the camera at the model with a
  fixed yaw/pitch, which on this model looks slightly top-down at a short wall — the heat-mapped
  long facade reads as grey until you **orbit** (left-drag) ~90° to face it. See Troubleshooting.
- **Class-cache "not declared" on a virgin project** (see Troubleshooting) — the gate self-heals
  it, so the pipeline is fine; it only bites if you run the optimizer by hand before any editor
  import pass.

---

## Troubleshooting

- **HUD says OFFLINE (red).** The sim isn't running. Start it:
  `node tools/sim/server.js --map binding_map.json`. The viewer reconnects on its own once it's up.
- **Grey walls, no heat map.** Either no data has arrived yet (give the live stream a second), or
  the camera is looking at a wall edge-on / at the gable end. **Left-drag to orbit** ~90° to face
  the long facade — the temperature walls light up. `Tab` into FLY mode to move around freely.
- **`Parse Error: Identifier "TwinHints"/"TwinChunks" not declared`** when running the optimizer
  (`tools/optimize_scene.gd`) on a brand-new project. Godot's global `class_name` registry
  (`.godot/global_script_class_cache.cfg`) isn't populated until an import pass runs. Fix with one
  pass, then re-run:
  ```bash
  $GODOT --headless --editor --quit --path .
  ```
  Note a plain game boot (Step 3) does **not** build this cache — only an editor pass like the one
  above does. You don't need to run it for the pipeline: the gate's scene-verify leg self-heals the
  cache, which is why Step 7 passes on a fresh project. It's a known follow-up that the tools
  ideally wouldn't need.
- **`pip install ifcopenshell` → no matching distribution.** Your Python is too new (3.14 has no
  wheel). Use the 3.12 venv: `uv venv --python 3.12 .venv && uv pip install --python
.venv/bin/python ifcopenshell==0.8.5`.
- **Downloaded IFC won't open / parses as garbage.** A dead sample URL served HTML. Check
  `head -c 13 model.ifc` — it must be `ISO-10303-21;`. Use the bundled kit copy, or the XBimDemo
  raw.githubusercontent.com mirror.
- **`./start_server` took down my other session.** On the default port, `./start_server` reclaims
  8338 by killing whatever is listening there first — so if you already had a framework session on
  8338, it's gone. On a machine that might already be serving, start on a free port instead:
  `PORT=8339 ./start_server` (a given `PORT` only ever reclaims that same port). Stop with
  `./stop_server`.
- **A user flag (`--screenshot=`, `--recording=`) is silently ignored.** You forgot the `--`
  separator. Godot eats unknown engine flags without complaint; anything meant for the game must
  come after a bare `--`: `$GODOT --path . -- --recording=<file>`.
- **Frame-budget leg SKIPs.** That's expected in a headless/CI context — it needs a real display.
  Re-run from a desktop session with `TWIN_BENCH=1 tools/verify_twin.sh`.

---

## Committing the project

The `house/` project is its own repo — init and commit it (models/, `.venv`, and the
framework-generated `tools/`+`library*` symlinks are already gitignored, so only real project
content is tracked):

```bash
cd house
git init
git add -A
git commit -m "feat(house): smart-home digital-twin viewer over Duplex_A"
```
