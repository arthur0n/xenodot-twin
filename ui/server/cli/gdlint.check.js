// GDScript floor — gdlint over every tracked *.gd file. The gate-trap unit caught .gd files
// shipping unlinted (verify_render.gd shipped once with never a linter run); this closes that gap
// by wiring the linter into `npm run validate`.
//
// SOFT-SKIP when gdtoolkit is absent — unlike shellcheck.check.js (which HARD-fails, because CI
// always ships shellcheck), gdtoolkit is a pipx/pip install most machines and the CI image do NOT
// carry. Hard-failing here would turn every gdtoolkit-less checkout red for a linter it can't run,
// so absence exits 0 with a note. Presence lints for real and fails on any finding. The floor is
// therefore "lint where the linter exists, never block where it doesn't" — same intent as the
// shell floor, opposite default because the tool's availability is opposite.
//
// Bare-node, no test runner (same style as ui/structure.check.js and shellcheck.check.js); wired
// into `npm run validate` and (via lint-staged) the pre-commit pass.
//   node ui/server/cli/gdlint.check.js   # exits 1 on any finding; 0 (with note) when gdlint absent
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."); // repo root

// Soft-skip when the linter isn't installed — machines without gdtoolkit must never go red for a
// linter they can't run (install hint: `pipx install gdtoolkit`).
if (spawnSync("gdlint", ["--version"], { stdio: "ignore" }).error) {
  console.log("ok  check:gd: gdlint (gdtoolkit) not installed — skipped (pipx install gdtoolkit).");
  process.exit(0);
}

// Every tracked .gd file. gdlint reads its own gdlintrc from the CWD hierarchy when present.
const files = execFileSync("git", ["ls-files", "*.gd"], { cwd: ROOT })
  .toString()
  .split("\n")
  .filter(Boolean);

if (!files.length) {
  console.log("ok  check:gd: no GDScript files tracked.");
  process.exit(0);
}

const res = spawnSync("gdlint", files, { cwd: ROOT, stdio: "inherit" });
if (res.status !== 0) {
  console.error(`✗ check:gd: gdlint reported findings in tracked GDScript above.`);
  process.exit(res.status ?? 1);
}
console.log(`ok  check:gd: ${files.length} GDScript file(s) clean (gdlint).`);
