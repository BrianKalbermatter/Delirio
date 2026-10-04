// Items the player can pick up and carry in the inventory.

export interface ItemKind {
  id: string;
  name: string;
  sprite: string; // asset name in public/assets
  frame: number; // frame of the sprite used as icon
}

const POTION_NAMES = ["rombo", "frasco", "tubo_u", "retorta", "cono", "cubo"];

export const ITEMS: Record<string, ItemKind> = {
  ...Object.fromEntries(
    POTION_NAMES.map((shape, i) => [
      `potion_${shape}`,
      { id: `potion_${shape}`, name: `Potion (${shape})`, sprite: "pociones", frame: i },
    ]),
  ),
  enemy_sword: { id: "enemy_sword", name: "Enemy sword", sprite: "Espada-Enemiga", frame: 0 },
  // The maze map: a book to draw the maze in (opened with M).
  map_book: { id: "map_book", name: "Map book", sprite: "libro", frame: 0 },
};

export const POTION_IDS = POTION_NAMES.map((shape) => `potion_${shape}`);
