// tools/sim/forecast.js — a PREDICTED-value tag source: the same DataBus wire shape as the seeded
// sim (server.js), but every value is a forecast — a linear projection extrapolated a fixed horizon
// past a short seed window — not a current reading. It exists to prove ONE thing about the DataBus
// seam: a source's ORIGIN is invisible to the viewer. The sim, the MQTT bridge, a recording, and
// this forecaster are interchangeable behind the single `[viewer] url=` / `sourceUrl` field; a viewer
// points at it with ZERO change to core/data_bus.gd, core/binding_map.gd, or any shipped runtime
// file. "Visualization, not simulation" is therefore a STATED CHOICE, not an architectural limit —
// the twin paints whatever a producer publishes, and a producer of predictions is just a third thing
// behind the same door.
//
//   node tools/sim/forecast.js [--seed 42] [--port 8765] [--hz 10] [--map binding_map.json] \
//                              [--window 20] [--horizon 30] [--stats out.json]
//
// This is NOT the framework forecasting anything. The projection is done HERE, in an external
// producer, and published as ordinary tag frames; the twin only visualizes them. --map derives the
// tag list + each tag's [min,max] from the binding map (identical to server.js), so a forecaster and
// its bindings can never drift.
//
// Wire shape, framing, handshake, and shutdown are IDENTICAL to server.js — the RFC 6455 helpers
// (protocol.js) and the CLI/tag-table plumbing (stream.js) are shared, so a bare `ws://` client (and
// Godot's WebSocketPeer) reads it exactly as it reads the sim. Dependency-free by design (the
// materialized tools/ ships no package.json — a bare `node` must run it), same as server.js.
//
// The seed window is drawn from the sim's own deterministic signal (tagValue) purely as a stand-in
// for "a short window of recent sensor readings" — the source a real deployment would fit its model
// to. The forecaster is agnostic to where that window comes from; here it is reproducible so the
// demo replays bit-for-bit per seed.
import http from "node:http";
import {
  DEFAULT_PORT,
  DEFAULT_HZ,
  DEFAULT_SEED,
  MS_PER_SEC,
  parseArgs,
  tagsFromMap,
  tagValue,
} from "./stream.js";
import {
  FIN_PONG_FRAME,
  OPCODE_CLOSE,
  OPCODE_PING,
  secWebSocketAccept,
  encodeTextFrame,
  encodeServerFrame,
  decodeFrames,
} from "./protocol.js";
import { writeFileSync } from "node:fs";

/** 426 Upgrade Required — returned to a plain HTTP GET on this WebSocket-only endpoint (as server.js). */
const HTTP_UPGRADE_REQUIRED = 426;

/** Grace period (ms) before force-exit if a socket lingers past server.close() (as server.js). */
const SHUTDOWN_BACKSTOP_MS = 200;

/** Default seed-window length, in ticks: how many recent readings the linear fit sees. 20 ticks =
 * 2 s at 10 Hz — long enough to smooth the sim's jitter into a trend, short enough to track turns. */
const DEFAULT_WINDOW = 20;

/** Default forecast horizon, in ticks: how far PAST the window's end each published value is
 * projected. 30 ticks = 3 s at 10 Hz — visibly "ahead" of where a live reading would sit. */
const DEFAULT_HORIZON = 30;

/** Least-squares linear fit over a tag's seed window, projected `horizon` ticks past the window end,
 * clamped to [min,max]. The window is the underlying signal at the `window` ticks ending at `tick`;
 * the returned value is the model's PREDICTION for `tick + horizon`, i.e. a forecast, not a reading.
 * Pure in (seed, tick, i, count, range, window, horizon) so the stream replays per seed.
 * @param {number} seed @param {number} tick @param {number} i @param {number} count
 * @param {number} min @param {number} max @param {number} window @param {number} horizon
 * @returns {number} */
function forecastValue(seed, tick, i, count, min, max, window, horizon) {
  const n = Math.max(2, window | 0); // a slope needs at least two points
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    const t = tick - (n - 1) + k; // the window's ticks: (tick-n+1) … tick
    const y = tagValue(seed, t, i, count, min, max);
    sx += k;
    sy += y;
    sxx += k * k;
    sxy += k * y;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = (sy - slope * sx) / n;
  const xFuture = n - 1 + Math.max(0, horizon | 0); // project past the last window sample
  const v = intercept + slope * xFuture;
  return Math.max(min, Math.min(max, v));
}

/** Answer complete client frames: pong every ping, honour close (identical to server.js — a data
 * source never needs the client's payload).
 * @param {import("node:net").Socket} socket @param {Buffer} buf @returns {Buffer} */
function pumpClientFrames(socket, buf) {
  const { frames, rest } = decodeFrames(buf);
  for (const f of frames) {
    if (f.opcode === OPCODE_CLOSE) {
      socket.end();
      return Buffer.alloc(0);
    }
    if (f.opcode === OPCODE_PING) socket.write(encodeServerFrame(FIN_PONG_FRAME, f.payload));
  }
  return rest;
}

const args = parseArgs(process.argv.slice(2));
const seed = Number(args.seed ?? DEFAULT_SEED) | 0;
const port = Number(args.port ?? DEFAULT_PORT);
const hz = Number(args.hz ?? DEFAULT_HZ);
const window = Number(args.window ?? DEFAULT_WINDOW) | 0;
const horizon = Number(args.horizon ?? DEFAULT_HORIZON) | 0;
const tags = tagsFromMap(args.map);
const statsPath = args.stats;

/** @type {Set<import("node:net").Socket>} */
const clients = new Set();
/** @type {number[]} */
const sent = Array.from({ length: tags.length }, () => 0);
let lastSeq = -1;

const server = http.createServer((_req, res) => {
  res.writeHead(HTTP_UPGRADE_REQUIRED, { "content-type": "text/plain" });
  res.end("Upgrade Required — this is a WebSocket forecast (predicted-value) tag source.\n");
});

server.on("upgrade", (req, rawSocket) => {
  const socket = /** @type {import("node:net").Socket} */ (rawSocket);
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${secWebSocketAccept(key)}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  clients.add(socket);
  /** @type {Buffer} */
  let rx = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    rx = pumpClientFrames(socket, Buffer.concat([rx, /** @type {Buffer} */ (chunk)]));
  });
  const drop = () => clients.delete(socket);
  socket.on("close", drop);
  socket.on("error", drop);
});

let tick = 0;
const timer = setInterval(
  () => {
    const seq = tick;
    lastSeq = seq;
    for (let i = 0; i < tags.length; i++) {
      const row = tags[i];
      if (!row) continue;
      const { tag, min, max } = row;
      const value = forecastValue(seed, tick, i, tags.length, min, max, window, horizon);
      const frame = encodeTextFrame(JSON.stringify({ tag, value, seq, sent_ms: Date.now() }));
      for (const c of clients) c.write(frame);
      sent[i] = (sent[i] ?? 0) + 1;
    }
    tick++;
  },
  Math.max(1, Math.round(MS_PER_SEC / hz)),
);

function writeStats() {
  if (!statsPath) return;
  const perTag = tags.map((t, i) => ({ tag: t.tag, frames_sent: sent[i] ?? 0, last_seq: lastSeq }));
  try {
    writeFileSync(
      statsPath,
      JSON.stringify({ kind: "forecast", seed, hz, window, horizon, tags: perTag }, null, 2) + "\n",
    );
    console.log(`forecast: wrote stats → ${statsPath}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`forecast: could not write stats '${statsPath}' (${msg})`);
  }
}

function shutdown() {
  clearInterval(timer);
  writeStats();
  for (const c of clients) c.destroy();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), SHUTDOWN_BACKSTOP_MS).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, () => {
  console.log(
    `forecast: PREDICTED-value tag source on ws://localhost:${port} — seed=${seed} hz=${hz} ` +
      `window=${window} horizon=${horizon} tags=${tags.length}` +
      (args.map ? ` (from ${args.map})` : " (demo set)") +
      " — values are PROJECTED, not live; the twin only visualizes them.",
  );
});
