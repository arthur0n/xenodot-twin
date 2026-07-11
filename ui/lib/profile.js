// Per-game profile — the declared `{genre, style}` captured at init (`forge new` /
// `npm run setup`) and stamped into the game's facts manifest. One shared module so
// setup (collect/validate), gen-manifest (stamp), doctor (presence check) and the
// M2 skill-scope projection all read the SAME enum and never drift. No I/O here.
//
// The enum is a SOFT allow-list: known values pass silently, unknown values are
// kept with a warning — new genres/styles must not require a code change first
// (the taxonomy is open for extension; M2 seeds skills for the known values).

/** Known genre tags — the `genre-*` subset of the skill-domain taxonomy. A game's
 * genre decides which `genre-*` skill packs a session sees (M2). */
export const GENRES = ["genre-fps", "genre-topdown-iso"];

/** Known style tags — the `style-*` subset of the skill-domain taxonomy. `style-hd`
 * is the neutral baseline (M3); `style-pixel` opts into the pixel-art stack. */
export const STYLES = ["style-pixel", "style-hd"];

/** A game's declared profile. Both fields are OPTIONAL by design: absence is a soft
 * state (doctor warns, nothing fails) — a missing value is better than a fabricated
 * one, which would make M2 filter out the CORRECT skills.
 * @typedef {{ genre: string | null, style: string | null }} Profile */

/** Normalize one raw profile value: trim, empty/absent → null.
 * @param {string | null | undefined} v @returns {string | null} */
const norm = (v) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** Validate a raw `{genre, style}` pair against the soft allow-list. Known values
 * pass silently; unknown values are KEPT and produce a warning string; empty or
 * whitespace-only input normalizes to null (unset). Never throws.
 * @param {{ genre?: string | null, style?: string | null }} raw
 * @returns {{ profile: Profile, warnings: string[] }} */
export function validateProfile(raw) {
  const genre = norm(raw.genre);
  const style = norm(raw.style);
  /** @type {string[]} */
  const warnings = [];
  if (genre && !GENRES.includes(genre)) {
    warnings.push(`profile: unknown genre "${genre}" (known: ${GENRES.join(", ")}) — kept as-is.`);
  }
  if (style && !STYLES.includes(style)) {
    warnings.push(`profile: unknown style "${style}" (known: ${STYLES.join(", ")}) — kept as-is.`);
  }
  return { profile: { genre, style }, warnings };
}
