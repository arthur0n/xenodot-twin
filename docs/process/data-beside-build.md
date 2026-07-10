# Data beside the build — a shipped twin is retargeted by editing text, not rebuilding

One durable rule, so it need not be re-explained per plan.

## The rule

A `twin_ship.sh` artifact is an **export-safe viewer build** plus its **data staged beside the
executable** (`data/model` + sidecar + binding map + recordings), never baked into the `.pck`. The
`.pck` is **code + starter scenes only**; the data is runtime-loaded from `data/` next to the binary
(`OS.get_executable_path().get_base_dir()` in template builds). Therefore a receiver **retargets the
artifact by editing text** — no re-export, the same binary reads the new config on its next boot.

## What a receiver may change without re-exporting

| line / file                               | owner              | change without re-export?                                      |
| ----------------------------------------- | ------------------ | -------------------------------------------------------------- |
| `[viewer] url=`                           | the **site**       | **yes** — a one-line deployment edit (new live `ws://` source) |
| `[viewer] model=` + `data/<model>`        | the **integrator** | **yes** — `twin_ship.sh --retarget --model` (or hand-swap)     |
| `[twin] binding_map=` + `data/<map>`      | the **integrator** | **yes** — `--retarget --map`                                   |
| `[twin] recording=` + `data/recordings/*` | the **integrator** | **yes** — `--retarget --recording`                             |
| the executable / `.pck` (code + scenes)   | the **packager**   | **no** — re-export only (`twin_ship.sh --preset`)              |

`url=` is **deployment-time** — the site points it at _its_ live tag source (a sim, an MQTT→WS bridge,
a relay). The packaging tool never rewrites `url=`: assemble leaves it untouched, and `--retarget`
**asserts** it stays untouched. The model / map / recording are the data-beside-build files; swap them
by hand or with `--retarget`, which copies the new file into `data/`, rewrites `viewer.cfg`, and
**asserts the same-binary invariant** (the executable's mtime is UNCHANGED — a retarget that rebuilt
the binary would be a re-export in disguise). `--json` writes a `retarget.json` manifest of exactly
what may be swapped.

## Loud, never silent — the honesty half of the contract

A bogus `model=` (a `data/` path with no file) **must fail LOUD on boot** — an `ERROR: … failed to
read model / load scene …`, never a silent blank window. A receiver who fat-fingers a swap must see it
immediately, not ship a twin that paints nothing. The negative control is part of the contract, not an
edge case: if the artifact could boot blank on a missing model, the "retarget by editing text" promise
would be a trap.

## What to say (and not say)

- Say: "the shipped twin is retargeted by editing `viewer.cfg` beside the binary — new `url=` for this
  site's source, or `--retarget` to swap the model/map/recording; the binary is unchanged (mtime
  proves it), re-export only when the _code_ changes."
- Do **not** imply the data is baked into the build, or that changing a site's target needs a rebuild.

Cross-refs: `skills/twin-ship/SKILL.md` §"Retargeting a shipped artifact" + §"The data-beside-build
contract"; `tools/twin_ship.sh` (`--retarget` mode + the assemble `viewer.cfg` rewrite); findings
`twin-ship-2026-07-10.md` (packaging + the `model=` swap contract) and `twin-ship-retarget-2026-07-10.md`
(the cross-source `url=` retarget, one-line, same binary).
