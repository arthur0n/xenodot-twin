// mqtt-map.test.js — unit tests for the bridge's pure translation layer (topic-filter matching
// §4.7, tag derivation, payload extraction, map parsing). No sockets — the network path is
// exercised by mqtt-bridge.test.js. Imports the plugin tool module directly. Placed under ui/ so
// the root `npm test` glob runs it.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateFilter,
  topicMatchesFilter,
  deriveTag,
  matchTopic,
  extractValue,
  translate,
  parseMap,
  filtersOf,
} from "../../../../plugin-twin/tools/bridge/map.js";

// --- Topic-filter matching (§4.7.1 / §4.7.2) ---
test("topicMatchesFilter: exact topics", () => {
  assert.equal(topicMatchesFilter("a/b/c", "a/b/c"), true);
  assert.equal(topicMatchesFilter("a/b/c", "a/b/d"), false);
  assert.equal(topicMatchesFilter("a/b", "a/b/c"), false); // filter shorter, no wildcard
  assert.equal(topicMatchesFilter("a/b/c", "a/b"), false); // filter longer
});

test("topicMatchesFilter: single-level '+' (§4.7.1.3)", () => {
  assert.equal(topicMatchesFilter("plant/+/flow", "plant/pump_1/flow"), true);
  assert.equal(topicMatchesFilter("plant/+/flow", "plant/pump_2/flow"), true);
  assert.equal(topicMatchesFilter("plant/+/flow", "plant/pump_1/temp"), false);
  assert.equal(topicMatchesFilter("plant/+/flow", "plant/a/b/flow"), false); // '+' spans one level only
  assert.equal(topicMatchesFilter("+/+/+", "a/b/c"), true);
  assert.equal(topicMatchesFilter("plant/+", "plant"), false); // '+' requires a level to exist
});

test("topicMatchesFilter: multi-level '#' (§4.7.1.2)", () => {
  assert.equal(topicMatchesFilter("sensors/#", "sensors/a"), true);
  assert.equal(topicMatchesFilter("sensors/#", "sensors/a/b/c"), true);
  assert.equal(topicMatchesFilter("sensors/#", "sensors"), true); // '#' matches the parent level too
  assert.equal(topicMatchesFilter("sensors/#", "other/a"), false);
  assert.equal(topicMatchesFilter("#", "a/b/c"), true);
});

test("topicMatchesFilter: leading wildcards do not match $-reserved topics (§4.7.2)", () => {
  assert.equal(topicMatchesFilter("#", "$SYS/broker/uptime"), false);
  assert.equal(topicMatchesFilter("+/broker", "$SYS/broker"), false);
  assert.equal(topicMatchesFilter("$SYS/#", "$SYS/broker/uptime"), true); // explicit $ prefix is fine
});

// --- Filter validation (§4.7.3) ---
test("validateFilter rejects misplaced wildcards (§4.7.3)", () => {
  assert.throws(() => {
    validateFilter("sport/#/ranking");
  }, /must be the last level/);
  assert.throws(() => {
    validateFilter("sport+");
  }, /must occupy its own level/);
  assert.throws(() => {
    validateFilter("sp#rt");
  }, /must occupy its own level/);
  // Valid ones don't throw:
  validateFilter("sport/tennis/#");
  validateFilter("sport/+/player1");
  validateFilter("a/b/c");
});

// --- Tag derivation ---
test("deriveTag substitutes slash→dot", () => {
  assert.equal(deriveTag("plant/pump_1/temp"), "plant.pump_1.temp");
  assert.equal(deriveTag("single"), "single");
});

// --- Payload extraction (bare number and JSON field, incl. malformed) ---
test("extractValue: bare numeric payloads", () => {
  assert.equal(extractValue(Buffer.from("42.5")), 42.5);
  assert.equal(extractValue("  7 "), 7); // trimmed
  assert.equal(extractValue("-3.14"), -3.14);
  assert.equal(extractValue(""), null); // empty is not a number
  assert.equal(extractValue("nope"), null);
  assert.equal(extractValue("NaN"), null);
});

test("extractValue: JSON-object field (§ mapping design)", () => {
  assert.equal(extractValue('{"value":5,"unit":"lpm"}', "value"), 5);
  assert.equal(extractValue('{"temp":"21.5"}', "temp"), 21.5); // numeric string field coerced
  assert.equal(extractValue('{"value":5}', "missing"), null); // absent field
  assert.equal(extractValue("not json", "value"), null); // field requested, payload not JSON
  assert.equal(extractValue('{"value":"hot"}', "value"), null); // non-numeric field
  assert.equal(extractValue("5", "value"), null); // bare number but a field was requested
});

// --- matchTopic: first matching rule wins ---
test("matchTopic returns the first matching rule (order significant)", () => {
  const rules = [
    { topic: "house/living_room/temp", tag: "living_room.temp" },
    { topic: "house/+/temp" },
  ];
  assert.equal(matchTopic(rules, "house/living_room/temp")?.tag, "living_room.temp"); // specific first
  assert.equal(matchTopic(rules, "house/kitchen/temp")?.tag, undefined); // falls to the wildcard rule
  assert.equal(matchTopic(rules, "house/kitchen/humidity"), null); // no rule
});

// --- translate: the composed path ---
test("translate: explicit tag, derived tag, JSON field, and drop reasons", () => {
  const rules = [
    { topic: "house/living_room/temp", tag: "living_room.temp" },
    { topic: "house/+/temp" },
    { topic: "plant/pump_1/flow", field: "value" },
  ];
  assert.deepEqual(translate(rules, "house/living_room/temp", "21.5"), {
    ok: true,
    tag: "living_room.temp",
    value: 21.5,
  });
  assert.deepEqual(translate(rules, "house/kitchen/temp", "22"), {
    ok: true,
    tag: "house.kitchen.temp", // derived
    value: 22,
  });
  assert.deepEqual(translate(rules, "plant/pump_1/flow", '{"value":9}'), {
    ok: true,
    tag: "plant.pump_1.flow",
    value: 9,
  });
  assert.deepEqual(translate(rules, "unmapped/topic", "1"), {
    ok: false,
    reason: "no-rule",
    topic: "unmapped/topic",
  });
  assert.deepEqual(translate(rules, "house/kitchen/temp", "warm"), {
    ok: false,
    reason: "bad-payload",
    topic: "house/kitchen/temp",
  });
});

// --- parseMap validation + filtersOf ---
test("parseMap parses a valid map and filtersOf de-duplicates", () => {
  const map = parseMap(
    JSON.stringify({
      rules: [
        { topic: "plant/pump_1/temp", tag: "pump_1.temp" },
        { topic: "plant/+/flow", field: "value" },
        { topic: "plant/+/flow" }, // duplicate filter
        { topic: "sensors/#" },
      ],
    }),
  );
  assert.equal(map.rules.length, 4);
  assert.deepEqual(filtersOf(map), ["plant/pump_1/temp", "plant/+/flow", "sensors/#"]);
});

test("parseMap rejects malformed maps loudly", () => {
  assert.throws(() => parseMap("not json"));
  assert.throws(() => parseMap("{}"), /"rules" array/);
  assert.throws(() => parseMap('{"rules":[]}'), /at least one rule/);
  assert.throws(() => parseMap('{"rules":[{"tag":"x"}]}'), /needs a non-empty string "topic"/);
  assert.throws(() => parseMap('{"rules":[{"topic":"a/#/b"}]}'), /must be the last level/);
  assert.throws(() => parseMap('{"rules":[{"topic":"a","field":5}]}'), /"field" must be a string/);
});
