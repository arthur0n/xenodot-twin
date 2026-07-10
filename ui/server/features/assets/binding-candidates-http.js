// GET /api/binding-candidates — the assets-panel surface for the binding-candidate query (same
// shared core as the `npm run binding` CLI and the mcp__ui__find_binding_candidates tool). Split out
// of core/index.js so the handler is unit-testable over real HTTP (index.js starts the whole server
// at import). SECURITY: this is a browser-callable surface taking a caller-supplied path, so it uses
// the core's confineToRoot — the SAME realpath-based, symlink-safe check the MCP tool uses. A lexical
// resolve+startsWith is NOT enough: an in-root symlink (models/evil_props.json → outside) passes the
// lexical check and gets read — arbitrary-file disclosure served as "candidates". Both the supplied
// path AND the final resolved sidecar are confined (a models/-resolved file can itself be a symlink).
// A SidecarError maps to 400 with a message that never echoes internal paths beyond what the caller
// supplied; anything else is a generic 500. Always returns a bounded page, never the whole sidecar.
import path from "node:path";
import { realpathSync } from "node:fs";
import {
  SidecarError,
  confineToRoot,
  resolveSidecarPath,
  loadSidecar,
  queryCandidates,
} from "./binding-candidates.js";

/** Handle `GET /api/binding-candidates?model=&sidecar=&class=&name=&storey=&limit=&offset=`.
 * @param {string} url the request url (path + query)
 * @param {import("node:http").ServerResponse} res
 * @param {string} projectDir the project root every read is confined to */
export function handleBindingCandidatesGet(url, res, projectDir) {
  const q = new URL(url, "http://localhost").searchParams;
  try {
    const realRoot = realpathSync(projectDir);
    const sidecar = q.get("sidecar") ?? undefined;
    const confined = sidecar ? confineToRoot(realRoot, sidecar, "sidecar") : undefined;
    const absPath = resolveSidecarPath({
      projectDir: realRoot,
      sidecar: confined,
      model: q.get("model") ?? undefined,
    });
    // The resolved file itself may be a symlink escaping the root — confine the FINAL path too.
    confineToRoot(realRoot, absPath, "sidecar");
    const { sidecar: parsed, bytes } = loadSidecar(absPath);
    const result = queryCandidates(parsed, {
      ifcClass: q.get("class") ?? undefined,
      name: q.get("name") ?? undefined,
      storey: q.get("storey") ?? undefined,
      limit: q.get("limit") ? Number(q.get("limit")) : undefined,
      offset: q.get("offset") ? Number(q.get("offset")) : undefined,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ sidecar: path.basename(absPath), bytes, ...result }));
  } catch (err) {
    const bad = err instanceof SidecarError;
    res.writeHead(bad ? 400 : 500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: bad ? err.message : "binding-candidates query failed" }));
  }
}
