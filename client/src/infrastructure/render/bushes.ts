// The bushes of the world (C keeps them in src/mecanicas/arbustos.c). The ones
// with a radius are the big round bushes the player hides in, like League of
// Legends' brush (art/arbustos_build.sh). Each sorts by the lowest point of its
// circle, so whoever stands inside is drawn behind the leaves; the bush the
// player is in turns see-through and sways.
//
// The ones without a radius are smaller fruit bushes of three sizes
// (art/arbustos_frutos.py): they hide nobody, and their fruit is picked with E
// and grows back.
import { type Container, Sprite } from "pixi.js";
import type { Bush } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { type Frame, placeFrame, type SpriteSheet } from "./sprite-sheet";

const BELOW_CIRCLE = 6; // px from the circle's lowest point to the frame's bottom
const SEE_THROUGH = 0.6; // alpha of the bush the player is in
const SWAY_MS = 220; // it leans to the other side every this long
const SWAY_PX = 1;
// Frames of the big sheet that look like a bush: the rest of it has big leaves
// that do not go with the place.
const ROUND_BUSHES = [0, 1, 2];
const FRUIT_SCALES = [1.5, 1, 0.75]; // the sizes of the fruit bushes
// Item of each fruit bush, by frame of the sheet. The same frames, this many
// further on, are the bushes already picked.
export const FRUIT_ITEMS = ["berries", "grapes", "pomegranate"];
const REGROW_MS = 240000; // about a day: the fruit is back

interface BushView {
  bush: Bush;
  frame: Frame;
  scale: number;
  sprite: Sprite;
  // On a fruit bush: which fruit, the frame without it and how long until it
  // is back (0: it has fruit).
  fruit?: { kind: number; full: Frame; bare: Frame; regrowMs: number };
}

export class BushViews {
  private readonly views: BushView[];
  private swayMs = 0;

  constructor(bushes: Bush[], sheet: SpriteSheet, fruitSheet: SpriteSheet, depth: Container) {
    // Taking turns, so every drawing and size shows up
    let round = 0;
    let fruits = 0;
    this.views = bushes.map((bush) => {
      const sprite = new Sprite();
      sprite.zIndex = depthOf(bush.y + bush.radius, DEPTH.bush);
      depth.addChild(sprite);
      let view: BushView;
      if (bush.radius > 0) {
        view = { bush, frame: sheet.frames[ROUND_BUSHES[round++ % ROUND_BUSHES.length]], scale: 1, sprite };
      } else {
        const kind = fruits % FRUIT_ITEMS.length;
        const scale = FRUIT_SCALES[Math.floor(fruits / FRUIT_ITEMS.length) % FRUIT_SCALES.length];
        fruits++;
        const full = fruitSheet.frames[kind];
        const bare = fruitSheet.frames[kind + FRUIT_ITEMS.length];
        view = { bush, frame: full, scale, sprite, fruit: { kind, full, bare, regrowMs: 0 } };
      }
      place(view, 0);
      return view;
    });
  }

  // The nearest bush with fruit within `reach` px of (x, y), by its number.
  fruitInReach(x: number, y: number, reach: number): number | null {
    let best: number | null = null;
    let bestD = reach;
    this.views.forEach((view, i) => {
      if (!view.fruit || view.fruit.regrowMs > 0) return;
      const d = Math.hypot(view.bush.x - x, view.bush.y - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  // Which fruit bush `i` gives: an index of FRUIT_ITEMS.
  fruitKind(i: number): number {
    return this.views[i].fruit!.kind;
  }

  // Takes the fruit off bush `i`.
  pick(i: number): void {
    const view = this.views[i];
    view.fruit!.regrowMs = REGROW_MS;
    view.frame = view.fruit!.bare;
    place(view, 0);
  }

  // `playerBush`: the bush the player stands in (-1 if none). It sways while
  // the player is inside; the rest stay still.
  update(dtMs: number, playerBush: number): void {
    this.swayMs += dtMs;
    const side = Math.floor(this.swayMs / SWAY_MS) % 2 === 0 ? SWAY_PX : -SWAY_PX;
    this.views.forEach((view, i) => {
      if (view.fruit && view.fruit.regrowMs > 0) {
        view.fruit.regrowMs -= dtMs;
        if (view.fruit.regrowMs <= 0) {
          view.fruit.regrowMs = 0;
          view.frame = view.fruit.full;
        }
      }
      const inside = i === playerBush;
      view.sprite.alpha = inside ? SEE_THROUGH : 1;
      place(view, inside ? side : 0);
    });
  }
}

function place({ bush, frame, scale, sprite }: BushView, dx: number): void {
  placeFrame(sprite, frame, bush.x + dx, bush.y + bush.radius + BELOW_CIRCLE, scale);
}
