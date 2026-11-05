// The birds of domain/birds.ts: above everything while they fly, with their
// shadow on the floor, and among the rest of the world on the ground.
import { type Container, Graphics, Sprite } from "pixi.js";
import type { Bird } from "../../domain/birds";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const SCALE = 1.5;
const FRAMES = 5; // per bird: perched, pecking, wing up, level, down (art/aves.py)
const FLAP = [2, 3, 4, 3]; // the frames of a wingbeat
const FLAP_MS = 70;
const GLIDE_FLAP_MS = 120; // slower, coming down
const PECK_EVERY_MS = 1700;
const PECK_MS = 260;
const ON_THE_FLOOR = 10; // px of height under which it sorts with the world
const SHADOW_ALPHA = 0.22;

interface BirdView {
  sprite: Sprite;
  shadow: Graphics;
  clockMs: number;
}

export class BirdViews {
  private readonly views = new Map<Bird, BirdView>();

  // `depth`: the depth-sorted layer. `ground`: the flat one, for the shadows.
  constructor(
    private readonly sheet: SpriteSheet,
    private readonly depth: Container,
    private readonly ground: Container,
  ) {}

  update(dtMs: number, birds: Bird[]): void {
    for (const [bird, view] of this.views) {
      if (birds.includes(bird)) continue;
      view.sprite.destroy();
      view.shadow.destroy();
      this.views.delete(bird);
    }
    for (const bird of birds) {
      const view = this.views.get(bird) ?? this.add(bird);
      view.clockMs += dtMs;
      const frame = this.sheet.frames[bird.kind * FRAMES + frameOf(bird, view.clockMs)];
      placeFrame(view.sprite, frame, bird.x, bird.y - bird.height, SCALE);
      if (!bird.facesLeft) {
        view.sprite.scale.x = -SCALE;
        view.sprite.x += frame.w * SCALE;
      }
      view.sprite.zIndex = bird.height < ON_THE_FLOOR ? depthOf(bird.y, DEPTH.prop) : Number.MAX_SAFE_INTEGER - 1;
      view.shadow.position.set(Math.round(bird.x), Math.round(bird.y));
    }
  }

  private add(bird: Bird): BirdView {
    const sprite = new Sprite();
    this.depth.addChild(sprite);
    const shadow = new Graphics().ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    this.ground.addChild(shadow);
    // Each one on its own beat
    const view = { sprite, shadow, clockMs: Math.random() * PECK_EVERY_MS };
    this.views.set(bird, view);
    return view;
  }
}

function frameOf(bird: Bird, clockMs: number): number {
  if (bird.state === "perched") return clockMs % PECK_EVERY_MS < PECK_MS ? 1 : 0;
  const beat = bird.state === "landing" ? GLIDE_FLAP_MS : FLAP_MS;
  return FLAP[Math.floor(clockMs / beat) % FLAP.length];
}
