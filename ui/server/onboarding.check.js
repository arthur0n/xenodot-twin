// Automated onboarding test — proves a clean consumer can go from a fresh clone
// of the framework to a wired, runnable game. Bare-node, no test runner (same
// style as ui/reducer.check.js):
//   node ui/server/onboarding.check.js        # Tier 1; Tier 2 runs if Godot is found
//
// Tier 1 (deterministic, no Claude/Godot): export the framework EXACTLY as a
//   forker receives it — `git archive` of the tracked tree, so node_modules,
//   .xenodot.json and logs are excluded and an un-committed file is invisible
//   (the real "did we actually ship it?" test). Install into a fixture game that
//   already owns a settings.json, then assert agents/skills land and the rtk hook
//   MERGES without clobbering the consumer's permissions.
// Tier 2 (guarded): if a Godot binary resolves, headless-boot the installed
//   starter and assert no engine errors. Skipped cleanly otherwise.
//
// NOTE: new/edited framework files must be `git add`-ed before running locally —
// the archive sees the index + working tree of TRACKED files only. That mirrors
// what actually ships to a forker. CI runs post-commit, so HEAD has everything.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  cpSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJSON } from "../lib/json.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server
const FRAMEWORK_DIR = path.join(here, "..", "..");

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

/**
 * @typedef {{ command?: string }} HookCmd
 * @typedef {{ matcher?: string, hooks?: HookCmd[] }} HookEntry
 * @typedef {{ permissions?: unknown, hooks?: { PreToolUse?: HookEntry[] } }} Settings
 */
/** @param {string} file @returns {Settings} */
const readSettings = (file) => /** @type {Settings} */ (parseJSON(readFileSync(file, "utf8")));
/** @param {Settings} s @returns {HookEntry[]} */
const rtkHooks = (s) =>
  (s.hooks?.PreToolUse ?? []).filter((e) =>
    (e.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes("rtk hook")),
  );

const work = mkdtempSync(path.join(tmpdir(), "xeno-onboard-"));
try {
  // ---- Build the "as shipped" framework tree from TRACKED files only ----
  // `git stash create` snapshots index + working tree as a commit object without
  // touching the repo; empty when clean → fall back to HEAD. Archiving that ref
  // is precisely what a forker pulls.
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

  const installer = path.join(fw, "ui", "server", "claude-install.js");
  const doctor = path.join(fw, "ui", "server", "doctor.js");
  const srcAgents = path.join(fw, "game-config", "agents");
  const srcSkills = path.join(fw, "game-config", "skills");

  check("framework ships installer, game-config and starter (committed)", () => {
    assert.ok(existsSync(installer), "claude-install.js must be in the shipped tree");
    assert.ok(
      existsSync(srcAgents) && existsSync(srcSkills),
      "game-config/{agents,skills} must ship",
    );
    assert.ok(existsSync(path.join(fw, "starter", "project.godot")), "starter/ must ship");
  });

  const EXPECT_AGENTS = countMd(srcAgents);
  const EXPECT_SKILLS = countDirs(srcSkills);

  // ---- Fixture game: starter + a PRE-EXISTING settings.json carrying perms ----
  const game = path.join(work, "game");
  cpSync(path.join(fw, "starter"), game, { recursive: true });
  mkdirSync(path.join(game, ".claude"), { recursive: true });
  const SENTINEL = { permissions: { allow: ["Bash(echo hello)"] } };
  const settingsFile = path.join(game, ".claude", "settings.json");
  writeFileSync(settingsFile, JSON.stringify(SENTINEL, null, 2) + "\n");

  const agentsDir = path.join(game, ".claude", "agents");
  const skillsDir = path.join(game, ".claude", "skills");
  /** @param {string[]} extra @returns {string} */
  const install = (extra = []) =>
    execFileSync("node", [installer, game, ...extra], { stdio: "pipe" }).toString();

  // ---- Tier 1a: first install ----
  install();
  check("agents + skills installed at full count", () => {
    assert.ok(EXPECT_AGENTS > 0 && EXPECT_SKILLS > 0, "fixture must have something to install");
    assert.equal(countMd(agentsDir), EXPECT_AGENTS);
    assert.equal(countDirs(skillsDir), EXPECT_SKILLS);
  });
  check("rtk hook MERGED into existing settings.json, permissions preserved", () => {
    const s = readSettings(settingsFile);
    assert.equal(rtkHooks(s).length, 1, "exactly one rtk hook present after install");
    assert.deepEqual(
      s.permissions,
      SENTINEL.permissions,
      "consumer permissions must survive the merge",
    );
  });

  // ---- Tier 1b: idempotent re-run ----
  install();
  check("re-install is idempotent (no duplicate hook, counts stable)", () => {
    assert.equal(rtkHooks(readSettings(settingsFile)).length, 1, "still exactly one rtk hook");
    assert.equal(countMd(agentsDir), EXPECT_AGENTS);
  });

  // ---- Tier 1c: --force prunes orphans, re-mirrors, still preserves perms ----
  const orphan = path.join(agentsDir, "zzz-orphan.md");
  writeFileSync(orphan, "# orphan agent upstream no longer ships\n");
  install(["--force"]);
  check("--force prunes orphan agents yet preserves settings permissions", () => {
    assert.ok(!existsSync(orphan), "orphan agent must be pruned under --force");
    assert.equal(countMd(agentsDir), EXPECT_AGENTS);
    const s = readSettings(settingsFile);
    assert.deepEqual(s.permissions, SENTINEL.permissions, "--force must not clobber permissions");
    assert.equal(rtkHooks(s).length, 1, "hook still present (once) after --force");
  });

  // ---- Tier 1d: doctor passes on the installed game ----
  check("doctor reports a healthy install", () => {
    execFileSync("node", [doctor, game], { stdio: "pipe" }); // non-zero exit throws
  });

  // ---- Tier 2: guarded headless Godot boot ----
  const godot = resolveGodot();
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

/** First resolvable Godot binary, or null. @returns {string | null} */
function resolveGodot() {
  const candidates = [
    process.env.GODOT,
    "/Applications/Godot.app/Contents/MacOS/Godot",
    "godot",
  ].filter((c) => typeof c === "string" && c.length > 0);
  for (const c of candidates) {
    try {
      execFileSync(/** @type {string} */ (c), ["--version"], { stdio: "ignore" });
      return /** @type {string} */ (c);
    } catch {
      // try next candidate
    }
  }
  return null;
}
