// Breathing glow on the pixels of one color of a sprite (the player's cyan).
// At load time every frame is scanned and the pixels of that color are copied
// into two masks: a dark one (breathing out, the light dims) and a bright one
// (breathing in, the light blooms). Frames without that color (back views)
// glow nothing.
import type { Frame, SpriteSheet } from "./sprite-sheet";

interface FrameGlow {
  dim: HTMLCanvasElement;
  bright: HTMLCanvasElement;
  cx: number; // center of the glowing pixels, relative to the frame
  cy: number;
}

type Rgb = [number, number, number];

const DIM_COLOR: Rgb = [22, 58, 74]; // the cyan with the light off
const DIM_STRENGTH = 0.8; // how dark it gets at the bottom of the breath
const BLOOM_BLUR = "blur(3px)";
const HALO_RADIUS = 18;

export class Glow {
  private readonly byFrame = new Map<Frame, FrameGlow | null>();

  constructor(
    sheet: SpriteSheet,
    color: Rgb,
    private readonly glowColor: Rgb,
  ) {
    const source = document.createElement("canvas");
    source.width = sheet.image.width;
    source.height = sheet.image.height;
    const sctx = source.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(sheet.image, 0, 0);

    for (const frame of new Set(sheet.frames)) {
      this.byFrame.set(frame, this.extract(sctx, frame, color));
    }
  }

  // Draws the glow for `frame`, whose top-left corner is at (left, top) on
  // screen. breath goes from 0 (light off) to 1 (brightest).
  draw(ctx: CanvasRenderingContext2D, frame: Frame, left: number, top: number, breath: number): void {
    const glow = this.byFrame.get(frame);
    if (!glow) return;
    const x = Math.round(left);
    const y = Math.round(top);
    const [r, g, b] = this.glowColor;

    ctx.save();

    // 1. Breathing out: the cyan dims.
    ctx.globalAlpha = (1 - breath) * DIM_STRENGTH;
    ctx.drawImage(glow.dim, x, y);

    // 2. Breathing in: light added on top.
    ctx.globalCompositeOperation = "lighter";

    // Wide soft halo around the eyes.
    const hx = x + glow.cx;
    const hy = y + glow.cy;
    const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, HALO_RADIUS);
    halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.35 * breath})`);
    halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.fillRect(hx - HALO_RADIUS, hy - HALO_RADIUS, HALO_RADIUS * 2, HALO_RADIUS * 2);

    // Bloom: the same pixels blurred, so the light spills around them.
    ctx.filter = BLOOM_BLUR;
    ctx.globalAlpha = breath;
    ctx.drawImage(glow.bright, x, y);
    ctx.drawImage(glow.bright, x, y);
    ctx.filter = "none";

    // Hot core: the pixels themselves, brighter.
    ctx.globalAlpha = 0.6 * breath;
    ctx.drawImage(glow.bright, x, y);

    ctx.restore();
  }

  private extract(sctx: CanvasRenderingContext2D, frame: Frame, [cr, cg, cb]: Rgb): FrameGlow | null {
    const pixels = sctx.getImageData(frame.x, frame.y, frame.w, frame.h).data;
    const dim = new ImageData(frame.w, frame.h);
    const bright = new ImageData(frame.w, frame.h);

    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0 || pixels[i] !== cr || pixels[i + 1] !== cg || pixels[i + 2] !== cb) continue;
      dim.data.set([...DIM_COLOR, 255], i);
      bright.data.set([...this.glowColor, 255], i);
      const p = i / 4;
      sumX += p % frame.w;
      sumY += Math.floor(p / frame.w);
      count++;
    }
    if (count === 0) return null;
    return {
      dim: toCanvas(dim),
      bright: toCanvas(bright),
      cx: sumX / count + 0.5,
      cy: sumY / count + 0.5,
    };
  }
}

function toCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext("2d")!.putImageData(data, 0, 0);
  return canvas;
}
