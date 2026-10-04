// Grid of floor and wall tiles, mirrored from the maze generated in C
// (src/mecanicas/laberinto.c). Collisions are resolved in C; the client uses
// this grid to draw and to place items.

export class TileMap {
  private readonly solid: Uint8Array;
  private readonly door: Uint8Array; // tiles of the gates of the central square

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly tileSize: number,
  ) {
    this.solid = new Uint8Array(cols * rows);
    this.door = new Uint8Array(cols * rows);
  }

  get width(): number {
    return this.cols * this.tileSize;
  }

  get height(): number {
    return this.rows * this.tileSize;
  }

  // Rewrites every tile from the maze generated in C.
  refill(
    isWall: (col: number, row: number) => boolean,
    isDoor: (col: number, row: number) => boolean,
  ): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.solid[r * this.cols + c] = isWall(c, r) ? 1 : 0;
        this.door[r * this.cols + c] = isDoor(c, r) ? 1 : 0;
      }
    }
  }

  isDoor(col: number, row: number): boolean {
    return this.inside(col, row) && this.door[row * this.cols + col] === 1;
  }

  isWall(col: number, row: number): boolean {
    // Outside the map counts as wall, so nothing escapes the level.
    return !this.inside(col, row) || this.solid[row * this.cols + col] === 1;
  }

  private inside(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }
}
