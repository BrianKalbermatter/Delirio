// Where the trees grow: only inside the square, never out in the corridors.
// Common trees are scattered across it, keeping the middle (the spawn), the
// gates and the items clear; only a few of them are broken trees, spread far
// apart. Its top-right corner is a dark forest of giant trees packed close
// together. The choice depends only on the square, which is the same in every
// game, so the trees are always the same too.
//
// Every trunk is solid: trunkBox gives the box the player's feet bump into.
import { openSpots } from "./level-items";
import type { Square } from "./square";
import type { TileMap } from "./tile-map";

// Sprite sheets in public/sprites, one per kind of tree.
export const COMMON_TREES = ["arbol_redondo", "arbol_grande", "arbol_deforme", "arbol_joven", "arbol_viejo"];
export const BROKEN_TREE = "arbol_roto";
export const FOREST_TREES = ["bosque_ancho", "bosque_torcido", "bosque_alto"];
export const TREE_SPRITES = [...COMMON_TREES, BROKEN_TREE, ...FOREST_TREES];

// A tree with its trunk base at (x, y).
export interface Tree {
  sprite: string;
  x: number;
  y: number;
  forest: boolean; // one of the giants of the dark forest
}

// Trunk base of each kind, in world px (as drawn: design width x export scale)
// and how far its middle sits from the frame's centre line.
const TRUNKS: Record<string, { width: number; offsetX: number }> = {
  arbol_redondo: { width: 22, offsetX: 0 },
  arbol_grande: { width: 30, offsetX: 0 },
  arbol_deforme: { width: 20, offsetX: -10 },
  arbol_roto: { width: 30, offsetX: -5 },
  arbol_joven: { width: 12, offsetX: 0 },
  arbol_viejo: { width: 32, offsetX: 2 },
  bosque_ancho: { width: 66, offsetX: 0 },
  bosque_torcido: { width: 57, offsetX: -12 },
  bosque_alto: { width: 54, offsetX: 3 },
};
const SOLID_SHARE = 0.7; // the solid box is a bit narrower than the drawn trunk
const SOLID_DEPTH = 0.45; // box depth (north-south) as a share of its width
const BROKEN_COUNT = 5; // broken trees in the whole square

const SPAWN_CLEARANCE = 192; // px: the middle of the square stays clear
const GATE_CLEARANCE = 4; // tiles: the way to each gate stays clear
const ITEM_CLEARANCE = 40; // px: never on top of an item
const TREE_SPACING = 250; // px between two common trees
const PLANT_CHANCE = 35; // % of the free spots that get a common tree
const FOREST_SPACING = 132; // px between two forest trees: crowns still overlap, room to walk and build
const FOREST_CHANCE = 75; // % of the free forest spots that get a tree
const FOREST_EDGE = 96; // px around the forest without common trees

export function placeTrees(
  map: TileMap,
  square: Square,
  spawn: { x: number; y: number },
  items: { x: number; y: number }[],
): Tree[] {
  const t = map.tileSize;
  const forest: Tree[] = [];
  const common: Tree[] = [];
  const clearOf = (x: number, y: number, others: { x: number; y: number }[], gap: number) =>
    others.every((o) => Math.hypot(o.x - x, o.y - y) >= gap);

  for (const spot of openSpots(map, spawn)) {
    const col = Math.floor(spot.x / t);
    const row = Math.floor(spot.y / t);
    if (!square.has(col, row)) continue;
    if (spot.distance < SPAWN_CLEARANCE) continue;
    if (nearGate(map, col, row)) continue;
    if (!clearOf(spot.x, spot.y, items, ITEM_CLEARANCE)) continue;
    const roll = hash(col, row) % 100;
    if (square.inForest(spot.x, spot.y)) {
      if (roll < FOREST_CHANCE && clearOf(spot.x, spot.y, forest, FOREST_SPACING)) {
        forest.push({ sprite: "", x: spot.x, y: spot.y, forest: true });
      }
    } else if (!square.inForest(spot.x, spot.y, FOREST_EDGE)) {
      if (roll < PLANT_CHANCE && clearOf(spot.x, spot.y, common, TREE_SPACING)) {
        common.push({ sprite: "", x: spot.x, y: spot.y, forest: false });
      }
    }
  }
  const broken = spreadOut(common, BROKEN_COUNT);
  for (const tree of broken) tree.sprite = BROKEN_TREE;
  assignKinds(common.filter((tree) => !broken.includes(tree)), COMMON_TREES);
  assignKinds(forest, FOREST_TREES);
  return [...common, ...forest];
}

// The solid box of a trunk on the floor, in world px. It sits mostly behind
// the trunk base, so a player walking south of a tree stays in front of it.
export function trunkBox(tree: Tree): { x: number; y: number; w: number; h: number } {
  const trunk = TRUNKS[tree.sprite];
  const w = trunk.width * SOLID_SHARE;
  const h = w * SOLID_DEPTH;
  return { x: tree.x + trunk.offsetX - w / 2, y: tree.y - h * 0.75, w, h };
}

// `count` trees as far from each other as possible: each next one is the tree
// furthest from all those already picked.
function spreadOut(trees: Tree[], count: number): Tree[] {
  if (trees.length === 0) return [];
  const picked = [trees.reduce((a, b) => (hash(a.x, a.y) < hash(b.x, b.y) ? a : b))];
  while (picked.length < Math.min(count, trees.length)) {
    let best = trees[0];
    let bestGap = -1;
    for (const tree of trees) {
      const gap = Math.min(...picked.map((p) => Math.hypot(p.x - tree.x, p.y - tree.y)));
      if (gap > bestGap) {
        best = tree;
        bestGap = gap;
      }
    }
    picked.push(best);
  }
  return picked;
}

// Kinds handed out in turns over a shuffled order, so all of them show up
// in about equal numbers and mixed together.
function assignKinds(trees: Tree[], kinds: string[]): Tree[] {
  trees.sort((a, b) => hash(a.x, a.y) - hash(b.x, b.y));
  trees.forEach((tree, i) => (tree.sprite = kinds[i % kinds.length]));
  return trees;
}

function nearGate(map: TileMap, col: number, row: number): boolean {
  for (let r = row - GATE_CLEARANCE; r <= row + GATE_CLEARANCE; r++) {
    for (let c = col - GATE_CLEARANCE; c <= col + GATE_CLEARANCE; c++) {
      if (map.isDoor(c, r)) return true;
    }
  }
  return false;
}

// Deterministic hash (same one the maze renderer uses for tiles).
function hash(col: number, row: number): number {
  let h = Math.imul(col, 73856093) ^ Math.imul(row, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
