# Demo video — shot list (~60–90s)

_For you to record. One take per shot is fine; cut them together. Say the line, or use it as a caption._

## Capture settings (set once, before recording)

- Window: **1280×720** (matches the benchmarked size; keeps fps readable and text crisp).
- **Hide the editor dock / side panels** — full viewport only. Run the viewer as the game window, not inside the editor if you can.
- Turn on the fps / stats overlay for the city shots; turn it off for the pretty duplex shots so the frame is clean.
- Screen recorder at 60 fps, no cursor trail. Keep the viewer window **foreground and on top** the whole time (macOS freezes rendering on occluded windows — you'll capture phantom fps otherwise).
- Total target 60–90s. Aim ~8–10s per shot.

## Shot order

**1. Duplex, live (0:00–0:10)**
Open the duplex viewer with the seeded simulator running. Slow orbit around the building.

> "This is a real building model — IFC, converted and loaded live in an open-source game engine."

**2. Color ramps come alive (0:10–0:22)**
Let live values drive the albedo ramp — elements shift green→red as readings change. Hold on a couple of elements changing.

> "Live sensor values are bound to the actual elements. Green to red is the reading, updating in real time."

**3. Labels on (0:22–0:32)**
Toggle the floating value labels. Push in on one labeled element so the number + value read clearly.

> "Each label is joined to its element by the IFC GlobalId — one shared key from import to live data."

**4. Load a recording (0:32–0:42)**
Load an NDJSON recording. Status line flips to **amber PLAYBACK**. Point the cursor at it.

> "Same viewer, now replaying a recorded session — and it says so: amber for playback, never faking live."

**5. Scrub the timeline (0:42–0:52)**
Drag the timeline bar back and forth; the whole scene responds to the scrub.

> "Scrub anywhere and the scene follows — this playback is proven deterministic by a hash gate."

**6. Change speed (0:52–1:00)**
Bump playback speed up, then back. Show it staying smooth.

> "Speed up, slow down — the clock is frame-rate independent, so it reproduces exactly every run."

**7. City block — before (1:00–1:12)**
Load the 114k-mesh city scene, unoptimized, aerial vantage. fps overlay ON — let it sit at the low number and stutter as you nudge the camera.

> "A city block — 114,000 meshes, before optimization. Aerial view, about 27 fps. Watch it crawl."

**8. City block — after (1:12–1:25)**
Same scene, same aerial vantage, optimized (`--chunks=auto`). fps overlay ON — smooth, pinned high. Do the same camera nudge for a direct before/after feel.

> "One automated optimization pass. Same view — now smooth, 4.4× faster, render-thread work down 98%."

**9. Close (1:25–1:30, optional)**
Cut to the split before/after fps overlay, or the project title card.

> "Built in a day of orchestrated agent phases. Details and honest caveats in the writeup."

## Editing notes

- Shots 7→8 are the money cut — keep the camera framing **identical** so the before/after reads instantly. Consider a hard cut with the fps number on screen for both.
- If a shot is fiddly to capture live, record the fps overlay separately and composite; don't fake the number.
- Keep it quiet and matter-of-fact — the numbers carry it, no need to oversell.
