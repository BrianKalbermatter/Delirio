// Eight-way facing and the turn transition between two facings.
// Directions are named after the sprite sheet tags (idle_front, walk_up_left, ...).

// Clockwise ring as seen on screen, starting at "right". "front" faces the camera.
export const DIRECTIONS = [
  "right",
  "down_right",
  "front",
  "down_left",
  "left",
  "up_left",
  "back",
  "up_right",
] as const;

export type Direction = (typeof DIRECTIONS)[number];

const RING = DIRECTIONS.length;
const FRONT = DIRECTIONS.indexOf("front");

// Maps a movement vector (screen coordinates, +y is down) to the closest direction.
export function directionFromVector(x: number, y: number): Direction {
  const angle = Math.atan2(y, x);
  const index = Math.round(angle / (Math.PI / 4));
  return DIRECTIONS[(index + RING) % RING];
}

// Next direction one step closer to `target`, following the shortest way around
// the ring. A half turn (e.g. right -> left) passes through "front", so the
// character turns towards the camera instead of showing its back.
export function stepToward(current: Direction, target: Direction): Direction {
  const from = DIRECTIONS.indexOf(current);
  const to = DIRECTIONS.indexOf(target);
  const clockwise = (to - from + RING) % RING;
  if (clockwise === 0) return current;

  let step: 1 | -1;
  if (clockwise < RING / 2) step = 1;
  else if (clockwise > RING / 2) step = -1;
  else step = (FRONT - from + RING) % RING <= RING / 2 ? 1 : -1;

  return DIRECTIONS[(from + step + RING) % RING];
}

// Unit vector pointing where `direction` faces (screen coordinates, +y is down).
export function vectorOf(direction: Direction): [number, number] {
  const angle = DIRECTIONS.indexOf(direction) * (Math.PI / 4);
  return [Math.cos(angle), Math.sin(angle)];
}
