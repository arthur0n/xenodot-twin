// Pre-commit: lint + format only the staged files.
//
// eslint runs with --max-warnings 0 so any Tier A warning fails the commit; --fix
// auto-resolves what it can. That strictness is deliberate and KEPT for the whole tree —
// it also means a source file staged into a path eslint doesn't lint surfaces as a
// "file ignored" warning and blocks the commit, a guardrail against silently-unlinted code.
//
// The SINGLE carve-out is `.claude/workflows/`: those are Workflow DSL scripts eslint
// literally cannot parse (module-level `export` + top-level `return`, plus runtime-injected
// globals), so eslint.config.js ignores exactly that dir. Feeding one to eslint here would
// trip --max-warnings 0 on the "file ignored" warning, abort the hook, and let lint-staged
// stash the whole batch. So we drop ONLY `.claude/workflows/` from the eslint task (prettier
// still formats it); everything else — including the rest of `.claude/` — keeps the full
// strict gate + the unlinted-file guardrail. This matches eslint.config.js `ignores` exactly.
//
// HTML is intentionally left out so index.html's hand-tuned markup isn't reflowed.
const isWorkflowScript = (f) => /(^|\/)\.claude\/workflows\//.test(f);

export default {
  "**/*.js": (staged) => {
    const cmds = [`prettier --write ${staged.join(" ")}`];
    const lintable = staged.filter((f) => !isWorkflowScript(f));
    if (lintable.length) cmds.unshift(`eslint --max-warnings 0 --fix ${lintable.join(" ")}`);
    return cmds;
  },
  "**/*.{json,md,css}": ["prettier --write"],
  // Shell floor on staged scripts (see ui/server/cli/shellcheck.check.js for the full-tree gate).
  // Same flags as check:sh. Skips gracefully when shellcheck is absent — mirroring the pre-commit
  // gitleaks precedent; the authoritative, always-fail gate is `npm run validate` (which CI runs).
  "**/*.sh": (staged) => [
    `sh -c 'command -v shellcheck >/dev/null 2>&1 || { echo "check:sh: shellcheck not installed — skipping (npm run validate / CI enforce it)"; exit 0; }; exec shellcheck -x --source-path=SCRIPTDIR --source-path=plugin/tools "$@"' _ ${staged.join(" ")}`,
  ],
};
