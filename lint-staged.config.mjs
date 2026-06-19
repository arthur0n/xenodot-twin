// Pre-commit: lint + format only the staged files. eslint runs with
// --max-warnings 0 so any Tier A warning fails the commit; --fix auto-resolves
// what it can. HTML is intentionally left out so index.html's hand-tuned
// markup isn't reflowed.
//
// .claude/workflows/ uses a different runtime (Workflow DSL) so those files are
// excluded from ESLint via the ignore in eslint.config.js. We filter them out
// here too so ESLint never receives them and doesn't warn about the ignore match.
export default {
  "**/*.js": (files) => {
    const lintable = files.filter((f) => !f.includes("/.claude/workflows/"));
    return [
      ...(lintable.length ? [`eslint --max-warnings 0 --fix ${lintable.join(" ")}`] : []),
      `prettier --write ${files.join(" ")}`,
    ];
  },
  "**/*.{json,md,css}": ["prettier --write"],
};
