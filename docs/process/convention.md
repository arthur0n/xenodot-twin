# Project convention — xenodot-twin

Defined 2026-07-10, after the plugin-split investigation
(`docs/handoff/2026-07-10-plugin-split-investigation.md`); the single-plugin
migration it mandates landed 2026-07-11 (fold + rewire → dedup → docs, three
commits). **Review checkpoint: the first real `/sync-upstream` run after this
date** — every friction that sync surfaces is harvested and this convention is
re-evaluated against it, not defended from it.

## Identity

**xenodot** is a framework highly specialized on Godot. It has two specializations:

- **FORGE → GAME** (upstream)
- **TWIN → DIGITAL TWIN** (this repo)

This repo's goal is the twin, full stop. Synergy with forge is welcome; dilution of
the twin focus is not.

## 1. One plugin

There is exactly **one plugin folder, one installable plugin, one version, one
marketplace entry, one install command, one capability enumeration**.

- Twin capabilities carry the `twin-` prefix (skills, agents, findings) — ownership
  stays legible by name, not by folder.
- Every surface that answers "what capabilities exist" (session loader, skill floor,
  UI catalog, onboarding check) reads the one root. Divergent enumerations are
  structurally impossible, not gated.
- Rationale: the two-folder split made the UI hide every twin agent, split the
  version stamp in two with no guard, and forked the install command into four
  contradictory renderings — machinery invented to protect a sync workflow that was
  never even exercised. We do not keep exceptions to protect hypotheticals.

## 2. Framework first — dogfood or file the gap

All work in this repo — demos, tutorials, fixes, tooling — dispatches through the
framework's **own** agents and skills when one covers the domain. Reaching for a
general-purpose agent is allowed only when no capability fits, and that reach **is
itself a finding**: file the missing capability before or alongside the work. The
framework improves by being forced to do its own job.

## 3. Capability lookup order

What is ENCODED today (per the 2026-07-10 lookup investigation): each researcher
agent runs its own two-step — "do we already have it? then stop" (own skills,
tools/forge-facts, library records) → its external source (skill-researcher →
**GodotPrompter**, jame581's third-party MIT skill collection, cached under
`$HOME/.cache/xenodot/`; addon-researcher → Godot Asset Library / awesome-godot;
cli-researcher → MIT-tool-or-build-thin). **Upstream forge appears in no lookup
order anywhere** — today it is only a human-gated sync source (down) and a
promotion target (up).

The convention adds ONE step. Before building anything, in order:

1. **This repo** — existing skill/agent/tool/library record covers it? Stop.
2. **Upstream forge** — has the game specialization already solved it? Port,
   don't reinvent. _(New — not yet encoded; follow-up: add this step to the
   three researcher briefs between their own-repo gate and their external
   source.)_
3. **The researcher's external source** — GodotPrompter for skills, Asset
   Library/GitHub for addons, MIT tools for CLI (as already encoded).
4. **Build new, here, twin-flavored** — only after 1–3 come up empty.

## 4. Sync is a learning process, not a protected invariant

No repo structure exists whose purpose is to make upstream merges trivial. We need
upstream's framework improvements continuously, we have no deterministic merge, and
we don't pretend to.

- Each `/sync-upstream` run resolves conflicts **by judgment**: identity → ours;
  game payload → drop; framework behavior → upstream; twin behavior → ours.
- Generated files (indexes, counts, ledger renders) are **never hand-merged** — take
  either side, regenerate, let the gates verify.
- Every friction the sync surfaces is harvested into the audit ledger
  (self-improvement loop). A painful merge is a finding, not an argument for
  restructuring the repo pre-emptively.

## 5. Convention over machinery

When an invariant needs a gate to survive, first ask whether the invariant should
exist. Prefer deleting a coupling to policing it. Gates guard behavior we chose,
not structure we inherited.
