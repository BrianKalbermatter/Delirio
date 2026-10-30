// Blood the player loses when hit: drops fly out of the body, fall and stain
// the floor around the feet. The stains stay a while and then dry away.
// World space, whole-pixel rects like the rest of the pixel art.
import { Graphics } from "pixi.js";
import { DEPTH, depthOf } from "./depth";

const GRAVITY = 420; // px/s²
const STAIN_MS = 25_000; // how long a stain stays
const DRY_MS = 4_000; // the last part of it, fading out
const STAINS_MAX = 240; // the oldest go first
const COLORS = [0x8a1020, 0x6e0c18, 0xa3172a];

interface Drop {
  x: number;
  y: number; // on the floor, under it
  z: number; // px over the floor
  vx: number;
  vy: number;
  vz: number;
  color: number;
}

interface Stain {
  x: number;
  y: number;
  size: number; // 1: a dot, 2-3: a splash
  color: number;
  ageMs: number;
}

export class Blood {
  // The stains lie flat on the floor; the drops in the air sort with what stands.
  readonly floor = new Graphics();
  readonly air = new Graphics();
  private readonly drops: Drop[] = [];
  private readonly stains: Stain[] = [];

  // A hit at the feet (x, y) from `height` px up the body: the more damage,
  // the more drops, and a pool right under the feet.
  spill(x: number, y: number, height: number, damage: number): void {
    const count = Math.max(4, Math.min(12, Math.round(3 + damage / 3)));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      this.drops.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        z: height * (0.5 + Math.random() * 0.4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5, // the floor is seen from above: less depth
        vz: 30 + Math.random() * 60,
        color: COLORS[i % COLORS.length],
      });
    }
    this.stain(x + Math.round((Math.random() - 0.5) * 4), y + 1, 3, COLORS[0]);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vz -= GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.z > 0) continue;
      this.stain(d.x, d.y, Math.random() < 0.35 ? 2 : 1, d.color);
      this.drops.splice(i, 1);
    }
    for (let i = this.stains.length - 1; i >= 0; i--) {
      this.stains[i].ageMs += dtMs;
      if (this.stains[i].ageMs >= STAIN_MS) this.stains.splice(i, 1);
    }
  }

  draw(): void {
    const floor = this.floor.clear();
    for (const s of this.stains) {
      const alpha = Math.min(1, (STAIN_MS - s.ageMs) / DRY_MS) * 0.9;
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      if (s.size === 1) floor.rect(x, y, 1, 1);
      else if (s.size === 2) floor.rect(x, y, 2, 1).rect(x, y + 1, 1, 1);
      else floor.rect(x - 2, y, 5, 2).rect(x - 1, y - 1, 3, 1).rect(x - 1, y + 2, 3, 1); // a small pool
      floor.fill({ color: s.color, alpha });
    }
    const air = this.air.clear();
    let lowest = -Infinity;
    for (const d of this.drops) {
      air.rect(Math.round(d.x), Math.round(d.y - d.z), 1, d.vz > 0 ? 1 : 2).fill(d.color);
      lowest = Math.max(lowest, d.y);
    }
    this.air.zIndex = depthOf(lowest, DEPTH.bush); // in front of the body they come out of
  }

  private stain(x: number, y: number, size: number, color: number): void {
    if (this.stains.length >= STAINS_MAX) this.stains.shift();
    this.stains.push({ x, y, size, color, ageMs: 0 });
  }
}
