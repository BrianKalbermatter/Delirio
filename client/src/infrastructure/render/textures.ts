// Textures painted once at load time, for art the sheets do not carry as is
// (dithered blends, baked gradients, glow masks). The canvas only holds the
// pixels while they are made; Pixi draws them.
import { Sprite, Texture } from "pixi.js";

export function paintTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  return Texture.from(canvas);
}

// A flat rectangle (an outline, a bar): the white texture, tinted and
// stretched to the size given.
export function solidRect(color: number, alpha = 1, width = 1, height = 1): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.tint = color;
  sprite.alpha = alpha;
  sprite.setSize(width, height);
  return sprite;
}
