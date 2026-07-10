// Shell floor — shellcheck is ENFORCED here, not just run by hand. Every tracked shell script
// (all *.sh plus extensionless files carrying a shell shebang — start_server, stop_server,
// bootstrap) is linted at shellcheck's default severity. This is the standing gate item #4 asked
// for: the linter "never ran on this machine" and every .sh shipped on `bash -n` + eyeballed
// directives alone, so a silent skip-when-missing would recreate exactly that gap. Therefore this
// HARD-FAILS when shellcheck is absent (with an install hint) rather than passing quietly.
//
// Flags mirror how the scripts are written: `-x` follows sourced files so the `# shellcheck
// source=lib/checks.sh` directives resolve; --source-path=SCRIPTDIR finds each script's own
// lib/, and --source-path=plugin/tools points the plugin's tool scripts (whose lib/checks.sh is
// materialized at runtime, absent from the repo) at the canonical shared library.
//
// Bare-node, no test runner (same style as ui/structure.check.js); wired into `npm run validate`,
// the pre-commit lint-staged pass, and CI (ubuntu-latest ships shellcheck).
//
// VERSION DRIFT (not pinned, on purpose): CI lints with the runner's preinstalled shellcheck
// (ubuntu-latest ≈ 0.9.x), which is often OLDER than a dev's brew build (0.11.0). Findings differ
// across versions — e.g. SC2317 "unreachable command" on trap-invoked cleanup functions fires on
// 0.9.x but 0.11.0 suppresses it itself. So "clean locally" ≠ "clean in CI": write suppression
// directives to hold across versions (a disable is silently ignored when its finding isn't emitted),
// and don't rely on a newer local shellcheck to hide what CI will flag. Pinning an exact version was
// weighed and rejected — an install step + upgrade treadmill is too much infra for the odd directive.
//   node ui/server/cli/shellcheck.check.js     # exits 1 on any finding (or if shellcheck is missing)
import { execFileSync, spawnSync } from "node:child_process";
import { openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."); // repo root
const SHELLCHECK_ARGS = ["-x", "--source-path=SCRIPTDIR", "--source-path=plugin/tools"];
// A shell shebang on an extensionless tracked file (sh/bash/dash/ksh/zsh, env-wrapped or direct).
const SHELL_SHEBANG = /^#!.*\b(ba|da|k|z)?sh\b/; // matches #!/bin/sh, #!/bin/bash, #!/usr/bin/env bash …

// Fail loud if the linter isn't installed — the whole point of this floor is that it RUNS.
if (spawnSync("shellcheck", ["--version"], { stdio: "ignore" }).error) {
  console.error("✗ check:sh: shellcheck is not installed — the shell floor cannot run.");
  console.error(
    "  Install it:  brew install shellcheck   (Debian/Ubuntu: apt-get install shellcheck)",
  );
  process.exit(1);
}

// Discover shell scripts among tracked files: every *.sh, plus extensionless files whose first
// line is a shell shebang (catches start_server / stop_server / bootstrap without hard-coding them).
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT })
  .toString()
  .split("\n")
  .filter(Boolean);
const files = [];
for (const f of tracked) {
  if (f.endsWith(".sh")) {
    files.push(f);
    continue;
  }
  if (path.basename(f).includes(".")) continue; // some other extension — not a candidate
  try {
    const fd = openSync(path.join(ROOT, f), "r");
    const buf = Buffer.alloc(128);
    const n = readSync(fd, buf, 0, 128, 0);
    closeSync(fd);
    const head = buf.toString("utf8", 0, n).split("\n", 1)[0] ?? "";
    if (SHELL_SHEBANG.test(head)) files.push(f);
  } catch {
    continue; // unreadable (e.g. a submodule gitlink) — skip
  }
}

if (!files.length) {
  console.log("ok  check:sh: no shell scripts tracked.");
  process.exit(0);
}

const res = spawnSync("shellcheck", [...SHELLCHECK_ARGS, ...files], {
  cwd: ROOT,
  stdio: "inherit",
});
if (res.status !== 0) {
  console.error(
    `✗ check:sh: shellcheck reported findings in ${files.length} tracked shell script(s) above.`,
  );
  process.exit(res.status ?? 1);
}
console.log(
  `ok  check:sh: ${files.length} shell script(s) clean (shellcheck ${SHELLCHECK_ARGS.join(" ")}).`,
);
