// node:test coverage for the promotion destination seam — promotionTarget flips the
// destination plugin with the project type (game → plugin/, viewer → plugin-twin/), and
// locate/promoteOne honor an explicit pluginDir while defaulting to the base plugin so the
// game path stays byte-identical. Temp fixtures stand in for the game and the destination
// plugin; GAME_DIR points at a temp dir before import so config.js's load-time project
// resolution stays isolated (same pattern as materialize.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "xeno-promote-"));
process.env.GAME_DIR = scratch;
const { promotionTarget, locate, promoteOne } = await import("./promote-run.js");
const { FRAMEWORK_PLUGIN_DIR, TWIN_PLUGIN_DIR } = await import("../../core/config.js");

test("promotionTarget: game → base plugin (xenodot), viewer → twin plugin (xenodot-twin)", () => {
  assert.deepEqual(promotionTarget("game"), {
    pluginDir: FRAMEWORK_PLUGIN_DIR,
    namespace: "xenodot",
  });
  assert.deepEqual(promotionTarget("viewer"), {
    pluginDir: TWIN_PLUGIN_DIR,
    namespace: "xenodot-twin",
  });
});

test("locate: dst defaults to the base plugin and flips with an explicit pluginDir", () => {
  const game = path.join(scratch, "some-game");
  const base = locate("skills", "my-skill", game);
  assert.equal(base.dst, path.join(FRAMEWORK_PLUGIN_DIR, "skills", "my-skill"));
  const twin = locate("skills", "my-skill", game, TWIN_PLUGIN_DIR);
  assert.equal(twin.dst, path.join(TWIN_PLUGIN_DIR, "skills", "my-skill"));
  // src never depends on the plugin dir — same game-local source either way.
  assert.equal(base.src, twin.src);
  // Agents get the .md suffix in both worlds.
  assert.equal(
    locate("agents", "helper", game, TWIN_PLUGIN_DIR).dst,
    path.join(TWIN_PLUGIN_DIR, "agents", "helper.md"),
  );
});

test("promoteOne: moves into the pluginDir it is given (the viewer seam, end to end on disk)", () => {
  const root = path.join(scratch, "viewer-promotion");
  const game = path.join(root, "project");
  const twinPlugin = path.join(root, "plugin-twin");
  mkdirSync(path.join(game, ".claude", "skills", "twin-thing"), { recursive: true });
  writeFileSync(
    path.join(game, ".claude", "skills", "twin-thing", "SKILL.md"),
    "---\nname: twin-thing\n---\nAgnostic viewer content.\n",
  );
  const r = promoteOne("skills", "twin-thing", game, { pluginDir: twinPlugin });
  assert.equal(r.ok, true);
  assert.equal(r.msg, "moved skills/twin-thing → plugin-twin");
  // Landed in the twin plugin, gone from the game, and the base plugin untouched.
  assert.match(
    readFileSync(path.join(twinPlugin, "skills", "twin-thing", "SKILL.md"), "utf8"),
    /Agnostic viewer content/,
  );
  assert.ok(!existsSync(path.join(game, ".claude", "skills", "twin-thing")));
  assert.ok(!existsSync(path.join(FRAMEWORK_PLUGIN_DIR, "skills", "twin-thing")));
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
