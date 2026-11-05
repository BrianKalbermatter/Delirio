// The wild birds: scenery, so they live here and not in C. They come in from
// past the edge of the view and go where they like, over walls and trees; now
// and then one lands to peck at the floor. Walk up to one and it flies off.
// Whatever gets far from the player is gone, and new ones keep coming by day.
export const BIRD_KINDS = 8; // the drawings of art/aves.py

export interface Bird {
  x: number; // on the floor under it, world px
  y: number;
  height: number; // px above the floor
  heading: number; // radians
  turn: number; // radians/s it is curving
  speed: number; // px/s
  state: "flying" | "landing" | "perched" | "leaving";
  ms: number; // until it thinks of landing, or of taking off
  kind: number;
  facesLeft: boolean;
}

export interface View {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MAX_BIRDS = 7;
const SPAWN_MS = 2200; // one more this often, while there are few
const SPAWN_PAST = 50; // px past the view where they come in
const GONE_PAST = 320; // px past the view where they are gone
const PERCHED_SHARE = 0.5; // the ones already on the floor when they turn up
const FLIGHT_SPEED = 85;
const FLEE_SPEED = 175;
const LANDING_SPEED = 30;
const CRUISE = 74; // px above the floor
const CLIMB = 70; // px/s
const DESCENT = 46;
const SCARE = 125; // the player this close: it flies off
const FLY_MS = [4000, 12000]; // before it thinks of landing
const PERCH_MS = [4000, 15000]; // on the floor
const TURN_MS = 0.7; // chance per second of changing its curve
const MAX_TURN = 0.9; // radians/s

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

export class Flock {
  birds: Bird[] = [];
  private spawnMs = 0;

  // `canLand`: floor a bird can stand on, at a world point.
  constructor(private readonly canLand: (x: number, y: number) => boolean) {}

  update(dtMs: number, player: { x: number; y: number }, view: View, spawning: boolean): void {
    const dt = dtMs / 1000;
    this.spawnMs -= dtMs;
    if (spawning && this.spawnMs <= 0 && this.birds.length < MAX_BIRDS) {
      this.spawnMs = SPAWN_MS;
      this.spawn(player, view);
    }
    for (const bird of this.birds) this.step(bird, dt, dtMs, player);
    this.birds = this.birds.filter((b) => !gone(b, view));
  }

  private spawn(player: { x: number; y: number }, view: View): void {
    // Somewhere on a ring around the view
    const angle = Math.random() * Math.PI * 2;
    const reach = Math.hypot(view.width, view.height) / 2 + SPAWN_PAST;
    const x = view.left + view.width / 2 + Math.cos(angle) * reach;
    const y = view.top + view.height / 2 + Math.sin(angle) * reach;
    const kind = Math.floor(Math.random() * BIRD_KINDS);
    const perched = Math.random() < PERCHED_SHARE && this.canLand(x, y);
    // Crossing the view, more or less
    const heading = Math.atan2(player.y - y, player.x - x) + (Math.random() - 0.5) * 1.4;
    this.birds.push({
      x,
      y,
      height: perched ? 0 : CRUISE,
      heading,
      turn: 0,
      speed: perched ? 0 : FLIGHT_SPEED,
      state: perched ? "perched" : "flying",
      ms: between(perched ? PERCH_MS : FLY_MS),
      kind,
      facesLeft: Math.cos(heading) < 0,
    });
  }

  private step(bird: Bird, dt: number, dtMs: number, player: { x: number; y: number }): void {
    const near = Math.hypot(bird.x - player.x, bird.y - player.y) < SCARE;
    if (near && (bird.state === "perched" || bird.state === "landing")) flee(bird, player);
    bird.ms -= dtMs;
    switch (bird.state) {
      case "perched":
        if (bird.ms <= 0) takeOff(bird);
        return;
      case "landing":
        bird.speed = Math.max(LANDING_SPEED, bird.speed - 60 * dt);
        bird.height = Math.max(0, bird.height - DESCENT * dt);
        if (bird.height === 0) {
          bird.state = "perched";
          bird.speed = 0;
          bird.ms = between(PERCH_MS);
        }
        break;
      case "flying":
        if (Math.random() < TURN_MS * dt) bird.turn = (Math.random() * 2 - 1) * MAX_TURN;
        bird.heading += bird.turn * dt;
        bird.height = Math.min(CRUISE, bird.height + CLIMB * dt);
        if (bird.ms <= 0) {
          bird.ms = 1500; // if it cannot land here, it tries again further on
          if (!near && this.canLand(bird.x, bird.y)) bird.state = "landing";
        }
        break;
      case "leaving":
        bird.height = Math.min(CRUISE * 1.4, bird.height + CLIMB * 1.6 * dt);
        break;
    }
    bird.x += Math.cos(bird.heading) * bird.speed * dt;
    bird.y += Math.sin(bird.heading) * bird.speed * dt;
    const sideways = Math.cos(bird.heading);
    if (Math.abs(sideways) > 0.2) bird.facesLeft = sideways < 0;
  }
}

function takeOff(bird: Bird): void {
  bird.state = "flying";
  bird.speed = FLIGHT_SPEED;
  bird.heading = Math.random() * Math.PI * 2;
  bird.ms = between(FLY_MS);
}

// Off for good, away from the player: it does not land again.
function flee(bird: Bird, player: { x: number; y: number }): void {
  bird.state = "leaving";
  bird.speed = FLEE_SPEED;
  bird.heading = Math.atan2(bird.y - player.y, bird.x - player.x) + (Math.random() - 0.5) * 0.8;
}

function gone(bird: Bird, view: View): boolean {
  return (
    bird.x < view.left - GONE_PAST ||
    bird.x > view.left + view.width + GONE_PAST ||
    bird.y < view.top - GONE_PAST ||
    bird.y > view.top + view.height + GONE_PAST
  );
}
