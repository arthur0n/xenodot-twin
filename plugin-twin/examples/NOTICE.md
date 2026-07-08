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

The rest of this kit (`binding_map.example.json`, `viewer.cfg.example`, `README.md`) is authored
for xenodot-forge and released under the repository's license.
