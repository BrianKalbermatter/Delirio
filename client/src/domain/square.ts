// The square: the open plaza in the middle of the maze, where the player
// spawns. It is found by walking the floor from the spawn without crossing a
// gate, since the gates are its only way out. C carves it the same in every
// game, so everything placed here by position (grass, trees) is always the
// same too.
//
// Its top-right corner is a dark forest.
import type { TileMap } from "./tile-map";

// Share of the square's width the forest reaches from its top-right corner.
const FOREST_REACH = 0.45;

export class Square {
  private readonly tiles = new Set<number>();
  private readonly forestCornerX: number; // px
  private readonly forestCornerY: number; // px
  private readonly forestRadius: number; // px

  constructor(
    private readonly map: TileMap,
    spawn: { x: number; y: number },
  ) {
    const t = map.tileSize;
    const start = [Math.floor(spawn.x / t), Math.floor(spawn.y / t)];
    let maxCol = start[0];
    let minRow = start[1];
    let minCol = start[0];
    this.tiles.add(this.key(start[0], start[1]));
    const queue = [start];
    while (queue.length > 0) {
      const [c, r] = queue.pop()!;
      for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
        const k = this.key(nc, nr);
        if (this.tiles.has(k) || map.isWall(nc, nr) || map.isDoor(nc, nr)) continue;
        this.tiles.add(k);
        queue.push([nc, nr]);
        maxCol = Math.max(maxCol, nc);
        minCol = Math.min(minCol, nc);
        minRow = Math.min(minRow, nr);
      }
    }
    this.forestCornerX = (maxCol + 1) * t;
    this.forestCornerY = minRow * t;
    this.forestRadius = (maxCol + 1 - minCol) * t * FOREST_REACH;
  }

  has(col: number, row: number): boolean {
    return this.tiles.has(this.key(col, row));
  }

  // True for points (world px) inside the forest, `margin` px further out.
  inForest(x: number, y: number, margin = 0): boolean {
    return this.forestDepth(x, y) >= -margin;
  }

  // How far (px) a point is inside the forest; negative outside it.
  forestDepth(x: number, y: number): number {
    return this.forestRadius - Math.hypot(x - this.forestCornerX, y - this.forestCornerY);
  }

  private key(col: number, row: number): number {
    return row * this.map.cols + col;
  }
}
