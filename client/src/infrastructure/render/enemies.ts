// Draws the level 1 enemies the C core moves (src/mecanicas/enemigos.c):
// Brian's Espartano1 in 8 directions, idle, walking and running, and dying
// one of three ways by where it faces (DEATH_BY_FACING). Each
// one faces where it looks (at the player while it stalks), flashes red when
// hit and shows a small life bar once hurt. One a spear pinned to a wall is
// carried there on the spear (it slides from where it was hit), plays the hit
// against it once and then hangs there bleeding. Around a bonfire they hop as
// they go, and the one screaming shows it in a burst over its head. One
// inside a bush the player is not in cannot be seen (League of Legends' rule).
// The weapon it carries (a spear, a torch or an axe) is drawn in its hand like
// the player's,
// gone once it dies (it falls to the floor, or not, see dropLoot in main.ts).
import { Container, Graphics, Sprite } from "pixi.js";
import { type Direction, directionFromVector } from "../../domain/facing";
import { SPEAR_FLIGHT_SPEED } from "../../domain/items";
import type { EnemyState } from "../wasm/game-wasm";
import { STATE } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

// Espartano1_Anim.aseprite (art/espartano.py): 64x96 canvas, floor at y = 82.
const FEET_PADDING = 13; // like the player: the bottom row of the floor line
const BAR_WIDTH = 20;
const BAR_ABOVE_FEET = 56; // px from the feet to the life bar, over the crest
export const HIT_TINT = 0xff7070;
// Bosses are bigger spartans for now, each in its own colour, until their
// sprites come (ZONE in game-wasm.ts). Winding up a blow they flash.
const BOSS_TINT: Record<number, number> = { 1: 0xa8e6a0, 2: 0x8fc4ff, 3: 0xff8a6a };
const CHARGE_TINT = 0xfff0a0;
const CHARGE_FLASHES = 6; // flashes over the whole wind-up, faster towards the blow
// Dancing around the fire they hop, each on its own beat.
const HOP_HEIGHT = 6; // px
const HOP_MS = 150; // the hop's speed
// The scream: a white burst with the word in it, trembling.
const SCREAM_ABOVE_FEET = 62; // px from the feet to the burst's bottom
const SCREAM_H = 9;
const SCREAM_INK = 0xa02030;
const SCREAM_EDGE = 0x2e222f;
const SCREAMS = ["AAH!", "AAA!", "HAA!", "AHH!"];
// Its letters, 3 px wide and 5 tall (a row is three bits).
const LETTERS: Record<string, number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  "!": [0b010, 0b010, 0b010, 0b000, 0b010],
};
// pinned_hit_*: 10 frames of 70 ms, then the pinned_* loop.
const PIN_HIT_MS = 700;
const TILE = 32; // LAB_TILE in src/mecanicas/laberinto.h

// The weapon it holds is drawn with the player's own overlays for it (the
// <weapon>_fx sheets of art/armas.py: same size, pose and swing with the
// steps, in front of the body and behind it), the hand in the enemy's skin.
// Both canvases are 64x96 with the floor at the same row, so they line up.
export interface WeaponOverlays {
  front: SpriteSheet;
  behind: SpriteSheet;
}

// The three deaths (art/espartano.py): facing the camera it falls on its back,
// sideways it slumps over on its side, facing away it falls on its face.
const DEATH_BY_FACING: Record<Direction, string> = {
  front: "death_front",
  down_left: "death_front",
  down_right: "death_front",
  right: "death_right",
  left: "death_left",
  back: "death_back",
  up_left: "death_back",
  up_right: "death_back",
};

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
  weaponFront: Sprite;
  weaponBehind: Sprite;
  bar: Graphics;
  bubble: Graphics;
  animator: Animator;
  seen: number;
  pinnedMs: number; // time since it reached the wall it is pinned to
  x: number; // where it was drawn last
  y: number;
  // Carried on the spear from where it was hit to the wall it is pinned to.
  slide: { fromX: number; fromY: number; ms: number; totalMs: number } | null;
}

export class EnemyViews {
  private readonly views = new Map<number, EnemyView>();
  private frame = 0;
  private clockMs = 0;

  // `depth`: the depth-sorted container they stand in.
  constructor(
    private readonly depth: Container,
    private readonly sheet: SpriteSheet,
    private readonly weapons: (id: string) => WeaponOverlays | undefined,
  ) {}

  // Shows `enemies` as they are now; advances their animations `dtMs`.
  // `playerBush`: the bush the player stands in (-1 if none).
  show(enemies: EnemyState[], dtMs: number, playerBush: number): void {
    const frame = ++this.frame;
    this.clockMs += dtMs;
    for (const enemy of enemies) {
      let view = this.views.get(enemy.slot);
      if (!view) {
        view = this.create(enemy);
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

  private create(enemy: EnemyState): EnemyView {
    const view: EnemyView = {
      root: new Container(),
      sprite: new Sprite(),
      weaponFront: new Sprite(),
      weaponBehind: new Sprite(),
      bar: new Graphics(),
      bubble: new Graphics(),
      animator: new Animator(this.sheet),
      seen: 0,
      pinnedMs: 0,
      x: enemy.x,
      y: enemy.y,
      slide: null,
    };
    view.root.addChild(view.weaponBehind, view.sprite, view.weaponFront, view.bar, view.bubble);
    this.depth.addChild(view.root);
    return view;
  }

  private place(view: EnemyView, enemy: EnemyState, dtMs: number): void {
    const motion = MOTION_BY_STATE[STATE[enemy.state] ?? "QUIETO"];
    const dead = motion === "death";
    let { x, y } = enemy;
    const hop = enemy.mood === "CHARLA" && !dead ? Math.abs(Math.sin(this.clockMs / HOP_MS + enemy.slot)) * HOP_HEIGHT : 0;
    if (enemy.pinned && view.pinnedMs === 0 && !view.slide) {
      // Just pinned: C already put it at the wall. Carry it there from where
      // it was, at the spear's speed.
      const far = Math.hypot(enemy.x - view.x, enemy.y - view.y);
      if (far > 1) view.slide = { fromX: view.x, fromY: view.y, ms: 0, totalMs: (far / SPEAR_FLIGHT_SPEED) * 1000 };
    }
    if (view.slide) {
      view.slide.ms += dtMs;
      const p = Math.min(1, view.slide.ms / view.slide.totalMs);
      x = view.slide.fromX + (enemy.x - view.slide.fromX) * p;
      y = view.slide.fromY + (enemy.y - view.slide.fromY) * p;
      if (p === 1) view.slide = null;
    }
    if (enemy.pinned) {
      view.animator.play(`${view.pinnedMs < PIN_HIT_MS ? "pinned_hit" : "pinned"}_${enemy.pinned}`);
      if (view.slide) view.animator.seek(0); // on the spear, until it hits the wall
      else view.pinnedMs += dtMs;
    }
    const looking = Math.hypot(enemy.lookX, enemy.lookY) > 0.01;
    const facing = looking ? directionFromVector(enemy.lookX, enemy.lookY) : "front";
    if (!enemy.pinned) {
      if (dead) view.animator.play(DEATH_BY_FACING[facing], false);
      else view.animator.play(`${motion}_${facing}`);
    }
    if (!view.slide) view.animator.update(dtMs);
    view.x = x;
    view.y = y;
    const frame = view.animator.currentFrame();
    if (!frame) return;
    placeFrame(view.sprite, frame, x, y - hop + FEET_PADDING * enemy.scale, enemy.scale);
    view.sprite.tint = this.tintOf(enemy);
    this.placeWeapon(view, enemy, `${motion}_${facing}`, x, y - hop, dead || enemy.pinned !== null);
    // Pinned to a side face it stands in the wall's own row: drawn after the
    // wall, so the cracks and the spearhead show on it.
    const side = (enemy.pinned === "left" || enemy.pinned === "right") && !view.slide;
    const depthY = side ? (Math.floor(y / TILE) + 1) * TILE : y;
    view.root.zIndex = depthOf(depthY, DEPTH.prop);

    // A boss shows its life in the HUD, not over its head
    const hurt = !dead && enemy.life < enemy.lifeMax && !enemy.boss;
    view.bar.visible = hurt;
    if (hurt) drawLifeBar(view.bar, enemy.x, enemy.y - BAR_ABOVE_FEET, BAR_WIDTH, enemy.life, enemy.lifeMax);

    const screaming = !dead && enemy.talking;
    view.bubble.visible = screaming;
    if (screaming) this.drawScream(view.bubble, enemy.x, enemy.y - hop - SCREAM_ABOVE_FEET, enemy.slot);
  }

  // The weapon in its hand: the player's overlay frame for this animation, at
  // the same share of the cycle (the enemy's loops have other frame counts).
  private placeWeapon(view: EnemyView, enemy: EnemyState, tag: string, x: number, y: number, gone: boolean): void {
    const fx = enemy.weapon && !gone ? this.weapons(enemy.weapon) : undefined;
    for (const [sprite, sheet] of [
      [view.weaponFront, fx?.front],
      [view.weaponBehind, fx?.behind],
    ] as const) {
      const frame = sheet ? view.animator.frameAtShareIn(sheet, tag) : null;
      sprite.visible = frame !== null;
      if (!frame) continue;
      placeFrame(sprite, frame, x, y + FEET_PADDING * enemy.scale, enemy.scale);
      sprite.tint = view.sprite.tint;
    }
  }

  private tintOf(enemy: EnemyState): number {
    if (enemy.hitMs > 0) return HIT_TINT;
    // Winding up: flashes that speed up as the blow comes (the cue to dodge)
    if (enemy.charge > 0 && Math.floor(enemy.charge * enemy.charge * CHARGE_FLASHES * 2) % 2 === 0) return CHARGE_TINT;
    return BOSS_TINT[enemy.boss] ?? 0xffffff;
  }

  // The burst over (x, y), a word to each one, trembling.
  private drawScream(g: Graphics, x: number, y: number, slot: number): void {
    const word = SCREAMS[slot % SCREAMS.length];
    const w = word.length * 4 + 3;
    const shake = Math.round(Math.sin(this.clockMs / 23));
    const left = Math.round(x - w / 2) + shake;
    const top = Math.round(y - SCREAM_H);
    const right = left + w;
    const bottom = top + SCREAM_H;
    const burst = [
      left, top, left + w / 3, top - 2, left + w / 2, top, right - 3, top - 2, right, top, right + 2, top + 4, right, bottom,
      left + w * 0.6, bottom, x - 2, bottom + 5, left + w * 0.3, bottom, left, bottom, left - 2, top + 4,
    ];
    g.clear().poly(burst).fill(0xffffff).stroke({ color: SCREAM_EDGE, width: 1 });
    [...word].forEach((letter, i) => {
      LETTERS[letter].forEach((row, dy) => {
        for (let dx = 0; dx < 3; dx++) {
          if (row & (0b100 >> dx)) g.rect(left + 2 + i * 4 + dx, top + 2 + dy, 1, 1).fill(SCREAM_INK);
        }
      });
    });
  }
}

// A small life bar, centered on x with its top at y.
export function drawLifeBar(g: Graphics, x: number, y: number, width: number, life: number, lifeMax: number): void {
  const left = Math.round(x - width / 2);
  const top = Math.round(y);
  g.clear()
    .rect(left - 1, top - 1, width + 2, 4)
    .fill(0x1a1622)
    .rect(left, top, Math.max(1, Math.round((width * life) / lifeMax)), 2)
    .fill(0xd95763);
}
