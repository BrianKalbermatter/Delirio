// Loads an Aseprite sprite sheet export (json-array + --list-tags) and groups
// its frames by animation tag. A sheet without tags gets a single "default"
// animation with all its frames.

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
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

export async function loadSpriteSheet(basePath: string): Promise<SpriteSheet> {
  const [data, image] = await Promise.all([
    fetch(`${basePath}.json`).then((r) => r.json() as Promise<AsepriteExport>),
    loadImage(`${basePath}.png`),
  ]);

  const frames: Frame[] = data.frames.map((f) => ({ ...f.frame, durationMs: f.duration }));
  const animations = new Map<string, Frame[]>();
  for (const tag of data.meta.frameTags) {
    animations.set(tag.name, frames.slice(tag.from, tag.to + 1));
  }
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
  const dx = Math.round(x - frame.w / 2);
  const dy = Math.round(y - frame.h);
  ctx.drawImage(sheet.image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w, frame.h);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cannot load image ${src}`));
    image.src = src;
  });
}
