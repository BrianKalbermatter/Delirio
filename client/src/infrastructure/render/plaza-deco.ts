// The square's meadow (domain/meadow.ts): Brian's flowers swaying in the wind
// (Laberinto/Terreno/Flores and Flores2, art/flores_viento.py), his tall grass
// (Gramilla, art/gramilla.py) and small flowers growing low under them
// (art/florcitas.py). Every flower plays the wind loop from its own point, so
// they never sway in step. Flowers and grass stand with the rest of the world
// (depth-sorted by their foot); the small flowers lie on the ground, under
// everything. Only what is near the camera is updated and drawn.
import { type Container, Sprite, type Texture } from "pixi.js";
import type { Meadow, Plant } from "../../domain/meadow";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { animationDurationMs, placeFrame, type SpriteSheet } from "./sprite-sheet";

const WIND = "viento";
const MARGIN = 80; // px past the edge of the view that still counts as in view

interface FlowerView {
  spot: Plant;
  animator: Animator;
  sprite: Sprite;
}

export interface View {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class PlazaDeco {
  private readonly flowers: FlowerView[];
  private readonly still: { spot: Plant; sprite: Sprite }[] = [];

  // flowerSheets: indexed by the flowers' kind (clump, tall). grass: the
  // Gramilla textures by kind (whole, small). small: the florcitas sheet.
  // `depth` is the depth-sorted layer, `ground` the flat one under it.
  constructor(
    meadow: Meadow,
    flowerSheets: SpriteSheet[],
    grass: Texture[],
    small: SpriteSheet,
    depth: Container,
    ground: Container,
  ) {
    this.flowers = meadow.flowers.map((spot, i) => {
      const sheet = flowerSheets[spot.kind];
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
    for (const spot of meadow.grass) {
      const texture = grass[spot.kind];
      const sprite = new Sprite(texture);
      // Foot at the bottom middle; mirrored now and then so no two look alike
      sprite.anchor.set(0.5, 1);
      if ((spot.x + spot.y) % 2 === 0) sprite.scale.x = -1;
      sprite.position.set(spot.x, spot.y);
      sprite.zIndex = depthOf(spot.y, DEPTH.flower);
      depth.addChild(sprite);
      this.still.push({ spot, sprite });
    }
    for (const spot of meadow.smallFlowers) {
      const sprite = new Sprite();
      placeFrame(sprite, small.frames[spot.kind % small.frames.length], spot.x, spot.y);
      ground.addChild(sprite);
      this.still.push({ spot, sprite });
    }
  }

  update(dtMs: number, view: View): void {
    const near = (p: Plant) =>
      p.x > view.left - MARGIN &&
      p.x < view.left + view.width + MARGIN &&
      p.y > view.top - MARGIN &&
      p.y < view.top + view.height + MARGIN;
    for (const flower of this.flowers) {
      flower.sprite.visible = near(flower.spot);
      if (!flower.sprite.visible) continue;
      flower.animator.update(dtMs);
      place(flower);
    }
    for (const { spot, sprite } of this.still) sprite.visible = near(spot);
  }
}

function place({ spot, animator, sprite }: FlowerView): void {
  const frame = animator.currentFrame();
  if (frame) placeFrame(sprite, frame, spot.x, spot.y);
}
