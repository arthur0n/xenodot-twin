// twin_evidence.js — capture browser evidence for a twin web build: a SCREENSHOT plus the
// VERBATIM console/exception log, to an evidence dir. Non-zero exit on any un-allowlisted
// console error — so "verified in a real browser" becomes a gate, not a claim (HTTP 200s and
// desktop smokes have both lied). Feeds the demo's proof + card art.
//
// Generalized from the archived web-ceiling no-deps CDP drivers (chrome_console.mjs +
// chrome_bench.mjs): HEADED Chrome driven over the DevTools Protocol, auto-attaching (flatten)
// to child frames so an EMBEDDED build's console is captured too. Node built-ins only (global
// WebSocket + fetch, Node 18+) — no npm deps, same runtime policy as the rest of tools/.
//
// Usage:
//   node tools/web/twin_evidence.js --url http://127.0.0.1:8070/ --out evidence
//   node tools/web/twin_evidence.js --dir builds/web --out evidence      # serves via serve_coi.py
//   node tools/web/twin_evidence.js --url <u> --out evidence --seconds 20 \
//        --allow "WebGL.*deprecated" --allow "AudioContext"
//
//   --url <url>        page to load (mutually exclusive with --dir)
//   --dir <path>       local build dir to serve via serve_coi.py (COOP/COEP) then capture
//   --out <dir>        evidence output dir (default: evidence) — writes screenshot.png + console.log
//   --seconds <n>      capture window before the screenshot (default: 15)
//   --port <n>         port for the served build (default: random 8071-8470; --dir only)
//   --allow <regex>    an error line matching this JS regex is BENIGN (repeatable)
//   --chrome <path>    Chrome executable (default: $CHROME or the macOS app path)
//
// Exit 0 = captured, no un-allowlisted console errors. 1 = captured but errors seen. 2 = setup fail.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

/**
 * @typedef {Object} Options
 * @property {string} [url]
 * @property {string} [dir]
 * @property {string} out
 * @property {number} seconds
 * @property {number} [port]
 * @property {RegExp[]} allow
 * @property {string} chrome
 * @property {boolean} [help]
 */

/**
 * A DevTools-Protocol message: either an event ({method, params}) or a command reply ({id, result}).
 * Its `params`/`result` are dynamic, so they are typed `unknown` and narrowed per branch by cast.
 * @typedef {Object} CdpMsg
 * @property {number} [id]
 * @property {string} [method]
 * @property {string} [sessionId]
 * @property {unknown} [params]
 * @property {unknown} [result]
 */

/** @typedef {{ text: string, isError: boolean }} EvidenceLine */

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Coerce an unknown DevTools value to a printable string. @param {unknown} x @returns {string} */
function asStr(x) {
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  if (x === null || x === undefined) return "";
  return JSON.stringify(x);
}

// Parse JSON to `unknown` (not `any`): callers narrow with an explicit cast, keeping the
// type-aware lint rules honest — every DevTools-Protocol field is asserted where it is read.
/** @param {string} s @returns {unknown} */
function parseJson(s) {
  return /** @type {unknown} */ (JSON.parse(s));
}

/** @param {string[]} argv @returns {Options} */
function parseArgs(argv) {
  /** @type {Options} */
  const o = {
    out: "evidence",
    seconds: 15,
    allow: [],
    chrome: process.env.CHROME ?? DEFAULT_CHROME,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? "";
    if (a === "--url") o.url = next();
    else if (a === "--dir") o.dir = next();
    else if (a === "--out") o.out = next();
    else if (a === "--seconds") o.seconds = Number(next());
    else if (a === "--port") o.port = Number(next());
    else if (a === "--allow") o.allow.push(new RegExp(next()));
    else if (a === "--chrome") o.chrome = next();
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

/**
 * Serve a local build dir with serve_coi.py (COOP/COEP + correct WASM MIME). Resolves once the
 * server answers, so the capture never races the boot.
 * @param {string} dir @param {number | undefined} port
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
async function serveDir(dir, port) {
  const chosen = port ?? 8071 + Math.floor(Math.random() * 400);
  const py = spawn(
    "python3",
    [join(HERE, "serve_coi.py"), "--dir", dir, "--port", String(chosen)],
    {
      stdio: "ignore",
    },
  );
  const url = `http://127.0.0.1:${chosen}/`;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return { url, stop: () => py.kill("SIGKILL") };
    } catch {
      await sleep(200);
    }
  }
  py.kill("SIGKILL");
  throw new Error(`serve_coi did not come up on ${url}`);
}

/** Poll the CDP /json endpoint for the page target's websocket debugger URL. @param {number} port */
async function pageWsUrl(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const body = /** @type {unknown} */ (await res.json());
      const targets = /** @type {{ type?: string, webSocketDebuggerUrl?: string }[]} */ (body);
      const page = targets.find((t) => t.type === "page" && Boolean(t.webSocketDebuggerUrl));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome/CDP not up yet — keep polling.
    }
    await sleep(250);
  }
  throw new Error("Chrome CDP endpoint never came up");
}

/** @param {string} kind @param {string} text @returns {EvidenceLine} */
function classify(kind, text) {
  const isError = kind === "console.error" || kind === "exception" || kind === "log.error";
  return { text: `[${kind}] ${text}`, isError };
}

/**
 * Record one CDP event into `lines` if it carries console/exception/log output.
 * @param {CdpMsg} m @param {EvidenceLine[]} lines
 */
function collect(m, lines) {
  if (m.method === "Runtime.consoleAPICalled") {
    const p = /** @type {{ type: string, args?: { value?: unknown, description?: string }[] }} */ (
      m.params
    );
    const txt = (p.args ?? [])
      .map((a) => (a.value !== undefined ? asStr(a.value) : (a.description ?? "")))
      .join(" ");
    lines.push(classify(`console.${p.type}`, txt));
  } else if (m.method === "Runtime.exceptionThrown") {
    const p =
      /** @type {{ exceptionDetails: { exception?: { description?: string }, text?: string } }} */ (
        m.params
      );
    lines.push(
      classify(
        "exception",
        p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? "",
      ),
    );
  } else if (m.method === "Log.entryAdded") {
    const p = /** @type {{ entry: { level: string, text: string } }} */ (m.params);
    lines.push(classify(`log.${p.entry.level}`, p.entry.text));
  }
}

/**
 * Wire the CDP socket: collect events into `lines`, auto-enable domains on each attached child,
 * and expose fire-and-forget `send` plus a correlated `request`.
 * @param {WebSocket} ws @param {EvidenceLine[]} lines
 */
function wire(ws, lines) {
  let id = 0;
  ws.addEventListener("message", (ev) => {
    const m = /** @type {CdpMsg} */ (parseJson(asStr(ev.data)));
    collect(m, lines);
    if (m.method === "Target.attachedToTarget") {
      const p = /** @type {{ sessionId: string }} */ (m.params);
      for (const method of ["Runtime.enable", "Log.enable", "Runtime.runIfWaitingForDebugger"]) {
        ws.send(JSON.stringify({ id: ++id, method, sessionId: p.sessionId }));
      }
    }
  });
  return {
    /** @param {string} method @param {Record<string, unknown>} [params] */
    send: (method, params = {}) => {
      ws.send(JSON.stringify({ id: ++id, method, params }));
    },
    /** @param {string} method @param {Record<string, unknown>} [params] @returns {Promise<unknown>} */
    request: (method, params = {}) =>
      new Promise((resolve) => {
        const mid = ++id;
        /** @param {MessageEvent} ev */
        const onMsg = (ev) => {
          const m = /** @type {CdpMsg} */ (parseJson(asStr(ev.data)));
          if (m.id === mid) {
            ws.removeEventListener("message", onMsg);
            resolve(m.result);
          }
        };
        ws.addEventListener("message", onMsg);
        ws.send(JSON.stringify({ id: mid, method, params }));
      }),
  };
}

/** @param {Options} o @param {string} targetUrl @returns {{ chrome: import("node:child_process").ChildProcess, port: number, profile: string }} */
function launchChrome(o, targetUrl) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), "twin-evidence-"));
  const chrome = spawn(
    o.chrome,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      "--window-size=1400,900",
      "--use-angle=metal",
      targetUrl,
    ],
    { stdio: "ignore" },
  );
  return { chrome, port, profile };
}

/**
 * Write the screenshot + console log, then report and return the exit code.
 * @param {Options} o @param {string} targetUrl @param {EvidenceLine[]} lines @param {string} [shotData]
 * @returns {number}
 */
function writeEvidence(o, targetUrl, lines, shotData) {
  mkdirSync(o.out, { recursive: true });
  const shotPath = join(o.out, "screenshot.png");
  const logPath = join(o.out, "console.log");
  if (shotData) writeFileSync(shotPath, Buffer.from(shotData, "base64"));
  writeFileSync(
    logPath,
    `${targetUrl}\n${"-".repeat(60)}\n${lines.map((l) => l.text).join("\n")}\n`,
  );

  const errors = lines.filter((l) => l.isError && !o.allow.some((re) => re.test(l.text)));
  const totalErr = lines.filter((l) => l.isError).length;
  console.log(`twin-evidence: ${targetUrl}`);
  console.log(`  screenshot: ${shotPath}${shotData ? "" : " (EMPTY — capture returned no data)"}`);
  console.log(`  console.log: ${logPath} (${lines.length} line(s))`);
  console.log(`  errors: ${errors.length} un-allowlisted, ${totalErr} total error-level`);
  for (const e of errors.slice(0, 10)) console.log(`    ! ${e.text}`);
  return errors.length === 0 ? 0 : 1;
}

/** @param {Options} o @returns {Promise<number>} */
async function capture(o) {
  /** @type {{ stop: () => void } | null} */
  let server = null;
  let targetUrl = o.url ?? "";
  if (o.dir) {
    const s = await serveDir(o.dir, o.port);
    server = s;
    targetUrl = s.url;
  }
  const { chrome, port, profile } = launchChrome(o, targetUrl);
  const cleanup = () => {
    try {
      chrome.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    if (server) server.stop();
  };

  try {
    const wsUrl = await pageWsUrl(port);
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => {
      ws.addEventListener("open", () => {
        resolve(undefined);
      });
    });
    /** @type {EvidenceLine[]} */
    const lines = [];
    const cdp = wire(ws, lines);
    cdp.send("Runtime.enable");
    cdp.send("Log.enable");
    cdp.send("Page.enable");
    cdp.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
    });

    await sleep(o.seconds * 1000);

    const shot = /** @type {{ data?: string }} */ (
      await cdp.request("Page.captureScreenshot", { format: "png" })
    );
    return writeEvidence(o, targetUrl, lines, shot.data);
  } finally {
    cleanup();
  }
}

/** @returns {Promise<number>} */
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(
      "usage: node tools/web/twin_evidence.js (--url <url> | --dir <build>) [--out dir] [--seconds n] [--allow re]...",
    );
    return 0;
  }
  if (!o.url && !o.dir) throw new Error("need --url <url> or --dir <build-dir> (see --help)");
  if (o.url && o.dir) throw new Error("--url and --dir are mutually exclusive");
  return capture(o);
}

main()
  .then((code) => process.exit(code))
  .catch((/** @type {unknown} */ e) => {
    console.error(`twin-evidence: ERROR — ${e instanceof Error ? e.message : asStr(e)}`);
    process.exit(2);
  });
