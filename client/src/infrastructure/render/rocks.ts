// The big rocks of domain/rocks.ts in the world: drawn standing with the
// props, solid (an obstacle in C), shaking and throwing chips when the
// pickaxe hits them, and broken after HITS_TO_BREAK hits. Breaking one leaves
// 2 or 3 pebbles; the owner puts them on the floor.
//
// They appear cell by cell as the maze is carved (sync), so the rings a
// growth adds get theirs too.
import { Container, Graphics, Sprite } from "pixi.js";
import { type BigRock, type CellRocks, type Pebble, PEBBLE_VARIANTS, planRocks, rockBase } from "../../domain/rocks";
import type { TileMap } from "../../domain/tile-map";
import type { MazeInfo } from "../wasm/game-wasm";
import { DEPTH, depthOf } from "./depth";
import { placeFrame, type SpriteSheet } from "./sprite-sheet";

const HITS_TO_BREAK = 2;
const SHAKE_MS = 260; // the shake after a hit
const SHAKE_STEP_MS = 40; // it moves every this long
const SHAKE_PX = 1;
const CHIP_MS = 420;
const CHIP_GRAVITY = 520; // px/s²
const CHIP_COLORS = [0x3e6062, 0x637d74, 0x32403a, 0x000000]; // Roca1's colours
const DROPS_MIN = 2;
const DROPS_MAX = 3;

interface RockView {
  rock: BigRock;
  sprite: Sprite;
  obstacle: number; // its number in C (-1: none, C was full)
  hits: number;
  shakeMs: number;
}

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  floorY: number;
  ms: number;
  color: number;
}

export class RockField {
  // Pieces flying off on a hit, over the rocks.
  readonly chips = new Graphics();
  private readonly plan: CellRocks[];
  private readonly done = new Set<number>(); // cells already placed
  private readonly views = new Map<number, RockView>(); // by rock id
  private readonly broken: Set<number>;
  private chipList: Chip[] = [];

  constructor(
    seed: number,
    private readonly depth: Container,
    private readonly sheet: SpriteSheet,
    private readonly map: TileMap,
    private readonly maze: MazeInfo,
    broken: number[],
  ) {
    this.plan = planRocks(seed);
    this.broken = new Set(broken);
    this.chips.zIndex = Number.MAX_SAFE_INTEGER;
    depth.addChild(this.chips);
  }

  // Where the standing rocks are (feet), for what must not grow on them.
  positions(): { x: number; y: number }[] {
    return [...this.views.values()].map((v) => ({ x: v.rock.x, y: v.rock.y }));
  }

  // Ids of the rocks broken so far (for the save).
  get brokenIds(): number[] {
    return [...this.broken];
  }

  // Places the rocks of every cell carved since the last call. Returns the
  // pebbles and fallen branches of those cells, to put on the floor (a loaded
  // game passes withLoose false: they are among its saved floor items).
  sync(withLoose: boolean): { pebbles: Pebble[]; branches: Pebble[] } {
    const pebbles: Pebble[] = [];
    const branches: Pebble[] = [];
    for (const cell of this.plan) {
      if (this.done.has(cell.cell) || this.map.isWall(cell.probe.col, cell.probe.row)) continue;
      this.done.add(cell.cell);
      for (const rock of cell.rocks) {
        if (this.broken.has(rock.id) || !this.fits(rock.x, rock.y)) continue;
        this.add(rock);
      }
      if (!withLoose) continue;
      pebbles.push(...cell.pebbles.filter((p) => this.fits(p.x, p.y)));
      branches.push(...cell.branches.filter((p) => this.fits(p.x, p.y)));
    }
    return { pebbles, branches };
  }

  // The rock whose base is nearest to (x, y), if within `reach` px.
  nearest(x: number, y: number, reach: number): BigRock | null {
    let best: RockView | null = null;
    let bestD = reach;
    for (const view of this.views.values()) {
      const half = view.sprite.width / 2;
      // Distance to the base, a short segment along the bottom of the rock
      const dx = Math.max(0, Math.abs(x - view.rock.x) - half * 0.7);
      const dy = y - (view.rock.y - 6);
      const d = Math.hypot(dx, dy);
      if (d <= bestD) {
        best = view;
        bestD = d;
      }
    }
    return best?.rock ?? null;
  }

  // A pickaxe blow: it shakes and throws chips; at HITS_TO_BREAK it breaks
  // and the pebbles it leaves are returned (null while it holds).
  hit(rock: BigRock): Pebble[] | null {
    const view = this.views.get(rock.id);
    if (!view) return null;
    view.hits++;
    view.shakeMs = SHAKE_MS;
    const broken = view.hits >= HITS_TO_BREAK;
    this.throwChips(rock, broken ? 14 : 6);
    if (!broken) return null;
    this.views.delete(rock.id);
    this.broken.add(rock.id);
    view.sprite.destroy();
    if (view.obstacle >= 0) this.maze.removeObstacle(view.obstacle);
    const count = DROPS_MIN + Math.floor(Math.random() * (DROPS_MAX - DROPS_MIN + 1));
    return Array.from({ length: count }, (_, k) => {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.8;
      const r = 12 + Math.random() * 12;
      return {
        x: Math.round(rock.x + Math.cos(a) * r),
        y: Math.round(rock.y - 4 + Math.sin(a) * r * 0.6),
        variant: Math.floor(Math.random() * PEBBLE_VARIANTS),
      };
    });
  }

  // `view`: the visible part of the world (rocks off it are hidden).
  update(dtMs: number, view: { left: number; top: number; width: number; height: number }): void {
    const margin = 64;
    for (const rock of this.views.values()) {
      const { x, y } = rock.rock;
      rock.sprite.visible =
        x > view.left - margin && x < view.left + view.width + margin && y > view.top - margin && y < view.top + view.height + margin;
    }
    for (const view of this.views.values()) {
      if (!view.sprite.visible) continue;
      let dx = 0;
      if (view.shakeMs > 0) {
        view.shakeMs -= dtMs;
        // Left and right, a pixel each way, calming down
        const step = Math.floor(view.shakeMs / SHAKE_STEP_MS);
        dx = view.shakeMs > 0 ? (step % 2 === 0 ? SHAKE_PX : -SHAKE_PX) : 0;
      }
      this.place(view, dx);
    }
    this.updateChips(dtMs);
  }

  private add(rock: BigRock): void {
    const frame = this.sheet.frames[rock.variant % this.sheet.frames.length];
    const sprite = new Sprite();
    placeFrame(sprite, frame, rock.x, rock.y);
    sprite.zIndex = depthOf(rock.y, DEPTH.prop);
    this.depth.addChild(sprite);
    const base = rockBase(rock, frame.w);
    const obstacle = this.maze.addObstacle(base);
    this.views.set(rock.id, { rock, sprite, obstacle, hits: 0, shakeMs: 0 });
  }

  private place(view: RockView, dx: number): void {
    const frame = this.sheet.frames[view.rock.variant % this.sheet.frames.length];
    placeFrame(view.sprite, frame, view.rock.x + dx, view.rock.y);
  }

  // Floor around (x, y): not a wall, not lava.
  private fits(x: number, y: number): boolean {
    const t = this.map.tileSize;
    for (const [px, py] of [
      [x - 12, y - 12],
      [x + 12, y - 12],
      [x - 12, y],
      [x + 12, y],
    ]) {
      const col = Math.floor(px / t);
      const row = Math.floor(py / t);
      if (this.map.isWall(col, row) || this.map.isLava(col, row) || this.map.isDoor(col, row)) return false;
    }
    // Not in a boss's room (its floor is all of its zone)
    return this.map.zoneWeight(Math.floor(x / t), Math.floor(y / t)) < 0.99;
  }

  private throwChips(rock: BigRock, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const speed = 60 + Math.random() * 90;
      this.chipList.push({
        x: rock.x + (Math.random() - 0.5) * 16,
        y: rock.y - 10 - Math.random() * 8,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        floorY: rock.y + Math.random() * 6,
        ms: CHIP_MS,
        color: CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)],
      });
    }
  }

  private updateChips(dtMs: number): void {
    const dt = dtMs / 1000;
    this.chips.clear();
    this.chipList = this.chipList.filter((c) => {
      c.ms -= dtMs;
      if (c.ms <= 0) return false;
      c.vy += CHIP_GRAVITY * dt;
      c.x += c.vx * dt;
      c.y = Math.min(c.floorY, c.y + c.vy * dt);
      this.chips.rect(Math.round(c.x), Math.round(c.y), 2, 2).fill(c.color);
      return true;
    });
  }
}
