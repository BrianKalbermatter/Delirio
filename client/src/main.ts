// Composition root: wires infrastructure adapters to application use cases.
// The game logic lives in C (src/main.c, through the bridge src/web.c, compiled
// to WebAssembly). Movement is mouse only (Diablo style): while the left button
// is held, the client sends the world point under the cursor to C, then reads
// the state back and draws it: player, maze, light and panel. The maze itself
// is generated and grown by C (src/mecanicas/laberinto.c); the client mirrors
// its grid to draw it.
// The mouse is locked inside the whole window (game and inventory panel) until
// Esc, which opens the pause menu.
// The game view is drawn with PixiJS (WebGL): one stage with the world (ground
// and a depth-sorted layer) under the light and the HUD.
import { Application, Container, Graphics, Matrix, Sprite, Texture, TextureStyle } from "pixi.js";
import { Character } from "./domain/character";
import { type Direction, directionFromVector, vectorOf } from "./domain/facing";
import { EQUIP_SLOTS, Equipment, type EquipSlot } from "./domain/equipment";
import { CraftingGrid } from "./domain/crafting";
import { Inventory } from "./domain/inventory";
import { Hand as CursorHand } from "./domain/hand";
import {
  flightFrame,
  type ItemKind,
  ITEMS,
  POTION_IDS,
  SPEAR_FLIGHT_SPEED,
  stuckFrame,
  throwDirIndex,
} from "./domain/items";
import { planShrines, type Shrine, SHRINE_NAMES } from "./domain/shrines";
import { ITEM_SPRITES, placeItems, type Prop, WEAPON_ITEMS } from "./domain/level-items";
import { Square } from "./domain/square";
import { placeSampleTree } from "./domain/sample-tree";
import { placeSaplings, placeTrees, SPECIES } from "./domain/trees";
import { Flock } from "./domain/birds";
import { placeMeadow } from "./domain/meadow";
import { placeStumps } from "./domain/stumps";
import { TileMap } from "./domain/tile-map";
import { AbilityKeys } from "./infrastructure/input/ability-keys";
import { LockedMouse, VIRTUAL_MOUSEUP } from "./infrastructure/input/locked-mouse";
import { AbilityEffects } from "./infrastructure/render/ability-effects";
import { Animator } from "./infrastructure/render/animator";
import { PickupHalos } from "./infrastructure/render/pickup-halo";
import { PlazaDeco } from "./infrastructure/render/plaza-deco";
import { BushViews, FRUIT_ITEMS } from "./infrastructure/render/bushes";
import { BirdViews } from "./infrastructure/render/birds";
import { SheepViews } from "./infrastructure/render/sheep";
import { StumpViews } from "./infrastructure/render/stumps";
import { RockField } from "./infrastructure/render/rocks";
import { TreeViews } from "./infrastructure/render/tree";
import { type BigRock, type Pebble, planRocks } from "./domain/rocks";
import { Camera } from "./infrastructure/render/camera";
import { CursorOverlay, TargetMarker } from "./infrastructure/render/cursor";
import { DEPTH, depthOf } from "./infrastructure/render/depth";
import { BonfireViews } from "./infrastructure/render/bonfires";
import { BoneField } from "./infrastructure/render/bones";
import { EnemyViews } from "./infrastructure/render/enemies";
import { FlameGlow } from "./infrastructure/render/flame-glow";
import { Glow } from "./infrastructure/render/glow";
import { createKeyPrompt, formatMs, Hud, KEY_PROMPT_SIZE } from "./infrastructure/render/hud";
import { PLAYER_BAR_HEIGHT, PlayerBar } from "./infrastructure/render/player-bar";
import { Blood } from "./infrastructure/render/blood";
import { Dust } from "./infrastructure/render/dust";
import { clearProgress, loadProgress, saveProgress } from "./infrastructure/storage/progress-store";
import { clearWorld, type FloorItem, loadWorld, type SavedItem, type SavedWorld, saveWorld } from "./infrastructure/storage/world-store";
import { LevelAura } from "./infrastructure/render/level-aura";
import { LevelWave } from "./infrastructure/render/level-wave";
import { ForestGloom } from "./infrastructure/render/forest-gloom";
import { Lighting } from "./infrastructure/render/lighting";
import { ShrineViews } from "./infrastructure/render/shrines";
import { SpectreViews } from "./infrastructure/render/spectres";
import { type Box, loadMazeTiles, MazeRenderer, type View } from "./infrastructure/render/maze-renderer";
import {
  animationDurationMs,
  DEFAULT_ANIMATION,
  drawFrame,
  type Frame,
  loadImage,
  loadSpriteSheet,
  placeFrame,
  recolorSheet,
  type SpriteSheet,
} from "./infrastructure/render/sprite-sheet";
import { UpgradePanel } from "./infrastructure/ui/upgrade-panel";
import { CoreDebug } from "./infrastructure/ui/core-debug";
import { DOLL_HEIGHT, DOLL_SCALE, DOLL_WIDTH, InventoryPanel } from "./infrastructure/ui/inventory-panel";
import { GameLog } from "./infrastructure/ui/game-log";
import { SideTabs } from "./infrastructure/ui/side-tabs";
import { MapBook } from "./infrastructure/ui/map-book";
import { type Mark, Minimap, playerHead } from "./infrastructure/ui/minimap";
import { ShrineMenu } from "./infrastructure/ui/shrine-menu";
import { PauseMenu } from "./infrastructure/ui/pause-menu";
import { GroundCover, WEATHER_KINDS, Weather, type WeatherKind, type WeatherNow } from "./domain/weather";
import { Front, WeatherAir, WeatherGround, WeatherSky, type View as SkyView } from "./infrastructure/render/weather";
import {
  ABILITY,
  BOSS_NAME,
  type EnemyState,
  loadGameWasm,
  type PlayerCover,
  STATE,
  UPGRADE,
} from "./infrastructure/wasm/game-wasm";

// The canvas fills the whole game area. Its internal resolution adapts to the
// area so that it is always shown at an integer scale: every pixel the same
// size, nothing stretched. The scale aims at about TARGET_VIEW_HEIGHT pixels
// of world vertically; a bigger window shows a bit more of the maze.
const TARGET_VIEW_HEIGHT = 480;
// Empty rows under the feet in personaje_3's canvas; drawn lower so the feet
// land on the collision box.
const PLAYER_FEET_PADDING = 13;
const PLAYER_FLOOR_ABOVE_BOTTOM = 14; // px from the bottom of its canvas to the floor line
// Drawn size of the player, for fading walls and the light position.
const PLAYER_BODY_WIDTH = 32;
const PLAYER_BODY_HEIGHT = 62;
// An enemy's body and an item on the floor, for the faint windows in walls.
const ENEMY_BODY_WIDTH = 20;
const ENEMY_BODY_HEIGHT = 58;
const ITEM_BOX = 16;
const PICKUP_RADIUS = 22;
// Coins glide to the player from
// this far (more with each level of the Reach skill), slowly at first and
// faster as they get close.
const MAGNET_RADIUS = 40; // px from the feet
const MAGNET_PER_LEVEL = 18;
const MAGNET_SPEED_MIN = 35; // px/s, at the edge of the radius
const MAGNET_SPEED_MAX = 260; // px/s, at the feet
// Items picked up with E (all but the coins): reach from the feet, and the key prompt
// shown above the head while one is in reach.
const KEY_PICKUP_RADIUS = 26;
const FRUIT_REACH = 48; // px from a fruit bush's middle: E picks it
const PROMPT_ABOVE_HEAD = 6;
// A dropped item lands this far ahead of the feet (past PICKUP_RADIUS), after
// a short hop out of the hand.
const DROP_AHEAD = 32;
const DROP_REACH = 96; // an item dragged onto the map lands at most this far
const DROP_SCATTER = 8; // px: a stack dropped at once does not land in one spot
const LOOT_SPREAD = 14; // px from a dead enemy to where its loot lands
const DROP_FALL_MS = 280;
const DROP_HOP = 16; // px of the hop's peak
// Something thrown on the floor (dropped, loot, a felled tree's logs) keeps
// bouncing softly where it lies, so it is not missed: a hop and a smaller one
// after it, every BOUNCE_EVERY_MS.
// Weather.
const OVERCAST_DIM = 0.35; // share of the daylight a fully overcast sky takes
const THUNDER_SHAKE_MS = 500;
const THUNDER_SHAKE_PX = 1.5;
const WINDY = 0.95; // wind from which the log says it picks up
const WEATHER_SAYS: Record<WeatherKind, string> = {
  clear: "The clouds go by: the sun comes out.",
  cloudy: "Clouds cover the sky.",
  rain: "It starts to rain.",
  storm: "A storm breaks.",
  snow: "It starts to snow.",
  ash: "Ash falls from the sky.",
};
const BOUNCE_EVERY_MS = 2200;
const BOUNCE_MS = 800;
const BOUNCE_PX = 3;
// The white halo of an item that is picked up with E: it shows from
// HALO_RADIUS px away and is at its brightest within KEY_PICKUP_RADIUS.
const HALO_RADIUS = 72;
const HALO_DIM = 0.35; // its strength at HALO_RADIUS
const HALO_PULSE_MS = 1400;
// A felled tree drops LOG_COUNTS[k] logs with chance LOG_CHANCES[k], around
// its foot, falling from the crown.
const LOG_COUNTS = [3, 4, 5];
const LOG_CHANCES = [0.35, 0.4, 0.25];
const LOG_SPREAD = 26; // px from the foot
const LOG_FALL_FROM = 48; // px above the foot they fall from
const TARGET_REACHED = 4; // px: the floor marker hides when the player gets this close
// The player's eyes "breathe": one slow pulse every two idle loops
// (idle = 8 frames, 900 ms), in step with the idle movement.
const PLAYER_EYES: [number, number, number] = [255, 255, 255]; // the eye of art/personaje_4_original.png
const PLAYER_GLOW: [number, number, number] = [255, 214, 120];
// How long each attack shows the swing: the time it is active in C
// (habilidades in src/mecanicas/jugador.c), but never so short it can't be seen.
const ATTACK_ACTIVE_MS: Record<number, number> = {
  [ABILITY.ATAQUE_LIGERO]: 200,
  [ABILITY.ATAQUE_RAPIDO]: 120,
  [ABILITY.ATAQUE_LARGO]: 400,
  [ABILITY.ATAQUE_CRITICO]: 300,
};
const MIN_SWING_MS = 260;
const PICKUP_MS = 450;
// The player's shadow on the floor, cast away from the sun (game.clock().sun):
// short and behind at noon, long to the left in the morning and to the right
// as night falls, fading out with the daylight. Lengths are fractions of the
// sprite height.
const SUN_SHADOW_ALPHA = 0.3;
const SUN_SHADOW_NOON = 0.22; // length behind the body at noon
const SUN_SHADOW_LOW = 1.1; // sideways length with the sun on the horizon
// Punching the ground (the ulti, D): as long as HAB_ULTI in C. The fists hit
// the floor SLAM_IMPACT_MS in (frame 4 of slam, art/personaje_3_build.py) and
// the view shakes.
const SLAM_MS = 900;
const SLAM_IMPACT_MS = 270;
const SLAM_SHAKE_MS = 350;
const SLAM_SHAKE_PX = 3;
// Throwing the spear (with it in the right hand): the left button held aims
// it, the spear up over the head (throw_* of art/personaje_3_build.py held at
// THROW_HOLD_MS) and turned to the cursor while a bar under the feet charges
// for SPEAR_CHARGE_MS. Released it throws (the rest of the animation, letting
// go at THROW_RELEASE_MS), as far as the bar charged: a full bar reaches C's
// whole range, a little charge throws it short.
// The spear sticks in the ground where it ends up and has to be picked up.
const THROW_HOLD_MS = 260;
const THROW_RELEASE_MS = 440;
const SPEAR_CHARGE_MS = 600;
// The spear leaves the hand this high, and flies level at it until it hits
// (an enemy, at the belly) or comes down where its flight ends.
const SPEAR_HAND_HEIGHT = 30; // px over the feet
const SPEAR_HIT_HEIGHT = 14;
const SPEAR_HAND_AHEAD = 12; // px ahead of the feet
const SPEAR_BAR_WIDTH = 24;
// Fully charged, the point of the spear flashes (destello of art/lanza_brillo.py)
// and goes on twinkling (brillo) while the whole spear shines, until it is thrown.
const SPEAR_FLASH_MS = 360;
const SPEAR_TWINKLE_MS = 560;
const SPEAR_GLOW_CHARGING = 0.35; // the spear's shine as the bar fills
const SPEAR_GLOW_READY = 0.55; // and, pulsing, once it is full
const SPEAR_GLOW_PULSE = 0.25;
const SPEAR_GLOW_PERIOD_MS = 420;
const SCREAMS_HEARD_FROM = 420; // px from a bonfire

// The ring under the enemy the player swings at on its own, around its feet.
const FOCUS_RING_RX = 13; // px
const FOCUS_RING_RY = 5;
const SPEAR_BAR_BELOW_FEET = 6; // px
const SPEAR_BAR_CHARGING = 0x8b93af;
const SPEAR_BAR_READY = 0xfbb954;
// W A S D walk towards a point this far ahead while held.
const WASD_AHEAD = 32; // px
const WASD: Record<string, [number, number]> = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };
const BREATH_MS = 1800;
// The player's own faint light at night, without a torch (Lighting's default).
const BARE_LIGHT = { inner: 24, outer: 120 };
// Colors of the torch's flame (sprites/Objetos/Antorcha.aseprite) and of its glow.
const FLAME_COLORS: [number, number, number][] = [
  [176, 150, 42],
  [223, 113, 38],
  [217, 87, 99],
];
const FLAME_GLOW: [number, number, number] = [255, 150, 60];
// The fire's base (art/antorcha_fuego.py BASE_Y) goes this far below the
// center of the torch's flame, so the fire covers it.
const FIRE_BASE_Y = 17;
const FIRE_BELOW_CENTER = 3;
const INVENTORY_SIZE = 16;
const POTION_HEAL = 30;
// An enemy's hit shakes the view, softer than the slam.
const HURT_SHAKE_MS = 180;
const HURT_SHAKE_PX = 2;
// Levelling up shakes it harder than anything else, as the wave bursts out.
const LEVEL_SHAKE_MS = 1000;
const LEVEL_SHAKE_PX = 5;
// Hidden in a bush, the player is drawn see-through (League of Legends style).
const HIDDEN_ALPHA = 0.5;
type Hand = "rightHand" | "leftHand";
const HANDS: Hand[] = ["rightHand", "leftHand"];
const GROWTH_BANNER_MS = 2500; // "the maze grows" message on screen
const DEATH_BANNER_MS = 3000;

const gameEl = document.getElementById("game")!;
const panelEl = document.getElementById("panel")!;

// Pixel art: nearest-neighbour sampling for every texture, no antialiasing,
// one texture pixel per canvas pixel, positions snapped to whole pixels. The
// game loop below renders by hand, so the app's own ticker never starts.
TextureStyle.defaultOptions.scaleMode = "nearest";
const app = new Application();
await app.init({
  preference: "webgl",
  background: "#0d0b12",
  antialias: false,
  resolution: 1,
  roundPixels: true,
  autoStart: false,
  sharedTicker: false,
  useBackBuffer: true, // the twilight tint blends with soft-light
});
const canvas = app.canvas;
gameEl.appendChild(canvas);
let screenScale = 1; // CSS pixels per canvas pixel
fitCanvas();

// Every item sprite, loaded once from public/assets. Paths start at the base
// the site is served from ("/" locally, "/Delirio/" on GitHub Pages).
const BASE = import.meta.env.BASE_URL;
const assetNames = ITEM_SPRITES;
const [
  game,
  playerSheet,
  armedSheet,
  armedLeftSheet,
  armedBothSheet,
  dirtFrontSheet,
  dirtBehindSheet,
  mazeTiles,
  fireSheet,
  enemySheet,
  flowerSheet,
  tallFlowerSheet,
  smallFlowerSheet,
  grassImage,
  smallGrassImage,
  bushSheet,
  fruitBushSheet,
  stumpSheet,
  sheepSheet,
  birdSheet,
  bonfireSheet,
  ghostSheet,
  spiritSheet,
  skeletonSheet,
  spiritShotSheet,
  ghostDropSheet,
  medusaSheet,
  miniMedusaSheet,
  wheelSheet,
  centaurSheet,
  arrowSheet,
  shrineSheet,
  treeImage,
  treeShadowImage,
  orangeTreeImage,
  orangeTreeShadowImage,
  treePiecesImage,
  pitImage,
  levelAuraBehindSheet,
  levelAuraFrontSheet,
  ...assetSheets
] = await Promise.all([
  loadGameWasm(),
  // Rendered from a model in every direction (art/personaje_3_build.py): the
  // body stays at the middle of the canvas, the default pivot.
  loadSpriteSheet(`${BASE}sprites/personaje_3`),
  // Same frames and tags, with the right hand gripping a weapon, the left
  // one, and both.
  loadSpriteSheet(`${BASE}sprites/personaje_3_armado`),
  loadSpriteSheet(`${BASE}sprites/personaje_3_armado_izq`),
  loadSpriteSheet(`${BASE}sprites/personaje_3_armado_ambas`),
  // The dirt thrown up by slam, in front of the body and behind it.
  loadSpriteSheet(`${BASE}sprites/personaje_3_tierra`),
  loadSpriteSheet(`${BASE}sprites/personaje_3_tierra_atras`),
  loadMazeTiles(`${BASE}assets/maze_tiles`),
  // The torch's fire (art/antorcha_fuego.py), drawn on its flame.
  loadSpriteSheet(`${BASE}sprites/antorcha_fuego`),
  // Brian's Espartano1, the level 1 enemy (art/espartano.py,
  // sprites/Enemigos/Espartano1).
  loadSpriteSheet(`${BASE}sprites/espartano_1`),
  loadSpriteSheet(`${BASE}sprites/flores`),
  loadSpriteSheet(`${BASE}sprites/flores_2`),
  // The meadow's small flowers (art/florcitas.py) and Brian's tall grass,
  // whole and small (art/gramilla.py).
  loadSpriteSheet(`${BASE}sprites/florcitas`),
  loadImage(`${BASE}sprites/gramilla.png`),
  loadImage(`${BASE}sprites/gramilla_chica.png`),
  // Bushes to hide in (art/arbustos_build.sh).
  loadSpriteSheet(`${BASE}sprites/arbusto`),
  // And with fruit, at several sizes (art/arbustos_frutos.py).
  loadSpriteSheet(`${BASE}sprites/arbusto_frutos`),
  // The stumps scattered around the map (art/tocones.py).
  loadSpriteSheet(`${BASE}sprites/tocones`),
  // The wild sheep of the square (art/ovejas.py).
  loadSpriteSheet(`${BASE}sprites/oveja`),
  // The wild birds (art/aves.py).
  loadSpriteSheet(`${BASE}sprites/aves`),
  // The enemies' spawners (art/hoguera.py), and the enemies without a spartan's
  // body: the ghost, the spirit, the skeleton and what the spirit throws
  // (art/espectros.py).
  loadSpriteSheet(`${BASE}sprites/hoguera`),
  loadSpriteSheet(`${BASE}sprites/fantasma`),
  loadSpriteSheet(`${BASE}sprites/espiritu`),
  loadSpriteSheet(`${BASE}sprites/esqueleto`),
  loadSpriteSheet(`${BASE}sprites/espiritu_tiro`),
  loadSpriteSheet(`${BASE}sprites/fantasma_tiro`),
  // Medusa, her little ones, the arrow, and the wheel skeleton of the forest
  // (art/espectros.py).
  loadSpriteSheet(`${BASE}sprites/medusa`),
  loadSpriteSheet(`${BASE}sprites/medusa_mini`),
  loadSpriteSheet(`${BASE}sprites/rueda`),
  loadSpriteSheet(`${BASE}sprites/centauro`),
  loadSpriteSheet(`${BASE}sprites/flecha`),
  // The shrines (art/santuarios.py).
  loadSpriteSheet(`${BASE}sprites/santuarios`),
  // The trees of the square with their shadows, and the stones and tufts at
  // their foot (art/arbol2_build.sh, art/arbol3_build.sh).
  loadImage(`${BASE}sprites/arbol_2.png`),
  loadImage(`${BASE}sprites/arbol_2_sombra.png`),
  loadImage(`${BASE}sprites/arbol_3.png`),
  loadImage(`${BASE}sprites/arbol_3_sombra.png`),
  loadImage(`${BASE}sprites/arbol_3_pie.png`),
  // The pit by the spawn (art/hueco.py).
  loadImage(`${BASE}sprites/hueco.png`),
  // The level up around the body (art/nivel_aura_build.sh).
  loadSpriteSheet(`${BASE}sprites/nivel_aura_atras`),
  loadSpriteSheet(`${BASE}sprites/nivel_aura_frente`),
  ...assetNames.map((name) => loadSpriteSheet(`${BASE}assets/${name}`)),
]);
// Each weapon's overlays (in front of the body and behind it), by item id and
// hand. They have a frame for every frame of the body: the weapon is drawn in
// that hand in each one, already turned, and in the right hand with its smear
// in the swings (the left hand only carries).
interface HandFx {
  front: SpriteSheet;
  behind: SpriteSheet;
}
const weaponFx = new Map(
  await Promise.all(
    WEAPON_ITEMS.map(async (item) => {
      const [front, behind, leftFront, leftBehind] = await Promise.all(
        ["fx", "fx_atras", "fx_izq", "fx_izq_atras"].map((s) => loadSpriteSheet(`${BASE}sprites/${item.sprite}_${s}`)),
      );
      const hands: Record<Hand, HandFx> = {
        rightHand: { front, behind },
        leftHand: { front: leftFront, behind: leftBehind },
      };
      return [item.id, hands] as const;
    }),
  ),
);
// The flash of a charged spear, and where its point is held in each direction, in px
// from the feet (art/personaje_3_build.py).
const spearFlashSheet = await loadSpriteSheet(`${BASE}sprites/lanza_brillo`);
const spearTip: Record<Direction, [number, number]> = await (await fetch(`${BASE}sprites/lanza_punta.json`)).json();
const sheets = new Map<string, SpriteSheet>(assetNames.map((name, i) => [name, assetSheets[i]]));

// The character being played (only one for now): its level and experience
// come back from this browser and are saved there as they change.
const CHARACTER_ID = "personaje_3";
// Where it was left (a reload picks the game up there), or null: a new game.
const savedWorld = loadWorld(CHARACTER_ID);
// The maze comes from C: a random seed each new game (shown in the panel, so
// a maze worth repeating can be reproduced), the saved one when going on.
const seed = savedWorld?.seed ?? Math.floor(Math.random() * 2 ** 31);
game.start(seed);
// The base, where the start items, the square and the tree go (also when
// going on: the player is elsewhere then).
const baseSpawn = game.player();
if (savedWorld) {
  game.loadGame(savedWorld.clockMs, savedWorld.x, savedWorld.y);
  game.loadBossesDefeated(savedWorld.bossesDefeated);
  game.loadBonfiresOut(savedWorld.bonfiresOut);
}
const savedProgress = loadProgress(CHARACTER_ID);
if (savedProgress) game.loadProgress(savedProgress.level, savedProgress.xp, savedProgress.upgrades);
const map = new TileMap(game.maze.size, game.maze.size, game.maze.tileSize);
let mazeVersion = -1;
let growthBannerMs = 0;
let gateOpening = 1;
let seenExpansions = game.clock().expansions; // a loaded game does not announce old growths
let seenDeaths = 0;
let seenBurns = 0;
let inTruce = game.truce();
let bossInFight = -1;
let seenDefeated = game.bossesDefeated();
let seenBonfiresOut = game.bonfiresOut();
let heardTheScreams = false; // told once what they do around the fire
let lastLife = -1;
let seenLevel = game.playerStats().level;
let levelBeforeAura = seenLevel; // what the bar shows until the aura bursts
let savedXp = game.playerStats().xp;

// Set by New game: from then on nothing is saved (the page reloads clean).
let startingOver = false;

// Saves where the game is (world-store), unless a new game is starting.
function saveGame(): void {
  if (!startingOver) saveWorld(CHARACTER_ID, snapshotWorld());
}

function saveCurrentProgress(): void {
  if (startingOver) return; // a new game wiped it: do not write it back
  const { level, xp, upgrades } = game.playerStats();
  saveProgress(CHARACTER_ID, { level, xp, upgrades });
  savedXp = xp;
}
// Enemy slots alive last frame, to see which ones just died.
const enemiesAlive = new Set<number>();
let enemyAnimMs = 0; // game time the enemies' animations have to catch up on
let seenAutoAttacks = 0; // swings C made on its own (an enemy got too close)
let deathBannerMs = 0;
syncMaze();
const pitBox = game.maze.pit();
map.fillPit(pitBox, game.maze.isPit);

// The stage, back to front. The world moves with the camera: the ground lies
// flat under everything, and whatever stands sorts by depth (see depth.ts).
// Over it, in screen space: the light, the player's glow and the HUD.
const world = new Container();
const ground = new Container();
const standing = new Container({ sortableChildren: true });
// The halos of the items in reach, in the same layer as the items.
const pickupHalos = new PickupHalos(standing);
world.addChild(ground, standing);
// The world and its light: what the level up wave bends. The HUD stays out.
const scene = new Container();
scene.addChild(world);
app.stage.addChild(scene);

// A prop is drawn either as a looping animation or as one fixed frame.
interface PropView {
  prop: Prop;
  sheet: SpriteSheet;
  animator: Animator | null;
  sprite: Sprite; // in the depth-sorted layer while the prop is on the floor
  // A dropped item is not picked up again until the player has walked away.
  waitForLeave?: boolean;
  // While it falls from the hand: where it was thrown from and time left.
  fall?: { fromX: number; fromY: number; ms: number };
  // Thrown there (not placed with the maze): it bounces softly, this many ms
  // into its cycle, so items dropped together do not hop in step.
  bounce?: number;
  // A spear in the body of this enemy (its slot), pinned to a wall: hidden
  // while the body shows it, and pulling it out drops the body.
  pinnedEnemy?: number;
}
const spawn = baseSpawn;
// Going on, the items lying around are the saved ones (the rest of the props
// are placed as always).
const shrines = planShrines(seed, map, baseSpawn, game.bonfires());
const items = placeItems(map, spawn, shrines[0]).filter((prop) => !savedWorld || !prop.pickup);
let propViews: PropView[] = items.map((prop) => addProp(prop, prop.frame === undefined));
for (const saved of savedWorld?.floor ?? []) {
  const item = ITEMS[saved.id];
  if (!item) continue;
  const bounce = saved.bounce ? Math.random() * BOUNCE_EVERY_MS : undefined;
  if (item.floorAnimation) {
    propViews.push(itemOnFloor(item, saved.x, saved.y, { bounce }));
    continue;
  }
  const prop: Prop = { sprite: item.sprite, frame: saved.frame, x: saved.x, y: saved.y, pickup: item };
  propViews.push(addProp(prop, saved.frame === undefined, { bounce }));
}
const square = new Square(map, spawn);
// The first tree of the square, with fallen branches around it.
const tree = placeSampleTree(spawn);
const sheepViews = new SheepViews(sheepSheet, standing);
// By day; at night the ones around stay, and no more come.
const DAYLIGHT_FOR_BIRDS = 0.25;
const flock = new Flock((x, y) => {
  const col = Math.floor(x / map.tileSize);
  const row = Math.floor(y / map.tileSize);
  return !map.isWall(col, row) && !map.isDoor(col, row) && !map.isPit(col, row) && !map.isLava(col, row);
});
const birdViews = new BirdViews(birdSheet, standing, ground);
const bushViews = new BushViews(game.bushes(), bushSheet, fruitBushSheet, standing);
// Fallen branches lie around the tree, each drawn with its own variant (in a
// saved game they are among the saved floor items).
if (!savedWorld) propViews.push(
  ...tree.branches.map((b) =>
    addProp(
      {
        sprite: ITEMS.branch.sprite,
        frame: b.kind,
        x: b.x,
        y: b.y,
        pickup: ITEMS.branch,
      },
      false,
    ),
  ),
);
// Rocks (domain/rocks.ts): big ones to break with the pickaxe and pebbles to
// pick up with E, placed cell by cell as the maze is carved. Going on, the
// pebbles lying around are among the saved floor items, and the broken rocks
// stay broken (a save from before the rocks gets its pebbles now).
const rockField = new RockField(seed, standing, sheets.get("rocas")!, map, game.maze, savedWorld?.rocks?.broken ?? [], () => [
  ...game.bonfires(),
  ...shrines,
]);
// What lies loose changed with LOOSE_VERSION: an older save gets what is new
// added on load (the pebbles and branches at 2, the saplings at 3).
const LOOSE_VERSION = 3;
const looseSaved = savedWorld?.rocks?.loose ?? 0;
addLoose(rockField.sync(looseSaved < 2));
// The old stumps of the square (domain/stumps.ts): before the trees, which grow
// around them.
const stumps = placeStumps(seed, square, map.tileSize, spawn, [
  ...planRocks(seed).flatMap((cell) => cell.rocks),
  ...game.bushes(),
  tree,
  ...propViews.map((v) => ({ x: v.prop.x, y: v.prop.y })),
]);
const stumpViews = new StumpViews(
  stumps,
  stumpSheet,
  bushSheet,
  [Texture.from(grassImage), Texture.from(smallGrassImage)],
  Texture.from(treePiecesImage),
  standing,
  game.maze,
);
// The trees all over the square (domain/trees.ts), solid at the foot. They keep
// off every rock of the plan, broken or not, so they stay put across reloads.
const trees = placeTrees(square, map.tileSize, spawn, tree, [
  ...planRocks(seed).flatMap((cell) => cell.rocks),
  ...game.bushes(),
  ...stumps,
]);
const treeViews = new TreeViews(
  trees,
  [
    { tree: Texture.from(treeImage), shadow: Texture.from(treeShadowImage) },
    { tree: Texture.from(orangeTreeImage), shadow: Texture.from(orangeTreeShadowImage) },
  ],
  Texture.from(treePiecesImage),
  standing,
  game.maze,
  savedWorld?.felledTrees ?? [],
);
if (looseSaved < 3) {
  for (const { x, y, species } of placeSaplings(trees)) {
    const item = species === SPECIES.orange ? ITEMS.sapling_orange : ITEMS.sapling_green;
    propViews.push(addProp({ sprite: item.sprite, frame: item.frame, x, y, pickup: item }, false));
  }
}
// The meadow all over the square (domain/meadow.ts): flowers, small flowers
// and tall grass, off the items, trees and rocks lying there.
const meadowGround = new Container();
const plazaDeco = new PlazaDeco(
  placeMeadow(square, map.tileSize, spawn, [
    ...propViews.map((v) => ({ x: v.prop.x, y: v.prop.y })),
    ...trees,
    ...tree.branches,
    ...rockField.positions(),
    ...stumps,
  ]),
  [flowerSheet, tallFlowerSheet],
  [Texture.from(grassImage), Texture.from(smallGrassImage)],
  smallFlowerSheet,
  standing,
  meadowGround,
);

const player = new Character();
player.sync(coreState(), 0);
const playerAnimator = new Animator(playerSheet);
playerAnimator.play(player.animationTag); // shown behind the start menu too
const playerSprite = new Sprite();
// The weapon overlays (weapon, fist, smear) and slam's dirt, in front of the
// body and behind it.
const weaponFxFront = new Sprite();
const weaponFxBehind = new Sprite();
// The shine on the spear while it charges: its own overlays again, added on top.
const spearGlowFront = new Sprite();
const spearGlowBehind = new Sprite();
spearGlowFront.blendMode = spearGlowBehind.blendMode = "add";
const dirtFront = new Sprite();
const dirtBehind = new Sprite();
// The same for the left hand.
const leftFxFront = new Sprite();
const leftFxBehind = new Sprite();
// The torch's fire, over its flame, in each hand.
const fireSprites: Record<Hand, Sprite> = { rightHand: new Sprite(), leftHand: new Sprite() };
const fireAnimator = new Animator(fireSheet);
fireAnimator.play("fuego");
standing.addChild(
  playerSprite,
  weaponFxFront,
  weaponFxBehind,
  spearGlowFront,
  spearGlowBehind,
  leftFxFront,
  leftFxBehind,
  dirtFront,
  dirtBehind,
  fireSprites.rightHand,
  fireSprites.leftHand,
);
// The shadow left on the floor while the player is in the air.
const jumpShadow = new Graphics().ellipse(0, 0, 9, 3).fill({ color: 0x000000, alpha: 0.35 });
// The puff of air under the feet when jumping again in the air.
const airPuff = new Graphics();
let airPuffAt: { x: number; y: number; ms: number } | null = null;
const AIR_PUFF_MS = 260;
let slamImpactMs: number | null = null; // time left until the fists hit the floor
const playerGlow = new Glow(playerSheet, PLAYER_EYES, PLAYER_GLOW);
const torchFx = weaponFx.get(ITEMS.torch.id)!;
const torchGlows: Record<Hand, FlameGlow> = {
  rightHand: new FlameGlow([torchFx.rightHand.front, torchFx.rightHand.behind], FLAME_COLORS, FLAME_GLOW),
  leftHand: new FlameGlow([torchFx.leftHand.front, torchFx.leftHand.behind], FLAME_COLORS, FLAME_GLOW),
};
const camera = new Camera(player.x, playerCenterY(), canvas.width, canvas.height);
const maze = new MazeRenderer(app.renderer, standing, map, mazeTiles, square);
// The enemies hold weapons with the player's right-hand overlays, the hand
// recoloured from the player's (art/armas.py HAND, HAND_DARK) to the
// spartan's skin (art/espartano.py).
const ENEMY_HAND_SWAPS: [number, number][] = [
  [0xcd683d, 0xeec39a],
  [0x7a3045, 0xd9a066],
];
const enemyWeaponFx = new Map(
  [...weaponFx].map(([id, hands]) => [
    id,
    {
      front: recolorSheet(hands.rightHand.front, ENEMY_HAND_SWAPS),
      behind: recolorSheet(hands.rightHand.behind, ENEMY_HAND_SWAPS),
    },
  ]),
);
const enemyViews = new EnemyViews(standing, enemySheet, (id) => enemyWeaponFx.get(id));
const spectreViews = new SpectreViews(standing, {
  ghost: ghostSheet,
  spirit: spiritSheet,
  skeleton: skeletonSheet,
  shot: spiritShotSheet,
  drop: ghostDropSheet,
  medusa: medusaSheet,
  mini_medusa: miniMedusaSheet,
  wheel: wheelSheet,
  centaur: centaurSheet,
  arrow: arrowSheet,
});
const bonfireViews = new BonfireViews(bonfireSheet, standing);
const shrineViews = new ShrineViews(shrines, shrineSheet, standing, game.maze, savedWorld?.shrines ?? []);
const boneField = new BoneField(seed, skeletonSheet, map, baseSpawn, square);
boneField.update();
boneField.placeForest(square, game.addForestBones);
const targetMarker = new TargetMarker();
const sunShadow = new Sprite({ tint: 0x000000 });
// The white ring under the enemy the player swings at on its own.
const focusRing = new Graphics();
// The blood the player loses when hit: stains on the floor, drops in the air.
const blood = new Blood();
// The dust kicked up walking, the player's and the enemies'.
const dust = new Dust();
// The weather (domain/weather.ts): drawn on the floor, in the air and in the
// sky. `?weather=rain` in the address forces one (`?weather=rain,clear`: one
// after the other, a spell each, to see the fronts go by).
const weather = new Weather(seed);
const forcedWeather = (new URLSearchParams(location.search).get("weather") ?? "")
  .split(",")
  .filter((k): k is WeatherKind => (WEATHER_KINDS as readonly string[]).includes(k));
weather.forced = forcedWeather;
const groundCover = new GroundCover();
groundCover.set(savedWorld?.weather);
// `&cover=0.8` with it: the floor already covered that much (to look at it).
const forcedCover = Number(new URLSearchParams(location.search).get("cover"));
if (forcedCover > 0) {
  groundCover.set({
    wet: forcedWeather.some((k) => k === "rain" || k === "storm") ? forcedCover : 0,
    snow: forcedWeather.includes("snow") ? forcedCover : 0,
    ash: forcedWeather.includes("ash") ? forcedCover : 0,
  });
}
const weatherFront = new Front();
const weatherGround = new WeatherGround();
const weatherAir = new WeatherAir();
const weatherSky = new WeatherSky(() => camera.shake(THUNDER_SHAKE_MS, THUNDER_SHAKE_PX));
let weatherNow: WeatherNow = weather.at(game.clockMs(), game.calendar().month);
let weatherSaid: WeatherKind | null = null;
let windSaid = false;
// The pit lies flat on the floor: nothing can stand on it, so it never hides
// anyone.
const pit = new Sprite(Texture.from(pitImage));
pit.position.set(pitBox.x, pitBox.y);
pit.setSize(pitBox.w, pitBox.h);
ground.addChild(maze.floor, pit, meadowGround, treeViews.ground, stumpViews.ground, weatherGround.view, boneField.view, blood.floor, dust.view, targetMarker.view, focusRing, sunShadow, jumpShadow);
standing.addChild(blood.air, airPuff);
world.addChild(weatherAir.view); // over everything standing
const forestGloom = new ForestGloom(square.forest, canvas.width, canvas.height);
const lighting = new Lighting(canvas.width, canvas.height);
const keyPrompt = createKeyPrompt();
const spearBar = new Graphics();
const spearFlash = new Sprite();
const spearFlashAnimator = new Animator(spearFlashSheet);
const playerBar = new PlayerBar();
const spearSprite = new Sprite();
standing.addChild(spearSprite);
const abilityEffects = new AbilityEffects();
const hud = new Hud();
const levelWave = new LevelWave(scene, canvas.width, canvas.height);
const levelAura = new LevelAura(levelAuraBehindSheet, levelAuraFrontSheet);
standing.addChild(levelAura.behind);
scene.addChild(weatherSky.veil, weatherSky.sunlight, forestGloom.view, lighting.view, bonfireViews.light, shrineViews.light, torchGlows.rightHand.view, torchGlows.leftHand.view, playerGlow.view, levelAura.front, weatherSky.flash);
app.stage.addChild(
  playerBar.view,
  keyPrompt,
  spearBar,
  spearFlash,
  abilityEffects.view,
  hud.view,
);
window.addEventListener("resize", () => {
  fitCanvas();
  camera.viewWidth = canvas.width;
  camera.viewHeight = canvas.height;
  forestGloom.resize(canvas.width, canvas.height);
  lighting.resize(canvas.width, canvas.height);
  levelWave.resize(canvas.width, canvas.height);
  cursor.setScale(screenScale);
  book.setScale(screenScale);
  minimap.setScale(screenScale);
});

function fitCanvas(): void {
  const areaWidth = gameEl.clientWidth;
  const areaHeight = gameEl.clientHeight;
  const scale = Math.max(1, Math.round(areaHeight / TARGET_VIEW_HEIGHT));
  screenScale = scale;
  // Round up and let the last partial pixel overflow (clipped by the area).
  const width = Math.ceil(areaWidth / scale);
  const height = Math.ceil(areaHeight / scale);
  app.renderer.resize(width, height);
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
}

const inventory = new Inventory(INVENTORY_SIZE);
const equipment = new Equipment();
const tabs = new SideTabs(
  panelEl,
  [
    { id: "technical", label: "Technical" },
    { id: "inventory", label: "Inventory" },
    { id: "skills", label: "Skills" },
  ],
  "technical",
);
const coreDebug = new CoreDebug(tabs.page("technical"));
const gameLog = new GameLog(tabs.page("technical"));
if (savedProgress) gameLog.log(`Progress loaded from this browser: level ${savedProgress.level}.`);
if (inTruce) gameLog.log("The square is almost safe today: only a stray enemy slips in through the gates. Gather what you can and get ready.");
showControlsHint(tabs.page("technical"));
// The cursor is read lazily: the mouse is set up further down.
const panelCursor = {
  get x() {
    return mouse.x;
  },
  get y() {
    return mouse.y;
  },
};
// An item dragged out of the panel and let go on the map: it is dropped
// where the cursor is (within reach).
canvas.addEventListener(VIRTUAL_MOUSEUP, () => {
  if (panel.dragging) dropHeld(true, cursorInWorld());
});
const crafting = new CraftingGrid();
// What the cursor carries between the inventory's squares (domain/hand.ts).
const hand = new CursorHand(inventory, equipment, crafting);
const panel = new InventoryPanel(tabs.page("inventory"), inventory, equipment, crafting, hand, sheets, panelCursor, {
  use: useItem,
  refused: (message) => gameLog.log(message),
  craft: () => {
    if (crafting.isCrafting) return;
    const recipe = crafting.start();
    if (!recipe) gameLog.log("Those items do not make anything.");
    else gameLog.log(`Making: ${ITEMS[recipe.result].name}...`);
  },
  cancelCraft: () => {
    if (!crafting.isCrafting) return;
    crafting.cancel();
    gameLog.log("Stopped crafting.");
  },
});
const upgradePanel = new UpgradePanel(tabs.page("skills"), (id) => {
  if (!game.upgrade(id)) return;
  saveCurrentProgress();
  upgradePanel.show(game.playerStats()); // also while paused, when update() does not run
  if (id === UPGRADE.DOUBLE_JUMP) gameLog.log("Double jump learned: press Space again in the air.");
});
if (savedWorld) {
  restoreBelongings(savedWorld);
  gameLog.log("You go on where you left off.");
} else {
  gameLog.log("You wake up at the base.");
}
// Saved every few seconds of play and when the page goes away (a reload).
const WORLD_SAVE_MS = 2000;
let worldSaveMs = 0;
window.addEventListener("pagehide", () => {
  saveGame();
});

// Mouse locked in the game; whenever it is released (Esc), the game pauses
// and the menu shows.
const pauseMenu = new PauseMenu(
  gameEl,
  (x, y) => mouse.lock(x, y),
  () => {
    // Everything from zero: a new maze from the base, level 1, no skills
    // (build level 1 too), nothing carried, the bosses back.
    clearWorld(CHARACTER_ID);
    clearProgress(CHARACTER_ID);
    startingOver = true; // or pagehide (or a level change) would save this game again
    location.reload();
  },
);
const mouse = new LockedMouse(canvas, (locked) => {
  if (locked) pauseMenu.hide();
  else {
    stowHand();
    pauseMenu.show();
  }
});
// Carrying an item from the inventory, a click on the map drops it there
// instead of swinging: all of it with the left button, one with the right.
mouse.onGamePress = (button) => {
  if (!hand.held || book.isOpen) return false;
  dropHeld(button === 0, cursorInWorld());
  return true;
};
const cursor = new CursorOverlay();
cursor.setScale(screenScale);

// The map book: picked up in the square, opened with M. While it is open the
// buttons draw (left) and erase (right) instead of moving and blocking.
const book = new MapBook(gameEl);
book.setScale(screenScale);
mouse.addPressSurface(book.element);
const shrineMenu = new ShrineMenu(gameEl, shrineSheet, travelTo);
const minimap = new Minimap(gameEl, map, square, savedWorld?.discovered ?? [], playerHead(playerSheet, "idle_front"));
minimap.setScale(screenScale);

// Abilities go straight to C. Held ones (run with Shift, block with the right
// button) are sent on press and release.
new AbilityKeys(
  window,
  () => mouse.locked,
  (ability) => {
    // Throwing the spear is not cut short: the last key pressed waits for it.
    if (spearThrow) queuedAbility = ability;
    else useAbility(ability);
  },
  (ability, held) => game.holdAbility(ability, held),
);
// An ability pressed while throwing the spear, used once the throw is over.
let queuedAbility: number | null = null;

function useAbility(ability: number): void {
  game.useAbility(ability);
}
let blocking = false;
let shieldHeld = false; // last told to C
let armorWorn = false;
let medusaWasAlive = true;

// Last point sent to C, only to draw the marker on the floor.
let target: { x: number; y: number } | null = null;
// W A S D keys held, and whether they were moving the player last frame.
const wasdHeld = new Set<string>();
let wasdMoving = false;
// The spear being aimed (ms: time held) or thrown (ms: time into its
// animation), and where it lands once it has let go.
let spearThrow: {
  phase: "aim" | "throw";
  ms: number;
  dirX: number; // where it is thrown (unit), fixed on release
  dirY: number;
  force?: number; // 0..1, the charge it was released with
  released?: boolean;
} | null = null;
// The spear in the air: from where the hand let it go to where it hits (an
// enemy) or ends its flight, at SPEAR_FLIGHT_SPEED. `thrown` once C did the
// throw, on arrival (an enemy hit then is carried on to the wall).
let flyingSpear: {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  ms: number;
  totalMs: number;
  dirX: number;
  dirY: number;
  force: number;
  thrown?: { enemy: number; x: number; y: number };
} | null = null;

// Copies the C grid when the maze changed. Returns true if it did.
function syncMaze(): boolean {
  const version = game.maze.version();
  if (version === mazeVersion) return false;
  mazeVersion = version;
  map.refill(game.maze.isWall, game.maze.isDoor);
  map.fillZones(game.maze.zone, game.maze.zoneWeight);
  map.refillLava(game.maze.isLava);
  return true;
}

function update(dtMs: number): void {
  // The player walks with W A S D only (the mouse aims).
  if (!spearThrow) walkWithKeys();
  // The right button covers (with a shield, walking slowly); the left one
  // throws the spear. One thing at a time: no covering while throwing,
  // jumping or in the middle of another action (it starts once that ends).
  const busy = spearThrow !== null || player.isJumping || player.isActing || player.isDead;
  const wantsBlock = mouse.rightHeld && !book.isOpen && (blocking || !busy) && spearThrow === null;
  if (wantsBlock !== blocking) {
    blocking = wantsBlock;
    game.holdAbility(ABILITY.BLOQUEAR, blocking);
  }
  const shield = equipment.items.some((item) => item.id === ITEMS.shield.id);
  if (shield !== shieldHeld) {
    shieldHeld = shield;
    game.setShield(shield);
  }
  const armor = equipment.slots.body !== null;
  if (armor !== armorWorn) {
    armorWorn = armor;
    game.setArmor(armor);
  }
  game.update(dtMs); // the C core moves the game one step
  if (syncMaze()) {
    boneField.update();
    maze.invalidate();
    addLoose(rockField.sync(true)); // the cells the growth carved get their rocks
  }
  updateMining(dtMs);
  updateChopping(dtMs);
  enemyAnimMs += dtMs; // drawn in draw(), also while paused
  blood.update(dtMs);
  kickUpDust(dtMs);
  updateWeather(dtMs);
  // Enemies that just died leave their loot.
  for (const enemy of game.enemies()) {
    const alive = STATE[enemy.state] !== "MUERTO";
    if (!alive && enemiesAlive.has(enemy.slot)) dropLoot(enemy);
    if (alive) enemiesAlive.add(enemy.slot);
    else enemiesAlive.delete(enemy.slot);
  }
  worldSaveMs += dtMs;
  if (worldSaveMs >= WORLD_SAVE_MS) {
    worldSaveMs = 0;
    saveGame();
  }
  // Crafting goes on with the game clock (it stops while paused).
  const crafted = crafting.update(dtMs);
  if (crafted) {
    if (inventory.add(crafted)) {
      gameLog.log(`Crafted: ${crafted.name}.`);
      if (crafted.structure) gameLog.log(`Double click the ${crafted.name.toLowerCase()} in the inventory to set it up in front of you.`);
    }
    else {
      dropAtFeet(crafted);
      gameLog.log(`Crafted: ${crafted.name}. The inventory is full: it is at your feet.`);
    }
  }

  // Gates: they close little by little at the end of the afternoon.
  const opening = game.maze.gateOpening();
  if (gateOpening === 1 && opening < 1) gameLog.log("The gates are closing!");
  if (gateOpening > 0 && opening === 0) gameLog.log("The gates are closed.");
  if (gateOpening === 0 && opening > 0) gameLog.log("The gates open.");
  gateOpening = opening;

  // Death, whatever the cause (a closing gate, an enemy...): the C core keeps
  // the player dead while the death animation plays, then respawns it.
  const stats = game.playerStats();
  if (stats.deaths > seenDeaths) {
    seenDeaths = stats.deaths;
    deathBannerMs = DEATH_BANNER_MS;
    target = null;
    gameLog.log(`You died. Delirium ${stats.delirium}.`);
  }
  deathBannerMs = Math.max(0, deathBannerMs - dtMs);
  // Hit by an enemy: a red flash, a jolt and blood on the floor.
  const burns = game.burns();
  if (lastLife >= 0 && stats.life < lastLife && !player.isDead) {
    hud.hurt();
    camera.shake(HURT_SHAKE_MS, HURT_SHAKE_PX);
    if (burns > seenBurns) {
      gameLog.log(`The lava burns you: -${lastLife - stats.life} life. Jump over it (Space).`);
    } else {
      blood.spill(player.x, player.y, PLAYER_BODY_HEIGHT, lastLife - stats.life);
      gameLog.log(`An enemy hits you: -${lastLife - stats.life} life.`);
    }
  }
  seenBurns = burns;
  const truce = game.truce();
  if (inTruce && !truce) gameLog.log("Dusk: from now on the enemies come into the square while the gates are open.");
  inTruce = truce;
  // A boss fight starts when the player walks into its room
  const fighting = game.bossFight();
  if (fighting >= 0 && bossInFight < 0) {
    const boss = game.enemies().find((e) => e.slot === fighting);
    if (boss) gameLog.log(`${BOSS_NAME[boss.boss] ?? "A boss"} wakes up: fight!`);
  }
  bossInFight = fighting;
  const defeated = game.bossesDefeated();
  if (defeated !== seenDefeated) {
    for (const [zone, name] of Object.entries(BOSS_NAME)) {
      if (defeated & ~seenDefeated & (1 << Number(zone))) gameLog.log(`${name} is defeated!`);
    }
    seenDefeated = defeated;
    saveGame();
  }
  const bonfiresOut = game.bonfiresOut();
  if (bonfiresOut !== seenBonfiresOut) {
    gameLog.log("The bonfire goes out. Nothing else will come out of it.");
    seenBonfiresOut = bonfiresOut;
    saveGame();
  }
  if (!heardTheScreams && game.bonfires().some((b) => !b.out && Math.hypot(b.x - player.x, b.y - player.y) < SCREAMS_HEARD_FROM)) {
    heardTheScreams = true;
    gameLog.log("They dance and scream around the fire, so as not to hear Zeus weep. Break it and nothing else comes out of it.");
  }
  lastLife = stats.life;
  // The core has already raised the level: the essence wraps the player
  // first, and the level up shows when it bursts.
  if (stats.level > seenLevel && !levelAura.wrapping) {
    levelBeforeAura = seenLevel;
    levelAura.start();
  }
  if (levelAura.update(dtMs)) {
    gameLog.log(`Level up! You are level ${stats.level}, fully healed: a point to spend in Skills (+).`);
    levelWave.start(player.x, playerCenterY());
    camera.shake(LEVEL_SHAKE_MS, LEVEL_SHAKE_PX);
  }
  levelWave.update(dtMs);
  if (stats.level !== seenLevel || stats.xp !== savedXp) saveCurrentProgress();
  seenLevel = stats.level;

  const expansions = game.clock().expansions;
  if (expansions > seenExpansions) {
    seenExpansions = expansions;
    growthBannerMs = GROWTH_BANNER_MS;
    gameLog.log("The maze grows.");
  }
  growthBannerMs = Math.max(0, growthBannerMs - dtMs);
  const medusaAlive = game.medusaLife() > 0;
  if (medusaWasAlive && !medusaAlive) gameLog.log("The medusa is dead.");
  medusaWasAlive = medusaAlive;
  const core = coreState();
  const cover = game.cover();
  // C swung on its own at an enemy: the swing faces it, not the cursor.
  const autoAttacked = cover.autoAttacks > seenAutoAttacks;
  seenAutoAttacks = cover.autoAttacks;
  const lookAt = mouse.overGame() && !book.isOpen ? cursorInWorld() : undefined;
  const wasDead = player.isDead;
  player.alert = cover.autoTarget >= 0;
  player.sync(core, dtMs, lookAt, core.y - PLAYER_BODY_HEIGHT / 2);
  if (player.justDoubleJumped) airPuffAt = { x: player.x, y: player.y - player.lift, ms: 0 };
  if (airPuffAt && (airPuffAt.ms += dtMs) >= AIR_PUFF_MS) airPuffAt = null;
  if (wasDead && !player.isDead) {
    camera.x = player.x; // respawned at the base: jump there instead of sliding
    camera.y = playerCenterY();
  }
  if (target && Math.hypot(target.x - player.x, target.y - player.y) <= TARGET_REACHED) {
    target = null;
  }
  book.update(mouse);
  showCoreDebug(core);
  const abilities = game.abilities();
  upgradePanel.show(stats);
  crafting.buildLevel = stats.buildLevel;
  abilityEffects.showAttacks = !equippedWeapon();
  for (const started of abilityEffects.update(abilities, dtMs)) {
    gameLog.log(started.name);
    const id = abilities.indexOf(started);
    if (id <= ABILITY.ATAQUE_CRITICO && !player.isDead) {
      mineAhead(); // with the pickaxe in hand, a rock in front takes the blow
      chopAhead(); // and with the axe, a tree
      // In the air it slashes with the legs tucked; the jump goes on after.
      const name = player.isJumping ? "jump_attack" : "attack";
      const ms = Math.max(MIN_SWING_MS, ATTACK_ACTIVE_MS[id] ?? MIN_SWING_MS);
      const towards =
        autoAttacked && id === ABILITY.ATAQUE_LIGERO ? directionFromVector(core.dirX, core.dirY) : undefined;
      player.startAction(name, ms, animationDurationMs(playerSheet, `${name}_right`), towards);
      playerAnimator.restart();
    }
    if (id === ABILITY.ULTI && !player.isDead && !player.isJumping) {
      player.startAction("slam", SLAM_MS, animationDurationMs(playerSheet, "slam_right"));
      playerAnimator.restart();
      slamImpactMs = SLAM_IMPACT_MS;
    }
  }
  pickUpItems(dtMs);
  updateSpearThrow(dtMs);
  updateFlyingSpear(dtMs);

  playerAnimator.play(player.animationTag, !player.isDead && !player.isActing);
  const jumpArtMs = player.jumpArtMs;
  if (spearThrow) playerAnimator.seek(spearThrow.phase === "aim" ? Math.min(spearThrow.ms, THROW_HOLD_MS) : spearThrow.ms);
  else if (jumpArtMs !== null && !player.isActing) playerAnimator.seek(jumpArtMs);
  else playerAnimator.update(dtMs, player.animationSpeed, player.animationReversed);
  if (slamImpactMs !== null) {
    slamImpactMs -= dtMs;
    if (slamImpactMs <= 0) {
      slamImpactMs = null;
      camera.shake(SLAM_SHAKE_MS, SLAM_SHAKE_PX);
    }
  }
  camera.updateShake(dtMs);
  for (const view of propViews) {
    view.animator?.update(dtMs);
    if (view.fall) {
      view.fall.ms -= dtMs;
      if (view.fall.ms <= 0) view.fall = undefined;
    }
  }
  const inView = {
    left: camera.x - canvas.width / 2,
    top: camera.y - canvas.height / 2,
    width: canvas.width,
    height: canvas.height,
  };
  plazaDeco.update(dtMs, inView);
  sheepViews.update(dtMs, game.sheep(), inView);
  flock.update(dtMs, player, inView, game.clock().daylight > DAYLIGHT_FOR_BIRDS);
  birdViews.update(dtMs, flock.birds);
  treeViews.update(dtMs);
  rockField.update(dtMs, {
    left: camera.x - canvas.width / 2,
    top: camera.y - canvas.height / 2,
    width: canvas.width,
    height: canvas.height + maze.wallHeight,
  });
  bushViews.update(dtMs, cover.bush);

  camera.follow(player.x, playerCenterY(), player.facing, dtMs);
  camera.clampTo(map.width, map.height, maze.wallHeight);
  fireAnimator.update(dtMs);
}

function pickUpItems(dtMs: number): void {
  const magnet = MAGNET_RADIUS + MAGNET_PER_LEVEL * (game.playerStats().upgrades[UPGRADE.REACH] ?? 0);
  propViews = propViews.filter((view) => {
    const { prop } = view;
    if (!prop.pickup?.pickupWalking || view.fall) return true;
    const far = Math.hypot(prop.x - player.x, prop.y - player.y);
    const near = far <= PICKUP_RADIUS;
    if (view.waitForLeave) {
      if (!near) view.waitForLeave = false;
      return true;
    }
    if (!near) {
      if (far <= magnet && !player.isDead && inventory.canAdd(prop.pickup) && clearPath(prop, player)) {
        pull(view, far, magnet, dtMs);
      }
      return true;
    }
    if (!inventory.add(prop.pickup)) return true; // full: leave it on the floor
    view.sprite.destroy();
    return false;
  });
}

// Moves an item on the floor towards the player's feet, `far` px away.
function pull(view: PropView, far: number, radius: number, dtMs: number): void {
  const closeness = 1 - far / radius; // 0 at the edge, 1 at the feet
  const speed = MAGNET_SPEED_MIN + (MAGNET_SPEED_MAX - MAGNET_SPEED_MIN) * closeness * closeness;
  const step = Math.min(far, (speed * dtMs) / 1000);
  view.prop.x += ((player.x - view.prop.x) / far) * step;
  view.prop.y += ((player.y - view.prop.y) / far) * step;
  view.sprite.zIndex = depthOf(view.prop.y, DEPTH.prop);
}

// No wall between two points on the floor (sampled every few px).
function clearPath(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
  const t = map.tileSize;
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (map.isWall(Math.floor(x / t), Math.floor(y / t))) return false;
  }
  return true;
}

// The nearest item on the floor that is picked up with E, if one is in reach.
function keyPickupInReach(): PropView | undefined {
  let nearest: PropView | undefined;
  let nearestDistance = KEY_PICKUP_RADIUS;
  for (const view of propViews) {
    if (!view.prop.pickup || view.prop.pickup.pickupWalking || view.fall) continue;
    const d = Math.hypot(view.prop.x - player.x, view.prop.y - player.y);
    if (d <= nearestDistance) {
      nearest = view;
      nearestDistance = d;
    }
  }
  return nearest;
}

function fruitInReach(): number | null {
  return bushViews.fruitInReach(player.x, player.y, FRUIT_REACH);
}

// E: picks the fruit of the bush in reach. False when there is none.
function pickFruit(): boolean {
  const bush = fruitInReach();
  if (bush === null) return false;
  const item = ITEMS[FRUIT_ITEMS[bushViews.fruitKind(bush)]];
  if (!inventory.add(item)) {
    gameLog.log("The inventory is full.");
    return true;
  }
  bushViews.pick(bush);
  gameLog.log(`Picked: ${item.name}`);
  return true;
}

// E: picks up the item in reach. False when there is none.
function pickUpWithKey(): boolean {
  const view = keyPickupInReach();
  if (!view) return false;
  const item = view.prop.pickup!;
  // The spear always goes straight to the throwing hand, the right one (what
  // was there goes to the inventory, or to the floor if it is full).
  if (item.id === ITEMS.spear.id) {
    const old = equipment.put("rightHand", item);
    if (old && !inventory.add(old)) dropAtFeet(old);
  } else if (!inventory.add(item)) {
    gameLog.log("The inventory is full.");
    return true;
  }
  propViews = propViews.filter((v) => v !== view);
  view.sprite.destroy();
  if (view.pinnedEnemy !== undefined) game.unpin(view.pinnedEnemy);
  gameLog.log(`Picked up: ${item.name}`);
  if (item.id === ITEMS.map_book.id) gameLog.log("Press ` to open it and draw the maze.");
  if (item.id === ITEMS.spear.id) {
    const towards = directionFromVector(view.prop.x - player.x, view.prop.y - player.y);
    player.startAction("pickup", PICKUP_MS, animationDurationMs(playerSheet, "pickup_right"), towards);
    playerAnimator.restart();
    gameLog.log("The spear is in your right hand: hold the left button to aim, release to throw.");
  } else if (item.weapon) {
    // Turns to it and bends down to take it.
    const towards = directionFromVector(view.prop.x - player.x, view.prop.y - player.y);
    player.startAction("pickup", PICKUP_MS, animationDurationMs(playerSheet, "pickup_right"), towards);
    playerAnimator.restart();
    gameLog.log(`Double click the ${item.name.toLowerCase()} in the inventory to hold it.`);
  }
  return true;
}

// W A S D: walks that way (diagonals too) while held, and stops on release.
function walkWithKeys(): void {
  let dx = 0;
  let dy = 0;
  for (const code of wasdHeld) {
    dx += WASD[code][0];
    dy += WASD[code][1];
  }
  const len = Math.hypot(dx, dy);
  if (len > 0 && !book.isOpen) {
    target = null;
    game.setTarget(player.x + (dx / len) * WASD_AHEAD, player.y + (dy / len) * WASD_AHEAD);
    wasdMoving = true;
  } else if (wasdMoving) {
    game.setTarget(player.x, player.y);
    wasdMoving = false;
  }
}

function holdsSpear(): boolean {
  return equippedWeapon()?.id === ITEMS.spear.id;
}

// The cursor's direction from the body (unit), or null right over it.
function aimFromBody(): { x: number; y: number } | null {
  const aim = cursorInWorld();
  const dx = aim.x - player.x;
  const dy = aim.y - playerCenterY();
  const len = Math.hypot(dx, dy);
  return len < 1 ? null : { x: dx / len, y: dy / len };
}

// Right button with the spear: held, it winds up and aims at the cursor;
// released once charged, it throws. At THROW_RELEASE_MS the spear leaves the
// hand and flies (updateFlyingSpear); the body follows through after it.
function updateSpearThrow(dtMs: number): void {
  // Only dying (or losing the spear before letting it go) stops a throw.
  if (spearThrow && (player.isDead || (!spearThrow.released && !holdsSpear()))) {
    if (player.animationTag.startsWith("throw_")) player.endAction();
    endThrow();
  }
  if (!spearThrow) {
    const canAim = holdsSpear() && !player.isDead && !player.isActing && !player.isJumping && !blocking;
    if (!(mouse.held && canAim && mouse.overGame() && !book.isOpen)) return;
    const aim = aimFromBody();
    if (!aim) return;
    target = null;
    game.setTarget(player.x, player.y);
    const artMs = animationDurationMs(playerSheet, "throw_right");
    player.startAction("throw", Number.POSITIVE_INFINITY, artMs, directionFromVector(aim.x, aim.y));
    playerAnimator.restart();
    spearThrow = { phase: "aim", ms: 0, dirX: aim.x, dirY: aim.y };
    game.setThrowing(true);
    return;
  }
  spearThrow.ms += dtMs;
  if (spearThrow.phase === "aim") {
    const aim = aimFromBody();
    if (aim) player.turnAction(directionFromVector(aim.x, aim.y));
    if (mouse.held) return;
    if (!aim) {
      player.endAction(); // the cursor on the body: nowhere to throw it
      endThrow();
      return;
    }
    const force = spearCharge(spearThrow.ms);
    spearThrow = { phase: "throw", ms: THROW_HOLD_MS, dirX: aim.x, dirY: aim.y, force };
    return;
  }
  if (!spearThrow.released && spearThrow.ms >= THROW_RELEASE_MS) {
    spearThrow.released = true;
    equipment.take("rightHand"); // it is in the air now, not in the hand
    const { dirX, dirY, force = 1 } = spearThrow;
    const aim = game.throwSpear(dirX, dirY, force, true); // where it is going to hit
    const hit = aim.enemy >= 0;
    launchSpear(
      { x: player.x + dirX * SPEAR_HAND_AHEAD, y: player.y + dirY * SPEAR_HAND_AHEAD, z: SPEAR_HAND_HEIGHT },
      { x: aim.hitX, y: aim.hitY, z: hit ? SPEAR_HIT_HEIGHT : 0 },
      dirX,
      dirY,
      force,
    );
  }
  if (spearThrow.ms < animationDurationMs(playerSheet, "throw_right")) return;
  player.endAction();
  endThrow();
}

// The throw is over (or called off): the body is free again, and what was
// pressed meanwhile goes now.
function endThrow(): void {
  spearThrow = null;
  game.setThrowing(false);
  const ability = queuedAbility;
  queuedAbility = null;
  if (ability !== null && !player.isDead) useAbility(ability);
}

function launchSpear(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  dirX: number,
  dirY: number,
  force: number,
): void {
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  flyingSpear = { from, to, ms: 0, totalMs: (far / SPEAR_FLIGHT_SPEED) * 1000, dirX, dirY, force };
}

// How much the bar charged after `ms` aiming (0..1).
function spearCharge(ms: number): number {
  return Math.min(1, ms / SPEAR_CHARGE_MS);
}

// Moves the spear in the air. On arrival C does the throw: an enemy still in
// its way dies (carried to the wall, see EnemyViews); if it moved away the
// spear flies on to where it ends up. Then it sticks there, to be picked up.
function updateFlyingSpear(dtMs: number): void {
  if (!flyingSpear) return;
  flyingSpear.ms += dtMs;
  if (flyingSpear.ms < flyingSpear.totalMs) return;
  const { to, dirX, dirY, force } = flyingSpear;
  if (!flyingSpear.thrown) {
    const thrown = game.throwSpear(dirX, dirY, force);
    gameLog.log(thrown.enemy >= 0 ? "The spear hits!" : "The spear misses.");
    if (thrown.enemy < 0 && Math.hypot(thrown.x - to.x, thrown.y - to.y) > 2) {
      launchSpear(to, { x: thrown.x, y: thrown.y, z: 0 }, dirX, dirY, force);
      flyingSpear.thrown = thrown;
      return;
    }
    flyingSpear.thrown = thrown;
  }
  const { enemy, x, y } = flyingSpear.thrown;
  flyingSpear = null;
  propViews.push(
    addProp(
      {
        sprite: ITEMS.spear.sprite,
        frame: stuckFrame(throwDirIndex(dirX, dirY)),
        x: Math.round(x),
        y: Math.round(y),
        pickup: ITEMS.spear,
      },
      false,
      { pinnedEnemy: enemy >= 0 ? enemy : undefined },
    ),
  );
}

// A white ring on the floor around the enemy the player is about to swing at
// on its own (C focuses one at a time), unless it is out of sight in a bush.
function showFocusRing(enemies: EnemyState[], cover: PlayerCover): void {
  const focus = enemies.find((e) => e.slot === cover.autoTarget);
  focusRing.visible = focus !== undefined && (focus.bush < 0 || focus.bush === cover.bush);
  if (!focus || !focusRing.visible) return;
  const pulse = 1 + 0.08 * Math.sin(performance.now() / 150);
  focusRing
    .clear()
    .ellipse(Math.round(focus.x), Math.round(focus.y), FOCUS_RING_RX * pulse, FOCUS_RING_RY * pulse)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.9 });
}

// The spear in the air, level, pointing where it flies.
function showFlyingSpear(): void {
  spearSprite.visible = flyingSpear !== null;
  if (!flyingSpear) return;
  const { from, to, ms, totalMs, dirX, dirY } = flyingSpear;
  const p = totalMs > 0 ? Math.min(1, ms / totalMs) : 1;
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  const z = from.z + (to.z - from.z) * p;
  const frame = sheets.get(ITEMS.spear.sprite)!.frames[flightFrame(throwDirIndex(dirX, dirY))];
  placeFrame(spearSprite, frame, x, y - z + frame.h / 2); // the frame has the spear's middle at its centre
  spearSprite.zIndex = depthOf(y, DEPTH.prop);
}

// While aiming the spear, its charge under the feet: filling, then gold once
// full (the furthest throw). Screen space, like the key prompt.
function showSpearBar(): void {
  spearBar.visible = spearThrow?.phase === "aim";
  if (!spearThrow || !spearBar.visible) return;
  const [sx, sy] = worldToScreen(player.x, player.y + SPEAR_BAR_BELOW_FEET);
  const x = Math.round(sx - SPEAR_BAR_WIDTH / 2);
  const y = Math.round(sy);
  const charge = spearCharge(spearThrow.ms);
  const ready = charge === 1;
  spearBar
    .clear()
    .rect(x - 1, y - 1, SPEAR_BAR_WIDTH + 2, 4)
    .fill(0x1a1622)
    .rect(x, y, Math.round(SPEAR_BAR_WIDTH * charge), 2)
    .fill(ready ? SPEAR_BAR_READY : SPEAR_BAR_CHARGING);
}

// Time since the charge filled up, or null while it has not.
function spearReadyMs(): number | null {
  if (spearThrow?.phase !== "aim" || spearThrow.ms < SPEAR_CHARGE_MS) return null;
  return spearThrow.ms - SPEAR_CHARGE_MS;
}

// The star on the point of the charged spear: it bursts out once and stays
// twinkling. Screen space, so the dark of the night does not put it out.
function showSpearFlash(): void {
  const readyMs = spearReadyMs();
  spearFlash.visible = readyMs !== null;
  if (readyMs === null) return;
  const bursting = readyMs < SPEAR_FLASH_MS;
  spearFlashAnimator.play(bursting ? "destello" : "brillo");
  spearFlashAnimator.seek(bursting ? readyMs : (readyMs - SPEAR_FLASH_MS) % SPEAR_TWINKLE_MS);
  const frame = spearFlashAnimator.currentFrame();
  if (!frame) return;
  const [tipX, tipY] = spearTip[player.facing];
  const [x, y] = worldToScreen(player.x + tipX, player.y + PLAYER_FEET_PADDING - PLAYER_FLOOR_ABOVE_BOTTOM + tipY);
  placeFrame(spearFlash, frame, Math.round(x), Math.round(y) + frame.h / 2); // its middle is the point
}

// How much the spear shines: more as it charges, a white burst as it fills up,
// then a slow pulse.
function spearGlow(): number {
  if (spearThrow?.phase !== "aim") return 0;
  const readyMs = spearReadyMs();
  if (readyMs === null) return SPEAR_GLOW_CHARGING * spearCharge(spearThrow.ms);
  const pulse = SPEAR_GLOW_READY + SPEAR_GLOW_PULSE * Math.sin((readyMs / SPEAR_GLOW_PERIOD_MS) * 2 * Math.PI);
  return Math.max(pulse, 1 - readyMs / SPEAR_FLASH_MS);
}

// The weapon (or torch) in the right hand, the one that swings.
function equippedWeapon(): ItemKind | null {
  return equipment.slots.rightHand;
}

// Double click on an inventory slot: a potion is drunk, food is eaten, the map book opens,
// and what can be held or worn is put on (a weapon in a free hand, or in the
// right one).
function useItem(index: number): void {
  const item = inventory.slots[index]?.item;
  if (!item) return;
  if (item.id.startsWith("potion_")) {
    inventory.removeOne(index);
    game.heal(POTION_HEAL);
    gameLog.log(`You drink the ${item.name.toLowerCase()}: +${POTION_HEAL} life.`);
    return;
  }
  if (item.food !== undefined) {
    inventory.removeOne(index);
    game.heal(item.food);
    const name = item.name.toLowerCase();
    gameLog.log(item.food > 0 ? `You eat the ${name}: +${item.food} life.` : `The ${name} were poisonous: ${item.food} life.`);
    return;
  }
  if (item.id === "map_book") {
    book.toggle();
    return;
  }
  if (item.structure) {
    setUpStructure(index, item);
    return;
  }
  const slot = item.weapon ? (equipment.freeSlotFor(item) ?? "rightHand") : item.wear;
  if (!slot) {
    gameLog.log(`The ${item.name.toLowerCase()} cannot be used.`);
    return;
  }
  equipFrom(slot, index);
}

// Puts the item of inventory slot `index` on `slot` (what was there goes back
// to the inventory). Clicking a square with an item that does not fit there
// takes off what the square has instead.
function equipFrom(slot: EquipSlot, index: number): void {
  const item = inventory.slots[index]?.item;
  if (!item || !Equipment.fits(item, slot)) {
    if (item) gameLog.log(`The ${item.name.toLowerCase()} does not go there.`);
    else takeOff(slot);
    return;
  }
  inventory.removeOne(index);
  const old = equipment.put(slot, item);
  if (old && !inventory.add(old)) {
    // No room for what was there: undo.
    equipment.put(slot, old);
    inventory.add(item);
    gameLog.log("The inventory is full.");
    return;
  }
  gameLog.log(`Equipped: ${item.name}`);
}

function takeOff(slot: EquipSlot): void {
  const item = equipment.slots[slot];
  if (!item) return;
  if (!inventory.add(item)) {
    gameLog.log("The inventory is full.");
    return;
  }
  equipment.take(slot);
  gameLog.log(`Took off: ${item.name}`);
}

// The player in the inventory tab: idle facing the camera, with what the
// hands hold, at DOLL_SCALE times the sprite's size.
function paintDoll(now: number): void {
  const ctx = panel.doll.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, DOLL_WIDTH, DOLL_HEIGHT);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(DOLL_SCALE, 0, 0, DOLL_SCALE, 0, 0);
  const tag = "idle_front";
  const frames = playerSheet.animations.get(tag)!;
  const total = frames.reduce((sum, f) => sum + f.durationMs, 0);
  let t = now % total;
  let index = 0;
  while (t >= frames[index].durationMs) t -= frames[index++].durationMs;
  const draw = (sheet: SpriteSheet, x: number, y: number) => {
    drawFrame(ctx, sheet, sheet.animations.get(tag)![index], x, y);
  };
  const held = HANDS.filter((hand) => equipment.slots[hand]);
  const fx = (hand: Hand) => weaponFx.get(equipment.slots[hand]!.id)![hand];
  // The overlays are 128x128 with the body's canvas at (32, 32).
  for (const hand of held) draw(fx(hand).behind, -32, -32);
  draw(bodySheet(held.includes("rightHand"), held.includes("leftHand")), 0, 0);
  for (const hand of held) draw(fx(hand).front, -32, -32);
  for (const hand of held) {
    if (equipment.slots[hand]!.id !== ITEMS.torch.id) continue;
    const glow = torchGlows[hand];
    const c =
      glow.centerOf(torchFx[hand].front.animations.get(tag)![index]) ??
      glow.centerOf(torchFx[hand].behind.animations.get(tag)![index]);
    const fire = fireAnimator.currentFrame()!;
    if (!c) continue;
    ctx.drawImage(
      fireSheet.image,
      fire.x,
      fire.y,
      fire.w,
      fire.h,
      Math.round(c.cx - 32 - fire.w / 2),
      Math.round(c.cy - 32 + FIRE_BELOW_CENTER - FIRE_BASE_Y),
      fire.w,
      fire.h,
    );
  }
}

// The body with the right hand, the left one, both or none gripping.
function bodySheet(right: boolean, left: boolean): SpriteSheet {
  if (right && left) return armedBothSheet;
  if (right) return armedSheet;
  if (left) return armedLeftSheet;
  return playerSheet;
}

// Life, level and experience above the player's head, following it.
function showPlayerBar(): void {
  const [sx, sy] = worldToScreen(player.x, player.y - PLAYER_BODY_HEIGHT - PROMPT_ABOVE_HEAD);
  const stats = game.playerStats();
  playerBar.show(levelAura.wrapping ? { ...stats, level: levelBeforeAura } : stats, sx, sy);
}

// A key cap with an "E" above the player's bar while an item to pick up
// with E is in reach. Screen space, after the darkness, so it shows at night.
function showKeyPrompt(): void {
  keyPrompt.visible =
    keyPickupInReach() !== undefined ||
    fruitInReach() !== null ||
    structureInReach() !== undefined ||
    shrineInReach() !== undefined ||
    (holdsPickaxe() && rockInReach() !== null);
  if (!keyPrompt.visible) return;
  const [sx, sy] = worldToScreen(
    player.x,
    player.y - PLAYER_BODY_HEIGHT - PROMPT_ABOVE_HEAD - PLAYER_BAR_HEIGHT - PROMPT_ABOVE_HEAD,
  );
  const bob = Math.round(Math.sin(performance.now() / 250)); // 1 px up and down
  keyPrompt.position.set(Math.round(sx - KEY_PROMPT_SIZE / 2), Math.round(sy - KEY_PROMPT_SIZE) + bob);
}

// Leaves `item` on the floor at the player's feet.
function dropAtFeet(item: ItemKind): void {
  propViews.push(itemOnFloor(item, Math.round(player.x), Math.round(player.y), { waitForLeave: true }));
  gameLog.log(`No room in the inventory: the ${item.name.toLowerCase()} is on the floor.`);
}

// Takes one item out of an inventory slot and throws it on the floor ahead of
// the player. Where that is a wall or the pit, it falls at the feet.
// With `at` (an item dragged onto the map) it lands there, or as far that
// way as DROP_REACH; without it, just ahead of the player.
function dropItem(index: number, at?: { x: number; y: number }): void {
  const item = inventory.removeOne(index);
  if (!item) {
    gameLog.log("Nothing to drop in that slot.");
    return;
  }
  throwOnFloor(item, at);
  gameLog.log(`Dropped: ${item.name}`);
}

// Drops what the inventory's hand carries (all of it, or one) like dropItem.
function dropHeld(all: boolean, at?: { x: number; y: number }): void {
  const held = hand.held;
  if (!held) return;
  const count = all ? held.count : 1;
  for (let i = 0; i < count; i++) throwOnFloor(hand.takeOne()!, at, i > 0 ? DROP_SCATTER : 0);
  gameLog.log(`Dropped: ${held.item.name}${count > 1 ? ` ×${count}` : ""}`);
}

// What the hand carries back into the inventory (the game pauses); what does
// not fit falls at the feet.
function stowHand(): void {
  const left = hand.stow();
  for (let i = 0; i < (left?.count ?? 0); i++) throwOnFloor(left!.item, { x: player.x, y: player.y }, i > 0 ? DROP_SCATTER : 0);
  if (left) gameLog.log(`No room in the inventory: the ${left.item.name.toLowerCase()} is on the floor.`);
}

// Throws `item` on the floor ahead of the player, or towards `at` (within
// DROP_REACH), `scatter` px off at random (a stack dropped at once).
function throwOnFloor(item: ItemKind, at?: { x: number; y: number }, scatter = 0): void {
  const [dirX, dirY] = vectorOf(player.facing);
  let x = Math.round(player.x + dirX * DROP_AHEAD);
  let y = Math.round(player.y + dirY * DROP_AHEAD);
  if (at) {
    const far = Math.hypot(at.x - player.x, at.y - player.y);
    const k = far > DROP_REACH ? DROP_REACH / far : 1;
    x = Math.round(player.x + (at.x - player.x) * k);
    y = Math.round(player.y + (at.y - player.y) * k);
  }
  if (scatter > 0) {
    x += Math.round((Math.random() * 2 - 1) * scatter);
    y += Math.round((Math.random() * 2 - 1) * scatter * 0.6);
  }
  const t = map.tileSize;
  if (map.isWall(Math.floor(x / t), Math.floor(y / t)) || map.isPit(Math.floor(x / t), Math.floor(y / t))) {
    x = Math.round(player.x);
    y = Math.round(player.y);
  }
  propViews.push(
    itemOnFloor(item, x, y, {
      waitForLeave: true,
      fall: { fromX: player.x, fromY: player.y, ms: DROP_FALL_MS },
    }),
  );
  if (item.id === "map_book" && book.isOpen && !inventory.has("map_book")) book.toggle();
}

// The inventory as saved, with what the hand carries back in it (or, with no
// room, on `floor` at the feet).
function savedInventory(floor: FloorItem[]): (SavedItem | null)[] {
  const saved = inventory.slots.map((slot) => (slot ? { id: slot.item.id, count: slot.count } : null));
  const held = hand.held;
  if (!held) return saved;
  const stack = saved.find((s) => s?.id === held.item.id);
  const empty = saved.indexOf(null);
  if (stack) stack.count += held.count;
  else if (empty >= 0) saved[empty] = { id: held.item.id, count: held.count };
  else for (let i = 0; i < held.count; i++) floor.push({ id: held.item.id, x: Math.round(player.x), y: Math.round(player.y) });
  return saved;
}

// What a reload needs to go on from here (world-store.ts).
function snapshotWorld(): SavedWorld {
  const floor: FloorItem[] = propViews
    .filter((view) => view.prop.pickup)
    .map((view) => ({
      id: view.prop.pickup!.id,
      frame: view.prop.frame,
      x: view.prop.x,
      y: view.prop.y,
      bounce: view.bounce !== undefined || undefined,
    }));
  // A spear in the air is saved stuck where it was going.
  if (flyingSpear) {
    const at = flyingSpear.thrown ?? flyingSpear.to;
    const frame = stuckFrame(throwDirIndex(flyingSpear.dirX, flyingSpear.dirY));
    floor.push({ id: "spear", frame, x: Math.round(at.x), y: Math.round(at.y) });
  }
  const p = game.player();
  return {
    seed,
    clockMs: game.clockMs(),
    bossesDefeated: game.bossesDefeated(),
    bonfiresOut: game.bonfiresOut(),
    rocks: { broken: rockField.brokenIds, loose: LOOSE_VERSION },
    felledTrees: treeViews.felledIds,
    weather: groundCover.saved,
    shrines: shrineViews.awakeIds,
    discovered: minimap.foundKeys,
    structures: structures.map((s) => ({ id: s.item.id, x: s.x, y: s.y })),
    x: p.x,
    y: p.y,
    inventory: savedInventory(floor),
    selected: inventory.selected,
    equipment: Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, equipment.slots[slot]?.id ?? null])),
    crafting: crafting.cells.map((item) => item?.id ?? null),
    floor,
  };
}


// Puts back what the player carried, wore and had in the crafting grid.
function restoreBelongings(world: SavedWorld): void {
  world.inventory.forEach((saved, i) => {
    const item = saved && ITEMS[saved.id];
    if (item && i < inventory.slots.length && saved.count > 0) inventory.slots[i] = { item, count: saved.count };
  });
  inventory.version++;
  inventory.select(world.selected);
  for (const slot of EQUIP_SLOTS) {
    const item = ITEMS[world.equipment[slot] ?? ""];
    if (item && Equipment.fits(item, slot)) equipment.put(slot, item);
  }
  world.crafting.forEach((id, cell) => {
    const item = id ? ITEMS[id] : undefined;
    if (item) crafting.put(cell, item);
  });
}

// Dust behind the feet of whoever walks on the floor: the player (not in the
// air) and the enemies alive and out of the bushes.
function kickUpDust(dtMs: number): void {
  dust.track("player", player.x, player.y, !player.isDead && player.lift === 0, dtMs);
  const seen = new Set(["player"]);
  for (const e of game.enemies()) {
    const key = `enemy${e.slot}`;
    seen.add(key);
    const walks = (e.kind === "spartan" || e.kind === "skeleton" || e.kind === "wheel") && !e.lying;
    dust.track(key, e.x, e.y, walks && STATE[e.state] !== "MUERTO" && e.pinned === null && e.bush < 0, dtMs);
  }
  dust.keep(seen);
  dust.update(dtMs);
}

// Updates what the stage shows from the game state, then renders it.
function draw(): void {
  // Side panel, also while paused (the inventory is still usable).
  panel.update();
  paintDoll(performance.now());
  // World space.
  camera.apply(world);
  const view: View = {
    left: camera.x - canvas.width / 2,
    top: camera.y - canvas.height / 2,
    width: canvas.width,
    height: canvas.height,
  };
  const cover = game.cover();
  const enemies = game.enemies();
  maze.show(view, playerBody(), game.maze.gateLeaves(), hiddenThings(enemies, cover));
  treeViews.show(playerBody());
  enemyViews.show(enemies.filter((e) => e.kind === "spartan"), enemyAnimMs, cover.bush);
  spectreViews.show(enemies.filter((e) => e.kind !== "spartan" && e.kind !== "bonfire"), game.shots(), enemyAnimMs);
  bonfireViews.update(enemyAnimMs, game.bonfires(), view, worldToScreen, game.clock().daylight);
  shrineViews.update(enemyAnimMs, worldToScreen);
  showMinimap(enemies);
  showFocusRing(enemies, cover);
  enemyAnimMs = 0;
  targetMarker.show(target, performance.now());
  const pinned = new Set(enemies.filter((e) => e.pinned).map((e) => e.slot));
  const viewHalfW = canvas.width / 2 + 96;
  const viewHalfH = canvas.height / 2 + 96;
  pickupHalos.begin();
  for (const v of propViews) {
    // Far off screen (hundreds of pebbles lie around the maze): just hidden
    if (Math.abs(v.prop.x - camera.x) > viewHalfW || Math.abs(v.prop.y - camera.y) > viewHalfH) {
      v.sprite.visible = false;
      continue;
    }
    const frame = showProp(v);
    if (v.pinnedEnemy !== undefined && pinned.has(v.pinnedEnemy)) v.sprite.visible = false;
    if (frame) pickupHalos.add(v.sheet, frame, v.sprite, haloStrength(v));
  }
  pickupHalos.end();
  showFlyingSpear();
  showPlayer(cover.hidden ? HIDDEN_ALPHA : 1);
  levelAura.show(player.x, playerCenterY() - player.lift, world.x, world.y, depthOf(player.y, DEPTH.player) - 1e-3);

  // Screen space.
  const [dirX, dirY] = vectorOf(player.facing);
  const [lightX, lightY] = worldToScreen(player.x, playerCenterY());
  forestGloom.update(-world.x, -world.y, performance.now());
  const daylight = game.clock().daylight;
  const sky = weatherView();
  weatherFront.set(weatherNow, sky, performance.now());
  weatherGround.show(groundCover, weatherNow, weatherFront, daylight, sky, performance.now());
  weatherSky.show(weatherNow, weatherFront, daylight, sky);
  weatherAir.draw();
  // The clouds take some of the daylight.
  lighting.setDaylight(daylight * (1 - weatherNow.overcast * OVERCAST_DIM));
  // A torch in either hand widens the light, flickering.
  const torchLight = equipment.items.find((i) => i.light)?.light;
  const flicker = torchFlicker(performance.now());
  const light = torchLight ?? BARE_LIGHT;
  const flickerScale = torchLight ? 0.92 + 0.08 * flicker : 1;
  lighting.innerRadius = light.inner * flickerScale;
  lighting.outerRadius = light.outer * flickerScale;
  lighting.update(lightX, lightY, dirX, dirY);
  showTorchGlow(flicker);
  showPlayerGlow(); // over the darkness: it is the player's own light
  blood.draw();
  dust.draw();
  showPlayerBar();
  showKeyPrompt();
  showSpearBar();
  showSpearFlash();
  showAbilityEffects();
  levelWave.show(worldToScreen);
  hud.showHurtFlash();
  hud.showClock(game.clock(), game.calendar(), gateOpening, canvas.width, canvas.height, performance.now());
  hud.showBanners(growthBannerMs, deathBannerMs, DEATH_BANNER_MS, canvas.width, canvas.height);
  const boss = bossInFight >= 0 ? enemies.find((e) => e.slot === bossInFight && e.life > 0) : undefined;
  hud.showBoss(
    boss ? { name: BOSS_NAME[boss.boss] ?? "Boss", life: boss.life, lifeMax: boss.lifeMax } : null,
    canvas.width,
  );
  cursor.setShape(book.isOpen && mouse.isOver(book.element) ? (mouse.rightHeld ? "eraser" : "pencil") : "arrow");
  cursor.update(mouse.locked, mouse.x, mouse.y);
  app.render();
}

// What the camera sees, world px.
function weatherView(): SkyView {
  return { left: -world.x, top: -world.y, width: canvas.width, height: canvas.height };
}

// The weather moves on with the game clock; what falls piles up on the floor.
function updateWeather(dtMs: number): void {
  weatherNow = weather.at(game.clockMs(), game.calendar().month);
  const daylight = game.clock().daylight;
  groundCover.update(dtMs, weatherNow, daylight);
  weatherGround.update(dtMs, weatherNow);
  weatherFront.set(weatherNow, weatherView(), performance.now());
  weatherAir.update(dtMs, weatherNow, weatherFront, groundCover, weatherView(), daylight);
  weatherSky.update(dtMs, weatherNow);
  if (weatherNow.kind !== weatherSaid) {
    if (weatherSaid !== null) gameLog.log(WEATHER_SAYS[weatherNow.kind]);
    weatherSaid = weatherNow.kind;
  }
  const windy = weatherNow.wind > WINDY;
  if (windy && !windSaid) gameLog.log("The wind picks up.");
  windSaid = windy ? true : weatherNow.wind < WINDY * 0.7 ? false : windSaid;
}

function showControlsHint(root: HTMLElement): void {
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "W A S D: move · Right button: cover (with a shield you walk slowly) · Spear in the right hand: hold the left button to aim (the bar under the feet charges: the fuller, the further), release to throw · `: map book (left draws, right erases) · 1-9 or click a slot: select · X: drop one · E on anything on the floor: pick it up (coins just by walking over them) · E on a shrine: wake it up, or pick one awake to travel to · Inventory tab: click a square to pick up what it has and click another to lay it there (right click: half a stack, or lay one), click the map to drop it, double click to use or hold · Next to an enemy: swings at it on its own, one at a time (white ring) · C: support · V: parry · Space: jump (twice in the air with the double jump, Skills tab) · R: punch the ground · G: test gates · Esc: menu";
  root.appendChild(hint);
}

// The world point under the virtual cursor.
function cursorInWorld(): { x: number; y: number } {
  const p = mouse.inCanvas();
  return {
    x: p.x + camera.x - canvas.width / 2,
    y: p.y + camera.y - canvas.height / 2,
  };
}

function showCoreDebug(core: ReturnType<typeof coreState>): void {
  const clock = game.clock();
  const moon = game.calendar();
  const sent = target ? `${target.x.toFixed(1)}, ${target.y.toFixed(1)}` : "-";
  const inC = game.targetInC();
  coreDebug.show([
    ["fps", fps.toFixed(0)],
    ["mouse", mouse.held ? "held" : "-"],
    ["destino enviado", sent],
    ["destino en C", inC ? `${inC.x.toFixed(1)}, ${inC.y.toFixed(1)}` : "-"],
    ["posicion", `${core.x.toFixed(1)}, ${core.y.toFixed(1)}`],
    ["dir", `${core.dirX.toFixed(2)}, ${core.dirY.toFixed(2)}`],
    ["estado", core.state],
    ["reloj", `dia ${clock.day} · ${clock.phase} · faltan ${formatMs(clock.phaseLeftMs)}`],
    ["luz", clock.daylight.toFixed(2)],
    ["luna", `t ${moon.t} · ${moon.hudText} · ${moon.dayName}`],
    ["luminosidad", `${moon.luminosity.toFixed(2)} · ${moon.waxing ? "creciente" : "menguante"} · frame ${moon.frame}`],
    ["barco", moon.daysUntilShip === 0 ? "llega hoy" : `faltan ${moon.daysUntilShip} dias`],
    ["puertas", `${Math.round(gateOpening * 100)}% abiertas`],
    ["muertes", `${game.playerStats().deaths} · delirio ${game.playerStats().delirium}`],
    ["compuertas", clock.gatesOpen ? "ABIERTAS" : "cerradas"],
    ["expansiones", String(clock.expansions)],
    ["proxima", clock.nextExpansionMs < 0 ? "no crece mas" : formatMs(clock.nextExpansionMs)],
    ["semilla", String(seed)],
    [
      "clima",
      `${weatherNow.kind} · viento ${weatherNow.wind.toFixed(2)} · frente ${Math.round(weatherNow.front * 100)}%`,
    ],
    [
      "suelo",
      `charcos ${groundCover.wet.toFixed(2)} · nieve ${groundCover.snow.toFixed(2)} · ceniza ${groundCover.ash.toFixed(2)}`,
    ],
  ]);
}

// `alpha`: below 1 while hidden in a bush.
function showPlayer(alpha: number): void {
  const frame = playerAnimator.currentFrame();
  const floorY = player.y + PLAYER_FEET_PADDING;
  const feetY = floorY - player.lift;
  const depth = depthOf(player.y, DEPTH.player);
  playerSprite.visible = frame !== null;
  playerSprite.zIndex = depth;
  playerSprite.alpha = alpha;
  for (const sprite of [
    weaponFxFront,
    weaponFxBehind,
    spearGlowFront,
    spearGlowBehind,
    leftFxFront,
    leftFxBehind,
    dirtFront,
    dirtBehind,
    fireSprites.rightHand,
    fireSprites.leftHand,
  ]) {
    sprite.visible = false;
    sprite.alpha = alpha;
  }
  sunShadow.visible = false;
  jumpShadow.visible = player.lift > 0;
  jumpShadow.position.set(Math.round(player.x), Math.round(player.y));
  jumpShadow.scale.set(1 - player.lift / 80);
  airPuff.clear();
  if (airPuffAt) {
    const p = airPuffAt.ms / AIR_PUFF_MS;
    airPuff
      .ellipse(Math.round(airPuffAt.x), Math.round(airPuffAt.y), Math.round(6 + 10 * p), Math.round(2 + 3 * p))
      .stroke({ color: 0xffffff, width: 1, alpha: 0.8 * (1 - p) });
    airPuff.zIndex = depthOf(airPuffAt.y, DEPTH.player) - 1e-3; // behind the body
  }
  if (!frame) return;
  // Hands holding something. Bending down to pick something up, the right
  // hand reaches for the floor: what it holds is hidden until it is back.
  const picking = player.animationTag.startsWith("pickup_");
  const held = player.isDead ? [] : HANDS.filter((hand) => equipment.slots[hand] && !(picking && hand === "rightHand"));
  const body = playerAnimator.frameIn(bodySheet(held.includes("rightHand"), held.includes("leftHand")));
  placeFrame(playerSprite, body, player.x, feetY);
  showSunShadow(body, floorY);
  const overlays: [Sprite, SpriteSheet, number][] = [];
  for (const hand of held) {
    const fx = weaponFx.get(equipment.slots[hand]!.id)![hand];
    const [front, behind] = hand === "rightHand" ? [weaponFxFront, weaponFxBehind] : [leftFxFront, leftFxBehind];
    overlays.push([front, fx.front, 1e-7], [behind, fx.behind, -1e-7]);
  }
  if (player.animationTag.startsWith("slam_")) {
    overlays.push([dirtFront, dirtFrontSheet, 2e-7], [dirtBehind, dirtBehindSheet, -2e-7]);
  }
  for (const [sprite, sheet, offset] of overlays) {
    sprite.visible = true;
    placeFrame(sprite, playerAnimator.frameIn(sheet), player.x, feetY);
    sprite.zIndex = depth + offset;
  }
  const glow = spearGlow();
  if (glow > 0 && held.includes("rightHand")) {
    const fx = weaponFx.get(ITEMS.spear.id)!.rightHand;
    for (const [sprite, sheet, offset] of [
      [spearGlowFront, fx.front, 1.2e-7],
      [spearGlowBehind, fx.behind, -0.8e-7],
    ] as const) {
      sprite.visible = true;
      sprite.alpha = alpha * glow;
      placeFrame(sprite, playerAnimator.frameIn(sheet), player.x, feetY);
      sprite.zIndex = depth + offset;
    }
  }
  for (const hand of held) {
    if (equipment.slots[hand]!.id === ITEMS.torch.id) showFire(hand, feetY, depth);
  }
}

// The fire on the flame of the torch in `hand`, in front of the body or
// behind it like the torch. The overlays are 128x128, centered on the player,
// their bottom on the feet.
function showFire(hand: Hand, feetY: number, depth: number): void {
  const fireSprite = fireSprites[hand];
  for (const [sheet, offset] of [
    [torchFx[hand].front, 1.5e-7],
    [torchFx[hand].behind, -0.5e-7],
  ] as const) {
    const c = torchGlows[hand].centerOf(playerAnimator.frameIn(sheet));
    if (!c) continue;
    const fire = fireAnimator.currentFrame()!;
    fireSprite.texture = fire.texture;
    fireSprite.position.set(
      Math.round(player.x - 64 + c.cx - fire.w / 2),
      Math.round(feetY - 128 + c.cy + FIRE_BELOW_CENTER - FIRE_BASE_Y),
    );
    fireSprite.zIndex = depth + offset;
    fireSprite.visible = true;
    return;
  }
}

// The body's silhouette lying on the floor from the feet, away from the sun.
// In the air it moves off the feet along the same direction.
function showSunShadow(body: Frame, floorY: number): void {
  const { sun, daylight } = game.clock();
  if (sun < 0 || daylight <= 0 || player.isDead) return;
  const height = sun * Math.PI; // 0 dawn, PI/2 noon, PI dusk
  const elevation = Math.sin(height);
  const h = body.h - PLAYER_FEET_PADDING;
  // Where the top of the head falls, from the feet. The sun crosses the sky in
  // front of the camera (south), east to west: the shadow points away, up the
  // screen, and swings from the left (morning) to the right (evening).
  const tipX = -Math.cos(height) * h * SUN_SHADOW_LOW * (1 - 0.5 * elevation);
  const tipY = -h * (SUN_SHADOW_NOON + 0.2 * (1 - elevation));
  const lift = player.lift / h;
  sunShadow.texture = body.texture;
  sunShadow.anchor.set(body.anchorX / body.w, 1 - PLAYER_FEET_PADDING / body.h);
  // Maps the sprite's up axis (y = -h at the head) onto the tip vector.
  sunShadow.setFromMatrix(
    new Matrix(
      1,
      0,
      -tipX / h,
      -tipY / h,
      Math.round(player.x + tipX * lift),
      Math.round(floorY - PLAYER_FEET_PADDING + tipY * lift),
    ),
  );
  sunShadow.alpha = SUN_SHADOW_ALPHA * daylight;
  sunShadow.visible = true;
}

function showAbilityEffects(): void {
  const [dirX, dirY] = vectorOf(player.facing);
  const x = player.x + Math.round(canvas.width / 2 - camera.x);
  const feetY = player.y + Math.round(canvas.height / 2 - camera.y);
  abilityEffects.show(x, feetY, PLAYER_BODY_HEIGHT, dirX, dirY, performance.now());
}

// 0..1, uneven like a real flame.
function torchFlicker(now: number): number {
  return 0.55 + 0.25 * Math.sin(now / 90) + 0.2 * Math.sin(now / 37 + 1.3);
}

// The warm halo on the flame of a torch in each hand.
function showTorchGlow(flicker: number): void {
  const picking = player.animationTag.startsWith("pickup_");
  for (const hand of HANDS) {
    const glow = torchGlows[hand];
    if (equipment.slots[hand]?.id !== ITEMS.torch.id || player.isDead || (picking && hand === "rightHand")) {
      glow.show(null, 0, 0, 0);
      continue;
    }
    const feetY = player.y + PLAYER_FEET_PADDING - player.lift;
    const left = Math.round(player.x - 64) + Math.round(canvas.width / 2 - camera.x);
    const top = Math.round(feetY - 128) + Math.round(canvas.height / 2 - camera.y);
    const frame = playerAnimator.frameIn(torchFx[hand].front);
    const shown = glow.centerOf(frame) ? frame : playerAnimator.frameIn(torchFx[hand].behind);
    glow.show(shown, left, top, flicker);
  }
}

// Slow breath: dim -> bright -> dim, starting with the idle loop.
function showPlayerGlow(): void {
  const frame = playerAnimator.currentFrame();
  if (!frame) {
    playerGlow.show(null, 0, 0, 0);
    return;
  }
  const phase = (playerAnimator.motionTimeMs % BREATH_MS) / BREATH_MS;
  const breath = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0 -> 1 -> 0
  // Same spot placeFrame uses, through the same rounded camera offset.
  const left = Math.round(player.x - frame.anchorX) + Math.round(canvas.width / 2 - camera.x);
  const top =
    Math.round(player.y + PLAYER_FEET_PADDING - player.lift - frame.h) + Math.round(canvas.height / 2 - camera.y);
  playerGlow.show(frame, left, top, breath);
}

// Where the player's body is drawn, in world pixels.
// What a wall in front of it should let show a little: the enemies one can
// see (alive or dying, not inside a bush the player is not in) and the items
// lying on the floor. Bodies, world px, feet at the bottom.
function hiddenThings(enemies: EnemyState[], cover: PlayerCover): Box[] {
  const things: Box[] = [];
  for (const e of enemies) {
    if (e.kind === "bonfire" || e.lying || (e.bush >= 0 && e.bush !== cover.bush)) continue;
    const half = ENEMY_BODY_WIDTH / 2;
    things.push({ left: e.x - half, top: e.y - ENEMY_BODY_HEIGHT, right: e.x + half, bottom: e.y });
  }
  for (const { prop } of propViews) {
    if (!prop.pickup) continue;
    things.push({ left: prop.x - ITEM_BOX / 2, top: prop.y - ITEM_BOX, right: prop.x + ITEM_BOX / 2, bottom: prop.y });
  }
  return things;
}

function playerBody(): Box {
  return {
    left: player.x - PLAYER_BODY_WIDTH / 2,
    top: player.y - PLAYER_BODY_HEIGHT,
    right: player.x + PLAYER_BODY_WIDTH / 2,
    bottom: player.y,
  };
}

// Puts a prop on the floor, as a looping animation or as one fixed frame.
// `item` lying on the floor at (x, y) to be picked up: its floor frame, or
// its floor animation looping (a spinning coin).
// ---------------------------------------------------------------- structures

// What the player set up in the world (a workbench): solid, kept in the save.
interface Structure {
  item: ItemKind;
  x: number; // foot, world px
  y: number;
  sprite: Sprite;
}
const STRUCTURE_AHEAD = 40; // px in front of the player where it goes up
const STRUCTURE_REACH = 44; // px: E opens it from this close
const structures: Structure[] = [];
for (const saved of savedWorld?.structures ?? []) {
  const item = ITEMS[saved.id];
  if (item?.structure) addStructure(item, saved.x, saved.y);
}

function addStructure(item: ItemKind, x: number, y: number): void {
  const sprite = new Sprite();
  placeFrame(sprite, sheets.get(item.sprite)!.frames[item.frame], x, y);
  sprite.zIndex = depthOf(y, DEPTH.prop);
  standing.addChild(sprite);
  const { width, depth } = item.structure!;
  game.maze.addObstacle({ x: x - width / 2, y: y - depth, w: width, h: depth });
  structures.push({ item, x, y, sprite });
}

// Sets up the structure of inventory slot `index` in front of the player,
// where there is floor for it.
function setUpStructure(index: number, item: ItemKind): void {
  const [dx, dy] = vectorOf(player.facing);
  const x = Math.round(player.x + dx * STRUCTURE_AHEAD);
  const y = Math.round(player.y + dy * STRUCTURE_AHEAD + (dy < 0 ? -8 : 16));
  const t = map.tileSize;
  const half = item.structure!.width / 2;
  const blocked = [
    [x - half, y],
    [x + half, y],
    [x - half, y - item.structure!.depth],
    [x + half, y - item.structure!.depth],
  ].some(([px, py]) => {
    const col = Math.floor(px / t);
    const row = Math.floor(py / t);
    return map.isWall(col, row) || map.isDoor(col, row) || map.isLava(col, row) || map.isPit(col, row);
  });
  // Not on top of the player either
  const overPlayer = Math.abs(player.x - x) < half + 12 && player.y > y - item.structure!.depth - 12 && player.y - 12 < y;
  if (blocked || overPlayer) {
    gameLog.log(`No room for the ${item.name.toLowerCase()} there: face open floor.`);
    return;
  }
  inventory.removeOne(index);
  addStructure(item, x, y);
  gameLog.log(`You set up the ${item.name.toLowerCase()}. Press E next to it to craft.`);
  saveGame();
}

function structureInReach(): Structure | undefined {
  return structures.find((s) => Math.abs(s.x - player.x) < s.item.structure!.width / 2 + STRUCTURE_REACH / 2 &&
    Math.abs(s.y - player.y) < STRUCTURE_REACH);
}

// E next to a workbench: the crafting grid, in the Inventory tab.
// ---------------------------------------------------------------- shrines

const SHRINE_REACH = 52; // px from the feet to a shrine's
const SHRINE_ARRIVAL = 26; // px below its feet, where one arrives

function shrineInReach(): Shrine | undefined {
  return shrines.find((s) => Math.hypot(s.x - player.x, s.y - player.y) <= SHRINE_REACH);
}

// The book's shrine, just awake, lets the book go.
function giveBook(shrine: Shrine): void {
  const book = ITEMS.map_book;
  if (inventory.has(book.id) || propViews.some((v) => v.prop.pickup?.id === book.id)) return;
  const fall = { fromX: shrine.x, fromY: shrine.y - 40, ms: DROP_FALL_MS };
  propViews.push(itemOnFloor(book, shrine.x + 34, shrine.y + 22, { fall }));
}

// E on a shrine: wakes it up, or lists the ones awake to go to.
function useShrine(): boolean {
  const here = shrineInReach();
  if (!here) return false;
  if (!shrineViews.isAwake(here.id)) {
    shrineViews.wake(here.id);
    if (here.id === 0) {
      giveBook(here);
      gameLog.log("The shrine wakes up and lets the book go. Wake up the others with E: from any of them you can travel to the rest.");
    } else gameLog.log("The shrine wakes up. You can come back here.");
    saveGame();
    return true;
  }
  const awake = shrines.filter((s) => shrineViews.isAwake(s.id));
  if (awake.length > 1) shrineMenu.open(awake, here);
  else gameLog.log("No other shrine is awake yet.");
  return true;
}

// The places on the minimap: shrines, bonfires and the bosses alive.
function minimapMarks(enemies: EnemyState[]): Mark[] {
  const marks: Mark[] = shrines.map((s) => ({ key: `shrine${s.id}`, kind: shrineViews.isAwake(s.id) ? "shrine" : "shrine_asleep", x: s.x, y: s.y }));
  game.bonfires().forEach((b, i) => marks.push({ key: `bonfire${i}`, kind: b.out ? "bonfire_out" : "bonfire", x: b.x, y: b.y }));
  for (const e of enemies) {
    if (e.boss && STATE[e.state] !== "MUERTO") marks.push({ key: `boss${e.boss}`, kind: "boss", x: e.x, y: e.y });
  }
  return marks;
}

function showMinimap(enemies: EnemyState[]): void {
  const hunters = enemies.filter((e) => e.kind !== "bonfire" && !e.lying && !e.boss && STATE[e.state] !== "MUERTO");
  const view = { halfW: canvas.width / 2, halfH: canvas.height / 2 };
  if (minimap.update(enemyAnimMs, player, view, minimapMarks(enemies), hunters)) saveGame();
}

function travelTo(shrine: Shrine): void {
  game.teleport(shrine.x, shrine.y + SHRINE_ARRIVAL);
  camera.x = shrine.x;
  camera.y = shrine.y;
  gameLog.log(`The shrine takes you to the ${SHRINE_NAMES[shrine.id]}.`);
}

function useStructure(): boolean {
  const s = structureInReach();
  if (!s) return false;
  tabs.select("inventory");
  gameLog.log(`The ${s.item.name.toLowerCase()}: lay the items in the crafting grid (Inventory tab).`);
  return true;
}

// ---------------------------------------------------------------- rocks

const MINE_REACH = 34; // px from the feet to a rock's base
const MINE_HIT_DELAY_MS = 140; // the blow lands mid-swing
let pendingBlow: { rock: BigRock; ms: number } | null = null;
let pickaxeHintShown = false;

function holdsPickaxe(): boolean {
  return equippedWeapon()?.id === ITEMS.pickaxe.id;
}

function rockInReach(): BigRock | null {
  return player.isDead ? null : rockField.nearest(player.x, player.y, MINE_REACH);
}

// Pebbles on the floor, each with its own shape.
function addPebbles(pebbles: Pebble[], fall?: { fromX: number; fromY: number }): void {
  for (const p of pebbles) {
    const prop: Prop = { sprite: ITEMS.pebble.sprite, frame: p.variant, x: p.x, y: p.y, pickup: ITEMS.pebble };
    propViews.push(addProp(prop, false, fall ? { fall: { ...fall, ms: DROP_FALL_MS } } : {}));
  }
}

// The loose pebbles and fallen branches of newly placed cells.
function addLoose({ pebbles, branches }: { pebbles: Pebble[]; branches: Pebble[] }): void {
  addPebbles(pebbles);
  for (const b of branches) {
    const prop: Prop = { sprite: ITEMS.branch.sprite, frame: b.variant, x: b.x, y: b.y, pickup: ITEMS.branch };
    propViews.push(addProp(prop, false));
  }
}

// E next to a big rock: with the pickaxe in hand, a swing at it (the light
// attack, which also hits whoever is in front); without it, how to get one.
function mineWithKey(): void {
  const rock = rockInReach();
  if (!rock) return;
  if (!holdsPickaxe()) {
    if (!pickaxeHintShown) {
      gameLog.log("Too hard by hand: craft a stone pickaxe (3 pebbles across the top, 2 branches down the middle) and hold it.");
      pickaxeHintShown = true;
    }
    return;
  }
  game.useAbility(ABILITY.ATAQUE_LIGERO); // the swing comes back through the abilities, see mineAhead
}

// An attack just started: with the pickaxe, the rock in reach (if any) takes
// the blow halfway through the swing, and the player turns to it.
function mineAhead(): void {
  if (!holdsPickaxe() || pendingBlow) return;
  const rock = rockInReach();
  if (!rock) return;
  pendingBlow = { rock, ms: MINE_HIT_DELAY_MS };
}

function updateMining(dtMs: number): void {
  if (!pendingBlow) return;
  pendingBlow.ms -= dtMs;
  if (pendingBlow.ms > 0) return;
  const { rock } = pendingBlow;
  pendingBlow = null;
  const pebbles = rockField.hit(rock);
  camera.shake(90, 1);
  if (!pebbles) return;
  addPebbles(pebbles, { fromX: rock.x, fromY: rock.y - 10 });
  gameLog.log(`The rock breaks into ${pebbles.length} pebbles.`);
}

// ---------------------------------------------------------------- trees

const CHOP_REACH = 44; // px from the feet to a trunk's foot
let pendingChop: { id: number; ms: number } | null = null;

function holdsAxe(): boolean {
  return [equipment.slots.rightHand, equipment.slots.leftHand].some((item) => item?.id === ITEMS.axe.id);
}

function treeInReach(): number | null {
  return player.isDead ? null : treeViews.nearest(player.x, player.y, CHOP_REACH);
}

// An attack just started: with the axe, the tree in reach (if any) takes the
// blow halfway through the swing.
function chopAhead(): void {
  if (!holdsAxe() || pendingChop) return;
  const id = treeInReach();
  if (id !== null) pendingChop = { id, ms: MINE_HIT_DELAY_MS };
}

// Left click with the axe next to a tree: a swing at it, which comes back
// through the abilities (see chopAhead). Held down, it swings as often as the
// attack lets it.
function updateChopping(dtMs: number): void {
  if (mouse.held && mouse.overGame() && !book.isOpen && holdsAxe() && treeInReach() !== null) {
    game.useAbility(ABILITY.ATAQUE_LIGERO);
  }
  if (!pendingChop) return;
  pendingChop.ms -= dtMs;
  if (pendingChop.ms > 0) return;
  const felled = treeViews.hit(pendingChop.id);
  pendingChop = null;
  camera.shake(felled ? 220 : 90, felled ? 2 : 1);
  if (!felled) return;
  const logs = dropLogs(felled);
  gameLog.log(`The tree comes down: ${logs} logs.`);
  saveGame();
}

// The logs of a felled tree, falling from its crown around its foot. Returns
// how many.
function dropLogs(tree: { x: number; y: number }): number {
  let roll = Math.random();
  let k = 0;
  while (k < LOG_COUNTS.length - 1 && roll >= LOG_CHANCES[k]) roll -= LOG_CHANCES[k++];
  const count = LOG_COUNTS[k];
  const turn = Math.random() * Math.PI * 2;
  const t = map.tileSize;
  for (let i = 0; i < count; i++) {
    const angle = turn + (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.6;
    const far = LOG_SPREAD * (0.6 + Math.random() * 0.4);
    let x = Math.round(tree.x + Math.cos(angle) * far);
    let y = Math.round(tree.y + Math.sin(angle) * far * 0.6);
    if (map.isWall(Math.floor(x / t), Math.floor(y / t)) || map.isPit(Math.floor(x / t), Math.floor(y / t))) {
      x = Math.round(tree.x);
      y = Math.round(tree.y);
    }
    const prop: Prop = { sprite: ITEMS.log.sprite, frame: Math.floor(Math.random() * 2), x, y, pickup: ITEMS.log };
    const fall = { fromX: tree.x, fromY: tree.y - LOG_FALL_FROM, ms: DROP_FALL_MS };
    propViews.push(addProp(prop, false, { fall }));
  }
  return count;
}

function itemOnFloor(
  item: ItemKind,
  x: number,
  y: number,
  extra: Pick<PropView, "waitForLeave" | "fall" | "bounce"> = {},
): PropView {
  const prop: Prop = item.floorAnimation
    ? { sprite: item.sprite, animation: item.floorAnimation, x, y, pickup: item }
    : { sprite: item.sprite, frame: item.frame, x, y, pickup: item };
  return addProp(prop, item.floorAnimation !== undefined, extra);
}

// What an enemy had on it, thrown out of the body as it dies: its coins
// always, and now and then an item. Each lands a step away, around it.
function dropLoot(enemy: EnemyState): void {
  const drops: ItemKind[] = Array.from({ length: enemy.coins }, () => ITEMS.coin);
  const carried = lootItem(enemy.loot);
  if (carried) drops.push(carried);
  const weapon = enemy.weapon && enemy.dropsWeapon ? ITEMS[enemy.weapon] : null;
  if (weapon) drops.push(weapon);
  const turn = Math.random() * Math.PI * 2;
  drops.forEach((item, k) => {
    const angle = turn + (k * Math.PI * 2) / drops.length;
    let x = Math.round(enemy.x + Math.cos(angle) * LOOT_SPREAD);
    let y = Math.round(enemy.y + Math.sin(angle) * LOOT_SPREAD * 0.6);
    if (map.isWall(Math.floor(x / map.tileSize), Math.floor(y / map.tileSize))) {
      x = Math.round(enemy.x);
      y = Math.round(enemy.y);
    }
    propViews.push(itemOnFloor(item, x, y, { fall: { fromX: enemy.x, fromY: enemy.y - 16, ms: DROP_FALL_MS } }));
  });
  for (const item of [carried, weapon]) if (item) gameLog.log(`The enemy dropped: ${item.name}!`);
}

function lootItem(loot: EnemyState["loot"]): ItemKind | null {
  if (loot === "potion") return ITEMS[POTION_IDS[Math.floor(Math.random() * POTION_IDS.length)]];
  if (loot === "sword") return ITEMS.enemy_sword;
  if (loot === "branch") return ITEMS.branch;
  return null;
}

function addProp(
  prop: Prop,
  animated: boolean,
  extra: Pick<PropView, "waitForLeave" | "fall" | "pinnedEnemy" | "bounce"> = {},
): PropView {
  const sheet = sheets.get(prop.sprite)!;
  let animator: Animator | null = null;
  if (animated) {
    animator = new Animator(sheet);
    animator.play(prop.animation ?? DEFAULT_ANIMATION);
  }
  const sprite = new Sprite();
  sprite.zIndex = depthOf(prop.y, DEPTH.prop);
  standing.addChild(sprite);
  // What lands from a fall keeps bouncing.
  const bounce = extra.bounce ?? (extra.fall ? Math.random() * BOUNCE_EVERY_MS : undefined);
  return { prop, sheet, animator, sprite, ...extra, bounce };
}

// Draws a prop where it is; returns the frame it shows (null: none).
function showProp({ prop, sheet, animator, sprite, fall, bounce }: PropView): Frame | null {
  let { x, y } = prop;
  if (fall) {
    // From the hand to the floor in a hop: p goes 0 -> 1 while it falls.
    const p = 1 - fall.ms / DROP_FALL_MS;
    x = fall.fromX + (prop.x - fall.fromX) * p;
    y = fall.fromY + (prop.y - fall.fromY) * p - Math.sin(Math.PI * p) * DROP_HOP;
  } else if (bounce !== undefined) {
    y -= bounceHeight((performance.now() + bounce) % BOUNCE_EVERY_MS);
  }
  const frame = animator ? animator.currentFrame() : sheet.frames[prop.frame ?? 0];
  sprite.visible = frame !== null;
  if (frame) placeFrame(sprite, frame, x, y);
  return frame;
}

// px over the floor `t` ms into a bounce cycle: a hop, then a small one.
function bounceHeight(t: number): number {
  if (t >= BOUNCE_MS) return 0;
  const p = t / BOUNCE_MS;
  const FIRST = 0.65; // of the bounce taken by the first hop
  if (p < FIRST) return Math.sin((Math.PI * p) / FIRST) * BOUNCE_PX;
  return Math.sin((Math.PI * (p - FIRST)) / (1 - FIRST)) * BOUNCE_PX * 0.35;
}

// How bright the halo of an item picked up with E is (0: none): it grows as
// the player comes close, breathing slowly.
function haloStrength(view: PropView): number {
  const item = view.prop.pickup;
  if (!item || item.pickupWalking || view.fall || player.isDead) return 0;
  const d = Math.hypot(view.prop.x - player.x, view.prop.y - player.y);
  if (d > HALO_RADIUS) return 0;
  const near = d <= KEY_PICKUP_RADIUS ? 1 : HALO_DIM + (1 - HALO_DIM) * (1 - (d - KEY_PICKUP_RADIUS) / (HALO_RADIUS - KEY_PICKUP_RADIUS));
  const pulse = 0.8 + 0.2 * Math.sin((performance.now() / HALO_PULSE_MS) * Math.PI * 2);
  return near * pulse;
}

function coreState() {
  const p = game.player();
  return {
    ...p,
    state: STATE[p.state] ?? `unknown (${p.state})`,
    jumping: game.abilities()[ABILITY.SALTAR]?.active ?? false,
    jumps: p.jumps,
    blocking: game.abilities()[ABILITY.BLOQUEAR]?.active ?? false,
  };
}

// The camera centers on the body, not on the feet.
function playerCenterY(): number {
  return player.y - PLAYER_BODY_HEIGHT / 2;
}

function worldToScreen(x: number, y: number): [number, number] {
  return [x - camera.x + canvas.width / 2, y - camera.y + canvas.height / 2];
}

window.addEventListener("keydown", (e) => {
  if (shrineMenu.isOpen) {
    if (!e.repeat) shrineMenu.press(e.code);
    return;
  }
  if (e.code in WASD && mouse.locked) wasdHeld.add(e.code);
  if (e.code === "KeyE" && mouse.locked && !e.repeat && !pickUpWithKey() && !pickFruit() && !useStructure() && !useShrine()) mineWithKey();
  if (e.code === "KeyT") game.reset();
  if (isMapKey(e) && mouse.locked) {
    e.preventDefault();
    if (inventory.has("map_book")) book.toggle();
    else gameLog.log("You have no map. Press E on the shrine in the middle of the square.");
  }
  if (e.code === "KeyG") {
    game.testGates();
    target = null;
    player.sync(coreState(), 0);
    camera.x = player.x; // jump there instead of sliding across the square
    camera.y = playerCenterY();
    gameLog.log("Test: the gates are about to close.");
  }
  if (e.code === "KeyX" && mouse.locked) {
    if (hand.held) dropHeld(false);
    else dropItem(inventory.selected);
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit) inventory.select(Number(digit[1]) - 1);
});

window.addEventListener("keyup", (e) => wasdHeld.delete(e.code));
window.addEventListener("blur", () => wasdHeld.clear());

// The map book opens with ` (and M). On Spanish keyboards ` is a dead key:
// the browser reports it as "Dead" instead of "`", so that counts too.
function isMapKey(e: KeyboardEvent): boolean {
  return e.code === "Backquote" || e.key === "`" || e.key === "Dead" || e.code === "KeyM";
}

// Frames per second, averaged over half a second (shown in the C core panel).
let fps = 0;
let fpsFrames = 0;
let fpsSince = performance.now();

let last = performance.now();
function frame(now: number): void {
  // Cap the step so a background tab does not teleport the player.
  const dtMs = Math.min(now - last, 100);
  last = now;
  fpsFrames++;
  if (now - fpsSince >= 500) {
    fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;
  }
  if (mouse.locked && !shrineMenu.isOpen) update(dtMs); // paused while a menu is open
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
