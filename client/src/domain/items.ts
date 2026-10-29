// Items the player can pick up and carry in the inventory.

export interface ItemKind {
  id: string;
  name: string;
  sprite: string; // asset name in public/assets
  frame: number; // frame of the sprite lying on the floor (and the icon, unless `icon`)
  icon?: number; // frame shown in the inventory, when it is not `frame`
  // Picked up only with the E key while standing on it, instead of by just
  // walking over it.
  pickupWithKey?: boolean;
  // A weapon the player carries and swings (see art/armas.py): `grip` is the
  // pixel the hand holds in frame WEAPON_HELD_FRAME of its sprite, and the
  // sheets <sprite>_fx and <sprite>_fx_atras have its animations.
  weapon?: { grip: { x: number; y: number } };
  // Worn on a body part (see domain/equipment.ts).
  wear?: "head" | "body" | "legs";
  // Gives light while held: the radii (px) of the lit area at night.
  light?: { inner: number; outer: number };
}

// Frames of a weapon's sprite (art/armas.py item_sheet): lying on the floor,
// as carried, and big on a diagonal for the inventory.
export const WEAPON_HELD_FRAME = 1;
export const WEAPON_ICON_FRAME = 2;
// A thrown weapon (the spear) in THROW_DIRS directions (art/armas.py
// item_sheet): direction k goes k * 360 / THROW_DIRS degrees clockwise from
// the right. Stuck in the ground after a throw (the point where it goes in at
// the bottom centre), and flying level (its middle at the centre).
export const THROW_DIRS = 16;
export const stuckFrame = (k: number) => 3 + k;
export const flightFrame = (k: number) => 3 + THROW_DIRS + k;
// How fast a thrown spear flies, and carries a skewered enemy to the wall.
export const SPEAR_FLIGHT_SPEED = 900; // px/s

// The throw direction (0..THROW_DIRS-1) closest to (dx, dy).
export function throwDirIndex(dx: number, dy: number): number {
  const k = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * THROW_DIRS);
  return ((k % THROW_DIRS) + THROW_DIRS) % THROW_DIRS;
}

const POTION_NAMES = ["rombo", "frasco", "tubo_u", "retorta", "cono", "cubo"];

export const ITEMS: Record<string, ItemKind> = {
  ...Object.fromEntries(
    POTION_NAMES.map((shape, i) => [
      `potion_${shape}`,
      {
        id: `potion_${shape}`,
        name: `Potion (${shape})`,
        sprite: "pociones",
        frame: i,
      },
    ]),
  ),
  enemy_sword: {
    id: "enemy_sword",
    name: "Enemy sword",
    sprite: "Espada-Enemiga",
    frame: 0,
  },
  // The maze map: a book to draw the maze in (opened with M).
  map_book: { id: "map_book", name: "Map book", sprite: "libro", frame: 0 },
  // Fallen branches around the big tree (sprites/Plaza/Ramas.aseprite).
  branch: {
    id: "branch",
    name: "Branch",
    sprite: "ramas",
    frame: 0,
    pickupWithKey: true,
  },
  // Brian's axe (sprites/PersonajePrincipales/Hacha.aseprite).
  axe: {
    id: "axe",
    name: "Axe",
    sprite: "hacha",
    frame: 0,
    icon: WEAPON_ICON_FRAME,
    pickupWithKey: true,
    weapon: { grip: { x: 30, y: 40 } },
  },
  // Brian's torch (sprites/Objetos/Antorcha.aseprite): carried like the axe, it
  // lights up around the player day and night.
  torch: {
    id: "torch",
    name: "Torch",
    sprite: "antorcha",
    frame: 0,
    icon: WEAPON_ICON_FRAME,
    pickupWithKey: true,
    weapon: { grip: { x: 23, y: 40 } },
    light: { inner: 90, outer: 300 },
  },
  // Brian's spear (sprites/Armas/Lanza1_Arma.aseprite), carried upright like
  // the torch. The grip is in the trimmed drawing (art/armas.py).
  spear: {
    id: "spear",
    name: "Spear",
    sprite: "lanza",
    frame: 0,
    icon: WEAPON_ICON_FRAME,
    pickupWithKey: true,
    weapon: { grip: { x: 14, y: 39 } },
  },
};

export const POTION_IDS = POTION_NAMES.map((shape) => `potion_${shape}`);
