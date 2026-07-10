// tools/bridge/demo_publish.js — a tiny MQTT demo publisher: the broker-side counterpart to the
// seeded sim, so the MQTT path can be tried end-to-end WITHOUT hand-writing a mosquitto_pub loop.
// It publishes the six house demo topics (the ones plugin/examples/mqtt_map.example.json maps)
// to a broker at a gentle rate, with smooth animated values, so the bridge → viewer paints and
// moves. Point it at any MQTT 3.1.1 broker; then run mqtt_ws.js against the same broker.
//
//   node tools/bridge/demo_publish.js --broker mqtt://localhost:1883 [--hz 2] [--user u --pass p]
//
// Dependency-free by design (bare `node`, no npm install): it speaks MQTT client-side using the
// SAME ./mqtt_protocol.js codec the bridge uses, and reuses the sim's smooth value function
// (../sim/stream.js tagValue) so the demo telemetry looks alive. The topic table below is kept in
// lockstep with mqtt_map.example.json by mqtt-demo.test.js — change one, the test flags the other.
import net from "node:net";
import { pathToFileURL } from "node:url";

import { parseArgs, tagValue, MS_PER_SEC } from "../sim/stream.js";
import {
  PACKET_CONNACK,
  CONNACK_ACCEPTED,
  encodeConnect,
  encodePublish,
  encodePingreq,
  encodeDisconnect,
  decodePackets,
} from "./mqtt_protocol.js";

/** Default broker port (MQTT 3.1.1 IANA-assigned) when a `mqtt://host` URL omits one. */
const DEFAULT_MQTT_PORT = 1883;

/** Default publish rate (Hz). Gentle on purpose — a twin dashboard reads calmer than a firehose,
 * and 2 Hz is plenty to see the heat map move. */
const DEFAULT_HZ = 2;

/** Fixed seed for the smooth value function — the demo need not be reproducible, but a fixed seed
 * keeps the motion pleasant and phase-shifted per topic (see ../sim/stream.js tagValue). */
const DEMO_SEED = 42;

/** Keep Alive (seconds, §3.1.2.10) advertised in CONNECT; the publisher PINGs at half this. */
const KEEP_ALIVE_SEC = 60;
const PING_INTERVAL_MS = (KEEP_ALIVE_SEC * 1000) / 2;

/** MQTT client id for the publisher (§3.1.3.1); clean session, distinct from the bridge's. */
const CLIENT_ID = "xenodot-twin-demo-pub";

/** The six demo topics, matching plugin/examples/mqtt_map.example.json. `field` publishes a
 * JSON object `{ [field]: value }`; `integer` rounds to a whole number (the door is 0/1); the rest
 * publish a bare one-decimal number. `[min,max]` is the value range (also the ramp range).
 * @type {{ topic: string, min: number, max: number, field?: string, integer?: boolean }[]} */
export const DEMO_TOPICS = [
  { topic: "house/living_room/temp", min: 18, max: 30 },
  { topic: "house/kitchen/temp", min: 18, max: 30 },
  { topic: "house/bedroom_1/temp", min: 18, max: 30 },
  { topic: "house/boiler/temp", min: 40, max: 80 },
  { topic: "house/solar/power", min: 0, max: 5000, field: "watts" },
  { topic: "house/entrance_door/state", min: 0, max: 1, integer: true },
];

/** The publishable (topic, payload) pairs for a given integer tick — pure, so the topic↔map
 * agreement is unit-testable without a broker. @param {number} tick
 * @returns {{ topic: string, payload: string }[]} */
export function demoSample(tick) {
  return DEMO_TOPICS.map((t, i) => {
    const v = tagValue(DEMO_SEED, tick, i, DEMO_TOPICS.length, t.min, t.max);
    let payload;
    if (t.field !== undefined) payload = JSON.stringify({ [t.field]: Math.round(v) });
    else if (t.integer) payload = String(Math.round(v));
    else payload = v.toFixed(1);
    return { topic: t.topic, payload };
  });
}

/**
 * Connect to the broker and publish the demo topics at `hz` until SIGINT. Returns a `close()`.
 * @param {{ brokerHost: string, brokerPort: number, hz?: number, username?: string,
 *   password?: string, log?: (m: string) => void }} opts
 * @returns {{ close: () => void }} */
export function startDemoPublisher(opts) {
  const { brokerHost, brokerPort, hz = DEFAULT_HZ, username, password, log = () => {} } = opts;
  const periodMs = Math.max(1, Math.round(MS_PER_SEC / hz));
  let tick = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  let publishTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pingTimer = null;

  const sock = net.connect({ host: brokerHost, port: brokerPort });
  /** @type {Buffer} */
  let rx = Buffer.alloc(0);

  sock.on("connect", () => {
    log(`demo-pub: connected to broker ${brokerHost}:${brokerPort}`);
    sock.write(
      encodeConnect({ clientId: CLIENT_ID, keepAlive: KEEP_ALIVE_SEC, username, password }),
    );
  });
  sock.on("data", (chunk) => {
    const { packets, rest } = decodePackets(Buffer.concat([rx, /** @type {Buffer} */ (chunk)]));
    rx = rest;
    for (const p of packets) {
      if (p.type !== PACKET_CONNACK) continue;
      if (p.returnCode !== CONNACK_ACCEPTED) {
        log(`demo-pub: broker refused CONNECT (return code ${String(p.returnCode)})`);
        sock.destroy();
        return;
      }
      log(`demo-pub: publishing ${DEMO_TOPICS.length} topics at ${hz} Hz`);
      publishTimer = setInterval(() => {
        for (const { topic, payload } of demoSample(tick))
          sock.write(encodePublish({ topic, payload }));
        tick++;
      }, periodMs);
      pingTimer = setInterval(() => sock.write(encodePingreq()), PING_INTERVAL_MS);
    }
  });
  sock.on("error", (e) => {
    log(`demo-pub: broker connection error (${e.message})`);
  });

  function close() {
    if (publishTimer) clearInterval(publishTimer);
    if (pingTimer) clearInterval(pingTimer);
    try {
      sock.write(encodeDisconnect());
    } catch {
      /* socket already gone */
    }
    sock.destroy();
  }
  return { close };
}

// --- CLI ---
/** Parse a `mqtt://host[:port]` broker URL, rejecting unsupported schemes.
 * @param {string} raw @returns {{ host: string, port: number }} */
function parseBroker(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`--broker: not a URL: '${raw}'`);
  }
  if (u.protocol !== "mqtt:") {
    throw new Error(`--broker: only mqtt:// is supported (got '${u.protocol}//')`);
  }
  return { host: u.hostname, port: Number(u.port || DEFAULT_MQTT_PORT) };
}

/** @returns {void} */
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.broker) {
    console.error(
      "usage: node tools/bridge/demo_publish.js --broker mqtt://host:1883 [--hz 2] [--user u --pass p]",
    );
    process.exit(1);
  }
  let broker;
  try {
    broker = parseBroker(args.broker);
  } catch (e) {
    console.error(`demo-pub: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
    return;
  }
  const handle = startDemoPublisher({
    brokerHost: broker.host,
    brokerPort: broker.port,
    hz: args.hz ? Number(args.hz) : DEFAULT_HZ,
    username: args.user,
    password: args.pass,
    log: (m) => {
      console.log(m);
    },
  });
  const shutdown = () => {
    handle.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
