// The level up around the player, Efectos/NivelAura.aseprite: yellow stars
// turn around the body leaving essence behind ("rodea"), and when they close
// in it bursts ("estalla"). The player only levels up in the eyes of the game at that
// burst: update() says when.
//
// The Atras layer stands in the world, just behind the body. The Frente layer
// goes over the darkness, so the essence shines at night.
import { Sprite } from "pixi.js";
import { type Frame, type SpriteSheet } from "./sprite-sheet";

const WRAP = "rodea";
const BURST = "estalla";

function lengthOf(frames: Frame[]): number {
  return frames.reduce((ms, frame) => ms + frame.durationMs, 0);
}

export class LevelAura {
  readonly behind = new Sprite();
  readonly front = new Sprite();
  private readonly wrapMs: number;
  private readonly totalMs: number;
  private ageMs = Infinity; // past the end: not running

  constructor(
    private readonly behindSheet: SpriteSheet,
    private readonly frontSheet: SpriteSheet,
  ) {
    this.wrapMs = lengthOf(frontSheet.animations.get(WRAP)!);
    this.totalMs = this.wrapMs + lengthOf(frontSheet.animations.get(BURST)!);
    for (const sprite of [this.behind, this.front]) {
      sprite.anchor.set(0.5);
      sprite.visible = false;
    }
  }

  // Still wrapping the body: the level up has not burst yet.
  get wrapping(): boolean {
    return this.ageMs < this.wrapMs;
  }

  start(): void {
    this.ageMs = 0;
  }

  // Returns true on the frame it bursts.
  update(dtMs: number): boolean {
    const wasWrapping = this.wrapping;
    this.ageMs += dtMs;
    return wasWrapping && !this.wrapping;
  }

  // (x, y) the middle of the body, in the world. (offsetX, offsetY) turn world
  // into screen, for the front. `depth` sorts the back part behind the body.
  show(x: number, y: number, offsetX: number, offsetY: number, depth: number): void {
    const running = this.ageMs < this.totalMs;
    this.behind.visible = this.front.visible = running;
    if (!running) return;
    const index = this.frameIndex();
    this.behind.texture = this.behindSheet.frames[index].texture;
    this.front.texture = this.frontSheet.frames[index].texture;
    this.behind.position.set(Math.round(x), Math.round(y));
    this.behind.zIndex = depth;
    this.front.position.set(Math.round(x) + offsetX, Math.round(y) + offsetY);
  }

  private frameIndex(): number {
    const { frames } = this.frontSheet;
    let ms = this.ageMs;
    for (let i = 0; i < frames.length; i++) {
      ms -= frames[i].durationMs;
      if (ms < 0) return i;
    }
    return frames.length - 1;
  }
}
