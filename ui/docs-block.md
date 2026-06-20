## Godot Docs · Source of truth

The official Godot documentation is mounted as an MCP server (`mcp__godot-docs__*`, backed by
`@nuskey8/godot-docs-mcp` over the live docs site). It is the **source of truth** for engine
API — class names, method/signal/property signatures, enums, and deprecations. Treat
recalled-from-memory Godot APIs as unverified.

### Tools

- `mcp__godot-docs__godot_docs_get_class` — primary: full API for one class (methods, signals,
  properties). Pass the class name.
- `mcp__godot-docs__godot_docs_get_page` — fetch a specific tutorial/guide/class page by URL.
- `mcp__godot-docs__godot_docs_search` — best-effort keyword discovery; may return empty (Godot's
  site search is client-side). On empty, go direct via `get_class`.

### Routing

- **Builders consult the docs inline.** Builder agents carry the `xenodot:godot-docs` skill —
  they verify a signature directly via these tools before writing it. No dispatch needed for a
  quick lookup.
- **Dispatch `xenodot:godot-docs-evangelist`** for a heavier doc-research turn: confirming a
  deprecation, mapping a Godot 3 API to its 4.x replacement, or summarizing the recommended
  pattern for an engine system. It answers with the exact signature + a doc link, isolating the
  doc-reading tokens from the builder's context.

### Limits

- The server targets canonical Godot (`docs.godotengine.org/en/stable`). For Redot/Blazium-fork
  -specific APIs it may not have the page — the answer should say so rather than guess.
- It reads docs only; it never edits the game, runs the engine, or verifies a scene (that's
  `xenodot:godot-verify`).
