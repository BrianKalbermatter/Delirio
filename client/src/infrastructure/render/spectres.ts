// The enemies of src/mecanicas/enemigos.c that are not spartans: the ghost, the
// spirit that throws, the skeletons, Medusa and her little ones (art/espectros.py).
// Each has one drawing, looking left, mirrored when it looks right. Also what
// they throw.
import { type Container, Graphics, Sprite } from "pixi.js";
import type { ATTACK, EnemyState, Shot } from "../wasm/game-wasm";
import { STATE } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { drawLifeBar, HIT_TINT, STEADY_MS } from "./enemies";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const FLOOR_MARGIN = 3; // px of the frames under the feet (art/espectros.py)
const BAR_WIDTH = 20;
const SHOT_ABOVE = 26; // px over the floor it flies at
const TURN_AT = 0.2; // sideways share of the look from which it turns around
const DROP_FROM = 190; // px over the floor a ghost's drop starts falling from
const DROP_MARK = 26; // half the width of the mark it casts on the floor when it lands
const DROP_MARK_COLOR = 0x0c0a12;
const DROP_MARK_EDGE = 0xd6dae8;
const DROP_FLOOR = 4; // px of its frames under the floor (art/espectros.py)

export interface SpectreSheets {
  ghost: SpriteSheet;
  spirit: SpriteSheet;
  skeleton: SpriteSheet;
  shot: SpriteSheet;
  drop: SpriteSheet;
  medusa: SpriteSheet;
  mini_medusa: SpriteSheet;
  wheel: SpriteSheet;
  centaur: SpriteSheet;
  arrow: SpriteSheet;
}

type Kind = "ghost" | "spirit" | "skeleton" | "medusa" | "mini_medusa" | "wheel" | "centaur";

const BAR_ABOVE: Record<Kind, number> = { ghost: 104, spirit: 86, skeleton: 68, medusa: 0, mini_medusa: 48, wheel: 128, centaur: 0 };
// Drawn this much bigger, times what C says for a boss (the centaur's picture
// is already big).
const SCALE: Record<Kind, number> = { ghost: 1, spirit: 1, skeleton: 1, medusa: 1, mini_medusa: 1, wheel: 1.5, centaur: 0.5 };
// What each moment of an attack of src/mecanicas/enemigos.c shows.
type AttackTags = Record<NonNullable<(typeof ATTACK)[number]>, string>;
const TAGS: Record<Kind, { idle: string; move: string; strike: string; born: string; charge?: string; attack?: AttackTags }> = {
  ghost: { idle: "flota", move: "flota", strike: "ataca", born: "aparece", attack: { prepare: "ataca", strike: "ataca", recover: "flota" } },
  spirit: { idle: "flota", move: "flota", strike: "lanza", born: "aparece" },
  skeleton: { idle: "quieto", move: "camina", strike: "prepara", born: "levanta", attack: { prepare: "prepara", strike: "salta", recover: "aterriza" } },
  wheel: { idle: "quieto", move: "camina", strike: "prepara", born: "levanta", attack: { prepare: "prepara", strike: "manotazo", recover: "recupera" } },
  medusa: { idle: "quieto", move: "camina", strike: "dispara", born: "aparece" },
  mini_medusa: { idle: "quieto", move: "camina", strike: "dispara", born: "aparece" },
  centaur: { idle: "quieto", move: "camina", strike: "prepara", born: "quieto", charge: "embiste" },
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
  private readonly shots: { sprite: Sprite; mark: Graphics; animator: Animator }[] = [];
  private frame = 0;
  private dropClockMs = 0;

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
    else if (enemy.attack && tags.attack) view.animator.play(tags.attack[enemy.attack], false);
    else if (state === "CORRIENDO" && tags.charge) view.animator.play(tags.charge);
    else if (state === "ATACANDO" || enemy.mood === "ATACA") view.animator.play(tags.strike, view.kind !== "centaur");
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
    const scale = SCALE[view.kind] * enemy.scale;
    placeFrame(sprite, frame, enemy.x, enemy.y + FLOOR_MARGIN * scale, scale);
    if (view.right) {
      sprite.scale.x = -scale;
      sprite.x += frame.w * scale;
    }
    sprite.tint = enemy.hitMs > 0 ? HIT_TINT : 0xffffff;
    sprite.zIndex = depthOf(enemy.y, DEPTH.prop);
    const hurt = !dead && enemy.life < enemy.lifeMax && !enemy.boss; // a boss's is in the HUD
    view.bar.visible = hurt;
    if (hurt) drawLifeBar(view.bar, enemy.x, enemy.y - BAR_ABOVE[view.kind], BAR_WIDTH, enemy.life, enemy.lifeMax);
  }

  private showShots(shots: Shot[], dtMs: number): void {
    while (this.shots.length < shots.length) {
      const sprite = new Sprite();
      const mark = new Graphics();
      this.depth.addChild(mark, sprite);
      const animator = new Animator(this.sheets.shot);
      animator.play("vuela");
      this.shots.push({ sprite, mark, animator });
    }
    this.shots.forEach(({ sprite, mark, animator }, i) => {
      const shot = shots[i];
      sprite.visible = shot !== undefined;
      mark.visible = shot?.drop != null && shot.drop.burst === 0;
      if (!shot) return;
      sprite.zIndex = depthOf(shot.y, DEPTH.prop);
      if (shot.drop) {
        this.showDrop(sprite, mark, shot, shot.drop, dtMs);
        return;
      }
      if (shot.arrow) {
        sprite.texture = this.sheets.arrow.frames[0].texture;
        sprite.anchor.set(0.5);
        sprite.scale.set(1);
        sprite.rotation = Math.atan2(shot.dirY, shot.dirX);
        sprite.position.set(Math.round(shot.x), Math.round(shot.y - SHOT_ABOVE));
        return;
      }
      animator.update(dtMs);
      const frame = animator.currentFrame();
      if (!frame) return;
      sprite.anchor.set(0);
      sprite.rotation = 0;
      placeFrame(sprite, frame, shot.x, shot.y - SHOT_ABOVE);
    });
  }

  // Comes down faster and faster, over a mark on the floor that says where.
  private showDrop(sprite: Sprite, mark: Graphics, shot: Shot, drop: NonNullable<Shot["drop"]>, dtMs: number): void {
    const falling = this.sheets.drop.animations.get("cae") ?? [];
    const splash = this.sheets.drop.animations.get("estalla") ?? [];
    this.dropClockMs += dtMs;
    sprite.anchor.set(0);
    sprite.rotation = 0;
    if (drop.burst > 0) {
      placeFrame(sprite, splash[Math.min(splash.length - 1, Math.floor(drop.burst * splash.length))], shot.x, shot.y + DROP_FLOOR);
      return;
    }
    const closing = 1 - drop.height;
    const frame = falling[Math.floor(this.dropClockMs / falling[0].durationMs) % falling.length];
    placeFrame(sprite, frame, shot.x, shot.y + DROP_FLOOR - DROP_FROM * (1 - closing * closing));
    const half = DROP_MARK * (0.4 + 0.6 * closing);
    mark.clear();
    mark.ellipse(shot.x, shot.y, half, half * 0.45).fill({ color: DROP_MARK_COLOR, alpha: 0.35 + 0.35 * closing });
    mark.ellipse(shot.x, shot.y, DROP_MARK, DROP_MARK * 0.45).stroke({ color: DROP_MARK_EDGE, alpha: 0.5, width: 1 });
    mark.zIndex = depthOf(shot.y - 1, DEPTH.prop); // under whoever stands on it
  }
}
