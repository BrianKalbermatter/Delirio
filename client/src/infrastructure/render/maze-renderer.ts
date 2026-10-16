// Draws the maze seen from above at a slant, with a perspective camera: the
// floor, and walls as low blocks whose tops lean away from the middle of the
// screen. A wall right of the camera shows its left side, one left of it its
// right side, and every wall shows its front face, like a real camera above
// the player.
//
// A wall's footprint is its cell on the floor. Its top is drawn raised by
// WALL_HEIGHT and pushed sideways by SPLAY times its distance to the camera.
// Anything standing behind (north of) a wall is hidden by it, which is why
// walls are depth-sorted together with characters and props: one shape per
// row of cells, since a whole row shares its depth.
//
// The floor is baked into chunk textures; walls and gates are redrawn every
// frame, since their sides change as the camera moves.
import { Container, Graphics, Rectangle, type Renderer, RenderTexture, Sprite, Texture } from "pixi.js";
import type { Square } from "../../domain/square";
import type { TileMap } from "../../domain/tile-map";
import type { Rect } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { loadImage } from "./sprite-sheet";
import { paintTexture } from "./textures";

interface TileFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MazeTiles {
  image: HTMLImageElement;
  tileSize: number;
  frames: Record<string, TileFrame>;
}

// The walls of one row of cells, redrawn every frame. When the row scrolls
// out of view it is set up again for another one.
interface RowView {
  root: Container;
  shape: Graphics;
  hole: Hole;
  seen: number; // last frame it was in view
}

// The see-through circle cut into a wall or gate that covers the player: an
// inverted stencil mask, so the rest of it stays solid.
interface Hole {
  shape: Graphics;
  on: boolean;
}

interface GateView {
  root: Container;
  shape: Graphics;
  hole: Hole;
}

// About 1.2 times the player's height: walls mark the way without hiding it.
const WALL_HEIGHT = 72; // px
// How far a top leans out, per px from the middle of the screen.
const SPLAY = 0.1;
// Mushroom palette (art/maze_tiles.py).
const WALL_TOP = 0x788a87;
const WALL_RIM = 0xa9b2a2; // lit front edge of the top
const WALL_FRONT = 0x576069;
const WALL_SIDE = 0x443846;
const WALL_FOOT = 0x2e222f; // dark band where the face meets the floor
const EDGE_COLOR = 0x2e222f;
const GATE_FRONT = 0x2e222f;
const GATE_BAR = 0x788a87;
const GATE_BAR_STEP = 8; // px between iron bars
const GATE_TOP = 0x7a3045;
const GATE_RIM = 0x993d41;
// Walls and gates in front of the focus (the player) get a round hole around
// it, so the player is never lost behind them; the rest of them stays solid.
const SEE_THROUGH_RADIUS = 46; // px from the middle of the body
const VOID_COLOR = 0x000000; // floor under walls, never seen unless something is off
const FLOOR_SHADOW = 14; // px of shadow cast on the floor at the foot of a wall
const SHADOW_RGB = [8, 6, 12];
const SHADOW_ALPHA = 0.6;
const FOREST_BLEND = 8; // tiles over which the forest floor fades into grass
// Share of forest floor in each grass-to-forest transition tile, and how many
// different transition tiles there are per share.
const BLEND_SHARES = [0.2, 0.4, 0.6, 0.8];
const BLEND_VARIANTS = 4;
// The floor never changes between maze growths, so it is baked once into
// chunks of this many tiles a side and reused every frame.
const FLOOR_CHUNK = 16;

export async function loadMazeTiles(basePath: string): Promise<MazeTiles> {
  const [data, image] = await Promise.all([
    fetch(`${basePath}.json`).then((r) => r.json()),
    loadImage(`${basePath}.png`),
  ]);
  return { image, tileSize: data.tileSize, frames: data.frames };
}

export class MazeRenderer {
  // Floor chunks, under everything that stands. The owner adds it to the stage.
  readonly floor = new Container();
  private readonly floorVariants: string[];
  private readonly grassVariants: string[];
  private readonly forestVariants: string[];
  // Every tile by name, plus the grass-to-forest transition tiles (blend_*).
  private readonly textures = new Map<string, Texture>();
  private readonly shadowTexture: Texture;
  // Floor chunks already baked, by chunk index (row * chunk cols + col).
  private readonly floorChunks = new Map<number, Sprite>();
  private shownChunks: Sprite[] = [];
  // Wall rows by row index, and the ones out of use.
  private readonly rows = new Map<number, RowView>();
  private readonly spareRows: RowView[] = [];
  private readonly gates: GateView[] = [];
  private frameCount = 0;
  // World x of the camera: the tops lean away from it.
  private cameraX = 0;

  // `depth`: the depth-sorted container walls and gates stand in.
  constructor(
    private readonly renderer: Renderer,
    private readonly depth: Container,
    private readonly map: TileMap,
    private readonly tiles: MazeTiles,
    private readonly square: Square,
  ) {
    const names = Object.keys(tiles.frames);
    this.floorVariants = names.filter((n) => n.startsWith("floor_"));
    this.grassVariants = names.filter((n) => n.startsWith("grass_"));
    this.forestVariants = names.filter((n) => n.startsWith("forest_"));
    const { source } = Texture.from(tiles.image);
    for (const [name, f] of Object.entries(tiles.frames)) {
      this.textures.set(name, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    }
    this.buildBlendTiles();
    this.shadowTexture = this.buildWallShadow();
  }

  get wallHeight(): number {
    return WALL_HEIGHT;
  }

  // Shows what is in view: the floor chunks, and the walls and gate leaves,
  // sorted by depth with the rest. Walls and gates in front of `focus` (world
  // pixels, feet at the bottom) get a round hole around it.
  show(view: View, focus: Box, leaves: Rect[]): void {
    this.cameraX = view.left + view.width / 2;
    this.showFloor(view);
    const hiding = this.hidingDepths(view, focus, leaves);
    this.showWalls(view, focus, hiding);
    this.showGates(leaves, focus, hiding);
  }

  // Where the top of a wall at world x is drawn.
  private lean(x: number): number {
    return Math.round(x + (x - this.cameraX) * SPLAY);
  }

  // Feet lines (depth) of the walls and gates that hide the body: in front of
  // it (closer to the camera) and drawn over it. Only those get the hole; a
  // wall across the corridor (behind the body) or a farther one stays solid.
  private hidingDepths(view: View, focus: Box, leaves: Rect[]): Set<number> {
    const t = this.map.tileSize;
    const hiding = new Set<number>();
    const over = (left: number, top: number, right: number, bottom: number) =>
      left < focus.right && right > focus.left && top < focus.bottom && bottom > focus.top;
    const { c0, c1, r0, r1 } = this.visibleCells(view, Math.ceil(WALL_HEIGHT / t));
    for (let row = r0; row <= r1; row++) {
      const depthY = (row + 1) * t;
      if (depthY <= focus.bottom) continue;
      for (let col = c0; col <= c1; col++) {
        if (!this.map.isWall(col, row)) continue;
        const [left, top, right, bottom] = this.wallRect(col, row);
        if (over(left, top, right, bottom)) hiding.add(depthY);
      }
    }
    for (const leaf of leaves) {
      const depthY = leaf.y + leaf.h;
      const left = Math.min(leaf.x, this.lean(leaf.x));
      const right = Math.max(leaf.x + leaf.w, this.lean(leaf.x + leaf.w));
      if (depthY > focus.bottom && over(left, leaf.y - WALL_HEIGHT, right, depthY)) hiding.add(depthY);
    }
    return hiding;
  }

  // What a wall cell covers on screen: its raised top, its sides, and its
  // face below it when it has one.
  private wallRect(col: number, row: number): [number, number, number, number] {
    const t = this.map.tileSize;
    const x0 = col * t;
    const x1 = x0 + t;
    const top = row * t - WALL_HEIGHT;
    const bottom = this.hasFace(col, row) ? (row + 1) * t : top + t;
    return [Math.min(x0, this.lean(x0)), top, Math.max(x1, this.lean(x1)), bottom];
  }

  // Call when the maze changed (it grew): the floor is baked again lazily.
  invalidate(): void {
    for (const chunk of this.floorChunks.values()) chunk.destroy({ texture: true, textureSource: true });
    this.floorChunks.clear();
    this.shownChunks = [];
  }

  // Floor of every visible cell, plus the shadow walls cast on it: a few
  // baked chunks instead of hundreds of tiles per frame. Chunks out of view
  // stay hidden.
  private showFloor(view: View): void {
    const size = FLOOR_CHUNK * this.map.tileSize;
    const chunkCols = Math.ceil(this.map.cols / FLOOR_CHUNK);
    const chunkRows = Math.ceil(this.map.rows / FLOOR_CHUNK);
    const cx0 = Math.max(0, Math.floor(view.left / size));
    const cx1 = Math.min(chunkCols - 1, Math.floor((view.left + view.width) / size));
    const cy0 = Math.max(0, Math.floor(view.top / size));
    const cy1 = Math.min(chunkRows - 1, Math.floor((view.top + view.height) / size));
    for (const chunk of this.shownChunks) chunk.visible = false;
    this.shownChunks.length = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * chunkCols + cx;
        let chunk = this.floorChunks.get(key);
        if (!chunk) {
          chunk = this.buildFloorChunk(cx, cy);
          this.floorChunks.set(key, chunk);
        }
        chunk.visible = true;
        this.shownChunks.push(chunk);
      }
    }
  }

  // Lays the chunk's tiles out as sprites, renders them once into a texture
  // and keeps only that.
  private buildFloorChunk(cx: number, cy: number): Sprite {
    const t = this.map.tileSize;
    const size = FLOOR_CHUNK * t;
    const tiles = new Container();
    for (let row = cy * FLOOR_CHUNK; row < Math.min(this.map.rows, (cy + 1) * FLOOR_CHUNK); row++) {
      for (let col = cx * FLOOR_CHUNK; col < Math.min(this.map.cols, (cx + 1) * FLOOR_CHUNK); col++) {
        const x = col * t - cx * size;
        const y = row * t - cy * size;
        if (this.map.isWall(col, row)) {
          tiles.addChild(
            placed(
              new Sprite({
                texture: Texture.WHITE,
                tint: VOID_COLOR,
                width: t,
                height: t,
              }),
              x,
              y,
            ),
          );
          continue;
        }
        tiles.addChild(placed(new Sprite(this.textures.get(this.floorTile(col, row))), x, y));
        if (this.map.isWall(col, row - 1)) tiles.addChild(placed(new Sprite(this.shadowTexture), x, y));
      }
    }
    const texture = RenderTexture.create({ width: size, height: size });
    this.renderer.render({
      container: tiles,
      target: texture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
    tiles.destroy({ children: true });
    const chunk = placed(new Sprite(texture), cx * size, cy * size);
    this.floor.addChild(chunk);
    return chunk;
  }

  // Wall rows in view. Includes rows below the screen, whose raised tops
  // reach up into it.
  private showWalls(view: View, focus: Box, hiding: Set<number>): void {
    const t = this.map.tileSize;
    const frame = ++this.frameCount;
    const { c0, c1, r0, r1 } = this.visibleCells(view, Math.ceil(WALL_HEIGHT / t));
    for (let row = r0; row <= r1; row++) {
      let wall = this.rows.get(row);
      if (!wall) {
        wall = this.spareRows.pop() ?? this.createRow();
        wall.root.visible = true;
        wall.root.zIndex = depthOf((row + 1) * t, DEPTH.wall);
        this.rows.set(row, wall);
      }
      wall.seen = frame;
      this.drawRow(wall.shape, row, c0, c1);
      const top = row * t - WALL_HEIGHT;
      this.cutHole(
        wall.root,
        wall.hole,
        hiding.has((row + 1) * t),
        view.left,
        top,
        view.left + view.width,
        (row + 1) * t,
        focus,
      );
    }
    for (const [row, wall] of this.rows) {
      if (wall.seen === frame) continue;
      wall.root.visible = false;
      setHole(wall.root, wall.hole, false);
      this.spareRows.push(wall);
      this.rows.delete(row);
    }
  }

  private createRow(): RowView {
    const wall: RowView = {
      root: new Container(),
      shape: new Graphics(),
      hole: { shape: new Graphics(), on: false },
      seen: 0,
    };
    wall.root.addChild(wall.shape, wall.hole.shape);
    this.depth.addChild(wall.root);
    return wall;
  }

  // The walls of one row, run by run of wall cells: the side that faces the
  // camera, the front face where the floor in front is open, and the top.
  private drawRow(g: Graphics, row: number, c0: number, c1: number): void {
    const t = this.map.tileSize;
    const h = WALL_HEIGHT;
    const back = row * t;
    const foot = back + t;
    g.clear();
    for (let col = c0; col <= c1; col++) {
      if (!this.map.isWall(col, row)) continue;
      const first = col;
      while (col < c1 && this.map.isWall(col + 1, row)) col++;
      const x0 = first * t;
      const x1 = (col + 1) * t;
      const top0 = this.lean(x0);
      const top1 = this.lean(x1);
      const openLeft = !this.map.isWall(first - 1, row);
      const openRight = !this.map.isWall(col + 1, row);

      // Sides: only the one turned to the camera shows.
      if (openLeft && top0 > x0) {
        g.poly([x0, back, x0, foot, top0, foot - h, top0, back - h]).fill(WALL_SIDE);
      }
      if (openRight && top1 < x1) {
        g.poly([x1, back, x1, foot, top1, foot - h, top1, back - h]).fill(WALL_SIDE);
      }

      // Front faces, over the cells with open floor in front.
      for (let c = first; c <= col; c++) {
        if (!this.hasFace(c, row)) continue;
        const start = c;
        while (c < col && this.hasFace(c + 1, row)) c++;
        const f0 = start * t;
        const f1 = (c + 1) * t;
        const l0 = this.lean(f0);
        const l1 = this.lean(f1);
        g.poly([f0, foot, f1, foot, l1, foot - h, l0, foot - h]).fill(WALL_FRONT);
        g.rect(f0, foot - 3, f1 - f0, 3).fill(WALL_FOOT);
        g.rect(l0, foot - h, l1 - l0, 2).fill(WALL_RIM);
      }

      // Top, outlined where it meets open space.
      g.rect(top0, back - h, top1 - top0, t).fill(WALL_TOP);
      for (let c = first; c <= col; c++) {
        if (this.map.isWall(c, row - 1)) continue;
        const l0 = this.lean(c * t);
        g.rect(l0, back - h, this.lean((c + 1) * t) - l0, 1).fill(EDGE_COLOR);
      }
      if (openLeft) g.rect(top0, back - h, 1, t).fill(EDGE_COLOR);
      if (openRight) g.rect(top1 - 1, back - h, 1, t).fill(EDGE_COLOR);
    }
  }

  // The leaves of the gates of the central square, as low blocks of their
  // exact size (they slide, so they are not whole tiles): iron bars in front,
  // wood on top. They get the hole in front of `focus` like the walls.
  private showGates(leaves: Rect[], focus: Box, hiding: Set<number>): void {
    const h = WALL_HEIGHT;
    let shown = 0;
    for (const leaf of leaves) {
      if (leaf.w <= 0.5 || leaf.h <= 0.5) continue;
      const gate = (this.gates[shown] ??= this.createGate());
      shown++;
      const x0 = Math.round(leaf.x);
      const x1 = Math.round(leaf.x + leaf.w);
      const back = Math.round(leaf.y);
      const foot = Math.round(leaf.y + leaf.h);
      const top0 = this.lean(x0);
      const top1 = this.lean(x1);
      gate.root.visible = true;
      gate.root.zIndex = depthOf(foot, DEPTH.gate);
      this.cutHole(
        gate.root,
        gate.hole,
        hiding.has(leaf.y + leaf.h),
        Math.min(x0, top0),
        back - h,
        Math.max(x1, top1),
        foot,
        focus,
      );

      const g = gate.shape.clear();
      if (top0 > x0) g.poly([x0, back, x0, foot, top0, foot - h, top0, back - h]).fill(WALL_SIDE);
      if (top1 < x1) g.poly([x1, back, x1, foot, top1, foot - h, top1, back - h]).fill(WALL_SIDE);
      g.poly([x0, foot, x1, foot, top1, foot - h, top0, foot - h]).fill(GATE_FRONT);
      // Bars on fixed world positions, so they do not slide with the leaf.
      for (let x = Math.ceil(x0 / GATE_BAR_STEP) * GATE_BAR_STEP + 2; x < x1 - 1; x += GATE_BAR_STEP) {
        const top = this.lean(x);
        g.poly([x, foot, x + 2, foot, top + 2, foot - h, top, foot - h]).fill(GATE_BAR);
      }
      g.rect(top0, back - h, top1 - top0, foot - back).fill(GATE_TOP);
      g.rect(top0, foot - h - 2, top1 - top0, 2).fill(GATE_RIM);
      g.rect(top0, back - h, top1 - top0, foot - back).stroke({
        width: 1,
        color: EDGE_COLOR,
        alignment: 1,
      });
    }
    for (let i = shown; i < this.gates.length; i++) {
      this.gates[i].root.visible = false;
      setHole(this.gates[i].root, this.gates[i].hole, false);
    }
  }

  private createGate(): GateView {
    const gate: GateView = {
      root: new Container(),
      shape: new Graphics(),
      hole: { shape: new Graphics(), on: false },
    };
    gate.root.addChild(gate.shape, gate.hole.shape);
    this.depth.addChild(gate.root);
    return gate;
  }

  // Cuts the see-through circle into `root` (a wall or gate drawn over the
  // rectangle left..bottom) when it belongs to a line that hides the body
  // and reaches the circle.
  private cutHole(
    root: Container,
    hole: Hole,
    hides: boolean,
    left: number,
    top: number,
    right: number,
    bottom: number,
    focus: Box,
  ): void {
    const cx = (focus.left + focus.right) / 2;
    const cy = (focus.top + focus.bottom) / 2;
    const nearX = Math.max(left, Math.min(cx, right));
    const nearY = Math.max(top, Math.min(cy, bottom));
    const on = hides && Math.hypot(nearX - cx, nearY - cy) < SEE_THROUGH_RADIUS;
    setHole(root, hole, on);
    // Whole pixels, so the edge stays crisp like the rest of the art.
    if (on) hole.shape.clear().circle(Math.round(cx), Math.round(cy), SEE_THROUGH_RADIUS).fill(0xffffff);
  }

  // A face shows only where the floor in front of the wall is open.
  private hasFace(col: number, row: number): boolean {
    const below = row + 1;
    return below < this.map.rows && !this.map.isWall(col, below);
  }

  // The shadow at the foot of a wall: dark at the wall, gone FLOOR_SHADOW px
  // down. Each row takes the gradient's value at its pixel centre.
  private buildWallShadow(): Texture {
    const t = this.map.tileSize;
    return paintTexture(t, FLOOR_SHADOW, (ctx) => {
      const pixels = ctx.createImageData(t, FLOOR_SHADOW);
      for (let y = 0; y < FLOOR_SHADOW; y++) {
        const alpha = Math.round(255 * SHADOW_ALPHA * (1 - (y + 0.5) / FLOOR_SHADOW));
        for (let x = 0; x < t; x++) pixels.data.set([...SHADOW_RGB, alpha], (y * t + x) * 4);
      }
      ctx.putImageData(pixels, 0, 0);
    });
  }

  // The square is grass, with a dark mossy floor under its forest. Out in the
  // maze: dirt, with irregular patches of old stone paving. An open gate
  // leaves a paved threshold.
  private floorTile(col: number, row: number): string {
    if (this.map.isDoor(col, row)) return `paving_${hash(col, row) % 4}`;
    if (this.square.has(col, row)) return this.squareTile(col, row);
    const paving = valueNoise(col / 6, row / 6) > 0.62;
    if (paving && hash(col, row) % 100 < 85) return `paving_${hash(col, row) % 4}`;
    return this.pick(this.floorVariants, col, row);
  }

  // Grass tiles picked by position, so no repeating pattern shows. The forest
  // floor thins out into the grass over a band of FOREST_BLEND tiles, through
  // dithered transition tiles; ragged noise moves the edge.
  private squareTile(col: number, row: number): string {
    const t = this.map.tileSize;
    const ragged = (valueNoise(col / 4, row / 4) - 0.5) * 3 * t;
    const depth = this.square.forestDepth(col * t + t / 2, row * t + t / 2) + ragged;
    const share = Math.min(1, Math.max(0, 0.5 + depth / (FOREST_BLEND * t)));
    const step = Math.round(share * (BLEND_SHARES.length + 1));
    if (step <= 0) return this.pick(this.grassVariants, col, row);
    if (step > BLEND_SHARES.length) return this.pick(this.forestVariants, col, row);
    return `blend_${step - 1}_${hash(col, row) % BLEND_VARIANTS}`;
  }

  // One row per forest share: forest floor over grass, kept only where a
  // per-pixel noise value is below the share. The noise works in 2x2 blocks,
  // like the floor tiles, so the mix reads as pixel art.
  private buildBlendTiles(): void {
    const t = this.map.tileSize;
    const scratch = document.createElement("canvas");
    scratch.width = scratch.height = t;
    const forest = scratch.getContext("2d", { willReadFrequently: true })!;
    const frame = (name: string) => this.tiles.frames[name];
    const sheet = paintTexture(t * BLEND_VARIANTS, t * BLEND_SHARES.length, (out) => {
      BLEND_SHARES.forEach((share, level) => {
        for (let i = 0; i < BLEND_VARIANTS; i++) {
          const g = frame(this.grassVariants[i % this.grassVariants.length]);
          const f = frame(this.forestVariants[(i + level) % this.forestVariants.length]);
          out.drawImage(this.tiles.image, g.x, g.y, t, t, i * t, level * t, t, t);
          forest.clearRect(0, 0, t, t);
          forest.drawImage(this.tiles.image, f.x, f.y, t, t, 0, 0, t, t);
          const pixels = forest.getImageData(0, 0, t, t);
          for (let y = 0; y < t; y++) {
            for (let x = 0; x < t; x++) {
              const noise = (hash((x >> 1) + i * 97, (y >> 1) + level * 89) % 1000) / 1000;
              if (noise >= share) pixels.data[(y * t + x) * 4 + 3] = 0;
            }
          }
          forest.putImageData(pixels, 0, 0);
          out.drawImage(scratch, i * t, level * t);
        }
      });
    });
    BLEND_SHARES.forEach((_, level) => {
      for (let i = 0; i < BLEND_VARIANTS; i++) {
        const tile = new Rectangle(i * t, level * t, t, t);
        this.textures.set(`blend_${level}_${i}`, new Texture({ source: sheet.source, frame: tile }));
      }
    });
  }

  private pick(variants: string[], col: number, row: number): string {
    return variants[hash(col, row) % variants.length];
  }

  private visibleCells(view: View, extraRowsBelow: number) {
    const t = this.map.tileSize;
    return {
      c0: Math.max(0, Math.floor(view.left / t)),
      c1: Math.min(this.map.cols - 1, Math.floor((view.left + view.width) / t)),
      r0: Math.max(0, Math.floor(view.top / t)),
      r1: Math.min(this.map.rows - 1, Math.floor((view.top + view.height) / t) + extraRowsBelow),
    };
  }
}

function placed<T extends Container>(object: T, x: number, y: number): T {
  object.position.set(x, y);
  return object;
}

// Axis-aligned box in world pixels.
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Visible rectangle of the world, in world pixels.
export interface View {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Deterministic per-cell hash, so tiles never change between frames.
function hash(col: number, row: number): number {
  let h = Math.imul(col, 73856093) ^ Math.imul(row, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Smooth noise in [0, 1] for blobby patches.
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v = (cx: number, cy: number) => (hash(cx + 1000, cy + 1000) % 1000) / 1000;
  const top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
  const bottom = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function setHole(root: Container, hole: Hole, on: boolean): void {
  if (hole.on === on) return;
  hole.on = on;
  hole.shape.visible = on;
  root.setMask(on ? { mask: hole.shape, inverse: true } : { mask: null });
}
