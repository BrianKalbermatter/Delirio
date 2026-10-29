// Breathing glow on the pixels of one color of a sprite (the player's eyes).
// At load time every frame is scanned and the pixels of that color are copied
// into two masks: a dark one (breathing out, the light dims) and a bright one
// (breathing in, the light blooms). Frames without that color (back views)
// glow nothing. The bloom (the bright mask blurred) and the halo are baked
// into textures there too, so each frame only moves and fades sprites.
import { Container, Sprite, type Texture } from "pixi.js";
import { type Frame, framePixels, type SpriteSheet } from "./sprite-sheet";
import { paintTexture } from "./textures";

interface FrameGlow {
  dim: Texture;
  bright: Texture;
  bloom: Texture; // `bright` blurred, BLOOM_MARGIN px larger on every side
  cx: number; // center of the glowing pixels, relative to the frame
  cy: number;
}

type Rgb = [number, number, number];

const DIM_COLOR: Rgb = [122, 48, 69]; // the eyes with the light off
const DIM_STRENGTH = 0.8; // how dark it gets at the bottom of the breath
const BLOOM_BLUR = "blur(3px)";
const BLOOM_MARGIN = 9; // room for the blur to spread: three times its radius
const HALO_RADIUS = 18;
const HALO_ALPHA = 0.35;

export class Glow {
  // Screen space, over the darkness: it is the player's own light. The owner
  // adds it to the stage.
  readonly view = new Container();
  private readonly byFrame = new Map<Frame, FrameGlow | null>();
  // Drawn in this order: the dim mask, then light added on top.
  private readonly dim = new Sprite();
  private readonly halo: Sprite;
  private readonly blooms = [new Sprite(), new Sprite()]; // the bloom twice, for strength
  private readonly core = new Sprite();

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

    // Wide soft halo around the eyes: the glow color, fading out linearly
    // from the center to HALO_RADIUS. Its strength follows the breath.
    const size = HALO_RADIUS * 2;
    this.halo = new Sprite(
      paintTexture(size, size, (ctx) => {
        const pixels = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const r = Math.hypot(x + 0.5 - HALO_RADIUS, y + 0.5 - HALO_RADIUS) / HALO_RADIUS;
            pixels.data.set([...glowColor, Math.round(255 * Math.max(0, 1 - r))], (y * size + x) * 4);
          }
        }
        ctx.putImageData(pixels, 0, 0);
      }),
    );
    // Breathing in: light added on top ("lighter" in Canvas terms).
    for (const light of [this.halo, ...this.blooms, this.core]) light.blendMode = "add";
    this.view.addChild(this.dim, this.halo, ...this.blooms, this.core);
    this.view.visible = false;
  }

  // Shows the glow for `frame` (none hides it), whose top-left corner is at
  // (left, top) on screen. breath goes from 0 (light off) to 1 (brightest).
  show(frame: Frame | null, left: number, top: number, breath: number): void {
    const glow = frame ? this.byFrame.get(frame) : null;
    this.view.visible = !!glow;
    if (!glow) return;
    const x = Math.round(left);
    const y = Math.round(top);

    // 1. Breathing out: the cyan dims.
    this.dim.texture = glow.dim;
    this.dim.position.set(x, y);
    this.dim.alpha = (1 - breath) * DIM_STRENGTH;

    // 2. Breathing in: the halo, the bloom so the light spills around the
    // pixels, and the hot core: the pixels themselves, brighter.
    this.halo.position.set(x + glow.cx - HALO_RADIUS, y + glow.cy - HALO_RADIUS);
    this.halo.alpha = HALO_ALPHA * breath;
    for (const bloom of this.blooms) {
      bloom.texture = glow.bloom;
      bloom.position.set(x - BLOOM_MARGIN, y - BLOOM_MARGIN);
      bloom.alpha = breath;
    }
    this.core.texture = glow.bright;
    this.core.position.set(x, y);
    this.core.alpha = 0.6 * breath;
  }

  private extract(sctx: CanvasRenderingContext2D, frame: Frame, [cr, cg, cb]: Rgb): FrameGlow | null {
    const pixels = framePixels(sctx, frame);
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
    const brightTexture = paintTexture(frame.w, frame.h, (ctx) => ctx.putImageData(bright, 0, 0));
    // Blurred once here with the same CSS blur the bloom always had.
    const margin = BLOOM_MARGIN * 2;
    const bloom = paintTexture(frame.w + margin, frame.h + margin, (ctx) => {
      ctx.filter = BLOOM_BLUR;
      ctx.drawImage(brightTexture.source.resource as HTMLCanvasElement, BLOOM_MARGIN, BLOOM_MARGIN);
    });
    return {
      dim: paintTexture(frame.w, frame.h, (ctx) => ctx.putImageData(dim, 0, 0)),
      bright: brightTexture,
      bloom,
      cx: sumX / count + 0.5,
      cy: sumY / count + 0.5,
    };
  }
}
