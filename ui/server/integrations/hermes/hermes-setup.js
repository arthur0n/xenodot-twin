// Guided one-shot Hermes setup — sets every value NON-INTERACTIVELY so you never get
// stuck in the `hermes setup` wizard. End to end:
//
//   1. install Hermes if it's missing (official installer, only after you say yes),
//   2. turn the local API server on in ~/.hermes/.env (API_SERVER_ENABLED + a key it
//      generates — the non-billable API_SERVER_KEY, see HERMES.md),
//   3. set the provider with `hermes config set` (a scalar — that command works for those),
//   4. restrict the toolset by editing config.yaml DIRECTLY (default: web, search, memory,
//      skills — NO terminal/file/code_execution/browser). `memory` + `skills` are Hermes' OWN
//      brain (its episodic memory + self-evolving skills, written to ~/.hermes/) — they let
//      Hermes get better at researching FOR us over time without ever touching the game or our
//      framework files (that needs terminal/file/code, which stay OFF). The API server runs as
//      platform `api_server` and its tools execute ON THIS MACHINE, so we constrain
//      `platform_toolsets.api_server` (the only key the bridge's path reads — not `cli`, not the
//      top-level `toolsets:`). `config set` can't write lists, so this is a direct YAML edit,
//   5. read the file back and print the real values (no silent state),
//   6. strip any stale `mcp_servers.xenodot` callback from older Xenodot versions (the bridge no
//      longer uses an MCP callback — findings are READ from the runs API; see hermes-tool.js),
//   7. install the Xenodot "partner" persona into ~/.hermes/SOUL.md (only if it's absent or
//      the stock template — a SOUL you've customized is never overwritten),
//   8. wire Xenodot's .xenodot.json and print the remaining manual steps.
//
// This script NEVER launches an interactive Hermes command (`hermes setup`, `hermes
// model`, `hermes tools`) — those are the wizards that trap you and won't let you
// uncheck tools. Nous Portal auth (a browser OAuth) is the one thing you run yourself;
// the script just tells you the non-wizard command for it (`hermes portal`).
//
// Usage: npm run hermes:setup                          guided (only prompt: install y/N)
//        npm run hermes:setup -- --yes                 assume yes (auto-install)
//        npm run hermes:setup -- --provider=anthropic --model=anthropic/claude-opus-4.6
//        npm run hermes:setup -- --toolsets=web,search,memory   override the allowlist
//        npm run hermes:setup -- --no-portal           don't print the Nous Portal note
//        npm run hermes:setup -- --port=8642 --key=secret
//        npm run hermes:setup -- --reset               UNDO the setup (test the flow from scratch)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseJSON } from "../../../lib/json.js";
import { saveHermesConfig, CONFIG_FILE } from "../../core/config.js";
import { isLegacySoul } from "./hermes-soul-legacy.js";

const argv = process.argv.slice(2);
/** @param {string} n @returns {boolean} */
const flag = (n) => argv.includes(`--${n}`);
/** @param {string} n @returns {string | undefined} */
const val = (n) =>
  argv
    .find((a) => a.startsWith(`--${n}=`))
    ?.split("=")
    .slice(1)
    .join("=");

const ASSUME_YES = flag("yes");
const RESET = flag("reset");
const HERMES_DIR = path.join(homedir(), ".hermes");
const ENV_FILE = path.join(HERMES_DIR, ".env");
const SOUL_FILE = path.join(HERMES_DIR, "SOUL.md");
// The repo's source of truth for the "partner" persona, installed into ~/.hermes/SOUL.md.
const SOUL_TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "hermes-soul.md");
const PORT = val("port") ?? "8642";
const URL = `http://localhost:${PORT}`;
const INSTALL_CMD = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";

// Defaults: Nous via Portal, and a worker toolset (research + self-improvement) that
// deliberately leaves out machine access. --model is optional: if omitted we set the provider
// only and let you pick the exact model with `hermes model` (the model id strings are provider-
// and version-specific, so we don't guess one for you). Override anything with a flag.
const PROVIDER = val("provider") ?? "nous";
const MODEL = val("model");
// SAFE DEFAULT: research + Hermes' OWN brain, no machine access. `web`/`search` research;
// `memory` + `skills` are Hermes' own episodic memory + self-evolving skills (written to
// ~/.hermes/ — NOT to the game or our framework), so Hermes gets better at researching for us
// across runs. The API path runs tools ON THIS MACHINE (gateway capabilities:
// tool_execution=server), so the things that could change the game/code —
// terminal/file/code_execution/browser — stay OFF by default. Widen with --toolsets
// (e.g. --toolsets=web,search,memory,skills,terminal,file) ONLY if you knowingly want that.
const TOOLSETS = val("toolsets") ?? "web,search,memory,skills";
const USE_PORTAL = (PROVIDER === "nous" || PROVIDER === "portal") && !flag("no-portal");

/** Ask a yes/no-ish question; with --yes, auto-answer "y".
 * @param {import("node:readline/promises").Interface} rl @param {string} q @returns {Promise<string>} */
async function ask(rl, q) {
  if (ASSUME_YES) return "y";
  return (await rl.question(q)).trim().toLowerCase();
}

/** @param {string} a @returns {boolean} */
const yes = (a) => a === "y" || a === "yes";

/** Is the global `hermes` command on PATH? @returns {boolean} */
function hermesInstalled() {
  return spawnSync("hermes", ["--version"], { stdio: "ignore" }).status === 0;
}

/** `hermes config set KEY VALUE`, logging the outcome. @param {string} key @param {string} value */
function configSet(key, value) {
  const ok = spawnSync("hermes", ["config", "set", key, value], { stdio: "ignore" }).status === 0;
  console.log(`  ${ok ? "✓" : "✗"} ${key} = ${value}`);
  return ok;
}

/** Absolute path to Hermes' config.yaml (`hermes config path`), or null. @returns {string | null} */
function configPath() {
  const r = spawnSync("hermes", ["config", "path"], { encoding: "utf8" });
  const p = (r.stdout ?? "").trim();
  return p && existsSync(p) ? p : null;
}

/** Index of `  child:` under top-level `parent:`, or -1 (and the parent's index via `out`).
 * @param {string[]} lines @param {string} parent @param {string} child @param {{p:number}} out @returns {number} */
function findNested(lines, parent, child, out) {
  out.p = lines.findIndex((l) => l === `${parent}:`);
  if (out.p === -1) return -1;
  for (let c = out.p + 1; c < lines.length && !/^[a-zA-Z]/.test(lines[c] ?? ""); c++) {
    if ((lines[c] ?? "").startsWith(`  ${child}:`)) return c;
  }
  return -1;
}

/** Insert or replace `parent:` → `  child: [a, b]` (a real YAML flow list), in place.
 * @param {string[]} lines @param {string} parent @param {string} child @param {string[]} arr @returns {boolean} */
function upsertNestedFlowList(lines, parent, child, arr) {
  const out = { p: -1 };
  const c = findNested(lines, parent, child, out);
  if (out.p === -1) return false;
  const entry = `  ${child}: [${arr.join(", ")}]`;
  if (c === -1) {
    lines.splice(out.p + 1, 0, entry); // absent → insert right under the parent
    return true;
  }
  let end = c + 1; // present → replace it + any following block items
  while (end < lines.length && /^ {2}- /.test(lines[end] ?? "")) end++;
  lines.splice(c, end - c, entry);
  return true;
}

/** Remove `parent:` → `  child:` (and any following block items), in place.
 * @param {string[]} lines @param {string} parent @param {string} child @returns {boolean} */
function removeNested(lines, parent, child) {
  const out = { p: -1 };
  const c = findNested(lines, parent, child, out);
  if (c === -1) return false;
  let end = c + 1;
  while (end < lines.length && /^ {2}- /.test(lines[end] ?? "")) end++;
  lines.splice(c, end - c);
  return true;
}

/** Scalar value of `  child:` under top-level `parent:`, or "(unset)".
 * @param {string[]} lines @param {string} parent @param {string} child @returns {string} */
function scalarUnder(lines, parent, child) {
  const p = lines.findIndex((l) => l === `${parent}:`);
  if (p === -1) return "(unset)";
  const prefix = `  ${child}:`;
  for (let i = p + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^[a-zA-Z]/.test(line)) break; // left the parent block
    if (line.startsWith(prefix)) {
      const v = line.slice(prefix.length).trim();
      return v.length ? v : "(empty)";
    }
  }
  return "(unset)";
}

/** First value of KEY=... in a .env text, or null. @param {string} text @param {string} key @returns {string | null} */
function envValue(text, key) {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith(`${key}=`)) return t.slice(key.length + 1).trim();
  }
  return null;
}

/** Set KEY=value in a .env text, replacing the first match or appending; everything
 * else is preserved. @param {string} text @param {string} key @param {string} value @returns {string} */
function upsertEnv(text, key, value) {
  const entry = `${key}=${value}`;
  const lines = text.length ? text.replace(/\n$/, "").split("\n") : [];
  let found = false;
  const out = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return entry;
    }
    return line;
  });
  if (!found) out.push(entry);
  return out.join("\n") + "\n";
}

/** Ensure Hermes is installed, offering to run the official installer.
 * @param {import("node:readline/promises").Interface} rl @returns {Promise<boolean>} */
async function ensureInstalled(rl) {
  if (hermesInstalled()) {
    console.log("✓ hermes is installed.");
    return true;
  }
  console.log("hermes is not on your PATH. The official installer will run:");
  console.log(`    ${INSTALL_CMD}\n`);
  if (!yes(await ask(rl, "Run it now? [y/N] "))) {
    console.log("Skipped. Install Hermes yourself, then re-run `npm run hermes:setup`.");
    return false;
  }
  if (spawnSync("bash", ["-c", INSTALL_CMD], { stdio: "inherit" }).status !== 0) {
    console.error("Installer failed — see the output above.");
    return false;
  }
  if (!hermesInstalled()) {
    console.log("\nInstalled, but `hermes` isn't on PATH in THIS shell yet.");
    console.log("Open a new terminal (or reload your shell), then re-run `npm run hermes:setup`.");
    return false;
  }
  return true;
}

/** Set to true when ensureEnv mints a brand-new key — a running gateway must then be
 * restarted to pick it up (it reads the key once at startup). Drives the warning in printNext. */
let KEY_GENERATED = false;

/** Turn the local API server on in ~/.hermes/.env and return the API_SERVER_KEY
 * (--key, else the existing one, else a fresh random one). @returns {string} */
function ensureEnv() {
  mkdirSync(HERMES_DIR, { recursive: true });
  let text = "";
  try {
    text = readFileSync(ENV_FILE, "utf8");
  } catch {
    /* no .env yet — start fresh */
  }
  let key = val("key") ?? envValue(text, "API_SERVER_KEY");
  if (key) {
    console.log("Reusing the existing API_SERVER_KEY in ~/.hermes/.env.");
  } else {
    key = randomBytes(24).toString("hex");
    KEY_GENERATED = true;
    console.log("Generated a new API_SERVER_KEY (local gateway password, not billable).");
  }
  text = upsertEnv(text, "API_SERVER_ENABLED", "true");
  text = upsertEnv(text, "API_SERVER_KEY", key);
  text = upsertEnv(text, "API_SERVER_PORT", PORT);
  writeFileSync(ENV_FILE, text, { mode: 0o600 });
  console.log(`✓ API server enabled → ${ENV_FILE}`);
  return key;
}

/** Set provider (scalar, via config set) + the restricted toolset (a real YAML list, via a
 * direct config.yaml edit — `config set` can only store scalars, so it would write the list
 * as a broken string). We set BOTH the top-level `toolsets:` (the default the runs/API path
 * falls back to — there is no `api` platform key) AND `platform_toolsets.cli`. Prints the
 * resulting values by reading the file back, so nothing is silent. */
function configureModelAndTools() {
  console.log(`\nProvider + tools (non-interactive, no wizard):`);
  configSet("model.provider", PROVIDER);
  if (MODEL) configSet("model.default", MODEL);

  const arr = TOOLSETS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cfg = configPath();
  if (!cfg) {
    console.log("  ✗ couldn't locate config.yaml — restrict tools via `hermes config edit`.");
    return;
  }
  const lines = readFileSync(cfg, "utf8").split("\n");
  copyFileSync(cfg, `${cfg}.xenodot.bak`);
  // The Xenodot bridge talks to the API server, whose platform is `api_server` — NOT `cli`
  // and NOT the top-level `toolsets:`. This is the ONLY key that constrains our path.
  const ok = upsertNestedFlowList(lines, "platform_toolsets", "api_server", arr);
  writeFileSync(cfg, lines.join("\n"));
  console.log(
    `  ${ok ? "✓" : "✗"} API-path tools (platform_toolsets.api_server) → ${arr.join(", ")}`,
  );
  console.log(
    "    memory + skills = Hermes' own brain (self-improvement, written to ~/.hermes/ — not your code).",
  );
  console.log(
    "    terminal/file/code_execution/browser stay OFF unless you list them (they run on THIS machine).",
  );

  const after = readFileSync(cfg, "utf8").split("\n");
  console.log(`  model.provider: ${scalarUnder(after, "model", "provider")}`);
  console.log(`  model.default:  ${scalarUnder(after, "model", "default")}`);
  if (scalarUnder(after, "model", "default").includes("stepfun")) {
    console.log("  ⚠ model.default is a leftover free model — `hermes model` to pick a Nous one.");
  }
  console.log(
    "  Confirm live once the gateway runs: `npm run hermes:check` lists the enabled tools.",
  );
}

/** Strip any leftover Hive-side MCP callback registration from older Xenodot versions. The bridge
 * no longer uses a callback — Hermes' runs API has none; findings are READ from GET /v1/runs/{id}
 * (see hermes-tool.js) — so `mcp_servers.xenodot` is dead config. `hermes mcp remove` edits the
 * YAML correctly; this is idempotent (a no-op when there's nothing to remove). */
function removeLegacyCallback() {
  const r = spawnSync("hermes", ["mcp", "remove", "xenodot"], { stdio: "ignore" });
  if (r.status === 0) {
    console.log("\n✓ Removed a stale Hermes→Xenodot MCP callback (the bridge no longer uses one).");
  }
}

/** True when SOUL.md carries no real persona content — the stock template (a heading + the
 * help comment) or an empty file — so it's safe to replace. @param {string} text @returns {boolean} */
function soulIsDefault(text) {
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, "") // strip HTML comments (the stock help block)
    .replace(/^#.*$/gm, "") // strip markdown headings
    .trim();
  return stripped.length === 0;
}

/** Install the Xenodot "partner" persona into ~/.hermes/SOUL.md from the repo template, but
 * ONLY when SOUL is absent, empty, or the stock template — a SOUL you've customized is left
 * untouched (delete it to opt back in). Idempotent: re-running reports "unchanged". SOUL is a
 * shared, mode-neutral base; the per-call personas (Researcher/Critic) layer their role on top. */
function ensureSoul() {
  let template;
  try {
    template = readFileSync(SOUL_TEMPLATE, "utf8");
  } catch {
    console.log(
      "• Skipped SOUL.md (repo template ui/server/integrations/hermes/hermes-soul.md not found).",
    );
    return;
  }
  /** @type {string | null} */
  let existing = null;
  try {
    existing = readFileSync(SOUL_FILE, "utf8");
  } catch {
    /* absent — we'll install it */
  }
  if (existing !== null && existing.trim() === template.trim()) {
    console.log("✓ SOUL.md is already the Xenodot partner persona (unchanged).");
    return;
  }
  // A SOUL that verbatim-matches a PRIOR shipped Xenodot template is OURS (an old version), not the
  // user's — upgrade it in place so a reworded template reaches machines set up before the change.
  // (An old template has real content → fails soulIsDefault → would otherwise be mistaken for a
  // custom SOUL and never updated; see hermes-soul-legacy.js.) Trimmed compare, same mechanism as
  // the current-template check above.
  if (existing !== null && isLegacySoul(existing)) {
    mkdirSync(HERMES_DIR, { recursive: true });
    writeFileSync(SOUL_FILE, template);
    console.log(
      `✓ Replaced a legacy Xenodot soul template → ${SOUL_FILE} (updated to the current one).`,
    );
    return;
  }
  if (existing !== null && !soulIsDefault(existing)) {
    console.log(
      `• Kept your custom ${SOUL_FILE} — delete it to install the Xenodot partner persona.`,
    );
    return;
  }
  mkdirSync(HERMES_DIR, { recursive: true });
  writeFileSync(SOUL_FILE, template);
  console.log(`✓ Installed the Xenodot partner persona → ${SOUL_FILE}`);
}

/** Print the non-wizard auth steps for the chosen provider. We deliberately NEVER spawn an
 * interactive Hermes command — `hermes setup`/`model`/`tools` are exactly what trap you. */
function printAuthGuidance() {
  if (USE_PORTAL) {
    console.log(
      "\nNous models need a one-time Portal sign-in (browser OAuth) — do it WITHOUT the wizard:",
    );
    console.log("  hermes portal status     # are you already authed?");
    console.log("  hermes portal open       # opens the Portal page to sign in / subscribe");
    console.log("  hermes model             # (optional) pick the exact Nous model");
    return;
  }
  console.log(`\nProvider "${PROVIDER}" needs its API key in ~/.hermes/.env:`);
  console.log("  hermes auth add          # add the provider key (non-wizard), then:");
  console.log("  hermes config get model  # verify provider + model");
}

/** Point Xenodot at the local gateway (enabled, URL, the API_SERVER_KEY). @param {string} key */
function wireXenodot(key) {
  const res = saveHermesConfig({ enabled: true, apiUrl: URL, apiKey: key, model: MODEL });
  if ("error" in res) {
    console.error(`Failed to save Xenodot config: ${res.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✓ Xenodot wired → ${CONFIG_FILE} (enabled · ${URL} · key saved)`);
}

/** Drop every `KEY=...` line from a .env text. @param {string} text @param {string} key @returns {string} */
function removeEnvKey(text, key) {
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith(`${key}=`))
    .join("\n");
}

/** Remove the `hermes` block from .xenodot.json, leaving every other field intact. */
function unwireXenodot() {
  /** @type {Record<string, unknown>} */
  let saved;
  try {
    saved = /** @type {Record<string, unknown>} */ (parseJSON(readFileSync(CONFIG_FILE, "utf8")));
  } catch {
    console.log("• No .xenodot.json — nothing to unwire.");
    return;
  }
  if (saved.hermes === undefined) {
    console.log("• .xenodot.json has no hermes block (already clean).");
    return;
  }
  delete saved.hermes;
  writeFileSync(CONFIG_FILE, JSON.stringify(saved, null, 2) + "\n");
  console.log(`✓ Removed hermes block from ${CONFIG_FILE}`);
}

/** Undo everything `npm run hermes:setup` wrote, so the flow can be tested from scratch:
 * Xenodot's hermes block, the API_SERVER_* lines in ~/.hermes/.env, the toolset edits in
 * config.yaml (back to Hermes' [hermes-cli] default), the mcp_servers.xenodot callback
 * registration, and the partner SOUL.md (only if it's still unmodified). Leaves Hermes installed
 * and your model / provider / Portal auth untouched. */
function resetSetup() {
  console.log("Xenodot · removing the Hermes setup\n");
  unwireXenodot();

  try {
    // Disable the API server, but KEEP API_SERVER_KEY: it's the gateway's password, loaded
    // once at gateway startup. Churning it would make a running gateway reject the new key
    // until you restart it. Keeping it stable means reset→setup cycles need no restart.
    const text = readFileSync(ENV_FILE, "utf8");
    const next = removeEnvKey(text, "API_SERVER_ENABLED");
    if (next === text) {
      console.log("• ~/.hermes/.env already has no API_SERVER_ENABLED.");
    } else {
      writeFileSync(ENV_FILE, next, { mode: 0o600 });
      console.log(
        `✓ Disabled API server in ${ENV_FILE} (kept API_SERVER_KEY — gateway stays valid).`,
      );
    }
  } catch {
    console.log("• No ~/.hermes/.env — nothing to clean.");
  }

  const cfg = configPath();
  if (cfg) {
    const lines = readFileSync(cfg, "utf8").split("\n");
    const r = removeNested(lines, "platform_toolsets", "api_server");
    writeFileSync(cfg, lines.join("\n"));
    console.log(
      `${r ? "✓" : "•"} Removed platform_toolsets.api_server (API path back to Hermes default).`,
    );
  }

  // Remove the MCP callback registration (its whole mcp_servers.xenodot block). `hermes mcp
  // remove` edits the YAML correctly; its toolset alias was already dropped with api_server above.
  {
    const r = spawnSync("hermes", ["mcp", "remove", "xenodot"], { stdio: "ignore" });
    console.log(
      r.status === 0
        ? "✓ Removed the mcp_servers.xenodot callback registration."
        : "• No mcp_servers.xenodot to remove (already clean).",
    );
  }

  // Remove the partner SOUL.md, but only if it's still ours (unmodified) — a SOUL you edited
  // stays. Gone → Hermes uses its built-in default, and a later setup re-installs it.
  try {
    const soul = readFileSync(SOUL_FILE, "utf8");
    const template = readFileSync(SOUL_TEMPLATE, "utf8");
    if (soul.trim() === template.trim()) {
      rmSync(SOUL_FILE);
      console.log("✓ Removed the Xenodot partner SOUL.md (back to Hermes' built-in default).");
    } else {
      console.log(`• Left ${SOUL_FILE} in place (you customized it).`);
    }
  } catch {
    /* no SOUL.md or no repo template — nothing to undo */
  }

  console.log("\nDone. Re-run `npm run hermes:setup` to test the flow from scratch.");
  console.log("(Hermes itself, plus your model / provider / Portal auth, are untouched.)");
}

function printNext() {
  console.log("\nAlmost done — bring Hermes up:");
  console.log("  1. `npm start` — serves the UI; it also auto-starts `hermes gateway` when Hermes");
  console.log("     is enabled (skipped if one is already up). Or run `hermes gateway` yourself.");
  if (KEY_GENERATED) {
    console.log("     (A new API_SERVER_KEY was generated — restart any already-running gateway.)");
  }
  console.log("  2. Verify the link:  npm run hermes:check   (⚙ Settings → Test connection too)");
  console.log("\nThen give the Hive a research task and approve the Hermes call: it runs in the");
  console.log("background, streams progress, and delivers its findings back into your feed.");
}

async function main() {
  if (RESET) {
    resetSetup();
    return;
  }
  console.log("Xenodot · guided Hermes setup (no wizard)\n");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!(await ensureInstalled(rl))) return;
    const key = ensureEnv();
    configureModelAndTools();
    removeLegacyCallback();
    ensureSoul();
    printAuthGuidance();
    wireXenodot(key);
    printNext();
  } finally {
    rl.close();
  }
}

await main();
