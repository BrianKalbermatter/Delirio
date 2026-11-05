// The enemies of src/mecanicas/enemigos.c that are not spartans: the ghost, the
// spirit that throws and the skeleton (art/espectros.py). Each has one drawing,
// looking left, mirrored when it looks right. Also what the spirits throw.
import { type Container, Graphics, Sprite } from "pixi.js";
import type { EnemyState, Shot } from "../wasm/game-wasm";
import { STATE } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { drawLifeBar, HIT_TINT, STEADY_MS } from "./enemies";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const FLOOR_MARGIN = 3; // px of the frames under the feet (art/espectros.py)
const BAR_WIDTH = 20;
const SHOT_ABOVE = 26; // px over the floor it flies at
const TURN_AT = 0.2; // sideways share of the look from which it turns around

export interface SpectreSheets {
  ghost: SpriteSheet;
  spirit: SpriteSheet;
  skeleton: SpriteSheet;
  shot: SpriteSheet;
}

type Kind = "ghost" | "spirit" | "skeleton";

const BAR_ABOVE: Record<Kind, number> = { ghost: 104, spirit: 86, skeleton: 68 };
const TAGS: Record<Kind, { idle: string; move: string; strike: string; born: string }> = {
  ghost: { idle: "flota", move: "flota", strike: "ataca", born: "aparece" },
  spirit: { idle: "flota", move: "flota", strike: "lanza", born: "aparece" },
  skeleton: { idle: "quieto", move: "camina", strike: "ataca", born: "levanta" },
};

interface SpectreView {
  kind: Kind;
  sprite: Sprite;
  bar: Graphics;
  animator: Animator;
  seen: number;
  right: boolean;
  turnMs: number;
  stillMs: number;
}

export class SpectreViews {
  private readonly views = new Map<number, SpectreView>();
  private readonly shots: { sprite: Sprite; animator: Animator }[] = [];
  private frame = 0;

  constructor(
    private readonly depth: Container,
    private readonly sheets: SpectreSheets,
  ) {}

  show(enemies: EnemyState[], shots: Shot[], dtMs: number): void {
    const frame = ++this.frame;
    for (const enemy of enemies) {
      const kind = enemy.kind as Kind;
      let view = this.views.get(enemy.slot);
      if (view?.kind !== kind) {
        this.remove(enemy.slot);
        view = this.create(enemy.slot, kind);
      }
      view.seen = frame;
      this.place(view, enemy, dtMs);
    }
    for (const [slot, view] of this.views) if (view.seen !== frame) this.remove(slot);
    this.showShots(shots, dtMs);
  }

  private create(slot: number, kind: Kind): SpectreView {
    const animator = new Animator(this.sheets[kind]);
    animator.play(TAGS[kind].born, false);
    const view: SpectreView = { kind, sprite: new Sprite(), bar: new Graphics(), animator, seen: 0, right: false, turnMs: 0, stillMs: 0 };
    this.depth.addChild(view.sprite, view.bar);
    view.bar.zIndex = Number.MAX_SAFE_INTEGER;
    this.views.set(slot, view);
    return view;
  }

  private remove(slot: number): void {
    const view = this.views.get(slot);
    if (!view) return;
    view.sprite.destroy();
    view.bar.destroy();
    this.views.delete(slot);
  }

  private place(view: SpectreView, enemy: EnemyState, dtMs: number): void {
    const tags = TAGS[view.kind];
    const state = STATE[enemy.state];
    const dead = state === "MUERTO";
    if (enemy.lying) {
      view.animator.play("muere", false);
      view.animator.seek(Number.MAX_SAFE_INTEGER);
    } else if (dead) view.animator.play("muere", false);
    else if (enemy.birthMs > 0) view.animator.play(tags.born, false);
    else if (state === "ATACANDO" || enemy.mood === "ATACA") view.animator.play(tags.strike);
    else {
      view.stillMs = state === "QUIETO" ? view.stillMs + dtMs : 0;
      view.animator.play(view.stillMs >= STEADY_MS ? tags.idle : tags.move);
    }
    view.animator.update(dtMs);
    const frame = view.animator.currentFrame();
    if (!frame) return;
    const turning = Math.abs(enemy.lookX) > TURN_AT && enemy.lookX > 0 !== view.right;
    view.turnMs = turning ? view.turnMs + dtMs : 0;
    if (view.turnMs >= STEADY_MS) view.right = !view.right;
    const { sprite } = view;
    placeFrame(sprite, frame, enemy.x, enemy.y + FLOOR_MARGIN);
    if (view.right) {
      sprite.scale.x = -1;
      sprite.x += frame.w;
    }
    sprite.tint = enemy.hitMs > 0 ? HIT_TINT : 0xffffff;
    sprite.zIndex = depthOf(enemy.y, DEPTH.prop);
    const hurt = !dead && enemy.life < enemy.lifeMax;
    view.bar.visible = hurt;
    if (hurt) drawLifeBar(view.bar, enemy.x, enemy.y - BAR_ABOVE[view.kind], BAR_WIDTH, enemy.life, enemy.lifeMax);
  }

  private showShots(shots: Shot[], dtMs: number): void {
    while (this.shots.length < shots.length) {
      const sprite = new Sprite();
      this.depth.addChild(sprite);
      const animator = new Animator(this.sheets.shot);
      animator.play("vuela");
      this.shots.push({ sprite, animator });
    }
    this.shots.forEach(({ sprite, animator }, i) => {
      const shot = shots[i];
      sprite.visible = shot !== undefined;
      if (!shot) return;
      animator.update(dtMs);
      const frame = animator.currentFrame();
      if (!frame) return;
      placeFrame(sprite, frame, shot.x, shot.y - SHOT_ABOVE);
      sprite.zIndex = depthOf(shot.y, DEPTH.prop);
    });
  }
}
