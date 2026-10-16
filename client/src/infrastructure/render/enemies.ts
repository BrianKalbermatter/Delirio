// Draws the level 1 enemies the C core moves (src/mecanicas/enemigos.c):
// Brian's Enemigo1 in 8 directions, idle, walking, running and dying. Each
// one faces where it looks (at the player while it stalks), flashes red when
// hit and shows a small life bar once hurt.
import { Container, Graphics, Sprite } from "pixi.js";
import { directionFromVector } from "../../domain/facing";
import type { EnemyState } from "../wasm/game-wasm";
import { STATE } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

// Enemigo1_Anim.aseprite: 64x96 canvas, floor at y = 82.
const FEET_PADDING = 13; // like the player: the bottom row of the floor line
const BAR_WIDTH = 20;
const BAR_ABOVE_FEET = 70; // px from the feet to the life bar
const HIT_TINT = 0xff7070;

const MOTION_BY_STATE: Record<(typeof STATE)[number], string> = {
  QUIETO: "idle",
  CAMINANDO: "walk",
  ATACANDO: "run",
  CORRIENDO: "run",
  MUERTO: "death",
};

interface EnemyView {
  root: Container;
  sprite: Sprite;
  bar: Graphics;
  animator: Animator;
  seen: number;
}

export class EnemyViews {
  private readonly views = new Map<number, EnemyView>();
  private frame = 0;

  // `depth`: the depth-sorted container they stand in.
  constructor(
    private readonly depth: Container,
    private readonly sheet: SpriteSheet,
  ) {}

  // Shows `enemies` as they are now; advances their animations `dtMs`.
  show(enemies: EnemyState[], dtMs: number): void {
    const frame = ++this.frame;
    for (const enemy of enemies) {
      let view = this.views.get(enemy.slot);
      if (!view) {
        view = this.create();
        this.views.set(enemy.slot, view);
      }
      view.seen = frame;
      this.place(view, enemy, dtMs);
    }
    for (const [slot, view] of this.views) {
      if (view.seen === frame) continue;
      view.root.destroy({ children: true });
      this.views.delete(slot);
    }
  }

  private create(): EnemyView {
    const view: EnemyView = {
      root: new Container(),
      sprite: new Sprite(),
      bar: new Graphics(),
      animator: new Animator(this.sheet),
      seen: 0,
    };
    view.root.addChild(view.sprite, view.bar);
    this.depth.addChild(view.root);
    return view;
  }

  private place(view: EnemyView, enemy: EnemyState, dtMs: number): void {
    const motion = MOTION_BY_STATE[STATE[enemy.state] ?? "QUIETO"];
    const dead = motion === "death";
    if (dead) {
      view.animator.play("death", false);
    } else {
      const looking = Math.hypot(enemy.lookX, enemy.lookY) > 0.01;
      const facing = looking ? directionFromVector(enemy.lookX, enemy.lookY) : "front";
      view.animator.play(`${motion}_${facing}`);
    }
    view.animator.update(dtMs);
    const frame = view.animator.currentFrame();
    if (!frame) return;
    placeFrame(view.sprite, frame, enemy.x, enemy.y + FEET_PADDING);
    view.sprite.tint = enemy.hitMs > 0 ? HIT_TINT : 0xffffff;
    view.root.zIndex = depthOf(enemy.y, DEPTH.prop);

    const hurt = !dead && enemy.life < enemy.lifeMax;
    view.bar.visible = hurt;
    if (hurt) {
      const x = Math.round(enemy.x - BAR_WIDTH / 2);
      const y = Math.round(enemy.y - BAR_ABOVE_FEET);
      view.bar
        .clear()
        .rect(x - 1, y - 1, BAR_WIDTH + 2, 4)
        .fill(0x1a1622)
        .rect(x, y, Math.max(1, Math.round((BAR_WIDTH * enemy.life) / enemy.lifeMax)), 2)
        .fill(0xd95763);
    }
  }
}
