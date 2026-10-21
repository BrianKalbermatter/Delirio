// Top-down depth: whatever stands lower on screen is drawn on top. Everything
// that stands (walls, gates, props, the tree, flowers, the player) lives in one
// sortable container and gets its zIndex from here.

// At the same y, the order is fixed: a wall hides a prop standing on its line,
// and the player stands in front of all of them.
export const DEPTH = { wall: 0, gate: 1, prop: 2, tree: 3, flower: 4, player: 5, bush: 6 } as const;

// Far smaller than any real difference in y, so it only breaks ties.
const TIE_STEP = 1e-6;

export function depthOf(y: number, kind: number): number {
  return y + kind * TIE_STEP;
}
