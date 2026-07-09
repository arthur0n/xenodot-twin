# LinkedIn post — draft (your voice; you publish)

> Target: ~1,300 chars for the body (LinkedIn folds around there — the hook has to land above the fold).
> Pick ONE hook, delete the rest. Swap in your real screenshots where marked.

---

## Hook options (pick one)

**A — the transfer story (recommended):**

> I built a game framework. Over one day of orchestrated agent phases, it grew a digital-twin viewer for building data — and most of the game tooling transferred straight across.

**B — the number:**

> A real building model, rendered in an open-source game engine, went from 27 fps to a smooth crawl — 4.4× faster — after one automated optimization pass. Here's the odd part: the tool that did it was built for a game.

**C — the honesty angle:**

> I let AI agents build a feature end-to-end in a day. The interesting result wasn't the demo — it was the four things they got wrong and caught themselves, because every step had to pass a deterministic gate.

---

## Body

I spend my side-project time on Xenodot Forge — a framework for building Godot games with Claude Code through a real pipeline instead of a chat box.

This week I pointed it at something that isn't a game: a digital-twin viewer. Load a building's IFC/BIM model, bind live sensor values to the actual 3D elements, scrub recorded history back and forth.

It came together in one day of orchestrated agent phases — research, spikes, plugin, optimizer, live data, playback — each one only "done" once it passed an engine-level gate.

What surprised me was how much transferred. Scene optimization, headless verification, deterministic test fixtures — built for games, reused as-is. Genuinely new was small: the IFC importer and the sensor plumbing.

Measured results (one machine; honest caveats in the writeup):
• IFC → GLB in ~1.1s, every element joined to its property record
• A 114k-mesh city block: aerial view 27.3 → 119.4 fps (4.4×), render-thread work −98%
• Live values at ~5ms, zero dropped frames
• Playback proven deterministic by a sha256 gate — same recording, identical output, every run

Research first: 104 agents, 23 claims confirmed, 2 refuted — the refuted ones killed assumptions I'd otherwise have shipped.

It's a portfolio piece, not a product — niche demand, and the open-source-engine angle is the bet. Next: an MQTT bridge for real sites, and automatic level-of-detail.

[SCREENSHOT: split — duplex with live color ramps + labels]
[SCREENSHOT: city block before/after fps overlay]

#DigitalTwin #Godot #AIagents #BIM #DataViz
