// A little dust kicked up from the floor by whoever walks or runs (the player
// and the enemies): every few steps a couple of pale specks rise from behind
// the feet and fade. Subtle on purpose. World space, whole-pixel rects, on the
// floor layer so the body walks in front of it.
import { Graphics } from "pixi.js";

const STEP_PX = 16; // a puff every this many px walked
const FAST_PX_S = 150; // from this speed on (running) each puff is bigger
const LIFE_MS = 520;
const ALPHA = 0.42;
const COLORS = [0xc9b48c, 0xb39c74, 0xd8c8a4];
const MAX = 160;

interface Speck {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  size: number;
  color: number;
  ms: number;
}

export class Dust {
  readonly view = new Graphics();
  private readonly specks: Speck[] = [];
  // Per walker (any key): where it was last frame and px walked since its last puff.
  private readonly walkers = new Map<string, { x: number; y: number; walked: number }>();

  // A walker's feet this frame. `grounded` false (jumping, dead, hidden)
  // kicks nothing up.
  track(key: string, x: number, y: number, grounded: boolean, dtMs: number): void {
    const last = this.walkers.get(key);
    this.walkers.set(key, { x, y, walked: last?.walked ?? 0 });
    if (!last || !grounded || dtMs <= 0) return;
    const dx = x - last.x;
    const dy = y - last.y;
    const moved = Math.hypot(dx, dy);
    if (moved === 0 || moved > 40) return; // still, or teleported (respawn)
    const walker = this.walkers.get(key)!;
    walker.walked = last.walked + moved;
    if (walker.walked < STEP_PX) return;
    walker.walked -= STEP_PX;
    const fast = (moved / dtMs) * 1000 >= FAST_PX_S;
    this.puff(x, y, -dx / moved, fast);
  }

  // Forget walkers not tracked any more (an enemy that is gone).
  keep(keys: Set<string>): void {
    for (const key of this.walkers.keys()) if (!keys.has(key)) this.walkers.delete(key);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i];
      s.ms += dtMs;
      if (s.ms >= LIFE_MS) {
        this.specks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.vz *= 0.92; // slows as it rises
    }
  }

  draw(): void {
    const g = this.view.clear();
    for (const s of this.specks) {
      const fade = 1 - s.ms / LIFE_MS;
      g.rect(Math.round(s.x), Math.round(s.y - s.z), s.size, 1).fill({ color: s.color, alpha: ALPHA * fade });
    }
  }

  // Behind the feet (`backX`: the way it came from, -1..1), a few specks.
  private puff(x: number, y: number, backX: number, fast: boolean): void {
    const count = fast ? 3 : 2;
    for (let i = 0; i < count && this.specks.length < MAX; i++) {
      this.specks.push({
        x: x + backX * 3 + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 2,
        z: 0,
        vx: backX * (4 + Math.random() * 6) + (Math.random() - 0.5) * 6,
        vz: 6 + Math.random() * (fast ? 14 : 8),
        size: fast && Math.random() < 0.5 ? 2 : 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        ms: Math.random() * 80,
      });
    }
  }
}
