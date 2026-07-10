#!/usr/bin/env python3
"""Static server with the cross-origin-isolation headers a Godot web build needs.

    python3 tools/web/serve_coi.py [--dir builds/web] [--port 8070]

WHY THIS TOOL EXISTS — the COOP+COEP requirement
------------------------------------------------
Every response is sent with two headers:

    Cross-Origin-Opener-Policy:   same-origin
    Cross-Origin-Embedder-Policy: require-corp

Together they make the served document `crossOriginIsolated`, which is the ONLY
state in which a browser exposes `SharedArrayBuffer`. A Godot web export built
with `thread_support=true` (the "threads" variant) checks for SharedArrayBuffer
at boot and refuses to run without it — so a threads build MUST be served with
these headers or it dies on the boot screen ("SharedArrayBuffer ... missing").

The no-threads variant (`thread_support=false`, the embed-anywhere / Grafana-iframe
build) needs NO SharedArrayBuffer and runs fine with or without the headers — so
sending them is the SAFE DEFAULT for BOTH variants: threads builds require them,
no-threads builds ignore them. One server, both variants, no footgun.

Note on embedding: COOP/COEP make the top-level document isolated, but a page
that EMBEDS a threads build in an `<iframe>` must itself be cross-origin isolated
(the parent needs COEP too). Grafana does not serve itself with COEP, so a threads
build inside a Grafana iframe never gets SharedArrayBuffer and is dead on arrival
regardless of this server's headers — which is exactly why the shipped recipe uses
the no-threads variant for in-Grafana embeds. Measured evidence + the recipe:
`plugin-twin/library/findings/twin-web-ceiling-2026-07-10.md`.

Also sets the correct WASM/PCK MIME types (`.wasm` must be `application/wasm` or
the browser refuses streaming compilation) and `Cache-Control: no-store` so a dev
edit-export-reload loop never serves a stale build. Dependency-free: Python 3
standard library only (`http.server`), same runtime policy as `ifc_convert.py`.
This is a DEV/LOCAL server — bound to 127.0.0.1, no TLS, no range/production
hardening. For a hosted deployment behind https, serve the same headers from your
own web server / CDN and use `wss://` for the live relay (mixed-content rule).
"""

import argparse
import http.server
import os
import sys

# Godot web builds ship files the stdlib guesser gets wrong or leaves generic.
# `.wasm` in particular MUST be application/wasm or the browser rejects the
# streaming `WebAssembly.instantiateStreaming` path the Godot loader uses.
EXTRA_MIME_TYPES = {
    ".wasm": "application/wasm",
    ".pck": "application/octet-stream",
    ".js": "text/javascript",
}


class COIHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler + the two isolation headers, correct MIME, no cache."""

    # Applied on top of the stdlib defaults (later entries win).
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_MIME_TYPES}

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Dev server: never let a browser cache a build across a re-export.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the terminal readable: one concise line per request to stderr.
        sys.stderr.write("serve_coi: %s\n" % (fmt % args))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--dir", default=".", help="directory to serve (the Godot web build; default: cwd)"
    )
    ap.add_argument("--port", type=int, default=8070, help="TCP port (default: 8070)")
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        sys.exit(f"serve_coi: no such directory: {args.dir}")
    os.chdir(args.dir)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), COIHandler)
    print(
        f"serve_coi: COOP=same-origin COEP=require-corp on "
        f"http://127.0.0.1:{args.port}/  (serving {os.getcwd()})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nserve_coi: stopped", flush=True)


if __name__ == "__main__":
    main()
