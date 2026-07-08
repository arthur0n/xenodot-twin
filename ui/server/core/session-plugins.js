// Pure resolution of a session's local-plugin list — the testable seam of buildMakeQuery's
// plugin gating (see session.test.js). Lives beside session.js (extracted to keep it under
// its line cap).
import { existsSync } from "node:fs";

/** The xenodot spine ALWAYS loads; the OPTIONAL Codex reviewer is appended only when enabled
 * AND vendored on disk; the OPTIONAL xenodot-twin viewer plugin is appended only when the
 * project is a viewer AND the plugin exists on disk — repo boundary ≠ load boundary, so a game
 * session never loads twin capabilities. Gating is array inclusion (the SDK has no per-plugin
 * enable flag, and `plugins` only accepts `{ type: "local" }`).
 * @param {{ baseDir: string, projectType: string, twinDir: string, codexEnabled: boolean, codexDir: string }} p
 * @returns {import("@anthropic-ai/claude-agent-sdk").SdkPluginConfig[]} */
export function resolveSessionPlugins({ baseDir, projectType, twinDir, codexEnabled, codexDir }) {
  /** @type {import("@anthropic-ai/claude-agent-sdk").SdkPluginConfig[]} */
  const plugins = [{ type: "local", path: baseDir, skipMcpDiscovery: true }];
  if (codexEnabled && existsSync(codexDir)) {
    plugins.push({ type: "local", path: codexDir, skipMcpDiscovery: true });
  }
  if (projectType === "viewer" && existsSync(twinDir)) {
    plugins.push({ type: "local", path: twinDir, skipMcpDiscovery: true });
  }
  return plugins;
}
