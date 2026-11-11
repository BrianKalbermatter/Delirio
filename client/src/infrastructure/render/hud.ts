// What the game shows over the world, in screen pixels: the hurt flash,
// the moon clock (the lunar calendar, the day's phase, the maze and the
// gates) at the top center, the banners (the maze grows, you
// died) and the key prompt above the player. Text is rasterized at the game's
// own resolution, so it is upscaled with the pixel art.
import {
  CanvasTextMetrics,
  Container,
  fontStringFromTextStyle,
  Graphics,
  Sprite,
  Text,
  type TextStyleOptions,
  type Texture,
} from "pixi.js";
import type { CalendarState, ClockState } from "../wasm/game-wasm";
import { paintTexture, solidRect } from "./textures";

const CLOCK_FONT: TextStyleOptions = { fontFamily: "monospace", fontSize: 12, fontWeight: "bold" };
const RED = "#d95763";
const HURT_FLASH_MS = 300;
const HURT_FLASH_ALPHA = 0.3;
const PHASE_COLOR = { DIA: "#d8cfb8", TARDE: "#e0a458", NOCHE: "#8f86c9" };
export const KEY_PROMPT_SIZE = 13;
// The moon clock, in the colours of the "Reloj lunar Delirio" design: a night
// blue dial, the moon in cream, and each stretch of the month in its colour.
const MOON_PANEL = 0x0e1322;
const MOON_EDGE = 0x343c5c;
const DIAL_FACE = 0x141a2e;
const MOON_DARK = "#232a44";
const MOON_LIT = "#efe6d2";
const MOON_TEXT = "#efe6d2";
const STRETCH_COLOR = [0xd9a441, 0xefe6d2, 0xe07a62]; // waxing, full, waning (calendario.h)
const TINY_FONT: TextStyleOptions = { fontFamily: "monospace", fontSize: 9, fontWeight: "bold" };
const MOON_SIZE = 22; // px across
const DAYS_IN_MONTH = 30;
const DIAL_R = 96; // the clock's radius: half of it shows
const RING_IN = 80; // the days' ring, from here to DIAL_R
const SUB_R = 15; // the small dials
const SUB_DX = 54; // where they are from the centre
const SUB_DY = 22;
// How long each phase of the day lasts and when the maze first grows
// (src/mecanicas/mecanica.h, game times).
const PHASE_MS = { DIA: 3 * 60000, TARDE: 60000, NOCHE: 6 * 60000 };
const FIRST_GROWTH_MS = 30000;

type DialIcon = "sun" | "moon" | "maze" | "gateOpen" | "gateShut";
interface Dial {
  progress: number;
  color: string;
  text: string;
  icon: DialIcon;
}

// 0..1 of today gone by: days start at dawn and go through dusk and night.
function dayFraction(clock: ClockState): number {
  const before = clock.phase === "DIA" ? 0 : clock.phase === "TARDE" ? PHASE_MS.DIA : PHASE_MS.DIA + PHASE_MS.TARDE;
  const done = before + PHASE_MS[clock.phase] - clock.phaseLeftMs;
  return Math.min(1, Math.max(0, done / (PHASE_MS.DIA + PHASE_MS.TARDE + PHASE_MS.NOCHE)));
}

// The small dials' icons, 7x5 px from (x, y).
const ICONS: Record<DialIcon, string[]> = {
  sun: ["..#.#..", "...#...", ".#####.", "...#...", "..#.#.."],
  moon: ["..###..", ".##....", ".##....", ".##....", "..###.."],
  maze: ["#######", "#.....#", "#.###.#", "#...#.#", "#####.#"],
  gateOpen: ["##...##", "#.....#", "#.....#", "#.....#", "#.....#"],
  gateShut: ["#######", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#"],
};

function drawIcon(g: Graphics, icon: DialIcon, x: number, y: number, color: string): void {
  ICONS[icon].forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "#") g.rect(x + c, y + r, 1, 1);
  });
  g.fill(color);
}

// Where each text's baseline is, in px below its top edge.
const baselines = new WeakMap<Text, number>();

// Text whose baseline falls on a whole pixel of its texture, so it stays as
// crisp as canvas text drawn at a whole y. Pixi puts the baseline at the
// font's measured ascent, often fractional; a taller line moves it down to
// the next whole pixel (the line's extra height is split above and below).
export function pixelText(style: TextStyleOptions, text = ""): Text {
  const label = new Text({ text, style });
  const { ascent, descent } = CanvasTextMetrics.measureFont(fontStringFromTextStyle(label.style));
  const baseline = Math.ceil(ascent);
  label.style.lineHeight = ascent + descent + 2 * (baseline - ascent);
  baselines.set(label, baseline);
  return label;
}

// Places a pixelText the way a canvas fillText would: (x, y) on its
// baseline, and starting at x or centered on it.
export function placeText(text: Text, x: number, y: number, align: "left" | "center" = "left"): void {
  const left = align === "center" ? x - text.width / 2 : x;
  text.position.set(Math.round(left), Math.round(y) - (baselines.get(text) ?? 0));
}

// m:ss
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// A key cap with an "E", for when an item to pick up with E is in reach.
// Built once; its owner moves it and shows or hides it.
export function createKeyPrompt(): Graphics {
  const s = KEY_PROMPT_SIZE;
  const g = new Graphics()
    .rect(0, 0, s, s)
    .fill("#1a1622")
    .rect(1, 1, s - 2, s - 3) // key face
    .fill("#e8e0c8")
    .rect(1, s - 2, s - 2, 1) // key side
    .fill("#a89a7c");
  // The letter E, drawn in pixels so it stays sharp: a stem and three bars.
  const lx = 4;
  const ly = 3;
  for (const [x, y, w, h] of [
    [lx, ly, 1, 6],
    [lx, ly, 5, 1],
    [lx, ly + 2, 4, 1],
    [lx, ly + 5, 5, 1],
  ]) {
    g.rect(x, y, w, h);
  }
  return g.fill("#1a1622");
}

export class Hud {
  // Screen space, over everything else. The owner adds it to the stage.
  readonly view = new Container();
  // A red flash over the screen when an enemy hits the player.
  private readonly hurtFlash = solidRect(0xb01a28);
  private hurtAt = -Infinity;
  // Bottom center, the moon clock (showClock).
  private readonly clockBox = new Graphics();
  private readonly moon = new Sprite();
  private readonly moons = new Map<number, Texture>(); // by frame (day of the month - 1)
  private readonly dayLine = pixelText({ ...CLOCK_FONT, fontSize: 11, fill: MOON_TEXT });
  private readonly phaseDial = pixelText(TINY_FONT);
  private readonly growthDial = pixelText(TINY_FONT);
  private readonly gatesDial = pixelText(TINY_FONT);
  private readonly growthBanner = pixelText({ ...CLOCK_FONT, fontSize: 16, fill: "#e0a458" }, "THE MAZE GROWS");
  // Death: red flash fading out, and the message.
  private readonly deathFlash = solidRect(0x7a0f18);
  private readonly deathBanner = pixelText({ ...CLOCK_FONT, fontSize: 18, fill: RED }, "YOU DIED");
  // Bottom center during a boss fight: its name and life.
  private readonly bossBox = solidRect(0x090710, 0.72);
  private readonly bossBack = solidRect(0x3a1820);
  private readonly bossLife = solidRect(0xd95763);
  private readonly bossName = pixelText({ ...CLOCK_FONT, fill: "#f0e6d0" });

  constructor() {
    this.hurtFlash.alpha = 0;
    this.view.addChild(
      this.hurtFlash,
      this.clockBox,
      this.moon,
      this.dayLine,
      this.phaseDial,
      this.growthDial,
      this.gatesDial,
      this.growthBanner,
      this.bossBox,
      this.bossBack,
      this.bossLife,
      this.bossName,
      this.deathFlash,
      this.deathBanner,
    );
  }

  // The hurt flash fades out over HURT_FLASH_MS.
  showHurtFlash(): void {
    const t = (performance.now() - this.hurtAt) / HURT_FLASH_MS;
    this.hurtFlash.alpha = t < 1 ? HURT_FLASH_ALPHA * (1 - t) : 0;
  }

  // An enemy hit the player: flash the screen red.
  hurt(): void {
    this.hurtAt = performance.now();
  }

  // The moon clock, half of it rising from the bottom edge of the screen
  // (`height`), centered on `width`. The ring of the month's days turns
  // slowly all day long, so today slides under the pointer at the top; in
  // the middle, today's moon and name; and three small dials for the rest:
  // the day's phase, the maze growing and the gates, each a sweep that fills
  // and the time left. `gateOpening`: 1 open, 0 closed.
  showClock(clock: ClockState, calendar: CalendarState, gateOpening: number, width: number, height: number, nowMs: number): void {
    const cx = Math.round(width / 2);
    const cy = height;
    const g = this.clockBox.clear();
    g.circle(cx, cy, DIAL_R).fill({ color: MOON_PANEL, alpha: 0.9 }).stroke({ color: MOON_EDGE, width: 1 });
    g.circle(cx, cy, RING_IN).stroke({ color: MOON_EDGE, width: 1 });
    this.drawDays(g, calendar, dayFraction(clock), cx, cy);

    // Today: the moon and its name.
    this.moon.texture = this.moonTexture(calendar.frame);
    this.moon.position.set(cx - MOON_SIZE / 2, cy - 78);
    this.dayLine.text = calendar.hudText.replace(/^Mes de /, "");
    placeText(this.dayLine, cx, cy - 45, "center");

    const blink = Math.floor(nowMs / 300) % 2 === 0;
    // The day's phase: how much of it went by.
    const phaseMs = PHASE_MS[clock.phase];
    this.drawDial(g, this.phaseDial, cx - SUB_DX, cy - SUB_DY, {
      progress: 1 - clock.phaseLeftMs / phaseMs,
      color: PHASE_COLOR[clock.phase],
      text: formatMs(clock.phaseLeftMs),
      icon: clock.phase === "NOCHE" ? "moon" : "sun",
    });
    // The maze: the first growth comes soon after the start, then one each
    // nightfall, until it is full size.
    const next = clock.nextExpansionMs;
    const growthSpan = clock.expansions === 0 ? FIRST_GROWTH_MS : PHASE_MS.DIA + PHASE_MS.TARDE + PHASE_MS.NOCHE;
    const urgent = next >= 0 && next <= 10000;
    this.drawDial(g, this.growthDial, cx, cy - SUB_DY + 4, {
      progress: next < 0 ? 1 : 1 - next / growthSpan,
      color: next < 0 ? "#5a5f78" : urgent && blink ? RED : "#e0a458",
      text: next < 0 ? "FULL" : formatMs(next),
      icon: "maze",
    });
    // The gates: open by day and dusk, closed at night; red while closing.
    const closing = clock.gatesOpen && gateOpening < 1 && clock.phase === "TARDE";
    const gatesSpan = clock.gatesOpen ? PHASE_MS.DIA + PHASE_MS.TARDE : PHASE_MS.NOCHE;
    this.drawDial(g, this.gatesDial, cx + SUB_DX, cy - SUB_DY, {
      progress: 1 - clock.gatesChangeMs / gatesSpan,
      color: closing && blink ? RED : clock.gatesOpen ? "#7ccf7a" : "#8f86c9",
      text: formatMs(clock.gatesChangeMs),
      icon: clock.gatesOpen ? "gateOpen" : "gateShut",
    });
  }

  // The ring of the month's days, today `turn` days round (it moves on all
  // day): each day a dot in its stretch's colour, those gone dimmed, today's
  // bigger; a notch where the stretches meet, and the pointer on top.
  private drawDays(g: Graphics, calendar: CalendarState, dayDone: number, cx: number, cy: number): void {
    const today = calendar.dayOfMonth - 1;
    const turn = today + dayDone;
    const at = (days: number, r: number): [number, number] => {
      const a = ((days * 360) / DAYS_IN_MONTH - 90) * (Math.PI / 180);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const ringMid = (RING_IN + DIAL_R) / 2;
    for (let i = 0; i < DAYS_IN_MONTH; i++) {
      // Days from the pointer, -15..15, so the ring wraps round.
      const off = ((((i - turn) % DAYS_IN_MONTH) + DAYS_IN_MONTH * 1.5) % DAYS_IN_MONTH) - DAYS_IN_MONTH / 2;
      if (Math.abs(off) > DAYS_IN_MONTH / 4 + 1) continue; // below the edge
      if (i % 10 === 0) {
        const [x0, y0] = at(off - 0.5, RING_IN);
        const [x1, y1] = at(off - 0.5, DIAL_R);
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: MOON_EDGE, width: 1 });
      }
      const [x, y] = at(off, ringMid);
      const size = i === today ? 6 : i === 0 || i === DAYS_IN_MONTH - 1 ? 4 : 3;
      const color = STRETCH_COLOR[Math.floor(i / 10)];
      g.rect(Math.round(x - size / 2), Math.round(y - size / 2), size, size).fill({ color, alpha: i < today ? 0.35 : 1 });
    }
    // The pointer: a small gold wedge over the ring's top.
    const top = cy - DIAL_R;
    g.poly([cx - 4, top - 5, cx + 4, top - 5, cx, top + 1]).fill(STRETCH_COLOR[0]);
  }

  // A small dial: its face, the sweep of `progress` (0..1) round its edge
  // from the top, an icon over the time left.
  private drawDial(g: Graphics, label: Text, x: number, y: number, dial: Dial): void {
    g.circle(x, y, SUB_R).fill(DIAL_FACE).stroke({ color: MOON_EDGE, width: 1 });
    const p = Math.min(1, Math.max(0, dial.progress));
    if (p > 0) {
      const start = -Math.PI / 2;
      const r = SUB_R - 2;
      g.moveTo(x + Math.cos(start) * r, y + Math.sin(start) * r)
        .arc(x, y, r, start, start + p * Math.PI * 2)
        .stroke({ color: dial.color, width: 2 });
    }
    drawIcon(g, dial.icon, Math.round(x) - 3, Math.round(y) - 9, dial.color);
    label.text = dial.text;
    label.style.fill = dial.color;
    placeText(label, x, y + 7, "center");
  }

  // The moon on day `frame` + 1 of the month, drawn pixel by pixel: the dark
  // disk, and the lit part between the edge and the terminator (an ellipse
  // that sweeps across it), lit on the right while it waxes.
  private moonTexture(frame: number): Texture {
    let texture = this.moons.get(frame);
    if (texture) return texture;
    const phase = frame / DAYS_IN_MONTH; // 0 new, 0.5 full
    const k = Math.cos(2 * Math.PI * phase);
    const r = MOON_SIZE / 2 - 1;
    texture = paintTexture(MOON_SIZE, MOON_SIZE, (ctx) => {
      for (let py = 0; py < MOON_SIZE; py++) {
        for (let px = 0; px < MOON_SIZE; px++) {
          const x = px + 0.5 - MOON_SIZE / 2;
          const y = py + 0.5 - MOON_SIZE / 2;
          const d = Math.hypot(x, y);
          if (d > r + 1) continue;
          if (d > r) {
            ctx.fillStyle = `#${MOON_EDGE.toString(16).padStart(6, "0")}`;
          } else {
            const w = Math.sqrt(r * r - y * y);
            const lit = phase < 0.5 ? x > k * w : x < -k * w;
            ctx.fillStyle = lit ? MOON_LIT : MOON_DARK;
          }
          ctx.fillRect(px, py, 1, 1);
        }
      }
    });
    this.moons.set(frame, texture);
    return texture;
  }

  // The boss the player is fighting (null: none), at the top of the screen
  // (the bottom is the moon clock's).
  showBoss(boss: { name: string; life: number; lifeMax: number } | null, width: number): void {
    const shown = boss !== null;
    this.bossBox.visible = this.bossBack.visible = this.bossLife.visible = this.bossName.visible = shown;
    if (!boss) return;
    const barWidth = Math.min(320, width - 40);
    const left = Math.round(width / 2 - barWidth / 2);
    const top = 30;
    this.bossBox.position.set(left - 8, top - 18);
    this.bossBox.setSize(barWidth + 16, 34);
    this.bossName.text = boss.name.toUpperCase();
    placeText(this.bossName, Math.round(width / 2), top - 4, "center");
    this.bossBack.position.set(left, top + 2);
    this.bossBack.setSize(barWidth, 6);
    this.bossLife.position.set(left, top + 2);
    this.bossLife.setSize(Math.max(0, Math.round((barWidth * boss.life) / boss.lifeMax)), 6);
  }

  // Time left of each banner; deathTotalMs is how long the death one lasts.
  showBanners(growthMs: number, deathMs: number, deathTotalMs: number, width: number, height: number): void {
    const cx = Math.round(width / 2);
    this.growthBanner.visible = growthMs > 0;
    this.growthBanner.alpha = Math.min(1, growthMs / 600);
    placeText(this.growthBanner, cx, 104, "center");

    this.hurtFlash.setSize(width, height);
    const dying = deathMs > 0;
    this.deathFlash.visible = this.deathBanner.visible = dying;
    if (!dying) return;
    const t = deathMs / deathTotalMs;
    this.deathFlash.alpha = 0.45 * t * t;
    this.deathFlash.setSize(width, height);
    this.deathBanner.alpha = Math.min(1, deathMs / 600);
    placeText(this.deathBanner, cx, Math.round(height / 2) - 40, "center");
  }
}
