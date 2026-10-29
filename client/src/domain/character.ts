// The player as the client shows it. Position, direction and state come from
// the C core every frame; this only adds presentation: which animation to play
// and the smooth turn between directions.
import { type Direction, directionFromVector, stepToward, turnDistance, vectorOf } from "./facing";

export type Motion = "idle" | "walk" | "run" | "death";
// One-shot animations started by the client (art/personaje_3_build.py), all of
// them in the 8 directions: swinging a weapon on the ground or in the air,
// picking a weapon up from the floor, punching the ground and throwing the
// spear.
export type Action = "attack" | "jump_attack" | "pickup" | "slam" | "throw";

interface ActionState {
  name: Action;
  view: Direction;
  ms: number; // time since it started
  durationMs: number; // time it is shown for
  artMs: number; // length of its frames as timed in the sheet
}

// From the C state (enum estados in src/entidad.h) to an animation. States
// without their own animation yet fall back to idle.
const MOTION_BY_STATE: Record<string, Motion> = {
  QUIETO: "idle",
  CAMINANDO: "walk",
  ATACANDO: "idle",
  CORRIENDO: "run",
  MUERTO: "death",
};

const TURN_STEP_MS = 60; // time shown on each intermediate direction
// Sharp turns (135° or more, e.g. left -> right) become a pivot: the character
// stops its stride and rotates in place through the intermediate directions,
// slower, so the turn reads clearly. Small steering keeps the walk cycle.
const PIVOT_MIN_STEPS = 3;
const PIVOT_STEP_MS = 85;
// The character looks at the cursor, moving or not, so it can walk one way and
// aim another. Ignored this close to the body, where the angle jumps around with
// every pixel.
const LOOK_DEAD_ZONE = 16; // px

// The jump lasts HAB_SALTAR in src/mecanicas/jugador.c. Its frames (JUMP_MS in
// art/personaje_3_build.py) are stretched over that time: it crouches, is in
// the air from frame 2 to 7, and lands.
export const JUMP_MS = 600;
const JUMP_ART_MS = 670;
const JUMP_AIR_ART_MS = [140, 520]; // art time when the feet leave and touch the floor
const JUMP_HEIGHT = 26; // px at the top of the arc

// Walking away from where it looks (more than ~100° off) plays the walk cycle
// backwards, so the feet push the right way instead of moonwalking. Sideways
// steps keep it forwards.
const BACKWARDS_DOT = -0.2;

export interface CoreState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: string; // name of the C state, e.g. "CAMINANDO"
  jumping: boolean; // HAB_SALTAR active
}

export class Character {
  x = 0;
  y = 0;
  motion: Motion = "idle";
  facing: Direction = "front";
  private targetFacing: Direction = "front";
  private turnClockMs = 0;
  private pivoting = false;
  // Jump in progress: time since it started.
  private jumpMs: number | null = null;
  private action: ActionState | null = null;
  // Direction the C core is moving along this frame (unit-ish, 0 when still).
  private moveX = 0;
  private moveY = 0;

  get isTurning(): boolean {
    return this.facing !== this.targetFacing;
  }

  // Animation tag for the current state, e.g. "walk_down_left". During a pivot
  // the idle pose is shown so the legs do not keep striding mid-rotation.
  get animationTag(): string {
    if (this.isDead) return "death"; // one animation, whatever killed it
    if (this.action) return `${this.action.name}_${this.action.view}`;
    if (this.jumpMs !== null) return `jump_${this.facing}`;
    const motion = this.pivoting ? "idle" : this.motion;
    return `${motion}_${this.facing}`;
  }

  get isDead(): boolean {
    return this.motion === "death";
  }

  get isJumping(): boolean {
    return this.jumpMs !== null;
  }

  // Where the jump animation is, in the sheet's time, so it picks up at the
  // right frame after an attack in the air. Null when not jumping.
  get jumpArtMs(): number | null {
    if (this.jumpMs === null) return null;
    return Math.min(JUMP_ART_MS - 1, (this.jumpMs / JUMP_MS) * JUMP_ART_MS);
  }

  // Height of the body over the floor, px.
  get lift(): number {
    const art = this.jumpArtMs;
    if (art === null) return 0;
    const [up, down] = JUMP_AIR_ART_MS;
    if (art <= up || art >= down) return 0;
    return Math.round(JUMP_HEIGHT * Math.sin((Math.PI * (art - up)) / (down - up)));
  }

  // Playback rate for the animator: an action is squeezed into its time.
  get animationSpeed(): number {
    if (this.action) return this.action.artMs / this.action.durationMs;
    return 1;
  }

  // True while walking or running away from where the character looks.
  get animationReversed(): boolean {
    if (this.action || this.jumpMs !== null || this.pivoting || this.motion === "idle") return false;
    const [fx, fy] = vectorOf(this.facing);
    const length = Math.hypot(this.moveX, this.moveY);
    if (length === 0) return false;
    return (fx * this.moveX + fy * this.moveY) / length < BACKWARDS_DOT;
  }

  get isActing(): boolean {
    return this.action !== null;
  }

  // Plays `name` once, squeezed into `durationMs`, towards where the character
  // looks, or turned to `towards` first when given.
  startAction(name: Action, durationMs: number, artMs: number, towards?: Direction): void {
    if (towards) {
      this.facing = this.targetFacing = towards;
      this.pivoting = false;
    }
    this.action = { name, view: this.facing, ms: 0, durationMs, artMs };
  }

  // Turns the action under way to `towards` (aiming while it is held).
  turnAction(towards: Direction): void {
    if (!this.action) return;
    this.action.view = this.facing = this.targetFacing = towards;
    this.pivoting = false;
  }

  // Ends the action under way now (one held for as long as a button is).
  endAction(): void {
    this.action = null;
  }

  // `lookAt` is a world point (the cursor) to face, measured from `lookFromY`
  // (the body center, not the feet). Without it, it faces where it walks.
  sync(core: CoreState, dtMs: number, lookAt?: { x: number; y: number }, lookFromY = core.y): void {
    this.x = core.x;
    this.y = core.y;
    this.motion = MOTION_BY_STATE[core.state] ?? "idle";
    this.moveX = core.dirX;
    this.moveY = core.dirY;
    if (this.isDead) {
      // Comes back facing the camera, with no turn or jump half done.
      this.facing = this.targetFacing = "front";
      this.pivoting = false;
      this.jumpMs = null;
      this.action = null;
      return;
    }
    if (this.action) {
      this.action.ms += dtMs;
      if (this.action.ms >= this.action.durationMs) this.action = null;
    }
    if (this.syncJump(core, dtMs)) return;
    let target: Direction | null = null;
    if (lookAt) {
      const dx = lookAt.x - core.x;
      const dy = lookAt.y - lookFromY;
      if (Math.hypot(dx, dy) > LOOK_DEAD_ZONE) target = directionFromVector(dx, dy);
    } else if (core.dirX !== 0 || core.dirY !== 0) {
      target = directionFromVector(core.dirX, core.dirY);
    }
    // No target keeps the last facing. An action keeps the direction it
    // started in until it ends.
    if (target && !this.action) {
      if (target !== this.targetFacing) {
        this.targetFacing = target;
        this.pivoting ||= turnDistance(this.facing, target) >= PIVOT_MIN_STEPS;
      }
    }
    this.advanceTurn(dtMs);
  }

  // Returns true while jumping: the jump keeps the direction it took off in.
  private syncJump(core: CoreState, dtMs: number): boolean {
    if (!core.jumping) {
      this.jumpMs = null;
      return false;
    }
    if (this.jumpMs === null) {
      // The C core jumps along its direction: face it at once. Jumping cuts a
      // swing on the ground or a pickup short.
      this.jumpMs = 0;
      if (this.action && this.action.name !== "jump_attack") this.action = null;
      if (core.dirX !== 0 || core.dirY !== 0) {
        this.facing = this.targetFacing = directionFromVector(core.dirX, core.dirY);
      }
      this.pivoting = false;
    } else {
      this.jumpMs += dtMs;
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
    }
    if (!this.isTurning) this.pivoting = false;
  }
}
