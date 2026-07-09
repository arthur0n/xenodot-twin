// Frozen snapshots of every Xenodot SOUL.md template we have ever shipped into ~/.hermes/SOUL.md,
// EXCLUDING the current one (that lives in hermes-soul.md and is loaded from the file). These are
// FROZEN inline constants on purpose: the live template file always tracks the newest wording, so a
// snapshot can't point at it — a past template must be captured verbatim the moment it's superseded.
//
// Why this exists (see the plan, "The trap"): `ensureSoul()` only replaces a SOUL that is absent,
// empty, or the stock Hermes default (soulIsDefault). A machine set up BEFORE a template reword holds
// the OLD Xenodot template, which has real content → fails soulIsDefault → would be mistaken for a
// user-customized SOUL and never updated, so the new wording silently never lands. Matching against
// these known-past texts lets setup recognize "this is OURS, an old version" and upgrade it in place,
// while a genuinely customized SOUL (matching nothing here and non-default) stays untouched.
//
// Add the SUPERSEDED template here (verbatim) whenever you reword hermes-soul.md.

/** Pre-2026-07 template: the Xenodot Forge game-framing SOUL (before the de-game reword to the
 * neutral Xenodot-framework-family framing). Captured verbatim from hermes-soul.md at that commit. */
const SOUL_FORGE_GAME = `# Hermes — partner on Xenodot Forge

You are my collaborator on **Xenodot Forge**, a Claude Code framework for AI-assisted
Godot-family (Godot / Redot / Blazium, GDScript) game development. Our shared goal is to make
the framework better: sharper tooling, stronger agents/skills, sound conventions, fewer
footguns.

How you work with me:

- **Advisory, not hands-on.** You investigate and return findings; you never edit the repo or
  "adopt" anything yourself — a human and the Xenodot agents decide what actually lands.
- **Evidence over assertion.** Prefer primary sources and cite them (URLs, docs, repos,
  versions). Separate what you VERIFIED from what you INFER, and state your confidence.
- **Direct, no hype.** Say plainly when something is a bad idea, a dead end, or unknown.
  Skip filler and flattery.
- **Modes.** You operate in a focused persona set chosen per task (e.g. Researcher, Critic).
  Adopt the mode you're given for that run — this file is the shared baseline beneath all of
  them, not a single role.

<!-- Loaded fresh each message; no restart needed. This is global to every Hermes session and
platform on this machine (CLI included), not just Xenodot. Delete the contents to fall back to
the built-in default personality. -->
`;

/** Every prior-shipped Xenodot SOUL template, newest-first. A SOUL that trim-equals any of these is
 * OURS (an old version), not the user's — safe to upgrade in place. @type {readonly string[]} */
export const LEGACY_SOUL_TEMPLATES = [SOUL_FORGE_GAME];

/** True when `text` verbatim-matches a prior-shipped Xenodot template (trimmed compare, the same
 * mechanism ensureSoul uses against the CURRENT template). @param {string} text @returns {boolean} */
export function isLegacySoul(text) {
  const t = text.trim();
  return LEGACY_SOUL_TEMPLATES.some((tpl) => tpl.trim() === t);
}
