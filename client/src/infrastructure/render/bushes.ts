// The bushes the player hides in, like League of Legends' brush (C keeps them
// in src/mecanicas/arbustos.c; art from art/arbusto.py). Each one sorts by
// the lowest point of its circle, so whoever stands inside is drawn behind
// the leaves. The bush the player is in turns see-through and sways.
import { type Container, Sprite } from "pixi.js";
import type { Bush } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const VARIANTS = 3; // tags viento_0 .. viento_2 in arbusto.json
const BELOW_CIRCLE = 6; // px from the circle's lowest point to the frame's bottom
const SEE_THROUGH = 0.6; // alpha of the bush the player is in

interface BushView {
  bush: Bush;
  animator: Animator;
  sprite: Sprite;
}

export class BushViews {
  private readonly views: BushView[];

  constructor(bushes: Bush[], sheet: SpriteSheet, depth: Container) {
    this.views = bushes.map((bush, i) => {
      const animator = new Animator(sheet);
      animator.play(`viento_${i % VARIANTS}`);
      const sprite = new Sprite();
      const bottom = bush.y + bush.radius;
      sprite.zIndex = depthOf(bottom, DEPTH.bush);
      depth.addChild(sprite);
      const view = { bush, animator, sprite };
      place(view);
      return view;
    });
  }

  // `playerBush`: the bush the player stands in (-1 if none). It sways while
  // he is inside; the rest stay still, on their first frame.
  update(dtMs: number, playerBush: number): void {
    this.views.forEach((view, i) => {
      const inside = i === playerBush;
      if (inside) view.animator.update(dtMs);
      else view.animator.seek(0);
      view.sprite.alpha = inside ? SEE_THROUGH : 1;
      place(view);
    });
  }
}

function place({ bush, animator, sprite }: BushView): void {
  const frame = animator.currentFrame();
  if (frame) placeFrame(sprite, frame, bush.x, bush.y + bush.radius + BELOW_CIRCLE);
}
