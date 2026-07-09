// tools/bridge/map.js — the pure translation layer between a broker's MQTT topics and the
// DataBus tag stream: topic-filter matching (§4.7), topic→tag derivation, and payload→value
// extraction. No I/O, no sockets — every function here is a pure function of its arguments, so
// the whole mapping is unit-testable without a broker (the network lives in mqtt_ws.js).
//
// The rule list comes from an agent-authored, human-diffable JSON map file (the two-layer house
// pattern: capability in the plugin, DATA in the project). First matching rule wins — rule order
// is significant, documented on matchTopic.
//
// Dependency-free by design: the materialized tools/ ships no package.json, so this runs under a
// bare `node` (see ../sim/protocol.js for the full rationale).

/** One mapping rule. `topic` is an exact topic or an MQTT wildcard filter the bridge subscribes
 * to. `tag` names the DataBus tag explicitly; when absent it is DERIVED from the concrete topic
 * (slash→dot). `field` names the numeric key when the payload is a JSON object; when absent the
 * payload must itself parse as a bare number.
 * @typedef {{ topic: string, tag?: string, field?: string }} Rule */

/** A parsed, validated map file. @typedef {{ rules: Rule[] }} TopicMap */

/** The outcome of translating one PUBLISH. `ok:true` carries the DataBus tag + numeric value;
 * `ok:false` names why it was dropped so the bridge can count drops per reason (loud, never a
 * crash — a plant broker carries chatter the bridge doesn't own).
 * @typedef {{ ok: true, tag: string, value: number } | { ok: false, reason: "no-rule" | "bad-payload", topic: string }} Translation */

/** The topic-level separator (§4.5) and the two wildcards (§4.7.1). */
const LEVEL_SEP = "/";
const MULTI_WILDCARD = "#"; // matches the parent level and any number of deeper levels (§4.7.1.2)
const SINGLE_WILDCARD = "+"; // matches exactly one level (§4.7.1.3)
/** Topics beginning with `$` are reserved; a filter whose FIRST level is a wildcard must not match
 * them (§4.7.2). */
const RESERVED_PREFIX = "$";

/** Validate a topic filter's wildcard placement (§4.7.3): `#` must be the last level and stand
 * alone; `+` must stand alone in its level. Throws with the offending filter so a typo in the map
 * file fails loudly at load, not silently at match time. @param {string} filter @returns {void} */
export function validateFilter(filter) {
  const levels = filter.split(LEVEL_SEP);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i] ?? "";
    if (level.includes(MULTI_WILDCARD) && level !== MULTI_WILDCARD) {
      throw new Error(`mqtt filter '${filter}': '#' must occupy its own level (§4.7.3)`);
    }
    if (level.includes(SINGLE_WILDCARD) && level !== SINGLE_WILDCARD) {
      throw new Error(`mqtt filter '${filter}': '+' must occupy its own level (§4.7.3)`);
    }
    if (level === MULTI_WILDCARD && i !== levels.length - 1) {
      throw new Error(`mqtt filter '${filter}': '#' must be the last level (§4.7.3)`);
    }
  }
}

/** Does `topic` match the subscription `filter`? MQTT 3.1.1 §4.7.1/§4.7.2. Assumes `filter` has
 * already passed validateFilter. @param {string} filter @param {string} topic @returns {boolean} */
export function topicMatchesFilter(filter, topic) {
  const f = filter.split(LEVEL_SEP);
  const t = topic.split(LEVEL_SEP);
  // §4.7.2: a leading wildcard never matches a reserved ($SYS/...) topic.
  if (
    (f[0] === MULTI_WILDCARD || f[0] === SINGLE_WILDCARD) &&
    (t[0] ?? "").startsWith(RESERVED_PREFIX)
  ) {
    return false;
  }
  for (let i = 0; i < f.length; i++) {
    const level = f[i];
    if (level === MULTI_WILDCARD) return true; // matches this level and everything below (§4.7.1.2)
    if (i >= t.length) return false; // filter demands a level the topic doesn't have
    if (level === SINGLE_WILDCARD) continue; // any single level (§4.7.1.3)
    if (level !== t[i]) return false;
  }
  return f.length === t.length; // no unmatched trailing topic levels
}

/** Derive a DataBus tag from a concrete topic by substituting slash→dot (`plant/pump_1/temp` →
 * `plant.pump_1.temp`). Used when a rule omits an explicit `tag`. @param {string} topic
 * @returns {string} */
export function deriveTag(topic) {
  return topic.split(LEVEL_SEP).join(".");
}

/** The first rule whose filter matches `topic`, or null. Order is significant: put specific rules
 * before broad wildcards. @param {Rule[]} rules @param {string} topic @returns {Rule | null} */
export function matchTopic(rules, topic) {
  for (const rule of rules) {
    if (topicMatchesFilter(rule.topic, topic)) return rule;
  }
  return null;
}

/** Coerce an already-narrowed JS value (number, or numeric string) to a finite number, else null.
 * @param {unknown} v @returns {number | null} */
function toFiniteNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parse JSON, laundering `JSON.parse`'s `any` through `unknown`; null on any parse error.
 * @param {string} text @returns {unknown} */
function parseJsonOrNull(text) {
  try {
    return /** @type {unknown} */ (JSON.parse(text));
  } catch {
    return null;
  }
}

/** Extract a numeric value from a PUBLISH payload. With no `field`, the whole payload must parse
 * as a bare number. With a `field`, the payload must be a JSON object and `field` its numeric key.
 * Returns null for anything non-numeric / unparseable (the caller drops + counts it).
 * @param {Buffer | string} payload @param {string} [field] @returns {number | null} */
export function extractValue(payload, field) {
  const text = (Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload)).trim();
  if (field === undefined) {
    return text === "" ? null : toFiniteNumber(text);
  }
  const parsed = parseJsonOrNull(text);
  if (typeof parsed !== "object" || parsed === null) return null;
  return toFiniteNumber(/** @type {Record<string, unknown>} */ (parsed)[field]);
}

/** Translate one PUBLISH (topic + payload) into a DataBus (tag, value), or a drop reason.
 * @param {Rule[]} rules @param {string} topic @param {Buffer | string} payload
 * @returns {Translation} */
export function translate(rules, topic, payload) {
  const rule = matchTopic(rules, topic);
  if (!rule) return { ok: false, reason: "no-rule", topic };
  const value = extractValue(payload, rule.field);
  if (value === null) return { ok: false, reason: "bad-payload", topic };
  return { ok: true, tag: rule.tag ?? deriveTag(topic), value };
}

/** Parse + validate a map file's text into a TopicMap. Throws on a malformed shape so a bad map
 * fails loudly at startup. `JSON.parse` is `any`; laundering through `unknown` and narrowing keeps
 * this free of unchecked `any` under strict checkJs (same pattern as sim/stream.js `bindingsOf`).
 * @param {string} text @returns {TopicMap} */
export function parseMap(text) {
  const parsed = /** @type {unknown} */ (JSON.parse(text));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error('mqtt map: expected an object with a "rules" array');
  }
  const rawRules = /** @type {{ rules?: unknown }} */ (parsed).rules;
  if (!Array.isArray(rawRules)) {
    throw new Error('mqtt map: expected a "rules" array');
  }
  const list = /** @type {readonly unknown[]} */ (rawRules);
  /** @type {Rule[]} */
  const rules = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`mqtt map: rule ${i} is not an object`);
    }
    const r = /** @type {{ topic?: unknown, tag?: unknown, field?: unknown }} */ (raw);
    if (typeof r.topic !== "string" || r.topic === "") {
      throw new Error(`mqtt map: rule ${i} needs a non-empty string "topic"`);
    }
    validateFilter(r.topic);
    /** @type {Rule} */
    const rule = { topic: r.topic };
    if (r.tag !== undefined) {
      if (typeof r.tag !== "string") throw new Error(`mqtt map: rule ${i} "tag" must be a string`);
      rule.tag = r.tag;
    }
    if (r.field !== undefined) {
      if (typeof r.field !== "string")
        throw new Error(`mqtt map: rule ${i} "field" must be a string`);
      rule.field = r.field;
    }
    rules.push(rule);
  }
  if (rules.length === 0) throw new Error("mqtt map: at least one rule is required");
  return { rules };
}

/** The distinct topic filters the bridge must SUBSCRIBE to (each rule's filter, de-duplicated).
 * @param {TopicMap} map @returns {string[]} */
export function filtersOf(map) {
  return [...new Set(map.rules.map((r) => r.topic))];
}
