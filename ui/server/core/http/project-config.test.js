// node:test coverage for the POST /api/project validator — the NEVER-SCAFFOLD guarantee behind the
// setup panel's configure form. GAME_DIR + ENGINE_PROJECT_FILE are pinned BEFORE config.js is
// imported (transitively via project-config.js) so this stays off any real project and the marker
// is deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-proj-"));
process.env.GAME_DIR = scratch;
process.env.ENGINE_PROJECT_FILE = "project.godot";
writeFileSync(path.join(scratch, "project.godot"), "[application]\n");

const { validateProjectPath } = await import("./project-config.js");

test("validateProjectPath: blank path is an error that points at the scaffold script", () => {
  const r = validateProjectPath("");
  assert.ok("error" in r);
  assert.match(r.error, /onboard:project/);
});

test("validateProjectPath: missing directory errors (never scaffolds)", () => {
  const r = validateProjectPath(path.join(scratch, "does-not-exist"));
  assert.ok("error" in r);
  assert.match(r.error, /No directory/);
});

test("validateProjectPath: a directory without project.godot is rejected, not created", () => {
  const bare = path.join(scratch, "bare");
  mkdirSync(bare);
  const r = validateProjectPath(bare);
  assert.ok("error" in r);
  assert.match(r.error, /no project\.godot/i);
  assert.match(r.error, /never scaffolds/);
});

test("validateProjectPath: a real project resolves to its absolute path", () => {
  const r = validateProjectPath(scratch);
  assert.ok("ok" in r && r.ok === true);
  assert.equal(r.dir, path.resolve(scratch));
});
