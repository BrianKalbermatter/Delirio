// The big tree in the square (Brian's Arbol1), to try the meadow style in
// game before making more. It stands to the right of the spawn, with a solid
// trunk, a few loose sticks on the ground around it and Brian's flowers
// growing around its foot.

export interface SampleTree {
  x: number; // centre of the trunk's foot, world px
  y: number;
  sticks: Stick[];
  flowers: Decor[];
  branches: Decor[]; // fallen branches to pick up with E
}

// Something standing at (x, y), its foot, world px.
export interface Decor {
  x: number;
  y: number;
  kind: number; // which drawing: flower or branch variant
}

export interface Stick {
  x: number; // centre, world px
  y: number;
  kind: number; // which stick of the palitos strip
}

const OFFSET_X = 320; // px right of the spawn
const OFFSET_Y = -20;
const TRUNK_WIDTH = 40;
const TRUNK_DEPTH = 12; // px of the trunk's foot that block the way
const STICK_KINDS = 4;
// Sticks lie around the tree, not under its trunk: angle (radians), distance (px).
const STICK_SPOTS: [number, number][] = [
  [0.4, 110],
  [2.3, 120],
  [3.4, 104],
  [5.1, 130],
  [1.3, 150],
  [4.4, 160],
];

// Flower drawings, in the order the renderer loads their sheets.
export const FLOWER = { clump: 0, tall: 1 } as const;
// Flower clumps (Flores), from the foot (px): only a couple, to the sides of
// the trunk, outside the grass that covers the roots.
const CLUMP_SPOTS: [number, number][] = [
  [-122, -16], [134, 6],
];
// Fallen branches around the tree, outside the flowers: a pickup with E.
const BRANCH_SPOTS: [number, number][] = [
  [-86, 52], [74, 60], [-200, -14], [196, 12], [-8, 92],
];
const BRANCH_KINDS = 3;
// Tall flowers (Flores2), few and uneven so they look sown by the wind: a
// pair on the left, one beside the right clump and two strays in front.
const TALL_SPOTS: [number, number][] = [
  [-164, 42], [-140, 60],
  [150, -10],
  [116, 50], [24, 78],
];

export function placeSampleTree(spawn: { x: number; y: number }): SampleTree {
  const x = Math.round(spawn.x + OFFSET_X);
  const y = Math.round(spawn.y + OFFSET_Y);
  const sticks = STICK_SPOTS.map(([angle, distance], i) => ({
    x: Math.round(x + Math.cos(angle) * distance),
    y: Math.round(y + Math.sin(angle) * distance * 0.6), // flattened: top-down ground
    kind: i % STICK_KINDS,
  }));
  const flowers = [
    ...CLUMP_SPOTS.map(([dx, dy]) => ({ x: x + dx, y: y + dy, kind: FLOWER.clump })),
    ...TALL_SPOTS.map(([dx, dy]) => ({ x: x + dx, y: y + dy, kind: FLOWER.tall })),
  ];
  const branches = BRANCH_SPOTS.map(([dx, dy], i) => ({ x: x + dx, y: y + dy, kind: i % BRANCH_KINDS }));
  return { x, y, sticks, flowers, branches };
}

// The part of the trunk the player's feet bump into.
export function sampleTrunkBox(tree: SampleTree): { x: number; y: number; w: number; h: number } {
  return { x: tree.x - TRUNK_WIDTH / 2, y: tree.y - TRUNK_DEPTH, w: TRUNK_WIDTH, h: TRUNK_DEPTH };
}
