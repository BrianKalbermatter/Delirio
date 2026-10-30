// Plays the animations of a sprite sheet: keeps the time and says which frame
// to show. Drawing it is up to whoever owns the sprite (see placeFrame).
import { DIRECTIONS } from "../../domain/facing";
import type { Frame, SpriteSheet } from "./sprite-sheet";

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

  // Plays the current animation again from its first frame (an attack right
  // after another one keeps the same tag).
  restart(): void {
    this.frameIndex = 0;
    this.frameClockMs = 0;
    this.motionTimeMs = 0;
  }

  // Shows the frame at `ms` into the current animation (as timed in the
  // sheet), instead of advancing with update: the jump follows its own clock.
  seek(ms: number): void {
    const frames = this.frames();
    if (frames.length === 0) return;
    let index = 0;
    while (index < frames.length - 1 && ms >= frames[index].durationMs) {
      ms -= frames[index].durationMs;
      index++;
    }
    this.frameIndex = index;
    this.frameClockMs = ms;
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

  // The frame at the same place of the animation in `other`, a sheet exported
  // from the same source with the same tags (a layer of it, for instance).
  frameIn(other: SpriteSheet): Frame {
    const frames = other.animations.get(this.tag) ?? other.frames;
    return frames[this.frameIndex % frames.length];
  }

  // The frame of `tag` in `other` at the same share of the cycle, for a sheet
  // whose animations have another number of frames (the player's weapon
  // overlays on an enemy). Null if `other` has no such tag.
  frameAtShareIn(other: SpriteSheet, tag: string): Frame | null {
    const mine = this.frames();
    const frames = other.animations.get(tag);
    if (!frames || mine.length === 0) return null;
    return frames[Math.floor((this.frameIndex / mine.length) * frames.length) % frames.length];
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
