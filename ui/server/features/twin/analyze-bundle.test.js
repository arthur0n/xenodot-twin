// analyze-bundle.test.js — integration tests for the analysis-seam packager
// (plugin-twin/tools/analyze/bundle.js): golden byte-stable output, provenance hashes, the curated
// binding context, determinism under --tags/window, and the ENFORCED size budget (CLI path). The
// module is dependency-free and materialized into viewer projects (bare node); this test imports
// its pure core directly and spawns its CLI for the exit-code behaviours. Placed under ui/ so the
// root `npm test` glob runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headerLine, frameLine } from "../../../../plugin-twin/tools/sim/recording.js";
import {
  buildBundle,
  serializeBundle,
  unmatchedTags,
  SCHEMA_VERSION,
  BUNDLE_KIND,
  DEFAULT_POINTS_PER_TAG,
  SIZE_BUDGET_BYTES,
} from "../../../../plugin-twin/tools/analyze/bundle.js";

const BUNDLE_CLI = fileURLToPath(
  new URL("../../../../plugin-twin/tools/analyze/bundle.js", import.meta.url),
);

/** sha256 of a UTF-8 string. @param {string} s @returns {string} */
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** The fixed golden fixture: 2 tags × 4 ticks, clean values. Built through the recording.js
 * contract helpers so the bytes are exactly what a real recording carries.
 * @returns {{ recordingText: string, mapText: string, sidecarText: string }} */
function fixture() {
  const tags = [
    { tag: "pump.temp", min: 0, max: 100 },
    { tag: "tank.level", min: 0, max: 100 },
  ];
  const pump = [20, 40, 60, 80];
  const tank = [10, 10, 90, 90];
  /** @type {import("../../../../plugin-twin/tools/sim/recording.js").RecordingFrame[]} */
  const frames = [];
  for (let tick = 0; tick < 4; tick++) {
    frames.push({ t_ms: tick * 100, tag: "pump.temp", value: pump[tick] ?? 0, seq: tick });
    frames.push({ t_ms: tick * 100, tag: "tank.level", value: tank[tick] ?? 0, seq: tick });
  }
  const recordingText = [headerLine(10, 42, tags), ...frames.map(frameLine)].join("\n") + "\n";
  const mapText = JSON.stringify({
    bindings: [
      { tag: "pump.temp", min: 0, max: 50, globalid: "GID_PUMP" },
      { tag: "tank.level", min: 0, max: 100, globalid: "GID_TANK" },
    ],
  });
  const sidecarText = JSON.stringify({
    GID_PUMP: { ifc_class: "IfcPump", name: "Pump A", psets: { Constraints: { Level: "L2" } } },
    GID_TANK: { ifc_class: "IfcTank", name: "Tank B", psets: {} },
  });
  return { recordingText, mapText, sidecarText };
}

/** buildBundle over the golden fixture with all three inputs. @param {Partial<Parameters<typeof
 * buildBundle>[0]>} [over] @returns {ReturnType<typeof buildBundle>} */
function buildGolden(over) {
  const { recordingText, mapText, sidecarText } = fixture();
  return buildBundle({
    recording: { name: "rec.ndjson", text: recordingText },
    map: { name: "map.json", text: mapText },
    sidecar: { name: "side.json", text: sidecarText },
    ...over,
  });
}

test("bundle: header carries schema version, kind, and a stable key order", () => {
  const { bundle } = buildGolden();
  assert.equal(bundle.schema_version, SCHEMA_VERSION);
  assert.equal(bundle.kind, BUNDLE_KIND);
  assert.equal(bundle.points_per_tag, DEFAULT_POINTS_PER_TAG);
  assert.deepEqual(Object.keys(bundle), [
    "schema_version",
    "kind",
    "generated_by",
    "inputs",
    "recording_header",
    "window",
    "points_per_tag",
    "stats",
    "series",
    "bindings",
  ]);
});

test("bundle: golden byte-stable output (sha256 pinned) and matching byte count", () => {
  const { json, bytes } = buildGolden();
  assert.equal(sha(json), "e9dc013383d4aa5cee6ee35b0a2baf43e2fe680723313f0d7b5028e5733abde1");
  assert.equal(bytes, 2863);
});

test("bundle: determinism — building twice yields byte-identical JSON", () => {
  assert.equal(buildGolden().json, buildGolden().json);
});

test("bundle: provenance — each input's sha256 and byte size are the file's own", () => {
  const { recordingText, mapText, sidecarText } = fixture();
  const { bundle } = buildGolden();
  assert.equal(bundle.inputs.recording.sha256, sha(recordingText));
  assert.equal(bundle.inputs.recording.bytes, Buffer.byteLength(recordingText));
  assert.equal(bundle.inputs.map?.sha256, sha(mapText));
  assert.equal(bundle.inputs.sidecar?.sha256, sha(sidecarText));
});

test("bundle: no map/sidecar ⇒ null provenance slots, empty bindings", () => {
  const { recordingText } = fixture();
  const { bundle } = buildBundle({ recording: { name: "rec.ndjson", text: recordingText } });
  assert.equal(bundle.inputs.map, null);
  assert.equal(bundle.inputs.sidecar, null);
  assert.deepEqual(bundle.bindings, []);
});

test("bundle: per-tag stats are exact; range from the MAP overrides the header range", () => {
  const { bundle } = buildGolden();
  const pump = bundle.stats.find((s) => s.tag === "pump.temp");
  assert.ok(pump);
  // pump values [20,40,60,80] vs the MAP's tight [0,50] (not the header's [0,100]): 20,40 in →
  // 60,80 out ⇒ one crossing. mean 50, population stddev sqrt(500).
  assert.deepEqual(pump.range, { min: 0, max: 50 });
  assert.equal(pump.range_crossings, 1);
  assert.equal(pump.mean, 50);
  assert.equal(pump.max_step_delta, 20);
  assert.equal(pump.stddev, Math.sqrt(500));
});

test("bundle: binding context curates name/type/level from the sidecar", () => {
  const { bundle } = buildGolden();
  const pump = bundle.bindings.find((b) => b.tag === "pump.temp");
  assert.deepEqual(pump, {
    tag: "pump.temp",
    global_ids: ["GID_PUMP"],
    elements: [{ global_id: "GID_PUMP", name: "Pump A", type: "IfcPump", level: "L2" }],
  });
});

test("bundle: --tags selects a subset deterministically", () => {
  const a = buildGolden({ tags: ["pump.temp"] });
  const b = buildGolden({ tags: ["pump.temp"] });
  assert.equal(a.json, b.json);
  assert.deepEqual(
    a.bundle.stats.map((s) => s.tag),
    ["pump.temp"],
  );
  assert.deepEqual(
    a.bundle.bindings.map((x) => x.tag),
    ["pump.temp"],
  );
});

test("unmatchedTags: names --tags entries that matched no frames (typos must not vanish silently)", () => {
  const { bundle } = buildGolden({ tags: ["pump.temp", "pump.tmep", "ghost"] });
  assert.deepEqual(unmatchedTags(bundle, ["pump.temp", "pump.tmep", "ghost"]), [
    "pump.tmep",
    "ghost",
  ]);
  // all-unknown filter → every entry reported (the bundle itself is a valid 0-tag document)
  const empty = buildGolden({ tags: ["nope"] });
  assert.deepEqual(empty.bundle.stats, []);
  assert.deepEqual(unmatchedTags(empty.bundle, ["nope"]), ["nope"]);
  // no filter / full match → nothing to report
  assert.deepEqual(unmatchedTags(buildGolden().bundle, null), []);
  assert.deepEqual(unmatchedTags(buildGolden({ tags: ["pump.temp"] }).bundle, ["pump.temp"]), []);
});

test("bundle: an empty window ⇒ no stats, frames 0, requested bounds preserved", () => {
  const { bundle } = buildGolden({ fromMs: 9000, toMs: 9999 });
  assert.deepEqual(bundle.stats, []);
  assert.deepEqual(bundle.window, { from_ms: 9000, to_ms: 9999, frames: 0 });
});

test("bundle: --points-per-tag decimates each series (endpoint-preserving)", () => {
  // A 10-frame single-tag recording decimated to 3 points → indices 0,4,9.
  const tags = [{ tag: "x", min: 0, max: 100 }];
  /** @type {string[]} */
  const lines = [headerLine(10, 42, tags)];
  for (let tick = 0; tick < 10; tick++) {
    lines.push(frameLine({ t_ms: tick * 100, tag: "x", value: tick, seq: tick }));
  }
  const { bundle } = buildBundle({
    recording: { name: "r.ndjson", text: lines.join("\n") + "\n" },
    pointsPerTag: 3,
  });
  const series = bundle.series.find((s) => s.tag === "x");
  assert.deepEqual(series?.points, [
    [0, 0],
    [400, 4],
    [900, 9],
  ]);
});

test("serializeBundle: canonical form is pretty-printed with a trailing newline", () => {
  const { bundle, json } = buildGolden();
  assert.equal(serializeBundle(bundle), json);
  assert.ok(json.endsWith("\n"));
  assert.ok(json.includes("\n  ")); // 2-space indent
});

// --- CLI: the ENFORCED size budget (fail-with-override) ---

/** Write a recording large enough to blow the size budget into a temp dir. @param {string} dir
 * @returns {string} the recording path */
function writeOversizeRecording(dir) {
  const tags = [
    { tag: "a", min: 0, max: 100 },
    { tag: "b", min: 0, max: 100 },
    { tag: "c", min: 0, max: 100 },
  ];
  /** @type {string[]} */
  const lines = [headerLine(10, 42, tags)];
  for (let tick = 0; tick < 4000; tick++) {
    for (const t of tags) {
      lines.push(frameLine({ t_ms: tick * 100, tag: t.tag, value: tick % 97, seq: tick }));
    }
  }
  const p = path.join(dir, "big.ndjson");
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

test("bundle CLI: over budget FAILS loudly with no file written", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "analyze-budget-"));
  const rec = writeOversizeRecording(dir);
  const out = path.join(dir, "bundle.json");
  let threw = false;
  try {
    // --points-per-tag 4000 keeps every point → far over SIZE_BUDGET_BYTES.
    execFileSync(
      "node",
      [BUNDLE_CLI, "--recording", rec, "--points-per-tag", "4000", "--out", out],
      {
        encoding: "utf8",
        stdio: "pipe",
      },
    );
  } catch (e) {
    threw = true;
    const err = /** @type {{ status?: number, stderr?: string }} */ (e);
    assert.equal(err.status, 1);
    assert.match(String(err.stderr), /over the .* budget/);
  }
  assert.ok(threw, "CLI should exit nonzero over budget");
  assert.ok(!existsSync(out), "no bundle file should be written when over budget");
});

test("bundle CLI: --allow-oversize downgrades to a warning and writes the file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "analyze-budget-"));
  const rec = writeOversizeRecording(dir);
  const out = path.join(dir, "bundle.json");
  const stdout = execFileSync(
    "node",
    [BUNDLE_CLI, "--recording", rec, "--points-per-tag", "4000", "--allow-oversize", "--out", out],
    { encoding: "utf8", stdio: "pipe" },
  );
  assert.match(stdout, /wrote/);
  assert.ok(existsSync(out), "the bundle file should be written under --allow-oversize");
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(out, "utf8"));
  const bundle = /** @type {{ window: { frames: number } }} */ (parsed);
  assert.ok(bundle.window.frames > 0);
  assert.ok(Buffer.byteLength(readFileSync(out, "utf8")) > SIZE_BUDGET_BYTES);
});
