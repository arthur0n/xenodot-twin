// node:test coverage for the promotion move seam — locate/promoteOne honor an explicit
// pluginDir override (temp fixtures) while defaulting to the base plugin so the game path
// stays byte-identical. Temp fixtures stand in for the game and the destination plugin;
// GAME_DIR points at a temp dir before import so config.js's load-time project resolution
// stays isolated (same pattern as session.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-promote-"));
process.env.GAME_DIR = scratch;
const { locate, promoteOne } = await import("./promote-run.js");
const { FRAMEWORK_PLUGIN_DIR } = await import("../../core/config.js");

test("locate: dst defaults to the base plugin and flips with an explicit pluginDir", () => {
  const game = path.join(scratch, "some-game");
  const otherPlugin = path.join(scratch, "other-plugin");
  const base = locate("skills", "my-skill", game);
  assert.equal(base.dst, path.join(FRAMEWORK_PLUGIN_DIR, "skills", "my-skill"));
  const other = locate("skills", "my-skill", game, otherPlugin);
  assert.equal(other.dst, path.join(otherPlugin, "skills", "my-skill"));
  // src never depends on the plugin dir — same game-local source either way.
  assert.equal(base.src, other.src);
  // Agents get the .md suffix in both worlds.
  assert.equal(
    locate("agents", "helper", game, otherPlugin).dst,
    path.join(otherPlugin, "agents", "helper.md"),
  );
});

test("promoteOne: moves into the pluginDir it is given (end to end on disk)", () => {
  const root = path.join(scratch, "fixture-promotion");
  const game = path.join(root, "project");
  const fixturePlugin = path.join(root, "plugin-fixture");
  mkdirSync(path.join(game, ".claude", "skills", "neat-thing"), { recursive: true });
  writeFileSync(
    path.join(game, ".claude", "skills", "neat-thing", "SKILL.md"),
    "---\nname: neat-thing\n---\nAgnostic content.\n",
  );
  const r = promoteOne("skills", "neat-thing", game, { pluginDir: fixturePlugin });
  assert.equal(r.ok, true);
  assert.equal(r.msg, "moved skills/neat-thing → plugin-fixture");
  // Landed in the fixture plugin, gone from the game, and the base plugin untouched.
  assert.match(
    readFileSync(path.join(fixturePlugin, "skills", "neat-thing", "SKILL.md"), "utf8"),
    /Agnostic content/,
  );
  assert.ok(!existsSync(path.join(game, ".claude", "skills", "neat-thing")));
  assert.ok(!existsSync(path.join(FRAMEWORK_PLUGIN_DIR, "skills", "neat-thing")));
});

test("promoteOne: an explicit base pluginDir keeps the game-path message and layout", () => {
  const root = path.join(scratch, "game-promotion");
  const game = path.join(root, "project");
  const basePlugin = path.join(root, "plugin");
  mkdirSync(path.join(game, ".claude", "skills", "game-thing"), { recursive: true });
  writeFileSync(
    path.join(game, ".claude", "skills", "game-thing", "SKILL.md"),
    "---\nname: game-thing\n---\nAgnostic game content.\n",
  );
  const r = promoteOne("skills", "game-thing", game, { pluginDir: basePlugin });
  assert.equal(r.ok, true);
  assert.equal(r.msg, "moved skills/game-thing → plugin");
  assert.ok(existsSync(path.join(basePlugin, "skills", "game-thing", "SKILL.md")));
});
