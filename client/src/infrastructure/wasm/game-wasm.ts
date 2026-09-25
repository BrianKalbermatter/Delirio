// Adapter over the C game logic compiled to WebAssembly (src/web.c).
import createModule from "./generated/game.js";

export interface GameWasm {
  attack(): boolean;
  medusaLife(): number;
  medusaLifeMax(): number;
  reset(): void;
}

export async function loadGameWasm(): Promise<GameWasm> {
  const mod = await createModule();

  const attack = mod.cwrap<() => number>("web_atacar", "number", []);
  const medusaLife = mod.cwrap<() => number>("web_medusa_vida", "number", []);
  const medusaLifeMax = mod.cwrap<() => number>("web_medusa_vida_max", "number", []);
  const reset = mod.cwrap<() => void>("web_reset", null, []);

  return {
    attack: () => attack() === 1,
    medusaLife,
    medusaLifeMax,
    reset,
  };
}
