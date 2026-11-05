// The dead of the maze: heaps of bones of those who came before, flat on the
// floor of its cells and of the square. Scenery, placed by seed as the maze is
// carved. Some of the heaps that look like these do get up: those are C's
// (the lying skeletons of src/mecanicas/enemigos.c).
import { Container, Sprite } from "pixi.js";
import type { TileMap } from "../../domain/tile-map";
import { MAZE_CELLS, random } from "../../domain/rocks";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const TILE = 32; // LAB_TILE
const WALL = 3; // LAB_MURO
const CORRIDOR = 8; // LAB_PASILLO
const CELL = WALL + CORRIDOR; // LAB_CELDA
const CHANCE = 0.55; // cells with a heap...
const SECOND_CHANCE = 0.2; // ...and with a second one
const START_CLEAR = 200; // px around the spawn with nothing
const HEAPS = 3; // the last frames of the skeleton's death: the bones landing

export class BoneField {
  // Flat on the floor. The owner adds it to the world.
  readonly view = new Container();
  private readonly done = new Set<number>();

  constructor(
    private readonly seed: number,
    private readonly sheet: SpriteSheet,
    private readonly map: TileMap,
    private readonly spawn: { x: number; y: number },
  ) {}

  // Fills the cells carved since the last time.
  update(): void {
    const frames = this.sheet.animations.get("muere")!.slice(-HEAPS);
    for (let cy = 0; cy < MAZE_CELLS; cy++) {
      for (let cx = 0; cx < MAZE_CELLS; cx++) {
        const cell = cy * MAZE_CELLS + cx;
        const middle = cx * CELL + WALL + CORRIDOR / 2;
        const row = cy * CELL + WALL + CORRIDOR / 2;
        if (this.done.has(cell) || this.map.isWall(middle, row)) continue;
        this.done.add(cell);
        const rng = random(this.seed ^ 0x5bd1e995, cx, cy);
        const heaps = rng() < CHANCE ? (rng() < SECOND_CHANCE ? 2 : 1) : 0;
        for (let k = 0; k < heaps; k++) {
          const x = (cx * CELL + WALL) * TILE + 24 + rng() * (CORRIDOR * TILE - 48);
          const y = (cy * CELL + WALL) * TILE + 32 + rng() * (CORRIDOR * TILE - 48);
          const frame = frames[Math.floor(rng() * frames.length)];
          const flipped = rng() < 0.5;
          if (!this.fits(x, y)) continue;
          const sprite = new Sprite();
          placeFrame(sprite, frame, x, y);
          if (flipped) {
            sprite.scale.x = -1;
            sprite.x += frame.w;
          }
          this.view.addChild(sprite);
        }
      }
    }
  }

  private fits(x: number, y: number): boolean {
    if (Math.hypot(x - this.spawn.x, y - this.spawn.y) < START_CLEAR) return false;
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    return !this.map.isWall(col, row) && !this.map.isLava(col, row) && !this.map.isPit(col, row) && !this.map.isDoor(col, row);
  }
}
