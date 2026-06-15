# Engines — Godot, Redot, Blazium

Xenodot Forge is built to be **as engine-agnostic as it can cheaply be**. Today
that means the **Godot family**: stock Godot and its source-compatible forks,
**Redot** and **Blazium**. Pick one, point the framework at its binary, and the
whole pipeline — designer interview, `godot-dev` build, `godot-verify` gate, the
web UI — runs unchanged.

## Why the forks are drop-in

Redot and Blazium are _forks_ of Godot, not separate engines. They deliberately
preserve compatibility:

- Same project file — `project.godot`.
- Same scene/resource formats — `.tscn`, `.tres`.
- Same scripting — GDScript. `gdformat` / `gdlint` (gdtoolkit) are engine-independent.
- Same headless CLI — `--headless --path --import --check-only --script --quit-after`.
- Blazium keeps GDExtension and Godot-4.3 project compatibility; Redot tracks
  upstream Godot/GDScript.

So there is **nothing to port**. The only thing that changes between them is which
binary the verify gate runs.

## Pointing at a fork

There are two seams, and both default to Godot:

1. **Framework detection** (the web UI / setup) — keys on the project marker file.
2. **The verify gate** (`tools/validate.sh`, the `godot-verify` skill) — runs the
   engine binary through the `$GODOT` convention.

### Option A — configure it once (`.xenodot.json`)

`npm run setup` writes `.xenodot.json` (gitignored, in the framework root). Add an
`engine` block beside the saved `projectDir`:

```json
{
  "projectDir": "/absolute/path/to/game",
  "engine": {
    "name": "redot",
    "projectFile": "project.godot",
    "bin": "/Applications/Redot.app/Contents/MacOS/Redot"
  }
}
```

- `name` — display label only (`Redot project found`, UI empty-state). Default `godot`.
- `projectFile` — the on-disk marker used to detect a project. Default
  `project.godot` (which the forks also use, so you rarely change it).
- `bin` — the engine executable. When set, the server exports it as `$GODOT` into
  the Claude Code session it spawns, so `validate.sh` and every `$GODOT` call use
  the fork automatically — no per-shell setup. Omit it to let `validate.sh` resolve
  the binary itself (see below).

`npm run setup` preserves an existing `engine` block when you re-save the path.

### Option B — environment variables (one-off)

Every field has an env override (highest priority):

```bash
ENGINE_NAME=blazium ENGINE_BIN=/path/to/Blazium npm start
# or just point the verify gate at a fork for a single run:
GODOT=/path/to/Blazium tools/validate.sh
```

### How `tools/validate.sh` finds the binary

When `$GODOT` isn't already set, the gate resolves in order:

1. `$GODOT` (explicit override — what the server sets from `engine.bin`)
2. a binary on `PATH`: `godot`, then `redot`, then `blazium`
3. common install paths (the macOS `.app` bundles, `/usr/local/bin`, `/usr/bin`)
4. otherwise it fails with a clear "set `GODOT=/path/to/your/engine`" message

This is also what makes the gate work on Linux/Windows, where the old hardcoded
macOS path didn't exist.

## Compatibility notes

- **Version string.** `config/features` in `project.godot` may read a different
  version on a fork. The framework parses `config/name` for the project label and
  doesn't gate on the version, so this is cosmetic.
- **Feature parity drift.** Forks track Godot 4.x but can lag or lead by a point
  release. If a skill uses a brand-new Godot 4.x API, confirm the fork shipped it.
- **GDExtension.** Native extensions are Blazium-compatible; rebuild per engine if
  you ship any (none in the POC).

## Future — non-fork engines

True cross-engine support (Unity, Unreal, Bevy — different language, scene format,
and CLI) is **out of scope** and not built. If it's ever pursued, the seam is
already named:

- **`ENGINE` config** (`ui/server/config.js`) — project detection + the engine
  identity the framework reads.
- **The `$GODOT` invocation convention** (`tools/validate.sh`, `godot-verify`) —
  every place the framework actually drives the engine.

A real `EngineAdapter` would implement those two surfaces per engine (binary
resolution, project marker, and a verify hook), plus an engine-specific skill pack
to replace the `godot-*` skills. The Godot-family path above is the first — and,
for now, only — adapter.
