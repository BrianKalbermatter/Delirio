// The player as the client shows it. Position, direction and state come from
// the C core every frame; this only adds presentation: which animation to play
// and the smooth turn between directions.
import { type Direction, directionFromVector, stepToward, turnDistance } from "./facing";

export type Motion = "idle" | "walk" | "run";
type Side = "left" | "right";

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

// Roll, in three phases that together last HAB_RODAR in src/mecanicas/jugador.c.
// Each phase plays its frames (timed in Aseprite) at the speed that fits its
// share: a quick tuck, a long time curled up as a ball, then it opens.
const ROLL_PHASES = [
  { tag: "roll_in", artMs: 490, ms: 260 }, // crouch, jump, curl up (first 7 frames of roll_start)
  { tag: "roll", artMs: 480, ms: 480 }, // the ball rolling, one pass
  { tag: "roll_end", artMs: 560, ms: 260 }, // uncurl and land
] as const;

export interface CoreState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: string; // name of the C state, e.g. "CAMINANDO"
  rolling: boolean; // HAB_RODAR active
}

export class Character {
  x = 0;
  y = 0;
  motion: Motion = "idle";
  facing: Direction = "front";
  private targetFacing: Direction = "front";
  private turnClockMs = 0;
  private pivoting = false;
  // Roll in progress: time since it started and the side drawn.
  // The sheet only has left and right rolls; rolling straight up or down keeps
  // the side the character was last turned to.
  private rollMs: number | null = null;
  private side: Side = "right";

  get isTurning(): boolean {
    return this.facing !== this.targetFacing;
  }

  // Animation tag for the current state, e.g. "walk_down_left". During a pivot
  // the idle pose is shown so the legs do not keep striding mid-rotation.
  get animationTag(): string {
    if (this.rollMs !== null) return `${this.rollPhase().tag}_${this.side}`;
    const motion = this.pivoting ? "idle" : this.motion;
    return `${motion}_${this.facing}`;
  }

  // Playback rate for the animator: each roll phase is squeezed into its share.
  get animationSpeed(): number {
    if (this.rollMs === null) return 1;
    const phase = this.rollPhase();
    return phase.artMs / phase.ms;
  }

  private rollPhase(): (typeof ROLL_PHASES)[number] {
    let start = 0;
    for (const phase of ROLL_PHASES) {
      start += phase.ms;
      if (this.rollMs! < start) return phase;
    }
    return ROLL_PHASES[ROLL_PHASES.length - 1];
  }

  // `lookAt` is a world point (the cursor) to face while standing still, measured
  // from `lookFromY` (the body center, not the feet). Moving, it faces where it walks.
  sync(core: CoreState, dtMs: number, lookAt?: { x: number; y: number }, lookFromY = core.y): void {
    this.x = core.x;
    this.y = core.y;
    this.motion = MOTION_BY_STATE[core.state] ?? "idle";
    if (this.syncRoll(core, dtMs)) return;
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

  // Returns true while rolling: the roll sets the facing itself, no turn.
  private syncRoll(core: CoreState, dtMs: number): boolean {
    if (!core.rolling) {
      this.rollMs = null;
      return false;
    }
    if (this.rollMs === null) {
      // The C core rolls along its direction: face it at once.
      this.rollMs = 0;
      if (core.dirX !== 0 || core.dirY !== 0) {
        this.facing = this.targetFacing = directionFromVector(core.dirX, core.dirY);
      }
      this.pivoting = false;
      if (core.dirX < 0) this.side = "left";
      else if (core.dirX > 0) this.side = "right";
    } else {
      this.rollMs += dtMs;
    }
    return true;
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
      this.side = sideOf(this.facing) ?? this.side;
    }
    if (!this.isTurning) this.pivoting = false;
  }
}

function sideOf(direction: Direction): Side | null {
  if (direction.endsWith("left")) return "left";
  if (direction.endsWith("right")) return "right";
  return null;
}
