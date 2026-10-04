// The player as the client shows it. Position, direction and state come from
// the C core every frame; this only adds presentation: which animation to play
// and the smooth turn between directions.
import { type Direction, directionFromVector, stepToward } from "./facing";

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

  get isTurning(): boolean {
    return this.facing !== this.targetFacing;
  }

  // Animation tag for the current state, e.g. "walk_down_left".
  get animationTag(): string {
    return `${this.motion}_${this.facing}`;
  }

  sync(core: CoreState, dtMs: number): void {
    this.x = core.x;
    this.y = core.y;
    this.motion = MOTION_BY_STATE[core.state] ?? "idle";
    // Keep the last facing when there is no direction (standing still).
    if (core.dirX !== 0 || core.dirY !== 0) {
      this.targetFacing = directionFromVector(core.dirX, core.dirY);
    }
    this.advanceTurn(dtMs);
  }

  private advanceTurn(dtMs: number): void {
    if (!this.isTurning) {
      this.turnClockMs = 0;
      return;
    }
    this.turnClockMs += dtMs;
    while (this.isTurning && this.turnClockMs >= TURN_STEP_MS) {
      this.turnClockMs -= TURN_STEP_MS;
      this.facing = stepToward(this.facing, this.targetFacing);
    }
  }
}
