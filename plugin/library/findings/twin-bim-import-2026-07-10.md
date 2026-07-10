---
type: finding
title: "twin-bim-import — the pipeline holds on a real building (Schependomlaan): 100% GlobalId join, ~42 s one command"
description: "First seat run of the shipped IFC→twin pipeline on a REAL building, not the toy Duplex: the 62 MB Schependomlaan model (IFC2X3, CC BY 4.0) imports to a GLB+sidecar in ~16.5 s, joins 3505/3505 GlobalIds (100%), and reaches every twin_build gate green (BIND-SMOKE 5/5) in ~42 s wall — ~12x the Duplex's shapes for ~2.2x the wall. Frames the twin as a Bonsai complement (author openBIM in Bonsai → play it live in the twin) and records the LGPL/GPL license wall."
timestamp: 2026-07-10T16:00:00+01:00
tags:
  [
    twin-import,
    bim,
    ifc,
    real-building,
    schependomlaan,
    join,
    twin-build,
    bonsai,
    license,
    cc-by,
    one-machine,
  ]
---

# twin-bim-import — the pipeline holds on a real building, not just the toy Duplex

The twin-build finding proved the pipeline on the bundled **Duplex** (286 shapes, ~19.5 s). The
open question was whether it holds on a **real building**. It does. A fresh disposable seat
(`npm run new --viewer` + project-scoped plugins + the pinned `.venv-ifc`) ran the shipped
pipeline end-to-end on **Schependomlaan** — a well-known Dutch residential project, ~12x the
Duplex's geometry — with **zero pipeline changes**: import → 100% GlobalId join → `twin_build`
all-gates-green → a painted, live-bound viewer proven in a real window AND a real browser.

## The model

**Schependomlaan** (as-planned, incl. planning data), from
`buildingsmart-community/Community-Sample-Test-Files` — **CC BY 4.0**.

- IFC schema **IFC2X3** (Synchro 4D exporter); **65,078,748 bytes** (~62 MB).
- sha256 `57fafa59f03b18c05be211a456e346bdd0445d5c35d66522e598d339e81dfcf4` (matches the repo's
  Git LFS pointer oid — content-verified). Full source URL + attribution in the seat's
  `models/PROVENANCE.md` and the twin-import SKILL sample-model table.
- LFS gotcha: the plain `raw.githubusercontent.com` URL serves the 133-byte **LFS pointer**, not
  the model. Fetch via the **media** endpoint (`media.githubusercontent.com/media/...`).

## The numbers (one machine, single run — read honestly)

| Metric                                     | Duplex (prior finding) | **Schependomlaan (this run)**                 |
| ------------------------------------------ | ---------------------- | --------------------------------------------- |
| IFC size                                   | 2.3 MB                 | **62 MB** (~27x)                              |
| Shapes (GLB nodes)                         | 286                    | **3505** (~12.3x)                             |
| Sidecar elements                           | 295                    | **3508**                                      |
| **GlobalId join**                          | 286/286 (100%)         | **3505/3505 (100.0%)**                        |
| Import wall (`ifc_convert.py`, standalone) | ~2.2 s                 | **~16.5 s** (15.0 s geometry + 1.5 s sidecar) |
| GLB / sidecar out                          | —                      | **7.3 MB GLB / 23.6 MB sidecar**              |
| BIND-SMOKE                                 | 6/6                    | **5/5 resolved** (seed 42)                    |
| **`twin_build` total wall**                | ~19.5 s                | **~42.4 s** (single run, cold)                |

The headline: **join fidelity is size-independent — 100% on a real building, same as the toy.**
Wall time scales roughly with geometry but sub-linearly with file size (~12x the shapes for
~2.2x the total wall; import dominates the growth, the verify gates are largely fixed cost).

Optimize is honest about a real building: **0 MultiMesh groups instanced** (3505 meshes, 3505
groups) — a residential model's geometry is mostly _unique_ elements, so there is little to batch,
unlike a repeated-asset plant. The optimizer correctly finds nothing to instance rather than
inventing savings.

## Painted + live-bound, proven twice

- **Windowed, real GPU:** the optimized `.tscn` boots against the seeded sim; the HUD reads
  `DataBus: LIVE`, `bindings: 5/5 resolved`, with `facade_gable.temp` streaming — and the
  building **paints** (recognizable gabled residential geometry, two bound facade walls showing
  the temperature ramp). Screenshot in the seat's `spikes/evidence/`.
- **Real browser (no-threads WASM):** the `twin_publish_web.sh` artifact, served locally and
  driven with headed Chrome over CDP (real GPU via ANGLE/Metal), boots clean — console shows
  engine boot, `model loaded from res://…_opt.tscn`, `bindings resolved 5/5`, recording autoplay;
  **no SharedArrayBuffer / COEP errors** (the only `console.error` is the benign build-time
  occlusion-culling notice). The building paints in-WASM with the playback timeline scrubbing.
  HTTP 200 was NOT the gate — the painted canvas + clean console was.

## The Bonsai-complement scenario

Position the twin as a **complement to Bonsai**, not a competitor: _author openBIM in Bonsai →
export IFC → play it live in xenodot-twin._ The differentiator is **speed + join fidelity +
hosted playback**, never being first (GDIFC exists — alpha, MPL-2.0, ships no macOS binary) and
never authoring or simulation. Bonsai itself advertises "Live building sensors", so the twin
scopes to **hosted digital-twin visualization + live-data binding** and acknowledges the partial
overlap rather than claiming the only-open-source-live-data territory. Interop is via exchanged
files (IFC / glTF) only.

## The license wall (durable framework policy — state verbatim)

> IfcOpenShell's **core** library/tools (ifcopenshell, IfcConvert) are **LGPL-3.0-or-later** and
> may be used by this MIT framework **only at arm's length** — dynamic linking or subprocess (e.g.
> `IfcConvert`); never static-linked into an MIT-distributed binary (that would trigger LGPL
> relinking obligations).
>
> **Bonsai** (formerly the BlenderBIM Add-on) is **GPL-3.0-or-later** and must **NEVER be linked
> or bundled** into the MIT framework. Interoperate with Bonsai **only via exchanged files** (IFC /
> glTF) or an arm's-length subprocess — never by touching its GPL code.

The pipeline already respects this: `ifc_convert.py` uses ifcopenshell as a library in a
**separate `.venv-ifc`** (a build step; Godot never links it), and Bonsai is touched only as a
file producer.

## Attribution mechanism (finding-to-file item)

CC BY 4.0 sample models **need a visible credit line in any hosted demo**. Schependomlaan's
required credit (MSc thesis of Stijn van Schaijk, ISBE / TU Eindhoven, with Hendriks Bouw en
Ontwikkeling, ROOT, TNO, RAAMAC; via the community repo; CC BY 4.0) is captured in the seat's
`models/PROVENANCE.md`. The demo publisher does not yet bake an on-screen attribution overlay —
that is the concrete gap the next BIM demo unit should close.

## One-machine caveat (mandatory)

Every number above is from **ONE machine, single run** — Apple M3 Pro, Metal, shadows/occlusion
off, `Godot 4.6.3.stable.official`, ifcopenshell 0.8.5 on CPython 3.12. Single-run wall times are
order-of-magnitude, not a stopwatch record. Import time scales with the IFC; 3505 shapes here.

## Reproduce

```bash
npm run new -- ../xt-poc2 --viewer && cd ../xt-poc2
# project-scoped plugins (run FROM the seat): claude plugin marketplace add arthur0n/xenodot-twin --scope project; install xenodot + xenodot-twin
uv venv --python 3.12 .venv-ifc && uv pip install --python .venv-ifc/bin/python ifcopenshell==0.8.5
mkdir -p models
curl -sSL 'https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan/As%20Planned%20models/IFC%20Schependomlaan%20incl%20planningsdata.ifc' -o models/Schependomlaan.ifc
head -c 13 models/Schependomlaan.ifc   # must print: ISO-10303-21;
# author binding_map.json against real GlobalIds from models/Schependomlaan_props.json, then:
tools/twin_build.sh models/Schependomlaan.ifc --map binding_map.json
```
