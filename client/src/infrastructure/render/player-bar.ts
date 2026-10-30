// The player's own bar, above the head and following it: a thick life bar,
// the level beside it and the experience towards the next one under it.
// Screen space, after the darkness, so it shows at night too. Everything is
// whole-pixel rects (the level too, in a 3x5 pixel font) so it stays crisp
// when the canvas is upscaled.
import { Graphics } from "pixi.js";

const LIFE_WIDTH = 44; // px, inside the outline
const LIFE_HEIGHT = 6;
const XP_HEIGHT = 2;
// Outline, life, a line, experience, outline.
export const PLAYER_BAR_HEIGHT = 1 + LIFE_HEIGHT + 1 + XP_HEIGHT + 1;
const OUTLINE = 0x0d0a12;
// Each bar is a main colour with a lighter top row and a darker bottom one.
const LIFE_COLORS = { light: 0x99e550, main: 0x6abe30, dark: 0x37946e };
const LIFE_LOW_COLORS = { light: 0xf08a8a, main: 0xd95763, dark: 0xac3232 }; // under a third
const LIFE_EMPTY = { light: 0x3a2a40, main: 0x2a1f2e, dark: 0x1e1622 };
const XP_COLORS = { light: 0xb8f0f8, main: 0x5fcde4 };
const XP_EMPTY = 0x1e2433;
// The life just lost, shown as a pale chunk that shrinks after the hit.
const TRAIL_COLOR = 0xf4e8d0;
const TRAIL_SPEED = 0.6; // of the bar per second
const BADGE_FILL = 0x3a2a1a;
const BADGE_RIM = 0xfbb954;
const DIGIT_COLOR = 0xfff1c4;

// 3x5 digits, one string per row.
const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "011", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};
const DIGIT_W = 3;
const DIGIT_H = 5;

export interface PlayerBarState {
  life: number;
  lifeMax: number;
  level: number;
  xp: number;
  xpNext: number; // experience the level needs
}

type Shades = { light: number; main: number; dark?: number };

export class PlayerBar {
  readonly view = new Graphics();
  private trail = 1; // the pale chunk's end, as a fraction of the bar
  private shownAt = -1;

  // (x, bottom): the middle of the bar's bottom edge, in screen px.
  show({ life, lifeMax, level, xp, xpNext }: PlayerBarState, x: number, bottom: number): void {
    const lifeRatio = lifeMax > 0 ? Math.max(0, Math.min(1, life / lifeMax)) : 0;
    const xpRatio = xpNext > 0 ? Math.max(0, Math.min(1, xp / xpNext)) : 0;
    const now = performance.now();
    const dt = this.shownAt < 0 ? 0 : (now - this.shownAt) / 1000;
    this.shownAt = now;
    this.trail = lifeRatio >= this.trail ? lifeRatio : Math.max(lifeRatio, this.trail - TRAIL_SPEED * dt);

    const digits = String(level);
    const digitsW = digits.length * (DIGIT_W + 1) - 1;
    const badge = Math.max(PLAYER_BAR_HEIGHT, digitsW + 6); // outline + rim + 1 px each side
    const width = badge + 1 + LIFE_WIDTH + 2;
    const left = Math.round(x - width / 2);
    const top = Math.round(bottom) - PLAYER_BAR_HEIGHT;
    const g = this.view.clear();

    // The level: gold rim on a dark square, the number in the middle.
    g.rect(left, top, badge, PLAYER_BAR_HEIGHT).fill(OUTLINE);
    g.rect(left + 1, top + 1, badge - 2, PLAYER_BAR_HEIGHT - 2).fill(BADGE_RIM);
    g.rect(left + 2, top + 2, badge - 4, PLAYER_BAR_HEIGHT - 4).fill(BADGE_FILL);
    let dx = left + Math.floor((badge - digitsW) / 2);
    const dy = top + Math.floor((PLAYER_BAR_HEIGHT - DIGIT_H) / 2);
    for (const ch of digits) {
      drawDigit(g, ch, dx, dy);
      dx += DIGIT_W + 1;
    }

    // The bars, joined to the badge by its outline.
    const barsLeft = left + badge - 1;
    const inner = barsLeft + 1;
    g.rect(barsLeft, top, LIFE_WIDTH + 2, PLAYER_BAR_HEIGHT).fill(OUTLINE);
    const lifeTop = top + 1;
    bar(g, inner, lifeTop, LIFE_WIDTH, LIFE_HEIGHT, LIFE_EMPTY);
    const lifeW = Math.round(LIFE_WIDTH * lifeRatio);
    const trailW = Math.round(LIFE_WIDTH * this.trail);
    if (trailW > lifeW) g.rect(inner + lifeW, lifeTop, trailW - lifeW, LIFE_HEIGHT).fill(TRAIL_COLOR);
    bar(g, inner, lifeTop, lifeW, LIFE_HEIGHT, lifeRatio < 1 / 3 ? LIFE_LOW_COLORS : LIFE_COLORS);
    // Ticks every quarter, so how much is left reads at a glance.
    for (let q = 1; q < 4; q++) {
      g.rect(inner + Math.round((LIFE_WIDTH * q) / 4), lifeTop + 1, 1, LIFE_HEIGHT - 2).fill({
        color: OUTLINE,
        alpha: 0.35,
      });
    }
    const xpTop = lifeTop + LIFE_HEIGHT + 1;
    g.rect(inner, xpTop, LIFE_WIDTH, XP_HEIGHT).fill(XP_EMPTY);
    bar(g, inner, xpTop, Math.round(LIFE_WIDTH * xpRatio), XP_HEIGHT, XP_COLORS);
  }
}

// A bar `w` wide: lighter top row, main colour, darker bottom row.
function bar(g: Graphics, x: number, y: number, w: number, h: number, c: Shades): void {
  if (w <= 0) return;
  g.rect(x, y, w, h).fill(c.main);
  g.rect(x, y, w, 1).fill(c.light);
  if (c.dark !== undefined && h > 2) g.rect(x, y + h - 1, w, 1).fill(c.dark);
}

// One digit, with a 1 px shadow under it.
function drawDigit(g: Graphics, ch: string, x: number, y: number): void {
  const rows = DIGITS[ch];
  if (!rows) return;
  for (const color of [OUTLINE, DIGIT_COLOR]) {
    const oy = color === OUTLINE ? 1 : 0;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < DIGIT_W; rx++) if (row[rx] === "1") g.rect(x + rx, y + ry + oy, 1, 1);
    });
    g.fill(color);
  }
}
