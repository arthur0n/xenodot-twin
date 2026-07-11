// The environment audit, as a PURE, importable function — so both the `onboard:check` CLI
// (onboard-check.js prints + exits on it) and the web UI's first-boot setup panel
// (GET /api/onboard-status → the panel) read the SAME truth, never a re-implementation.
// It answers "does this machine have what the framework needs, and if not, the exact fix?" —
// one Check per tool, ✓ present / ✗ missing / — optional-skipped, with the precise install
// command per ✗. Godot + gdtoolkit versions are judged against the pins in
// plugin/tools/tool_config.json (the one addressable pin source): a mismatch is an advisory ✗
// naming the exact actual-vs-pinned drift, because committed .gd formatting and the gates are
// only guaranteed green under the pinned toolchain.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolveEngineBin } from "../core/engine-bin.js";

/** package.json engines.node — the one HARD requirement to run any of this. */
export const MIN_NODE = 18;

/** Toolchain pins from plugin/tools/tool_config.json — the ONE addressable pin source (shared
 * with the GDScript/Bash tool contract). Read lazily and fail-open: a missing/renamed file
 * degrades to unpinned reporting instead of crashing the audit.
 * @returns {{ godot?: string, gdtoolkit?: string }} */
function toolchainPins() {
  try {
    const raw = readFileSync(new URL("../../../plugin/tools/tool_config.json", import.meta.url), {
      encoding: "utf8",
    });
    // Launder JSON.parse's `any` through `unknown`, then narrow (repo no-unsafe-* pattern).
    const parsed = /** @type {unknown} */ (JSON.parse(raw));
    const cfg = /** @type {{ godot_version?: string, gdtoolkit_version?: string }} */ (parsed);
    return { godot: cfg.godot_version, gdtoolkit: cfg.gdtoolkit_version };
  } catch {
    return {};
  }
}

/** Version-vs-pin match: exact, or the pin as a version prefix — "4.6.3.stable" satisfies pin
 * "4.6"; "4.5.0" satisfies pin "4.5.0". @param {string} actual @param {string} pin */
function matchesPin(actual, pin) {
  return actual === pin || actual.startsWith(pin + ".");
}

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

/** Judge the resolved Godot binary against the pin — an off-pin engine is an advisory ✗ (the
 * verify gate + warnings-as-errors behavior are only exercised against the pinned minor).
 * @param {{ godot?: string }} pins @returns {Check} */
function godotCheck(pins) {
  const bin = process.env.GODOT ?? resolveEngineBin();
  if (!bin) {
    return {
      mark: "✗",
      line: "Godot not found — the verify gate + headless boot need it",
      fix: `install Godot ${pins.godot ?? "4.6"}.x, then: export GODOT=/path/to/godot   (macOS app bundle auto-detected)`,
    };
  }
  const version = probe(bin, ["--version"]);
  if (pins.godot && version && !matchesPin(version, pins.godot)) {
    return {
      mark: "✗",
      line: `Godot ${version} ≠ pinned ${pins.godot}.x ($GODOT=${bin}) — gates are only exercised against the pin`,
      fix: `install Godot ${pins.godot}.x (pin: plugin/tools/tool_config.json godot_version)`,
    };
  }
  return {
    mark: "✓",
    line: `Godot ${version ?? "(version unknown)"} resolved ($GODOT=${bin})${pins.godot ? `   [pin ${pins.godot}.x]` : ""}`,
  };
}

/** Judge gdtoolkit (gdlint/gdformat) against the pin — gdformat's output drifts across versions,
 * so an off-pin install reformats committed .gd; absence stays an optional skip (the lint/format
 * floor soft-skips without it, see gdlint.check.js).
 * @param {{ gdtoolkit?: string }} pins @returns {Check} */
function gdtoolkitCheck(pins) {
  const gdlint = probe("gdlint", ["--version"]);
  if (!gdlint) {
    return {
      mark: "—",
      line: "gdtoolkit not installed (optional — GDScript lint/format skip without it)",
      fix: `pipx install gdtoolkit${pins.gdtoolkit ? `==${pins.gdtoolkit}` : ""}`,
    };
  }
  const version = gdlint.split(/\s+/).pop() ?? gdlint; // "gdlint 4.5.0" → "4.5.0"
  if (pins.gdtoolkit && !matchesPin(version, pins.gdtoolkit)) {
    return {
      mark: "✗",
      line: `gdtoolkit ${version} ≠ pinned ${pins.gdtoolkit} — committed .gd formatting matches the pin only`,
      fix: `pipx install --force gdtoolkit==${pins.gdtoolkit} (pin: plugin/tools/tool_config.json gdtoolkit_version)`,
    };
  }
  return {
    mark: "✓",
    line: `gdtoolkit ${version} (gdlint/gdformat)${pins.gdtoolkit ? `   [pin ${pins.gdtoolkit}]` : ""}`,
  };
}

/** Build the environment audit — one Check per tool. Side-effect-free (only spawns `--version`
 * probes), so it is safe to call from a request handler as well as the CLI.
 * @returns {Check[]} */
export function onboardChecks() {
  /** @type {Check[]} */
  const checks = [];
  const pins = toolchainPins();

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

  // 2. Engine binary + version-vs-pin — needed for the verify gate and headless boot. Advisory
  //    (you can wire a seat and open the UI without it), but ✗ because the build/boot can't run
  //    until it's set — and ✗ on version drift from the pin.
  checks.push(godotCheck(pins));

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
            line: `${py}   [ifcopenshell 0.8.5 needs 3.12 — no 3.14 wheel; pinned by twin_build --provision]`,
          }
        : { mark: "—", line: "python3 not on PATH (uv provisions its own 3.12 venv, so optional)" },
    );
  }

  // 4. gdtoolkit (gdlint/gdformat) — optional (the lint/format floor soft-skips without it), but
  //    judged against the pin when present.
  checks.push(gdtoolkitCheck(pins));

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
