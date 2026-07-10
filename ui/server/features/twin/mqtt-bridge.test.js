// mqtt-bridge.test.js — in-process integration test for the MQTT→WS bridge. A fake broker (a net
// server built on the SAME mqtt_protocol.js codec the bridge uses) answers CONNACK/SUBACK and
// publishes scripted PUBLISHes; the REAL bridge translate path runs; a real ws client asserts it
// receives the exact DataBus frames `{tag, value, seq, sent_ms}` with gapless seq. No live broker —
// deterministic, CI-safe. Placed under ui/ so the root `npm test` glob runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { WebSocket } from "ws";

import {
  PACKET_CONNECT,
  PACKET_SUBSCRIBE,
  PACKET_PINGREQ,
  CONNACK_ACCEPTED,
  SUBACK_GRANTED_QOS0,
  encodeConnack,
  encodeSuback,
  encodePublish,
  encodePingresp,
  decodePackets,
} from "../../../../plugin-twin/tools/bridge/mqtt_protocol.js";
import { parseMap } from "../../../../plugin-twin/tools/bridge/map.js";
import { startBridge } from "../../../../plugin-twin/tools/bridge/mqtt_ws.js";
import {
  RECORDING_KIND,
  RECORDING_VERSION,
  SEED_RECORDED,
} from "../../../../plugin-twin/tools/sim/recording.js";

/** Parse JSON, laundering `JSON.parse`'s `any` through `unknown` so the caller narrows explicitly
 * (same pattern as the tools' own parsers). @param {string} text @returns {unknown} */
function parseJson(text) {
  return /** @type {unknown} */ (JSON.parse(text));
}

/** One DataBus frame as the viewer sees it. @typedef {{ tag: string, value: number, seq: number, sent_ms: number }} Frame */

/** Decode a ws `message` payload (any RawData shape) into a Frame. @param {import("ws").RawData} data
 * @returns {Frame} */
function readFrame(data) {
  const text = Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : Buffer.from(data).toString("utf8"); // ArrayBuffer
  const parsed = /** @type {unknown} */ (JSON.parse(text));
  return /** @type {Frame} */ (parsed);
}

/** A minimal MQTT broker for the test: accepts one bridge connection, replies CONNACK to CONNECT
 * and SUBACK to SUBSCRIBE (granting QoS 0), answers PINGREQ, and exposes `publish()` so the test
 * scripts PUBLISHes to the connected bridge. Built on the bridge's own codec — one wire spec. */
function fakeBroker() {
  /** @type {net.Socket | null} */
  let bridgeSock = null;
  /** @type {() => void} */
  let markSubscribed = () => {};
  const whenSubscribed = new Promise((resolve) => {
    markSubscribed = /** @type {() => void} */ (resolve);
  });
  const server = net.createServer((sock) => {
    bridgeSock = sock;
    /** @type {Buffer} */
    let rx = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      const { packets, rest } = decodePackets(Buffer.concat([rx, /** @type {Buffer} */ (chunk)]));
      rx = rest;
      for (const p of packets) {
        if (p.type === PACKET_CONNECT) {
          sock.write(encodeConnack({ returnCode: CONNACK_ACCEPTED }));
        } else if (p.type === PACKET_SUBSCRIBE) {
          const filters = /** @type {{ filter: string }[]} */ (p.filters ?? []);
          sock.write(
            encodeSuback({
              packetId: /** @type {number} */ (p.packetId),
              returnCodes: filters.map(() => SUBACK_GRANTED_QOS0),
            }),
          );
          markSubscribed();
        } else if (p.type === PACKET_PINGREQ) {
          sock.write(encodePingresp());
        }
      }
    });
    sock.on("error", () => {});
  });
  return {
    /** @returns {Promise<number>} the bound broker port */
    listen: () =>
      new Promise((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
        });
      }),
    /** @param {string} topic @param {string} payload */
    publish: (topic, payload) => bridgeSock?.write(encodePublish({ topic, payload })),
    whenSubscribed,
    close: () => server.close(),
  };
}

test("fake broker → bridge → ws client: exact frames, gapless seq, drops counted", async () => {
  const broker = fakeBroker();
  const brokerPort = await broker.listen();

  const map = parseMap(
    JSON.stringify({
      rules: [
        { topic: "house/living_room/temp", tag: "living_room.temp" }, // explicit tag
        { topic: "house/+/temp" }, // derived tag
        { topic: "plant/pump_1/flow", field: "value" }, // JSON field
      ],
    }),
  );

  const bridge = startBridge({
    brokerHost: "127.0.0.1",
    brokerPort,
    map,
    port: 0, // ephemeral WS port
  });
  const wsPort = await bridge.whenListening;

  const client = new WebSocket(`ws://127.0.0.1:${wsPort}`);
  /** @type {Frame[]} */
  const frames = [];
  const gotThree = new Promise((resolve) => {
    client.on("message", (data) => {
      frames.push(readFrame(data));
      if (frames.length === 3) resolve(undefined);
    });
  });

  await new Promise((resolve) => {
    client.on("open", () => {
      resolve(undefined);
    });
  });
  await broker.whenSubscribed;

  // Three that map, two that drop (one non-numeric, one unmapped) — interleaved.
  broker.publish("house/living_room/temp", "21.5"); // → living_room.temp = 21.5  (seq 0)
  broker.publish("house/kitchen/temp", "22"); // → house.kitchen.temp = 22       (seq 1)
  broker.publish("house/bedroom_1/temp", "warm"); // bad payload → dropped
  broker.publish("plant/pump_1/flow", JSON.stringify({ value: 9 })); // → plant.pump_1.flow = 9 (seq 2)
  broker.publish("unmapped/topic", "1"); // no rule → dropped

  await gotThree;
  await new Promise((resolve) => setTimeout(resolve, 30)); // let the two drops settle

  assert.deepEqual(
    frames.map((f) => ({ tag: f.tag, value: f.value, seq: f.seq })),
    [
      { tag: "living_room.temp", value: 21.5, seq: 0 },
      { tag: "house.kitchen.temp", value: 22, seq: 1 },
      { tag: "plant.pump_1.flow", value: 9, seq: 2 },
    ],
  );
  for (const f of frames) assert.equal(typeof f.sent_ms, "number");

  const stats = bridge.stats();
  assert.equal(stats.forwarded, 3);
  assert.deepEqual(stats.dropped, { noRule: 1, badPayload: 1 });
  assert.deepEqual(stats.filters, ["house/living_room/temp", "house/+/temp", "plant/pump_1/flow"]);

  client.close();
  bridge.close();
  broker.close();
});

test("--record: forwarded frames serialize as a valid twin-recording (live→hostable)", async () => {
  const broker = fakeBroker();
  const brokerPort = await broker.listen();
  const map = parseMap(
    JSON.stringify({
      rules: [{ topic: "house/+/temp" }, { topic: "plant/pump_1/flow", field: "value" }],
    }),
  );

  const bridge = startBridge({ brokerHost: "127.0.0.1", brokerPort, map, port: 0, record: true });
  const wsPort = await bridge.whenListening;
  const client = new WebSocket(`ws://127.0.0.1:${wsPort}`);
  /** @type {Frame[]} */
  const frames = [];
  const gotThree = new Promise((resolve) => {
    client.on("message", (data) => {
      frames.push(readFrame(data));
      if (frames.length === 3) resolve(undefined);
    });
  });
  await new Promise((resolve) => {
    client.on("open", () => {
      resolve(undefined);
    });
  });
  await broker.whenSubscribed;

  broker.publish("house/kitchen/temp", "22.5"); // → house.kitchen.temp = 22.5 (seq 0)
  broker.publish("house/bedroom_1/temp", "warm"); // dropped — not recorded
  broker.publish("plant/pump_1/flow", JSON.stringify({ value: 9 })); // → plant.pump_1.flow = 9 (seq 1)
  broker.publish("house/kitchen/temp", "23.5"); // → house.kitchen.temp = 23.5 (seq 2)
  await gotThree;

  const body = bridge.recording();
  assert.ok(body !== null, "recording body should be present when record:true and frames flowed");
  const lines = /** @type {string} */ (body).trim().split("\n");
  const header =
    /** @type {{ version: number, kind: string, seed: number, tags: { tag: string, min: number, max: number }[] }} */ (
      parseJson(/** @type {string} */ (lines[0]))
    );
  assert.equal(header.kind, RECORDING_KIND);
  assert.equal(header.version, RECORDING_VERSION);
  assert.equal(header.seed, SEED_RECORDED); // live capture, not synthesized
  // Header tag table carries the observed value range (kitchen seen twice: 22.5..23.5).
  const kitchen = header.tags.find((t) => t.tag === "house.kitchen.temp");
  assert.deepEqual(kitchen, { tag: "house.kitchen.temp", min: 22.5, max: 23.5 });

  const recFrames = lines
    .slice(1)
    .map(
      (l) =>
        /** @type {import("../../../../plugin-twin/tools/sim/recording.js").RecordingFrame} */ (
          parseJson(l)
        ),
    );
  assert.equal(recFrames.length, 3); // only the 3 mapped publishes; the bad payload is not recorded
  assert.deepEqual(
    recFrames.map((f) => ({ tag: f.tag, value: f.value, seq: f.seq })),
    [
      { tag: "house.kitchen.temp", value: 22.5, seq: 0 },
      { tag: "plant.pump_1.flow", value: 9, seq: 1 },
      { tag: "house.kitchen.temp", value: 23.5, seq: 2 },
    ],
  );
  for (let i = 1; i < recFrames.length; i++) {
    const prev =
      /** @type {import("../../../../plugin-twin/tools/sim/recording.js").RecordingFrame} */ (
        recFrames[i - 1]
      );
    const cur =
      /** @type {import("../../../../plugin-twin/tools/sim/recording.js").RecordingFrame} */ (
        recFrames[i]
      );
    assert.ok(cur.t_ms >= prev.t_ms, "t_ms must be ascending (recording contract)");
  }

  client.close();
  bridge.close();
  broker.close();
});
