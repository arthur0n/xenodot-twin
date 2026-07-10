// node:test coverage for the /api/binding-candidates HTTP handler (binding-candidates-http.js) —
// exercised over REAL HTTP (a throwaway http.Server around the handler, hit with fetch), because the
// thing under test is a browser-facing surface: status codes, JSON shape, and above all the
// REALPATH-based confinement. The symlink case is written to fail against a lexical
// resolve+startsWith implementation by construction: the in-root symlink's target holds valid
// sidecar JSON, so a lexical check would 200 with the outside file's contents — the assert demands
// 400 and proves the target is never served. Root is a temp dir (macOS tmpdir is itself a symlink,
// /var → /private/var, so this also exercises the realpath'd-root comparison).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseJSON } from "../../../lib/json.js";
import { handleBindingCandidatesGet } from "./binding-candidates-http.js";

const ROOT = mkdtempSync(path.join(tmpdir(), "xeno-binding-http-"));
mkdirSync(path.join(ROOT, "models"));
writeFileSync(
  path.join(ROOT, "models", "House_props.json"),
  JSON.stringify({
    W1: { ifc_class: "IfcWall", name: "North Wall", psets: {}, quantities: {} },
    D1: { ifc_class: "IfcDoor", name: "Front Door", psets: {}, quantities: {} },
  }),
);

/** The throwaway server: every request goes straight to the handler under test. */
const server = http.createServer((req, res) => {
  handleBindingCandidatesGet(req.url ?? "", res, ROOT);
});
/** @type {string} base url, set once the server is listening */
const base = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    resolve(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
  });
});
after(() => {
  server.close();
  rmSync(ROOT, { recursive: true, force: true });
});

/** GET a query string against the handler. @param {string} qs
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>} */
async function get(qs) {
  const r = await fetch(`${base}/api/binding-candidates${qs}`);
  // text + parseJSON funnels the body through `unknown` (the lib/json.js idiom) — Response.json()
  // returns `any`, which the no-unsafe-* rules rightly reject.
  const body = /** @type {Record<string, unknown>} */ (parseJSON(await r.text()));
  return { status: r.status, body };
}

test("happy path over HTTP: filtered, bounded page + histogram", async () => {
  const { status, body } = await get("?model=House&class=IfcWall&limit=5");
  assert.equal(status, 200);
  assert.equal(body.matched, 1);
  assert.equal(body.total, 2);
  const cands = /** @type {{ globalId: string }[]} */ (body.candidates);
  assert.equal(cands[0]?.globalId, "W1");
});

test("confinement over HTTP is REALPATH-based: an in-root symlink pointing outside 400s", async () => {
  const outside = mkdtempSync(path.join(tmpdir(), "xeno-binding-http-out-"));
  const secret = path.join(outside, "secret_props.json");
  writeFileSync(
    secret,
    JSON.stringify({ S1: { ifc_class: "IfcWall", name: "SECRET", psets: {}, quantities: {} } }),
  );
  const link = path.join(ROOT, "models", "evil_props.json");
  symlinkSync(secret, link);
  try {
    // Direct sidecar param naming the symlink — lexically in-root, realpath outside.
    const bySidecar = await get("?sidecar=models/evil_props.json");
    assert.equal(bySidecar.status, 400, "a lexical-only check would 200 here");
    assert.match(String(bySidecar.body.error), /outside the project root/);
    assert.doesNotMatch(JSON.stringify(bySidecar.body), /SECRET/, "target never served");
    assert.doesNotMatch(
      String(bySidecar.body.error),
      new RegExp(ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "no internal root path echoed",
    );
    // model-stem resolution reaching the same symlink (re-confinement of the final path).
    const byModel = await get("?model=evil");
    assert.equal(byModel.status, 400);
    assert.doesNotMatch(JSON.stringify(byModel.body), /SECRET/);
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("lexical escape 400s and unknown model 400s (graceful, JSON error)", async () => {
  const escape = await get("?sidecar=../../../../etc/passwd");
  assert.equal(escape.status, 400);
  const unknown = await get("?model=Nope");
  assert.equal(unknown.status, 400);
  assert.match(String(unknown.body.error), /no sidecar for model 'Nope'/);
});
