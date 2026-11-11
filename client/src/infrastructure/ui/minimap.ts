// The round minimap over the game: the floor a little past what the screen
// shows, with small symbols on it. A place you have had on screen shows what it
// is, and stays on the rim once it is out of range, pointing the way; one you
// have not seen yet shows as a "?" when it comes into range.
import type { Square } from "../../domain/square";
import type { TileMap } from "../../domain/tile-map";
import { framePixels, type SpriteSheet } from "../render/sprite-sheet";

const SIZE = 124; // px of the map, at the game's scale
const MARK_PX = 2; // each pixel of a place's symbol is this big, so they read well
const RANGE_PAST_VIEW = 1.6; // how far it reaches, in halves of the view's longest side
const REDRAW_MS = 100;
const RIM = 9; // px from the edge where the far ones stay
// The canvas has this many pixels per map px: the player's head is drawn on
// them at its own size, so it is small but keeps every pixel.
const DETAIL = 2;
const HEAD_OUTLINE = "#0b0a10";

const WALL = "#1b1d26";
const FLOOR = "#a08a62";
const GRASS = "#4f8a3c";
const FOREST = "#2c4a30";
const LAVA = "#c8481e";
const GATE = "#7a5230";
const ENEMY = "#e0413e";

export type MarkKind = "shrine" | "shrine_asleep" | "bonfire" | "bonfire_out" | "boss";

// A place worth showing. `key` remembers it was found.
export interface Mark {
  key: string;
  kind: MarkKind;
  x: number;
  y: number;
}

// 7x7 symbols: each character a colour of its palette, "." nothing.
const SYMBOLS: Record<MarkKind | "unknown", { rows: string[]; colors: Record<string, string> }> = {
  shrine: {
    rows: ["...a...", "..aba..", ".abbba.", "..aba..", "..aba..", ".aaaaa.", "......."],
    colors: { a: "#f2c94c", b: "#fff4c0" },
  },
  shrine_asleep: {
    rows: ["...a...", "..aba..", ".abbba.", "..aba..", "..aba..", ".aaaaa.", "......."],
    colors: { a: "#8a8a9a", b: "#c0c0cc" },
  },
  bonfire: {
    rows: ["...a...", "..aa...", "..aba..", ".abbba.", ".abcba.", "..bcb..", ".ddddd."],
    colors: { a: "#f2e24c", b: "#fff08a", c: "#ffffff", d: "#6a5a30" },
  },
  bonfire_out: {
    rows: [".......", ".......", ".......", ".......", "..a.a..", ".aaaaa.", "a.aaa.a"],
    colors: { a: "#8a8a7a" },
  },
  boss: {
    rows: [".aaaaa.", "aaaaaaa", "abaaaba", "aaaaaaa", ".aaaaa.", ".a.a.a.", "......."],
    colors: { a: "#ff5a4a", b: "#1b1016" },
  },
  unknown: {
    rows: ["..aaa..", ".a...a.", "....a..", "...a...", "...a...", ".......", "...a..."],
    colors: { a: "#d8cfb8" },
  },
};

export class Minimap {
  private readonly element = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly found: Set<string>;
  private waitMs = 0;

  constructor(
    root: HTMLElement,
    private readonly map: TileMap,
    private readonly square: Square,
    found: string[],
    // The player's mark: its head (playerHead).
    private readonly head: HTMLCanvasElement,
  ) {
    this.found = new Set(found);
    this.element.className = "minimap";
    this.element.width = SIZE * DETAIL;
    this.element.height = SIZE * DETAIL;
    this.ctx = this.element.getContext("2d")!;
    root.appendChild(this.element);
  }

  get foundKeys(): string[] {
    return [...this.found];
  }

  setScale(scale: number): void {
    this.element.style.width = `${SIZE * scale}px`;
    this.element.style.height = `${SIZE * scale}px`;
  }

  // `view`: the screen's half size, world px. Returns true when something new
  // was found (to save it).
  update(
    dtMs: number,
    player: { x: number; y: number },
    view: { halfW: number; halfH: number },
    marks: Mark[],
    enemies: { x: number; y: number }[],
  ): boolean {
    let isNew = false;
    for (const mark of marks) {
      if (this.found.has(mark.key)) continue;
      if (Math.abs(mark.x - player.x) > view.halfW || Math.abs(mark.y - player.y) > view.halfH) continue;
      this.found.add(mark.key);
      isNew = true;
    }
    this.waitMs -= dtMs;
    if (this.waitMs > 0) return isNew;
    this.waitMs = REDRAW_MS;
    this.draw(player, Math.max(view.halfW, view.halfH) * RANGE_PAST_VIEW, marks, enemies);
    return isNew;
  }

  private draw(player: { x: number; y: number }, range: number, marks: Mark[], enemies: { x: number; y: number }[]): void {
    const { ctx } = this;
    const middle = SIZE / 2;
    const perPx = (range * 2) / SIZE; // world px in one of the map's
    ctx.setTransform(DETAIL, 0, 0, DETAIL, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(middle, middle, middle, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = WALL;
    ctx.fillRect(0, 0, SIZE, SIZE);
    this.drawFloor(player, range, perPx);
    const toMap = (x: number, y: number): [number, number] => [middle + (x - player.x) / perPx, middle + (y - player.y) / perPx];
    ctx.fillStyle = ENEMY;
    for (const e of enemies) {
      const [x, y] = toMap(e.x, e.y);
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
    for (const mark of marks) this.drawMark(mark, toMap(mark.x, mark.y));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { head } = this;
    ctx.drawImage(head, Math.round(middle * DETAIL - head.width / 2), Math.round(middle * DETAIL - head.height / 2));
    ctx.restore();
  }

  private drawFloor(player: { x: number; y: number }, range: number, perPx: number): void {
    const { ctx, map } = this;
    const t = map.tileSize;
    const size = Math.ceil(t / perPx);
    const fromCol = Math.floor((player.x - range) / t);
    const toCol = Math.ceil((player.x + range) / t);
    const fromRow = Math.floor((player.y - range) / t);
    const toRow = Math.ceil((player.y + range) / t);
    for (let row = fromRow; row <= toRow; row++) {
      for (let col = fromCol; col <= toCol; col++) {
        const color = this.colorOf(col, row);
        if (!color) continue;
        ctx.fillStyle = color;
        const x = SIZE / 2 + (col * t - player.x) / perPx;
        const y = SIZE / 2 + (row * t - player.y) / perPx;
        ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
      }
    }
  }

  private colorOf(col: number, row: number): string | null {
    const { map, square } = this;
    if (map.isDoor(col, row)) return GATE;
    if (map.isWall(col, row) || map.isPit(col, row)) return null;
    if (map.isLava(col, row)) return LAVA;
    if (!square.has(col, row)) return FLOOR;
    const t = map.tileSize;
    return square.inForest((col + 0.5) * t, (row + 0.5) * t) ? FOREST : GRASS;
  }

  // The symbol, or on the rim when out of range and already found.
  private drawMark(mark: Mark, [x, y]: [number, number]): void {
    const known = this.found.has(mark.key);
    const middle = SIZE / 2;
    const dx = x - middle;
    const dy = y - middle;
    const far = Math.hypot(dx, dy);
    const limit = middle - RIM;
    if (far > limit) {
      if (!known) return;
      x = middle + (dx / far) * limit;
      y = middle + (dy / far) * limit;
    }
    const symbol = SYMBOLS[known ? mark.kind : "unknown"];
    const left = Math.round(x) - 3 * MARK_PX - 1;
    const top = Math.round(y) - 3 * MARK_PX - 1;
    symbol.rows.forEach((line, r) => {
      [...line].forEach((key, c) => {
        if (key === ".") return;
        this.ctx.fillStyle = symbol.colors[key];
        this.ctx.fillRect(left + c * MARK_PX, top + r * MARK_PX, MARK_PX, MARK_PX);
      });
    });
  }
}

// The head of the first frame of `tag` in the player's sheet, with a dark
// outline: the rows from the top down to where the shoulders widen it.
export function playerHead(sheet: SpriteSheet, tag: string): HTMLCanvasElement {
  const frame = sheet.animations.get(tag)![0];
  const reader = document.createElement("canvas");
  reader.width = sheet.image.width;
  reader.height = sheet.image.height;
  const rctx = reader.getContext("2d", { willReadFrequently: true })!;
  rctx.drawImage(sheet.image, 0, 0);
  const pixels = framePixels(rctx, frame);
  const { w, h } = frame;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] > 0;
  // Each row's span of opaque pixels; the head ends at the first row much
  // wider than the one over it (a few rows in, past the top of the hair):
  // the shoulders.
  let top = -1;
  let bottom = h;
  let above = 0;
  let [x0, x1] = [w, -1];
  for (let y = 0; y < h; y++) {
    let lo = w;
    let hi = -1;
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (hi < 0) {
      if (top >= 0) break;
      continue;
    }
    if (top < 0) top = y;
    const width = hi - lo + 1;
    if (y - top >= 6 && width > above * 1.25) {
      bottom = y;
      break;
    }
    above = width;
    x0 = Math.min(x0, lo);
    x1 = Math.max(x1, hi);
  }
  const hw = x1 - x0 + 1;
  const hh = bottom - top;
  const head = document.createElement("canvas");
  head.width = hw + 2;
  head.height = hh + 2;
  const ctx = head.getContext("2d")!;
  const picture = ctx.createImageData(hw, hh);
  for (let y = 0; y < hh; y++) {
    picture.data.set(pixels.subarray(((top + y) * w + x0) * 4, ((top + y) * w + x1 + 1) * 4), y * hw * 4);
  }
  // The outline: every empty pixel next to the head.
  ctx.fillStyle = HEAD_OUTLINE;
  for (let y = -1; y <= hh; y++) {
    for (let x = -1; x <= hw; x++) {
      const inside = (px: number, py: number) => py >= 0 && py < hh && opaque(x0 + px, top + py);
      if (inside(x, y)) continue;
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  const picCanvas = document.createElement("canvas");
  picCanvas.width = hw;
  picCanvas.height = hh;
  picCanvas.getContext("2d")!.putImageData(picture, 0, 0);
  ctx.drawImage(picCanvas, 1, 1);
  return head;
}
