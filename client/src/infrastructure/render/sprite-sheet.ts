// Loads an Aseprite sprite sheet export (json-array + --list-tags) and groups
// its frames by animation tag. A sheet without tags gets a single "default"
// animation with all its frames.

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
  // Horizontal pivot inside the frame, in px from its left edge. Drawing puts
  // this column on the entity position. Defaults to the frame center.
  anchorX: number;
}

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frames: Frame[];
  animations: Map<string, Frame[]>;
}

export const DEFAULT_ANIMATION = "default";

interface AsepriteExport {
  frames: {
    frame: { x: number; y: number; w: number; h: number };
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

export async function loadSpriteSheet(basePath: string, options: LoadOptions = {}): Promise<SpriteSheet> {
  const [data, image] = await Promise.all([
    fetch(`${basePath}.json`).then((r) => r.json() as Promise<AsepriteExport>),
    loadImage(`${basePath}.png`),
  ]);

  const frames: Frame[] = data.frames.map((f) => ({
    ...f.frame,
    durationMs: f.duration,
    anchorX: f.frame.w / 2,
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

// Draws one frame with its feet (bottom center) at (x, y).
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frame: Frame,
  x: number,
  y: number,
): void {
  const dx = Math.round(x - frame.anchorX);
  const dy = Math.round(y - frame.h);
  ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w, frame.h);
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load image ${src}`));
    image.src = src;
  });
}
