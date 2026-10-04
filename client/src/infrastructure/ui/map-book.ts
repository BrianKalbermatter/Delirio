// The map book: an open book over the game where the player draws the maze
// by hand. Only a black pencil (left button) and an eraser (right button).
// The game keeps running while it is open: drawing the map costs time.
//
// The drawing lives in its own layer at the book's pixel resolution, shown at
// the same integer scale as the game, so the strokes are pixel art too.
import type { LockedMouse } from "../input/locked-mouse";

const BOOK_W = 360;
const BOOK_H = 240;
const BORDER = 10; // leather around the pages
const GUTTER = 8; // shadow of the spine between the pages
const INK = "#1a1410";
const ERASER_SIZE = 6;

const LEATHER = ["#3a1e16", "#56301e", "#70402a"];
const PAPER = "#d9c9a3";
const PAPER_DARK = "#c7b58c";
const GOLD = "#c9a24a";
const GRID_DOT = "rgba(90, 70, 40, 0.18)";

type Point = { x: number; y: number };

export class MapBook {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cover: HTMLCanvasElement; // the book itself, drawn once
  private readonly ink: HTMLCanvasElement; // what the player drew
  private readonly inkCtx: CanvasRenderingContext2D;
  private last: Point | null = null; // previous point of the current stroke
  private dirty = true;

  constructor(root: HTMLElement) {
    this.element = document.createElement("canvas");
    this.element.className = "map-book";
    this.element.width = BOOK_W;
    this.element.height = BOOK_H;
    this.element.hidden = true;
    this.ctx = this.element.getContext("2d")!;
    root.appendChild(this.element);

    this.cover = paintCover();
    this.ink = document.createElement("canvas");
    this.ink.width = BOOK_W;
    this.ink.height = BOOK_H;
    this.inkCtx = this.ink.getContext("2d")!;
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
    this.last = null;
    this.dirty = true;
  }

  // Same pixel size as the game.
  setScale(scale: number): void {
    this.element.style.width = `${BOOK_W * scale}px`;
    this.element.style.height = `${BOOK_H * scale}px`;
  }

  // Called every frame: draws or erases while a button is held over the pages.
  update(mouse: LockedMouse): void {
    if (!this.isOpen) return;
    const erasing = mouse.rightHeld;
    const drawing = mouse.held && !erasing;
    const p = this.toBook(mouse.x, mouse.y);

    if ((drawing || erasing) && mouse.isOver(this.element) && onPage(p)) {
      if (drawing) this.pencil(this.last ?? p, p);
      else this.eraser(this.last ?? p, p);
      this.last = p;
      this.dirty = true;
    } else {
      this.last = null;
    }

    if (this.dirty) this.render();
  }

  // Window pixels -> book pixels.
  private toBook(x: number, y: number): Point {
    const rect = this.element.getBoundingClientRect();
    return {
      x: Math.floor(((x - rect.left) / rect.width) * BOOK_W),
      y: Math.floor(((y - rect.top) / rect.height) * BOOK_H),
    };
  }

  // 1-pixel black line, pixel by pixel (no smoothing), clipped to the pages.
  private pencil(from: Point, to: Point): void {
    this.inkCtx.fillStyle = INK;
    for (const p of line(from, to)) {
      if (onPage(p)) this.inkCtx.fillRect(p.x, p.y, 1, 1);
    }
  }

  private eraser(from: Point, to: Point): void {
    const half = Math.floor(ERASER_SIZE / 2);
    for (const p of line(from, to)) {
      this.inkCtx.clearRect(p.x - half, p.y - half, ERASER_SIZE, ERASER_SIZE);
    }
  }

  private render(): void {
    this.ctx.clearRect(0, 0, BOOK_W, BOOK_H);
    this.ctx.drawImage(this.cover, 0, 0);
    this.ctx.drawImage(this.ink, 0, 0);
    this.dirty = false;
  }
}

// Pages: inside the leather, outside the spine.
function onPage({ x, y }: Point): boolean {
  const inside = x >= BORDER && x < BOOK_W - BORDER && y >= BORDER && y < BOOK_H - BORDER;
  const spine = Math.abs(x - BOOK_W / 2) < GUTTER / 2;
  return inside && !spine;
}

// Every pixel between two points (Bresenham), so fast strokes have no gaps.
function line(a: Point, b: Point): Point[] {
  const points: Point[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === b.x && y === b.y) return points;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// The open book: leather cover, two old paper pages, the spine's shadow and a
// faint dot grid to help draw straight corridors.
function paintCover(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BOOK_W;
  canvas.height = BOOK_H;
  const c = canvas.getContext("2d")!;

  // Leather, lighter towards the inside edge
  c.fillStyle = LEATHER[0];
  c.fillRect(0, 0, BOOK_W, BOOK_H);
  c.fillStyle = LEATHER[1];
  c.fillRect(2, 2, BOOK_W - 4, BOOK_H - 4);
  c.fillStyle = LEATHER[2];
  c.fillRect(BORDER - 3, BORDER - 3, BOOK_W - (BORDER - 3) * 2, BOOK_H - (BORDER - 3) * 2);

  // Gold corners
  c.fillStyle = GOLD;
  for (const [x, y] of [[2, 2], [BOOK_W - 8, 2], [2, BOOK_H - 8], [BOOK_W - 8, BOOK_H - 8]]) {
    c.fillRect(x, y, 6, 2);
    c.fillRect(x + (x < BOOK_W / 2 ? 0 : 4), y, 2, 6);
  }

  // Pages, a bit darker near the edges and the spine
  c.fillStyle = PAPER_DARK;
  c.fillRect(BORDER, BORDER, BOOK_W - BORDER * 2, BOOK_H - BORDER * 2);
  c.fillStyle = PAPER;
  c.fillRect(BORDER + 2, BORDER + 1, BOOK_W - BORDER * 2 - 4, BOOK_H - BORDER * 2 - 2);

  // Paper grain
  for (let i = 0; i < 900; i++) {
    const x = BORDER + ((i * 97) % (BOOK_W - BORDER * 2));
    const y = BORDER + ((i * 53 + (i >> 3) * 17) % (BOOK_H - BORDER * 2));
    c.fillStyle = i % 3 === 0 ? PAPER_DARK : "#e2d4b0";
    c.fillRect(x, y, 1, 1);
  }

  // Dot grid
  c.fillStyle = GRID_DOT;
  for (let y = BORDER + 8; y < BOOK_H - BORDER; y += 8) {
    for (let x = BORDER + 8; x < BOOK_W - BORDER; x += 8) {
      c.fillRect(x, y, 1, 1);
    }
  }

  // Spine: shadow fading out from the middle
  const mid = BOOK_W / 2;
  for (let i = 0; i < 14; i++) {
    c.fillStyle = `rgba(60, 40, 20, ${0.35 * (1 - i / 14)})`;
    c.fillRect(mid - 1 - i, BORDER, 1, BOOK_H - BORDER * 2);
    c.fillRect(mid + i, BORDER, 1, BOOK_H - BORDER * 2);
  }
  c.fillStyle = LEATHER[0];
  c.fillRect(mid - 1, BORDER, 2, BOOK_H - BORDER * 2);

  return canvas;
}
