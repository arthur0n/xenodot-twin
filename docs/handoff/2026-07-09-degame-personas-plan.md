# Implementation plan — de-game the internal persona prompts

Roadmap Must-Have #3 (see `2026-07-09-roadmap-handoff.md`). Plan only — nothing changed
yet. Smallest of the Must-Haves, but the investigation found one real trap (soul upgrade
path) and two additional prompt surfaces beyond the roadmap's list. Sibling plans:
`2026-07-09-mqtt-adapter-plan.md`, `2026-07-09-twin-build-plan.md` (all independent).

## Why this item, restated

These strings are injected into model context every session — they shape agent behavior
toward game development inside the twin product. Wrong words in, wrong priors out.

## Full inventory of game-flavored PROMPT text (verified by sweep)

The roadmap named three files; the sweep over `ui/` LLM-facing strings found five. In
scope is prompt/tool text a model reads — NOT code comments or identifiers (those are
upstream-shared internals; renaming them buys nothing and widens the sync surface).

1. `ui/server/integrations/hermes/hermes-soul.md` — "partner on **Xenodot Forge** …
   game development" (lines 1–4). The Hermes system-prompt baseline.
2. `ui/lib/personas/researcher/persona.js` — brief: "Researcher coworker for the
   Xenodot Forge game-development framework".
3. `ui/lib/personas/critic/persona.js` — brief: same phrasing.
4. `ui/server/mcp-tools/hermes-tool.js` line ~89 — tool description: "you NEVER edit
   the caller's **game** or codebase". Read by the main agent every session the tool
   registers. (Discovered — same class, add to the item.)
5. `ui/server/mcp-tools/promote-tool.js` — tool description + zod `.describe()`
   strings: "**game**-local capability … EVERY **game** gets it … beyond this
   **game**". Same class. (Discovered.)

Adjacent, one string, folding in: `ui/server/cli/new.js` line ~72 writes
"# Xenodot Forge generated/working files" into every scaffolded project's `.gitignore`
— generated user-facing content carrying the upstream brand; `new.js` is already on the
SEAMS behavioral-seams list, so this adds no new seam row.

Explicitly OUT: `session.js`/`types.js`/`config.js`/`index.js` comments and the
`"game"` project-type token in code. The domain resolver already returns `"viewer"`
unconditionally in this fork (SEAMS: `config.js` seam), so those branches are dead here;
touching them is churn against upstream for zero prompt effect.

## The one real design constraint: the soul is MACHINE-GLOBAL

`hermes-setup.js` installs the template into `~/.hermes/SOUL.md` — its own footer says
it applies to "every Hermes session and platform on this machine (CLI included)". The
seat model runs BOTH seats (game `mercenary/` ↔ forge, twin `twindemo/` ↔ this repo) on
one machine. Therefore:

- **Soul wording must be domain-NEUTRAL, not twin-branded.** Recommended frame: partner
  on the **Xenodot framework family** — AI-assisted Godot-family development, naming
  both products in one breath ("games — Xenodot Forge; digital-twin visualization —
  Xenodot Twin"). Advisory/evidence/modes sections are already domain-free; only the
  header + opening paragraph change.
- **Personas and MCP tool text are per-repo** (served by this repo's own server) — safe
  to reword without cross-seat effects. Personas get twin-branded ("Researcher coworker
  for the Xenodot Twin digital-twin visualization framework (Godot-family, GDScript)");
  the two MCP tools get domain-NEUTRAL "project" wording, because their game wording
  adds nothing even upstream — making them upstream-adoptable (seam shrinks if forge
  takes the neutral wording; flag both in the sync notes as upstream candidates).

## The trap: the reworded soul will never reach an already-setup machine

`ensureSoul()` replaces `~/.hermes/SOUL.md` only when it is absent, empty, or the stock
Hermes template (`soulIsDefault`). A machine that ran setup before this change holds the
OLD Xenodot template — which fails `soulIsDefault` (it has real content) and no longer
equals the new template, so setup prints "Kept your custom SOUL.md" forever and the fix
silently never lands. Fix in the same change:

- Add a `LEGACY_SOUL_TEMPLATES` known-past-texts check in `hermes-setup.js`: if the
  existing SOUL matches a prior shipped template verbatim (trimmed compare, same as the
  current-template check), it is OURS, not the user's — replace it and say so. Carry the
  current (pre-change) template text as the first entry. Genuinely customized souls stay
  untouched (unchanged contract).
- `hermes:check` should WARN (not fail) when SOUL matches a legacy template — the
  loud-not-silent rule applied to prompt drift.

## Change list (one bounded change set + one setup follow-through)

**Phase 1 — wording + trap fix (single commit, line-by-line review):**

- `hermes-soul.md`: neutral family framing (header + first paragraph only).
- `personas/{researcher,critic}/persona.js`: twin-branded briefs; keep the behavioral
  sentences (FINDINGS ONLY, refute-first, cite-primary) byte-identical — they are the
  personas' value and are domain-free already.
- `mcp-tools/hermes-tool.js`, `mcp-tools/promote-tool.js`: game→project neutral wording.
- `cli/new.js`: gitignore banner → "# Xenodot generated/working files".
- `hermes-setup.js`: `LEGACY_SOUL_TEMPLATES` + replace-and-report path;
  `hermes-check.js` legacy-soul warning.
- `docs/fork/SEAMS.md`: add rows to the "upstream files we are allowed to edit" table
  for the soul, both personas, both MCP tools (edit description + why-not-additive =
  prompt text is inline string constants); extend the existing `new.js` row. Mark the
  two MCP tools "upstream candidate — neutral wording, offer as PR".

**Phase 2 — land it on the actual machine + prove:**

- Run `npm run hermes:setup` on the dev machine → confirm it reports replacing the
  legacy soul; `npm run hermes:check` clean.
- `npm run validate` + `npm test` green (SEAMS notes `session.test.js` already
  relabeled its game-token case; a grep-level check that no test asserts the old brief
  text — sweep found none, verify at build time).
- Live spot-check from the twin seat: one Hermes researcher call + one critic call via
  the web UI; transcript shows the new briefs; promote/hermes tool descriptions checked
  in a session's tool listing.
- Roadmap handoff: tick item 3.

## Acceptance criteria

1. Sweep `grep -rn "game" ui/ --include="*.md"` plus prompt-string audit of
   `ui/lib/personas` and `ui/server/mcp-tools` shows zero game-framed PROMPT text
   (code comments/identifiers exempt, listed above as out of scope).
2. `~/.hermes/SOUL.md` on the dev machine carries the neutral family text after
   `hermes:setup`, WITHOUT having deleted it manually; a genuinely customized soul in a
   scratch HOME is still left untouched (test both paths — `HOME=<tmp>` runs).
3. Behavioral persona sentences unchanged (diff shows only identity phrases moved).
4. SEAMS table updated in the same commit; upstream-candidate flags present.
5. `npm run validate` + `npm test` green; hermes:check warns on legacy soul, clean
   after setup.

## Out of scope (named)

- Renaming `"game"` code identifiers/comments in shared internals (dead branches here,
  live upstream — pure sync friction).
- Any persona ADDITIONS (e.g. a twin-domain analyst persona) — that's roadmap item 5
  (multi-model analysis seam) territory, not hygiene.
- Upstream PRs themselves (offer later; this repo doesn't block on forge).
