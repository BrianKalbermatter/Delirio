// Draws the maze in a 3/4 top-down view: the floor, and walls as tall blocks
// with a lit mossy top and a dark front face.
//
// A wall tile's footprint is its cell on the floor. Its top is drawn raised by
// the wall height, and its front face fills the space between the top and the
// floor. Anything standing behind (north of) a wall is therefore hidden by it,
// which is why walls are depth-sorted together with characters and props.
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
// down to WALL_MIN_ALPHA when they cover it, so the player is never lost.
const WALL_MIN_ALPHA = 0.3;
const WALL_FADE_DISTANCE = 48; // px between wall and body where fading starts
const FLOOR_SHADOW = 14; // px of shadow cast on the floor at the foot of a wall

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

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly map: TileMap,
    private readonly tiles: MazeTiles,
  ) {
    const names = Object.keys(tiles.frames);
    this.floorVariants = names.filter((n) => n.startsWith("floor_"));
  }

  get wallHeight(): number {
    return this.tiles.wallHeight;
  }

  // Floor of every visible cell, plus the shadow walls cast on it.
  drawFloor(view: View): void {
    const t = this.map.tileSize;
    const { c0, c1, r0, r1 } = this.visibleCells(view, 0);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (this.map.isWall(col, row)) continue;
        this.blit(this.floorTile(col, row), col * t, row * t);
        if (this.map.isWall(col, row - 1)) this.drawWallShadow(col * t, row * t);
      }
    }
  }

  // Wall cells in view. Includes rows below the screen, whose raised tops reach
  // up into it. Walls in front of `focus` (world pixels, feet at the bottom)
  // fade so it stays visible.
  wallDrawables(view: View, focus: Box): WallDrawable[] {
    const t = this.map.tileSize;
    const { c0, c1, r0, r1 } = this.visibleCells(view, Math.ceil(this.wallHeight / t));
    const result: WallDrawable[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!this.map.isWall(col, row)) continue;
        const depthY = (row + 1) * t;
        const alpha = depthY > focus.bottom ? this.fadeAlpha(col, row, focus) : 1;
        result.push({ depthY, draw: () => this.drawWall(col, row, alpha) });
      }
    }
    return result;
  }

  // The leaves of the gates of the central square, as solid blocks of their
  // exact size (they slide, so they are not whole tiles): iron bars in front,
  // wood on top. They fade in front of `focus` like the walls.
  gateDrawables(leaves: Rect[], focus: Box): WallDrawable[] {
    return leaves
      .filter((leaf) => leaf.w > 0.5 && leaf.h > 0.5)
      .map((leaf) => {
        const depthY = leaf.y + leaf.h;
        const top = leaf.y - this.wallHeight;
        const alpha =
          depthY > focus.bottom ? this.fadeAlphaRect(leaf.x, top, leaf.x + leaf.w, depthY, focus) : 1;
        return { depthY, draw: () => this.drawGateLeaf(leaf, alpha) };
      });
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
    const closeness = Math.min(1, Math.hypot(dx, dy) / WALL_FADE_DISTANCE);
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

  private drawWallShadow(x: number, y: number): void {
    const gradient = this.ctx.createLinearGradient(0, y, 0, y + FLOOR_SHADOW);
    gradient.addColorStop(0, "rgba(8, 6, 12, 0.6)");
    gradient.addColorStop(1, "rgba(8, 6, 12, 0)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y, this.map.tileSize, FLOOR_SHADOW);
  }

  // Dirt everywhere, with irregular patches of old stone paving. An open gate
  // leaves a paved threshold.
  private floorTile(col: number, row: number): string {
    if (this.map.isDoor(col, row)) return `paving_${hash(col, row) % 4}`;
    const paving = valueNoise(col / 6, row / 6) > 0.62;
    if (paving && hash(col, row) % 100 < 85) return `paving_${hash(col, row) % 4}`;
    return this.pick(this.floorVariants, col, row);
  }

  private pick(variants: string[], col: number, row: number): string {
    return variants[hash(col, row) % variants.length];
  }

  private blit(name: string, x: number, y: number): void {
    const f = this.tiles.frames[name];
    this.ctx.drawImage(this.tiles.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
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
