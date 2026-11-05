// The bonfires of src/mecanicas/enemigos.c, the enemies' spawners (art/hoguera.py):
// C keeps their life, this shows them. The fire shrinks as they lose life and a
// broken one stays as a cold heap of bones. Their light is added over the
// darkness, in screen space: from far off, in the night, they call attention.
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { Bonfire } from "../wasm/game-wasm";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { drawLifeBar, HIT_TINT } from "./enemies";
import { radial } from "./flame-glow";
import type { View } from "./plaza-deco";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const MARGIN = 220; // px past the edge of the view that still counts as in view
const FEET_BELOW = 18; // px from C's center to the bottom of the heap
const DEPTH_BELOW = 4; // who walks past this row goes in front of the fire
const BAR_ABOVE = 96; // px from its center to its life bar
const BAR_WIDTH = 44;
const SHAKE = 2; // px, while hit
const FIRE_ABOVE = 22; // px from its center to the middle of the flames
const FIRE_RIGHT = 12; // the fire is not in the middle of the drawing
const GLOW_RADIUS = 130;
const CORE_RADIUS = 40;
const GLOW_COLOR: [number, number, number] = [214, 200, 60];
const CORE_COLOR: [number, number, number] = [255, 246, 150];
// How strong the light is with the sun down and up.
const NIGHT_LIGHT = 0.32;
const DAY_LIGHT = 0;
// The drawing's fire again, added over the darkness: at night it still burns.
const NIGHT_FIRE = 0.3;

interface BonfireView {
  sprite: Sprite;
  animator: Animator;
  bar: Graphics;
  glow: Sprite;
  core: Sprite;
  fire: Sprite;
  clockMs: number;
}

export class BonfireViews {
  // Screen space, over the darkness. The owner adds it to the stage.
  readonly light = new Container();
  private readonly views: BonfireView[] = [];
  private readonly glowTexture: Texture = radial(GLOW_RADIUS, GLOW_COLOR);
  private readonly coreTexture: Texture = radial(CORE_RADIUS, CORE_COLOR);

  constructor(
    private readonly sheet: SpriteSheet,
    private readonly depth: Container,
  ) {}

  // `toScreen`: world px to the screen's. `daylight` 0..1.
  update(dtMs: number, bonfires: Bonfire[], view: View, toScreen: (x: number, y: number) => [number, number], daylight: number): void {
    bonfires.forEach((one, i) => {
      const shown = this.views[i] ?? this.add(i);
      const seen =
        one.x > view.left - MARGIN &&
        one.x < view.left + view.width + MARGIN &&
        one.y > view.top - MARGIN &&
        one.y < view.top + view.height + MARGIN;
      shown.sprite.visible = seen;
      shown.bar.visible = false;
      for (const light of [shown.glow, shown.core, shown.fire]) light.visible = seen && !one.out;
      if (seen) this.place(shown, one, dtMs, toScreen, daylight);
    });
  }

  private place(
    shown: BonfireView,
    one: Bonfire,
    dtMs: number,
    toScreen: (x: number, y: number) => [number, number],
    daylight: number,
  ): void {
    const { sprite, animator, bar, glow, core, fire } = shown;
    shown.clockMs += dtMs;
    const share = one.life / one.lifeMax;
    animator.play(one.out ? "apagada" : share > 0.6 ? "arde" : share > 0.25 ? "herida" : "agoniza");
    animator.update(dtMs);
    const frame = animator.currentFrame();
    if (!frame) return;
    const shake = one.hitMs > 0 ? Math.sin(shown.clockMs / 18) * SHAKE : 0;
    placeFrame(sprite, frame, one.x + shake, one.y + FEET_BELOW);
    sprite.tint = one.hitMs > 0 ? HIT_TINT : 0xffffff;
    sprite.zIndex = depthOf(one.y + DEPTH_BELOW, DEPTH.prop);
    if (one.out) return;

    const hurt = one.life < one.lifeMax;
    bar.visible = hurt;
    if (hurt) drawLifeBar(bar, one.x, one.y - BAR_ABOVE, BAR_WIDTH, one.life, one.lifeMax);

    const flicker = 0.85 + 0.1 * Math.sin(shown.clockMs / 90) + 0.05 * Math.sin(shown.clockMs / 37);
    const strength = (DAY_LIGHT + (NIGHT_LIGHT - DAY_LIGHT) * (1 - daylight)) * flicker * (0.35 + 0.65 * share);
    const [x, y] = toScreen(one.x + FIRE_RIGHT, one.y - FIRE_ABOVE);
    glow.position.set(Math.round(x), Math.round(y));
    glow.alpha = strength;
    glow.scale.set(0.55 + 0.45 * share);
    core.position.set(Math.round(x), Math.round(y));
    core.alpha = strength * 0.5;
    const [left, top] = toScreen(sprite.x, sprite.y);
    fire.texture = frame.texture;
    fire.position.set(Math.round(left), Math.round(top));
    fire.alpha = NIGHT_FIRE * (1 - daylight);
  }

  private add(i: number): BonfireView {
    const animator = new Animator(this.sheet);
    animator.play("arde");
    const sprite = new Sprite();
    const bar = new Graphics();
    this.depth.addChild(sprite, bar);
    bar.zIndex = Number.MAX_SAFE_INTEGER;
    const glow = new Sprite(this.glowTexture);
    const core = new Sprite(this.coreTexture);
    const fire = new Sprite();
    for (const light of [glow, core]) light.anchor.set(0.5);
    for (const light of [glow, core, fire]) light.blendMode = "add";
    this.light.addChild(glow, core, fire);
    const shown = { sprite, animator, bar, glow, core, fire, clockMs: i * 137 };
    this.views[i] = shown;
    return shown;
  }
}
