// `npm run byo` — bring your own IFC: point ONE command at your own .ifc and get a bound, painted,
// live-data viewer, with no hand-authored binding map. The stranger on-ramp that chains the pieces
// a first-timer would otherwise wire by hand:
//   1. scaffold or wire the seat (reuses new.js — scaffold when empty, wire an existing project.godot)
//   2. provision the pinned .venv-ifc if missing (twin_build.sh --provision)
//   3. build: import → auto-map → optimize → verify, data-bound (twin_build.sh --auto-map)
//   4. start the seeded sim on the generated map, and PRINT the exact one-line Godot boot command —
//      self-contained via --model + --binding-map user args, so it NEVER mutates the seat's
//      viewer.cfg (no --wire) and never auto-launches the editor (the stranger runs it when ready).
//
// EXPLICIT PATHS ONLY: --project is REQUIRED. The framework never scaffolds at an implicit default
// location — it creates exactly the directory you name (and says so), or wires the existing seat
// already there. Idempotent: re-running rebuilds artifacts and restarts the sim in place.
//
//   npm run byo -- /path/to/your.ifc --project /path/you/choose
//   npm run byo -- ./plant.ifc --project ../my-twin --port 8765
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../../../plugin/tools/sim/stream.js";

const here = path.dirname(fileURLToPath(import.meta.url)); // ui/server/cli
/** The viewer's DataBus DEFAULT_URL points at ws://localhost:8765, so a sim here pairs with a
 * wired viewer out of the box (no --url needed). Overridable with --port. */
const DEFAULT_SIM_PORT = 8765;

const USAGE =
  "usage: npm run byo -- <your.ifc> --project <dir> [--port 8765]\n" +
  "  --project is REQUIRED — the seat directory to scaffold (if empty) or wire (if it has a\n" +
  "  project.godot). The framework never scaffolds at an implicit default path.";

/** Print a FAIL line + usage to stderr and exit nonzero. @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`byo: ${msg}\n${USAGE}`);
  process.exit(1);
}

/** Resolve + validate the two required inputs (the IFC file and the explicit --project seat).
 * @param {Record<string, string>} args @param {string[]} argv @returns {{ ifc: string, seat: string }} */
function resolveInputs(args, argv) {
  const positional = argv.find((a) => !a.startsWith("-"));
  if (!positional) fail("no IFC given");
  const ifc = path.resolve(positional);
  if (!existsSync(ifc)) fail(`no such IFC: ${ifc}`);
  if (!ifc.toLowerCase().endsWith(".ifc")) fail(`not an .ifc file: ${ifc}`);
  if (!args.project) fail("--project <dir> is required (the seat to scaffold or wire)");
  return { ifc, seat: path.resolve(args.project) };
}

/** Scaffold (empty dir) or wire (existing project.godot) the seat via new.js — the SAME blessed path
 * `npm run new` uses, so the seat is materialized identically (tools/ copied, library/ symlinked).
 * Announces which of the two happened. @param {string} seat @returns {void} */
function ensureSeat(seat) {
  const scaffolding = !existsSync(path.join(seat, "project.godot"));
  console.log(
    scaffolding
      ? `byo: scaffolding a new viewer at ${seat} (you named it; nothing implicit)`
      : `byo: wiring the existing seat at ${seat} in place`,
  );
  if (scaffolding) mkdirSync(seat, { recursive: true });
  execFileSync("node", [path.join(here, "new.js"), seat], { stdio: "inherit" });
}

/** Run the build gate in the seat: provision the venv if missing, generate a binding map from the
 * import sidecar, optimize, verify data-bound, and wire viewer.cfg. Tees output live AND captures it
 * so the caller can lift the exact boot command the gate resolved. Throws (nonzero exit) on any gate
 * failure. @param {string} seat @param {string} ifc @returns {string} stdout */
function runBuild(seat, ifc) {
  console.log(`byo: building the twin (provision + import + auto-map + optimize + verify)…`);
  const out = execFileSync(
    "bash",
    [path.join(seat, "tools", "twin_build.sh"), ifc, "--provision", "--auto-map"],
    { cwd: seat, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
  );
  process.stdout.write(out);
  return out;
}

/** Probe whether a TCP port is free on localhost. @param {number} port @returns {Promise<boolean>} */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => {
      resolve(false);
    });
    srv.once("listening", () => {
      srv.close(() => {
        resolve(true);
      });
    });
    srv.listen(port, "127.0.0.1");
  });
}

/** Stop a prior byo-launched sim recorded in the seat's pidfile (idempotent restart). @param {string}
 * pidFile @returns {void} */
function stopPriorSim(pidFile) {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
      console.log(`byo: stopped the previous byo sim (pid ${pid})`);
    } catch {
      /* already gone — fine */
    }
  }
}

/** Start the seeded sim detached on `port`, bound to the generated map, and record its pid so a
 * re-run can replace it. Detached+unref so it outlives this one-shot. @param {string} seat
 * @param {string} map @param {number} port @param {string} pidFile @returns {void} */
function startSim(seat, map, port, pidFile) {
  const child = spawn("node", [path.join(seat, "tools", "sim", "server.js"), "--map", map, "--port", String(port)], {
    cwd: seat,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (child.pid !== undefined) writeFileSync(pidFile, `${child.pid}\n`);
  console.log(`byo: seeded sim streaming your map on ws://localhost:${port} (pid ${child.pid ?? "?"})`);
}

/** Build the self-contained boot command: lift the resolved engine + `--model=` from twin_build's
 * summary (re-rooting `--path .` at the seat), then APPEND `--binding-map=` so the one-liner carries
 * both the model and its generated bindings — no viewer.cfg needed. Falls back to a fully constructed
 * line if the summary shape ever changes. @param {string} buildOut @param {string} seat
 * @param {string} optScene @param {string} mapRel @returns {string} */
function bootCommand(buildOut, seat, optScene, mapRel) {
  const line = buildOut.split("\n").find((l) => l.includes("--path .") && l.includes("--model="));
  const base = line
    ? line.trim().replace("--path .", `--path ${seat}`)
    : `${process.env.GODOT ?? "godot"} --path ${seat} -- --model=${optScene}`;
  return `${base} --binding-map=${mapRel}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const { ifc, seat } = resolveInputs(args, argv);
  let port = Number(args.port ?? DEFAULT_SIM_PORT) | 0;

  ensureSeat(seat);
  const buildOut = runBuild(seat, ifc);

  const stem = path.basename(ifc).replace(/\.[^.]+$/, "");
  const map = path.join(seat, "models", `${stem}_auto_binding_map.json`);
  const mapRel = path.join("models", `${stem}_auto_binding_map.json`);
  const optScene = path.join("models", `${stem}_opt.tscn`);
  if (!existsSync(map)) fail(`the build produced no auto-map at ${map} (see the gate output above)`);

  const pidFile = path.join(seat, ".xenodot", "tmp", "byo-sim.pid");
  mkdirSync(path.dirname(pidFile), { recursive: true });
  stopPriorSim(pidFile);
  if (!(await portFree(port))) {
    console.log(`byo: port ${port} is busy — starting the sim on a free port instead`);
    for (let p = 8770; p <= 8799; p++) {
      if (await portFree(p)) {
        port = p;
        break;
      }
    }
  }
  startSim(seat, map, port, pidFile);

  console.log("\nbyo: your twin is built, bound, and streaming. Boot the viewer (does not auto-launch):");
  console.log(`    ${bootCommand(buildOut, seat, optScene, mapRel)}`);
  console.log(`\n  live data: ws://localhost:${port}  (the seeded sim, bound to ${path.basename(map)})`);
  console.log(`  stop the sim:  kill $(cat ${pidFile})`);
  console.log("  re-run this same command any time — it rebuilds and restarts in place.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
