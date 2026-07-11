// The environment audit, as a PURE, importable function — so both the `onboard:check` CLI
// (onboard-check.js prints + exits on it) and the web UI's first-boot setup panel
// (GET /api/onboard-status → the panel) read the SAME truth, never a re-implementation.
// It answers "does this machine have what the framework needs, and if not, the exact fix?" —
// one Check per tool, ✓ present / ✗ missing / — optional-skipped, with the precise install
// command per ✗. Toolchain versions are REPORTED, not judged (no single pin source yet —
// ledger D9-toolchain-drift owns that fix), so version lines carry "pin pending".
import { execFileSync } from "node:child_process";
import { resolveEngineBin } from "../core/engine-bin.js";

/** package.json engines.node — the one HARD requirement to run any of this. */
export const MIN_NODE = 18;
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

/** Build the environment audit — one Check per tool. Side-effect-free (only spawns `--version`
 * probes), so it is safe to call from a request handler as well as the CLI.
 * @returns {Check[]} */
export function onboardChecks() {
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

  // 2. Engine binary + version — needed for the verify gate and headless boot. Advisory (you can
  //    wire a seat and open the UI without it), but ✗ because the build/boot can't run until it's set.
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

  // 3. uv + Python — twin_build.sh --provision builds the pinned .venv-ifc (uv venv 3.12 +
  //    ifcopenshell 0.8.5) for IFC import. Advisory: only the IFC/BYO path needs it.
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
        ? {
            mark: "✓",
            line: `${py}   [ifcopenshell 0.8.5 needs 3.12 — no 3.14 wheel; ${PIN_NOTE}]`,
          }
        : { mark: "—", line: "python3 not on PATH (uv provisions its own 3.12 venv, so optional)" },
    );
  }

  // 4. gdtoolkit (gdlint/gdformat) — the GDScript lint/format floor soft-skips without it
  //    (gdlint.check.js), so optional, but report the version when present.
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

  return checks;
}

/** Roll a checklist up into present/missing/skipped counts + whether a REQUIRED tool failed.
 * @param {Check[]} checks */
export function summarizeChecks(checks) {
  let present = 0;
  let missing = 0;
  let skipped = 0;
  let requiredFail = false;
  for (const c of checks) {
    if (c.mark === "✓") present += 1;
    else if (c.mark === "✗") {
      missing += 1;
      if (c.required) requiredFail = true;
    } else skipped += 1;
  }
  return { present, missing, skipped, requiredFail };
}
