// onboard:check — the ENVIRONMENT audit a stranger runs FIRST, before wiring a project. It answers
// "does this machine have what the framework needs, and if not, what's the exact fix?" — one line
// per tool, ✓ present / ✗ missing / — optional-skipped, with the precise install command per ✗.
//
// The audit ITSELF lives in ./onboard-checks.js (a pure, importable function) so the web UI's
// first-boot setup panel (GET /api/onboard-status) reads the SAME truth — this file is just the
// CLI printer + exit code over it.
//
// Scope split (no duplication): this checks the TOOLCHAIN (node, engine, uv/python, gdtoolkit,
// rtk/graphify). `npm run doctor` checks the wired SEAT (plugin, project.godot, materialized tools).
// onboard:verify runs doctor against the real seat; this runs with NO project configured.
//
//   node ui/server/cli/onboard-check.js   # exits 1 only if Node is too old to run anything; else 0
import { onboardChecks, summarizeChecks } from "./onboard-checks.js";

const checks = onboardChecks();

console.log("onboard:check — environment audit\n");
for (const c of checks) {
  console.log(`  ${c.mark} ${c.line}`);
  if (c.mark === "✗" && c.fix) console.log(`      fix: ${c.fix}`);
}
const { present, missing, skipped, requiredFail } = summarizeChecks(checks);
console.log(
  `\nonboard:check: ${present} present, ${missing} missing, ${skipped} optional skipped.`,
);
if (requiredFail) {
  console.error("onboard:check: a REQUIRED tool is missing — fix it (above) before continuing.");
  process.exit(1);
}
// Advisory misses (Godot/uv/gdtoolkit) do NOT fail the audit: you can open the UI and wire a seat
// without them; the downstream step that needs each one fails loud with the same fix if still absent.
