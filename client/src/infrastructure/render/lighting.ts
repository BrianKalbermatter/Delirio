// Ambient light of the maze, driven by the time of day, plus a soft light
// around the player. At night everything sinks into the dark except the
// player's surroundings; by day the maze is visible; at dawn and dusk the
// light turns warm while it changes. The player's light leans towards where
// they look, like the camera.

type Rgb = [number, number, number];

const LEAN = 25; // px the light shifts towards the facing direction

// Darkness over the screen at night and by day.
const NIGHT = { color: [9, 7, 22] as Rgb, alpha: 0.85 };
const DAY = { color: [20, 16, 12] as Rgb, alpha: 0.12 };
// Tint at dawn and dusk (strongest halfway through the change).
const TWILIGHT: Rgb = [110, 50, 18];
const TWILIGHT_ALPHA = 0.45;
// By day the player's light reaches this far: the whole screen.
const DAY_RADIUS = 900;

export class Lighting {
  // The player's own faint glow at night. A light source item (lantern,
  // torch...) can raise these at runtime to widen the visible area.
  innerRadius = 24; // fully lit
  outerRadius = 120; // fully dark from here on

  private daylight = 0; // 0 = dark night, 1 = full day
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.layer = document.createElement("canvas");
    this.layerCtx = this.layer.getContext("2d")!;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.layer.width = width;
    this.layer.height = height;
  }

  setDaylight(value: number): void {
    this.daylight = Math.min(1, Math.max(0, value));
  }

  // (x, y) in screen pixels; (dirX, dirY) unit vector of the facing.
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number): void {
    const l = this.layerCtx;
    const d = this.daylight;
    const cx = x + dirX * LEAN;
    const cy = y + dirY * LEAN;

    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, this.layer.width, this.layer.height);
    l.fillStyle = rgba(mix(NIGHT.color, DAY.color, d), lerp(NIGHT.alpha, DAY.alpha, d));
    l.fillRect(0, 0, this.layer.width, this.layer.height);

    // Cut the player's light out of the darkness.
    const inner = lerp(this.innerRadius, DAY_RADIUS * 0.4, d);
    const outer = lerp(this.outerRadius, DAY_RADIUS, d);
    l.globalCompositeOperation = "destination-out";
    const light = l.createRadialGradient(cx, cy, inner, cx, cy, outer);
    light.addColorStop(0, "rgba(0, 0, 0, 1)");
    light.addColorStop(0.6, "rgba(0, 0, 0, 0.45)");
    light.addColorStop(1, "rgba(0, 0, 0, 0)");
    l.fillStyle = light;
    l.fillRect(0, 0, this.layer.width, this.layer.height);

    ctx.drawImage(this.layer, 0, 0);

    // Warm tint while it is getting light or dark.
    const twilight = 4 * d * (1 - d); // 0 at night and by day, 1 halfway
    if (twilight > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = rgba(TWILIGHT, TWILIGHT_ALPHA * twilight);
      ctx.fillRect(0, 0, this.layer.width, this.layer.height);
      ctx.restore();
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
