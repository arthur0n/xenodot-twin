// analyze-stats.test.js — unit tests for the pure statistics/decimation/windowing core of the
// analysis seam (plugin/tools/analyze/stats.js). The module is dependency-free and lives in
// the twin plugin's tools tree (materialized into viewer projects, runs under bare node); this
// test imports it directly, the way mqtt-codec.test.js reaches into the plugin. Placed under ui/
// so the root `npm test` glob (find ui -name '*.test.js') runs it.
//
// Two flavours of exactness:
//  - HAND fixtures with clean chosen values → exact literal assertions on every stat.
//  - A SEEDED sim-synth oracle: frames built from tools/sim/stream.js `tagValue` (the same pure
//    function the sim/recorder use), with expectations recomputed independently from tagValue — so
//    the stats aggregation must agree with the determinism contract, no flake.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterWindow,
  groupByTag,
  seriesOf,
  tagStats,
  decimate,
} from "../../../../plugin/tools/analyze/stats.js";
import { tagValue, DEMO_TAGS } from "../../../../plugin/tools/sim/stream.js";

/** Build a frame list for one tag from parallel value/seq arrays (t_ms = index·100 unless given).
 * @param {string} tag @param {number[]} values @param {number[]} [seqs] @param {number[]} [tms]
 * @returns {import("../../../../plugin/tools/sim/recording.js").RecordingFrame[]} */
function framesOf(tag, values, seqs, tms) {
  return values.map((value, i) => ({
    t_ms: tms ? Number(tms[i]) : i * 100,
    tag,
    value,
    seq: seqs ? Number(seqs[i]) : i,
  }));
}

// --- tagStats: exact values on hand fixtures ---

test("tagStats: basic stats are exact (clean fixture, no limit)", () => {
  // values [2,2,8,8]: mean 5, population variance 9 → stddev 3; max adjacent step |8−2| = 6.
  const s = tagStats("t", framesOf("t", [2, 2, 8, 8]), null);
  assert.equal(s.count, 4);
  assert.equal(s.min, 2);
  assert.equal(s.max, 8);
  assert.equal(s.mean, 5);
  assert.equal(s.stddev, 3);
  assert.deepEqual(s.first, { t_ms: 0, value: 2 });
  assert.deepEqual(s.last, { t_ms: 300, value: 8 });
  assert.equal(s.seq_gaps, 0);
  assert.equal(s.range, null);
  assert.equal(s.range_crossings, null);
  assert.equal(s.max_step_delta, 6);
});

test("tagStats: seq_gaps counts every MISSING sequence number", () => {
  // seq [0,1,3,7]: gaps = (1−0−1) + (3−1−1) + (7−3−1) = 0 + 1 + 3 = 4.
  const s = tagStats("t", framesOf("t", [1, 1, 1, 1], [0, 1, 3, 7]), null);
  assert.equal(s.seq_gaps, 4);
});

test("tagStats: range_crossings counts in/out boundary flips vs the limit band", () => {
  // values [5,15,5,15,5] against [0,10]: membership in,out,in,out,in → 4 flips. Boundary is
  // inclusive (a value exactly on min/max is IN).
  const s = tagStats("t", framesOf("t", [5, 15, 5, 15, 5]), { min: 0, max: 10 });
  assert.deepEqual(s.range, { min: 0, max: 10 });
  assert.equal(s.range_crossings, 4);
});

test("tagStats: an on-boundary value counts as in-range (>=min && <=max)", () => {
  // values [10,11,10] against [0,10]: 10 is IN, 11 is OUT → in,out,in → 2 flips.
  const s = tagStats("t", framesOf("t", [10, 11, 10]), { min: 0, max: 10 });
  assert.equal(s.range_crossings, 2);
});

test("tagStats: a single frame → stddev 0, no step delta, first === last", () => {
  const s = tagStats("t", framesOf("t", [7]), { min: 0, max: 10 });
  assert.equal(s.count, 1);
  assert.equal(s.mean, 7);
  assert.equal(s.stddev, 0);
  assert.equal(s.max_step_delta, null);
  assert.equal(s.range_crossings, null); // < 2 samples ⇒ no adjacency to cross
  assert.deepEqual(s.first, s.last);
});

test("tagStats: throws on an empty frame list", () => {
  assert.throws(() => tagStats("t", [], null), /no frames/);
});

// --- decimation edge cases ---

test("decimate: n ≥ length returns a COPY of all points (not the same array)", () => {
  const pts = seriesOf(framesOf("t", [1, 2, 3]));
  const out = decimate(pts, 5);
  assert.deepEqual(out, pts);
  assert.notStrictEqual(out, pts);
});

test("decimate: empty / n ≤ 0 → empty", () => {
  assert.deepEqual(decimate([], 5), []);
  assert.deepEqual(decimate(seriesOf(framesOf("t", [1, 2, 3])), 0), []);
});

test("decimate: n = 1 keeps only the first point", () => {
  const pts = seriesOf(framesOf("t", [1, 2, 3]));
  assert.deepEqual(decimate(pts, 1), [[0, 1]]);
});

test("decimate: endpoint-preserving stride picks exact indices", () => {
  // 10 points, n = 3 → indices floor(i·9/2) = 0, 4, 9 (first and last always kept).
  const pts = seriesOf(framesOf("t", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.deepEqual(decimate(pts, 3), [
    [0, 0],
    [400, 4],
    [900, 9],
  ]);
});

// --- windowing edge cases ---

test("filterWindow: inclusive bounds keep the endpoints", () => {
  const f = framesOf("t", [0, 1, 2, 3]); // t_ms 0,100,200,300
  assert.equal(filterWindow(f, 100, 200).length, 2);
  assert.deepEqual(
    filterWindow(f, 100, 200).map((x) => x.t_ms),
    [100, 200],
  );
});

test("filterWindow: an empty window yields no frames", () => {
  const f = framesOf("t", [0, 1, 2, 3]);
  assert.deepEqual(filterWindow(f, 500, 600), []);
});

test("filterWindow: null bounds are open on that side", () => {
  const f = framesOf("t", [0, 1, 2, 3]);
  assert.equal(filterWindow(f, null, null).length, 4);
  assert.deepEqual(
    filterWindow(f, 200, null).map((x) => x.t_ms),
    [200, 300],
  );
});

test("groupByTag: splits by tag, preserves per-tag order", () => {
  const mixed = [
    ...framesOf("a", [1], [0], [0]),
    ...framesOf("b", [9], [0], [0]),
    ...framesOf("a", [2], [1], [100]),
  ];
  const g = groupByTag(mixed);
  assert.deepEqual([...g.keys()], ["a", "b"]);
  assert.deepEqual(
    g.get("a")?.map((f) => f.value),
    [1, 2],
  );
});

// --- seeded sim-synth oracle: stats must match the determinism contract exactly ---

test("tagStats: matches an independent tagValue oracle over a seeded synth window", () => {
  const seed = 42;
  const ticks = 50;
  const count = DEMO_TAGS.length;
  const i = 2; // tank_1.level
  const row = DEMO_TAGS[i];
  assert.ok(row);
  /** @type {import("../../../../plugin/tools/sim/recording.js").RecordingFrame[]} */
  const frames = [];
  /** @type {number[]} */
  const oracle = [];
  for (let tick = 0; tick < ticks; tick++) {
    const v = tagValue(seed, tick, i, count, row.min, row.max);
    oracle.push(v);
    frames.push({ t_ms: tick * 100, tag: row.tag, value: v, seq: tick });
  }
  const s = tagStats(row.tag, frames, { min: row.min, max: row.max });

  const mean = oracle.reduce((a, b) => a + b, 0) / ticks;
  assert.equal(s.count, ticks);
  assert.equal(s.first.value, tagValue(seed, 0, i, count, row.min, row.max));
  assert.equal(s.last.value, tagValue(seed, ticks - 1, i, count, row.min, row.max));
  assert.equal(s.min, Math.min(...oracle));
  assert.equal(s.max, Math.max(...oracle));
  assert.equal(s.mean, mean);
  assert.equal(s.seq_gaps, 0);
  // The sim clamps values into [min,max], so a limit equal to the tag's range is never crossed.
  assert.equal(s.range_crossings, 0);
});
