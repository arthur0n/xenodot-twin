# Every competitor side-by-side must name a gap in the competitor's favor

One durable copy rule, so it need not be re-argued per positioning artifact.

## The rule

Any artifact that compares this framework to a competitor — a table, a paragraph, a slide, a README
section, an OSArch/Grafana-community post — **MUST name at least one concrete capability the competitor
has and this framework does not.** A comparison that only lists where we win is a **copy violation**,
not a finding: it reads as marketing, invites the first informed reader to refute it, and burns the
credibility the honest-negatives discipline is built to protect.

The bar is one _named, concrete_ capability gap — not a hedge ("they may have more features"), not a
weakness of theirs dressed as ours. Name the real thing they do that we don't.

## Worked example — OpenTwins (the canonical case)

OpenTwins is the acknowledged blueprint (a 3D scene as a live Grafana panel). The fair side-by-side
(`plugin-twin/library/findings/twin-grafana-embed-2026-07-10.md`) names two gaps in OpenTwins' favor:

1. **Bidirectional click-through / write-back to the source** — OpenTwins lets an operator act on the
   source from the scene; this framework is read-only **visualization** today.
2. **A full push-down data/orchestration stack** — Ditto / Hono / Kafka / Kubernetes plumbing OpenTwins
   ships; this framework deliberately carries none of it.

Only against those does the framework's own edge (open Godot/MIT engine vs proprietary Unity; a single
no-threads WASM build with no cross-origin-isolation headers) read as a fair trade rather than a pitch.

## Permanent guardrails that ride with it

From `docs/research/landscape-2026-07.md` (permanent, verified):

- Say "digital-twin **visualization**" until simulation exists — never "simulation".
- **Never** claim "hobby twins default to Unity" (adversarially refuted).
- **Never** pitch a "Cesium-for-Godot gap" (adversarially refuted).
- Every measured number carries the one-machine caveat (Apple M3 Pro, Metal, shadows off).
- State a competitor's engine/stack as fact (OpenTwins uses Unity) without editorializing it as a flaw.

## What to say (and not say)

- Say: "OpenTwins does bidirectional click-through and a full push-down stack; this framework does
  neither — it is read-only visualization on an open engine."
- Do **not** publish a table whose every row favors this framework. If you cannot name a real gap in
  the competitor's favor, the comparison is not ready to ship.

Cross-refs: `docs/research/landscape-2026-07.md` (refuted claims + honesty notes);
`plugin-twin/library/findings/twin-grafana-embed-2026-07-10.md` (the OpenTwins side-by-side in full).
</content>
