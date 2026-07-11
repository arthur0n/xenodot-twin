// tools/bridge/mqtt_ws.js — the MQTT → WebSocket bridge: the protocol adapter that plugs in
// BEHIND the relay's `sourceUrl` seam (ui/server/features/twin/twin-data.js). It speaks MQTT
// 3.1.1 client-side to a broker (QoS-0 subscribe), translates each PUBLISH into the DataBus wire
// shape `{tag, value, seq, sent_ms}` (core/data_bus.gd) via map.js, and re-serves those as a tiny
// WebSocket server — the exact shape the sim's server.js emits, so the relay and viewer are
// unchanged. Point `TWIN_SOURCE_URL=ws://localhost:8766` (or a viewer's `viewer.cfg url=`) at it.
//
//   node tools/bridge/mqtt_ws.js --broker mqtt://localhost:1883 --map mqtt_map.json \
//       [--port 8766] [--user u --pass p] [--stats out.json] [--record capture.ndjson]
//
// --record taps the live MQTT stream the bridge forwards into a twin-recording NDJSON (the SAME
// contract ../sim/record.js emits and the shipped viewer plays), so a live bridge session becomes
// a hostable, replayable fixture — the missing piece that lets an integrator-side live source be
// baked into a demo. --stats writes a machine-readable health struct (filters subscribed, frames
// forwarded, drops by reason) so the bridge's health need not be scraped from stdout.
//
// The WS server side reuses ../sim/protocol.js verbatim (handshake + encodeTextFrame + ping/close),
// mirroring ../sim/server.js — the framing is a cross-file agreement, so there is exactly one copy.
// The MQTT codec is ./mqtt_protocol.js; the pure topic→tag/value translation is ./map.js. The
// broker connection reconnects on drop, mirroring the relay's own reconnect-to-source rationale.
//
// Honesty note carried in the frames: `seq` is a bridge-local monotonic counter PER TAG (each tag
// gets its own 0,1,2,… sequence) and `sent_ms` is stamped at translation, so DataBus drop/latency
// math measures the bridge→viewer hop only, not broker→bridge loss — QoS 0 makes no delivery
// promise anyway. Per-tag (not one global per-frame counter) is deliberate: core/data_bus.gd counts
// drops PER TAG (gap in that tag's seq run), so a single global counter would make every multi-tag
// publisher look lossy — tag A at seq 4, tag B at seq 5, tag A next at seq 6 reads as "A dropped
// seq 5" though nothing was lost. Per-tag seq keeps each tag's run gapless so the drop count is
// honest. The viewer side was already per-tag; this is the producer half of that contract.
//
// Out of scope v1 (see the plan): MQTT 5, QoS 1/2, TLS (mqtts://), and publishing viewer→broker.
// Dependency-free by design — the materialized tools/ ships no package.json, bare `node` only.
import http from "node:http";
import net from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parseArgs } from "../sim/stream.js";
import {
  FIN_PONG_FRAME,
  OPCODE_CLOSE,
  OPCODE_PING,
  secWebSocketAccept,
  encodeTextFrame,
  encodeServerFrame,
  decodeFrames,
} from "../sim/protocol.js";
import {
  PACKET_CONNACK,
  PACKET_SUBACK,
  PACKET_PUBLISH,
  CONNACK_ACCEPTED,
  SUBACK_GRANTED_QOS0,
  encodeConnect,
  encodeSubscribe,
  encodePingreq,
  encodeDisconnect,
  decodePackets,
} from "./mqtt_protocol.js";
import { parseMap, filtersOf, translate } from "./map.js";
import { SEED_RECORDED, headerLine, frameLine } from "../sim/recording.js";

// --- Port + timing constants (one cluster, like the sim's stream.js port doc) ---
/** The bridge's default WebSocket port. One above the sim's DEFAULT_PORT (8765,
 * ../sim/stream.js) and clear of the verify_twin.sh gate's sim on 8899, so a bridge, a dev sim,
 * and the gate can all run at once. The viewer reaches the bridge only via `sourceUrl` /
 * TWIN_SOURCE_URL / `viewer.cfg url=`, so nothing else needs to know this number. */
export const DEFAULT_BRIDGE_PORT = 8766;

/** Default broker port when a `mqtt://host` URL omits one — the MQTT 3.1.1 IANA-assigned port. */
const DEFAULT_MQTT_PORT = 1883;

/** Keep Alive advertised in CONNECT (seconds, §3.1.2.10): the broker may disconnect the bridge if
 * it hears nothing for 1.5× this, so the client PINGs at half the interval to stay comfortably
 * inside the window. */
const KEEP_ALIVE_SEC = 60;
const PING_INTERVAL_MS = (KEEP_ALIVE_SEC * 1000) / 2;

/** Delay before retrying a dropped broker connection — mirrors the relay's DEFAULT_RECONNECT_MS
 * (twin-data.js): long enough not to hammer a broker that's down, short enough to recover fast. */
const DEFAULT_RECONNECT_MS = 1500;

/** How often to emit the dropped-payload summary to stderr (only when drops occurred). A plant
 * broker carries chatter the bridge doesn't own; drops are counted and reported, never fatal. */
const DROP_SUMMARY_MS = 10000;

/** HTTP status returned to a plain GET on this WebSocket-only endpoint (RFC 7231 §6.5.15). Same as
 * ../sim/server.js — the bridge's WS surface behaves exactly like the sim's. */
const HTTP_UPGRADE_REQUIRED = 426;

/** Grace before force-exit if a socket lingers past server.close() on shutdown (ms). */
const SHUTDOWN_BACKSTOP_MS = 200;

/** Nanoseconds per millisecond. The recorder stamps each frame's `t_ms` from
 * process.hrtime.bigint() (nanoseconds, MONOTONIC) relative to the first recorded frame, exactly
 * like ../sim/record.js — a wall-clock step (NTP slew, DST) could otherwise make t_ms go backwards
 * and break the recording contract's "frames ordered by t_ms ascending". */
const NS_PER_MS = 1_000_000n;

/** Fallback header `hz` for a --record capture of fewer than 2 frames: no observed cadence exists,
 * so claim 1 Hz (the recording's hz is metadata — the viewer plays by t_ms, ../sim/recording.js). */
const RECORD_FALLBACK_HZ = 1;

/** The single SUBSCRIBE we send carries this packet id (§2.3.1); one subscribe, one id. */
const SUBSCRIBE_PACKET_ID = 1;

/** A stable MQTT client identifier (§3.1.3.1). Clean-session, so reusing it across reconnects is
 * fine — the broker keeps no state for it. */
const CLIENT_ID = "xenodot-twin-bridge";

/** @typedef {import("./map.js").TopicMap} TopicMap */

/** Answer complete viewer(client) frames: pong every ping, honour close. The viewer never sends
 * data frames the bridge needs, so text/binary are consumed and dropped. Identical to the sim's
 * pumpClientFrames — the WS server behaviour is shared by contract, copied only because the two
 * tools materialize independently. @param {net.Socket} socket @param {Buffer} buf
 * @returns {Buffer} the unconsumed remainder. */
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

/** Wire the WebSocket upgrade handler onto `wsServer`: complete the RFC 6455 handshake, track each
 * viewer socket in `clients`, answer its pings / honour close, drop it on close. Mirrors the sim's
 * ../sim/server.js upgrade path. @param {import("node:http").Server} wsServer
 * @param {Set<net.Socket>} clients @returns {void} */
function attachWsUpgrade(wsServer, clients) {
  wsServer.on("upgrade", (req, rawSocket) => {
    const socket = /** @type {net.Socket} */ (rawSocket);
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
}

/** The MQTT client half of the bridge: connect to the broker, CONNECT → CONNACK → SUBSCRIBE, feed
 * each received PUBLISH to `onPublish`, keepalive-ping, and reconnect on drop (mirroring the
 * relay's reconnect-to-source rationale). Returns start/stop handles.
 * @param {{ brokerHost: string, brokerPort: number, username?: string, password?: string,
 *   filters: string[], reconnectDelayMs: number,
 *   onPublish: (topic: string, payload: Buffer) => void, log: (msg: string) => void }} cfg
 * @returns {{ start: () => void, stop: () => void }} */
function createMqttClient(cfg) {
  const { brokerHost, brokerPort, username, password, filters, reconnectDelayMs, onPublish, log } =
    cfg;
  let stopped = false;
  /** @type {net.Socket | null} */
  let broker = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let reconnectTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pingTimer = null;

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }
  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
  }

  /** @param {import("./mqtt_protocol.js").MqttPacket} p @param {net.Socket} sock @returns {void} */
  function handlePacket(p, sock) {
    switch (p.type) {
      case PACKET_CONNACK:
        if (p.returnCode !== CONNACK_ACCEPTED) {
          log(`bridge: broker refused CONNECT (return code ${String(p.returnCode)}) — retrying`);
          sock.destroy(); // 'close' schedules the reconnect
          return;
        }
        sock.write(encodeSubscribe({ packetId: SUBSCRIBE_PACKET_ID, filters }));
        stopPing();
        pingTimer = setInterval(() => sock.write(encodePingreq()), PING_INTERVAL_MS);
        break;
      case PACKET_SUBACK: {
        const codes = /** @type {number[]} */ (p.returnCodes ?? []);
        const failed = codes.filter((c) => c !== SUBACK_GRANTED_QOS0).length;
        log(
          `bridge: subscribed to ${filters.length} filter(s)` +
            (failed ? ` — ${failed} refused by broker` : ""),
        );
        break;
      }
      case PACKET_PUBLISH:
        onPublish(/** @type {string} */ (p.topic), /** @type {Buffer} */ (p.payload));
        break;
      default:
        break; // PINGRESP / unexpected server packet — nothing to do, stay live
    }
  }

  function connect() {
    if (stopped) return;
    const sock = net.connect({ host: brokerHost, port: brokerPort });
    broker = sock;
    /** @type {Buffer} */
    let rx = Buffer.alloc(0);
    sock.on("connect", () => {
      log(`bridge: connected to broker ${brokerHost}:${brokerPort}`);
      sock.write(
        encodeConnect({ clientId: CLIENT_ID, keepAlive: KEEP_ALIVE_SEC, username, password }),
      );
    });
    sock.on("data", (chunk) => {
      const { packets, rest } = decodePackets(Buffer.concat([rx, /** @type {Buffer} */ (chunk)]));
      rx = rest;
      for (const p of packets) handlePacket(p, sock);
    });
    sock.on("error", (e) => {
      log(`bridge: broker connection error (${e.message})`); // 'close' handles the retry
    });
    sock.on("close", () => {
      stopPing();
      if (broker === sock) broker = null;
      if (!stopped) scheduleReconnect();
    });
  }

  function stop() {
    stopped = true;
    stopPing();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (broker) {
      try {
        broker.write(encodeDisconnect()); // §3.14 clean disconnect
      } catch {
        /* socket already gone */
      }
      broker.destroy();
      broker = null;
    }
  }

  return { start: connect, stop };
}

/** The live-stream recorder behind --record: fold each forwarded frame into an in-memory
 * twin-recording (../sim/recording.js contract) and, on demand, serialize it to NDJSON. Kept
 * filesystem-pure (returns the body; the CLI owns the write, like --stats) so startBridge stays
 * driveable in-process by the test. hz is DERIVED from the observed frame cadence (forwarded frames
 * over their t_ms span) — NOT from `seq`, which is now per-tag (so no longer a global frame count).
 * hz is metadata (the viewer plays by t_ms), so any positive int is a valid recording.
 * @returns {{ fold: (tag: string, value: number, seq: number) => void, serialize: () => string | null }} */
function createRecorder() {
  /** @type {import("../sim/recording.js").RecordingFrame[]} */
  const frames = [];
  /** @type {Map<string, { min: number, max: number }>} */
  const range = new Map();
  /** @type {bigint | null} monotonic origin, set at the FIRST folded frame */
  let t0 = null;

  /** @param {string} tag @param {number} value @param {number} seq @returns {void} */
  function fold(tag, value, seq) {
    const now = process.hrtime.bigint();
    t0 ??= now;
    const tMs = Number((now - t0) / NS_PER_MS);
    frames.push({ t_ms: tMs, tag, value, seq });
    const r = range.get(tag);
    if (r === undefined) range.set(tag, { min: value, max: value });
    else {
      r.min = Math.min(r.min, value);
      r.max = Math.max(r.max, value);
    }
  }

  /** @returns {number} the integer header hz derived from the observed inter-frame cadence (folded
   * frames span their t_ms range; hz = frames-per-second over that span). Independent of `seq`. */
  function deriveHz() {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (first === undefined || last === undefined || frames.length < 2) return RECORD_FALLBACK_HZ;
    const spanMs = last.t_ms - first.t_ms;
    if (spanMs <= 0) return RECORD_FALLBACK_HZ;
    return Math.max(RECORD_FALLBACK_HZ, Math.round((1000 * (frames.length - 1)) / spanMs));
  }

  /** @returns {string | null} the NDJSON body (header + frames + trailing newline), or null when
   * nothing was captured (the viewer rejects a frameless recording — write no file). */
  function serialize() {
    if (frames.length === 0) return null;
    const tags = [...range.entries()].map(([tag, r]) => ({ tag, min: r.min, max: r.max }));
    return (
      [headerLine(deriveHz(), SEED_RECORDED, tags), ...frames.map(frameLine)].join("\n") + "\n"
    );
  }

  return { fold, serialize };
}

/**
 * Start the bridge: a WebSocket server that fans DataBus frames out to viewer clients, fed by an
 * MQTT client subscribed to the broker. Pure of the filesystem (the CLI reads + parses the map;
 * this takes the parsed map) so the integration test can drive it in-process against a fake broker.
 *
 * @param {object} opts
 * @param {string} opts.brokerHost @param {number} opts.brokerPort
 * @param {TopicMap} opts.map  parsed + validated topic map
 * @param {number} [opts.port]  WS port (0 = ephemeral, for tests)
 * @param {string} [opts.username] @param {string} [opts.password]
 * @param {number} [opts.reconnectDelayMs]
 * @param {boolean} [opts.record]  accumulate a twin-recording of forwarded frames (--record)
 * @param {(msg: string) => void} [opts.log]
 * @returns {{ whenListening: Promise<number>, close: () => void, stats: () => { filters: string[], forwarded: number, dropped: { noRule: number, badPayload: number } }, recording: () => string | null }}
 */
export function startBridge(opts) {
  const {
    brokerHost,
    brokerPort,
    map,
    port = DEFAULT_BRIDGE_PORT,
    username,
    password,
    reconnectDelayMs = DEFAULT_RECONNECT_MS,
    record = false,
    log = () => {},
  } = opts;
  const filters = filtersOf(map);
  /** @type {Set<net.Socket>} viewer clients */
  const clients = new Set();
  /** @type {Map<string, number>} next seq to emit PER TAG — keeps each tag's run gapless so
   * data_bus.gd's per-tag drop counting stays honest (see header honesty note). */
  const seqByTag = new Map();
  let forwarded = 0;
  const dropped = { noRule: 0, badPayload: 0 };
  const recorder = record ? createRecorder() : null;

  // --- WebSocket server (mirror ../sim/server.js) ---
  const wsServer = http.createServer((_req, res) => {
    res.writeHead(HTTP_UPGRADE_REQUIRED, { "content-type": "text/plain" });
    res.end("Upgrade Required — this is the MQTT→WS bridge tag source.\n");
  });
  attachWsUpgrade(wsServer, clients);

  /** Translate one received PUBLISH and forward it to every viewer, or count the drop by reason.
   * @param {string} topic @param {Buffer} payload @returns {void} */
  function onPublish(topic, payload) {
    const t = translate(map.rules, topic, payload);
    if (!t.ok) {
      if (t.reason === "no-rule") dropped.noRule++;
      else dropped.badPayload++;
      return;
    }
    const thisSeq = seqByTag.get(t.tag) ?? 0; // per-tag monotonic — gapless per tag, not global
    seqByTag.set(t.tag, thisSeq + 1);
    const frame = encodeTextFrame(
      JSON.stringify({ tag: t.tag, value: t.value, seq: thisSeq, sent_ms: Date.now() }),
    );
    for (const c of clients) c.write(frame);
    forwarded++;
    if (recorder) recorder.fold(t.tag, t.value, thisSeq);
  }

  const mqtt = createMqttClient({
    brokerHost,
    brokerPort,
    username,
    password,
    filters,
    reconnectDelayMs,
    onPublish,
    log,
  });

  // Drop reporting (loud, periodic, never fatal).
  const dropTimer = setInterval(() => {
    if (dropped.noRule || dropped.badPayload) {
      log(
        `bridge: dropped ${dropped.noRule} unmapped + ${dropped.badPayload} non-numeric payload(s) so far`,
      );
    }
  }, DROP_SUMMARY_MS);
  dropTimer.unref();

  mqtt.start();

  /** @type {(port: number) => void} */
  let resolveListening = () => {};
  const whenListening = /** @type {Promise<number>} */ (
    new Promise((resolve) => {
      resolveListening = resolve;
    })
  );
  wsServer.listen(port, () => {
    const addr = wsServer.address();
    const boundPort = typeof addr === "object" && addr !== null ? addr.port : port;
    log(
      `bridge: serving DataBus frames on ws://localhost:${boundPort} (broker ${brokerHost}:${brokerPort})`,
    );
    resolveListening(boundPort);
  });

  function close() {
    mqtt.stop();
    clearInterval(dropTimer);
    for (const c of clients) c.destroy();
    wsServer.close();
  }

  return {
    whenListening,
    close,
    stats: () => ({ filters: [...filters], forwarded, dropped: { ...dropped } }),
    recording: () => (recorder ? recorder.serialize() : null),
  };
}

// --- CLI ---
/** Parse a `mqtt://host[:port]` broker URL into host + port, rejecting the unsupported schemes.
 * @param {string} raw @returns {{ host: string, port: number }} */
function parseBroker(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`--broker: not a URL: '${raw}'`);
  }
  if (u.protocol === "mqtts:") {
    throw new Error("--broker: TLS (mqtts://) is not supported in v1 — use mqtt:// (see the plan)");
  }
  if (u.protocol !== "mqtt:") {
    throw new Error(`--broker: only mqtt:// is supported (got '${u.protocol}//')`);
  }
  return { host: u.hostname, port: Number(u.port || DEFAULT_MQTT_PORT) };
}

/** CLI entry: read args, load + parse the map, start the bridge, wire shutdown + optional stats.
 * @returns {void} */
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.broker || !args.map) {
    console.error(
      "usage: node tools/bridge/mqtt_ws.js --broker mqtt://host:1883 --map mqtt_map.json " +
        "[--port 8766] [--user u --pass p] [--stats out.json] [--record capture.ndjson]",
    );
    process.exit(1);
  }

  let broker;
  /** @type {TopicMap} */
  let map;
  try {
    broker = parseBroker(args.broker);
    map = parseMap(readFileSync(args.map, "utf8"));
  } catch (e) {
    console.error(`bridge: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
    return;
  }

  const recordPath = args.record;
  const handle = startBridge({
    brokerHost: broker.host,
    brokerPort: broker.port,
    map,
    port: Number(args.port ?? DEFAULT_BRIDGE_PORT),
    username: args.user,
    password: args.pass,
    record: recordPath !== undefined,
    log: (m) => {
      console.log(m);
    },
  });

  const statsPath = args.stats;
  function shutdown() {
    handle.close();
    if (recordPath) {
      const body = handle.recording();
      if (body === null) {
        console.warn(`bridge: no frames captured — nothing written to '${recordPath}'`);
      } else {
        try {
          writeFileSync(recordPath, body);
          console.log(
            `bridge: wrote recording → ${recordPath} (${handle.stats().forwarded} frames)`,
          );
        } catch (e) {
          console.warn(
            `bridge: could not write recording '${recordPath}' (${e instanceof Error ? e.message : String(e)})`,
          );
        }
      }
    }
    if (statsPath) {
      try {
        writeFileSync(statsPath, JSON.stringify(handle.stats(), null, 2) + "\n");
        console.log(`bridge: wrote stats → ${statsPath}`);
      } catch (e) {
        console.warn(
          `bridge: could not write stats '${statsPath}' (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }
    setTimeout(() => process.exit(0), SHUTDOWN_BACKSTOP_MS).unref();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run only when invoked directly (`node .../mqtt_ws.js`), not when imported by the test.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
