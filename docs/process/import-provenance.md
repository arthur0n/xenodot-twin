# Import provenance & the license wall

Every model that enters the twin arrives with **provenance** (where it came from, verified bytes,
attribution) and stays on the right side of a **license wall**. This is a durable convention, not
per-plan copy: any IFC/BIM import — a demo, a seat, a test — produces the same two artifacts and
obeys the same license rule. The tools that automate it are `plugin/tools/twin_fetch_model.sh`
(fetch → verify → stamp) and `plugin/tools/ifc_convert.py --metrics` (import metrics); the skill
is `twin-import`.

## 1. `models/PROVENANCE.md` — required for every imported model

When a model is fetched, a `models/PROVENANCE.md` is written **beside it** (`twin_fetch_model.sh`
stamps it; author it by hand only if you bypass the tool). It records, per model:

- **Source URL** — the exact URL the bytes came from (for a Git-LFS-tracked sample, the
  `media.githubusercontent.com/media/…` endpoint, not the `blob`/`raw` pointer URL).
- **License line** — the model's license and its **required attribution string** verbatim
  (e.g. a CC BY 4.0 credit line + any "NOT official buildingSMART examples" disclaimer). A hosted
  demo that shows the model MUST surface this credit.
- **sha256** and **byte size** — the integrity check. The download is only trusted once its sha256
  matches; a mismatch means a re-fetch, never a "convert anyway".
- **IFC schema** — read from the STEP header (`FILE_SCHEMA(('IFC2X3'))` vs `('IFC4')`). It decides
  the equipment vocabulary (`IfcPump`/`IfcTank`/`IfcValve` are IFC4-only) and is recorded so a later
  binding/census step doesn't re-discover it.

The **STEP-header sanity check** is part of the stamp: a real IFC starts with `ISO-10303-21;`
(`head -c 13`). A dead URL that served an HTML error page starts with `<!DOCTYPE` — that file is
never converted, and its sha256 is never recorded as validated.

Validated sample-model URLs + digests + schemas live in the `twin-import` skill's "Validated models"
table, so the next session re-fetches from a known-good source instead of re-walking dead URLs.

## 2. `models/<model>.metrics.json` — the machine-readable import result

Provenance says what the model _is_; the metrics file says what the _import produced_. It is written
by `ifc_convert.py --metrics <path>` (schema, `shapes`, `elements`, `import_seconds`) and enriched by
`check_twin_join.gd --json=<same path>` (`join_matched`/`join_total`/`join_pct`/`join_gate`). One
file carries the whole result, and the product reads it: the assets panel's **"Imported models"**
card (`GET /api/import-metrics`) shows JOIN %, import time and element count for each imported model,
so the pipeline result is visible in the UI, not only in a markdown finding. Every number carries the
**one-machine caveat** (single-run wall time, not a benchmarked record).

## 3. The license wall (verbatim — never loosen)

> IfcOpenShell's **core** library/tools (ifcopenshell, IfcConvert) are **LGPL-3.0-or-later** and may
> be used by this MIT framework **only at arm's length** — dynamic linking or subprocess (e.g.
> `IfcConvert`); never static-linked into an MIT-distributed binary (that would trigger LGPL
> relinking obligations).
>
> **Bonsai** (formerly the BlenderBIM Add-on) is **GPL-3.0-or-later** and must **NEVER be linked or
> bundled** into the MIT framework. Interoperate with Bonsai **only via exchanged files** (IFC /
> glTF) or an arm's-length subprocess — never by touching its GPL code.

The current pipeline already respects this: `ifc_convert.py` uses ifcopenshell as a subprocess/library
in a separate `.venv-ifc` (a build step — Godot never links it), and Bonsai is touched only as a file
producer in the "author in Bonsai → play in the twin" story. The large source `.ifc`/`.glb`/sidecar
are build inputs kept **out of `res://`** (gitignored `models/`); only the optimized scene the ship
step bakes enters the packaged project.

## Checklist (every import)

- [ ] `models/PROVENANCE.md` written: source URL, license + attribution line, sha256, size, schema.
- [ ] STEP header validated (`ISO-10303-21;`) before conversion; sha256 matched before trust.
- [ ] `models/<model>.metrics.json` written by `--metrics`, join merged by `--json` — renders on the
      assets import card.
- [ ] License wall respected: ifcopenshell arm's-length, Bonsai file-exchange only, big models out of
      `res://`.
- [ ] Public copy shows every number with the one-machine caveat and credits any CC BY model.
