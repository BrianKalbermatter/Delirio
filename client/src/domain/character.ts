// The player as the client shows it. Position, direction and state come from
// the C core every frame; this only adds presentation: which animation to play
// and the smooth turn between directions.
import { type Direction, directionFromVector, stepToward, turnDistance } from "./facing";

export type Motion = "idle" | "walk" | "run";

// From the C state (enum estados in src/entidad.h) to an animation. States
// without their own animation yet fall back to idle.
const MOTION_BY_STATE: Record<string, Motion> = {
  QUIETO: "idle",
  CAMINANDO: "walk",
  ATACANDO: "idle",
  CORRIENDO: "run",
};

const TURN_STEP_MS = 60; // time shown on each intermediate direction
// Sharp turns (135° or more, e.g. left -> right) become a pivot: the character
// stops its stride and rotates in place through the intermediate directions,
// slower, so the turn reads clearly. Small steering keeps the walk cycle.
const PIVOT_MIN_STEPS = 3;
const PIVOT_STEP_MS = 85;
// Standing still, the character looks at the cursor unless it is this close to
// the body, where the angle jumps around with every pixel.
const LOOK_DEAD_ZONE = 16; // px

export interface CoreState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: string; // name of the C state, e.g. "CAMINANDO"
}

export class Character {
  x = 0;
  y = 0;
  motion: Motion = "idle";
  facing: Direction = "front";
  private targetFacing: Direction = "front";
  private turnClockMs = 0;
  private pivoting = false;

  get isTurning(): boolean {
    return this.facing !== this.targetFacing;
  }

  // Animation tag for the current state, e.g. "walk_down_left". During a pivot
  // the idle pose is shown so the legs do not keep striding mid-rotation.
  get animationTag(): string {
    const motion = this.pivoting ? "idle" : this.motion;
    return `${motion}_${this.facing}`;
  }

  // `lookAt` is a world point (the cursor) to face while standing still, measured
  // from `lookFromY` (the body center, not the feet). Moving, it faces where it walks.
  sync(core: CoreState, dtMs: number, lookAt?: { x: number; y: number }, lookFromY = core.y): void {
    this.x = core.x;
    this.y = core.y;
    this.motion = MOTION_BY_STATE[core.state] ?? "idle";
    let target: Direction | null = null;
    if (this.motion === "idle" && lookAt) {
      const dx = lookAt.x - core.x;
      const dy = lookAt.y - lookFromY;
      if (Math.hypot(dx, dy) > LOOK_DEAD_ZONE) target = directionFromVector(dx, dy);
    } else if (core.dirX !== 0 || core.dirY !== 0) {
      target = directionFromVector(core.dirX, core.dirY);
    }
    // No target keeps the last facing.
    if (target) {
      if (target !== this.targetFacing) {
        this.targetFacing = target;
        this.pivoting ||= turnDistance(this.facing, target) >= PIVOT_MIN_STEPS;
      }
    }
    this.advanceTurn(dtMs);
  }

  private advanceTurn(dtMs: number): void {
    if (!this.isTurning) {
      this.turnClockMs = 0;
      this.pivoting = false;
      return;
    }
    const stepMs = this.pivoting ? PIVOT_STEP_MS : TURN_STEP_MS;
    this.turnClockMs += dtMs;
    while (this.isTurning && this.turnClockMs >= stepMs) {
      this.turnClockMs -= stepMs;
      this.facing = stepToward(this.facing, this.targetFacing);
    }
    if (!this.isTurning) this.pivoting = false;
  }
}
