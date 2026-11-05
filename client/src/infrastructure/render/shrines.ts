// The shrines of domain/shrines.ts in the world: solid at the foot, grey until
// they wake up, then in their colours with a soft light that breathes. Waking
// up they flare. The light is added over the darkness, in screen space.
import { Container, Sprite, type Texture } from "pixi.js";
import { SHRINE_KINDS, type Shrine } from "../../domain/shrines";
import type { MazeInfo } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { radial } from "./flame-glow";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const SCALE = 1.5;
const FOOT_W = 36; // its solid box, px
const FOOT_H = 12;
const LIGHT_ABOVE = 64; // px from the feet to the middle of the light
const LIGHT_RADIUS = 90;
const LIGHT_COLOR: [number, number, number] = [214, 226, 255];
const LIGHT = 0.16; // how strong it stays...
const FLARE = 0.75; // ...and how strong it wakes up
const FLARE_MS = 1100;
const BREATH_MS = 700;

interface ShrineView {
  shrine: Shrine;
  sprite: Sprite;
  glow: Sprite;
  awake: boolean;
  flareMs: number;
}

export class ShrineViews {
  // Screen space, over the darkness. The owner adds it to the stage.
  readonly light = new Container();
  private readonly views = new Map<number, ShrineView>();
  private readonly texture: Texture = radial(LIGHT_RADIUS, LIGHT_COLOR);
  private clockMs = 0;

  constructor(
    shrines: Shrine[],
    private readonly sheet: SpriteSheet,
    depth: Container,
    maze: MazeInfo,
    awake: number[],
  ) {
    for (const shrine of shrines) {
      const sprite = new Sprite();
      sprite.zIndex = depthOf(shrine.y, DEPTH.prop);
      depth.addChild(sprite);
      maze.addObstacle({ x: shrine.x - FOOT_W / 2, y: shrine.y - FOOT_H, w: FOOT_W, h: FOOT_H });
      const glow = new Sprite(this.texture);
      glow.anchor.set(0.5);
      glow.blendMode = "add";
      this.light.addChild(glow);
      const view = { shrine, sprite, glow, awake: awake.includes(shrine.id), flareMs: 0 };
      this.views.set(shrine.id, view);
      this.paint(view);
    }
  }

  isAwake(id: number): boolean {
    return this.views.get(id)?.awake ?? false;
  }

  get awakeIds(): number[] {
    return [...this.views.values()].filter((v) => v.awake).map((v) => v.shrine.id);
  }

  wake(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    view.awake = true;
    view.flareMs = FLARE_MS;
    this.paint(view);
  }

  update(dtMs: number, toScreen: (x: number, y: number) => [number, number]): void {
    this.clockMs += dtMs;
    const breath = 0.8 + 0.2 * Math.sin(this.clockMs / BREATH_MS);
    for (const view of this.views.values()) {
      view.flareMs = Math.max(0, view.flareMs - dtMs);
      const [x, y] = toScreen(view.shrine.x, view.shrine.y - LIGHT_ABOVE);
      view.glow.visible = view.awake;
      view.glow.position.set(Math.round(x), Math.round(y));
      view.glow.alpha = LIGHT * breath + FLARE * (view.flareMs / FLARE_MS);
      view.glow.scale.set(1 + view.flareMs / FLARE_MS);
    }
  }

  private paint(view: ShrineView): void {
    const frame = this.sheet.frames[view.shrine.id + (view.awake ? 0 : SHRINE_KINDS)];
    placeFrame(view.sprite, frame, view.shrine.x, view.shrine.y, SCALE);
  }
}
