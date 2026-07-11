// onboard:check — the ENVIRONMENT audit a stranger runs FIRST, before wiring a project. It answers
// "does this machine have what the framework needs, and if not, what's the exact fix?" — one line
// per tool, ✓ present / ✗ missing / — optional-skipped, with the precise install command per ✗.
//
// Scope split (no duplication): this checks the TOOLCHAIN (node, engine, uv/python, gdtoolkit,
// rtk/graphify). `npm run doctor` checks the wired SEAT (plugin, project.godot, materialized tools).
// onboard:verify runs doctor against the real seat; this runs with NO project configured.
//
// Toolchain versions are REPORTED, not judged: no single pin source exists yet (ledger
// D9-toolchain-drift owns that fix), so every version line carries "pin pending" where a pin
// would go — honest, not a false green/red.
//
//   node ui/server/cli/onboard-check.js   # exits 1 only if Node is too old to run anything; else 0
import { execFileSync } from "node:child_process";
import { resolveEngineBin } from "../core/engine-bin.js";

const MIN_NODE = 18; // package.json engines.node — the one HARD requirement to run any of this.
const PIN_NOTE = "pin pending — ledger D9-toolchain-drift";

/** Run a command and return its trimmed stdout, or null if it isn't runnable.
 * @param {string} cmd @param {string[]} args @returns {string | null} */
function probe(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** @typedef {{ mark: "✓" | "✗" | "—", line: string, fix?: string, required?: boolean }} Check */

/** @type {Check[]} */
const checks = [];

// 1. Node — the only hard requirement (this script + the server are Node).
{
  const major = Number(process.versions.node.split(".")[0]);
  const ok = major >= MIN_NODE;
  checks.push({
    mark: ok ? "✓" : "✗",
    required: true,
    line: `Node v${process.versions.node} (need ≥${MIN_NODE})`,
    fix: ok ? undefined : `install Node ≥${MIN_NODE} — https://nodejs.org`,
  });
}

// 2. Engine binary + version — needed for the verify gate and headless boot. Advisory (you can wire
//    a seat and open the UI without it), but ✗ because the build/boot can't run until it's set.
{
  const bin = process.env.GODOT ?? resolveEngineBin();
  const version = bin ? probe(bin, ["--version"]) : null;
  checks.push(
    bin
      ? {
          mark: "✓",
          line: `Godot ${version ?? "(version unknown)"} resolved ($GODOT=${bin})   [${PIN_NOTE}]`,
        }
      : {
          mark: "✗",
          line: "Godot not found — the verify gate + headless boot need it",
          fix: "install Godot 4.6.x, then: export GODOT=/path/to/godot   (macOS app bundle auto-detected)",
        },
  );
}

// 3. uv + Python — twin_build.sh --provision builds the pinned .venv-ifc (uv venv 3.12 + ifcopenshell
//    0.8.5) for IFC import. Advisory: only the IFC/BYO path needs it.
{
  const uv = probe("uv", ["--version"]);
  checks.push(
    uv
      ? { mark: "✓", line: `${uv}   [twin_build --provision uses: uv venv --python 3.12]` }
      : {
          mark: "✗",
          line: "uv not found — twin_build --provision (IFC import) needs it",
          fix: "curl -LsSf https://astral.sh/uv/install.sh | sh   (https://docs.astral.sh/uv/)",
        },
  );
  const py = probe("python3", ["--version"]);
  checks.push(
    py
      ? { mark: "✓", line: `${py}   [ifcopenshell 0.8.5 needs 3.12 — no 3.14 wheel; ${PIN_NOTE}]` }
      : { mark: "—", line: "python3 not on PATH (uv provisions its own 3.12 venv, so optional)" },
  );
}

// 4. gdtoolkit (gdlint/gdformat) — the GDScript lint/format floor soft-skips without it (gdlint.check.js),
//    so it's optional, but report the version when present (the D9 drift is a gdformat version mismatch).
{
  const gdlint = probe("gdlint", ["--version"]);
  checks.push(
    gdlint
      ? { mark: "✓", line: `gdtoolkit ${gdlint} (gdlint/gdformat)   [${PIN_NOTE}]` }
      : {
          mark: "—",
          line: "gdtoolkit not installed (optional — GDScript lint/format skip without it)",
          fix: "pipx install gdtoolkit",
        },
  );
}

// 5. rtk + graphify — optional dev accelerators; the framework no-ops cleanly without either.
checks.push(
  probe("rtk", ["--version"])
    ? { mark: "✓", line: "rtk on PATH (token-saving proxy)" }
    : { mark: "—", line: "rtk not on PATH (optional — token proxy; the hook no-ops without it)" },
);
checks.push(
  probe("graphify", ["--version"])
    ? { mark: "✓", line: "graphify on PATH (codebase knowledge graph)" }
    : {
        mark: "—",
        line: "graphify not on PATH (optional — codebase knowledge graph)",
        fix: "uv tool install graphifyy",
      },
);

console.log("onboard:check — environment audit\n");
let present = 0;
let missing = 0;
let skipped = 0;
let requiredFail = false;
for (const c of checks) {
  console.log(`  ${c.mark} ${c.line}`);
  if (c.mark === "✗" && c.fix) console.log(`      fix: ${c.fix}`);
  if (c.mark === "✓") present += 1;
  else if (c.mark === "✗") {
    missing += 1;
    if (c.required) requiredFail = true;
  } else skipped += 1;
}
console.log(
  `\nonboard:check: ${present} present, ${missing} missing, ${skipped} optional skipped.`,
);
if (requiredFail) {
  console.error("onboard:check: a REQUIRED tool is missing — fix it (above) before continuing.");
  process.exit(1);
}
// Advisory misses (Godot/uv/gdtoolkit) do NOT fail the audit: you can open the UI and wire a seat
// without them; the downstream step that needs each one fails loud with the same fix if still absent.
