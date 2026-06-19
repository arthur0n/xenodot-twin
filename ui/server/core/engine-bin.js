// The ONE engine-binary resolution rule, kept side-effect-free so both config.js (which has
// load-time side effects) and the hermetic onboarding.check.js can share it without coupling.
import { execFileSync } from "node:child_process";

/** Resolve the engine executable. Probes, in order: `$GODOT`, the macOS app bundle, the engine
 * name on PATH, then `godot` — each validated with `--version` so a stale/missing candidate is
 * skipped. Returns the first that runs, or null. Godot's forks (Redot/Blazium) share the CLI,
 * so passing their name lets them resolve on PATH unchanged.
 * @param {string} [name] engine name to also try on PATH (e.g. "godot", "redot")
 * @returns {string | null} */
export function resolveEngineBin(name = "godot") {
  const candidates = [
    process.env.GODOT,
    "/Applications/Godot.app/Contents/MacOS/Godot",
    name,
    "godot",
  ].filter((c) => typeof c === "string" && c.length > 0);
  for (const c of candidates) {
    try {
      execFileSync(/** @type {string} */ (c), ["--version"], { stdio: "ignore" });
      return /** @type {string} */ (c);
    } catch {
      // try next candidate
    }
  }
  return null;
}
