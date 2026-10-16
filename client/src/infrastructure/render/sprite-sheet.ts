// Loads an Aseprite sprite sheet export (json-array + --list-tags) and groups
// its frames by animation tag. A sheet without tags gets a single "default"
// animation with all its frames. Every frame gets its own Pixi texture, a
// sub-rectangle of the sheet's single source texture.
import { Rectangle, type Sprite, Texture } from "pixi.js";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
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
    duration: number;
  }[];
  meta: {
    frameTags: { name: string; from: number; to: number }[];
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
  const frames: Frame[] = data.frames.map((f) => ({
    ...f.frame,
    durationMs: f.duration,
    anchorX: f.frame.w / 2,
    sourceX: f.spriteSourceSize?.x ?? 0,
    sourceY: f.spriteSourceSize?.y ?? 0,
    texture: new Texture({ source, frame: new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h) }),
  }));
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

// Total playback time of one animation, from the frame durations set in Aseprite.
export function animationDurationMs(sheet: SpriteSheet, tag: string): number {
  const frames = sheet.animations.get(tag);
  if (!frames) throw new Error(`Missing animation tag: ${tag}`);
  return frames.reduce((total, f) => total + f.durationMs, 0);
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
      const alpha = ctx.getImageData(f.x, f.y, f.w, f.h).data;
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
