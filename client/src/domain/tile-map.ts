// Grid of floor and wall tiles, mirrored from the maze generated in C
// (src/mecanicas/laberinto.c). Collisions are resolved in C; the client uses
// this grid to draw and to place items.

const HADES_ZONE = 3; // ZONE.MINOTAUR in game-wasm.ts

export class TileMap {
  private readonly solid: Uint8Array;
  private readonly door: Uint8Array; // tiles of the gates of the central square
  // Boss zone of each floor tile and its weight (0..255 for 0..1). Fixed by
  // the seed, so they are read once.
  private readonly zones: Uint8Array;
  private readonly weights: Uint8Array;
  private zonesRead = false;
  // Lava, only ever near the Minotaur: read again when the maze grows (his
  // lair is carved late), but only on the tiles of his zone.
  private readonly lava: Uint8Array;
  private hadesTiles: number[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly tileSize: number,
  ) {
    this.solid = new Uint8Array(cols * rows);
    this.door = new Uint8Array(cols * rows);
    this.zones = new Uint8Array(cols * rows);
    this.weights = new Uint8Array(cols * rows);
    this.lava = new Uint8Array(cols * rows);
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

  // Reads the boss zones once (they never change during a game).
  fillZones(zone: (col: number, row: number) => number, weight: (col: number, row: number) => number): void {
    if (this.zonesRead) return;
    this.zonesRead = true;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const w = weight(c, r);
        if (w <= 0) continue;
        const z = zone(c, r);
        this.zones[r * this.cols + c] = z;
        this.weights[r * this.cols + c] = Math.round(Math.min(1, w) * 255);
        if (z === HADES_ZONE) this.hadesTiles.push(r * this.cols + c);
      }
    }
  }

  // Rereads the lava (call after fillZones, whenever the maze changed).
  refillLava(isLava: (col: number, row: number) => boolean): void {
    for (const i of this.hadesTiles) this.lava[i] = isLava(i % this.cols, Math.floor(i / this.cols)) ? 1 : 0;
  }

  isLava(col: number, row: number): boolean {
    return this.inside(col, row) && this.lava[row * this.cols + col] === 1;
  }

  // The boss zone on the tile's floor (0: plain maze) and how much it shows (0..1).
  zone(col: number, row: number): number {
    return this.inside(col, row) ? this.zones[row * this.cols + col] : 0;
  }

  zoneWeight(col: number, row: number): number {
    return this.inside(col, row) ? this.weights[row * this.cols + col] / 255 : 0;
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
