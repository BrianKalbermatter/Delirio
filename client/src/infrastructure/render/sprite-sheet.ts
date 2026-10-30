// Loads an Aseprite sprite sheet export (json-array + --list-tags) and groups
// its frames by animation tag. A sheet without tags gets a single "default"
// animation with all its frames. Every frame gets its own Pixi texture, a
// sub-rectangle of the sheet's single source texture. Packed sheets
// (meta.trimFrames, art/armas.py write_packed_sheet) store each frame cut down
// to its pixels; their textures still have the whole cell's size.
import { Rectangle, type Sprite, Texture } from "pixi.js";

export interface Frame {
  // Where the frame's pixels are in the sheet image (trimW x trimH of them)...
  x: number;
  y: number;
  // ...the frame's size, and where those pixels go in it. Only packed sheets
  // cut frames down: elsewhere trim is the whole frame.
  w: number;
  h: number;
  trimX: number;
  trimY: number;
  trimW: number;
  trimH: number;
  durationMs: number;
  // Horizontal pivot inside the frame, in px from its left edge. Drawing puts
  // this column on the entity position. Defaults to the frame center.
  anchorX: number;
  // Where the frame was in the source canvas, when the export trimmed it
  // (--trim-sprite): add it to frame coordinates to get canvas coordinates.
  sourceX: number;
  sourceY: number;
  texture: Texture;
}

export interface SpriteSheet {
  image: HTMLImageElement; // kept for the DOM panels (inventory icons) and pixel scans
  frameWidth: number;
  frameHeight: number;
  frames: Frame[];
  animations: Map<string, Frame[]>;
}

export const DEFAULT_ANIMATION = "default";

interface AsepriteExport {
  frames: {
    frame: { x: number; y: number; w: number; h: number };
    spriteSourceSize?: { x: number; y: number };
    sourceSize?: { w: number; h: number };
    duration: number;
  }[];
  meta: {
    frameTags: { name: string; from: number; to: number }[];
    trimFrames?: boolean;
  };
}

export interface LoadOptions {
  // Pivot each animation on the body instead of the frame center. For sheets
  // where the drawing is not centered in its cell, or sits at a different spot
  // in each direction, so the character turns on its own axis.
  pivotOnBody?: boolean;
}

// Sprites and data keep their names between builds, so a browser that saw them
// before would keep showing the old ones. Every build asks for them with its
// own version (BUILD_ID, set in vite.config.ts) to get the current files.
export function versioned(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${BUILD_ID}`;
}

export async function loadSpriteSheet(basePath: string, options: LoadOptions = {}): Promise<SpriteSheet> {
  const [data, image] = await Promise.all([
    fetch(versioned(`${basePath}.json`)).then((r) => r.json() as Promise<AsepriteExport>),
    loadImage(`${basePath}.png`),
  ]);

  const { source } = Texture.from(image);
  const frames: Frame[] = data.frames.map((f) => {
    const stored = new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h);
    if (data.meta.trimFrames && f.sourceSize && f.spriteSourceSize) {
      const { w, h } = f.sourceSize;
      const { x: trimX, y: trimY } = f.spriteSourceSize;
      return {
        x: f.frame.x,
        y: f.frame.y,
        w,
        h,
        trimX,
        trimY,
        trimW: f.frame.w,
        trimH: f.frame.h,
        durationMs: f.duration,
        anchorX: w / 2,
        sourceX: 0,
        sourceY: 0,
        texture: new Texture({
          source,
          frame: stored,
          orig: new Rectangle(0, 0, w, h),
          trim: new Rectangle(trimX, trimY, f.frame.w, f.frame.h),
        }),
      };
    }
    return {
      ...f.frame,
      trimX: 0,
      trimY: 0,
      trimW: f.frame.w,
      trimH: f.frame.h,
      durationMs: f.duration,
      anchorX: f.frame.w / 2,
      sourceX: f.spriteSourceSize?.x ?? 0,
      sourceY: f.spriteSourceSize?.y ?? 0,
      texture: new Texture({ source, frame: stored }),
    };
  });
  const animations = new Map<string, Frame[]>();
  for (const tag of data.meta.frameTags) {
    animations.set(tag.name, frames.slice(tag.from, tag.to + 1));
  }
  if (options.pivotOnBody) pivotOnBody(image, animations);
  if (animations.size === 0) animations.set(DEFAULT_ANIMATION, frames);

  return {
    image,
    frameWidth: frames[0].w,
    frameHeight: frames[0].h,
    frames,
    animations,
  };
}

// A copy of `sheet` with some colours swapped (exact RGB matches), sharing
// its frames and tags: the player's weapon overlays with the hand in an
// enemy's skin.
export function recolorSheet(sheet: SpriteSheet, swaps: [number, number][]): SpriteSheet {
  const canvas = document.createElement("canvas");
  canvas.width = sheet.image.width;
  canvas.height = sheet.image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(sheet.image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const to = new Map(swaps);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const swap = to.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (swap === undefined) continue;
    px[i] = swap >> 16;
    px[i + 1] = (swap >> 8) & 0xff;
    px[i + 2] = swap & 0xff;
  }
  ctx.putImageData(data, 0, 0);
  const { source } = Texture.from(canvas);
  const copy = (f: Frame): Frame => ({
    ...f,
    texture: new Texture({
      source,
      frame: f.texture.frame.clone(),
      orig: f.texture.orig.clone(),
      trim: f.texture.trim?.clone(),
    }),
  });
  const frames = sheet.frames.map(copy);
  const byTexture = new Map(sheet.frames.map((f, i) => [f, frames[i]]));
  const animations = new Map([...sheet.animations].map(([tag, list]) => [tag, list.map((f) => byTexture.get(f)!)]));
  return { ...sheet, frames, animations };
}

// Total playback time of one animation, from the frame durations set in Aseprite.
export function animationDurationMs(sheet: SpriteSheet, tag: string): number {
  const frames = sheet.animations.get(tag);
  if (!frames) throw new Error(`Missing animation tag: ${tag}`);
  return frames.reduce((total, f) => total + f.durationMs, 0);
}

// The RGBA pixels of a whole frame (w x h), its stored pixels put back in
// place, read from `ctx`, a canvas with the sheet image drawn at (0, 0).
export function framePixels(ctx: CanvasRenderingContext2D, f: Frame): Uint8ClampedArray {
  if (f.trimX === 0 && f.trimY === 0 && f.trimW === f.w && f.trimH === f.h) {
    return ctx.getImageData(f.x, f.y, f.w, f.h).data;
  }
  const out = new Uint8ClampedArray(f.w * f.h * 4);
  const stored = ctx.getImageData(f.x, f.y, f.trimW, f.trimH).data;
  for (let row = 0; row < f.trimH; row++) {
    out.set(stored.subarray(row * f.trimW * 4, (row + 1) * f.trimW * 4), ((row + f.trimY) * f.w + f.trimX) * 4);
  }
  return out;
}

// Draws frame `f` of `sheet` on a 2D canvas with its top-left corner at (x, y).
export function drawFrame(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, f: Frame, x: number, y: number): void {
  ctx.drawImage(sheet.image, f.x, f.y, f.trimW, f.trimH, x + f.trimX, y + f.trimY, f.trimW, f.trimH);
}

// Shows one frame on `sprite` with its feet (bottom center) at (x, y).
export function placeFrame(sprite: Sprite, frame: Frame, x: number, y: number): void {
  sprite.texture = frame.texture;
  sprite.position.set(Math.round(x - frame.anchorX), Math.round(y - frame.h));
}

// Sets each animation's pivot to the average horizontal center of mass of its
// opaque pixels. One value per animation, not per frame, so the motion drawn
// inside the cycle (a sway, a lunge) is kept.
function pivotOnBody(image: HTMLImageElement, animations: Map<string, Frame[]>): void {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);

  for (const frames of animations.values()) {
    let sumX = 0;
    let count = 0;
    for (const f of frames) {
      const alpha = framePixels(ctx, f);
      for (let i = 3; i < alpha.length; i += 4) {
        if (alpha[i] > 128) {
          sumX += ((i - 3) / 4) % f.w;
          count++;
        }
      }
    }
    if (count === 0) continue;
    const anchorX = sumX / count + 0.5; // center of the pixel, not its left edge
    for (const f of frames) f.anchorX = anchorX;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load image ${src}`));
    image.src = versioned(src);
  });
}
