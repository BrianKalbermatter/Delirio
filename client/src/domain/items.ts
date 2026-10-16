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
};

export const POTION_IDS = POTION_NAMES.map((shape) => `potion_${shape}`);
