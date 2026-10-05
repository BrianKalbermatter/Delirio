// Plays the animations of a sprite sheet on a 2D canvas.
import { DIRECTIONS } from "../../domain/facing";
import { drawFrame, type Frame, type SpriteSheet } from "./sprite-sheet";

export class Animator {
  private tag = "";
  private frameIndex = 0;
  private frameClockMs = 0;
  private loop = true;
  // Time since the current motion started (walk, idle...), not reset when
  // only the direction changes. Effects use it to stay in step with the loop.
  motionTimeMs = 0;

  constructor(private readonly sheet: SpriteSheet) {}

  // Switches animation. When only the direction changes (walk_right ->
  // walk_down_right) the cycle keeps its phase, so turning while walking does
  // not restart the steps. A new motion (idle -> walk, roll_start -> roll)
  // starts from frame 0.
  // `loop` false plays it once and stays on the last frame (death).
  play(tag: string, loop = true): void {
    this.loop = loop;
    if (tag === this.tag) return;
    if (!this.sheet.animations.has(tag)) {
      console.warn(`Missing animation tag: ${tag}`);
      return;
    }
    if (motionOf(tag) !== motionOf(this.tag)) {
      this.frameIndex = 0;
      this.frameClockMs = 0;
      this.motionTimeMs = 0;
    }
    this.tag = tag;
  }

  // `speed` scales playback: 2 plays the frames twice as fast as in Aseprite.
  // `reverse` steps through the frames backwards (walking backwards).
  update(dtMs: number, speed = 1, reverse = false): void {
    dtMs *= speed;
    const frames = this.frames();
    if (frames.length === 0) return;
    const step = reverse ? frames.length - 1 : 1;
    this.frameIndex %= frames.length;
    this.frameClockMs += dtMs;
    this.motionTimeMs += dtMs;
    while (this.frameClockMs >= frames[this.frameIndex].durationMs) {
      const last = reverse ? this.frameIndex === 0 : this.frameIndex === frames.length - 1;
      if (!this.loop && last) {
        this.frameClockMs = 0;
        break;
      }
      this.frameClockMs -= frames[this.frameIndex].durationMs;
      this.frameIndex = (this.frameIndex + step) % frames.length;
    }
  }

  // Draws the current frame with its feet at (x, y).
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const frames = this.frames();
    if (frames.length === 0) return;
    drawFrame(ctx, this.sheet, frames[this.frameIndex % frames.length], x, y);
  }

  currentFrame(): Frame | null {
    const frames = this.frames();
    return frames.length === 0 ? null : frames[this.frameIndex % frames.length];
  }

  private frames(): Frame[] {
    return this.sheet.animations.get(this.tag) ?? [];
  }
}

// Tag without its direction suffix: "roll_start_right" -> "roll_start".
function motionOf(tag: string): string {
  const direction = [...DIRECTIONS]
    .sort((a, b) => b.length - a.length)
    .find((d) => tag.endsWith(`_${d}`));
  return direction ? tag.slice(0, -(direction.length + 1)) : tag;
}
