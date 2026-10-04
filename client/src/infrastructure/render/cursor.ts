// The game's own mouse pointer (the system one is hidden while the mouse is
// locked) and the marker on the floor where the player was sent.

// Pixel-art pointers. Each has its own palette (index -> color, " " = empty)
// and its hot spot: the pixel that points, draws or erases.
interface Shape {
  rows: string[];
  colors: Record<string, string>;
  hotX: number;
  hotY: number;
}

// Arrow, tip at the top-left.
const ARROW_ROWS = [
  "2",
  "22",
  "212",
  "2112",
  "21112",
  "211112",
  "2111112",
  "21111112",
  "211112222",
  "2122112",
  "22 2112",
  "2   2112",
  "    2112",
  "     22",
];

// Pencil held diagonally, graphite tip at the bottom-left.
const PENCIL_ROWS = [
  "          222",
  "         23332",
  "        244432",
  "       2111442",
  "      2111112 ",
  "     2111112  ",
  "    2111112   ",
  "   2111112    ",
  "  2555112     ",
  " 2665552      ",
  " 26655 2      ",
  "2772 22       ",
  "272           ",
  "22            ",
];

// Eraser block, the clean edge at the bottom-left.
const ERASER_ROWS = [
  "     22222",
  "    211112",
  "   2111122",
  "  21111232",
  " 211112332",
  "2444423322",
  "24444232 ",
  "2444432  ",
  "2444422  ",
  " 22222   ",
];

const OUTLINE = "#0d0b12";
const SHAPES = {
  arrow: { rows: ARROW_ROWS, colors: { "1": "#d8cfb8", "2": OUTLINE }, hotX: 0, hotY: 0 },
  pencil: {
    rows: PENCIL_ROWS,
    colors: {
      "1": "#d9a63a", // yellow body
      "2": OUTLINE,
      "3": "#d98a9a", // eraser cap
      "4": "#9aa0a8", // metal band
      "5": "#e8d3a8", // sharpened wood
      "6": "#c9b48a",
      "7": "#1a1612", // graphite
    },
    hotX: 1,
    hotY: 12,
  },
  eraser: {
    rows: ERASER_ROWS,
    colors: { "1": "#e8a3b0", "2": OUTLINE, "3": "#b5707d", "4": "#f2ece0" },
    hotX: 1,
    hotY: 8,
  },
} satisfies Record<string, Shape>;

export type CursorShape = keyof typeof SHAPES;

const MARKER = "rgba(216, 207, 184, 0.8)";

// Pointer drawn over the whole page (game and panel), as a DOM element so it
// can move above the side panel too. It never catches clicks.
export class CursorOverlay {
  private readonly el: HTMLCanvasElement;
  private shape: CursorShape = "arrow";
  private scale = 1;

  constructor() {
    this.el = document.createElement("canvas");
    this.el.className = "cursor";
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.paint();
  }

  // Same pixel size as the game, so the pointer matches the art.
  setScale(scale: number): void {
    this.scale = scale;
    this.resize();
  }

  setShape(shape: CursorShape): void {
    if (shape === this.shape) return;
    this.shape = shape;
    this.paint();
  }

  // (x, y): where the pointer points, in window pixels.
  update(visible: boolean, x: number, y: number): void {
    this.el.hidden = !visible;
    if (!visible) return;
    const { hotX, hotY } = SHAPES[this.shape];
    const left = Math.round(x - hotX * this.scale);
    const top = Math.round(y - hotY * this.scale);
    this.el.style.transform = `translate(${left}px, ${top}px)`;
  }

  private paint(): void {
    const { rows, colors } = SHAPES[this.shape] as Shape;
    this.el.width = Math.max(...rows.map((row) => row.length));
    this.el.height = rows.length;
    const ctx = this.el.getContext("2d")!;
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === " ") return;
        ctx.fillStyle = colors[cell];
        ctx.fillRect(x, y, 1, 1);
      });
    });
    this.resize();
  }

  private resize(): void {
    this.el.style.width = `${this.el.width * this.scale}px`;
    this.el.style.height = `${this.el.height * this.scale}px`;
  }
}

// Flattened ring on the floor (world coordinates), pulsing with `timeMs`.
export function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeMs: number,
): void {
  const pulse = 1 + 0.15 * Math.sin(timeMs / 120);
  ctx.strokeStyle = MARKER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), 7 * pulse, 3.5 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
}
