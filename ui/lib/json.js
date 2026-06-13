// JSON helpers. `JSON.parse` / `Response.json()` return `any`; these funnel
// the result through `unknown` so every call site must cast it explicitly —
// that keeps the no-unsafe-* lint rules satisfied instead of letting `any`
// leak across the codebase. `fetch` and `JSON` are globals in both the browser
// and Node 18+, so this module is environment-agnostic.

/** @param {unknown} s @returns {unknown} */
export const parseJSON = (s) => JSON.parse(/** @type {string} */ (s));

/** @param {string} url @returns {Promise<unknown>} */
export const fetchJSON = async (url) => (await fetch(url)).json();

/** POST JSON and parse a JSON reply. Throws on a non-JSON response (e.g. a stale
 * server that 404s with plain text) so callers can show a clean error.
 * @param {string} url @param {unknown} body @returns {Promise<unknown>} */
export const postJSON = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error(`HTTP ${res.status} (no JSON — is the server up to date?)`);
  }
  return res.json();
};
