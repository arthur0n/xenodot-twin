// Version scheme for the framework (shared by the release scripts).
//
//   feat                    → bump the sub-version:  v0.1.2      → v0.1.3
//   fix | chore | refactor  → bump the build digit:  v0.1.2      → v0.1.2.1
//                                                     v0.1.2.1    → v0.1.2.2
//
// The git tag is the source of truth. package.json can only hold valid 3-part
// semver, so it tracks the sub-version (the build digit is tag-only).
import { execFileSync } from "node:child_process";

export const RELEASE_TYPES = new Set(["feat", "fix", "chore", "refactor"]);

/** Latest `v*` tag by version order; falls back to the known baseline.
 * @returns {string} */
export function latestTag() {
  try {
    const out = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], {
      encoding: "utf8",
    });
    const first = out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)[0];
    return first ?? "v0.1.2";
  } catch {
    return "v0.1.2";
  }
}

/** @param {string} tag @returns {number[]} */
function parts(tag) {
  return tag.replace(/^v/, "").split(".").map(Number);
}

/** Next tag for a release type, computed from the last tag.
 * @param {string} last @param {string} type @returns {string} */
export function nextTag(last, type) {
  const [a = 0, b = 0, c = 0, d] = parts(last);
  if (type === "feat") return `v${a}.${b}.${c + 1}`;
  return `v${a}.${b}.${c}.${(d ?? 0) + 1}`;
}

/** The 3-part semver package.json should carry for a tag (drops the build digit).
 * @param {string} tag @returns {string} */
export function tagToPkgVersion(tag) {
  const [a = 0, b = 0, c = 0] = parts(tag);
  return `${a}.${b}.${c}`;
}
