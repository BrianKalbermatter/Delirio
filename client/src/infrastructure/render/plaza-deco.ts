// Brian's flowers growing around the big tree (Laberinto/Terreno/Flores and
// Flores2, swaying with art/flores_viento.py). Every flower plays the wind
// loop from its own point, so they never sway in step.
import { type Container, Sprite } from "pixi.js";
import type { Decor } from "../../domain/sample-tree";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { animationDurationMs, placeFrame, type SpriteSheet } from "./sprite-sheet";

const WIND = "viento";

export class PlazaDeco {
  private readonly flowers: { spot: Decor; animator: Animator; sprite: Sprite }[];

  // sheets: one per flower drawing, indexed by Decor.kind (FLOWER). The
  // flowers stand in `depth`, the depth-sorted layer: frames are centred on
  // the flower's foot, so they sort with the rest of the world.
  constructor(flowers: Decor[], sheets: SpriteSheet[], depth: Container) {
    this.flowers = flowers.map((spot, i) => {
      const sheet = sheets[spot.kind];
      const animator = new Animator(sheet);
      animator.play(WIND);
      // Spread their starts over the loop (golden ratio: never in step).
      animator.update(((i * 0.618) % 1) * animationDurationMs(sheet, WIND));
      const sprite = new Sprite();
      sprite.zIndex = depthOf(spot.y, DEPTH.flower);
      depth.addChild(sprite);
      const flower = { spot, animator, sprite };
      place(flower);
      return flower;
    });
  }

  update(dtMs: number): void {
    for (const flower of this.flowers) {
      flower.animator.update(dtMs);
      place(flower);
    }
  }
}

function place({ spot, animator, sprite }: { spot: Decor; animator: Animator; sprite: Sprite }): void {
  const frame = animator.currentFrame();
  if (frame) placeFrame(sprite, frame, spot.x, spot.y);
}
