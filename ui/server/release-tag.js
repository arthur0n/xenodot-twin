// Post-commit: if a release was staged (see release-stage.js), create the
// annotated tag on the just-made commit. Tags are NOT pushed — do that manually
// with `git push origin <tag>`.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
const marker = path.join(gitDir, "XENODOT_RELEASE");
if (!existsSync(marker)) process.exit(0);

const tag = readFileSync(marker, "utf8").trim();
rmSync(marker, { force: true });

if (!/^v\d+(\.\d+){2,3}$/.test(tag)) {
  console.warn(`release: ignoring malformed tag "${tag}".`);
  process.exit(0);
}

try {
  execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { stdio: "ignore" });
  console.warn(`release: tag ${tag} already exists — not re-tagging.`);
  process.exit(0);
} catch {
  // tag does not exist yet — good, create it below
}

execFileSync("git", ["tag", "-a", tag, "-m", tag], { stdio: "ignore" });
console.log(`release: created ${tag}. Push it with:  git push origin ${tag}`);
