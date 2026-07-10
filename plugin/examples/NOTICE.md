# NOTICE — bundled sample model provenance

## `Duplex_A_20110907.ifc`

- **What it is:** the standard **Duplex Apartment** model — a small two-unit residential BIM
  model long used as a reference/test fixture across the IFC/BIM tooling ecosystem.
- **Provenance:** a **buildingSMART community sample**, published as one of the "Common Building
  Information Model Files" for testing and education and freely redistributable. The canonical
  buildingSMART sample-download URLs are now **dead** — they 404 or serve an HTML error page that
  "converts" into garbage — so this repo mirrors the file directly. A working mirror (also
  documented in the `twin-import` skill) is:
  `https://raw.githubusercontent.com/andyward/XBimDemo/master/Xbim.TestApp/Duplex_A_20110907.ifc`
- **Schema:** IFC2X3 (STEP / ISO-10303-21). A real IFC starts with `ISO-10303-21;` — the header
  check `head -c 13 Duplex_A_20110907.ifc` must print exactly that.
- **Size / integrity:** ~2.3 MB (2,380,763 bytes).
  `sha256 = b347a2c8aa8fff6db896a4417a9c50c22ac0ccd7c5cfc22b99b8d29336c606ed`
- **License:** distributed as a public sample/test model for education and interoperability
  testing. It is bundled here only as example data for the try-it kit; it is not part of the
  framework's own code and carries its own upstream terms.

## `plant.ifc`

- **What it is:** a **synthetic demonstration model** — a small tank-farm / pump-skid plant
  (`IfcTank` × 4, `IfcPump` × 3, inline `IfcValve` × 3, connecting `IfcFlowSegment` pipe runs),
  authored to give the try-it kit a plant-flavored twin the sim's built-in DEMO_TAGS (pump
  temp/flow, tank level, valve position, motor rpm) already speak. It has **no real-world
  provenance** and must never be presented as a surveyed or as-built plant.
- **Provenance:** **self-owned / generated** — NOT a mirror of any public model. It is emitted by
  `gen_plant_ifc.py` (bundled beside this file) and is reproducible: the "synthetic demonstration
  model" label is written into the IFC `FILE_DESCRIPTION` header and the generator's docstring.
- **How to reproduce it (byte-identical):** in the pinned 3.12 ifcopenshell venv,
  `.venv-ifc/bin/python plugin/examples/gen_plant_ifc.py --seed 42 --tanks 4 --pumps 3
--out plant.ifc`. Same `--seed` ⇒ same GlobalIds/layout ⇒ identical `sha256` (the generator
  seeds its own PRNG, derives every GlobalId from it, and pins the STEP header time_stamp — it
  never calls the random `ifcopenshell.guid.new()` or wall-clock). Turn `--tanks`/`--pumps` up for
  a marketing-scale model / the optimizer's instancing showcase.
- **Schema:** IFC4 (STEP / ISO-10303-21) — `IfcTank`/`IfcPump`/`IfcValve` are first-class only in
  IFC4+. A real IFC starts with `ISO-10303-21;` — `head -c 13 plant.ifc` must print exactly that.
- **Size / integrity:** ~16 KB (15,989 bytes).
  `sha256 = c12cc12987924dfd64a2144710b4a91f5b927a4ff55e93362561343f6602c2e9`
- **License:** self-owned; released under the repository's license as example data for the
  try-it kit. No upstream terms apply (nothing was sourced).

The rest of this kit (`binding_map.example.json`, `binding_map.plant.example.json`,
`viewer.cfg.example`, `viewer.cfg.plant.example`, `gen_plant_ifc.py`, `README.md`) is authored
for xenodot-twin and released under the repository's license.
