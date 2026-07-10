// mqtt-demo.test.js — guards the demo publisher against the shipped example map: every topic
// demo_publish.js emits must map to a tag through mqtt_map.example.json, so the two can never
// drift. Also checks the sample stays in range and animates. Placed under ui/ for the test glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMap, translate } from "../../../../plugin/tools/bridge/map.js";
import { DEMO_TOPICS, demoSample } from "../../../../plugin/tools/bridge/demo_publish.js";

const mapPath = fileURLToPath(
  new URL("../../../../plugin/examples/mqtt_map.example.json", import.meta.url),
);
const map = parseMap(readFileSync(mapPath, "utf8"));

/** Find the demo sample entry for a topic, or fail. @param {ReturnType<typeof demoSample>} sample
 * @param {string} topic @returns {{ topic: string, payload: string }} */
function entry(sample, topic) {
  const found = sample.find((e) => e.topic === topic);
  if (!found) throw new Error(`no demo entry for ${topic}`);
  return found;
}

test("every demo topic maps to a tag through mqtt_map.example.json (no drift)", () => {
  const tags = new Set();
  for (const { topic, payload } of demoSample(0)) {
    const t = translate(map.rules, topic, payload);
    assert.equal(t.ok, true, `${topic} should map to a tag`);
    if (t.ok) tags.add(t.tag);
  }
  assert.equal(tags.size, DEMO_TOPICS.length, "all six distinct tags covered");
});

test("demoSample: door is 0/1, solar is JSON watts in range, temps have one decimal", () => {
  const s = demoSample(0);
  assert.match(entry(s, "house/entrance_door/state").payload, /^(0|1)$/);
  const parsed = /** @type {unknown} */ (JSON.parse(entry(s, "house/solar/power").payload));
  const solar = /** @type {{ watts: number }} */ (parsed);
  assert.ok(solar.watts >= 0 && solar.watts <= 5000, "solar watts in range");
  assert.match(entry(s, "house/living_room/temp").payload, /^\d+\.\d$/);
});

test("demoSample animates over time", () => {
  const a = entry(demoSample(0), "house/living_room/temp").payload;
  const b = entry(demoSample(25), "house/living_room/temp").payload;
  assert.notEqual(a, b, "the value should move across ticks");
});
