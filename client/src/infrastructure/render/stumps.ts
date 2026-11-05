// The stumps of domain/stumps.ts in the world: drawn standing with the rest and
// solid at the trunk. What grew around them is scenery, walked through like the
// meadow: tall grass and bushes standing, stones and tufts flat on the floor.
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { KINDS, type Stump, stumpBox } from "../../domain/stumps";
import type { MazeInfo } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const PIECE_SIZE = 16; // a stone or tuft of the arbol_3_pie strip, px

export class StumpViews {
  // Stones and tufts, flat on the floor.
  readonly ground = new Container();

  // `grass`: the Gramilla textures by kind. `pieces`: the arbol_3_pie strip.
  constructor(
    stumps: Stump[],
    sheet: SpriteSheet,
    bushes: SpriteSheet,
    grass: Texture[],
    pieces: Texture,
    depth: Container,
    maze: MazeInfo,
  ) {
    for (const stump of stumps) {
      const sprite = new Sprite();
      const frame = sheet.frames[stump.age * KINDS + stump.kind];
      placeFrame(sprite, frame, stump.x, stump.y, stump.scale);
      if (stump.flipped) {
        sprite.scale.x = -stump.scale;
        sprite.x += frame.w * stump.scale;
      }
      sprite.zIndex = depthOf(stump.y, DEPTH.prop);
      depth.addChild(sprite);
      maze.addObstacle(stumpBox(stump));
      for (const bush of stump.bushes) {
        const view = new Sprite();
        placeFrame(view, bushes.frames[bush.kind], bush.x, bush.y, bush.scale);
        view.zIndex = depthOf(bush.y, DEPTH.prop);
        depth.addChild(view);
      }
      for (const blade of stump.grass) {
        const view = new Sprite(grass[blade.kind]);
        view.anchor.set(0.5, 1);
        if ((blade.x + blade.y) % 2 === 0) view.scale.x = -1;
        view.position.set(blade.x, blade.y);
        view.zIndex = depthOf(blade.y, DEPTH.flower);
        depth.addChild(view);
      }
      for (const piece of stump.foot) {
        const part = new Rectangle(piece.kind * PIECE_SIZE, 0, PIECE_SIZE, PIECE_SIZE);
        const stone = new Sprite(new Texture({ source: pieces.source, frame: part }));
        stone.anchor.set(0.5, 1);
        stone.position.set(piece.x, piece.y);
        stone.scale.set(stump.scale);
        this.ground.addChild(stone);
      }
    }
  }
}
