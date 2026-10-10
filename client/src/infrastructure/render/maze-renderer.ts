// Draws the maze in a 3/4 top-down view: the floor, and walls as tall blocks
// with a lit mossy top and a dark front face.
//
// A wall tile's footprint is its cell on the floor. Its top is drawn raised by
// the wall height, and its front face fills the space between the top and the
// floor. Anything standing behind (north of) a wall is therefore hidden by it,
// which is why walls are depth-sorted together with characters and props.
import type { Square } from "../../domain/square";
import type { TileMap } from "../../domain/tile-map";
import type { Rect } from "../wasm/game-wasm";

interface TileFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MazeTiles {
  image: HTMLImageElement;
  tileSize: number;
  wallHeight: number;
  // Wall tops and faces are cut from seamless textures of this many tiles.
  // Picking the piece by cell position makes neighbouring tiles continue each other.
  wallTopGrid: number;
  wallFaceGrid: number;
  frames: Record<string, TileFrame>;
}

// A wall cell, ready to be sorted by depth with the other drawables.
export interface WallDrawable {
  depthY: number;
  draw: () => void;
}

const EDGE_COLOR = "rgba(12, 10, 18, 0.85)";
// Walls in front of the focus (the player) fade out as they get closer to it,
// down to WALL_MIN_ALPHA when they cover it, so the player is never lost and
// can see the floor ahead and to the sides (a gate or a dead end). The walls
// are tall, so the see-through range is wide.
const WALL_MIN_ALPHA = 0.12;
const WALL_FADE_DISTANCE = 200; // px between wall and sight area where fading starts
const FLOOR_SHADOW = 14; // px of shadow cast on the floor at the foot of a wall
const FOREST_BLEND = 8; // tiles over which the forest floor fades into grass
// Share of forest floor in each grass-to-forest transition tile, and how many
// different transition tiles there are per share.
const BLEND_SHARES = [0.2, 0.4, 0.6, 0.8];
const BLEND_VARIANTS = 4;
// The floor never changes between maze growths, so it is drawn once into
// chunks of this many tiles a side and reused every frame.
const FLOOR_CHUNK = 16;

export async function loadMazeTiles(basePath: string): Promise<MazeTiles> {
  const [data, image] = await Promise.all([
    fetch(`${basePath}.json`).then((r) => r.json()),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Cannot load image ${basePath}.png`));
      img.src = `${basePath}.png`;
    }),
  ]);
  return {
    image,
    tileSize: data.tileSize,
    wallHeight: data.wallHeight,
    wallTopGrid: data.wallTopGrid,
    wallFaceGrid: data.wallFaceGrid,
    frames: data.frames,
  };
}

export class MazeRenderer {
  private readonly floorVariants: string[];
  private readonly grassVariants: string[];
  private readonly forestVariants: string[];
  // Grass-to-forest transition tiles, built once from the tileset.
  private readonly blendImage: HTMLCanvasElement;
  // Floor chunks already drawn, by chunk index (row * chunk cols + col).
  private readonly floorChunks = new Map<number, HTMLCanvasElement>();

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly map: TileMap,
    private readonly tiles: MazeTiles,
    private readonly square: Square,
  ) {
    const names = Object.keys(tiles.frames);
    this.floorVariants = names.filter((n) => n.startsWith("floor_"));
    this.grassVariants = names.filter((n) => n.startsWith("grass_"));
    this.forestVariants = names.filter((n) => n.startsWith("forest_"));
    this.blendImage = this.buildBlendTiles();
  }

  get wallHeight(): number {
    return this.tiles.wallHeight;
  }

  // Floor of every visible cell, plus the shadow walls cast on it: a few
  // cached chunks instead of hundreds of tiles per frame.
  drawFloor(view: View): void {
    const size = FLOOR_CHUNK * this.map.tileSize;
    const chunkCols = Math.ceil(this.map.cols / FLOOR_CHUNK);
    const chunkRows = Math.ceil(this.map.rows / FLOOR_CHUNK);
    const cx0 = Math.max(0, Math.floor(view.left / size));
    const cx1 = Math.min(chunkCols - 1, Math.floor((view.left + view.width) / size));
    const cy0 = Math.max(0, Math.floor(view.top / size));
    const cy1 = Math.min(chunkRows - 1, Math.floor((view.top + view.height) / size));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * chunkCols + cx;
        let chunk = this.floorChunks.get(key);
        if (!chunk) {
          chunk = this.buildFloorChunk(cx, cy);
          this.floorChunks.set(key, chunk);
        }
        this.ctx.drawImage(chunk, cx * size, cy * size);
      }
    }
  }

  // Call when the maze changed (it grew): the floor is drawn again lazily.
  invalidateFloor(): void {
    this.floorChunks.clear();
  }

  private buildFloorChunk(cx: number, cy: number): HTMLCanvasElement {
    const t = this.map.tileSize;
    const size = FLOOR_CHUNK * t;
    const chunk = document.createElement("canvas");
    chunk.width = chunk.height = size;
    const ctx = chunk.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-cx * size, -cy * size); // draw in world px
    for (let row = cy * FLOOR_CHUNK; row < Math.min(this.map.rows, (cy + 1) * FLOOR_CHUNK); row++) {
      for (let col = cx * FLOOR_CHUNK; col < Math.min(this.map.cols, (cx + 1) * FLOOR_CHUNK); col++) {
        if (this.map.isWall(col, row)) continue;
        this.blit(this.floorTile(col, row), col * t, row * t, ctx);
        if (this.map.isWall(col, row - 1)) this.drawWallShadow(col * t, row * t, ctx);
      }
    }
    return chunk;
  }

  // Wall cells in view. Includes rows below the screen, whose raised tops reach
  // up into it. Walls in front of `focus` (world pixels, feet at the bottom)
  // fade so it stays visible, and so does the floor around `sight`: the body
  // stretched towards where the player goes.
  wallDrawables(view: View, focus: Box, sight: Box = focus): WallDrawable[] {
    const t = this.map.tileSize;
    const { c0, c1, r0, r1 } = this.visibleCells(view, Math.ceil(this.wallHeight / t));
    const result: WallDrawable[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!this.map.isWall(col, row)) continue;
        const depthY = (row + 1) * t;
        const alpha = this.fades(depthY, focus, sight) ? this.fadeAlpha(col, row, sight) : 1;
        result.push({ depthY, draw: () => this.drawWall(col, row, alpha) });
      }
    }
    return result;
  }

  // The leaves of the gates of the central square, as solid blocks of their
  // exact size (they slide, so they are not whole tiles): iron bars in front,
  // wood on top. They fade in front of `focus` like the walls.
  gateDrawables(leaves: Rect[], focus: Box, sight: Box = focus): WallDrawable[] {
    return leaves
      .filter((leaf) => leaf.w > 0.5 && leaf.h > 0.5)
      .map((leaf) => {
        const depthY = leaf.y + leaf.h;
        const top = leaf.y - this.wallHeight;
        const alpha = this.fades(depthY, focus, sight)
          ? this.fadeAlphaRect(leaf.x, top, leaf.x + leaf.w, depthY, sight)
          : 1;
        return { depthY, draw: () => this.drawGateLeaf(leaf, alpha) };
      });
  }

  // Walls in front of the body fade. Behind it (further up) they only hide
  // the floor beyond, so they fade only while the player heads up there.
  private fades(depthY: number, focus: Box, sight: Box): boolean {
    return depthY > focus.bottom || sight.top < focus.top;
  }

  // 1 when the wall is far from the box, WALL_MIN_ALPHA when it overlaps it.
  private fadeAlpha(col: number, row: number, box: Box): number {
    const t = this.map.tileSize;
    const left = col * t;
    const top = row * t - this.wallHeight;
    const bottom = this.hasFace(col, row) ? (row + 1) * t : top + t;
    return this.fadeAlphaRect(left, top, left + t, bottom, box);
  }

  // Same, for any rectangle drawn on screen (world pixels).
  private fadeAlphaRect(left: number, top: number, right: number, bottom: number, box: Box): number {
    const dx = Math.max(left - box.right, box.left - right, 0);
    const dy = Math.max(top - box.bottom, box.top - bottom, 0);
    const t = Math.min(1, Math.hypot(dx, dy) / WALL_FADE_DISTANCE);
    // Smoothstep: stays see-through near the body, turns solid near the edge.
    const closeness = t * t * (3 - 2 * t);
    return WALL_MIN_ALPHA + (1 - WALL_MIN_ALPHA) * closeness;
  }

  private drawGateLeaf(leaf: Rect, alpha: number): void {
    const t = this.map.tileSize;
    const h = this.wallHeight;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Front: iron bars, tiled by world position so they do not slide with the leaf
    const faceTop = leaf.y + leaf.h - h;
    this.tiledInRect(leaf.x, faceTop, leaf.w, h, (col) => `gate_face_${col % this.tiles.wallFaceGrid}`, faceTop);

    // Top: wooden beam
    const top = leaf.y - h;
    for (let y = Math.floor(top / t) * t; y < top + leaf.h; y += t) {
      this.tiledInRect(leaf.x, top, leaf.w, leaf.h, () => "gate_top_0", y);
    }

    // Dark outline so the moving edge reads clearly
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(leaf.x) + 0.5, Math.round(top) + 0.5, Math.round(leaf.w) - 1, Math.round(leaf.h) - 1);
    ctx.restore();
  }

  // Draws tiles named by `name(col)` at row height `y`, clipped to the rectangle.
  private tiledInRect(
    x: number,
    y: number,
    w: number,
    h: number,
    name: (col: number) => string,
    tileY: number,
  ): void {
    const t = this.map.tileSize;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.clip();
    for (let tx = Math.floor(x / t) * t; tx < x + w; tx += t) {
      this.blit(name(Math.floor(tx / t)), tx, Math.round(tileY));
    }
    this.ctx.restore();
  }

  private drawWall(col: number, row: number, alpha: number): void {
    this.ctx.globalAlpha = alpha;
    const t = this.map.tileSize;
    const h = this.wallHeight;
    const x = col * t;
    const topY = row * t - h;

    if (this.hasFace(col, row)) {
      const faceY = (row + 1) * t - h;
      this.blit(`wall_face_${col % this.tiles.wallFaceGrid}`, x, faceY);
      // Darker vertical edges where the face ends, so blocks read as solid.
      this.ctx.fillStyle = EDGE_COLOR;
      if (!this.map.isWall(col - 1, row)) this.ctx.fillRect(x, faceY, 1, h);
      if (!this.map.isWall(col + 1, row)) this.ctx.fillRect(x + t - 1, faceY, 1, h);
    }

    const grid = this.tiles.wallTopGrid;
    this.blit(`wall_top_${(row % grid) * grid + (col % grid)}`, x, topY);
    // Outline the top where it meets open space.
    this.ctx.fillStyle = EDGE_COLOR;
    if (!this.map.isWall(col, row - 1)) this.ctx.fillRect(x, topY, t, 2);
    if (!this.map.isWall(col - 1, row)) this.ctx.fillRect(x, topY, 1, t);
    if (!this.map.isWall(col + 1, row)) this.ctx.fillRect(x + t - 1, topY, 1, t);
    this.ctx.globalAlpha = 1;
  }

  // A face shows only where the floor in front of the wall is open.
  private hasFace(col: number, row: number): boolean {
    const below = row + 1;
    return below < this.map.rows && !this.map.isWall(col, below);
  }

  private drawWallShadow(x: number, y: number, ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, y, 0, y + FLOOR_SHADOW);
    gradient.addColorStop(0, "rgba(8, 6, 12, 0.6)");
    gradient.addColorStop(1, "rgba(8, 6, 12, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, this.map.tileSize, FLOOR_SHADOW);
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
  private buildBlendTiles(): HTMLCanvasElement {
    const t = this.map.tileSize;
    const canvas = document.createElement("canvas");
    canvas.width = t * BLEND_VARIANTS;
    canvas.height = t * BLEND_SHARES.length;
    const out = canvas.getContext("2d")!;
    const scratch = document.createElement("canvas");
    scratch.width = scratch.height = t;
    const forest = scratch.getContext("2d", { willReadFrequently: true })!;
    const frame = (name: string) => this.tiles.frames[name];
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
    return canvas;
  }

  private pick(variants: string[], col: number, row: number): string {
    return variants[hash(col, row) % variants.length];
  }

  private blit(name: string, x: number, y: number, ctx = this.ctx): void {
    if (name.startsWith("blend_")) {
      const t = this.map.tileSize;
      const [, level, i] = name.split("_").map(Number);
      ctx.drawImage(this.blendImage, i * t, level * t, t, t, x, y, t, t);
      return;
    }
    const f = this.tiles.frames[name];
    ctx.drawImage(this.tiles.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
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
