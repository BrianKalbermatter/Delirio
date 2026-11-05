// Adapter over the C game core (src/main.c, which calls the mechanics in
// src/mecanicas/), compiled to WebAssembly through the bridge in src/web.c.
// The C side owns the game state; the client sends the mouse target every
// frame and reads the state back to draw it.
import createModule from "./generated/game.js";

// Same order as `enum estados` in src/entidad.h.
export const STATE = ["QUIETO", "CAMINANDO", "ATACANDO", "CORRIENDO", "MUERTO"] as const;

// Same order as `enum clavado` in src/mecanicas/enemigos.h: the wall face a
// spear pinned a dead enemy to, named by where it faces (null: not pinned).
export const PINNED = [null, "front", "left", "right"] as const;

// Same order as `enum fase` in src/mecanicas/mecanica.h.
export const PHASE = ["DIA", "TARDE", "NOCHE"] as const;

// Same order as `enum tramo` in src/mecanicas/calendario.h.
export const MOON_STRETCH = ["CRECIENTE", "LLENA", "MENGUANTE"] as const;

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
  SALTAR: 8,
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
  sun: number; // where the sun is: 0 dawn, 0.5 noon, 1 dusk; -1 at night
  gatesOpen: boolean;
  gatesChangeMs: number; // time until the gates close (if open) or open (if closed)
}

// Today in the lunar calendar (src/mecanicas/calendario.h).
export interface CalendarState {
  t: number; // day of the cycle: 0 to 179
  month: number; // 0 to 5
  monthName: string;
  dayOfMonth: number; // 1 to 30
  stretch: (typeof MOON_STRETCH)[number];
  dayName: string; // long: "Tercera luz creciente"
  hudText: string; // short: "Mes de Zeus · 3ª creciente"
  moonPhase: number; // 0 to 1: 0 new moon, 0.5 full moon
  luminosity: number; // 0 pitch dark, 1 full moon: for the maze at night
  waxing: boolean; // lit on the right; waning, on the left
  frame: number; // cell of the 30-phase spritesheet: 0 to 29
  daysUntilShip: number; // the black-sailed ship: 0 means it arrives today
}

export interface PlayerStats {
  deaths: number;
  delirium: number; // +1 per death
  life: number;
  lifeMax: number;
  level: number; // from 1
  xp: number; // gathered in this level
  xpNext: number; // what this level needs to go up
  points: number; // level points not spent yet
  upgrades: number[]; // times each UPGRADE was bought
  upgradeMax: number[]; // how many times each can be
  // What can be made (domain/crafting.ts): from 1, up with UPGRADE.BUILD,
  // which needs the player's level above it.
  buildLevel: number;
}

// Same order as `enum animo` in src/mecanicas/enemigos.h.
export const MOOD = ["DEAMBULA", "ACECHA", "ATACA", "HUYE", "CHARLA"] as const;

// What it is, same order as `enum tipo_enemigo` in src/mecanicas/enemigos.h.
export const ENEMY_KIND = ["spartan", "ghost", "spirit", "skeleton", "bonfire"] as const;

// A spawner (src/mecanicas/enemigos.c), by the circle that dances around it.
export interface Bonfire {
  x: number;
  y: number;
  out: boolean; // broken: nothing else comes from it
  life: number;
  lifeMax: number;
  hitMs: number; // > 0 right after being hit
}

// What a spirit threw, in the air.
export interface Shot {
  x: number; // over this point of the floor
  y: number;
}

// An enemy (src/mecanicas/enemigos.c), by its slot in C's list.
export interface EnemyState {
  slot: number;
  kind: (typeof ENEMY_KIND)[number];
  birthMs: number; // > 0 while it appears or gets up: it does nothing yet
  lying: boolean; // a skeleton lying as a heap of bones, waiting for the player
  x: number; // feet
  y: number;
  lookX: number; // where it looks (at the player while stalking)
  lookY: number;
  dirX: number; // where it moves
  dirY: number;
  state: number; // index into STATE
  pinned: (typeof PINNED)[number]; // dead, pinned to a wall facing this way
  mood: (typeof MOOD)[number];
  life: number;
  lifeMax: number;
  hitMs: number; // > 0 right after being hit
  // Who it goes around with: its bonfire's circle, RONDAS_MAX + its pack, or -1.
  group: number;
  talking: boolean; // the one screaming in its circle right now
  bush: number; // the bush it stands in, -1 if none
  loot: (typeof LOOT)[number]; // what it carries, dropped when it dies
  coins: number; // coins it drops when it dies
  weapon: (typeof ENEMY_WEAPON)[number]; // item id of what it holds, or null
  dropsWeapon: boolean; // leaves it on the floor when it dies
  boss: Zone; // the boss room it guards (ZONE.MAZE: not a boss)
  scale: number; // drawn this much bigger than a spartan (1: a common one)
  charge: number; // a boss winding up its blow: 0..1 (0: not charging)
}

// What an enemy holds, same order as `enum arma_enemigo` in src/mecanicas/enemigos.h.
export const ENEMY_WEAPON = [null, "spear", "torch", "axe"] as const;

// What an enemy carries, same order as `enum botin` in src/mecanicas/enemigos.h.
export const LOOT = [null, "potion", "sword", "branch"] as const;

// A bush the player hides in (src/mecanicas/arbustos.c): a circle on the floor.
// What a sheep is doing (EstadoOveja in src/mecanicas/ovejas.h).
export const SHEEP_STATE = { grazing: 0, walking: 1, fleeing: 2 } as const;

export interface Sheep {
  x: number;
  y: number;
  dirX: number; // where it faces, sideways
  state: number; // SHEEP_STATE
}

export interface Bush {
  x: number;
  y: number;
  radius: number;
}

// The player's relation to the bushes and the auto-attack.
export interface PlayerCover {
  bush: number; // the bush the player stands in, -1 if none
  hidden: boolean; // in a bush and not given away by attacking
  autoAttacks: number; // goes up by one every time the player swings on its own
  autoTarget: number; // the enemy (slot) it swings at on its own, one at a time; -1 if none
}

export interface PlayerState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  state: number; // index into STATE
  jumps: number; // +1 per jump, the one in the air too
}

// The upgrades bought with level points, same order as `enum mejora_id` in
// src/mecanicas/jugador.h.
export const UPGRADE = { LIFE: 0, MOBILITY: 1, DOUBLE_JUMP: 2, REACH: 3, BUILD: 4 } as const;
export const UPGRADE_COUNT = 5;

// Floor zones of the bosses, same order as `enum zona` in
// src/mecanicas/laberinto.h: the Medusas' temple of Zeus near the square,
// Achilles the centaur of Poseidon halfway out, and the Minotaur's lair
// (Hades) always at the end of the maze.
export const ZONE = { MAZE: 0, MEDUSAS: 1, POSEIDON: 2, MINOTAUR: 3 } as const;
export type Zone = (typeof ZONE)[keyof typeof ZONE];

// What each boss is called, by zone. For now they are bigger spartans, until
// their own sprites come.
export const BOSS_NAME: Record<number, string> = {
  [ZONE.MEDUSAS]: "Medusa",
  [ZONE.POSEIDON]: "Achilles, centaur of Poseidon",
  [ZONE.MINOTAUR]: "The Minotaur",
};

// The maze generated in C (src/mecanicas/laberinto.c).
export interface MazeInfo {
  size: number; // tiles per side of the whole world
  tileSize: number; // pixels per tile
  version(): number; // goes up every time the maze changes
  isWall(col: number, row: number): boolean;
  isDoor(col: number, row: number): boolean; // part of a gate of the square
  // The boss zone that weighs most on the tile's floor, and how much (0..1):
  // it grows as a boss gets closer. Fixed by the seed.
  zone(col: number, row: number): Zone;
  zoneWeight(col: number, row: number): number;
  isLava(col: number, row: number): boolean; // burns whoever steps on it without jumping
  isPit(col: number, row: number): boolean; // on the solid part of the pit by the spawn
  pit(): Rect; // the pit's drawing, world px
  isLairDoor(col: number, row: number): boolean; // the exit: the Minotaur's door, once carved
  lair(): { x: number; y: number; open: boolean }; // middle of the Minotaur's lair, world px
  gateOpening(): number; // 1 = fully open, 0 = closed
  // The 8 gate leaves (2 per gate) in world pixels; a fully open leaf is 0 wide.
  gateLeaves(): Rect[];
  // A solid box on the floor (a big rock) in world pixels: feet collide with
  // it like with a wall. Returns its number for removeObstacle, -1 when C has
  // no room for more.
  addObstacle(box: Rect): number;
  removeObstacle(id: number): void;
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
  // The player throws the spear towards (dirX, dirY) with `force` (0..1, how
  // much the bar charged: the further it flies): it kills the first enemy
  // in its way and carries it to where the flight ends, pinned there when it
  // is a wall face that shows. Says which enemy it killed (its slot, -1 if
  // none), where it hit it (or where the flight ended) and where the spear
  // ends up (world px). With `dryRun` it only says what would happen.
  throwSpear(
    dirX: number,
    dirY: number,
    force: number,
    dryRun?: boolean,
  ): { enemy: number; hitX: number; hitY: number; x: number; y: number };
  // Pulls the spear out of the pinned enemy in `slot`: it drops dead.
  unpin(slot: number): void;
  // While throwing the spear (aiming included) C uses no ability and does
  // not swing on its own: nothing cuts the throw short.
  setThrowing(throwing: boolean): void;
  useAbility(id: number): void; // instant abilities
  holdAbility(id: number, held: boolean): void; // held abilities (run, block)
  abilities(): AbilityState[];
  player(): PlayerState;
  playerStats(): PlayerStats;
  // A saved progress: level, experience and upgrades (by UPGRADE), healed.
  loadProgress(level: number, xp: number, upgrades: number[]): void;
  // A saved game, right after start() with its seed: the clock moved on to
  // `clockMs` (the maze growing as it did) and the player at (x, y).
  loadGame(clockMs: number, x: number, y: number): void;
  // Today in the lunar calendar.
  calendar(): CalendarState;
  // Testing aids: one day on, or straight to day `t`. They leave the clock
  // alone, and a reload takes the date from the clock again.
  calendarNextDay(): void;
  calendarSet(t: number): void;
  // Game time since the start (the clock's total), to save it.
  clockMs(): number;
  // Whether the player holds a shield: covering, it can walk (slowly).
  setShield(held: boolean): void;
  setArmor(worn: boolean): void; // without it one hit kills
  teleport(x: number, y: number): void;
  // Spends a level point on an UPGRADE. False if none left or it is maxed.
  upgrade(id: number): boolean;
  // The target as C stored it (null if none yet), to check it arrived.
  targetInC(): { x: number; y: number } | null;
  clock(): ClockState;
  // Level 1 enemies in play (dying ones included, MUERTO).
  enemies(): EnemyState[];
  // The bushes, fixed since start().
  bushes(): Bush[];
  sheep(): Sheep[];
  bonfires(): Bonfire[];
  shots(): Shot[];
  bonfiresOut(): number; // bits, for the save
  loadBonfiresOut(bits: number): void; // after loadGame()
  cover(): PlayerCover;
  // Gives the player life back (a potion), up to the maximum.
  heal(life: number): void;
  bossFight(): number; // slot of the boss fighting the player, -1 if none
  bossesDefeated(): number; // bits 1 << zone, for the save
  loadBossesDefeated(bits: number): void; // after start()
  burns(): number; // goes up by one every time the lava burns the player
  // The truce (first day): enemies stay out of the square, but for a stray one. After it they
  // walk in while the gates are open.
  truce(): boolean;
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
  const mazeZone = num("web_lab_zona", 2);
  const mazeZoneWeight = num("web_lab_influencia", 2);
  const lairDoor = num("web_lab_puerta_minotauro", 2);
  const mazeLava = num("web_lab_lava", 2);
  const sheepCount = num("web_ovejas_cant", 0);
  const bonfireCount = num("web_hogueras_cant", 0);
  const bonfire = Object.fromEntries(
    ["x", "y", "apagada", "vida", "vida_max", "golpeada"].map((field) => [field, num(`web_hoguera_${field}`, 1)]),
  );
  const shotMax = num("web_tiros_max", 0)();
  const shotActive = num("web_tiro_activo", 1);
  const shotX = num("web_tiro_x", 1);
  const shotY = num("web_tiro_y", 1);
  const sheepX = num("web_oveja_x", 1);
  const sheepY = num("web_oveja_y", 1);
  const sheepDirX = num("web_oveja_dir_x", 1);
  const sheepState = num("web_oveja_estado", 1);
  const mazePit = num("web_lab_hueco", 2);
  const mazePitBox = num("web_lab_hueco_dibujo", 1);
  const enemyScale = num("web_enemigo_escala", 1);
  const enemyBoss = num("web_enemigo_jefe", 1);
  const enemyCharge = num("web_enemigo_carga", 1);
  const bossFight = num("web_jefe_combate", 0);
  const bossesDefeated = num("web_jefes_vencidos", 0);
  const loadBossesDefeated = call("web_cargar_jefes_vencidos", 1);
  const burns = num("web_jugador_quemaduras", 0);
  const truce = num("web_tregua", 0);
  const lairX = num("web_lab_guarida_x", 0);
  const lairY = num("web_lab_guarida_y", 0);
  const lairOpen = num("web_lab_guarida_abierta", 0);
  const leaf = num("web_lab_hoja", 3);
  const obstacle = num("web_lab_obstaculo", 4);
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
  const sun = num("web_reloj_sol", 0);
  const gates = num("web_reloj_compuertas", 0);
  const calendarT = num("web_calendario_t", 0);
  const calendarMonth = num("web_calendario_mes", 0);
  const calendarMonthName = mod.cwrap<() => string>("web_calendario_nombre_mes", "string", []);
  const calendarDay = num("web_calendario_dia_del_mes", 0);
  const calendarStretch = num("web_calendario_tramo", 0);
  const calendarDayName = mod.cwrap<() => string>("web_calendario_nombre_dia", "string", []);
  const calendarHudText = mod.cwrap<() => string>("web_calendario_texto_hud", "string", []);
  const calendarPhase = num("web_calendario_fase", 0);
  const calendarLuminosity = num("web_calendario_luminosidad", 0);
  const calendarWaxing = num("web_calendario_creciente", 0);
  const calendarFrame = num("web_calendario_frame", 0);
  const calendarShip = num("web_calendario_dias_hasta_barco", 0);
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
  const spear = num("web_lanzar", 4);
  const setThrowing = call("web_lanzando", 1);
  const spearHitX = num("web_lanza_impacto_x", 0);
  const spearHitY = num("web_lanza_impacto_y", 0);
  const spearX = num("web_lanza_cae_x", 0);
  const spearY = num("web_lanza_cae_y", 0);
  const life = num("web_jugador_vida", 0);
  const lifeMax = num("web_jugador_vida_max", 0);
  const level = num("web_jugador_nivel", 0);
  const xp = num("web_jugador_experiencia", 0);
  const xpNext = num("web_jugador_experiencia_nivel", 0);
  const points = num("web_jugador_puntos", 0);
  const upgradeLevel = num("web_mejora", 1);
  const upgradeTop = num("web_mejora_tope", 1);
  const upgrade = num("web_mejorar", 1);
  const buildLevel = num("web_jugador_construccion", 0);
  const loadProgress = call("web_cargar_progreso", 2 + UPGRADE_COUNT);
  const jumps = num("web_jugador_saltos", 0);
  const shield = call("web_escudo", 1);
  const armor = call("web_armadura", 1);
  const enemyMax = num("web_enemigos_max", 0)();
  const enemy = Object.fromEntries(
    [
      "activo",
      "x",
      "y",
      "mira_x",
      "mira_y",
      "dir_x",
      "dir_y",
      "estado",
      "clavado",
      "animo",
      "vida",
      "vida_max",
      "golpeado",
      "grupo",
      "habla",
      "arbusto",
      "botin",
      "monedas",
      "arma",
      "suelta_arma",
      "tipo",
      "naciendo",
      "tirado",
    ].map((field) => [field, num(`web_enemigo_${field}`, 1)]),
  );
  const bushCount = num("web_arbustos_cant", 0);
  const bushX = num("web_arbusto_x", 1);
  const bushY = num("web_arbusto_y", 1);
  const bushRadius = num("web_arbusto_radio", 1);
  const playerBush = num("web_jugador_arbusto", 0);
  const playerHidden = num("web_jugador_escondido", 0);
  const autoAttacks = num("web_jugador_auto_ataques", 0);
  const autoTarget = num("web_jugador_objetivo", 0);

  return {
    start,
    maze: {
      size: num("web_lab_tiles", 0)(),
      tileSize: num("web_lab_tile", 0)(),
      version: mazeVersion,
      isWall: (col, row) => mazeWall(col, row) === 1,
      isDoor: (col, row) => mazeDoor(col, row) === 1,
      zone: (col, row) => mazeZone(col, row) as Zone,
      zoneWeight: mazeZoneWeight,
      isLava: (col, row) => mazeLava(col, row) === 1,
      isLairDoor: (col, row) => lairDoor(col, row) === 1,
      lair: () => ({ x: lairX(), y: lairY(), open: lairOpen() === 1 }),
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
      isPit: (col, row) => mazePit(col, row) === 1,
      pit: () => {
        const [x, y, w, h] = [0, 1, 2, 3].map((k) => mazePitBox(k));
        return { x, y, w, h };
      },
      addObstacle: ({ x, y, w, h }) => obstacle(x, y, w, h),
      removeObstacle: call("web_lab_quitar_obstaculo", 1),
    },
    setTarget,
    update,
    setTimeSpeed: call("web_velocidad_tiempo", 1),
    testGates: call("web_prueba_puertas", 0),
    throwSpear: (dirX, dirY, force, dryRun = false) => {
      const enemy = spear(dirX, dirY, force, dryRun ? 1 : 0);
      return { enemy, hitX: spearHitX(), hitY: spearHitY(), x: spearX(), y: spearY() };
    },
    unpin: call("web_desclavar", 1),
    setThrowing: (throwing) => setThrowing(throwing ? 1 : 0),
    player: () => ({ x: x(), y: y(), dirX: dirX(), dirY: dirY(), state: state(), jumps: jumps() }),
    playerStats: () => ({ deaths: deaths(), delirium: delirium(), life: life(), lifeMax: lifeMax(),
      level: level(),
      xp: xp(),
      xpNext: xpNext(),
      points: points(),
      upgrades: Array.from({ length: UPGRADE_COUNT }, (_, m) => upgradeLevel(m)),
      upgradeMax: Array.from({ length: UPGRADE_COUNT }, (_, m) => upgradeTop(m)),
      buildLevel: buildLevel(),
    }),
    bossFight,
    bossesDefeated,
    loadBossesDefeated,
    burns,
    truce: () => truce() === 1,
    enemies: () => {
      const list: EnemyState[] = [];
      for (let i = 0; i < enemyMax; i++) {
        if (!enemy.activo(i)) continue;
        list.push({
          slot: i,
          kind: ENEMY_KIND[enemy.tipo(i)] ?? "spartan",
          birthMs: enemy.naciendo(i),
          lying: enemy.tirado(i) === 1,
          x: enemy.x(i),
          y: enemy.y(i),
          lookX: enemy.mira_x(i),
          lookY: enemy.mira_y(i),
          dirX: enemy.dir_x(i),
          dirY: enemy.dir_y(i),
          state: enemy.estado(i),
          pinned: PINNED[enemy.clavado(i)] ?? null,
          mood: MOOD[enemy.animo(i)] ?? "DEAMBULA",
          life: enemy.vida(i),
          lifeMax: enemy.vida_max(i),
          hitMs: enemy.golpeado(i),
          group: enemy.grupo(i),
          talking: enemy.habla(i) === 1,
          bush: enemy.arbusto(i),
          loot: LOOT[enemy.botin(i)] ?? null,
          coins: enemy.monedas(i),
          weapon: ENEMY_WEAPON[enemy.arma(i)] ?? null,
          dropsWeapon: enemy.suelta_arma(i) === 1,
          boss: enemyBoss(i) as Zone,
          scale: enemyScale(i),
          charge: enemyCharge(i),
        });
      }
      return list;
    },
    sheep: () =>
      Array.from({ length: sheepCount() }, (_, i) => ({ x: sheepX(i), y: sheepY(i), dirX: sheepDirX(i), state: sheepState(i) })),
    bonfires: () =>
      Array.from({ length: bonfireCount() }, (_, k) => ({
        x: bonfire.x(k),
        y: bonfire.y(k),
        out: bonfire.apagada(k) === 1,
        life: bonfire.vida(k),
        lifeMax: bonfire.vida_max(k),
        hitMs: bonfire.golpeada(k),
      })),
    shots: () => {
      const list: Shot[] = [];
      for (let i = 0; i < shotMax; i++) if (shotActive(i)) list.push({ x: shotX(i), y: shotY(i) });
      return list;
    },
    bonfiresOut: num("web_hogueras_apagadas", 0),
    loadBonfiresOut: call("web_cargar_hogueras", 1),
    bushes: () => Array.from({ length: bushCount() }, (_, i) => ({ x: bushX(i), y: bushY(i), radius: bushRadius(i) })),
    cover: () => ({
      bush: playerBush(),
      hidden: playerHidden() === 1,
      autoAttacks: autoAttacks(),
      autoTarget: autoTarget(),
    }),
    heal: call("web_curar", 1),
    targetInC: () => (hasTarget() ? { x: targetX(), y: targetY() } : null),
    clock: () => ({
      day: day(),
      phase: PHASE[phase()] ?? "DIA",
      phaseLeftMs: phaseLeft(),
      expansions: expansions(),
      nextExpansionMs: nextExpansion(),
      daylight: daylight(),
      sun: sun(),
      gatesOpen: gates() === 1,
      gatesChangeMs: gatesChange(),
    }),
    calendar: () => ({
      t: calendarT(),
      month: calendarMonth(),
      monthName: calendarMonthName(),
      dayOfMonth: calendarDay(),
      stretch: MOON_STRETCH[calendarStretch()] ?? "CRECIENTE",
      dayName: calendarDayName(),
      hudText: calendarHudText(),
      moonPhase: calendarPhase(),
      luminosity: calendarLuminosity(),
      waxing: calendarWaxing() === 1,
      frame: calendarFrame(),
      daysUntilShip: calendarShip(),
    }),
    calendarNextDay: call("web_calendario_avanzar_dia", 0),
    calendarSet: call("web_calendario_fijar", 1),
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
    loadProgress: (level, xpSaved, upgrades) =>
      loadProgress(level, xpSaved, ...Array.from({ length: UPGRADE_COUNT }, (_, m) => upgrades[m] ?? 0)),
    upgrade: (id) => upgrade(id) === 1,
    setShield: (held) => shield(held ? 1 : 0),
    setArmor: (worn) => armor(worn ? 1 : 0),
    teleport: call("web_teletransportar", 2),
    loadGame: call("web_cargar_partida", 3),
    clockMs: num("web_reloj_ms_total", 0),
  };
}
