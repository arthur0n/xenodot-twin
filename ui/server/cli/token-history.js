// token-history.js — the token loop's PERMANENT measurement store (the "token wiki").
//
// Deliberately SELF-CONTAINED: its own ~12-line NDJSON parser, no import of the framework's
// usage.js/parseSession. The token loop must be able to evolve its own metrics without touching
// framework http internals — the trivial parse duplication buys zero cross-domain coupling, so
// a D5 dedup sweep should leave it alone. This is the token domain, not the framework.
//
// Source of truth = .claude/token-audits/history.json (append-only; NEVER pruned — it is history,
// the opposite lifecycle to the ephemeral framework-audit ledger). history.md is a generated view.
//
//   node ui/server/cli/token-history.js append   --sessions a,b --offender "…" --opp id:55000 --note "…" [--date YYYY-MM-DD]
//   node ui/server/cli/token-history.js snapshot  --sessions a,b            # print metrics JSON, write nothing (fix-arm BEFORE/AFTER)
//   node ui/server/cli/token-history.js snapshot  --global                  # print the global snapshot
//   node ui/server/cli/token-history.js land      --opp id --moved true|false|pending [--delta-tok N] [--delta-cost N] [--result "…"]

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOG_DIR = path.join(ROOT, "logs");
const DIR = path.join(ROOT, ".claude/token-audits");
const JSON_PATH = path.join(DIR, "history.json");
const MD_PATH = path.join(DIR, "history.md");

/** @typedef {{ message?: { usage?: { input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number, cache_read_input_tokens?: number }, total_cost_usd?: number } }} LogLine */
/** @typedef {{ id: string, estSavingTok: number|null, landed: boolean, moved: boolean|"pending"|null, deltaTok: number|null, deltaCost: number|null, result: string|null }} Opportunity */
/** @typedef {{ input: number, output: number, cacheCreate: number, cacheRead: number, cost: number, total: number, turns: number, hitRate: number, costPerSession: number, costPerTurn: number }} Covered */
/** @typedef {{ cost: number, total: number, hitRate: number, sessionCount: number }} GlobalSnap */
/** @typedef {{ date: string, sessions: string[], covered: Covered, global: GlobalSnap, topOffender: string, opportunities: Opportunity[], processNote: string }} RunRecord */
/** @typedef {{ _doc?: string, records: RunRecord[] }} History */

const r4 = (/** @type {number} */ n) => Math.round(n * 1e4) / 1e4;
const hit = (/** @type {number} */ cr, /** @type {number} */ cc) =>
  cr + cc > 0 ? Math.round((100 * cr) / (cr + cc)) : 0;

/**
 * Sum one session log. `message.usage` + `message.total_cost_usd` live on the SDK `result`
 * events (one per turn), so summing usage-bearing lines yields the session total and `turns`.
 * @param {string} file
 * @returns {{ input: number, output: number, cacheCreate: number, cacheRead: number, cost: number, turns: number }}
 */
function parseSession(file) {
  let input = 0,
    output = 0,
    cacheCreate = 0,
    cacheRead = 0,
    cost = 0,
    turns = 0;
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const m = /** @type {LogLine} */ (parseJSON(line))?.message;
        if (!m) continue;
        cost += m.total_cost_usd ?? 0;
        const u = m.usage;
        if (!u) continue;
        turns += 1;
        input += u.input_tokens ?? 0;
        output += u.output_tokens ?? 0;
        cacheCreate += u.cache_creation_input_tokens ?? 0;
        cacheRead += u.cache_read_input_tokens ?? 0;
      } catch {}
    }
  } catch {}
  return { input, output, cacheCreate, cacheRead, cost, turns };
}

/**
 * Metrics for exactly the covered session tags.
 * @param {string[]} tags
 * @returns {Covered}
 */
function measure(tags) {
  let input = 0,
    output = 0,
    cacheCreate = 0,
    cacheRead = 0,
    cost = 0,
    turns = 0;
  for (const tag of tags) {
    const s = parseSession(path.join(LOG_DIR, `session-${tag}.ndjson`));
    input += s.input;
    output += s.output;
    cacheCreate += s.cacheCreate;
    cacheRead += s.cacheRead;
    cost += s.cost;
    turns += s.turns;
  }
  const total = input + output + cacheCreate + cacheRead;
  return {
    input,
    output,
    cacheCreate,
    cacheRead,
    cost: r4(cost),
    total,
    turns,
    hitRate: hit(cacheRead, cacheCreate),
    costPerSession: tags.length ? r4(cost / tags.length) : 0,
    costPerTurn: turns ? r4(cost / turns) : 0,
  };
}

/**
 * Snapshot of ALL session logs — the longitudinal trend line.
 * @returns {GlobalSnap}
 */
function globalSnapshot() {
  let files = /** @type {string[]} */ ([]);
  try {
    files = readdirSync(LOG_DIR).filter((f) => f.endsWith(".ndjson"));
  } catch {}
  let cost = 0,
    total = 0,
    cacheCreate = 0,
    cacheRead = 0,
    sessionCount = 0;
  for (const f of files) {
    const s = parseSession(path.join(LOG_DIR, f));
    const t = s.input + s.output + s.cacheCreate + s.cacheRead;
    if (t <= 0) continue;
    sessionCount += 1;
    cost += s.cost;
    total += t;
    cacheCreate += s.cacheCreate;
    cacheRead += s.cacheRead;
  }
  return { cost: r4(cost), total, hitRate: hit(cacheRead, cacheCreate), sessionCount };
}

/** @returns {History} */
function loadHistory() {
  if (!existsSync(JSON_PATH)) {
    return {
      _doc: "PERMANENT token-spend time-series (the token wiki). Append-only — never prune; this is history. Edit via `npm run token-history` (append/land), never by hand. history.md is generated. Separate domain from .claude/framework-audits (linked by reference only).",
      records: [],
    };
  }
  const h = /** @type {History} */ (parseJSON(readFileSync(JSON_PATH, "utf8")));
  if (!Array.isArray(h.records)) h.records = [];
  return h;
}

/** @param {History} h */
function save(h) {
  writeFileSync(JSON_PATH, JSON.stringify(h, null, 2) + "\n");
  renderMd(h);
}

/** @param {History} h */
function renderMd(h) {
  const md = [];
  md.push(
    "<!-- GENERATED from history.json by `npm run token-history` — DO NOT EDIT; edit via the CLI. -->",
  );
  md.push("");
  md.push("# Token history — spend trend");
  md.push("");
  md.push(
    "> PERMANENT append-only time-series (opposite of the ephemeral framework-audit ledger). " +
      "Each run covers different sessions, so raw covered cost is NOT the trend — the comparable " +
      "signals are the NORMALIZED columns (hitRate, $/turn) and the **global** snapshot line.",
  );
  md.push("");
  md.push("## Trend (newest first)");
  md.push("");
  md.push(
    "| date | #sess | covered $ | tok | hit% | $/sess | $/turn | global $ | global tok | global hit% |",
  );
  md.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const rec of [...h.records].reverse()) {
    const c = rec.covered,
      g = rec.global;
    md.push(
      `| ${rec.date} | ${rec.sessions.length} | ${c.cost} | ${(c.total / 1000).toFixed(0)}k | ${c.hitRate} | ${c.costPerSession} | ${c.costPerTurn} | ${g.cost} | ${(g.total / 1000).toFixed(0)}k | ${g.hitRate} |`,
    );
  }
  md.push("");
  md.push("## Opportunities (did the fix move the metric?)");
  md.push("");
  const opps = h.records.flatMap((rec) => rec.opportunities.map((o) => ({ date: rec.date, o })));
  if (!opps.length) {
    md.push("_none yet_");
  } else {
    md.push("| filed | id | est tok | landed | moved | Δtok | Δ$ | result |");
    md.push("|---|---|--:|:-:|:-:|--:|--:|---|");
    for (const { date, o } of opps) {
      const moved = o.moved === null ? "—" : String(o.moved);
      md.push(
        `| ${date} | ${o.id} | ${o.estSavingTok ?? "—"} | ${o.landed ? "✓" : "—"} | ${moved} | ${o.deltaTok ?? "—"} | ${o.deltaCost ?? "—"} | ${o.result ?? "—"} |`,
      );
    }
  }
  md.push("");
  writeFileSync(MD_PATH, md.join("\n") + "\n");
}

// ---- arg parsing ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = argv[0];
/** @type {Record<string, string>} */
const flags = {};
/** @type {string[]} */
const opps = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (!a?.startsWith("--")) continue;
  const key = a.slice(2);
  const nxt = argv[i + 1];
  let val = "true";
  if (nxt !== undefined && !nxt.startsWith("--")) {
    val = nxt;
    i++;
  }
  if (key === "opp") opps.push(val);
  else flags[key] = val;
}
const csv = (/** @type {string|undefined} */ v) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/**
 * @param {string} msg
 * @returns {never}
 */
function die(msg) {
  console.error(`token-history: ${msg}`);
  process.exit(1);
}

if (cmd === "snapshot") {
  const out = flags.global ? globalSnapshot() : measure(csv(flags.sessions));
  console.log(JSON.stringify(out, null, 2));
} else if (cmd === "append") {
  const sessions = csv(flags.sessions);
  if (!sessions.length) die("append needs --sessions a,b,c");
  const date = flags.date ?? new Date().toISOString().slice(0, 10);
  /** @type {Opportunity[]} */
  const opportunities = opps.map((spec) => {
    const parts = spec.split(":");
    const est = parts[1];
    return {
      id: parts[0] ?? "",
      estSavingTok: est ? Number(est) : null,
      landed: false,
      moved: /** @type {boolean|"pending"|null} */ (null),
      deltaTok: /** @type {number|null} */ (null),
      deltaCost: /** @type {number|null} */ (null),
      result: /** @type {string|null} */ (null),
    };
  });
  /** @type {RunRecord} */
  const rec = {
    date,
    sessions,
    covered: measure(sessions),
    global: globalSnapshot(),
    topOffender: flags.offender ?? "",
    opportunities,
    processNote: flags.note ?? "",
  };
  const h = loadHistory();
  h.records.push(rec);
  save(h);
  console.log(
    `ok  token-history: appended ${date} (${sessions.length} sessions, covered $${rec.covered.cost}, global hit ${rec.global.hitRate}%) → history.json + history.md`,
  );
} else if (cmd === "land") {
  const id = opps[0];
  if (!id) die("land needs --opp <id>");
  const h = loadHistory();
  /** @type {Opportunity|null} */
  let hitOne = null;
  for (let i = h.records.length - 1; i >= 0 && !hitOne; i--) {
    const rec = h.records[i];
    if (rec) hitOne = rec.opportunities.find((o) => o.id === id) ?? null;
  }
  if (!hitOne) die(`no opportunity with id "${id}" in history.json`);
  const o = /** @type {Opportunity} */ (hitOne);
  o.landed = true;
  if (flags.moved !== undefined)
    o.moved = flags.moved === "pending" ? "pending" : flags.moved === "true";
  if (flags["delta-tok"] !== undefined) o.deltaTok = Number(flags["delta-tok"]);
  if (flags["delta-cost"] !== undefined) o.deltaCost = r4(Number(flags["delta-cost"]));
  if (flags.result !== undefined) o.result = flags.result;
  save(h);
  console.log(`ok  token-history: landed ${id} (moved=${o.moved}) → history.json + history.md`);
} else {
  die(`unknown command "${cmd ?? ""}" — use: append | snapshot | land`);
}
