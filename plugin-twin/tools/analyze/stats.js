// tools/analyze/stats.js — pure, deterministic statistics over twin-recording frames.
//
// The analysis seam is data-in / report-out: this module is the DATA half's arithmetic. It is
// PURE — no fs, no network, no clock — so the same frames always yield the same numbers, and it
// unit-tests against a seeded fixture with EXACT expected values (the sim's determinism, encoded
// in tools/sim/stream.js, is the test oracle). The packager (bundle.js) does all the I/O and
// composes these helpers; nothing here reads or writes a file.
//
// Determinism discipline (same as tools/sim/recording.js): stats are a pure function of the
// frames, so a bundle built twice from the same recording is byte-identical. Floating-point
// results are plain IEEE-754 doubles — JSON.stringify renders them reproducibly.
//
// Dependency-free by design: the materialized tools/ ships no package.json, so this must run
// under a bare `node` (see tools/sim/server.js's header for the full rationale).

/** One recorded frame, as parsed from the NDJSON contract (tools/sim/recording.js). */
/** @typedef {import("../sim/recording.js").RecordingFrame} RecordingFrame */

/** A `[t_ms, value]` sample pair — the element shape of a decimated series. */
/** @typedef {[number, number]} Sample */

/** The `[min,max]` band a tag's values are checked against for range-limit crossings. Sourced by
 * the packager from the binding map (preferred) or the recording header's tag table.
 * @typedef {{ min: number, max: number }} Limit */

/** Per-tag statistics. All fields are a pure function of the tag's (windowed) frames:
 *  - `count`            frames for this tag in the analyzed window.
 *  - `min`/`max`        value extremes.
 *  - `mean`             arithmetic mean.
 *  - `stddev`          POPULATION standard deviation (divides by N, not N-1) — a single value
 *                       therefore has stddev 0.
 *  - `first`/`last`     the earliest/latest sample as `{t_ms, value}` (frames are t_ms-ascending).
 *  - `seq_gaps`         count of MISSING sequence numbers (transport drops): Σ max(0, Δseq−1)
 *                       over adjacent frames. 0 means no dropped ticks.
 *  - `range`            the `[min,max]` limit band used, or null when no limit was available.
 *  - `range_crossings`  count of boundary crossings vs `range`: adjacent samples whose
 *                       in-range/out-of-range membership differs. null when no limit. Direction-
 *                       agnostic (an entry OR an exit each count once).
 *  - `max_step_delta`   largest absolute change between adjacent samples. null when count < 2.
 * @typedef {{
 *   tag: string, count: number, min: number, max: number, mean: number, stddev: number,
 *   first: { t_ms: number, value: number }, last: { t_ms: number, value: number },
 *   seq_gaps: number, range: Limit | null, range_crossings: number | null,
 *   max_step_delta: number | null
 * }} TagStats */

/** Keep only frames whose `t_ms` is within the inclusive window `[fromMs, toMs]`. A null/undefined
 * bound is open on that side. Applied before grouping/stats so every downstream number reflects
 * exactly the analyzed window.
 * @param {RecordingFrame[]} frames @param {number | null | undefined} fromMs
 * @param {number | null | undefined} toMs @returns {RecordingFrame[]} */
export function filterWindow(frames, fromMs, toMs) {
  const lo = fromMs ?? Number.NEGATIVE_INFINITY;
  const hi = toMs ?? Number.POSITIVE_INFINITY;
  return frames.filter((f) => f.t_ms >= lo && f.t_ms <= hi);
}

/** Group frames by tag, preserving arrival order within each tag (the input is t_ms-ascending, so
 * each group stays t_ms-ascending too). @param {RecordingFrame[]} frames
 * @returns {Map<string, RecordingFrame[]>} */
export function groupByTag(frames) {
  /** @type {Map<string, RecordingFrame[]>} */
  const byTag = new Map();
  for (const f of frames) {
    const arr = byTag.get(f.tag);
    if (arr) arr.push(f);
    else byTag.set(f.tag, [f]);
  }
  return byTag;
}

/** The `[t_ms, value]` series for one tag's frames (order preserved). @param {RecordingFrame[]}
 * frames @returns {Sample[]} */
export function seriesOf(frames) {
  return frames.map((f) => /** @type {Sample} */ ([f.t_ms, f.value]));
}

/** Min/max in a single pass (avoids Math.min(...huge) argument-count limits). @param {number[]}
 * values @returns {{ min: number, max: number }} */
function minMaxOf(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Arithmetic mean. @param {number[]} values @returns {number} */
function meanOf(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation (÷N) about a precomputed mean. @param {number[]} values
 * @param {number} mean @returns {number} */
function stddevOf(values, mean) {
  let sum = 0;
  for (const v of values) {
    const d = v - mean;
    sum += d * d;
  }
  return Math.sqrt(sum / values.length);
}

/** Count of missing sequence numbers across adjacent frames: Σ max(0, Δseq − 1). @param
 * {RecordingFrame[]} frames @returns {number} */
function seqGapsOf(frames) {
  let gaps = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (a === undefined || b === undefined) continue;
    const missing = b.seq - a.seq - 1;
    if (missing > 0) gaps += missing;
  }
  return gaps;
}

/** Largest absolute change between adjacent samples, or null with fewer than two. @param
 * {number[]} values @returns {number | null} */
function maxStepDeltaOf(values) {
  if (values.length < 2) return null;
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a === undefined || b === undefined) continue;
    const d = Math.abs(b - a);
    if (d > max) max = d;
  }
  return max;
}

/** Count of boundary crossings vs a limit band: adjacent samples whose in-range membership
 * differs. null when no limit or fewer than two samples. @param {number[]} values
 * @param {Limit | null} limit @returns {number | null} */
function rangeCrossingsOf(values, limit) {
  if (!limit || values.length < 2) return null;
  const inRange = (/** @type {number} */ v) => v >= limit.min && v <= limit.max;
  let crossings = 0;
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (a === undefined || b === undefined) continue;
    if (inRange(a) !== inRange(b)) crossings++;
  }
  return crossings;
}

/** Compute the full per-tag statistics for one tag's (already windowed) frames. Throws on an empty
 * frame list — callers group first, so a tag reaching here always has ≥1 frame.
 * @param {string} tag @param {RecordingFrame[]} frames @param {Limit | null} limit
 * @returns {TagStats} */
export function tagStats(tag, frames, limit) {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error(`tagStats: '${tag}' has no frames`);
  }
  const values = frames.map((f) => f.value);
  const mean = meanOf(values);
  const { min, max } = minMaxOf(values);
  return {
    tag,
    count: frames.length,
    min,
    max,
    mean,
    stddev: stddevOf(values, mean),
    first: { t_ms: first.t_ms, value: first.value },
    last: { t_ms: last.t_ms, value: last.value },
    seq_gaps: seqGapsOf(frames),
    range: limit,
    range_crossings: rangeCrossingsOf(values, limit),
    max_step_delta: maxStepDeltaOf(values),
  };
}

/** Deterministic decimation of a series to at most `n` points, endpoint-preserving: returns all
 * points when there are ≤ n; otherwise picks n indices evenly across [0, len−1] via
 * floor(i·(len−1)/(n−1)) so the FIRST and LAST samples always survive (a narration that cites the
 * window's start/end value needs them). "Dumb on purpose" per the plan — no LTTB/area weighting.
 * @param {Sample[]} points @param {number} n @returns {Sample[]} */
export function decimate(points, n) {
  if (n <= 0) return [];
  if (points.length <= n) return points.slice();
  if (n === 1) {
    const p = points[0];
    return p ? [p] : [];
  }
  /** @type {Sample[]} */
  const out = [];
  const last = points.length - 1;
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i * last) / (n - 1));
    const p = points[idx];
    if (p) out.push(p);
  }
  return out;
}
