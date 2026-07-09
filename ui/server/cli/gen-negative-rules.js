// Negative-rules lint — WARN-ONLY guard for the self-improvement loop's own anti-negative-instruction
// principle. The loop teaches "prefer a positive exemplar over a prohibition", yet its own workflow
// commands historically shipped a literal `## Never` bullet-list. This nudges them toward `## Do this`
// positive framing and flags regressions. Warn-only by design (like gen-library-index's chunk-quality
// warnings): it NEVER exits non-zero, so a genuine safety guardrail phrased as a prohibition inside a
// `## Do this` block is fine — only a whole `## Never` SECTION heading re-appearing trips the warning.
// Mirrors gen-contamination.js / gen-skill-scope.js: bare-node; wired into `npm run validate` + CI.
//   node ui/server/cli/gen-negative-rules.js     # always exits 0; prints ⚠ per offending command
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FRAMEWORK_DIR } from "../core/config.js";

// The five human-run self-improvement commands audited under D7. Their guidance sections should lead
// with the desired behavior (`## Do this`), not a `## Never` list — the same principle they enforce on
// the framework's shipped skills/agents.
const COMMANDS = [
  "framework-audit",
  "framework-audit-fix",
  "framework-feedback",
  "harvest-sessions",
  "token-audit",
];

const CMD_DIR = path.join(FRAMEWORK_DIR, ".claude", "commands");
/** @type {string[]} */
const warnings = [];
for (const name of COMMANDS) {
  const file = path.join(CMD_DIR, `${name}.md`);
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  const idx = lines.findIndex((l) => /^##\s+Never\b/i.test(l.trim()));
  if (idx !== -1) {
    warnings.push(
      `.claude/commands/${name}.md:${idx + 1}: a \`## Never\` section — rewrite as \`## Do this\` ` +
        `positive exemplars (keep genuine irreversibility/safety guardrails, but lead with the ` +
        `desired behavior). The loop teaches this rule; its own commands should follow it.`,
    );
  }
}

if (warnings.length) {
  console.log(
    `⚠  negative-rules: ${warnings.length} self-improvement command(s) still lead with \`## Never\` (non-blocking):`,
  );
  for (const w of warnings) console.log(`    ${w}`);
} else {
  console.log(
    `ok  negative-rules: ${COMMANDS.length} self-improvement commands lead with positive framing`,
  );
}
