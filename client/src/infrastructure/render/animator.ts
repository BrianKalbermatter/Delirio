// Plays the animations of a sprite sheet on a 2D canvas.
import { DIRECTIONS } from "../../domain/facing";
import { drawFrame, type Frame, type SpriteSheet } from "./sprite-sheet";

export class Animator {
  private tag = "";
  private frameIndex = 0;
  private frameClockMs = 0;
  // Time since the current motion started (walk, idle...), not reset when
  // only the direction changes. Effects use it to stay in step with the loop.
  motionTimeMs = 0;

  constructor(private readonly sheet: SpriteSheet) {}

  // Switches animation. When only the direction changes (walk_right ->
  // walk_down_right) the cycle keeps its phase, so turning while walking does
  // not restart the steps. A new motion (idle -> walk, roll_start -> roll)
  // starts from frame 0.
  play(tag: string): void {
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

  update(dtMs: number): void {
    const frames = this.frames();
    if (frames.length === 0) return;
    this.frameIndex %= frames.length;
    this.frameClockMs += dtMs;
    this.motionTimeMs += dtMs;
    while (this.frameClockMs >= frames[this.frameIndex].durationMs) {
      this.frameClockMs -= frames[this.frameIndex].durationMs;
      this.frameIndex = (this.frameIndex + 1) % frames.length;
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
