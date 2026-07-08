// node:test coverage for materialize.js's exported twin-merge seam — the add-not-overwrite
// merge of plugin-twin/tools over the base plugin tools (copyTreeAddOnly / materializeTwinTools):
// twin files may ADD, never overwrite; on a name collision the twin file loses. Temp fixtures
// stand in for plugin-twin/ (it may not exist while the framework is being built) and the
// project dir, so nothing depends on the real dirs. GAME_DIR points at a temp dir before import
// so config.js's load-time project resolution stays isolated (same pattern as session.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-materialize-"));
process.env.GAME_DIR = scratch;
// Keep the asset-library mount inside the scratch too — prepareGame ensures it exists.
process.env.XENODOT_ASSET_LIBRARY = path.join(scratch, "x-shared-assets");
const { copyTreeAddOnly, materializeTwinTools, ensureTwinLibraryLink, prepareGame } =
  await import("./materialize.js");
const { TWIN_PLUGIN_DIR } = await import("../core/config.js");

/** Lay out a fresh { project with base tools, twin tools src } fixture pair.
 * @param {string} name */
function makeFixture(name) {
  const root = path.join(scratch, name);
  const projectDir = path.join(root, "project");
  const twinSrc = path.join(root, "plugin-twin", "tools");
  // Base tools already materialized: a top-level gate + the shared shell lib.
  mkdirSync(path.join(projectDir, "tools", "lib"), { recursive: true });
  writeFileSync(path.join(projectDir, "tools", "validate.sh"), "#!/bin/sh\n# base validate\n");
  writeFileSync(path.join(projectDir, "tools", "lib", "checks.sh"), "# base checks\n");
  mkdirSync(path.join(twinSrc, "lib"), { recursive: true });
  return { projectDir, twinSrc };
}

test("materializeTwinTools: twin files ADD next to base tools (recursively), never replacing them", () => {
  const { projectDir, twinSrc } = makeFixture("add");
  writeFileSync(path.join(twinSrc, "twin_gate.sh"), "#!/bin/sh\n# twin gate\n");
  writeFileSync(path.join(twinSrc, "lib", "twin-checks.sh"), "# twin checks\n");
  const tally = materializeTwinTools(projectDir, twinSrc);
  assert.equal(tally.copied, 2);
  assert.deepEqual(tally.skipped, []);
  // New twin files landed in the ONE project tools/ (so twin gates can source base lib)…
  assert.match(readFileSync(path.join(projectDir, "tools", "twin_gate.sh"), "utf8"), /twin gate/);
  assert.match(
    readFileSync(path.join(projectDir, "tools", "lib", "twin-checks.sh"), "utf8"),
    /twin checks/,
  );
  // …and the executable bit was set on the shell script, like the base copy path does.
  assert.ok(statSync(path.join(projectDir, "tools", "twin_gate.sh")).mode & 0o100);
  // Base files are untouched.
  assert.match(
    readFileSync(path.join(projectDir, "tools", "validate.sh"), "utf8"),
    /base validate/,
  );
});

test("materializeTwinTools: on a name collision the twin file LOSES and is reported", () => {
  const { projectDir, twinSrc } = makeFixture("collide");
  writeFileSync(path.join(twinSrc, "validate.sh"), "#!/bin/sh\n# twin override attempt\n");
  writeFileSync(path.join(twinSrc, "lib", "checks.sh"), "# twin checks override\n");
  writeFileSync(path.join(twinSrc, "twin_only.sh"), "# twin only\n");
  const tally = materializeTwinTools(projectDir, twinSrc);
  assert.equal(tally.copied, 1);
  assert.deepEqual(tally.skipped.sort(), ["lib/checks.sh", "validate.sh"]);
  // The base files won — twin content never overwrote them.
  assert.match(
    readFileSync(path.join(projectDir, "tools", "validate.sh"), "utf8"),
    /base validate/,
  );
  assert.match(
    readFileSync(path.join(projectDir, "tools", "lib", "checks.sh"), "utf8"),
    /base checks/,
  );
  assert.ok(existsSync(path.join(projectDir, "tools", "twin_only.sh")));
});

test("materializeTwinTools: a missing twin plugin (parallel build, game install) is a no-op", () => {
  const { projectDir } = makeFixture("absent");
  const tally = materializeTwinTools(projectDir, path.join(scratch, "absent", "not-there"));
  assert.deepEqual(tally, { copied: 0, skipped: [] });
  // The base tools tree is exactly as it was.
  assert.match(
    readFileSync(path.join(projectDir, "tools", "validate.sh"), "utf8"),
    /base validate/,
  );
});

test("ensureTwinLibraryLink: creates <project>/library-twin → twin library, idempotent on re-run", () => {
  const root = path.join(scratch, "twinlib");
  const projectDir = path.join(root, "project");
  const twinLib = path.join(root, "plugin-twin", "library");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(twinLib, { recursive: true });
  writeFileSync(path.join(twinLib, "note.md"), "twin knowledge\n");
  assert.deepEqual(ensureTwinLibraryLink(projectDir, twinLib), { linked: true, reason: "created" });
  const link = path.join(projectDir, "library-twin");
  assert.ok(lstatSync(link).isSymbolicLink());
  // The knowledge is reachable through the project path.
  assert.match(readFileSync(path.join(link, "note.md"), "utf8"), /twin knowledge/);
  assert.deepEqual(ensureTwinLibraryLink(projectDir, twinLib), {
    linked: true,
    reason: "already linked",
  });
});

test("ensureTwinLibraryLink: a missing twin library (plain game install) is a no-op", () => {
  const projectDir = path.join(scratch, "twinlib-absent", "project");
  mkdirSync(projectDir, { recursive: true });
  assert.deepEqual(ensureTwinLibraryLink(projectDir, path.join(scratch, "not-there")), {
    linked: false,
    reason: "no twin library",
  });
  assert.ok(!existsSync(path.join(projectDir, "library-twin")));
});

test("ensureTwinLibraryLink: a REAL library-twin/ directory is left untouched", () => {
  const root = path.join(scratch, "twinlib-real");
  const projectDir = path.join(root, "project");
  const twinLib = path.join(root, "plugin-twin", "library");
  mkdirSync(path.join(projectDir, "library-twin"), { recursive: true });
  writeFileSync(path.join(projectDir, "library-twin", "own.md"), "the project's own copy\n");
  mkdirSync(twinLib, { recursive: true });
  assert.deepEqual(ensureTwinLibraryLink(projectDir, twinLib), {
    linked: false,
    reason: "a real library-twin/ exists — left untouched",
  });
  assert.ok(!lstatSync(path.join(projectDir, "library-twin")).isSymbolicLink());
  assert.match(
    readFileSync(path.join(projectDir, "library-twin", "own.md"), "utf8"),
    /the project's own copy/,
  );
});

test("prepareGame: viewer projects get the library-twin link; game projects stay twin-free", () => {
  const viewerDir = path.join(scratch, "prepare-viewer");
  mkdirSync(viewerDir, { recursive: true });
  const v = prepareGame(viewerDir, "viewer");
  assert.ok(v.twinLib?.linked);
  const link = path.join(viewerDir, "library-twin");
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(
    path.resolve(path.dirname(link), readlinkSync(link)),
    path.join(TWIN_PLUGIN_DIR, "library"),
  );
  // A game project gets NO twin library link (and no twin tools merge).
  const gameDir = path.join(scratch, "prepare-game");
  mkdirSync(gameDir, { recursive: true });
  const g = prepareGame(gameDir, "game");
  assert.equal(g.twinLib, null);
  assert.equal(g.twin, null);
  assert.ok(!existsSync(path.join(gameDir, "library-twin")));
});

test("copyTreeAddOnly: pure merge core — copies into an empty dest, re-run is a silent no-op, real collisions reported", () => {
  const root = path.join(scratch, "pure");
  const src = path.join(root, "src");
  const dst = path.join(root, "dst");
  mkdirSync(src, { recursive: true });
  writeFileSync(path.join(src, "a.txt"), "A");
  /** @type {{copied:number, skipped:string[]}} */
  const first = { copied: 0, skipped: [] };
  copyTreeAddOnly(src, dst, first);
  assert.deepEqual(first, { copied: 1, skipped: [] });
  // Second pass over an unchanged merge: identical content → nothing copied, nothing reported
  // (an idempotent re-materialize must not warn about its own earlier files).
  /** @type {{copied:number, skipped:string[]}} */
  const second = { copied: 0, skipped: [] };
  copyTreeAddOnly(src, dst, second);
  assert.deepEqual(second, { copied: 0, skipped: [] });
  // Divergent content is a REAL collision: still never overwritten, and reported.
  writeFileSync(path.join(dst, "a.txt"), "existing, different");
  /** @type {{copied:number, skipped:string[]}} */
  const third = { copied: 0, skipped: [] };
  copyTreeAddOnly(src, dst, third);
  assert.deepEqual(third, { copied: 0, skipped: ["a.txt"] });
  assert.equal(readFileSync(path.join(dst, "a.txt"), "utf8"), "existing, different");
});
