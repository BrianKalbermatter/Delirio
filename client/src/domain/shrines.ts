// The shrines: the book's in the middle of the square, by the spawn, and the
// others one to a slice of the maze around it. Fixed by the seed. An awake one
// is a stop on the way: from any of them you go on to the next.
import { random } from "./rocks";
import type { TileMap } from "./tile-map";

export const SHRINE_KINDS = 10; // frames of sprites/santuarios, the book's first
export const SHRINE_NAMES = [
  "Shrine of the Book",
  "Serpent Stone",
  "Grinning Totem",
  "Golden Idol",
  "Crystal of Roots",
  "Star of Branches",
  "Pale Mushroom",
  "Burning Mask",
  "Hollow Tree",
  "Thorn Bloom",
];
const ABOVE_SPAWN = 72; // px from the spawn to the book's shrine
const NEAR = 1950; // px from the middle, along the longest side: past the square...
const FAR = 3500; // ...and within the first maze, carved from the start
const BONFIRE_CLEAR = 220; // px around a bonfire
const FIRST_BONFIRES = 12; // RONDAS_LABERINTO: the later ones must not move a shrine in a save
const TRIES = 400;

export interface Shrine {
  id: number; // also its frame
  x: number; // feet
  y: number;
}

export function planShrines(seed: number, map: TileMap, spawn: { x: number; y: number }, bonfires: { x: number; y: number }[]): Shrine[] {
  const shrines: Shrine[] = [{ id: 0, x: spawn.x, y: spawn.y - ABOVE_SPAWN }];
  const fires = bonfires.slice(0, FIRST_BONFIRES);
  const slices = SHRINE_KINDS - 1;
  for (let id = 1; id <= slices; id++) {
    const rng = random(seed ^ 0x2545f491, id, 0);
    for (let t = 0; t < TRIES; t++) {
      const angle = ((id - 1 + rng()) / slices) * 2 * Math.PI;
      const side = Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const reach = (NEAR + rng() * (FAR - NEAR)) / side;
      const x = spawn.x + Math.cos(angle) * reach;
      const y = spawn.y + Math.sin(angle) * reach;
      if (!clear(map, x, y) || fires.some((f) => Math.hypot(f.x - x, f.y - y) < BONFIRE_CLEAR)) continue;
      shrines.push({ id, x: Math.round(x), y: Math.round(y) });
      break;
    }
  }
  return shrines;
}

// Floor all around, with room to walk past it.
function clear(map: TileMap, x: number, y: number): boolean {
  const col = Math.floor(x / map.tileSize);
  const row = Math.floor(y / map.tileSize);
  for (let r = row - 2; r <= row + 2; r++) {
    for (let c = col - 2; c <= col + 2; c++) {
      if (map.isWall(c, r) || map.isLava(c, r) || map.isDoor(c, r) || map.isPit(c, r) || map.zoneWeight(c, r) >= 0.99) return false;
    }
  }
  return true;
}
