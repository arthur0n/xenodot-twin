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
//   node ui/server/cli/token-history.js pending   [--json]                # list opportunities awaiting confirmation
//   node ui/server/cli/token-history.js render                           # regenerate history.md + history.html (the daily dashboard)
//   node ui/server/cli/token-history.js pending    [--json]                 # list every opportunity still moved:"pending" so no forward-looking fix rots unconfirmed

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../../lib/json.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LOG_DIR = path.join(ROOT, "logs");
const DIR = path.join(ROOT, ".claude/token-audits");
const JSON_PATH = path.join(DIR, "history.json");
const MD_PATH = path.join(DIR, "history.md");
const HTML_PATH = path.join(DIR, "history.html");

const esc = (/** @type {unknown} */ s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const commas = (/** @type {number} */ n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

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
  renderHtml(h);
}

/** State of one opportunity, for the dashboard's colour + label.
 * @param {Opportunity} o @returns {{ k: string, label: string }} */
function oppState(o) {
  if (o.moved === true) return { k: "good", label: "confirmed — it moved" };
  if (o.moved === false) return { k: "bad", label: "landed — no move" };
  if (o.moved === "pending") return { k: "pending", label: "pending confirmation" };
  return { k: "todo", label: "filed — not applied" };
}

const HTML_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#0e1116; color:#d7dde5; }
  .wrap { max-width:1080px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:19px; margin:0 0 2px; color:#fff; }
  .meta { color:#8b96a5; font-size:12.5px; margin:0 0 18px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:24px; }
  .tile { background:#141922; border:1px solid #232c3b; border-radius:9px; padding:13px 15px; }
  .tile .v { font-size:22px; font-weight:700; color:#fff; }
  .tile .k { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#8b96a5; margin-top:3px; }
  .tile .s { font-size:11px; color:#6b7686; margin-top:1px; }
  h2 { font-size:14px; border-bottom:1px solid #232c3b; padding-bottom:7px; margin:26px 0 12px; color:#eaf0f6; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid #1c2531; }
  th { color:#8b96a5; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
  .d { font-size:10.5px; margin-left:3px; }
  .d.up { color:#4ade80; } .d.dn { color:#f87171; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:10px; }
  .opp { background:#141922; border:1px solid #232c3b; border-left:3px solid #3a4658; border-radius:8px; padding:11px 13px; }
  .opp.s-pending { border-left-color:#ffb454; } .opp.s-todo { border-left-color:#4aa8e0; }
  .opp.s-good { border-left-color:#4ade80; } .opp.s-bad { border-left-color:#f87171; }
  .opp header { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
  .opp code { font-weight:700; color:#fff; font-size:12.5px; }
  .opp .st { margin-left:auto; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:#aeb9c8; }
  .opp .m { margin:0; color:#93a0b1; font-size:11.5px; }
  .opp .r { margin:6px 0 0; color:#c2cbd6; font-size:12px; }
  .opp .delta { color:#4ade80; }
  .empty { color:#6b7686; }
  footer { margin-top:30px; color:#5f6a7a; font-size:11.5px; }`;

/** A ▲/▼ delta chip, green when the move is in the good direction.
 * @param {number|null} d @param {boolean} goodUp @returns {string} */
function deltaArrow(d, goodUp) {
  if (d === null || d === 0) return "";
  const up = d > 0;
  const mag = Math.abs(d) < 1 ? Math.abs(d).toFixed(3) : String(Math.abs(d));
  return `<span class="d ${up === goodUp ? "up" : "dn"}">${up ? "▲" : "▼"}${mag}</span>`;
}

/** @param {{ r: RunRecord, dHit: number|null, dTurn: number|null }} x @returns {string} */
function trendRowHtml({ r, dHit, dTurn }) {
  return `<tr>
    <td>${esc(r.date)}</td><td class="n">${r.sessions.length}</td>
    <td class="n">$${commas(Math.round(r.covered.cost))}</td>
    <td class="n">${Math.round(r.covered.total / 1000)}k</td>
    <td class="n">${r.covered.hitRate}%</td>
    <td class="n">$${r.covered.costPerTurn} ${deltaArrow(dTurn, false)}</td>
    <td class="n">$${commas(Math.round(r.global.cost))}</td>
    <td class="n">${r.global.hitRate}% ${deltaArrow(dHit, true)}</td>
  </tr>`;
}

/** @param {{ filed: string, o: Opportunity }} x @returns {string} */
function oppCardHtml({ filed, o }) {
  const st = oppState(o);
  const delta =
    o.deltaTok != null
      ? `<span class="delta">Δ ${commas(o.deltaTok)} tok${o.deltaCost != null ? ` · $${o.deltaCost}` : ""}</span>`
      : "";
  return `<article class="opp s-${st.k}">
    <header><code>${esc(o.id)}</code><span class="st">${esc(st.label)}</span></header>
    <p class="m">filed ${esc(filed)} · est ${o.estSavingTok != null ? commas(o.estSavingTok) + " tok" : "—"} ${delta}</p>
    ${o.result ? `<p class="r">${esc(o.result)}</p>` : ""}
  </article>`;
}

/** history.html — self-contained visual dashboard, mirrors gen-ledger.js's ledger.html.
 * @param {History} h */
function renderHtml(h) {
  const recs = h.records;
  const latest = recs[recs.length - 1];
  const opps = recs.flatMap((rec) => rec.opportunities.map((o) => ({ filed: rec.date, o })));
  /** @type {Record<string, number>} */
  const order = { pending: 0, todo: 1, bad: 2, good: 3 };
  opps.sort((a, b) => (order[oppState(a.o).k] ?? 9) - (order[oppState(b.o).k] ?? 9));
  const tiles = latest
    ? [
        ["global spend", `$${commas(Math.round(latest.global.cost))}`, "all sessions, cumulative"],
        ["cache hit", `${latest.global.hitRate}%`, "reads / (reads+writes)"],
        ["sessions", commas(latest.global.sessionCount), "logged"],
        ["latest $/turn", `$${latest.covered.costPerTurn}`, `${latest.date} run`],
      ]
    : [];
  const rows = recs.map((r, i) => {
    const p = recs[i - 1];
    return {
      r,
      dHit: p ? r.global.hitRate - p.global.hitRate : null,
      dTurn: p ? r.covered.costPerTurn - p.covered.costPerTurn : null,
    };
  });
  rows.reverse();
  const trendRows = rows.map(trendRowHtml).join("");
  const oppCards = opps.length
    ? opps.map(oppCardHtml).join("")
    : '<p class="empty">— no opportunities yet —</p>';
  const tileHtml = tiles
    .map(
      ([v, k, s]) =>
        `<div class="tile"><div class="v">${esc(k)}</div><div class="k">${esc(v)}</div><div class="s">${esc(s)}</div></div>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Token history</title>
<style>${HTML_STYLE}</style></head>
<body><div class="wrap">
  <h1>Token history — spend trend</h1>
  <p class="meta">PERMANENT time-series · generated by <code>npm run token-history</code> · daily loop: <code>/token-audit</code> → <code>/token-audit-fix</code></p>
  <div class="tiles">${tileHtml}</div>
  <h2>Trend — newest first (each run covers different sessions; watch the NORMALISED cols)</h2>
  <table><thead><tr>
    <th>date</th><th class="n">#sess</th><th class="n">covered $</th><th class="n">tok</th><th class="n">hit%</th><th class="n">$/turn</th><th class="n">global $</th><th class="n">global hit%</th>
  </tr></thead><tbody>${trendRows}</tbody></table>
  <h2>Opportunities — pending &amp; todo first (did the fix move the metric?)</h2>
  <div class="grid">${oppCards}</div>
  <footer>${recs.length} run(s) · ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · regenerate with <code>npm run token-history render</code></footer>
</div></body></html>`;
  writeFileSync(HTML_PATH, html);
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

/**
 * A mistyped tag would otherwise measure as a silent $0 — poisoning the PERMANENT record.
 * @param {string[]} tags @returns {string[]} tags whose session log is missing
 */
function missingLogs(tags) {
  return tags.filter((t) => !existsSync(path.join(LOG_DIR, `session-${t}.ndjson`)));
}

if (cmd === "snapshot") {
  if (flags.global) {
    console.log(JSON.stringify(globalSnapshot(), null, 2));
  } else {
    const tags = csv(flags.sessions);
    const miss = missingLogs(tags);
    if (miss.length)
      console.error(`token-history: WARN missing session log(s): ${miss.join(", ")}`);
    console.log(JSON.stringify(measure(tags), null, 2));
  }
} else if (cmd === "append") {
  const sessions = csv(flags.sessions);
  if (!sessions.length) die("append needs --sessions a,b,c");
  const miss = missingLogs(sessions);
  if (miss.length)
    die(
      `refusing to append — missing session log(s): ${miss.join(", ")} (typo? the permanent history must stay trustworthy)`,
    );
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
} else if (cmd === "pending") {
  // Every opportunity ever landed with moved:"pending" — the forward-looking fixes whose real Δ
  // isn't measured yet. /token-audit step 7 enumerates these each run and tries to confirm each,
  // so a pending never rots unconfirmed (it either flips to true|false or is re-surfaced next run).
  const h = loadHistory();
  const pend = h.records.flatMap((rec) =>
    rec.opportunities.filter((o) => o.moved === "pending").map((o) => ({ filed: rec.date, o })),
  );
  if (flags.json) {
    console.log(
      JSON.stringify(
        pend.map(({ filed, o }) => ({
          id: o.id,
          filed,
          estSavingTok: o.estSavingTok,
          result: o.result,
        })),
        null,
        2,
      ),
    );
  } else if (!pend.length) {
    console.log("ok  token-history: no opportunities awaiting confirmation (0 pending)");
  } else {
    console.log(
      `token-history: ${pend.length} pending opportunit${pend.length === 1 ? "y" : "ies"} awaiting confirmation ` +
        "(flip each with `land --opp <id> --moved true|false --delta-tok N`):",
    );
    for (const { filed, o } of pend)
      console.log(
        `    ${o.id}  (filed ${filed}, est ${o.estSavingTok ?? "—"} tok)${o.result ? ` — ${o.result}` : ""}`,
      );
  }
} else if (cmd === "render") {
  // Regenerate history.md + history.html from history.json without changing any data.
  save(loadHistory());
  console.log("ok  token-history: regenerated history.md + history.html");
} else {
  die(`unknown command "${cmd ?? ""}" — use: append | snapshot | land | pending | render`);
}
