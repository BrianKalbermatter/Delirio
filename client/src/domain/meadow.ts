// The square's meadow: Brian's flowers (Flores clumps and tall Flores2),
// small flowers growing low under them (art/florcitas.py) and tall grass
// (his Gramilla) all over the square, never out in the maze (other plants go
// there). Placed like they grew there: in patches that come and go with a
// smooth noise, with clearings between them, not too full and not bare.
// The square is the same in every game, so the meadow is too.
import type { Square } from "./square";

export interface Plant {
  x: number; // foot, world px
  y: number;
  kind: number; // which drawing (see below)
}

export interface Meadow {
  flowers: Plant[]; // kind: 0 clump (Flores), 1 tall (Flores2)
  grass: Plant[]; // kind: 0 Gramilla, 1 its small version
  smallFlowers: Plant[]; // kind: frame of florcitas
}

const SMALL_FLOWER_KINDS = 9; // frames of sprites/florcitas
// Candidate spacing (px) and how much of each patch gets one, at full noise.
const GRASS_STEP = 52;
const GRASS_FILL = 0.6;
const FLOWER_STEP = 104;
const FLOWER_FILL = 0.5;
const SMALL_STEP = 34;
const SMALL_FILL = 0.5;
const PATCH_SIZE = 420; // px: how big the patches and clearings are
const START_CLEAR = 110; // px around the spawn with nothing (the start items)
const KEEP_OFF = 26; // px from items and rocks lying there
const FOREST_MARGIN = 40; // px: none in the forest corner, nor right at its edge

export function placeMeadow(
  square: Square,
  tileSize: number,
  spawn: { x: number; y: number },
  keepOff: { x: number; y: number }[],
  halfSize = 1900, // px around the spawn to look for the square's floor
): Meadow {
  const rng = random(0x5eed);
  const free = (x: number, y: number) => {
    if (!square.has(Math.floor(x / tileSize), Math.floor((y - 4) / tileSize))) return false;
    if (!square.has(Math.floor(x / tileSize), Math.floor((y - 20) / tileSize))) return false; // not against a wall
    if (square.inForest(x, y, FOREST_MARGIN)) return false;
    if (Math.hypot(x - spawn.x, y - spawn.y) < START_CLEAR) return false;
    return keepOff.every((p) => Math.hypot(p.x - x, p.y - y) >= KEEP_OFF);
  };
  // Each kind of plant follows its own patches, so flowers and grass mix
  // here and there but do not all pile up in the same spots.
  const scatter = (step: number, fill: number, salt: number, threshold: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = spawn.y - halfSize; y < spawn.y + halfSize; y += step) {
      for (let x = spawn.x - halfSize; x < spawn.x + halfSize; x += step) {
        const px = Math.round(x + (rng() - 0.5) * step * 0.9);
        const py = Math.round(y + (rng() - 0.5) * step * 0.9);
        const patch = noise(px / PATCH_SIZE + salt, py / PATCH_SIZE - salt);
        const p = Math.max(0, (patch - threshold) / (1 - threshold)) * fill;
        if (rng() < p && free(px, py)) out.push({ x: px, y: py });
      }
    }
    return out;
  };
  const grass = scatter(GRASS_STEP, GRASS_FILL, 0, 0.32).map((p) => ({ ...p, kind: rng() < 0.6 ? 0 : 1 }));
  const flowers = scatter(FLOWER_STEP, FLOWER_FILL, 17.3, 0.36).map((p) => ({ ...p, kind: rng() < 0.55 ? 0 : 1 }));
  // The small ones grow mostly where the big flowers are
  const smallFlowers = scatter(SMALL_STEP, SMALL_FILL, 17.3, 0.4).map((p) => ({
    ...p,
    kind: Math.floor(rng() * SMALL_FLOWER_KINDS),
  }));
  return { flowers, grass, smallFlowers };
}

// Smooth value noise in 0..1.
function noise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = smooth(x - x0);
  const sy = smooth(y - y0);
  const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
  const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
