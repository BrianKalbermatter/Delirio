// Brian's flowers growing around the big tree (Laberinto/Terreno/Flores and
// Flores2, swaying with art/flores_viento.py). Every flower plays the wind
// loop from its own point, so they never sway in step.
import type { Decor } from "../../domain/sample-tree";
import { Animator } from "./animator";
import { animationDurationMs, type SpriteSheet } from "./sprite-sheet";

const WIND = "viento";

export class PlazaDeco {
  private readonly flowers: { spot: Decor; animator: Animator }[];

  // sheets: one per flower drawing, indexed by Decor.kind (FLOWER).
  constructor(flowers: Decor[], sheets: SpriteSheet[]) {
    this.flowers = flowers.map((spot, i) => {
      const sheet = sheets[spot.kind];
      const animator = new Animator(sheet);
      animator.play(WIND);
      // Spread their starts over the loop (golden ratio: never in step).
      animator.update(((i * 0.618) % 1) * animationDurationMs(sheet, WIND));
      return { spot, animator };
    });
  }

  update(dtMs: number): void {
    for (const f of this.flowers) f.animator.update(dtMs);
  }

  // Frames are centred on the flower's foot, so they stand on their spot and
  // sort by depth with the rest of the world.
  drawables(ctx: CanvasRenderingContext2D): { y: number; draw: () => void }[] {
    return this.flowers.map(({ spot, animator }) => ({
      y: spot.y,
      draw: () => animator.draw(ctx, spot.x, spot.y),
    }));
  }
}
