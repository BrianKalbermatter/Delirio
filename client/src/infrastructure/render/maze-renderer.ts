// Draws the maze in a 3/4 top-down view: the floor, and walls as tall blocks
// with a lit mossy top and a dark front face.
//
// A wall tile's footprint is its cell on the floor. Its top is drawn raised by
// the wall height, and its front face fills the space between the top and the
// floor. Anything standing behind (north of) a wall is therefore hidden by it,
// which is why walls are depth-sorted together with characters and props.
//
// The floor is baked into chunk textures; walls and gates are pooled sprites
// in the depth-sorted container, reused for other cells as the view scrolls.
import {
  Container,
  Graphics,
  Rectangle,
  type Renderer,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
} from "pixi.js";
import type { Square } from "../../domain/square";
import type { TileMap } from "../../domain/tile-map";
import type { Rect } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { loadImage } from "./sprite-sheet";
import { paintTexture, solidRect } from "./textures";

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

// The sprites of one wall cell. When the cell scrolls out of view they are
// set up again for another one, instead of being made anew.
interface WallView {
  root: Container;
  face: Sprite;
  faceLeft: Sprite; // dark vertical edges where the face ends
  faceRight: Sprite;
  top: Sprite;
  topEdge: Sprite; // outline of the top where it meets open space
  topLeft: Sprite;
  topRight: Sprite;
  seen: number; // last frame it was in view
}

interface GateView {
  root: Container;
  face: TilingSprite;
  top: TilingSprite;
  outline: Graphics;
  outlined: Rectangle; // what the outline was drawn for, to redraw only on change
}

const EDGE_COLOR = 0x0c0a12;
const EDGE_ALPHA = 0.85;
// Walls in front of the focus (the player) fade out as they get closer to it,
// down to WALL_MIN_ALPHA when they cover it, so the player is never lost and
// can see the floor ahead and to the sides (a gate or a dead end). The walls
// are tall, so the see-through range is wide.
const WALL_MIN_ALPHA = 0.12;
const WALL_FADE_DISTANCE = 200; // px between wall and sight area where fading starts
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
  // Floor chunks, under everything that stands. The owner adds it to the stage.
  readonly floor = new Container();
  private readonly floorVariants: string[];
  private readonly grassVariants: string[];
  private readonly forestVariants: string[];
  // Every tile by name, plus the grass-to-forest transition tiles (blend_*).
  private readonly textures = new Map<string, Texture>();
  private readonly shadowTexture: Texture;
  // Gates tile their iron bars and beams by world position, so they get
  // textures of their own that repeat.
  private readonly gateFaceTexture: Texture;
  private readonly gateTopTexture: Texture;
  // Floor chunks already baked, by chunk index (row * chunk cols + col).
  private readonly floorChunks = new Map<number, Sprite>();
  private shownChunks: Sprite[] = [];
  // Wall views by cell index (row * cols + col), and the ones out of use.
  private readonly walls = new Map<number, WallView>();
  private readonly spareWalls: WallView[] = [];
  private readonly gates: GateView[] = [];
  private frameCount = 0;

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
    const t = tiles.tileSize;
    const grid = tiles.wallFaceGrid;
    this.gateFaceTexture = paintTexture(t * grid, tiles.wallHeight, (ctx) => {
      for (let i = 0; i < grid; i++) this.paintTile(ctx, `gate_face_${i}`, i * t, 0);
    });
    this.gateTopTexture = paintTexture(t, t, (ctx) => this.paintTile(ctx, "gate_top_0", 0, 0));
  }

  get wallHeight(): number {
    return this.tiles.wallHeight;
  }

  // Shows what is in view: the floor chunks, and the walls and gate leaves,
  // sorted by depth with the rest. Walls in front of `focus` (world pixels,
  // feet at the bottom) fade so it stays visible, and so does the floor around
  // `sight`: the body stretched towards where the player goes.
  show(view: View, focus: Box, sight: Box, leaves: Rect[]): void {
    this.showFloor(view);
    this.showWalls(view, focus, sight);
    this.showGates(leaves, focus, sight);
  }

  // Call when the maze changed (it grew): the floor is baked again lazily and
  // the walls are set up again for their new neighbours.
  invalidate(): void {
    for (const chunk of this.floorChunks.values()) chunk.destroy({ texture: true, textureSource: true });
    this.floorChunks.clear();
    this.shownChunks = [];
    for (const wall of this.walls.values()) this.releaseWall(wall);
    this.walls.clear();
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
        if (this.map.isWall(col, row)) continue;
        const x = col * t - cx * size;
        const y = row * t - cy * size;
        tiles.addChild(placed(new Sprite(this.textures.get(this.floorTile(col, row))), x, y));
        if (this.map.isWall(col, row - 1)) tiles.addChild(placed(new Sprite(this.shadowTexture), x, y));
      }
    }
    const texture = RenderTexture.create({ width: size, height: size });
    this.renderer.render({ container: tiles, target: texture, clear: true, clearColor: [0, 0, 0, 0] });
    tiles.destroy({ children: true });
    const chunk = placed(new Sprite(texture), cx * size, cy * size);
    this.floor.addChild(chunk);
    return chunk;
  }

  // Wall cells in view. Includes rows below the screen, whose raised tops
  // reach up into it.
  private showWalls(view: View, focus: Box, sight: Box): void {
    const t = this.map.tileSize;
    const frame = ++this.frameCount;
    const { c0, c1, r0, r1 } = this.visibleCells(view, Math.ceil(this.wallHeight / t));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!this.map.isWall(col, row)) continue;
        const key = row * this.map.cols + col;
        let wall = this.walls.get(key);
        if (!wall) {
          wall = this.spareWalls.pop() ?? this.createWall();
          this.setUpWall(wall, col, row);
          this.walls.set(key, wall);
        }
        wall.seen = frame;
        const depthY = (row + 1) * t;
        wall.root.alpha = this.fades(depthY, focus, sight) ? this.fadeAlpha(col, row, sight) : 1;
      }
    }
    for (const [key, wall] of this.walls) {
      if (wall.seen === frame) continue;
      this.releaseWall(wall);
      this.walls.delete(key);
    }
  }

  private createWall(): WallView {
    const t = this.map.tileSize;
    const h = this.wallHeight;
    const wall: WallView = {
      root: new Container(),
      face: new Sprite(),
      faceLeft: solidRect(EDGE_COLOR, EDGE_ALPHA, 1, h),
      faceRight: solidRect(EDGE_COLOR, EDGE_ALPHA, 1, h),
      top: new Sprite(),
      topEdge: solidRect(EDGE_COLOR, EDGE_ALPHA, t, 2),
      topLeft: solidRect(EDGE_COLOR, EDGE_ALPHA, 1, t),
      topRight: solidRect(EDGE_COLOR, EDGE_ALPHA, 1, t),
      seen: 0,
    };
    wall.root.addChild(wall.face, wall.faceLeft, wall.faceRight, wall.top, wall.topEdge, wall.topLeft, wall.topRight);
    this.depth.addChild(wall.root);
    return wall;
  }

  // Points the wall's sprites at the cell (col, row): its face, top and the
  // edges that show where it meets open space.
  private setUpWall(wall: WallView, col: number, row: number): void {
    const t = this.map.tileSize;
    const h = this.wallHeight;
    const x = col * t;
    const topY = row * t - h;
    const faceY = (row + 1) * t - h;
    const face = this.hasFace(col, row);
    const openLeft = !this.map.isWall(col - 1, row);
    const openRight = !this.map.isWall(col + 1, row);
    const grid = this.tiles.wallTopGrid;

    wall.root.visible = true;
    wall.root.zIndex = depthOf((row + 1) * t, DEPTH.wall);
    wall.face.visible = face;
    wall.face.texture = this.textures.get(`wall_face_${col % this.tiles.wallFaceGrid}`)!;
    wall.face.position.set(x, faceY);
    wall.faceLeft.visible = face && openLeft;
    wall.faceLeft.position.set(x, faceY);
    wall.faceRight.visible = face && openRight;
    wall.faceRight.position.set(x + t - 1, faceY);
    wall.top.texture = this.textures.get(`wall_top_${(row % grid) * grid + (col % grid)}`)!;
    wall.top.position.set(x, topY);
    wall.topEdge.visible = !this.map.isWall(col, row - 1);
    wall.topEdge.position.set(x, topY);
    wall.topLeft.visible = openLeft;
    wall.topLeft.position.set(x, topY);
    wall.topRight.visible = openRight;
    wall.topRight.position.set(x + t - 1, topY);
  }

  private releaseWall(wall: WallView): void {
    wall.root.visible = false;
    this.spareWalls.push(wall);
  }

  // The leaves of the gates of the central square, as solid blocks of their
  // exact size (they slide, so they are not whole tiles): iron bars in front,
  // wood on top. They fade in front of `focus` like the walls.
  private showGates(leaves: Rect[], focus: Box, sight: Box): void {
    const h = this.wallHeight;
    let shown = 0;
    for (const leaf of leaves) {
      if (leaf.w <= 0.5 || leaf.h <= 0.5) continue;
      const gate = (this.gates[shown] ??= this.createGate());
      shown++;
      const depthY = leaf.y + leaf.h;
      const top = leaf.y - h;
      gate.root.visible = true;
      gate.root.zIndex = depthOf(depthY, DEPTH.gate);
      gate.root.alpha = this.fades(depthY, focus, sight)
        ? this.fadeAlphaRect(leaf.x, top, leaf.x + leaf.w, depthY, sight)
        : 1;

      // Front: iron bars, tiled by world position so they do not slide with the leaf
      const x = Math.round(leaf.x);
      const w = Math.round(leaf.w);
      const faceTop = Math.round(leaf.y + leaf.h - h);
      gate.face.position.set(x, faceTop);
      gate.face.setSize(w, h);
      gate.face.tilePosition.set(-x, 0);

      // Top: wooden beam
      const topY = Math.round(top);
      const topH = Math.round(leaf.h);
      gate.top.position.set(x, topY);
      gate.top.setSize(w, topH);
      gate.top.tilePosition.set(-x, -topY);

      // Dark outline so the moving edge reads clearly
      const o = gate.outlined;
      if (o.x !== x || o.y !== topY || o.width !== w || o.height !== topH) {
        o.x = x;
        o.y = topY;
        o.width = w;
        o.height = topH;
        gate.outline
          .clear()
          .rect(x + 0.5, topY + 0.5, w - 1, topH - 1)
          .stroke({ width: 1, color: EDGE_COLOR, alpha: EDGE_ALPHA });
      }
    }
    for (let i = shown; i < this.gates.length; i++) this.gates[i].root.visible = false;
  }

  private createGate(): GateView {
    const gate: GateView = {
      root: new Container(),
      face: new TilingSprite({ texture: this.gateFaceTexture }),
      top: new TilingSprite({ texture: this.gateTopTexture }),
      outline: new Graphics(),
      outlined: new Rectangle(),
    };
    gate.root.addChild(gate.face, gate.top, gate.outline);
    this.depth.addChild(gate.root);
    return gate;
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

  // Copies one tile of the tileset into a texture being painted.
  private paintTile(ctx: CanvasRenderingContext2D, name: string, x: number, y: number): void {
    const f = this.tiles.frames[name];
    ctx.drawImage(this.tiles.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
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
