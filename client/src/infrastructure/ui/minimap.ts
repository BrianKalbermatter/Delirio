// The round minimap over the game: the floor a little past what the screen
// shows, with small symbols on it. A place you have had on screen shows what it
// is, and stays on the rim once it is out of range, pointing the way; one you
// have not seen yet shows as a "?" when it comes into range.
import type { Square } from "../../domain/square";
import type { TileMap } from "../../domain/tile-map";

const SIZE = 92; // px of the map, at the game's scale
const RANGE_PAST_VIEW = 1.6; // how far it reaches, in halves of the view's longest side
const REDRAW_MS = 100;
const RIM = 6; // px from the edge where the far ones stay

const WALL = "#1b1d26";
const FLOOR = "#a08a62";
const GRASS = "#4f8a3c";
const FOREST = "#2c4a30";
const LAVA = "#c8481e";
const GATE = "#7a5230";
const PLAYER = "#ffffff";
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
  ) {
    this.found = new Set(found);
    this.element.className = "minimap";
    this.element.width = SIZE;
    this.element.height = SIZE;
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
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    for (const mark of marks) this.drawMark(mark, toMap(mark.x, mark.y));
    ctx.fillStyle = "#000000";
    ctx.fillRect(middle - 2, middle - 2, 4, 4);
    ctx.fillStyle = PLAYER;
    ctx.fillRect(middle - 1, middle - 1, 2, 2);
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
    const left = Math.round(x) - 3;
    const top = Math.round(y) - 3;
    symbol.rows.forEach((line, r) => {
      [...line].forEach((key, c) => {
        if (key === ".") return;
        this.ctx.fillStyle = symbol.colors[key];
        this.ctx.fillRect(left + c, top + r, 1, 1);
      });
    });
  }
}
