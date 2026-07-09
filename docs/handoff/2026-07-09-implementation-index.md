# Implementation index — 2026-07-09 handoff set

Index over `docs/handoff/`. Source of truth for priorities and verdicts is
`2026-07-09-roadmap-handoff.md`; every other file in this directory is either a plan for
one of its numbered roadmap items, a readiness doc for a parked item, or a precedent
record referenced by one of those plans. Start at the roadmap doc, then jump to the item
you're picking up.

## Must Have (credibility for the first real user/demo)

| #   | Item                                                            | Plan doc                                                                   | Status                                                                                                            |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | MQTT source adapter behind `sourceUrl`                          | [2026-07-09-mqtt-adapter-plan.md](2026-07-09-mqtt-adapter-plan.md)         | Plan only — nothing built                                                                                         |
| 2   | One-command pipeline: import → optimize → verify (`twin-build`) | [2026-07-09-twin-build-plan.md](2026-07-09-twin-build-plan.md)             | ✅ Built on `feat/twin-build` — seat-validated (join 286/286, smoke 6/6, ~19.5 s), pending merge                  |
| 3   | De-game the internal persona prompts                            | [2026-07-09-degame-personas-plan.md](2026-07-09-degame-personas-plan.md)   | ✅ Built on `feat/degame-personas` — seat-landed (setup replaced legacy soul, validate+test green), pending merge |
| 4   | Benched LOD/visibility-range recipe                             | [2026-07-09-vis-range-recipe-plan.md](2026-07-09-vis-range-recipe-plan.md) | Plan only — measurement item, sweep not run                                                                       |

Independent of each other — no ordering constraint; `twin-build` (#2) deliberately does
NOT default `--vis-ranges` on until #4 lands.

## Nice to Have (differentiation + the human's stated direction)

| #   | Item                                             | Plan doc                                                                   | Status                                                    |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| 5   | Multi-model analysis seam (data-in/report-out)   | [2026-07-09-analysis-seam-plan.md](2026-07-09-analysis-seam-plan.md)       | Plan only — generalizes the Hermes precedent              |
| 6   | Web/Grafana embed story                          | [2026-07-09-web-embed-plan.md](2026-07-09-web-embed-plan.md)               | Plan only — WASM ceiling never measured                   |
| 7   | `twin-ship` packaging skill                      | [2026-07-09-twin-ship-plan.md](2026-07-09-twin-ship-plan.md)               | Plan only — viewer not export-safe yet (the real blocker) |
| 8   | Second demo asset (plant/factory-flavored model) | [2026-07-09-plant-demo-asset-plan.md](2026-07-09-plant-demo-asset-plan.md) | Plan only — sourcing spike not run                        |

Item #5's build stands on the Hermes precedent, recorded as-built in
[hermes-researcher-subagent-poc.md](hermes-researcher-subagent-poc.md) (built and in use;
not a roadmap item itself — the generalization target for #5).

## Good to Have (speculative, revisit after real users) — readiness docs only

These are deliberately **not** build plans: each names its trigger and the pre-derived
shape the build would take, and says do-nothing until the trigger fires.

| #   | Item                                                          | Readiness doc                                                                                      | Trigger                                                                                            |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 9   | Semantic/master-data models (DTDL, ISA-95 → scene mapping)    | [2026-07-09-semantic-models-readiness.md](2026-07-09-semantic-models-readiness.md)                 | User asks, or analysis seam (#5) hits flat-context limits, or a sale is lost for lack of hierarchy |
| 10  | USD import via offline conversion                             | [2026-07-09-usd-pointcloud-readiness.md](2026-07-09-usd-pointcloud-readiness.md)                   | A user shows up with real USD files                                                                |
| 11  | Point clouds via offline conversion                           | [2026-07-09-usd-pointcloud-readiness.md](2026-07-09-usd-pointcloud-readiness.md) (same doc as #10) | A user shows up with real point-cloud files                                                        |
| 12  | "Simulation" (scenario orchestration over an existing solver) | [2026-07-09-simulation-readiness.md](2026-07-09-simulation-readiness.md)                           | BOTH: visualization has real users, AND a concrete solver exists on the other side                 |

## Explicitly NOT on the roadmap

No plan or readiness doc — see the roadmap's own "Explicitly NOT on the roadmap"
section: protocol stacks, streaming/tiling tech, and physics/process solvers are never
built in-house; they arrive as third-party integrations behind existing seams
(`sourceUrl`, FMI/FMU, adopted runtimes) when the need is real.

## Reading order for a cold pickup

1. `2026-07-09-roadmap-handoff.md` — full context, verdicts, working rules.
2. This index — pick the item.
3. The item's plan/readiness doc — each is self-contained and cites verified file
   references at plan time; re-verify against current `main` before acting, since these
   are point-in-time investigations.
