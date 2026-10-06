// Draws the trees and plays their chop animation: hitting a tree shakes its
// crown once and drops leaves (all drawn in the "chop" tag), then it goes
// back to "idle".
//
// The dark forest's crowns close over the player. Those around the player
// fade, opening a small clearing to see the floor (and what lies on it);
// further away the forest stays dark.
import type { Tree } from "../../domain/trees";
import { Animator } from "./animator";
import type { Box, View } from "./maze-renderer";
import { animationDurationMs, drawFrame, type SpriteSheet } from "./sprite-sheet";

// Trees are designed on an 80x96 frame with the trunk base at y = 86 and
// exported bigger (common trees x2.5, forest trees x3). These shares of the
// frame size give each tree its own measures.
const TRUNK_PADDING = 10 / 96; // empty rows under the trunk base
const CROWN_HALF_WIDTH = 30 / 80; // crown, to see through a tree hiding the player
const CROWN_HEIGHT = 80 / 96;
const TRUNK_HALF_WIDTH = 0.15; // a hit lands on the trunk within this
// The hit lands this far ahead of the player's feet, in the facing direction.
const REACH_AHEAD = 20;
const MIN_HIT_RADIUS = 30;
const SEE_THROUGH_ALPHA = 0.45;
const CROWN_CENTER = 0.55; // crown centre, as a share of the frame height above the base
// Forest crowns closer than CLEARING_RADIUS to the player fade. Inside
// CLEARING_OPEN of it they are almost gone (crowns overlap, so their alphas
// stack); from there out they close back in.
const CLEARING_RADIUS = 210; // px
const CLEARING_OPEN = 0.5;
const CLEARING_ALPHA = 0.04; // crown alpha in the open part

// Every tree is exported three times: whole, its trunk (with the shadow) and
// its crown (with the falling leaves). A faded tree is drawn as a solid trunk
// under a see-through crown, since the trunk is a real obstacle.
export interface TreeSheets {
  whole: SpriteSheet;
  trunk: SpriteSheet;
  crown: SpriteSheet;
}

interface TreeView {
  tree: Tree;
  sheet: SpriteSheet;
  parts: TreeSheets;
  animator: Animator;
  choppingMs: number; // time left of the current chop, 0 when idle
}

export class Trees {
  private readonly views: TreeView[];

  constructor(trees: Tree[], sheets: Map<string, TreeSheets>) {
    this.views = trees.map((tree) => {
      const parts = sheets.get(tree.sprite)!;
      const animator = new Animator(parts.whole);
      animator.play("idle");
      return { tree, sheet: parts.whole, parts, animator, choppingMs: 0 };
    });
  }

  // Hits the tree in front of the player, if any. Returns true when one was hit.
  chop(feetX: number, feetY: number, [dirX, dirY]: [number, number]): boolean {
    const hitX = feetX + dirX * REACH_AHEAD;
    const hitY = feetY + dirY * REACH_AHEAD;
    let nearest: TreeView | null = null;
    let nearestDistance = Infinity;
    for (const view of this.views) {
      const d = Math.hypot(view.tree.x - hitX, view.tree.y - hitY);
      const reach = Math.max(MIN_HIT_RADIUS, view.sheet.frameWidth * TRUNK_HALF_WIDTH);
      if (d <= reach && d < nearestDistance) {
        nearest = view;
        nearestDistance = d;
      }
    }
    if (!nearest) return false;
    // Through "idle" so a second hit restarts the shake from its first frame.
    nearest.animator.play("idle");
    nearest.animator.play("chop", false);
    nearest.choppingMs = animationDurationMs(nearest.sheet, "chop");
    return true;
  }

  update(dtMs: number): void {
    for (const view of this.views) {
      if (view.choppingMs > 0) {
        view.choppingMs -= dtMs;
        if (view.choppingMs <= 0) view.animator.play("idle");
      }
      view.animator.update(dtMs);
    }
  }

  // One entry per tree in `view` for the depth sort: its trunk base is its
  // depth. `player` is the player's drawn body, to fade a crown in front of it.
  drawables(
    ctx: CanvasRenderingContext2D,
    view: View,
    player: Box,
  ): { y: number; draw: () => void }[] {
    return this.views.filter((v) => this.inView(v, view)).map((v) => ({
      y: v.tree.y,
      draw: () => {
        const { x, y } = v.tree;
        const halfWidth = v.sheet.frameWidth * CROWN_HALF_WIDTH;
        const hides =
          player.bottom < y &&
          player.right > x - halfWidth &&
          player.left < x + halfWidth &&
          player.bottom > y - v.sheet.frameHeight * CROWN_HEIGHT;
        const feetY = y + Math.round(v.sheet.frameHeight * TRUNK_PADDING);
        // The player behind the tree: the whole tree fades, trunk too, so the
        // player shows through it.
        if (hides) {
          ctx.save();
          ctx.globalAlpha = Math.min(SEE_THROUGH_ALPHA, v.tree.forest ? clearingAlpha(v, player) : 1);
          v.animator.draw(ctx, x, feetY);
          ctx.restore();
          return;
        }
        const alpha = v.tree.forest ? clearingAlpha(v, player) : 1;
        if (alpha >= 1) {
          v.animator.draw(ctx, x, feetY);
          return;
        }
        // In the forest clearing: solid trunk under a see-through crown.
        drawFrame(ctx, v.parts.trunk, v.animator.frameIn(v.parts.trunk), x, feetY);
        ctx.save();
        ctx.globalAlpha = alpha;
        drawFrame(ctx, v.parts.crown, v.animator.frameIn(v.parts.crown), x, feetY);
        ctx.restore();
      },
    }));
  }

  private inView({ tree, sheet }: TreeView, view: View): boolean {
    const half = sheet.frameWidth / 2;
    return (
      tree.x + half >= view.left &&
      tree.x - half <= view.left + view.width &&
      tree.y + sheet.frameHeight >= view.top &&
      tree.y - sheet.frameHeight <= view.top + view.height
    );
  }
}

// Forest crowns near the player fade: almost gone close by, closing back in
// smoothly towards the edge of the clearing.
function clearingAlpha({ tree, sheet }: TreeView, player: Box): number {
  const crownY = tree.y - sheet.frameHeight * CROWN_CENTER;
  const playerX = (player.left + player.right) / 2;
  const playerY = (player.top + player.bottom) / 2;
  const d = Math.hypot(tree.x - playerX, crownY - playerY) / CLEARING_RADIUS;
  if (d >= 1) return 1;
  if (d <= CLEARING_OPEN) return CLEARING_ALPHA;
  const u = (d - CLEARING_OPEN) / (1 - CLEARING_OPEN);
  return CLEARING_ALPHA + (1 - CLEARING_ALPHA) * u * u * (3 - 2 * u);
}
