// The white edge around an item on the floor that can be picked up, with a
// soft glow fading outwards, shown as the player comes close to it. One
// texture per frame, made the first time it is needed: a 1 px white outline
// hugging the drawing over the drawing's silhouette blurred. Drawn just
// behind the item, so only what sticks out of it shows.
import { type Container, Sprite, type Texture } from "pixi.js";
import { type Frame, framePixels, type SpriteSheet } from "./sprite-sheet";
import { paintTexture } from "./textures";

const MARGIN = 5; // px of glow around the drawing
const GLOW_BLUR = "blur(2px)";
const GLOW_PASSES = 2; // the blur drawn this many times: a stronger glow
const BEHIND = 5e-7; // under the item's zIndex, less than depth.ts TIE_STEP

export class PickupHalos {
  private readonly pool: Sprite[] = [];
  private readonly byFrame = new Map<Frame, Texture>();
  private readonly readers = new Map<SpriteSheet, CanvasRenderingContext2D>();
  private used = 0;

  // `parent`: the depth-sorted layer the items stand in.
  constructor(private readonly parent: Container) {}

  // Call before the add() of a frame...
  begin(): void {
    this.used = 0;
  }

  // ...the halo of `sprite` (an item on the floor placed with placeFrame at
  // scale 1, showing `frame` of `sheet`), at `strength` 0..1...
  add(sheet: SpriteSheet, frame: Frame, sprite: Sprite, strength: number): void {
    if (strength <= 0 || !sprite.visible) return;
    let halo = this.pool[this.used];
    if (!halo) {
      halo = new Sprite();
      this.pool.push(halo);
      this.parent.addChild(halo);
    }
    this.used++;
    halo.texture = this.texture(sheet, frame);
    halo.position.set(sprite.x - MARGIN, sprite.y - MARGIN);
    halo.zIndex = sprite.zIndex - BEHIND;
    halo.alpha = Math.min(1, strength);
    halo.visible = true;
  }

  // ...and after them: the halos not used this frame hide.
  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private texture(sheet: SpriteSheet, frame: Frame): Texture {
    let texture = this.byFrame.get(frame);
    if (texture) return texture;
    const pixels = framePixels(this.reader(sheet), frame);
    const { w, h } = frame;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] > 0;
    const silhouette = new ImageData(w, h);
    const outline = new ImageData(w + MARGIN * 2, h + MARGIN * 2);
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (opaque(x, y)) {
          silhouette.data.set([255, 255, 255, 255], (y * w + x) * 4);
        } else if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
          outline.data.set([255, 255, 255, 255], ((y + MARGIN) * outline.width + x + MARGIN) * 4);
        }
      }
    }
    const shape = canvasOf(w, h, (ctx) => ctx.putImageData(silhouette, 0, 0));
    const edge = canvasOf(outline.width, outline.height, (ctx) => ctx.putImageData(outline, 0, 0));
    texture = paintTexture(outline.width, outline.height, (ctx) => {
      ctx.filter = GLOW_BLUR;
      for (let i = 0; i < GLOW_PASSES; i++) {
        ctx.drawImage(edge, 0, 0);
        ctx.drawImage(shape, MARGIN, MARGIN);
      }
      ctx.filter = "none";
      ctx.drawImage(edge, 0, 0);
    });
    this.byFrame.set(frame, texture);
    return texture;
  }

  // A canvas with the sheet's image, to read its frames' pixels.
  private reader(sheet: SpriteSheet): CanvasRenderingContext2D {
    let ctx = this.readers.get(sheet);
    if (!ctx) {
      ctx = canvasOf(sheet.image.width, sheet.image.height, (c) => c.drawImage(sheet.image, 0, 0)).getContext("2d", {
        willReadFrequently: true,
      })!;
      this.readers.set(sheet, ctx);
    }
    return ctx;
  }
}

function canvasOf(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d", { willReadFrequently: true })!);
  return canvas;
}
