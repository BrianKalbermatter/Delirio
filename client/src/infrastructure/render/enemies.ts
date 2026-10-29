// Draws the level 1 enemies the C core moves (src/mecanicas/enemigos.c):
// Brian's Enemigo1 in 8 directions, idle, walking, running and dying. Each
// one faces where it looks (at the player while it stalks), flashes red when
// hit and shows a small life bar once hurt. One a spear pinned to a wall plays
// the hit against it once and then hangs there bleeding. In a chatting circle the one
// speaking shows a speech bubble; the dancer's steps play the walk. One
// inside a bush the player is not in cannot be seen (League of Legends' rule).
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
// Speech bubble: a small white box with three dots that light up in turn.
const BUBBLE_ABOVE_FEET = 84; // px from the feet to the bubble's bottom
const BUBBLE_W = 15;
const BUBBLE_H = 9;
const DOT_MS = 260; // each dot lights up this long
const BUBBLE_INK = 0x2e222f;
// pinned_hit_*: 10 frames of 70 ms, then the pinned_* loop.
const PIN_HIT_MS = 700;
const TILE = 32; // LAB_TILE in src/mecanicas/laberinto.h

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
  bubble: Graphics;
  animator: Animator;
  seen: number;
  pinnedMs: number; // time since it was pinned
}

export class EnemyViews {
  private readonly views = new Map<number, EnemyView>();
  private frame = 0;
  private clockMs = 0;

  // `depth`: the depth-sorted container they stand in.
  constructor(
    private readonly depth: Container,
    private readonly sheet: SpriteSheet,
  ) {}

  // Shows `enemies` as they are now; advances their animations `dtMs`.
  // `playerBush`: the bush the player stands in (-1 if none).
  show(enemies: EnemyState[], dtMs: number, playerBush: number): void {
    const frame = ++this.frame;
    this.clockMs += dtMs;
    for (const enemy of enemies) {
      let view = this.views.get(enemy.slot);
      if (!view) {
        view = this.create();
        this.views.set(enemy.slot, view);
      }
      view.seen = frame;
      view.root.visible = enemy.bush < 0 || enemy.bush === playerBush;
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
      bubble: new Graphics(),
      animator: new Animator(this.sheet),
      seen: 0,
      pinnedMs: 0,
    };
    view.root.addChild(view.sprite, view.bar, view.bubble);
    this.depth.addChild(view.root);
    return view;
  }

  private place(view: EnemyView, enemy: EnemyState, dtMs: number): void {
    const motion = MOTION_BY_STATE[STATE[enemy.state] ?? "QUIETO"];
    const dead = motion === "death";
    if (enemy.pinned) {
      view.animator.play(`${view.pinnedMs < PIN_HIT_MS ? "pinned_hit" : "pinned"}_${enemy.pinned}`);
      view.pinnedMs += dtMs;
    } else if (dead) {
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
    // Pinned to a side face it stands in the wall's own row: drawn after the
    // wall, so the cracks and the spearhead show on it.
    const depthY = enemy.pinned === "left" || enemy.pinned === "right" ? (Math.floor(enemy.y / TILE) + 1) * TILE : enemy.y;
    view.root.zIndex = depthOf(depthY, DEPTH.prop);

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

    const talking = !dead && enemy.talking;
    view.bubble.visible = talking;
    if (talking) this.drawBubble(view.bubble, enemy.x, enemy.y - BUBBLE_ABOVE_FEET);
  }

  // The bubble with its tail at (x, y), its dots lit in turn.
  private drawBubble(g: Graphics, x: number, y: number): void {
    const left = Math.round(x - BUBBLE_W / 2);
    const top = Math.round(y - BUBBLE_H);
    const lit = Math.floor(this.clockMs / DOT_MS) % 4; // 0..2 one dot, 3 all
    g.clear()
      .roundRect(left - 1, top - 1, BUBBLE_W + 2, BUBBLE_H + 2, 3)
      .fill(BUBBLE_INK)
      .roundRect(left, top, BUBBLE_W, BUBBLE_H, 2)
      .fill(0xffffff)
      .poly([x - 2, top + BUBBLE_H, x + 2, top + BUBBLE_H, x - 3, top + BUBBLE_H + 4])
      .fill(0xffffff);
    for (let d = 0; d < 3; d++) {
      const on = lit === 3 || lit === d;
      g.rect(left + 3 + d * 4, top + 4, 2, 2).fill(on ? BUBBLE_INK : 0xb0a8b9);
    }
  }
}
