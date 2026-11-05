// The old stumps of the square (art/tocones.py): scattered all over it, none
// drawn like another, and overgrown as if they had been there for years, with
// stones, tufts, tall grass and bushes around the foot. Fixed by the seed.
// The trees are placed after them and keep off.
import { random } from "./meadow";
import type { Square } from "./square";
import { type FootPiece, placeFoot } from "./trees";

export interface Growth {
  x: number; // foot, world px
  y: number;
  kind: number; // which drawing
  scale: number;
}

export interface Stump {
  x: number; // foot, world px
  y: number;
  kind: number; // 0..KINDS-1: which stump
  age: number; // 0..AGES-1: how overgrown
  flipped: boolean; // mirrored
  scale: number;
  foot: FootPiece[]; // stones and tufts
  grass: Growth[]; // tall grass, kind 0 Gramilla, 1 its small version
  bushes: Growth[]; // round bushes, kind: frame of the sheet
}

export const KINDS = 3;
const AGES = 3;
const COUNT = 14; // no more than the looks there are: KINDS * AGES * 2 sides
const SCALE = 1.5;
const SCALE_SPREAD = 0.2;
const STEP = 96; // candidate spacing (px)
const GAP = 560; // px between two stumps: scattered, never a cluster
const START_CLEAR = 420; // px around the spawn
const CLEAR_TILES = 3; // tiles of the square's floor all around
const KEEP_OFF = 150; // px from rocks, bushes and items
const FOOT_LAYERS = [1, 2, 3]; // by age: how many rounds of stones and tufts
const GRASS = [2, 4, 7]; // by age: how many tall grasses
const GRASS_REACH = [30, 84]; // px from the foot (min, max)
// By age: has a bush grown beside it. None until the new bushes are in:
// [0.35, 0.6, 0.9] brings them back.
const BUSH_CHANCE = [0, 0, 0];
const SECOND_BUSH_CHANCE = 0.35; // and another one
const BUSH_FRAMES = 3; // the round ones (render/bushes.ts)
const BUSH_SCALE = [0.55, 0.8];
const BUSH_SIDE = 46; // px to a side of the stump...
const BUSH_BACK = 12; // ...and behind it

export function placeStumps(
  seed: number,
  square: Square,
  tileSize: number,
  spawn: { x: number; y: number },
  keepOff: { x: number; y: number }[],
  halfSize = 1900, // px around the spawn to look for the square's floor
): Stump[] {
  const rng = random(seed ^ 0x570a9);
  const floor = (x: number, y: number) => {
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    for (let r = row - CLEAR_TILES; r <= row + CLEAR_TILES; r++) {
      for (let c = col - CLEAR_TILES; c <= col + CLEAR_TILES; c++) {
        if (!square.has(c, r)) return false;
      }
    }
    return true;
  };

  // Every spot in a random order: the first ones take the square far and wide.
  const spots: { x: number; y: number }[] = [];
  for (let y = spawn.y - halfSize; y < spawn.y + halfSize; y += STEP) {
    for (let x = spawn.x - halfSize; x < spawn.x + halfSize; x += STEP) {
      spots.push({ x: Math.round(x + (rng() - 0.5) * STEP), y: Math.round(y + (rng() - 0.5) * STEP) });
    }
  }
  shuffle(spots, rng);
  const looks = shuffle(
    Array.from({ length: KINDS * AGES * 2 }, (_, i) => ({
      kind: i % KINDS,
      age: Math.floor(i / KINDS) % AGES,
      flipped: i >= KINDS * AGES,
    })),
    rng,
  );

  const stumps: Stump[] = [];
  for (const { x, y } of spots) {
    if (stumps.length === COUNT) break;
    if (Math.hypot(x - spawn.x, y - spawn.y) < START_CLEAR || !floor(x, y)) continue;
    if (stumps.some((s) => Math.hypot(s.x - x, s.y - y) < GAP)) continue;
    if (keepOff.some((p) => Math.hypot(p.x - x, p.y - y) < KEEP_OFF)) continue;
    stumps.push(overgrown(x, y, looks[stumps.length], floor, rng));
  }
  return stumps;
}

function overgrown(
  x: number,
  y: number,
  look: { kind: number; age: number; flipped: boolean },
  floor: (x: number, y: number) => boolean,
  rng: () => number,
): Stump {
  const scale = SCALE + (rng() * 2 - 1) * SCALE_SPREAD;
  const foot = Array.from({ length: FOOT_LAYERS[look.age] }, () => placeFoot({ x, y, scale }, rng)).flat();
  const grass = Array.from({ length: GRASS[look.age] }, () => {
    const angle = rng() * Math.PI * 2;
    const reach = GRASS_REACH[0] + rng() * (GRASS_REACH[1] - GRASS_REACH[0]);
    return {
      x: Math.round(x + Math.cos(angle) * reach),
      y: Math.round(y + Math.sin(angle) * reach * 0.6),
      kind: rng() < 0.6 ? 0 : 1,
      scale: 1,
    };
  });
  const bushes: Growth[] = [];
  const side = rng() < 0.5 ? -1 : 1;
  const bush = (towards: number) => {
    const bx = x + towards * BUSH_SIDE;
    if (!floor(x + towards * BUSH_SIDE * 2, y)) return; // it reaches further than the stump
    bushes.push({
      x: Math.round(bx),
      y: Math.round(y - BUSH_BACK),
      kind: Math.floor(rng() * BUSH_FRAMES),
      scale: BUSH_SCALE[0] + rng() * (BUSH_SCALE[1] - BUSH_SCALE[0]),
    });
  };
  if (rng() < BUSH_CHANCE[look.age]) {
    bush(side);
    if (rng() < SECOND_BUSH_CHANCE) bush(-side);
  }
  return { x, y, ...look, scale, foot, grass, bushes };
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const ROOTS = 8; // px from the bottom of the roots to the trunk
// The part of the stump the feet bump into, by kind: the trunk, not the roots.
const TRUNK = [
  { width: 24, depth: 8 },
  { width: 20, depth: 8 },
  { width: 34, depth: 8 },
];

export function stumpBox(stump: Stump): { x: number; y: number; w: number; h: number } {
  const w = TRUNK[stump.kind].width * stump.scale;
  const h = TRUNK[stump.kind].depth * stump.scale;
  return { x: stump.x - w / 2, y: stump.y - h - ROOTS, w, h };
}
