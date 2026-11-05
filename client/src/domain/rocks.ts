// Where the rocks go: big ones (solid, broken with a pickaxe) and pebbles
// (picked up with E), placed like they fell there. Fixed by the seed, cell by
// cell of the maze (src/mecanicas/laberinto.h), so a cell carved by a growth
// later gets the same rocks in every game with that seed.
//
// The patterns:
// - Outcrops: one or two big rocks against a corner of a corridor, never in
//   the middle (you can always walk around them), with pebbles scattered
//   around them. Those pebbles are the first stones, before the pickaxe.
// - Loose pebbles here and there in the corridors.
// - A few outcrops in the square too, away from the start, so the first
//   pickaxe can be made without leaving it.
// - Plenty of loose pebbles and fallen branches all over the square, and a
//   branch here and there in the corridors.

// Maze geometry, as in src/mecanicas/laberinto.h.
const TILE = 32; // LAB_TILE
const WALL = 3; // LAB_MURO
const CORRIDOR = 8; // LAB_PASILLO
const CELL = WALL + CORRIDOR; // LAB_CELDA
export const MAZE_CELLS = 50; // LAB_MAX_CELDAS
const SQUARE_FROM = MAZE_CELLS / 2 - 5; // the square: LAB_PLAZA cells in the middle
const SQUARE_TO = SQUARE_FROM + 9;

const OUTCROP_CHANCE = 0.2; // share of corridor cells with an outcrop
const LOOSE_CHANCE = 0.35; // share of corridor cells with a loose pebble or two
const SQUARE_OUTCROP_CHANCE = 0.22;
const SQUARE_CLEAR_CELLS = 2.5; // no rocks this close (in cells) to the middle of the square
const SQUARE_PEBBLES = [2, 5]; // loose pebbles per cell of the square (min, max)
const SQUARE_BRANCH_CHANCE = 0.7; // cells of the square with fallen branches...
const SQUARE_BRANCHES = [1, 2]; // ...this many
const CORRIDOR_BRANCH_CHANCE = 0.16; // corridor cells with a fallen branch
const START_CLEAR = 120; // px around the spawn (the middle of the square) with nothing
export const BRANCH_VARIANTS = 3; // frames of assets/ramas
export const ROCK_VARIANTS = 7; // frames of assets/rocas (art/rocas.py)
export const PEBBLE_VARIANTS = 6; // frames of assets/piedritas
export const MAX_ROCKS_PER_CELL = 4;

export interface BigRock {
  id: number; // stable: (cell index) * MAX_ROCKS_PER_CELL + k
  x: number; // feet (bottom center), world px
  y: number;
  variant: number;
}

export interface Pebble {
  x: number;
  y: number;
  variant: number;
}

export interface CellRocks {
  cell: number; // row * MAZE_CELLS + col
  // A floor tile of the cell: the rocks are placed once it is floor (carved)
  probe: { col: number; row: number };
  rocks: BigRock[];
  pebbles: Pebble[];
  branches: Pebble[]; // fallen branches (variant: frame of assets/ramas)
}

// Every cell's rocks for `seed`, whether the cell is carved yet or not.
export function planRocks(seed: number): CellRocks[] {
  const cells: CellRocks[] = [];
  for (let cy = 0; cy < MAZE_CELLS; cy++) {
    for (let cx = 0; cx < MAZE_CELLS; cx++) {
      const rng = random(seed, cx, cy);
      const cell = cy * MAZE_CELLS + cx;
      const inSquare = cx >= SQUARE_FROM && cx <= SQUARE_TO && cy >= SQUARE_FROM && cy <= SQUARE_TO;
      const plan: CellRocks = {
        cell,
        probe: { col: cx * CELL + WALL + CORRIDOR / 2, row: cy * CELL + WALL + CORRIDOR / 2 },
        rocks: [],
        pebbles: [],
        branches: [],
      };
      // Loose things anywhere on the cell's floor, off its walls
      const loose = (list: Pebble[], n: number, variants: number) => {
        for (let k = 0; k < n; k++) {
          const x = floorX(cx) + 20 + rng() * (CORRIDOR * TILE - 40);
          const y = floorY(cy) + 28 + rng() * (CORRIDOR * TILE - 40);
          if (inSquare && Math.hypot(x - squareMiddle, y - squareMiddle) < START_CLEAR) continue;
          list.push({ x: Math.round(x), y: Math.round(y), variant: Math.floor(rng() * variants) });
        }
      };
      const between = ([a, b]: number[]) => a + Math.floor(rng() * (b - a + 1));
      cells.push(plan);
      if (inSquare) {
        const middle = MAZE_CELLS / 2 - 0.5;
        loose(plan.pebbles, between(SQUARE_PEBBLES), PEBBLE_VARIANTS);
        if (rng() < SQUARE_BRANCH_CHANCE) loose(plan.branches, between(SQUARE_BRANCHES), BRANCH_VARIANTS);
        if (Math.hypot(cx - middle, cy - middle) < SQUARE_CLEAR_CELLS) continue;
        if (rng() < SQUARE_OUTCROP_CHANCE) outcrop(plan, cx, cy, rng, true);
        continue;
      }
      if (rng() < CORRIDOR_BRANCH_CHANCE) loose(plan.branches, 1, BRANCH_VARIANTS);
      if (rng() < OUTCROP_CHANCE) outcrop(plan, cx, cy, rng, false);
      else if (rng() < LOOSE_CHANCE) {
        const n = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          plan.pebbles.push({
            x: floorX(cx) + 24 + rng() * (CORRIDOR * TILE - 48),
            y: floorY(cy) + 24 + rng() * (CORRIDOR * TILE - 48),
            variant: Math.floor(rng() * PEBBLE_VARIANTS),
          });
        }
      }
    }
  }
  return cells;
}

// One or two big rocks in a corner of the cell's floor (in the open square,
// anywhere in it), and pebbles around them.
function outcrop(plan: CellRocks, cx: number, cy: number, rng: () => number, open: boolean): void {
  const size = CORRIDOR * TILE;
  const margin = 22; // from the walls to the rock's middle
  let ax: number;
  let ay: number;
  if (open) {
    ax = floorX(cx) + margin + rng() * (size - 2 * margin);
    ay = floorY(cy) + margin + rng() * (size - 2 * margin);
  } else {
    const right = rng() < 0.5;
    const down = rng() < 0.5;
    ax = floorX(cx) + (right ? size - margin : margin);
    ay = floorY(cy) + (down ? size - 6 : margin + 12);
  }
  const roll = rng();
  const count = roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3;
  for (let k = 0; k < count; k++) {
    // The second one beside the first, along the wall
    const towardMiddle = ax < floorX(cx) + size / 2 ? 1 : -1;
    // The third one tucked in front of the other two
    const third = k === 2;
    plan.rocks.push({
      id: plan.cell * MAX_ROCKS_PER_CELL + k,
      x: Math.round(ax + (third ? 15 : k * 30) * towardMiddle),
      y: Math.round(ay + (third ? (ay > floorY(cy) + size / 2 ? -18 : 18) : rng() * 10 - 5)),
      variant: Math.floor(rng() * ROCK_VARIANTS),
    });
  }
  const pebbles = 3 + Math.floor(rng() * 4);
  for (let k = 0; k < pebbles; k++) {
    const a = rng() * Math.PI * 2;
    const r = 34 + rng() * 40;
    const x = ax + Math.cos(a) * r;
    const y = ay + Math.sin(a) * r * 0.7;
    // Inside the cell's floor, off the walls
    if (x < floorX(cx) + 10 || x > floorX(cx) + size - 10 || y < floorY(cy) + 14 || y > floorY(cy) + size - 4) continue;
    plan.pebbles.push({ x: Math.round(x), y: Math.round(y), variant: Math.floor(rng() * PEBBLE_VARIANTS) });
  }
}

const floorX = (cx: number) => (cx * CELL + WALL) * TILE;
// The middle of the square, where the player starts (laberinto_aparicion).
const squareMiddle = ((SQUARE_FROM * CELL + WALL) * TILE + ((SQUARE_TO * CELL + WALL + CORRIDOR) * TILE)) / 2;
const floorY = (cy: number) => (cy * CELL + WALL) * TILE;

// The footprint of a big rock (its base, where the feet bump into it), from
// its frame width: a little narrower than the drawing and a few px deep.
export function rockBase(rock: BigRock, width: number): { x: number; y: number; w: number; h: number } {
  const w = Math.round(width * 0.8);
  return { x: rock.x - w / 2, y: rock.y - 12, w, h: 10 };
}

// Small seeded generator (mulberry32) for one cell.
export function random(seed: number, cx: number, cy: number): () => number {
  let a = (seed ^ Math.imul(cx + 1, 0x9e3779b1) ^ Math.imul(cy + 1, 0x85ebca6b)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
