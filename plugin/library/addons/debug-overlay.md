# Debug Overlay / In-Game Playtest HUD

**Request** — Playtester needs live readouts (FPS, player pos/vel, enemy FSM states, wave counts, trap-floor events) as on-screen overlay to report bugs accurately.
**Verdict** — rejected — build it ourselves

**Candidates**
| Addon | Source | License | Godot | Language | Last activity | Notes |
|---|---|---|---|---|---|---|
| godot-debug-menu | [github](https://github.com/godot-extended-libraries/godot-debug-menu) | MIT | 4.x | GDScript | Dec 2023 (v1.2.0) | FPS/frametime/GPU graphs only; adds `DebugMenu` autoload; F3 toggle; 4.3 FPS discrepancy w/ MT rendering (cosmetic); no 4.6 breakage |
| PankuConsole | [github](https://github.com/Ark2000/PankuConsole) | MIT | 4.x | GDScript | Jul 2024 (v1.7.9) | REPL + log overlay + draggable windows; <256 KB; adds autoload; 1.4k stars; active |

**Why** — Neither addon surfaces enemy FSM states, WaveManager wave/spawn counts, or trap-floor events — custom wiring required regardless. godot-debug-menu is FPS-metrics only. PankuConsole adds REPL/windowing complexity unneeded for a playtest HUD. Conventions favor lightweight game-local solutions with no stray autoloads; ~50-line CanvasLayer + RichTextLabel + ring buffer covers every required readout, zero external deps, zero convention violations.

**Install** — n/a (build it ourselves)

**Later** — PankuConsole: revisit if runtime expression evaluator useful for balance tweaks. godot-debug-menu: layer on top of custom overlay if GPU profiling needed.
