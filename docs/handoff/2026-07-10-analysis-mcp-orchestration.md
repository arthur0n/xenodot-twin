# Orchestration plan — open item #8: analysis seam MCP surface

Companion to `2026-07-10-open-items.md` item 8 and the umbrella orchestration doc.
Origin: the analysis-seam plan (index item #5) named `mcp__ui__analyze` as the
natural phase-2 dispatch surface once the CLI path was proven — it was, end to
end, with a real non-Anthropic model. The CLI stays the canonical path; the MCP
tool makes the seam reachable from a Hive session (the UI).

## Working rules

- Branch: `feat/analysis-mcp` off `main` (post item-#7 merge, `2769053`).
- The five analysis-seam guardrails are INHERITED VERBATIM and must
  demonstrably hold on the new surface: (1) workers never write project files —
  framework writes only reports/analysis/; (2) output is advisory, never an
  action; (3) unconfigured → graceful no-op message; (4) every report names
  provider+model+bundle hash; (5) no machine-access toolsets on any worker path.
- Gating precedent: `mcp__ui__hermes` (Hive-gated registration + dispatch) —
  the analyze tool follows the same registration/consent shape; study
  hermes-tool.js and how the server registers/gates it.
- The tool wraps the EXISTING seam (analysis.js workers + report writer +
  bundle packager) — no duplicate logic; if the CLI and the tool would drift,
  extract the shared core first (the hermes-runs.js extraction is the
  precedent).
- Known limit carried (not this item's to fix): hermes-path model attribution
  echoes the config label; openai-compatible reports the endpoint's body.model.
- Live test reality: the Hermes gateway is DOWN and billable; the
  openai-compatible fake-server path is the test harness precedent. ONE real
  gateway call is authorized if the tool's E2E needs it (same one-call
  discipline as before), else fake-server + seam-level proof suffices.

## Single phase — implement + prove (subagent: Opus); scoped review after

Tool: `ui/server/mcp-tools/analyze-tool.js` (naming per siblings) — args
(task type from the whitelist, bundle path OR recording+bundling params
mirroring the CLI), dispatch through the existing worker selection, report
written by the framework, the tool's return = advisory summary + report path
(never the raw worker output as an "action"). Zod schemas per siblings; session
registration gated like hermes; tests per the fake-server battery precedent
(registration/gating, happy path, unconfigured, guardrail asserts, path
safety). Docs: twin-analyze SKILL gains the MCP dispatch note; CAPABILITIES if
that file covers MCP tools (check precedent — hermes/promote may not be listed
there; match). SEAMS row for the new upstream-adjacent file if applicable
(check whether mcp-tools/ additions are fork-only).

## Orchestrator gates

1. Line-by-line diff review.
2. Independent scoped review (guardrails 1–5 explicitly on the new surface).
3. UI test: the tool visible/registered in a live 8339 session's tool listing
   (orchestrator-verifiable via the server's tool registration output or an
   MCP listing endpoint — the established seam-level proof).
4. Merge no-ff, push, umbrella + open-items updated — then item #9.

## Status log

- [x] Implemented + reviewed — `e517ab4` (dispatch-core extraction; CLI a thin
      adapter, 30 tests untouched-green) + `28460d7` (tool: zod task whitelist,
      hermes-parity gating, advisory-only returns, 12-test fake-server battery,
      no billable call needed).
- [x] Scoped review (independent Opus): initial verdict revised by the
      reviewer's own re-trace — session.js autonomous/policy=all AUTO-ALLOW
      branches sit above the per-call gate, making the tool's unconstrained path
      params an arbitrary-file exfil primitive in unattended sessions (stronger
      than hermes: reads files the model doesn't have). Orchestrator ruled fix
      REQUIRED (human consulted: keep-the-fix chosen over docs-only). `e865f19`:
      confinePath realpath-first with deepest-existing-ancestor walk (symlink-safe
      incl. nonexistent leaf — tests caught a real macOS /var→/private/var edge),
      all four params confined on the tool surface only (CLI operator-privileged),
      5 adversarial tests, false "gated per call" language corrected in 7 places
      with the residual stated honestly. 202 tests green; orchestrator re-ran the
      tool suite independently (17/17).
- [x] UI/seat check: seat clone synced, 8339 restarted — server boots clean
      with the analyze tool registered (door 200).
- [x] Merged to main (no-ff `1072917`), pushed. Item #8 CLOSED.
