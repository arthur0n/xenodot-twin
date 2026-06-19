// Automated onboarding test — proves a clean consumer can go from a fresh clone of the
// framework to a wired, runnable game, with the game staying PURE: the framework loads from
// the xenodot plugin, nothing is copied in. Bare-node, no test runner (same style as
// ui/reducer.check.js):
//   node ui/server/onboarding.check.js        # Tier 1; Tier 2 runs if Godot is found
//
// Tier 1 (deterministic, no Claude/Godot): export the framework EXACTLY as a forker
//   receives it — `git archive` of the tracked tree, so node_modules, .xenodot.json and
//   logs are excluded and an un-committed file is invisible (the real "did we ship it?"
//   test). Then run `forge new` into a fresh game and assert the plugin ships, the game is
//   a valid project with tools materialized + library linked, and NO framework agents/skills
//   leaked into the game.
// Tier 2 (guarded): if a Godot binary resolves, headless-boot the scaffolded starter.
//
// NOTE: new/edited framework files must be `git add`-ed before running locally — the archive
// sees TRACKED files only. CI runs post-commit, so HEAD has everything.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEngineBin } from "../core/engine-bin.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
const FRAMEWORK_DIR = path.join(here, "..", "..", "..");

let passed = 0;
/** @param {string} name @param {() => void} fn */
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

/** Count .md files in a dir (0 if missing). @param {string} dir @returns {number} */
const countMd = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
/** Count immediate subdirectories (0 if missing). @param {string} dir @returns {number} */
const countDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

const work = mkdtempSync(path.join(tmpdir(), "xeno-onboard-"));
try {
  // ---- Build the "as shipped" framework tree from TRACKED files only ----
  const stashRef = execFileSync("git", ["stash", "create"], { cwd: FRAMEWORK_DIR })
    .toString()
    .trim();
  const ref = stashRef || "HEAD";
  const fw = path.join(work, "framework");
  mkdirSync(fw, { recursive: true });
  const tarBuf = execFileSync("git", ["archive", "--format=tar", ref], {
    cwd: FRAMEWORK_DIR,
    maxBuffer: 256 * 1024 * 1024,
  });
  const tarFile = path.join(work, "framework.tar");
  writeFileSync(tarFile, tarBuf);
  execFileSync("tar", ["-xf", tarFile, "-C", fw]);

  const pluginAgents = path.join(fw, "plugin", "agents");
  const pluginSkills = path.join(fw, "plugin", "skills");

  check("framework ships the xenodot plugin and starter (committed)", () => {
    assert.ok(
      existsSync(path.join(fw, "plugin", ".claude-plugin", "plugin.json")),
      "plugin/.claude-plugin/plugin.json must ship",
    );
    assert.ok(
      countMd(pluginAgents) > 0 && countDirs(pluginSkills) > 0,
      "plugin/{agents,skills} must ship with content",
    );
    assert.ok(existsSync(path.join(fw, "starter", "project.godot")), "starter/ must ship");
    assert.ok(
      existsSync(path.join(fw, ".claude-plugin", "marketplace.json")),
      "marketplace.json must ship (terminal install)",
    );
  });

  // ---- forge new → a fresh game, then assert it's wired AND pure ----
  const game = path.join(work, "game");
  execFileSync("node", [path.join(fw, "ui", "server", "cli", "new.js"), game], { stdio: "pipe" });

  check("forge new scaffolds a runnable, wired game", () => {
    assert.ok(existsSync(path.join(game, "project.godot")), "project.godot scaffolded");
    assert.ok(existsSync(path.join(game, "CLAUDE.md")), "thin CLAUDE.md present");
    assert.ok(
      existsSync(path.join(game, ".claude", "settings.json")),
      "game .claude/settings.json present",
    );
    assert.ok(
      existsSync(path.join(game, "tools", "validate.sh")),
      "tools/ materialized from the plugin",
    );
  });

  check("library/ is symlinked to the plugin (single source)", () => {
    const lib = path.join(game, "library");
    assert.ok(lstatSync(lib).isSymbolicLink(), "library/ must be a symlink");
  });

  check("the game stays PURE — no framework agents/skills copied in", () => {
    assert.ok(!existsSync(path.join(game, ".claude", "agents")), ".claude/agents must NOT exist");
    assert.ok(!existsSync(path.join(game, ".claude", "skills")), ".claude/skills must NOT exist");
  });

  check("game gitignores the generated framework paths", () => {
    const gi = readFileSync(path.join(game, ".gitignore"), "utf8");
    for (const p of ["/tools/", "/library"]) {
      assert.ok(gi.includes(p), `.gitignore must ignore ${p}`);
    }
  });

  // doctor already ran inside `forge new` (it throws on a hard failure, which would have
  // failed the new.js call above). Re-run explicitly as a belt-and-suspenders check.
  check("doctor reports a healthy game", () => {
    execFileSync("node", [path.join(fw, "ui", "server", "cli", "doctor.js"), game], {
      stdio: "pipe",
    });
  });

  // ---- Tier 2: guarded headless Godot boot ----
  const godot = resolveEngineBin();
  if (godot) {
    execFileSync(godot, ["--headless", "--path", game, "--import"], { stdio: "pipe" });
    const out = execFileSync(godot, ["--headless", "--path", game, "--quit-after", "3"], {
      stdio: "pipe",
    }).toString();
    check("starter boots headless with no engine errors (Tier 2)", () => {
      const bad = out
        .split("\n")
        .filter((l) => /SCRIPT ERROR|Parse Error|ERROR:|Failed to load/.test(l));
      assert.equal(bad.length, 0, `Godot reported errors:\n${bad.join("\n")}`);
    });
  } else {
    console.log("skip  Tier 2 headless Godot boot — no Godot binary (set GODOT=/path/to/godot)");
  }

  console.log(`\nonboarding: ${passed} checks passed.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
