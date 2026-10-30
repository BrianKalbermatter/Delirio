// The progress of each character, kept in this browser (localStorage): every
// character has its own, so picking another one starts it from where that one
// was left. Nothing leaves the browser; clearing the site data wipes it.

const KEY_PREFIX = "delirio.progress.";
const VERSION = 1;

export interface CharacterProgress {
  level: number;
  xp: number; // gathered in this level
  upgrades: number[]; // times each upgrade was bought (UPGRADE in game-wasm.ts)
}

interface Saved extends CharacterProgress {
  version: number;
  savedAt: number; // ms since epoch
}

const count = (n: unknown): number => (Number.isInteger(n) ? Math.max(0, n as number) : 0);

// What was saved for `characterId`, or null (new character, or storage off).
// C checks the upgrades against the level again when they are loaded.
export function loadProgress(characterId: string): CharacterProgress | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + characterId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.version !== VERSION || !Number.isInteger(saved.level)) return null;
    return {
      level: Math.max(1, saved.level!),
      xp: count(saved.xp),
      upgrades: Array.isArray(saved.upgrades) ? saved.upgrades.map(count) : [], // older saves had none
    };
  } catch {
    return null; // private window, blocked storage or a broken entry
  }
}

export function saveProgress(characterId: string, progress: CharacterProgress): void {
  const saved: Saved = { version: VERSION, savedAt: Date.now(), ...progress };
  try {
    localStorage.setItem(KEY_PREFIX + characterId, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the game goes on, it just is not kept.
  }
}
