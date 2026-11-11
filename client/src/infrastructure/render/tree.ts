// The trees of the square (sprites/Arboles/Arbol2 and Arbol3, art/arbol2_build.sh
// and art/arbol3_build.sh): one still drawing and its shadow each, and the
// stones and tufts of some. A tree turns see-through while the player is behind
// its crown, so it never loses sight of itself. Its trunk is solid (an obstacle
// in C), and an axe fells it in HITS_TO_FELL hits, shaking it and bringing its
// leaves down. A tree's id is its place in the list.
import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { type Tree, trunkBox } from "../../domain/trees";
import type { MazeInfo } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import type { Box } from "./maze-renderer";

// By species (SPECIES): where the trunk's foot is on the drawing canvas (the
// tree and its shadow share it) and the crown, from the foot, at scale 1.
const SHAPES = [
  { foot: { x: 63, y: 101 }, crown: { left: -34, right: 39, top: -84, bottom: -13 } },
  { foot: { x: 75, y: 124 }, crown: { left: -36, right: 39, top: -102, bottom: -34 } },
];
const SEE_THROUGH = 0.45; // alpha while the player is behind it
const PIECE_SIZE = 16; // px of each frame of arbol_3_pie
const HITS_TO_FELL = 3;
const SHAKE_MS = 260; // the shake after a hit
const SHAKE_STEP_MS = 40; // it moves every this long
const SHAKE_PX = 2;
const FADE_MS = 650; // a felled tree goes in this long
const LEAVES_PER_HIT = 10;
const LEAVES_FELLED = 70;
const LEAF_MAX = 500;
const LEAF_FALL = [34, 70]; // px/s (min, max)
const LEAF_SWAY = [5, 13]; // px to each side (min, max)
const LEAF_SWAY_SPEED = 0.005; // radians per ms
const LEAF_SPREAD = 22; // px around the foot where they land, up and down
const LEAF_REST_MS = 900; // on the floor, before fading
const LEAF_FADE_MS = 500;
// The colours of the leaves, by species.
const LEAF_COLORS = [
  [0xeaf23a, 0xc4d41e, 0x8ea012, 0x5d6c0a],
  [0xffd23c, 0xf7a51c, 0xd9720f, 0xa8460c],
];


export interface TreeArt {
  tree: Texture;
  shadow: Texture;
}

interface TreeView {
  tree: Tree;
  sprite: Sprite;
  shadow: Sprite;
  obstacle: number; // its number in C (-1: none, C was full)
  hits: number;
  shakeMs: number;
}

interface Leaf {
  x: number;
  y: number;
  floorY: number;
  fall: number; // px/s
  sway: number; // px to each side
  phase: number;
  size: number;
  color: number;
  restMs: number; // time on the floor so far
}

export class TreeViews {
  // The shadows, stones and tufts lie flat on the ground, under everything
  // that stands. The owner adds it to the ground layer.
  readonly ground = new Container();
  private readonly views = new Map<number, TreeView>(); // by id
  private readonly felled: Set<number>;
  private readonly fading: { view: TreeView; ms: number }[] = [];
  private readonly leafView = new Graphics(); // over everything that stands
  private leaves: Leaf[] = [];

  // `art`: by species. `pieces`: the strip of stones and tufts. `felled`: the
  // ids of the trees already cut down.
  constructor(
    trees: Tree[],
    art: TreeArt[],
    pieces: Texture,
    standing: Container,
    private readonly maze: MazeInfo,
    felled: number[],
  ) {
    this.felled = new Set(felled);
    trees.forEach((tree, id) => {
      if (this.felled.has(id)) return;
      const sprite = this.placed(tree, art[tree.species].tree);
      sprite.zIndex = depthOf(tree.y, DEPTH.tree);
      standing.addChild(sprite);
      const shadow = this.placed(tree, art[tree.species].shadow);
      this.ground.addChild(shadow);
      const obstacle = maze.addObstacle(trunkBox(tree));
      this.views.set(id, { tree, sprite, shadow, obstacle, hits: 0, shakeMs: 0 });
    });
    // After every shadow, so none of them falls over a stone
    for (const tree of trees) {
      for (const piece of tree.foot) {
        const frame = new Rectangle(piece.kind * PIECE_SIZE, 0, PIECE_SIZE, PIECE_SIZE);
        const sprite = new Sprite(new Texture({ source: pieces.source, frame }));
        sprite.anchor.set(0.5, 1);
        sprite.position.set(piece.x, piece.y);
        sprite.scale.set(tree.scale);
        this.ground.addChild(sprite);
      }
    }
    this.leafView.zIndex = Number.MAX_SAFE_INTEGER;
    standing.addChild(this.leafView);
  }

  // Ids of the trees cut down so far (for the save).
  get felledIds(): number[] {
    return [...this.felled];
  }

  // The id of the closest standing tree with its foot within `reach`, or null.
  nearest(x: number, y: number, reach: number): number | null {
    let best: number | null = null;
    let bestD = reach;
    for (const [id, { tree }] of this.views) {
      const d = Math.hypot(x - tree.x, y - tree.y);
      if (d <= bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  // An axe blow: it shakes and drops leaves. The tree if that felled it
  // (where it stood, for what it drops), null otherwise.
  hit(id: number): Tree | null {
    const view = this.views.get(id);
    if (!view) return null;
    view.hits++;
    view.shakeMs = SHAKE_MS;
    const fells = view.hits >= HITS_TO_FELL;
    this.dropLeaves(view.tree, fells ? LEAVES_FELLED : LEAVES_PER_HIT);
    if (!fells) return null;
    this.views.delete(id);
    this.felled.add(id);
    if (view.obstacle >= 0) this.maze.removeObstacle(view.obstacle);
    this.fading.push({ view, ms: FADE_MS });
    return view.tree;
  }

  update(dtMs: number): void {
    for (const view of this.views.values()) {
      if (view.shakeMs > 0) this.shake(view, dtMs);
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const fade = this.fading[i];
      fade.ms -= dtMs;
      this.shake(fade.view, dtMs);
      fade.view.sprite.alpha = fade.view.shadow.alpha = Math.max(0, fade.ms / FADE_MS);
      if (fade.ms > 0) continue;
      fade.view.sprite.destroy();
      fade.view.shadow.destroy();
      this.fading.splice(i, 1);
    }
    this.updateLeaves(dtMs);
  }

  show(player: Box): void {
    for (const { tree, sprite } of this.views.values()) sprite.alpha = hides(tree, player) ? SEE_THROUGH : 1;
  }

  private placed(tree: Tree, texture: Texture): Sprite {
    const sprite = new Sprite(texture);
    const { foot } = SHAPES[tree.species];
    sprite.anchor.set(foot.x / texture.width, foot.y / texture.height);
    sprite.position.set(tree.x, tree.y);
    sprite.scale.set(tree.scale);
    return sprite;
  }

  // Left and right, calming down.
  private shake(view: TreeView, dtMs: number): void {
    view.shakeMs -= dtMs;
    const step = Math.floor(view.shakeMs / SHAKE_STEP_MS);
    const dx = view.shakeMs > 0 ? (step % 2 === 0 ? SHAKE_PX : -SHAKE_PX) : 0;
    view.sprite.x = view.tree.x + dx;
  }

  // Leaves come off all over the crown and flutter down around the foot.
  private dropLeaves(tree: Tree, count: number): void {
    const { crown } = SHAPES[tree.species];
    const colors = LEAF_COLORS[tree.species];
    const between = ([a, b]: number[]) => a + Math.random() * (b - a);
    for (let i = 0; i < count && this.leaves.length < LEAF_MAX; i++) {
      const x = tree.x + between([crown.left, crown.right]) * tree.scale;
      this.leaves.push({
        x,
        y: tree.y + between([crown.top, crown.bottom]) * tree.scale,
        floorY: tree.y + between([-LEAF_SPREAD, LEAF_SPREAD]),
        fall: between(LEAF_FALL),
        sway: between(LEAF_SWAY),
        phase: Math.random() * Math.PI * 2,
        size: Math.random() < 0.5 ? 2 : 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        restMs: 0,
      });
    }
  }

  private updateLeaves(dtMs: number): void {
    if (this.leaves.length === 0) return;
    this.leafView.clear();
    this.leaves = this.leaves.filter((leaf) => leaf.restMs < LEAF_REST_MS + LEAF_FADE_MS);
    for (const leaf of this.leaves) {
      if (leaf.y < leaf.floorY) {
        leaf.y += (leaf.fall * dtMs) / 1000;
        leaf.phase += dtMs * LEAF_SWAY_SPEED;
      } else {
        leaf.restMs += dtMs;
      }
      const x = Math.round(leaf.x + Math.sin(leaf.phase) * leaf.sway);
      const alpha = 1 - Math.max(0, leaf.restMs - LEAF_REST_MS) / LEAF_FADE_MS;
      this.leafView.rect(x, Math.round(leaf.y), leaf.size, leaf.size - 1).fill({ color: leaf.color, alpha });
    }
  }
}

// True when the player stands behind the tree, under its crown.
function hides({ x, y, scale, species }: Tree, player: Box): boolean {
  const { crown } = SHAPES[species];
  return (
    player.bottom < y &&
    player.bottom > y + crown.top * scale &&
    player.top < y + crown.bottom * scale &&
    player.right > x + crown.left * scale &&
    player.left < x + crown.right * scale
  );
}
