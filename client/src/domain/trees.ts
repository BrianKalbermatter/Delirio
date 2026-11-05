// The trees of the square (Arbol2 and Arbol3), placed like they grew there:
// groves that come and go with a smooth noise, loners in the clearings between
// them and a thicker wood in the forest corner, half of each species, mixed all
// over. Some have stones and tufts of grass at the foot, and saplings of their
// species growing nearby. The square is the same in every
// game, so the trees are too, and they stay put across reloads: what they keep
// off must not change as the game goes on.
import { noise, random } from "./meadow";
import type { Square } from "./square";

// Which drawing, in the order the renderer gets them.
export const SPECIES = { green: 0, orange: 1 } as const;

// A stone or a tuft of grass at the foot of a tree.
export interface FootPiece {
  x: number; // where it stands, world px
  y: number;
  kind: number; // frame of arbol_3_pie
}

export interface Tree {
  x: number; // centre of the trunk's foot, world px
  y: number;
  scale: number; // of the drawing
  species: number; // SPECIES
  foot: FootPiece[]; // none in most trees
}

export interface Sapling {
  x: number; // foot, world px
  y: number;
  species: number; // SPECIES, also its frame in assets/retonos
}

export const STONE_KINDS = 3; // frames of arbol_3_pie: stones first...
export const TUFT_KINDS = 5; // ...then tufts

const SCALE = 1.5;
const SCALE_SPREAD = 0.2; // each one is up to this much smaller or bigger
const STEP = 120; // candidate spacing (px)
const GROVE_SIZE = 620; // px: how big the groves and clearings are
const GROVE_THRESHOLD = 0.4; // noise above this is a grove
const GROVE_FILL = 1; // how much of the middle of a grove gets a tree
const LONER_FILL = 0.3; // the same in the clearings
const FOREST_FILL = 0.9; // the same in the forest corner
const MIN_GAP = 100; // px between two trees: their crowns may just touch
const WALL_CLEAR = 88; // px of floor all around: off the walls and the gates
const START_CLEAR = 260; // px around the spawn with nothing (the start items)
const KEEP_OFF = 96; // px from rocks and bushes: a bush is about that wide to each side
const FOOT_CHANCE = 0.35; // trees with stones and grass at the foot
const STONES = [1, 3]; // how many (min, max)
const TUFTS = [2, 4];
const FOOT_REACH = [14, 34]; // px from the foot, at scale 1 (min, max)
const SAPLING_CHANCE = 0.3; // trees with a sapling nearby
const SAPLING_REACH = [46, 84]; // px from the foot (min, max)
// Px of the trunk's foot that block the way at scale 1, by species.
const TRUNK = [
  { width: 13, depth: 6 },
  { width: 8, depth: 4 },
];

// `first` is a tree that is there no matter what, with its branches around it.
export function placeTrees(
  square: Square,
  tileSize: number,
  spawn: { x: number; y: number },
  first: { x: number; y: number },
  keepOff: { x: number; y: number }[],
  halfSize = 1900, // px around the spawn to look for the square's floor
): Tree[] {
  const rng = random(0x7ee5);
  const trees: Tree[] = [{ x: first.x, y: first.y, scale: SCALE, species: SPECIES.green, foot: [] }];
  const floor = (x: number, y: number) => square.has(Math.floor(x / tileSize), Math.floor(y / tileSize));
  const free = (x: number, y: number) => {
    for (let a = 0; a < 8; a++) {
      const angle = (a * Math.PI) / 4;
      if (!floor(x + Math.cos(angle) * WALL_CLEAR, y + Math.sin(angle) * WALL_CLEAR)) return false;
    }
    if (Math.hypot(x - spawn.x, y - spawn.y) < START_CLEAR) return false;
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < MIN_GAP)) return false;
    return keepOff.every((p) => Math.hypot(p.x - x, p.y - y) >= KEEP_OFF);
  };
  for (let y = spawn.y - halfSize; y < spawn.y + halfSize; y += STEP) {
    for (let x = spawn.x - halfSize; x < spawn.x + halfSize; x += STEP) {
      const px = Math.round(x + (rng() - 0.5) * STEP);
      const py = Math.round(y + (rng() - 0.5) * STEP);
      const scale = SCALE + (rng() * 2 - 1) * SCALE_SPREAD;
      const grove = (noise(px / GROVE_SIZE + 5.1, py / GROVE_SIZE - 5.1) - GROVE_THRESHOLD) / (1 - GROVE_THRESHOLD);
      const fill = square.inForest(px, py) ? FOREST_FILL : Math.max(LONER_FILL, grove * GROVE_FILL);
      if (rng() < fill && free(px, py)) trees.push({ x: px, y: py, scale, species: SPECIES.green, foot: [] });
    }
  }
  const footRng = random(0xf007);
  // Taking turns in a shuffled order: as many of each, and no pattern in them.
  // The first one is green already, so the next is orange.
  const rest = trees.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(footRng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  rest.forEach((tree, i) => (tree.species = i % 2 === 0 ? SPECIES.orange : SPECIES.green));
  for (const tree of trees) if (footRng() < FOOT_CHANCE) tree.foot = placeFoot(tree, footRng);
  return trees;
}

// Saplings to pick up, each near a tree of its species. The walls keep off:
// the trees are WALL_CLEAR from them.
export function placeSaplings(trees: Tree[]): Sapling[] {
  const rng = random(0x5a91);
  const saplings: Sapling[] = [];
  for (const tree of trees) {
    if (rng() >= SAPLING_CHANCE) continue;
    const angle = rng() * Math.PI * 2;
    const reach = SAPLING_REACH[0] + rng() * (SAPLING_REACH[1] - SAPLING_REACH[0]);
    saplings.push({
      x: Math.round(tree.x + Math.cos(angle) * reach),
      y: Math.round(tree.y + Math.sin(angle) * reach * 0.6),
      species: tree.species,
    });
  }
  return saplings;
}

// A few stones and tufts around the foot, flattened like the ground.
export function placeFoot(tree: { x: number; y: number; scale: number }, rng: () => number): FootPiece[] {
  const between = ([a, b]: number[]) => a + Math.floor(rng() * (b - a + 1));
  const piece = (kind: number): FootPiece => {
    const angle = rng() * Math.PI * 2;
    const reach = (FOOT_REACH[0] + rng() * (FOOT_REACH[1] - FOOT_REACH[0])) * tree.scale;
    return {
      x: Math.round(tree.x + Math.cos(angle) * reach),
      y: Math.round(tree.y + Math.sin(angle) * reach * 0.5),
      kind,
    };
  };
  return [
    ...Array.from({ length: between(TUFTS) }, () => piece(STONE_KINDS + Math.floor(rng() * TUFT_KINDS))),
    ...Array.from({ length: between(STONES) }, () => piece(Math.floor(rng() * STONE_KINDS))),
  ];
}

// The part of the trunk the player's feet bump into.
export function trunkBox(tree: Tree): { x: number; y: number; w: number; h: number } {
  const w = TRUNK[tree.species].width * tree.scale;
  const h = TRUNK[tree.species].depth * tree.scale;
  return { x: tree.x - w / 2, y: tree.y - h, w, h };
}
