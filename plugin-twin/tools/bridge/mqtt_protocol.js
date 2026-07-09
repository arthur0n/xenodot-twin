// tools/bridge/mqtt_protocol.js — minimal MQTT 3.1.1 packet encode/decode, shared by the bridge
// client (mqtt_ws.js, the real broker connection) and the fake broker the integration test drives.
//
// One module on purpose — same rule as tools/sim/protocol.js for the WebSocket wire: the packet
// layout is a cross-file agreement between the two ends, so both ends read the SAME named
// constants. A SUBSCRIBE the broker can't parse, or a PUBLISH whose remaining-length the client
// reads differently, is a silent interop break. Encoders here serve BOTH directions (the client
// sends CONNECT/SUBSCRIBE/PINGREQ/DISCONNECT; the fake broker sends CONNACK/SUBACK/PUBLISH/
// PINGRESP) and the one incremental decoder parses whichever the wire carries.
//
// Scope is deliberately the QoS-0 subscribe subset the bridge needs (plan: MQTT 5, QoS 1/2, TLS
// and the publish/write path are out of scope v1). Every constant is named with its OASIS MQTT
// 3.1.1 spec section so the wire layout is auditable against the spec, not folklore.
//
// Dependency-free by design: the materialized tools/ ships no package.json, so this must run
// under a bare `node` (see ../sim/protocol.js and ../sim/server.js headers for the full rationale).

// --- Control packet types (MQTT 3.1.1 §2.2.1, the high nibble of byte 0) ---
/** Client → server: open the network connection. §3.1. */
export const PACKET_CONNECT = 1;
/** Server → client: acknowledge CONNECT. §3.2. */
export const PACKET_CONNACK = 2;
/** Either direction: publish a message. The bridge only RECEIVES these; the fake broker sends
 * them. §3.3. */
export const PACKET_PUBLISH = 3;
/** Client → server: subscribe to topic filters. §3.8. */
export const PACKET_SUBSCRIBE = 8;
/** Server → client: acknowledge SUBSCRIBE. §3.9. */
export const PACKET_SUBACK = 9;
/** Client → server: keepalive ping. §3.12. */
export const PACKET_PINGREQ = 12;
/** Server → client: ping response. §3.13. */
export const PACKET_PINGRESP = 13;
/** Client → server: clean disconnect. §3.14. */
export const PACKET_DISCONNECT = 14;

// --- Fixed header (MQTT 3.1.1 §2.2) ---
/** Bit position of the packet type within byte 0 (type occupies the high nibble). §2.2.1. */
const PACKET_TYPE_SHIFT = 4;
/** Low nibble of byte 0 = the type-specific flags. §2.2.2. */
const PACKET_FLAGS_MASK = 0x0f;

/** SUBSCRIBE's byte-0 flags are RESERVED and MUST be 0b0010; a broker MUST treat any other value
 * as a protocol violation. §3.8.1. */
const SUBSCRIBE_FLAGS = 0x02;

/** PUBLISH byte-0 flag layout (§3.3.1): bit 3 DUP, bits 2-1 QoS, bit 0 RETAIN. */
const PUBLISH_DUP_BIT = 0x08;
const PUBLISH_QOS_SHIFT = 1;
const PUBLISH_QOS_MASK = 0x03;
const PUBLISH_RETAIN_BIT = 0x01;

// --- Remaining Length varint (MQTT 3.1.1 §2.2.3) ---
/** Continuation bit of a remaining-length byte: set means "another length byte follows". §2.2.3. */
const REMLEN_CONTINUATION_BIT = 0x80;
/** Value bits of a remaining-length byte (the low 7). §2.2.3. */
const REMLEN_VALUE_MASK = 0x7f;
/** Remaining Length is encoded in AT MOST 4 bytes (max value 268 435 455). §2.2.3. */
const REMLEN_MAX_BYTES = 4;

// --- UTF-8 string fields (MQTT 3.1.1 §1.5.3) ---
/** Every MQTT string is prefixed with its byte length as a 2-byte big-endian integer. §1.5.3. */
const STRING_LEN_BYTES = 2;
/** A 2-byte big-endian packet identifier (SUBSCRIBE/SUBACK, and QoS>0 PUBLISH). §2.3.1. */
const PACKET_ID_BYTES = 2;
/** A 2-byte big-endian Keep Alive (seconds) in the CONNECT variable header. §3.1.2.10. */
const KEEP_ALIVE_BYTES = 2;

// --- CONNECT variable header (MQTT 3.1.1 §3.1.2) ---
/** Protocol Name — the fixed MQTT string "MQTT" for 3.1.1. §3.1.2.1. */
const PROTOCOL_NAME = "MQTT";
/** Protocol Level — 4 identifies MQTT 3.1.1. §3.1.2.2. */
const PROTOCOL_LEVEL = 4;
/** CONNECT flags byte layout (§3.1.2.3): bit 7 username, bit 6 password, bit 5 will retain,
 * bits 4-3 will QoS, bit 2 will flag, bit 1 clean session, bit 0 reserved (MUST be 0). */
const CONNECT_FLAG_USERNAME = 0x80;
const CONNECT_FLAG_PASSWORD = 0x40;
const CONNECT_FLAG_CLEAN_SESSION = 0x02;

// --- CONNACK (MQTT 3.1.1 §3.2) ---
/** CONNACK acknowledge-flags byte: bit 0 = Session Present. §3.2.2.1. */
const CONNACK_SESSION_PRESENT_BIT = 0x01;
/** CONNACK return code 0 = Connection Accepted. §3.2.2.3. (Non-zero codes name the refusal;
 * the client surfaces them rather than enumerating each here.) */
export const CONNACK_ACCEPTED = 0;

/** SUBACK per-filter return code for a granted QoS-0 subscription. §3.9.3. */
export const SUBACK_GRANTED_QOS0 = 0;
/** SUBACK per-filter return code 0x80 = Failure. §3.9.3. */
export const SUBACK_FAILURE = 0x80;

/** QoS level the bridge subscribes at — latest value wins, no delivery/history promise, matching
 * the viewer's live-data stance. §4.3.1 (QoS 0 "at most once"). */
export const QOS_AT_MOST_ONCE = 0;

// --- MQTT string helpers (§1.5.3) ---
/** Encode a UTF-8 string as a 2-byte-length-prefixed MQTT string. §1.5.3.
 * @param {string} str @returns {Buffer} */
function encodeString(str) {
  const body = Buffer.from(str, "utf8");
  const head = Buffer.alloc(STRING_LEN_BYTES);
  head.writeUInt16BE(body.length, 0);
  return Buffer.concat([head, body]);
}

/** Read a length-prefixed MQTT string at `offset`. §1.5.3.
 * @param {Buffer} buf @param {number} offset
 * @returns {{ value: string, next: number }} the string and the offset just past it. */
function readString(buf, offset) {
  const len = buf.readUInt16BE(offset);
  const start = offset + STRING_LEN_BYTES;
  return { value: buf.toString("utf8", start, start + len), next: start + len };
}

// --- Remaining Length varint (§2.2.3) ---
/** Encode a Remaining Length value as its 1-4 byte varint. §2.2.3.
 * @param {number} n a non-negative byte count @returns {Buffer} */
export function encodeRemainingLength(n) {
  const bytes = [];
  let value = n;
  do {
    let byte = value & REMLEN_VALUE_MASK;
    value = Math.floor(value / REMLEN_CONTINUATION_BIT); // shift right 7 bits
    if (value > 0) byte |= REMLEN_CONTINUATION_BIT;
    bytes.push(byte);
  } while (value > 0);
  return Buffer.from(bytes);
}

/** Decode a Remaining Length varint starting at `offset`. §2.2.3. Returns null when the buffer
 * does not yet hold the whole varint (incremental — the caller waits for more bytes).
 * @param {Buffer} buf @param {number} offset
 * @returns {{ value: number, next: number } | null} */
export function decodeRemainingLength(buf, offset) {
  let value = 0;
  let multiplier = 1;
  let i = offset;
  for (let count = 0; count < REMLEN_MAX_BYTES; count++) {
    if (i >= buf.length) return null; // varint not fully arrived yet
    const byte = buf[i++] ?? 0;
    value += (byte & REMLEN_VALUE_MASK) * multiplier;
    if ((byte & REMLEN_CONTINUATION_BIT) === 0) return { value, next: i };
    multiplier *= REMLEN_CONTINUATION_BIT; // ×128 per §2.2.3
  }
  throw new Error("MQTT remaining length exceeds 4 bytes (§2.2.3)");
}

// --- Fixed-header assembly ---
/** Prepend the fixed header (byte 0 + Remaining Length varint) to a variable-header+payload body.
 * §2.2. @param {number} type packet type @param {number} flags byte-0 low nibble
 * @param {Buffer} body @returns {Buffer} */
function packet(type, flags, body) {
  const byte0 = (type << PACKET_TYPE_SHIFT) | (flags & PACKET_FLAGS_MASK);
  return Buffer.concat([Buffer.from([byte0]), encodeRemainingLength(body.length), body]);
}

// --- Encoders: client → server ---
/** Encode a CONNECT packet. §3.1. Clean session, optional username/password (they ride the
 * existing §3.1.3.4/5 fields — real brokers commonly require them). Will/keepalive-driven
 * disconnect are out of scope; keepAlive is advertised so the broker won't reap an idle bridge.
 * @param {{ clientId: string, keepAlive: number, username?: string, password?: string }} o
 * @returns {Buffer} */
export function encodeConnect(o) {
  let flags = CONNECT_FLAG_CLEAN_SESSION;
  if (o.username !== undefined) flags |= CONNECT_FLAG_USERNAME;
  if (o.password !== undefined) flags |= CONNECT_FLAG_PASSWORD;

  const keepAlive = Buffer.alloc(KEEP_ALIVE_BYTES);
  keepAlive.writeUInt16BE(o.keepAlive, 0);

  const parts = [
    encodeString(PROTOCOL_NAME), // §3.1.2.1
    Buffer.from([PROTOCOL_LEVEL, flags]), // §3.1.2.2, §3.1.2.3
    keepAlive, // §3.1.2.10
    encodeString(o.clientId), // §3.1.3.1 (first payload field)
  ];
  if (o.username !== undefined) parts.push(encodeString(o.username)); // §3.1.3.4
  if (o.password !== undefined) parts.push(encodeString(o.password)); // §3.1.3.5
  return packet(PACKET_CONNECT, 0, Buffer.concat(parts));
}

/** Encode a SUBSCRIBE packet for a list of topic filters, all at QoS 0. §3.8.
 * @param {{ packetId: number, filters: string[] }} o @returns {Buffer} */
export function encodeSubscribe(o) {
  const id = Buffer.alloc(PACKET_ID_BYTES);
  id.writeUInt16BE(o.packetId, 0); // §3.8.2
  const entries = o.filters.map((f) =>
    Buffer.concat([encodeString(f), Buffer.from([QOS_AT_MOST_ONCE])]),
  ); // §3.8.3: each filter followed by its requested QoS byte
  return packet(PACKET_SUBSCRIBE, SUBSCRIBE_FLAGS, Buffer.concat([id, ...entries]));
}

/** Encode a PINGREQ (no variable header or payload). §3.12. @returns {Buffer} */
export function encodePingreq() {
  return packet(PACKET_PINGREQ, 0, Buffer.alloc(0));
}

/** Encode a DISCONNECT (no variable header or payload). §3.14. @returns {Buffer} */
export function encodeDisconnect() {
  return packet(PACKET_DISCONNECT, 0, Buffer.alloc(0));
}

// --- Encoders: server → client (the fake broker in the integration test) ---
/** Encode a CONNACK. §3.2. @param {{ sessionPresent?: boolean, returnCode?: number }} [o]
 * @returns {Buffer} */
export function encodeConnack(o = {}) {
  const ack = o.sessionPresent ? CONNACK_SESSION_PRESENT_BIT : 0; // §3.2.2.1
  const code = o.returnCode ?? CONNACK_ACCEPTED; // §3.2.2.3
  return packet(PACKET_CONNACK, 0, Buffer.from([ack, code]));
}

/** Encode a SUBACK granting one return code per subscribed filter. §3.9.
 * @param {{ packetId: number, returnCodes: number[] }} o @returns {Buffer} */
export function encodeSuback(o) {
  const id = Buffer.alloc(PACKET_ID_BYTES);
  id.writeUInt16BE(o.packetId, 0); // §3.9.2
  return packet(PACKET_SUBACK, 0, Buffer.concat([id, Buffer.from(o.returnCodes)])); // §3.9.3
}

/** Encode a QoS-0 PUBLISH (no packet identifier — §3.3.2.2 omits it below QoS 1). §3.3.
 * @param {{ topic: string, payload: string | Buffer, retain?: boolean }} o @returns {Buffer} */
export function encodePublish(o) {
  const flags = o.retain ? PUBLISH_RETAIN_BIT : 0; // QoS 0, DUP 0 — §3.3.1
  const payload = Buffer.isBuffer(o.payload) ? o.payload : Buffer.from(o.payload, "utf8");
  return packet(PACKET_PUBLISH, flags, Buffer.concat([encodeString(o.topic), payload])); // §3.3.2
}

/** Encode a PINGRESP (no variable header or payload). §3.13. @returns {Buffer} */
export function encodePingresp() {
  return packet(PACKET_PINGRESP, 0, Buffer.alloc(0));
}

// --- Decoding ---
/** One decoded packet. `type` is always present; the remaining fields depend on the type (a
 * PUBLISH carries topic/payload/qos/retain; a CONNACK sessionPresent/returnCode; a SUBACK
 * packetId/returnCodes; a CONNECT clientId/username/password; a SUBSCRIBE packetId/filters;
 * PINGREQ/PINGRESP/DISCONNECT carry only the type). */
/** @typedef {{ type: number, [k: string]: unknown }} MqttPacket */

/** Decode a CONNECT body: §3.1.2 protocol name + level + flags + keepalive, then §3.1.3 payload
 * (client id, then username/password when their flags are set). Split out of decodeBody because
 * it is the one type with conditional payload fields. @param {Buffer} body @returns {MqttPacket} */
function decodeConnect(body) {
  const name = readString(body, 0);
  let off = name.next;
  const level = body[off++] ?? 0;
  const connectFlags = body[off++] ?? 0;
  const keepAlive = body.readUInt16BE(off);
  off += KEEP_ALIVE_BYTES;
  const clientId = readString(body, off);
  off = clientId.next;
  /** @type {MqttPacket} */
  const out = {
    type: PACKET_CONNECT,
    protocolName: name.value,
    protocolLevel: level,
    cleanSession: (connectFlags & CONNECT_FLAG_CLEAN_SESSION) !== 0,
    keepAlive,
    clientId: clientId.value,
  };
  if (connectFlags & CONNECT_FLAG_USERNAME) {
    const u = readString(body, off);
    out.username = u.value;
    off = u.next;
  }
  if (connectFlags & CONNECT_FLAG_PASSWORD) {
    out.password = readString(body, off).value;
  }
  return out;
}

/** Parse the variable header + payload of one packet body by type. Only the QoS-0 subscribe
 * subset is decoded; any other type is returned as `{ type }` with the raw body attached so an
 * unexpected packet is visible, never a silent crash.
 * @param {number} type @param {number} flags @param {Buffer} body @returns {MqttPacket} */
function decodeBody(type, flags, body) {
  switch (type) {
    case PACKET_CONNECT:
      return decodeConnect(body);
    case PACKET_CONNACK: // §3.2.2
      return {
        type,
        sessionPresent: ((body[0] ?? 0) & CONNACK_SESSION_PRESENT_BIT) !== 0,
        returnCode: body[1] ?? 0,
      };
    case PACKET_PUBLISH: {
      // §3.3.2 topic, then (QoS>0 only) packet id, then payload. The bridge subscribes at QoS 0,
      // but decode the id when the flags say QoS>0 so a mislabelled broker frame still parses.
      const topic = readString(body, 0);
      const qos = (flags >> PUBLISH_QOS_SHIFT) & PUBLISH_QOS_MASK;
      let off = topic.next;
      if (qos > QOS_AT_MOST_ONCE) off += PACKET_ID_BYTES;
      return {
        type,
        topic: topic.value,
        qos,
        retain: (flags & PUBLISH_RETAIN_BIT) !== 0,
        dup: (flags & PUBLISH_DUP_BIT) !== 0,
        payload: body.subarray(off),
      };
    }
    case PACKET_SUBSCRIBE: {
      // §3.8.2 packet id, then §3.8.3 [filter, requested-qos] entries to the end of the body.
      const packetId = body.readUInt16BE(0);
      let off = PACKET_ID_BYTES;
      const filters = [];
      while (off < body.length) {
        const f = readString(body, off);
        const requestedQos = body[f.next] ?? 0;
        filters.push({ filter: f.value, qos: requestedQos });
        off = f.next + 1;
      }
      return { type, packetId, filters };
    }
    case PACKET_SUBACK: // §3.9.2 packet id + §3.9.3 return codes
      return {
        type,
        packetId: body.readUInt16BE(0),
        returnCodes: Array.from(body.subarray(PACKET_ID_BYTES)),
      };
    case PACKET_PINGREQ:
    case PACKET_PINGRESP:
    case PACKET_DISCONNECT:
      return { type }; // no variable header or payload
    default:
      return { type, flags, body }; // unrecognised — surfaced, not dropped
  }
}

/** Drain every complete packet out of `buf`. Incremental: returns the decoded packets plus the
 * unconsumed remainder (a partial trailing packet), which the caller prepends to the next chunk —
 * same contract as ../sim/protocol.js `decodeFrames` (`{ frames, rest }`), named `packets` here.
 * @param {Buffer} buf @returns {{ packets: MqttPacket[], rest: Buffer }} */
export function decodePackets(buf) {
  /** @type {MqttPacket[]} */
  const packets = [];
  let offset = 0;
  while (offset < buf.length) {
    const byte0 = buf[offset] ?? 0;
    const type = byte0 >> PACKET_TYPE_SHIFT;
    const flags = byte0 & PACKET_FLAGS_MASK;
    const rem = decodeRemainingLength(buf, offset + 1);
    if (rem === null) break; // fixed header not fully arrived
    const bodyStart = rem.next;
    const bodyEnd = bodyStart + rem.value;
    if (bodyEnd > buf.length) break; // body not fully arrived
    packets.push(decodeBody(type, flags, buf.subarray(bodyStart, bodyEnd)));
    offset = bodyEnd;
  }
  return { packets, rest: buf.subarray(offset) };
}
