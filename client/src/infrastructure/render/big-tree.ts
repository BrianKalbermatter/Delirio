// Draws Brian's big tree (sprites/Arboles/Arbol1_pintado.aseprite) with the
// grass around its foot and its shadow, and plays its animations: "idle" is a
// slow wind loop (art/arbol_viento.lua); hitting it shakes the crown once and
// drops leaves (the "chop" tag), then it goes back to idle.
// While the player is behind it, only the crown turns see-through; the trunk
// stays solid, drawn from its own sheet.
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { SampleTree } from "../../domain/sample-tree";
import type { Box } from "./maze-renderer";
import { Animator } from "./animator";
import { DEPTH, depthOf } from "./depth";
import { animationDurationMs, placeFrame, type SpriteSheet } from "./sprite-sheet";

export interface BigTreeArt {
  whole: SpriteSheet;
  trunk: SpriteSheet;
  crown: SpriteSheet;
  grassBack: Texture; // drawn before the tree
  grassFront: Texture; // drawn after it, over the roots
  sticks: Texture; // strip of STICK_SIZE loose sticks
  shadow: Texture; // the crown's shadow on the ground (art/sombra_arbol.py)
}

// Where the trunk's foot is on the drawing canvas (Arbol1, 540x540). The
// export trims the frames; their source offset says where they were cut, and
// since frames are drawn by their bottom centre, the foot shifts them.
const FOOT_IN_CANVAS = { x: 156, y: 338 };
// Where the foot is inside the grass images (art/pasto_arbol.py).
const FOOT_IN_GRASS = { x: 110, y: 44 };
// The crown, from the foot: rows above CROWN_LOW, HALF_WIDTH to each side.
const CROWN_LOW = 88;
const CROWN_HIGH = 238;
const CROWN_HALF_WIDTH = 140;
const SEE_THROUGH = 0.45; // crown alpha while the player is behind it
// A hit lands this far ahead of the player's feet, and reaches the trunk
// from up to HIT_RADIUS away.
const REACH_AHEAD = 20;
const HIT_RADIUS = 44;
const STICK_SIZE = 16;
// The shadow's centre, from the foot: under the middle of the crown (it
// leans right of the trunk) and a bit behind the foot.
const SHADOW_SHIFT = { x: 12, y: -8 };

export class BigTree {
  // The shadow and the loose sticks lie flat on the ground, under everything
  // that stands. The owner adds it to the ground layer.
  readonly ground = new Container();
  // Grass, tree and grass again, sorted by depth with everything else at the
  // trunk's foot. The owner adds it to the depth-sorted layer.
  readonly view = new Container();
  private readonly animator: Animator;
  private choppingMs = 0; // time left of the current chop, 0 when idle
  private readonly whole = new Sprite();
  // While the player is behind the tree: the trunk and the faded crown.
  private readonly trunk = new Sprite();
  private readonly crown = new Sprite();

  constructor(
    private readonly tree: SampleTree,
    private readonly art: BigTreeArt,
  ) {
    this.animator = new Animator(art.whole);
    this.animator.play("idle");

    const { shadow } = art;
    const shadowSprite = new Sprite(shadow);
    shadowSprite.position.set(
      Math.round(tree.x + SHADOW_SHIFT.x - shadow.width / 2),
      Math.round(tree.y + SHADOW_SHIFT.y - shadow.height / 2),
    );
    this.ground.addChild(shadowSprite);
    for (const s of tree.sticks) {
      const frame = new Rectangle(s.kind * STICK_SIZE, 0, STICK_SIZE, STICK_SIZE);
      const stick = new Sprite(new Texture({ source: art.sticks.source, frame }));
      stick.position.set(Math.round(s.x - STICK_SIZE / 2), Math.round(s.y - STICK_SIZE / 2));
      this.ground.addChild(stick);
    }

    this.crown.alpha = SEE_THROUGH;
    this.view.addChild(this.grass(art.grassBack), this.whole, this.trunk, this.crown, this.grass(art.grassFront));
    this.view.zIndex = depthOf(tree.y, DEPTH.tree);
  }

  // Shakes the tree if the hit, thrown from the feet towards `dir`, reaches it.
  chop(feetX: number, feetY: number, [dirX, dirY]: [number, number]): boolean {
    const hitX = feetX + dirX * REACH_AHEAD;
    const hitY = feetY + dirY * REACH_AHEAD;
    if (Math.hypot(hitX - this.tree.x, hitY - this.tree.y) > HIT_RADIUS) return false;
    this.animator.play("idle"); // restart the chop even if it was playing
    this.animator.play("chop", false);
    this.choppingMs = animationDurationMs(this.art.whole, "chop");
    return true;
  }

  update(dtMs: number): void {
    this.animator.update(dtMs);
    if (this.choppingMs > 0) {
      this.choppingMs -= dtMs;
      if (this.choppingMs <= 0) this.animator.play("idle");
    }
  }

  // Shows the current frame: whole, or trunk and see-through crown when the
  // player is behind it.
  show(player: Box): void {
    const { x, y } = this.tree;
    const frame = this.animator.currentFrame();
    const behind = this.hides(player);
    this.whole.visible = frame !== null && !behind;
    this.trunk.visible = this.crown.visible = frame !== null && behind;
    if (!frame) return;
    // placeFrame puts a frame's bottom centre at the point given.
    const fx = x + frame.w / 2 - (FOOT_IN_CANVAS.x - frame.sourceX);
    const fy = y + frame.h - (FOOT_IN_CANVAS.y - frame.sourceY);
    if (behind) {
      placeFrame(this.trunk, this.animator.frameIn(this.art.trunk), fx, fy);
      placeFrame(this.crown, this.animator.frameIn(this.art.crown), fx, fy);
    } else {
      placeFrame(this.whole, frame, fx, fy);
    }
  }

  private grass(texture: Texture): Sprite {
    const sprite = new Sprite(texture);
    sprite.position.set(this.tree.x - FOOT_IN_GRASS.x, this.tree.y - FOOT_IN_GRASS.y);
    return sprite;
  }

  // True when the player stands behind the tree, under its crown.
  private hides(player: Box): boolean {
    const { x, y } = this.tree;
    return (
      player.bottom < y &&
      player.bottom > y - CROWN_HIGH &&
      player.top < y - CROWN_LOW &&
      player.right > x - CROWN_HALF_WIDTH &&
      player.left < x + CROWN_HALF_WIDTH
    );
  }
}
