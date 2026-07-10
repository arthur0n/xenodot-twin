---
type: finding
title: "Web WASM fps ceiling — no-threads embeds in Grafana at the display cap, full recipe (Chrome-measured; Safari unverified)"
description: "The browser WASM fps ceiling for the twin's Godot web export, measured 12/12 in Chrome 150 (2 builds x 3 scenes x 2 vantages, live-bound, 0 drops) against a pre-declared >=30 fps floor: PASS by ~4x (no-threads duplex street 120 fps display-capped, cpu 0.58 ms). thread_support buys ZERO rendering fps (Godot 4's web renderer is single-threaded) so the embeddable no-threads variant costs nothing; it BOOTS fully live-bound inside a real Grafana text/HTML-panel iframe at 120 fps while the threads variant is dead on arrival there (no SharedArrayBuffer — Grafana serves no COEP, verbatim console). The ceiling shows only on the many-unique-mesh worst case (28,600 individual meshes) at ~17 fps aerial, ~10x native CPU render time. Outcome: FULL GRAFANA RECIPE (no-threads). One machine, M3 Pro, Godot 4.6.3, Chrome 150; Safari BLOCKED (three TCC barriers) — unverified, not a result."
timestamp: 2026-07-10T02:30:00+01:00
tags:
  [
    web-export,
    wasm,
    grafana,
    embed,
    threads,
    no-threads,
    crossorigin-isolation,
    coop-coep,
    sharedarraybuffer,
    browser-fps,
    ceiling,
    metal,
    macos,
    safari-blocked,
  ]
---

# Web WASM fps ceiling — no-threads embeds in Grafana at the display cap

Roadmap Nice-to-Have #6 (web/Grafana embed). OpenTwins proved the pattern (a Unity WebGL scene
embedded in Grafana with live push-down); our Godot web export BOOTS (~38–40 MB) but browser fps was
never measured. This is that measurement, then the outcome it selects. **Outcome: FULL GRAFANA
RECIPE (no-threads embeddable variant)** — the plan's first outcome.

## Pre-declared usability floor (named BEFORE measuring, per the plan)

**The embeddable (no-threads) variant is "usable" iff it holds ≥30 fps at the street vantage on the
optimized duplex with live binding active.** City scenes inform scale guidance but do not gate.

**Verdict up front: PASS — decisively, by ~4×** (no-threads / duplex / street, live-bound: 120.0 fps
display-capped, cpu 0.58 ms). The full evidence follows; the floor is Chrome-only and stated as such
(Safari is unverified on this machine — see the blocked-Safari section).

## Evidence provenance

SEAT-local Phase 1 spike, nothing there lands in the framework: seat commit **`b105cc9`**,
`twindemo/twin-spikes/web-ceiling/` — `NOTES.md` (the full tables + verbatim Grafana console), the
`viewer/` spike project (`web_bench.gd` overlay + the real `core/data_bus.gd` + `core/binding_map.gd`
runtime + three scenes + both export presets), `serve.py` (the COI server this finding's `serve_coi`
tool promotes), `driver/chrome_bench.mjs` + `driver/chrome_console.mjs` (headed-Chrome CDP scrapers),
`results/chrome_raw.jsonl` + `results/chrome_summary.json`, and both provisioned Grafana dashboards +
their scraped console logs. Every number below is transcribed from that `NOTES.md`.

## Machine / methodology / caveats

- Apple M3 Pro, macOS (Darwin 25.5), **120 Hz ProMotion** display. ONE machine.
- Godot **4.6.3.stable** (`/Applications/Godot.app`), web export templates 4.6.3.stable installed.
- Browsers: **Chrome 150.0.7871.49** (measured), **Safari 26.5.2** (BLOCKED — see below). Firefox not
  installed (opportunistic only; not attempted).
- Chrome driven HEADED via the DevTools Protocol so the GPU is real: every run's `webgl_renderer`
  reads **"ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)"** — NOT SwiftShader. The web driver is
  `opengl3` (Godot's **Compatibility / WebGL2** backend); the native reference is **Metal /
  Forward+**. This backend gap (WebGL2 Compatibility vs Metal Forward+) is inherent to Godot web
  export and is the headline reason web ≠ native.
- **vsync / cap discipline (carried from native):** browsers present via `requestAnimationFrame`,
  which caps at the display refresh (120 Hz). So `fps` saturates at 120 and `frame_ms` floors at
  8.33 ms on any scene the GPU can keep up with — `fps` alone cannot differentiate light scenes. The
  sub-cap differentiator is **`cpu_ms`** (viewport CPU render time). `gpu_ms` reads **0.0** on both
  the Metal desktop and the WebGL2 web backend here (Godot's viewport GPU timer is unimplemented/zero
  on these backends), so `cpu_ms` + `frame_ms` carry the sub-cap signal.
- Warmup 3 s / measure 8 s per run. **Live binding ACTIVE every run:** a DataBus autoload connects to
  the seeded sim (`ws://localhost:8765`, 6 tags, 10 Hz), and the real `binding_map.gd` runtime
  resolves + drives albedo/label writes per frame — this is fps _with binding active_, not a static
  spin.

## Matrix — Chrome 150, headed, real GPU (ANGLE Metal / WebGL2 Compatibility)

2 builds × 3 scenes × 2 vantages = **12/12 cells run**. `bind` = bindings resolved, `busRx` = live
frames received in the window, `drop` = dropped frames, `heap` = JS heap used (MB). Scenes: `duplex`
(optimized single BIM building, 261 nodes), `city` (c2-optimized 10×10, instanced ~1.3k objects — the
"natively at the cap" case), `ucity` (28,600 individual meshes, no instancing — the added heavy
GPU-stress case that actually breaks the frame-time cap so the ceiling has a measurable point).

| build     | scene  | vantage | fps   | frame_ms | cpu_ms | objects | draws  | prims     | bind | busRx | drop | load_ms | heap |
| --------- | ------ | ------- | ----- | -------- | ------ | ------- | ------ | --------- | ---- | ----- | ---- | ------- | ---- |
| nothreads | duplex | street  | 120.0 | 8.33     | 0.58   | 345     | 302    | 27,828    | 6/6  | 654   | 0    | 733     | 10.3 |
| nothreads | duplex | aerial  | 120.0 | 8.33     | 0.58   | 345     | 302    | 27,828    | 6/6  | 654   | 0    | 726     | 10.3 |
| nothreads | city   | street  | 120.0 | 8.33     | 1.07   | 594     | 534    | 1,389,408 | 6/6  | 654   | 0    | 773     | 17.6 |
| nothreads | city   | aerial  | 120.0 | 8.33     | 1.86   | 1,284   | 1,164  | 2,782,800 | 6/6  | 654   | 0    | 779     | 19.5 |
| nothreads | ucity  | street  | 60.8  | 16.45    | 9.97   | 11,869  | 10,195 | 806,204   | 6/6  | 660   | 0    | 918     | 16.2 |
| nothreads | ucity  | aerial  | 17.9  | 56.00    | 40.27  | 40,700  | 35,000 | 2,782,800 | 6/6  | 655   | 0    | 954     | 16.2 |
| threads   | duplex | street  | 120.0 | 8.33     | 0.71   | 345     | 302    | 27,828    | 6/6  | 648   | 0    | 771     | 10.6 |
| threads   | duplex | aerial  | 120.0 | 8.33     | 0.71   | 345     | 302    | 27,828    | 6/6  | 654   | 0    | 758     | 10.6 |
| threads   | city   | street  | 120.1 | 8.33     | 1.20   | 594     | 534    | 1,389,408 | 6/6  | 654   | 0    | 824     | 15.6 |
| threads   | city   | aerial  | 120.0 | 8.33     | 2.20   | 1,284   | 1,164  | 2,782,800 | 6/6  | 654   | 0    | 826     | 20.0 |
| threads   | ucity  | street  | 60.1  | 16.64    | 10.53  | 11,869  | 10,195 | 806,204   | 6/6  | 661   | 0    | 979     | 20.1 |
| threads   | ucity  | aerial  | 16.7  | 60.01    | 43.58  | 40,700  | 35,000 | 2,782,800 | 6/6  | 661   | 0    | 985     | 17.6 |

Live binding held on **every** cell: 6/6 bindings resolved, ~648–661 frames received in the window,
**0 drops** across all 12 runs (6/6 live-bound cells per the plan, actually 12/12 here).

## Floor verdict (Chrome)

**PASS — decisively.** No-threads / duplex / street, live-bound: **120.0 fps** (display-capped),
frame_ms 8.33, **cpu_ms 0.58**, bindings 6/6, 654 live frames received, 0 drops. The ≥30 fps floor is
cleared by ~4×, and the 0.58 ms CPU cost sits ~14× under the 8.33 ms display budget — the duplex does
not stress the browser at all.

## Threads vs no-threads — no delta

**None beyond run-to-run noise, at every cell.** ucity aerial 16.7 (threads) vs 17.9 (no-threads)
fps, cpu 43.6 vs 40.3 ms; duplex 0.71 vs 0.58 ms. Godot 4's web renderer runs the render loop
single-threaded regardless of `thread_support`, so `thread_support=true` buys **no rendering fps** for
these scenes — it only adds SharedArrayBuffer, which forces cross-origin-isolation headers and kills
Grafana embedding (below). **The embeddable no-threads variant costs nothing in fps** — nothing is
sacrificed by shipping it as the primary recipe.

## The ceiling — native vs web (the scale caveat)

Duplex and the instanced c2-city peg the 120 Hz cap on both variants (cpu 0.6–2.2 ms) — the browser
is not the bottleneck for realistic single-building / instanced-city twins on this GPU. The ceiling
appears only on the **many-unique-mesh worst case** (ucity, 28,600 individual meshes):

| scene / vantage                  | native cpu_ms\* | native fps\*   | web cpu_ms | web fps | penalty           |
| -------------------------------- | --------------- | -------------- | ---------- | ------- | ----------------- |
| ucity / street (11.9k obj drawn) | ~0.99           | (capped/high)  | ~10.0–10.5 | ~60     | ~10× cpu          |
| ucity / aerial (40.7k obj drawn) | ~4.13           | 163 (uncapped) | ~40–44     | ~17     | ~10× cpu, ~9× fps |

\*native numbers from `twin-spikes/vis-range-sweep/NOTES.md` (ucity "off", same coordinates, Metal /
Forward+, uncapped session). The WASM + WebGL2-Compatibility path costs **~10× the native CPU render
time**; on a heavy heterogeneous scene that drops aerial from a comfortable native rate to ~17 fps.
This scopes the recipe: **instance / optimize heavy scenes before shipping to web** — instanced /
c2-style cities at ~1.3k objects hold the cap; many-unique-mesh scenes need the optimizer first (see
`twin-optimize`, and the `--vis-ranges` scoped win in
`twin-vis-range-recipe-2026-07-09.md`, which targets exactly this many-unique-mesh regime).

## Load / transfer size / memory

| build     | wasm    | pck (3 scenes) | js      | total core  | load→1st frame (Chrome) | JS heap (duplex) |
| --------- | ------- | -------------- | ------- | ----------- | ----------------------- | ---------------- |
| threads   | 35.3 MB | 4.5 MB         | 0.35 MB | **40.1 MB** | ~0.77 s                 | 10.6 MB          |
| nothreads | 36.0 MB | 4.5 MB         | 0.32 MB | **40.7 MB** | ~0.73 s                 | 10.3 MB          |

The pck carries all THREE test scenes (duplex 0.45 + city 2.5 + ucity 1.7 MB); a single-scene deploy
pck ≈ 0.45 MB → **~38 MB total**, matching the Phase-0 boot spike. JS heap stays modest (10–20 MB;
ucity ~16–20 MB). Load-to-first-frame < 1 s on localhost (wasm compile dominates; network transfer of
~38–40 MB is the real-world variable, **not measured here — localhost only**).

## Grafana iframe attempts (local Grafana OSS 13.0.2, docker) — BOTH recorded

Grafana run: `docker run -p 3001:3000 -e GF_PANELS_DISABLE_SANITIZE_HTML=true
-e GF_AUTH_ANONYMOUS_ENABLED=true -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin grafana/grafana-oss`. Two
dashboards provisioned via API, each a text/HTML panel embedding one variant's `<iframe>`
(`?scene=duplex&vantage=street`). Loaded in Chrome, iframe console auto-attached and scraped.

- **threads-in-Grafana → DOA (as predicted).** Godot's own boot check throws, console verbatim:

  > `The following features required to run Godot projects on the Web are missing:`
  > `Cross-Origin Isolation - Check that the web server configuration sends the correct headers.`
  > `SharedArrayBuffer - Check that the web server configuration sends the correct headers.`

  Grafana's top-level document is not `crossOriginIsolated` (it serves no COEP), so the iframe never
  gets SharedArrayBuffer regardless of the build's own COI headers. Empirically confirms the
  spec-reading: a threads build cannot embed in Grafana.

- **no-threads-in-Grafana → BOOTS, fully live.** BENCH line emitted from inside the Grafana iframe:
  **120 fps, cpu 0.6 ms, bindings 6/6, 654 live frames received, 0 drops.** The OpenTwins-equivalent
  in-iframe embed works at the display cap with live data flowing.

## Safari — BLOCKED (recorded, not faked)

Safari measurement is blocked by THREE independent non-interactive barriers, none grantable to an
automated shell:

1. **AppleScript automation** (`osascript` set-URL / activate) → `AppleEvent timed out (-1712)` — the
   Automation TCC permission for controlling Safari is not granted.
2. **`screencapture`** (the screenshot-read fallback for the on-screen BENCH text) → returns an
   **all-black frame** — the Screen Recording TCC permission is not granted to the process. A control
   capture of the plain desktop was also black, confirming it is the permission, not Safari.
3. **safaridriver WebDriver** — the daemon starts and answers `/status`, but session creation returns
   _"You must enable 'Allow remote automation' in the Developer section of Safari Settings"_ — an
   interactive Safari Develop setting (and `safaridriver --enable` needs sudo).

All three require GUI/admin interaction. Safari (the SAB/WASM worst case and the browser a stakeholder
will open) is therefore **UNVERIFIED on this machine** — a stated caveat, NOT a result. Do not read
this finding as "works in Safari"; it says nothing about Safari either way. Re-measure on a machine
with the three TCC permissions granted.

## Verdict — FULL GRAFANA RECIPE (no-threads variant)

The pre-declared floor passes by ~4× (no-threads duplex street live-bound = 120 fps capped, 0.58 ms
cpu), the no-threads build boots and runs fully live-bound **inside a real Grafana text/HTML-panel
iframe** at the 120 Hz cap, and `thread_support` offers **zero fps advantage** — so nothing is
sacrificed by shipping the embeddable variant as the primary recipe. Two caveats bound it, written
into the Phase-3 docs from these numbers:

1. **Scale ceiling** — heavy many-unique-mesh scenes (28.6k individual meshes) fall to ~17 fps at
   aerial at ~10× the native CPU cost. The recipe ships with "instance/optimize heavy scenes;
   instanced/c2-style cities at ~1.3k objects hold the cap."
2. **Safari is unverified here** — the recipe states Chrome-measured numbers and flags Safari as
   untested pending a machine with the TCC permissions.

The threads variant remains the documented companion-tab / own-domain-with-COI path for anyone who
wants it, but it is not required and gains nothing on fps.

## Caveats

- **One machine** (Apple M3 Pro, Metal / Forward+, macOS Darwin 25.5, 120 Hz ProMotion, Godot 4.6.3),
  **Chrome 150 only** — Safari and Firefox not measured. The exact numbers are this machine + this
  browser; re-measure on target hardware/browsers before promising a budget.
- **fps was display-capped** at 120 Hz on every light cell; `cpu_ms` is the sub-cap differentiator
  (same discipline as the native benches). `gpu_ms` reads 0.0 (unimplemented on these backends).
- **Network transfer not measured** — load-to-first-frame is localhost only (wasm compile dominates);
  a real ~38–40 MB download over the wire is the untested real-world variable.
- The **ucity** many-unique-mesh scene is a synthetic stand-in (uniqueness via a `--min-instances`
  threshold trick, not genuinely distinct geometry) — honest about mesh _count_ and draw behavior; a
  real heterogeneous-plant scene should confirm the ceiling numbers.
