// What the game shows over the world, in screen pixels: the medusa's life,
// the clock and gates at the top center, the banners (the maze grows, you
// died) and the key prompt above the player. Text is rasterized at the game's
// own resolution, so it is upscaled with the pixel art.
import {
  CanvasTextMetrics,
  Container,
  fontStringFromTextStyle,
  Graphics,
  Text,
  type TextStyleOptions,
} from "pixi.js";
import type { ClockState } from "../wasm/game-wasm";
import { solidRect } from "./textures";

const CLOCK_FONT: TextStyleOptions = { fontFamily: "monospace", fontSize: 12, fontWeight: "bold" };
const SMALL_FONT: TextStyleOptions = { fontFamily: "monospace", fontSize: 11 };
const MEDUSA_FONT: TextStyleOptions = { fontFamily: "monospace", fontSize: 10, fill: "#5fcde4" };
const RED = "#d95763";
const PHASE_NAME = { DIA: "DAY", TARDE: "DUSK", NOCHE: "NIGHT" };
const PHASE_COLOR = { DIA: "#d8cfb8", TARDE: "#e0a458", NOCHE: "#8f86c9" };
export const KEY_PROMPT_SIZE = 13;

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
  // Top left: the medusa's life.
  private readonly medusaLabel = pixelText(MEDUSA_FONT);
  // A 1 px line on whole pixel edges, as the canvas drew it: half over each
  // of the two pixels it straddles.
  private readonly medusaFrame = new Graphics().rect(12, 24, 120, 8).stroke({ width: 2, color: "#3a3445", alpha: 0.5 });
  private readonly medusaBar = solidRect(0x6a8a4a);
  // Top center: day and time left of the current phase, when the maze grows
  // next, and the gates.
  private readonly clockBox = solidRect(0x090710, 0.72);
  private readonly clockLine = pixelText(CLOCK_FONT);
  private readonly growthLine = pixelText(SMALL_FONT);
  private readonly gatesLine = pixelText(SMALL_FONT);
  private readonly growthBanner = pixelText({ ...CLOCK_FONT, fontSize: 16, fill: "#e0a458" }, "THE MAZE GROWS");
  // Death: red flash fading out, and the message.
  private readonly deathFlash = solidRect(0x7a0f18);
  private readonly deathBanner = pixelText({ ...CLOCK_FONT, fontSize: 18, fill: RED }, "YOU DIED");

  constructor() {
    this.medusaBar.position.set(13, 25);
    this.view.addChild(
      this.medusaLabel,
      this.medusaFrame,
      this.medusaBar,
      this.clockBox,
      this.clockLine,
      this.growthLine,
      this.gatesLine,
      this.growthBanner,
      this.deathFlash,
      this.deathBanner,
    );
  }

  showMedusa(life: number, max: number): void {
    const ratio = life / max;
    this.medusaLabel.text = `MEDUSA ${life} / ${max}${life === 0 ? "  DEAD - T reset" : ""}`;
    placeText(this.medusaLabel, 12, 18);
    this.medusaBar.tint = ratio > 0.3 ? 0x6a8a4a : 0xd95763;
    this.medusaBar.setSize(118 * ratio, 6);
  }

  // `gateOpening`: 1 open, 0 closed. A warning when the maze is about to grow
  // or the gates are closing.
  showClock(clock: ClockState, gateOpening: number, timeSpeed: number, width: number, nowMs: number): void {
    const line1 = `DAY ${clock.day}  ·  ${PHASE_NAME[clock.phase]} ${formatMs(clock.phaseLeftMs)}${timeSpeed > 1 ? `  ·  x${timeSpeed}` : ""}`;
    const next = clock.nextExpansionMs;
    const line2 =
      next < 0 ? "THE MAZE IS FULL SIZE"
      : clock.expansions === 0 ? `MAZE GROWS IN ${formatMs(next)}`
      : `MAZE GROWS AT NIGHTFALL  ${formatMs(next)}`;
    const urgent = next >= 0 && next <= 10000;
    const closing = clock.gatesOpen && gateOpening < 1 && clock.phase === "TARDE";
    const gates = !clock.gatesOpen
      ? `GATES CLOSED · OPEN IN ${formatMs(clock.gatesChangeMs)}`
      : closing
        ? `GATES CLOSING! ${formatMs(clock.gatesChangeMs)}`
        : `GATES OPEN · CLOSE IN ${formatMs(clock.gatesChangeMs)}`;

    const cx = Math.round(width / 2);
    // The box fits the widest line as measured in the bold font.
    const boxWidth = Math.max(...[line1, line2, gates].map((t) => measure(t, this.clockLine))) + 20;
    this.clockBox.position.set(Math.round(cx - boxWidth / 2), 6);
    this.clockBox.setSize(Math.round(boxWidth), 50);

    this.clockLine.text = line1;
    this.clockLine.style.fill = PHASE_COLOR[clock.phase];
    placeText(this.clockLine, cx, 20, "center");
    this.growthLine.text = line2;
    this.growthLine.style.fill = urgent && Math.floor(nowMs / 250) % 2 === 0 ? RED : "#b9b3a6";
    placeText(this.growthLine, cx, 35, "center");
    // Last minute before the gates close: red, blinking
    const blink = Math.floor(nowMs / 300) % 2 === 0;
    this.gatesLine.text = gates;
    this.gatesLine.style.fill = closing && blink ? RED : clock.gatesOpen ? "#7ccf7a" : "#8f86c9";
    placeText(this.gatesLine, cx, 49, "center");
  }

  // Time left of each banner; deathTotalMs is how long the death one lasts.
  showBanners(growthMs: number, deathMs: number, deathTotalMs: number, width: number, height: number): void {
    const cx = Math.round(width / 2);
    this.growthBanner.visible = growthMs > 0;
    this.growthBanner.alpha = Math.min(1, growthMs / 600);
    placeText(this.growthBanner, cx, 80, "center");

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

function measure(line: string, text: Text): number {
  return CanvasTextMetrics.measureText(line, text.style).width;
}
