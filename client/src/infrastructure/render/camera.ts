// Top-down camera that follows a target and leads towards where it is facing,
// so the player sees more of the space in front of the character.
import { type Direction, vectorOf } from "../../domain/facing";

// How far ahead the camera looks. The screen is wider than tall, so it leads
// further horizontally.
const LOOK_AHEAD_X = 110; // px
const LOOK_AHEAD_Y = 60; // px
// Time for the camera to cover ~63% of the remaining distance. Higher = smoother, lazier.
const SMOOTHING_MS = 250;

export class Camera {
  // World position at the center of the screen.
  x: number;
  y: number;

  constructor(
    x: number,
    y: number,
    public viewWidth: number,
    public viewHeight: number,
  ) {
    this.x = x;
    this.y = y;
  }

  follow(targetX: number, targetY: number, facing: Direction, dtMs: number): void {
    const [dirX, dirY] = vectorOf(facing);
    const goalX = targetX + dirX * LOOK_AHEAD_X;
    const goalY = targetY + dirY * LOOK_AHEAD_Y;

    // Exponential smoothing: same feel at any frame rate.
    const t = 1 - Math.exp(-dtMs / SMOOTHING_MS);
    this.x += (goalX - this.x) * t;
    this.y += (goalY - this.y) * t;
  }

  // Keeps the view inside the world so it never shows what is beyond the edges.
  // `topOverhang` lets the view go above y = 0, where tall walls on the first
  // row are drawn.
  clampTo(worldWidth: number, worldHeight: number, topOverhang = 0): void {
    this.x = clamp(this.x, this.viewWidth / 2, worldWidth - this.viewWidth / 2);
    this.y = clamp(this.y, this.viewHeight / 2 - topOverhang, worldHeight - this.viewHeight / 2);
  }

  // Applies the world -> screen transform. Rounded so pixel art does not shimmer.
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      1, 0, 0, 1,
      Math.round(this.viewWidth / 2 - this.x),
      Math.round(this.viewHeight / 2 - this.y),
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
