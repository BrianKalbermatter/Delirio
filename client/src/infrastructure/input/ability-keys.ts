// Keyboard bindings for the player's abilities (Diablo-like hotbar). Instant
// abilities fire once per key press; held ones stay on while the key is down.
import { ABILITY } from "../wasm/game-wasm";

// Key code -> instant ability.
export const INSTANT_KEYS: Record<string, number> = {
  KeyQ: ABILITY.ATAQUE_LIGERO,
  KeyW: ABILITY.ATAQUE_RAPIDO,
  KeyE: ABILITY.ATAQUE_LARGO,
  KeyR: ABILITY.ATAQUE_CRITICO,
  KeyA: ABILITY.APOYO,
  KeyS: ABILITY.PARRY,
  KeyD: ABILITY.ULTI,
  Space: ABILITY.RODAR,
};

// Key code -> held ability.
export const HELD_KEYS: Record<string, number> = {
  ShiftLeft: ABILITY.CORRER,
  ShiftRight: ABILITY.CORRER,
};

// Label shown in the panel for each ability (block is on the right button).
export const ABILITY_KEY_LABEL: Record<number, string> = {
  [ABILITY.ATAQUE_LIGERO]: "Q",
  [ABILITY.ATAQUE_RAPIDO]: "W",
  [ABILITY.ATAQUE_LARGO]: "E",
  [ABILITY.ATAQUE_CRITICO]: "R",
  [ABILITY.APOYO]: "A",
  [ABILITY.PARRY]: "S",
  [ABILITY.ULTI]: "D",
  [ABILITY.BLOQUEAR]: "R-click",
  [ABILITY.RODAR]: "Space",
  [ABILITY.CORRER]: "Shift",
};

export class AbilityKeys {
  constructor(
    target: Window,
    isActive: () => boolean,
    onUse: (ability: number) => void,
    onHold: (ability: number, held: boolean) => void,
  ) {
    target.addEventListener("keydown", (e) => {
      if (!isActive()) return;
      if (e.code in INSTANT_KEYS || e.code in HELD_KEYS) e.preventDefault(); // Space would scroll
      if (e.repeat) return;
      if (e.code in INSTANT_KEYS) onUse(INSTANT_KEYS[e.code]);
      if (e.code in HELD_KEYS) onHold(HELD_KEYS[e.code], true);
    });
    target.addEventListener("keyup", (e) => {
      if (e.code in HELD_KEYS) onHold(HELD_KEYS[e.code], false);
    });
  }
}
