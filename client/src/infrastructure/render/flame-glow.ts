// Warm light around a flame drawn in a sprite (the torch in the player's hand):
// a soft halo added over the screen, on the flame's pixels, flickering. It is
// light, so it shows by night and by day. At load time every frame is scanned
// for the flame's colors and their center is kept.
import { Container, Sprite, type Texture } from "pixi.js";
import { type Frame, framePixels, type SpriteSheet } from "./sprite-sheet";
import { paintTexture } from "./textures";

type Rgb = [number, number, number];

const HALO_RADIUS = 56; // px
const CORE_RADIUS = 16; // px, the hot spot on the flame itself

export class FlameGlow {
  // Screen space, over the darkness. The owner adds it to the stage.
  readonly view = new Container();
  private readonly centers = new Map<Frame, { cx: number; cy: number } | null>();
  private readonly halo: Sprite;
  private readonly core: Sprite;

  constructor(sheets: SpriteSheet[], flame: Rgb[], color: Rgb) {
    for (const sheet of sheets) {
      const canvas = document.createElement("canvas");
      canvas.width = sheet.image.width;
      canvas.height = sheet.image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(sheet.image, 0, 0);
      for (const frame of new Set(sheet.frames)) this.centers.set(frame, center(ctx, frame, flame));
    }
    this.halo = new Sprite(radial(HALO_RADIUS, color));
    this.core = new Sprite(radial(CORE_RADIUS, [255, 236, 170]));
    for (const light of [this.halo, this.core]) {
      light.blendMode = "add";
      light.anchor.set(0.5);
    }
    this.view.addChild(this.halo, this.core);
    this.view.visible = false;
  }

  // Where the flame is in `frame` (px from its top-left corner), or null when
  // the frame has no flame.
  centerOf(frame: Frame): { cx: number; cy: number } | null {
    return this.centers.get(frame) ?? null;
  }

  // Shows the light on the flame drawn in `frame` (none, or a frame without
  // flame, hides it), whose top-left corner is at (left, top) on screen.
  // `strength` 0..1 is how bright it is right now (the flicker).
  show(frame: Frame | null, left: number, top: number, strength: number): void {
    const c = frame ? this.centers.get(frame) : null;
    this.view.visible = !!c;
    if (!c) return;
    const x = Math.round(left + c.cx);
    const y = Math.round(top + c.cy);
    this.halo.position.set(x, y);
    this.halo.alpha = 0.45 * strength;
    this.halo.scale.set(0.9 + 0.1 * strength);
    this.core.position.set(x, y);
    this.core.alpha = 0.5 * strength;
  }
}

// Center of the pixels of `colors` in the frame, or null when it has none.
function center(ctx: CanvasRenderingContext2D, frame: Frame, colors: Rgb[]) {
  const pixels = framePixels(ctx, frame);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    if (!colors.some(([r, g, b]) => pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b)) continue;
    const p = i / 4;
    sumX += p % frame.w;
    sumY += Math.floor(p / frame.w);
    count++;
  }
  return count === 0 ? null : { cx: sumX / count + 0.5, cy: sumY / count + 0.5 };
}

// A disc of `color` fading out smoothly from the center to `radius`.
function radial(radius: number, color: Rgb): Texture {
  const size = radius * 2;
  return paintTexture(size, size, (ctx) => {
    const pixels = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.min(1, Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius);
        const a = (1 - r) * (1 - r);
        pixels.data.set([...color, Math.round(255 * a)], (y * size + x) * 4);
      }
    }
    ctx.putImageData(pixels, 0, 0);
  });
}
