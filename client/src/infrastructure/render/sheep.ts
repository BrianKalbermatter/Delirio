// The wild sheep of src/mecanicas/ovejas.c: C moves them, this shows them. The
// drawing looks right and is mirrored when they go left; each one has its own
// clock, so they never graze in step.
import { type Container, Sprite } from "pixi.js";
import { type Sheep, SHEEP_STATE } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { animationDurationMs, placeFrame, type SpriteSheet } from "./sprite-sheet";
import type { View } from "./plaza-deco";

const SCALE = 1.5;
const MARGIN = 64; // px past the edge of the view that still counts as in view
const TURN_AT = 0.2; // sideways share of its way from which it turns around
const TAGS: Record<number, string> = {
  [SHEEP_STATE.grazing]: "pasta",
  [SHEEP_STATE.walking]: "camina",
  [SHEEP_STATE.fleeing]: "corre",
};

interface SheepView {
  animator: Animator;
  sprite: Sprite;
  left: boolean;
}

export class SheepViews {
  private readonly views: SheepView[] = [];

  constructor(
    private readonly sheet: SpriteSheet,
    private readonly depth: Container,
  ) {}

  update(dtMs: number, sheep: Sheep[], view: View): void {
    sheep.forEach((one, i) => {
      const shown = this.views[i] ?? this.add(i);
      const { sprite, animator } = shown;
      sprite.visible =
        one.x > view.left - MARGIN &&
        one.x < view.left + view.width + MARGIN &&
        one.y > view.top - MARGIN &&
        one.y < view.top + view.height + MARGIN;
      if (Math.abs(one.dirX) > TURN_AT) shown.left = one.dirX < 0;
      if (!sprite.visible) return;
      animator.play(TAGS[one.state]);
      animator.update(dtMs);
      const frame = animator.currentFrame();
      if (!frame) return;
      placeFrame(sprite, frame, one.x, one.y, SCALE);
      if (shown.left) {
        sprite.scale.x = -SCALE;
        sprite.x += frame.w * SCALE;
      }
      sprite.zIndex = depthOf(one.y, DEPTH.prop);
    });
  }

  private add(i: number): SheepView {
    const animator = new Animator(this.sheet);
    animator.play(TAGS[SHEEP_STATE.grazing]);
    // Spread their starts over the loop (golden ratio: never in step).
    animator.update(((i * 0.618) % 1) * animationDurationMs(this.sheet, TAGS[SHEEP_STATE.grazing]));
    const sprite = new Sprite();
    this.depth.addChild(sprite);
    const shown = { animator, sprite, left: i % 2 === 0 };
    this.views[i] = shown;
    return shown;
  }
}
