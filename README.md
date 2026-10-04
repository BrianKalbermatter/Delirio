# Delirio

Survival game in a maze that grows, inspired by *Maze Runner*. Top-down pixel
art in the browser. Design notes: [`concept/Mecanicas.md`](concept/Mecanicas.md).

The game logic is a **C core**, compiled to WebAssembly. The browser client
(TypeScript) only sends the player's input to C, reads the state back and draws
it.

```
browser (client/)                         C core (src/)
  mouse / keys  ──── web.c (bridge) ────►  main.c: the caller
  draws state   ◄───────────────────────   └─ mecanicas/: one file per mechanic
```

## Getting started (fresh clone)

Requirements: [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
(`emcc`), Node.js + npm and a C compiler. On Arch, Debian/Ubuntu or Fedora
(including WSL2) the installer sets them up; it only needs Go and git:

```bash
cd installer && go run .          # add -dry-run to only print the commands
```

Then:

```bash
cd client
npm install
npm run dev                       # http://localhost:5173
```

`npm run dev` compiles the C core on start and **again every time a `.c` or
`.h` file under `src/` is saved**; the page reloads by itself and C compile
errors show up on screen. Generated files (`game.js`, `game.wasm`,
`node_modules/`, `src/main`) are not versioned.

To run the C core without the browser: `./src/build-native.sh && ./src/main`.

## Layout

```
src/                     C core (the game logic)
  main.c                 the caller: holds the game state, calls each mechanic every step
  juego.h                what main.c offers to the outside (used by web.c)
  web.c                  bridge to the browser: juego_* -> web_*, no logic
  entidad.h / entidad.c  shared types: Entity, Direccion, Estado, Items
  mecanicas/
    mecanica.c           the clock: day / dusk / night, gates timing, maze growth
    laberinto.c          the maze: generation (DFS), growth, gates, collisions
    jugador.c            main characters: abilities, movement, death
    movimiento_mouse.c   walk towards the clicked point
    combate.c            attacks
    ia_enemigos.c        enemy AI, level 1
    movimiento_teclado.c WASD movement (not used: movement is mouse only)
  build-web.sh           every .c under src/ -> client/.../generated/game.{js,wasm}
  build-native.sh        every .c except web.c -> ./src/main
  personaje.c            old draft, excluded from both builds

client/                  browser client (TypeScript + Vite, 2D canvas)
  src/domain/            client-side model: facing/turning, items, inventory, tile grid
  src/infrastructure/
    wasm/                adapter over the C core (game-wasm.ts)
    render/              maze, sprites, light, glow, cursor, ability effects
    input/               locked mouse (Pointer Lock) and ability keys
    ui/                  side panel: inventory, abilities, C debug, pause menu, map book
  public/                sprites and tiles served to the browser
  vite.config.ts         rebuilds the C core when src/ changes

art/                     generators of the procedural art (Python + Pillow)
concept/                 game design notes
server/, gateway/, protocol/, installer/   multiplayer skeleton and setup (not used yet)
```

## Controls

| Input | Action |
|---|---|
| Left click (hold) | Walk to the pointer |
| Right click (hold) | Block |
| Q W E R | Light / quick / long / critical attack |
| A · Space · D | Support · parry · ultimate |
| S | Roll |
| Shift (hold) | Run |
| `` ` `` (or M) | Map book: left click draws, right click erases (pick it up in the square first) |
| 1-9 or click a slot | Select inventory slot |
| Esc | Release the mouse and open the menu |

The mouse is locked inside the window while playing (Pointer Lock); the
browser always releases it with Esc.

## Testing aids

| Where | What |
|---|---|
| `TIEMPO_DE_PRUEBA` in `src/mecanicas/mecanica.h` | `1`: 10 s days and 10 s nights. `0`: real times (34 min day, 26 min night) |
| `F` | Clock speed x1 / x60 / x600 (only the clock, not the movement) |
| `G` | Jump to just before the gates close, standing in front of the top gate |
| `T` | Reset the test medusa |
| Side panel "C core" | Live values coming out of C (position, clock, gates, deaths, seed) |

## Art

Sprites are drawn in Aseprite; their sources live outside the repo. The maze
tiles and the book are generated:

```bash
python3 art/maze_tiles.py client/public/assets
python3 art/libro.py client/public/assets
```
