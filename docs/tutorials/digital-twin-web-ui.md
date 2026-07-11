# Digital twin from the web UI — just ask the Hive

The [other tutorial](./digital-twin.md) builds the twin from a terminal, command by command. This
one does the same pipeline the way the product is actually meant to be used: you **open the web app
and talk to the agent Hive in plain language.** You type a request, the Hive routes it to the right
specialist, gates run, and it reports back — you never touch the terminal.

> The request phrasings and the routing/behaviour below were **captured live** by driving the running
> UI (2026-07-09). Each "Say this" is a real prompt; each "What happens" is what the Hive actually
> did with it.

## Open the app

Start the server (from the framework clone) and open the door:

```bash
./start_server            # detached; default http://localhost:8338 (PORT=9000 ./start_server for another)
```

Open **http://localhost:8338**. It's serving the viewer project named in `.xenodot.json`. This
tutorial assumes the Duplex house model is already imported (the CLI tutorial's Steps 1–4, or ask the
Hive to import it first — _"Import `Duplex_A_20110907.ifc` into the viewer — convert it, verify the
GlobalId join, and load it."_).

## The one rule

**You only ever type the plain-language request.** The Hive (the orchestrator) maps each to the right
specialist — `twin-architect` for design, `twin-data-binder` for the data layer, `twin-scene-optimizer` for
scale — and **won't let a build report "done" until its gates pass** (render health + the twin
join/DataBus gates). If you're unsure of scope, just describe the outcome you want and it routes to
the architect first rather than guessing.

## The ordered sequence

### 1. Design the twin (always first for anything non-trivial)

> **Say this:** _"Design a live digital twin for the Duplex house model — a walkthrough camera plus
> live sensor data painted onto rooms and equipment. Interview me and write the design doc."_

**What happens:** routes to `twin-architect` — **not** a builder. It interviews you (expect a few
forms) and writes a `design/<slug>.md` settling the whole shape at once: scene layout, the
tag→GlobalId→node join map, and whether the model needs performance work. This up-front decision is
deliberate — it stops the data contract from drifting slice by slice.

### 2. Build the data binding

> **Say this:** _"Build the data binding from the design doc — join the model tags to their nodes and
> paint live values on them."_

**What happens:** routes to `twin-data-binder`, the core pillar. It joins node names to tags via the IFC
GlobalId sidecar, wires the DataBus, and paints live values onto the geometry (colour ramp / Label3D),
then runs the join + overlay gates before reporting. Nothing is claimed done until the bound
GlobalIds actually resolve and updates reach their elements.

### 3. Wire the seeded simulator (test without a real source)

> **Say this:** _"Wire the seeded simulator fixture so I can see the overlay update without a live
> source."_

**What happens:** the deterministic sim (`tools/sim/server.js`) gives you a repeatable fake stream so
the overlay proves out offline — the same wire shape a real source uses, so nothing downstream cares
whether it's the sim or a plant.

### 4. Optimize for frame budget — _only if the design flagged it_

> **Say this:** _"Optimize the scene to hold 60 fps — apply what the design doc called for and give me
> the before/after numbers."_

**What happens:** routes to `twin-scene-optimizer`; it chunks/LODs the geometry and reports measured
before/after, every optimization shipped toggleable. Skip this step entirely if step 1 said the model
is light (a single small building usually is).

### 5. Verify against the gates

> **Say this:** _"Run the full verify — render health plus the twin join and DataBus gates — and
> report pass/fail."_

**What happens:** runs `godot-verify` (the scene loads, renders, no script errors) plus the twin gates
(join integrity, DataBus liveness). The Hive runs these after each build automatically; this asks for
a full pass on demand.

### 6. Run it and watch live data

> **Say this:** _"Run the viewer with the simulator recording and show me the live overlay."_

**What happens:** boots the viewer pointed at the sim (or a recording); the rooms/equipment paint from
the streaming values. The web UI relays the source into the viewer through the framework's
`/twin-data` relay.

### 7. Point it at your real MQTT broker

When the sim has served its purpose and you have a real broker:

> **Say this:** _"I have a live MQTT broker at `mqtt://host:1883` publishing telemetry on topics like
> `plant/pump_1/temp`. Point the twin at it instead of the seeded sim."_

**What happens:** the Hive knows the **MQTT→WS bridge already ships** — it does **not** design a new
ingress. It tells you to author an `mqtt_map.json` (topic→tag rules; example at
`plugin/examples/mqtt_map.example.json`), run the bridge —

```bash
node tools/bridge/mqtt_ws.js --broker mqtt://host:1883 --map mqtt_map.json --port 8766
```

— and point `viewer.cfg url="ws://localhost:8766"` at it. The bridge re-emits the **exact** DataBus
frames the sim does, so the join, overlays, and playback are untouched — "consumers can't tell broker
from sim." It'll offer to hand off to `twin-data-binder` to author the map against your real
`binding_map.json` tags and verify the join end-to-end. (No broker to hand? See the demo publisher in
[the CLI tutorial](./digital-twin.md#point-it-at-your-mqtt-broker-the-real-source-happy-path).)

## Two things worth knowing

- **Gates, not vibes.** A builder can't report "done" until its gates pass — so "it says it's bound"
  means the join actually resolved and updates actually reached the elements.
- **Describe outcomes, not steps.** If you don't know the internals, say what you want to _see_ ("show
  live temperature on the two bathrooms") and the architect turns it into the design; you don't have to
  know which specialist owns it.

## The same pipeline, two front doors

| Step          | Web UI (this doc)                         | Terminal ([digital-twin.md](./digital-twin.md))   |
| ------------- | ----------------------------------------- | ------------------------------------------------- |
| Import        | _"Import this IFC…"_                      | `tools/ifc_convert.py …`                          |
| Design + bind | _"Design…"_ → _"Build the data binding…"_ | author `binding_map.json` + `viewer.cfg`          |
| Test source   | _"Wire the seeded simulator…"_            | `node tools/sim/server.js --map …`                |
| Real source   | _"Point the twin at my MQTT broker…"_     | `node tools/bridge/mqtt_ws.js --broker … --map …` |
| Verify        | _"Run the full verify…"_                  | `tools/verify_twin.sh`                            |
| Run           | _"Run the viewer…"_                       | `$GODOT --path .`                                 |
