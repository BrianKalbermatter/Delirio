// Adapter over the C game core (src/main.c, which calls the mechanics in
// src/mecanicas/), compiled to WebAssembly through the bridge in src/web.c.
// The C side owns the game state; the client sends the mouse target every
// frame and reads the state back to draw it.
import createModule from "./generated/game.js";

// Same order as `enum estados` in src/entidad.h.
export const STATE = ["QUIETO", "CAMINANDO", "ATACANDO", "CORRIENDO", "MUERTO"] as const;

// Same order as `enum fase` in src/mecanicas/mecanica.h.
export const PHASE = ["DIA", "TARDE", "NOCHE"] as const;

// Same order as `enum habilidad_id` in src/mecanicas/jugador.h.
export const ABILITY = {
  ATAQUE_LIGERO: 0,
  ATAQUE_RAPIDO: 1,
  ATAQUE_LARGO: 2,
  ATAQUE_CRITICO: 3,
  APOYO: 4,
  PARRY: 5,
  ULTI: 6,
  BLOQUEAR: 7,
  RODAR: 8,
  CORRER: 9,
} as const;

export interface AbilityState {
  name: string;
  active: boolean;
  cooldownMs: number; // time left until it can be used again
}

export interface ClockState {
  day: number;
  phase: (typeof PHASE)[number];
  phaseLeftMs: number; // time until the phase ends
  expansions: number; // how many times the maze grew
  nextExpansionMs: number; // time until the maze grows again, -1 if it will not
  daylight: number; // 0 = dark night, 1 = full day
  gatesOpen: boolean;
  gatesChangeMs: number; // time until the gates close (if open) or open (if closed)
}

export interface PlayerStats {
  deaths: number;
  delirium: number; // +1 per death
}

export interface PlayerState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: number; // index into STATE
}

// The maze generated in C (src/mecanicas/laberinto.c).
export interface MazeInfo {
  size: number; // tiles per side of the whole world
  tileSize: number; // pixels per tile
  version(): number; // goes up every time the maze changes
  isWall(col: number, row: number): boolean;
  isDoor(col: number, row: number): boolean; // part of a gate of the square
  gateOpening(): number; // 1 = fully open, 0 = closed
  // The 8 gate leaves (2 per gate) in world pixels; a fully open leaf is 0 wide.
  gateLeaves(): Rect[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameWasm {
  // Generates the maze from `seed` (same seed, same maze) and places the player.
  start(seed: number): void;
  maze: MazeInfo;
  setTarget(worldX: number, worldY: number): void;
  update(dtMs: number): void;
  // Testing aid: multiplies the speed of the clock only (1 = normal).
  setTimeSpeed(factor: number): void;
  // Testing aid: clock 15 s before the gates start closing (normal speed),
  // player in front of the top gate.
  testGates(): void;
  useAbility(id: number): void; // instant abilities
  holdAbility(id: number, held: boolean): void; // held abilities (run, block)
  abilities(): AbilityState[];
  player(): PlayerState;
  playerStats(): PlayerStats;
  // The target as C stored it (null if none yet), to check it arrived.
  targetInC(): { x: number; y: number } | null;
  clock(): ClockState;
  medusaLife(): number;
  medusaLifeMax(): number;
  reset(): void;
}

export async function loadGameWasm(): Promise<GameWasm> {
  const mod = await createModule();
  const num = (name: string, args: number) =>
    mod.cwrap<(...a: number[]) => number>(name, "number", Array(args).fill("number"));
  const call = (name: string, args: number) =>
    mod.cwrap<(...a: number[]) => void>(name, null, Array(args).fill("number"));

  const start = call("web_iniciar", 1);
  const mazeVersion = num("web_lab_version", 0);
  const mazeWall = num("web_lab_muro", 2);
  const mazeDoor = num("web_lab_puerta", 2);
  const gateOpening = num("web_lab_apertura", 0);
  const leaf = num("web_lab_hoja", 3);
  const deaths = num("web_jugador_muertes", 0);
  const delirium = num("web_jugador_delirio", 0);
  const gatesChange = num("web_reloj_cambio_compuertas_ms", 0);
  const setTarget = call("web_ir_a", 2);
  const update = call("web_actualizar", 1);
  const x = num("web_jugador_x", 0);
  const y = num("web_jugador_y", 0);
  const dirX = num("web_jugador_dir_x", 0);
  const dirY = num("web_jugador_dir_y", 0);
  const state = num("web_jugador_estado", 0);
  const hasTarget = num("web_hay_destino", 0);
  const targetX = num("web_destino_x", 0);
  const targetY = num("web_destino_y", 0);
  const day = num("web_reloj_dia", 0);
  const phase = num("web_reloj_fase", 0);
  const phaseLeft = num("web_reloj_restante_ms", 0);
  const expansions = num("web_reloj_expansiones", 0);
  const nextExpansion = num("web_reloj_proxima_expansion_ms", 0);
  const daylight = num("web_reloj_luz", 0);
  const gates = num("web_reloj_compuertas", 0);
  const useAbility = call("web_usar", 1);
  const hold = call("web_mantener", 2);
  const abilityActive = num("web_hab_activa", 1);
  const abilityCooldown = num("web_hab_recarga", 1);
  const abilityName = mod.cwrap<(h: number) => string>("web_hab_nombre", "string", ["number"]);
  const abilityCount = num("web_hab_cantidad", 0)();
  // Read once, after start(): before it the C player has no ability table yet.
  let names: string[] = [];
  const abilityNames = () => {
    if (names.length === 0) names = Array.from({ length: abilityCount }, (_, h) => abilityName(h));
    return names;
  };
  const medusaLife = num("web_medusa_vida", 0);
  const medusaLifeMax = num("web_medusa_vida_max", 0);
  const reset = call("web_reset", 0);

  return {
    start,
    maze: {
      size: num("web_lab_tiles", 0)(),
      tileSize: num("web_lab_tile", 0)(),
      version: mazeVersion,
      isWall: (col, row) => mazeWall(col, row) === 1,
      isDoor: (col, row) => mazeDoor(col, row) === 1,
      gateOpening,
      gateLeaves: () => {
        const leaves: Rect[] = [];
        for (let gate = 0; gate < 4; gate++) {
          for (let side = 0; side < 2; side++) {
            const [x, y, w, h] = [0, 1, 2, 3].map((k) => leaf(gate, side, k));
            leaves.push({ x, y, w, h });
          }
        }
        return leaves;
      },
    },
    setTarget,
    update,
    setTimeSpeed: call("web_velocidad_tiempo", 1),
    testGates: call("web_prueba_puertas", 0),
    player: () => ({ x: x(), y: y(), dirX: dirX(), dirY: dirY(), state: state() }),
    playerStats: () => ({ deaths: deaths(), delirium: delirium() }),
    targetInC: () => (hasTarget() ? { x: targetX(), y: targetY() } : null),
    clock: () => ({
      day: day(),
      phase: PHASE[phase()] ?? "DIA",
      phaseLeftMs: phaseLeft(),
      expansions: expansions(),
      nextExpansionMs: nextExpansion(),
      daylight: daylight(),
      gatesOpen: gates() === 1,
      gatesChangeMs: gatesChange(),
    }),
    useAbility,
    holdAbility: (id, held) => hold(id, held ? 1 : 0),
    abilities: () =>
      abilityNames().map((name, h) => ({
        name,
        active: abilityActive(h) === 1,
        cooldownMs: abilityCooldown(h),
      })),
    medusaLife,
    medusaLifeMax,
    reset,
  };
}
