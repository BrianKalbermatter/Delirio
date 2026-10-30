// Where each character was left, kept in this browser (localStorage) next to
// its progress (progress-store.ts): the maze (its seed and how far the clock
// went, so it grows the same), where the player stood, what it carried and
// what lay on the floor. Reloading the page picks the game up from there.

const KEY_PREFIX = "delirio.world.";
const VERSION = 1;

export interface SavedItem {
  id: string; // ITEMS key
  count: number;
}

export interface FloorItem {
  id: string;
  frame?: number; // as it lies (a branch's variant, a stuck spear's direction); none: animated
  x: number;
  y: number;
}

export interface SavedWorld {
  seed: number;
  clockMs: number;
  x: number;
  y: number;
  inventory: (SavedItem | null)[];
  selected: number;
  equipment: Record<string, string | null>; // EquipSlot -> item id
  crafting: (string | null)[];
  floor: FloorItem[];
}

interface Saved extends SavedWorld {
  version: number;
  savedAt: number; // ms since epoch
}

export function loadWorld(characterId: string): SavedWorld | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + characterId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.version !== VERSION || !Number.isInteger(saved.seed) || !Number.isFinite(saved.clockMs)) return null;
    if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return null;
    return {
      seed: saved.seed!,
      clockMs: saved.clockMs!,
      x: saved.x!,
      y: saved.y!,
      inventory: Array.isArray(saved.inventory) ? saved.inventory : [],
      selected: Number.isInteger(saved.selected) ? saved.selected! : 0,
      equipment: saved.equipment ?? {},
      crafting: Array.isArray(saved.crafting) ? saved.crafting : [],
      floor: Array.isArray(saved.floor) ? saved.floor : [],
    };
  } catch {
    return null; // private window, blocked storage or a broken entry
  }
}

export function saveWorld(characterId: string, world: SavedWorld): void {
  const saved: Saved = { version: VERSION, savedAt: Date.now(), ...world };
  try {
    localStorage.setItem(KEY_PREFIX + characterId, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the game goes on, it just is not kept.
  }
}

// Forgets where the character was: the next load starts a new maze.
export function clearWorld(characterId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + characterId);
  } catch {
    // Nothing to clear.
  }
}
