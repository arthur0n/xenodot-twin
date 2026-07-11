// onboard:verify — the THIRD onboarding step: prove the REAL configured seat actually works, so
// "it's set up" is demonstrated, not assumed. Unlike `npm run test:onboarding` (which scaffolds a
// THROWAWAY viewer in a tmp dir to guard the ship-path), this runs against the seat the user just
// wired — the smallest honest reuse:
//   1. doctor.js against the configured project — plugin intact, project.godot present, tools
//      materialized, library linked (the SEAT checks; hard-fails exit non-zero).
//   2. If an engine binary resolves, the Tier-2 guts of onboarding.check.js — headless --import then
//      a 3-frame boot — against THIS project, asserting no engine/script errors. Skipped (not failed)
//      when no Godot is on the machine, exactly like the onboarding test.
//
//   node ui/server/cli/onboard-verify.js   # exits non-zero on any hard seat failure
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_DIR, PROJECT_CONFIGURED, PROJECT_FOUND, ENGINE_LABEL } from "../core/config.js";
import { resolveEngineBin } from "../core/engine-bin.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli

if (!PROJECT_CONFIGURED || !PROJECT_FOUND) {
  console.error(
    "onboard:verify: no wired project to verify — run onboard:project first:\n" +
      "  npm run onboard:project -- <project-path>",
  );
  process.exit(1);
}

console.log(`onboard:verify: verifying ${PROJECT_DIR}\n`);

// 1. Seat health — reuse doctor wholesale (it materializes idempotently, then hard-checks).
console.log("  → doctor (seat health)");
try {
  execFileSync("node", [path.join(here, "doctor.js"), PROJECT_DIR], { stdio: "inherit" });
} catch {
  console.error("onboard:verify: doctor reported a hard failure (above) — the seat is not ready.");
  process.exit(1);
}

// 2. Headless boot — the onboarding tier's Tier-2 guts, against THIS project. Guarded on a real engine.
const godot = resolveEngineBin(ENGINE_LABEL.toLowerCase());
if (godot) {
  console.log(`\n  → headless ${ENGINE_LABEL} boot (Tier 2)`);
  execFileSync(godot, ["--headless", "--path", PROJECT_DIR, "--import"], { stdio: "pipe" });
  const out = execFileSync(godot, ["--headless", "--path", PROJECT_DIR, "--quit-after", "3"], {
    stdio: "pipe",
  }).toString();
  const bad = out
    .split("\n")
    .filter((l) => /SCRIPT ERROR|Parse Error|ERROR:|Failed to load/.test(l));
  if (bad.length) {
    console.error(`onboard:verify: ${ENGINE_LABEL} reported errors on boot:\n${bad.join("\n")}`);
    process.exit(1);
  }
  console.log(`  ✓ ${ENGINE_LABEL} booted headless with no engine/script errors.`);
} else {
  console.log(
    `\n  — headless boot skipped — no ${ENGINE_LABEL} binary (set GODOT=/path/to/godot to include it).`,
  );
}

console.log("\nonboard:verify: OK — the configured seat is wired and boots.");
