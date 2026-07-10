---
type: finding
title: "Twin as a Grafana iframe panel — the OpenTwins pattern on an open engine, confirmed live (Chrome; Safari unverified)"
description: "An already-hosted xenodot-twin web demo (the buildingSMART Duplex_A BIM sample) embedded as a live 3D panel inside a real local Grafana OSS 11.6.1, confirmed painting in a real browser: the no-threads Godot/WASM build boots live-bound at 120 fps with 6/6 bindings resolved INSIDE the Grafana text/HTML panel, no COI/SharedArrayBuffer error, no mixed-content block. The embed <iframe> is now EMITTED by twin_publish_web.sh (embed.html beside every built demo; --emit-embed-only regenerates it), so an operator drops the twin into a dashboard without hand-authoring it. Includes the re-cited web-ceiling number (Chrome PASS by ~4x; Safari still BLOCKED, open-items #3) and a fair OpenTwins side-by-side that names what OpenTwins does that this does NOT: bidirectional click-through and a full push-down data/orchestration stack. One machine, M3 Pro, Metal, shadows off, Chrome 150, Godot 4.6.3.stable."
timestamp: 2026-07-10T20:10:00+01:00
tags:
  [
    grafana,
    embed,
    iframe,
    opentwins,
    positioning,
    web-export,
    wasm,
    no-threads,
    godot,
    unity,
    fair-comparison,
    safari-blocked,
    metal,
    macos,
  ]
---

# Twin as a Grafana iframe panel — the OpenTwins pattern on an open engine

Roadmap item 8, unit 4 (the POSITIONING unit). OpenTwins is the acknowledged blueprint: it embeds a
Unity WebGL scene in Grafana as a live 3D panel with value push-down and bidirectional click-through
([Computers in Industry 2023](https://www.sciencedirect.com/science/article/pii/S0166361523001574);
`docs/research/landscape-2026-07.md`). This unit stands the framework directly against that pattern —
an EXISTING hosted xenodot-twin build embedded in a real local Grafana, confirmed painting in a real
browser — and states, fairly, what OpenTwins does that this does not.

## What was confirmed (real browser, this run)

Confirmed with `plugin-twin/tools/web/twin_evidence.js` (headed Chrome over the DevTools Protocol,
auto-attaching to the child iframe so the embedded build's console is captured too). Evidence:
`docs/handoff/evidence/grafana-embed-2026-07-10/` (local-only; screenshots + verbatim console logs).

1. **Hosted build reachable (step 1).** `https://arthur0n.github.io/xenodot-twin-demos/duplex/`
   loaded in Chrome 150. Iframe/page console verbatim:

   ```
   viewer: model loaded from res://models/Duplex_A_20110907_opt.tscn
   viewer: bindings resolved 6/6
   viewer: playback of res://recordings/duplex-day.ndjson (39900 ms)
   ```

   HUD painted: `DataBus: PLAYBACK (recording)`, `tags: 6`, `fps: 120`, `bindings: 6/6 resolved`.

2. **Local Grafana OSS 11.6.1 (step 2)** — brought up **user-space** (no sudo, no Docker: the daemon
   was down; the official standalone tarball unpacked into a scratch dir) on `localhost:3001` with the
   exact flags the web-ceiling finding validated:
   `GF_PANELS_DISABLE_SANITIZE_HTML=true GF_AUTH_ANONYMOUS_ENABLED=true GF_AUTH_ANONYMOUS_ORG_ROLE=Admin`.
   Health `{"database":"ok","version":"11.6.1"}`.

3. **Twin painting inside the Grafana panel (step 3).** A text panel in HTML mode carrying the
   tool-emitted `<iframe>` (below). Captured from **inside the Grafana iframe**, verbatim:

   ```
   Godot Engine v4.6.3.stable.official - https://godotengine.org
   OpenGL API OpenGL ES 3.0 (WebGL 2.0) - Compatibility
   viewer: model loaded from res://models/Duplex_A_20110907_opt.tscn
   viewer: bindings resolved 6/6
   viewer: playback of res://recordings/duplex-day.ndjson (39900 ms)
   ```

   Panel HUD painted: `DataBus: PLAYBACK (recording)`, `tags: 6 | entrance_door.open=0.890 seq=240`,
   `fps: 120`, `bindings: 6/6 resolved`, timeline `0:23 / 0:39`. **No COI / SharedArrayBuffer error, no
   mixed-content block.** (The only un-allowlisted console errors were Grafana's OWN internal
   plugin-preload 404s — `grafana-lokiexplore-app` — not the twin, and not isolation/mixed-content.)

The `<iframe>` was produced by the tool, not hand-authored:

```html
<iframe
  src="https://arthur0n.github.io/xenodot-twin-demos/duplex/index.html"
  width="1000"
  height="640"
  style="border:0"
  title="duplex digital twin"
></iframe>
```

An https hosted demo embeds cleanly because the baked build carries `url=""` (live source OFF) — there
is no live socket, so the `https`/`wss` mixed-content rule does not bite for a hosted playback demo.

## Web-ceiling number, re-cited (NOT re-measured)

From `plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md` (do not re-run the Chrome matrix):

- **Chrome verdict: PASS by ~4×.** No-threads / duplex / street, live-bound: **120.0 fps**
  (display-capped), frame_ms 8.33, **cpu_ms 0.58**, bindings 6/6, 654 live frames, 0 drops — against a
  pre-declared ≥30 fps floor. `thread_support` buys **zero** rendering fps (Godot 4's web renderer is
  single-threaded), so the embeddable no-threads variant sacrifices nothing.
- **Threads variant is dead on arrival in Grafana** — it needs SharedArrayBuffer, which needs
  cross-origin isolation on the TOP document; Grafana serves no COEP, so the iframe never gets SAB.
  This unit's live run re-confirms the flip side: the **no-threads** build boots fully live-bound in the
  Grafana panel (120 fps, 6/6, 0 drops) on Grafana 11.6.1, as it did on the finding's 13.0.2.
- **Scale ceiling:** many-unique-mesh worst case (28,600 individual meshes) falls to ~17 fps aerial
  (~10× native CPU cost, WebGL2 Compatibility vs Metal Forward+); instance/optimize heavy scenes first.
- **Safari: BLOCKED — UNVERIFIED, not a result** (open-items #3). Three macOS TCC barriers (Automation
  TCC, Screen Recording TCC, safaridriver remote-automation toggle) need GUI/admin grants not available
  to a shell. This finding says nothing about Safari either way; re-measure on a machine with the grants.

## Fair side-by-side — OpenTwins vs xenodot-twin

Same pattern (a 3D scene as a live Grafana panel); different engine and stack. Stated fairly per the
permanent copy bans (`docs/research/landscape-2026-07.md`): visualization not simulation; Godot, **not**
"Unity is the hobby default" (refuted); **no** Cesium-Godot gap pitch (refuted).

| Capability                                                 | OpenTwins                                                                       | xenodot-twin                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3D engine                                                  | Unity WebGL — proprietary, closed-source engine runtime                         | Godot 4.6.3 — MIT, fully open engine                                                                                                              |
| Licensing of the 3D layer                                  | depends on proprietary Unity                                                    | MIT end to end                                                                                                                                    |
| Grafana embed                                              | Unity WebGL scene in a Grafana panel                                            | Godot WASM (no-threads) in a Grafana text/HTML panel — measured 120 fps, 6/6 bindings, 0 drops (this run)                                         |
| Live value push-down                                       | **YES** — values pushed into the scene live                                     | via the `sourceUrl` WebSocket relay seam for a real deployment; hosted demos replay a baked recording (`url=""`, live-source OFF by construction) |
| **Bidirectional click-through (write-back to the source)** | **YES** — click a scene element, write back to the twin/source                  | **NO** — read-only visualization today                                                                                                            |
| Data / orchestration stack                                 | **full push-down stack** — MQTT, Kafka, Eclipse Ditto, Eclipse Hono, Kubernetes | WebSocket-in / WebSocket-out relay + optional one-dependency MQTT→WS bridge; **no** Ditto / Hono / Kafka / Kubernetes tail                        |
| Scope                                                      | twin platform (device mgmt, AI model integration)                               | digital-twin **visualization** + live data + history playback — **not** physics/process simulation                                                |

**What OpenTwins does that this does NOT (named, in OpenTwins' favor):**

1. **Bidirectional click-through / write-back** — OpenTwins lets an operator act on the source from the
   scene; this framework is read-only visualization today. Not on the roadmap as claimed.
2. **A full push-down data-and-orchestration stack** — Ditto/Hono/Kafka/Kubernetes device-to-dashboard
   plumbing OpenTwins ships; this framework deliberately carries none of it (WebSocket relay + optional
   MQTT bridge is the whole seam).

Where this framework differs in its own favor: the 3D layer is an **open** engine (Godot, MIT) rather
than proprietary Unity, and the embed is a single static no-threads WASM build with **no
cross-origin-isolation headers** — it drops into a Grafana panel (or any host) with nothing to install.

## Framework harvest delivered

- **Tool** — `twin_publish_web.sh` now emits **`embed.html`** beside every staged demo (stage 5): a
  ready-to-paste Grafana text/HTML-panel `<iframe>` with the hosted URL inferred from the demos repo's
  `origin` remote (or `--embed-base`). `--emit-embed-only` regenerates it for an already-published demo
  with no rebuild. Verified live: the emitted iframe is exactly what rendered the twin painted in
  Grafana above (invocable proof, shellcheck clean).
- **Skill** — `skills/twin-bind-data/SKILL.md` §"Serving to the browser / Grafana embed" hardened with
  the confirmed recipe (the `embed.html` emission, the anonymous-admin bring-up line, the
  no-COEP/SharedArrayBuffer reason no-threads is mandatory, the `https`/`wss` mixed-content rule).
- **Convention** — `docs/process/fair-comparison.md`: any competitor side-by-side MUST name at least
  one capability the competitor has and this framework does not; a one-sided table is a copy violation.

## Caveats

- **One machine** — Apple M3 Pro, Metal / Forward+ (native reference), macOS Darwin 25.5, 120 Hz
  ProMotion, Godot 4.6.3.stable, **Chrome 150 only**. Grafana OSS **11.6.1** user-space this run (the
  web-ceiling finding used 13.0.2 in Docker — same result: no-threads boots, threads DOA).
- **Safari unverified** (open-items #3) — do not read this as Safari-works or Safari-fails.
- **fps display-capped at 120 Hz** — `cpu_ms` is the sub-cap differentiator (`gpu_ms` reads 0 on both
  backends). Network transfer of the ~38–40 MB build not measured (localhost/hosted CDN variable).
- The hosted demo is a **baked recording** (`url=""`), not a live source — per
  `docs/process/live-sources-not-hostable.md`. A live `ws://`/`wss://` deployment goes through the
  `sourceUrl` relay integrator-side; it is not what a static hosted demo shows.
  </content>
  </invoke>
