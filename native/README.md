# Delirio nativo

The same C core the browser runs (`../src`), drawn with VimMon's 2D renderer
(`plugins/renderer2d`, SDL_GPU) instead of PixiJS. It is the base of the
desktop engine: what runs here is the game, with no browser in between.

```bash
./build.sh                 # needs VimMon at ~/proyectos/Proyect_K/VimMon (or VIMMON=...)
./build/delirio            # hold left click to walk to the cursor, Shift to run, Esc to quit
./build/delirio --semilla 7                         # same seed, same maze
./build/delirio --semilla 7 --captura /tmp/f.bmp 22000 --ir 0 -2600
                           # simulate 22 s walking north from the spawn, save the frame, exit
```

## What it shows

Ported from the web client so both look the same:

| Here | Browser |
|---|---|
| `vista_laberinto.c` — floor, plaza (grass to forest), walls, gates | `maze-renderer.ts`, `square.ts` |
| `personaje.c` — facing, turns, pivots, camera | `character.ts`, `facing.ts`, `camera.ts` |
| `hoja.c` — Aseprite sheet and animator | `sprite-sheet.ts`, `animator.ts` |
| `main.c` — frame loop and depth sorting | `main.ts`, `depth.ts` |

Not yet: enemies, HUD, day/night light, plaza decoration (tree, flowers,
bushes), abilities other than running, the see-through hole in walls.
