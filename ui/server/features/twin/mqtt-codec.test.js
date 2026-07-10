// mqtt-codec.test.js — unit tests for the dependency-free MQTT 3.1.1 codec that fronts the
// bridge. The codec lives in the twin plugin's tools tree (materialized into viewer projects,
// runs under bare node); this test imports it directly, the way materialize.test.js reaches into
// the plugin. Placed under ui/ so the root `npm test` glob (find ui -name '*.test.js') runs it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PACKET_CONNECT,
  PACKET_CONNACK,
  PACKET_PUBLISH,
  PACKET_SUBSCRIBE,
  PACKET_SUBACK,
  PACKET_PINGREQ,
  PACKET_PINGRESP,
  PACKET_DISCONNECT,
  CONNACK_ACCEPTED,
  SUBACK_GRANTED_QOS0,
  QOS_AT_MOST_ONCE,
  encodeRemainingLength,
  decodeRemainingLength,
  encodeConnect,
  encodeSubscribe,
  encodePingreq,
  encodeDisconnect,
  encodeConnack,
  encodeSuback,
  encodePublish,
  encodePingresp,
  decodePackets,
} from "../../../../plugin/tools/bridge/mqtt_protocol.js";

// --- Remaining Length varint (§2.2.3) ---
// The four size boundaries the spec table calls out: 1 byte < 128, 2 bytes < 16384,
// 3 bytes < 2097152, 4 bytes up to 268435455.
test("remaining-length varint: byte-count boundaries (§2.2.3)", () => {
  assert.deepEqual([...encodeRemainingLength(0)], [0x00]);
  assert.deepEqual([...encodeRemainingLength(127)], [0x7f]); // last 1-byte value
  assert.deepEqual([...encodeRemainingLength(128)], [0x80, 0x01]); // first 2-byte value
  assert.deepEqual([...encodeRemainingLength(16383)], [0xff, 0x7f]); // last 2-byte value
  assert.deepEqual([...encodeRemainingLength(16384)], [0x80, 0x80, 0x01]); // first 3-byte value
  assert.deepEqual([...encodeRemainingLength(2097151)], [0xff, 0xff, 0x7f]); // last 3-byte value
  assert.deepEqual([...encodeRemainingLength(2097152)], [0x80, 0x80, 0x80, 0x01]); // first 4-byte
  assert.deepEqual([...encodeRemainingLength(268435455)], [0xff, 0xff, 0xff, 0x7f]); // max
});

test("remaining-length varint: encode→decode round-trips at the edges", () => {
  for (const n of [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 268435455]) {
    const buf = encodeRemainingLength(n);
    const got = decodeRemainingLength(buf, 0);
    assert.notEqual(got, null);
    assert.equal(got?.value, n, `value for ${n}`);
    assert.equal(got?.next, buf.length, `consumed all bytes for ${n}`);
  }
});

test("remaining-length varint: incomplete varint decodes to null (incremental)", () => {
  // 16384 encodes to 3 bytes [0x80,0x80,0x01]; only the two continuation bytes have arrived.
  const partial = Buffer.from([0x80, 0x80]);
  assert.equal(decodeRemainingLength(partial, 0), null);
});

test("remaining-length varint: over-long (>4 bytes) throws (§2.2.3)", () => {
  const tooLong = Buffer.from([0x80, 0x80, 0x80, 0x80, 0x01]);
  assert.throws(() => decodeRemainingLength(tooLong, 0), /4 bytes/);
});

// --- Packet round-trips: encode one packet, decode it back, assert the fields ---
/** Decode a buffer expected to hold exactly one whole packet, and return it.
 * @param {Buffer} buf @returns {import("../../../../plugin/tools/bridge/mqtt_protocol.js").MqttPacket} */
function only(buf) {
  const { packets, rest } = decodePackets(buf);
  assert.equal(packets.length, 1, "exactly one packet");
  assert.equal(rest.length, 0, "no trailing bytes");
  const [p] = packets;
  if (!p) throw new Error("expected one packet");
  return p;
}

test("CONNECT round-trips with username/password (§3.1)", () => {
  const p = only(
    encodeConnect({ clientId: "bridge-1", keepAlive: 60, username: "u", password: "p" }),
  );
  assert.equal(p.type, PACKET_CONNECT);
  assert.equal(p.protocolName, "MQTT");
  assert.equal(p.protocolLevel, 4);
  assert.equal(p.cleanSession, true);
  assert.equal(p.keepAlive, 60);
  assert.equal(p.clientId, "bridge-1");
  assert.equal(p.username, "u");
  assert.equal(p.password, "p");
});

test("CONNECT round-trips without credentials (fields absent, §3.1.2.3)", () => {
  const p = only(encodeConnect({ clientId: "anon", keepAlive: 30 }));
  assert.equal(p.clientId, "anon");
  assert.equal(p.username, undefined);
  assert.equal(p.password, undefined);
});

test("SUBSCRIBE round-trips filters at QoS 0 (§3.8)", () => {
  const p = only(encodeSubscribe({ packetId: 1, filters: ["plant/+/flow", "sensors/#"] }));
  assert.equal(p.type, PACKET_SUBSCRIBE);
  assert.equal(p.packetId, 1);
  assert.deepEqual(p.filters, [
    { filter: "plant/+/flow", qos: QOS_AT_MOST_ONCE },
    { filter: "sensors/#", qos: QOS_AT_MOST_ONCE },
  ]);
});

test("CONNACK round-trips accept + session-present flag (§3.2)", () => {
  const p = only(encodeConnack({ sessionPresent: false, returnCode: CONNACK_ACCEPTED }));
  assert.equal(p.type, PACKET_CONNACK);
  assert.equal(p.returnCode, CONNACK_ACCEPTED);
  assert.equal(p.sessionPresent, false);
  const present = only(encodeConnack({ sessionPresent: true }));
  assert.equal(present.sessionPresent, true);
});

test("SUBACK round-trips granted return codes (§3.9)", () => {
  const p = only(
    encodeSuback({ packetId: 7, returnCodes: [SUBACK_GRANTED_QOS0, SUBACK_GRANTED_QOS0] }),
  );
  assert.equal(p.type, PACKET_SUBACK);
  assert.equal(p.packetId, 7);
  assert.deepEqual(p.returnCodes, [0, 0]);
});

test("PUBLISH (QoS 0) round-trips topic + payload, no packet id (§3.3)", () => {
  const p = only(encodePublish({ topic: "plant/pump_1/temp", payload: "42.5" }));
  assert.equal(p.type, PACKET_PUBLISH);
  assert.equal(p.topic, "plant/pump_1/temp");
  assert.equal(p.qos, 0);
  assert.equal(p.retain, false);
  assert.equal(/** @type {Buffer} */ (p.payload).toString("utf8"), "42.5");
});

test("PUBLISH carries the retain flag (§3.3.1)", () => {
  const p = only(encodePublish({ topic: "t", payload: "1", retain: true }));
  assert.equal(p.retain, true);
});

test("PINGREQ / PINGRESP / DISCONNECT are type-only (§3.12-3.14)", () => {
  assert.equal(only(encodePingreq()).type, PACKET_PINGREQ);
  assert.equal(only(encodePingresp()).type, PACKET_PINGRESP);
  assert.equal(only(encodeDisconnect()).type, PACKET_DISCONNECT);
});

// --- Incremental decoding: the stream contract shared with sim/protocol.js decodeFrames ---
test("decodePackets drains multiple back-to-back packets in order", () => {
  const stream = Buffer.concat([
    encodeConnack({}),
    encodePublish({ topic: "a", payload: "1" }),
    encodePublish({ topic: "b", payload: "2" }),
    encodePingresp(),
  ]);
  const { packets, rest } = decodePackets(stream);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    packets.map((p) => p.type),
    [PACKET_CONNACK, PACKET_PUBLISH, PACKET_PUBLISH, PACKET_PINGRESP],
  );
  const topics = packets.map((p) => p.topic);
  assert.equal(topics[1], "a");
  assert.equal(topics[2], "b");
});

test("decodePackets returns the partial trailing packet as rest, resumable next chunk", () => {
  const whole = Buffer.concat([
    encodePublish({ topic: "first", payload: "10" }),
    encodePublish({ topic: "second", payload: "20" }),
  ]);
  // Cut the buffer inside the second packet's body.
  const cut = whole.length - 3;
  const first = decodePackets(whole.subarray(0, cut));
  assert.equal(first.packets.length, 1, "only the first packet is complete");
  assert.equal(first.packets.map((p) => p.topic)[0], "first");
  // Prepend the remainder to the rest of the stream — the second packet now completes.
  const second = decodePackets(Buffer.concat([first.rest, whole.subarray(cut)]));
  assert.equal(second.packets.length, 1);
  assert.equal(second.packets.map((p) => p.topic)[0], "second");
  assert.equal(second.rest.length, 0);
});

test("decodePackets waits when only a partial fixed header has arrived", () => {
  // A lone type byte with no remaining-length byte yet.
  const { packets, rest } = decodePackets(Buffer.from([PACKET_CONNACK << 4]));
  assert.equal(packets.length, 0);
  assert.equal(rest.length, 1);
});
