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
import { directionFromVector, vectorOf } from "./domain/facing";
import { Equipment, type EquipSlot } from "./domain/equipment";
import { Inventory } from "./domain/inventory";
import {
  flightFrame,
  type ItemKind,
  ITEMS,
  SPEAR_FLIGHT_SPEED,
  stuckFrame,
  throwDirIndex,
} from "./domain/items";
import { ITEM_SPRITES, placeItems, type Prop, WEAPON_ITEMS } from "./domain/level-items";
import { Square } from "./domain/square";
import { placeSampleTree, sampleTrunkBox } from "./domain/sample-tree";
import { TileMap } from "./domain/tile-map";
import { ABILITY_KEY_LABEL, AbilityKeys } from "./infrastructure/input/ability-keys";
import { LockedMouse } from "./infrastructure/input/locked-mouse";
import { AbilityEffects } from "./infrastructure/render/ability-effects";
import { Animator } from "./infrastructure/render/animator";
import { BigTree, type BigTreeArt } from "./infrastructure/render/big-tree";
import { PlazaDeco } from "./infrastructure/render/plaza-deco";
import { BushViews } from "./infrastructure/render/bushes";
import { Camera } from "./infrastructure/render/camera";
import { CursorOverlay, TargetMarker } from "./infrastructure/render/cursor";
import { DEPTH, depthOf } from "./infrastructure/render/depth";
import { EnemyViews } from "./infrastructure/render/enemies";
import { FlameGlow } from "./infrastructure/render/flame-glow";
import { Glow } from "./infrastructure/render/glow";
import { createKeyPrompt, formatMs, Hud, KEY_PROMPT_SIZE } from "./infrastructure/render/hud";
import { Lighting } from "./infrastructure/render/lighting";
import { type Box, loadMazeTiles, MazeRenderer, type View } from "./infrastructure/render/maze-renderer";
import {
  animationDurationMs,
  DEFAULT_ANIMATION,
  drawFrame,
  type Frame,
  loadImage,
  loadSpriteSheet,
  placeFrame,
  type SpriteSheet,
} from "./infrastructure/render/sprite-sheet";
import { AbilityPanel } from "./infrastructure/ui/ability-panel";
import { CoreDebug } from "./infrastructure/ui/core-debug";
import { DOLL_HEIGHT, DOLL_SCALE, DOLL_WIDTH, InventoryPanel } from "./infrastructure/ui/inventory-panel";
import { GameLog } from "./infrastructure/ui/game-log";
import { SideTabs } from "./infrastructure/ui/side-tabs";
import { MapBook } from "./infrastructure/ui/map-book";
import { PauseMenu } from "./infrastructure/ui/pause-menu";
import { ABILITY, type EnemyState, loadGameWasm, type PlayerCover, STATE } from "./infrastructure/wasm/game-wasm";

// The canvas fills the whole game area. Its internal resolution adapts to the
// area so that it is always shown at an integer scale: every pixel the same
// size, nothing stretched. The scale aims at about TARGET_VIEW_HEIGHT pixels
// of world vertically; a bigger window shows a bit more of the maze.
const TARGET_VIEW_HEIGHT = 480;
// Empty rows under the feet in personaje_3's canvas; drawn lower so the feet
// land on the collision box.
const PLAYER_FEET_PADDING = 13;
// Drawn size of the player, for fading walls and the light position.
const PLAYER_BODY_WIDTH = 32;
const PLAYER_BODY_HEIGHT = 62;
const PICKUP_RADIUS = 22;
// Items picked up with E (branches): reach from the feet, and the key prompt
// shown above the head while one is in reach.
const KEY_PICKUP_RADIUS = 26;
const PROMPT_ABOVE_HEAD = 6;
// A dropped item lands this far ahead of the feet (past PICKUP_RADIUS), after
// a short hop out of the hand.
const DROP_AHEAD = 32;
const DROP_FALL_MS = 280;
const DROP_HOP = 16; // px of the hop's peak
const TARGET_REACHED = 4; // px: the floor marker hides when the player gets this close
// The player's eyes "breathe": one slow pulse every two idle loops
// (idle = 8 frames, 900 ms), in step with the idle movement.
const PLAYER_EYES: [number, number, number] = [251, 185, 84]; // #fbb954, Mushroom palette
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
// Throwing the spear (with it in the right hand): the right button held aims
// it, the body wound up (throw_* of art/personaje_3_build.py held at
// THROW_HOLD_MS) and turned to the cursor while a bar under the feet charges
// for SPEAR_CHARGE_MS. Released once charged it throws (the rest of the
// animation, letting go at THROW_RELEASE_MS); released before, it cancels.
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
// Hidden in a bush, the player is drawn see-through (League of Legends style).
const HIDDEN_ALPHA = 0.5;
type Hand = "rightHand" | "leftHand";
const HANDS: Hand[] = ["rightHand", "leftHand"];
const GROWTH_BANNER_MS = 2500; // "the maze grows" message on screen
const DEATH_BANNER_MS = 3000;
// Testing aid: F cycles the clock speed, to see dusk and night without waiting
// half an hour. Only the clock goes faster, not the movement.
const TIME_SPEEDS = [1, 60, 600];

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
  treeArt,
  flowerSheet,
  tallFlowerSheet,
  bushSheet,
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
  loadBigTreeArt(),
  loadSpriteSheet(`${BASE}sprites/flores`),
  loadSpriteSheet(`${BASE}sprites/flores_2`),
  // Bushes to hide in (art/arbusto.py).
  loadSpriteSheet(`${BASE}sprites/arbusto`),
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
const sheets = new Map<string, SpriteSheet>(assetNames.map((name, i) => [name, assetSheets[i]]));

// The maze comes from C: a random seed each game (shown in the panel, so a
// maze worth repeating can be reproduced).
const seed = Math.floor(Math.random() * 2 ** 31);
game.start(seed);
const map = new TileMap(game.maze.size, game.maze.size, game.maze.tileSize);
let mazeVersion = -1;
let growthBannerMs = 0;
let gateOpening = 1;
let seenExpansions = 0;
let seenDeaths = 0;
let lastLife = -1;
let enemyAnimMs = 0; // game time the enemies' animations have to catch up on
let seenAutoAttacks = 0; // swings C made on its own (an enemy got too close)
let deathBannerMs = 0;
let timeSpeed = 1;
syncMaze();

// The stage, back to front. The world moves with the camera: the ground lies
// flat under everything, and whatever stands sorts by depth (see depth.ts).
// Over it, in screen space: the light, the player's glow and the HUD.
const world = new Container();
const ground = new Container();
const standing = new Container({ sortableChildren: true });
world.addChild(ground, standing);
app.stage.addChild(world);

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
  // A spear in the body of this enemy (its slot), pinned to a wall: hidden
  // while the body shows it, and pulling it out drops the body.
  pinnedEnemy?: number;
}
const spawn = game.player();
const items = placeItems(map, spawn);
let propViews: PropView[] = items.map((prop) => addProp(prop, prop.frame === undefined));
const square = new Square(map, spawn);
// The big tree: its trunk is solid, C keeps it with the walls.
const tree = placeSampleTree(spawn);
game.maze.addObstacle(sampleTrunkBox(tree));
const bigTree = new BigTree(tree, treeArt);
standing.addChild(bigTree.view);
const plazaDeco = new PlazaDeco(tree.flowers, [flowerSheet, tallFlowerSheet], standing);
const bushViews = new BushViews(game.bushes(), bushSheet, standing);
// Fallen branches lie around the tree, each drawn with its own variant.
propViews.push(
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

const player = new Character();
player.sync(coreState(), 0);
const playerAnimator = new Animator(playerSheet);
playerAnimator.play(player.animationTag); // shown behind the start menu too
const playerSprite = new Sprite();
// The weapon overlays (weapon, fist, smear) and slam's dirt, in front of the
// body and behind it.
const weaponFxFront = new Sprite();
const weaponFxBehind = new Sprite();
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
  leftFxFront,
  leftFxBehind,
  dirtFront,
  dirtBehind,
  fireSprites.rightHand,
  fireSprites.leftHand,
);
// The shadow left on the floor while the player is in the air.
const jumpShadow = new Graphics().ellipse(0, 0, 9, 3).fill({ color: 0x000000, alpha: 0.35 });
let slamImpactMs: number | null = null; // time left until the fists hit the floor
const playerGlow = new Glow(playerSheet, PLAYER_EYES, PLAYER_GLOW);
const torchFx = weaponFx.get(ITEMS.torch.id)!;
const torchGlows: Record<Hand, FlameGlow> = {
  rightHand: new FlameGlow([torchFx.rightHand.front, torchFx.rightHand.behind], FLAME_COLORS, FLAME_GLOW),
  leftHand: new FlameGlow([torchFx.leftHand.front, torchFx.leftHand.behind], FLAME_COLORS, FLAME_GLOW),
};
const camera = new Camera(player.x, playerCenterY(), canvas.width, canvas.height);
const maze = new MazeRenderer(app.renderer, standing, map, mazeTiles, square);
const enemyViews = new EnemyViews(standing, enemySheet);
const targetMarker = new TargetMarker();
const sunShadow = new Sprite({ tint: 0x000000 });
// The white ring under the enemy the player swings at on its own.
const focusRing = new Graphics();
ground.addChild(maze.floor, bigTree.ground, targetMarker.view, focusRing, sunShadow, jumpShadow);
const lighting = new Lighting(canvas.width, canvas.height);
const keyPrompt = createKeyPrompt();
const spearBar = new Graphics();
const spearSprite = new Sprite();
standing.addChild(spearSprite);
const abilityEffects = new AbilityEffects();
const hud = new Hud();
app.stage.addChild(
  lighting.view,
  torchGlows.rightHand.view,
  torchGlows.leftHand.view,
  playerGlow.view,
  keyPrompt,
  spearBar,
  abilityEffects.view,
  hud.view,
);
window.addEventListener("resize", () => {
  fitCanvas();
  camera.viewWidth = canvas.width;
  camera.viewHeight = canvas.height;
  lighting.resize(canvas.width, canvas.height);
  cursor.setScale(screenScale);
  book.setScale(screenScale);
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
const panel = new InventoryPanel(tabs.page("inventory"), inventory, equipment, sheets, panelCursor, {
  drop: dropItem,
  use: useItem,
  equip: equipFrom,
  clickEquip: (slot) => equipFrom(slot, inventory.selected),
  takeOff,
});
const abilityPanel = new AbilityPanel(tabs.page("skills"), ABILITY_KEY_LABEL);
gameLog.log("You wake up at the base.");

// Mouse locked in the game; whenever it is released (Esc), the game pauses
// and the menu shows.
const pauseMenu = new PauseMenu(gameEl, (x, y) => mouse.lock(x, y));
const mouse = new LockedMouse(canvas, (locked) => {
  if (locked) pauseMenu.hide();
  else pauseMenu.show();
});
const cursor = new CursorOverlay();
cursor.setScale(screenScale);

// The map book: picked up in the square, opened with M. While it is open the
// buttons draw (left) and erase (right) instead of moving and blocking.
const book = new MapBook(gameEl);
book.setScale(screenScale);
mouse.addPressSurface(book.element);

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
  thrown?: { enemy: number; x: number; y: number };
} | null = null;

// Copies the C grid when the maze changed. Returns true if it did.
function syncMaze(): boolean {
  const version = game.maze.version();
  if (version === mazeVersion) return false;
  mazeVersion = version;
  map.refill(game.maze.isWall, game.maze.isDoor);
  return true;
}

function update(dtMs: number): void {
  // The player walks with W A S D only (the mouse aims).
  if (!spearThrow) walkWithKeys();
  // With the spear in the right hand the right button aims and throws it
  // instead of blocking.
  const wantsBlock = mouse.rightHeld && !book.isOpen && !holdsSpear();
  if (wantsBlock !== blocking) {
    blocking = wantsBlock;
    game.holdAbility(ABILITY.BLOQUEAR, blocking);
  }
  game.update(dtMs); // the C core moves the game one step
  if (syncMaze()) maze.invalidate();
  enemyAnimMs += dtMs; // drawn in draw(), also while paused

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
  // Hit by an enemy: a red flash and a jolt.
  if (lastLife >= 0 && stats.life < lastLife && !player.isDead) {
    hud.hurt();
    camera.shake(HURT_SHAKE_MS, HURT_SHAKE_PX);
    gameLog.log(`An enemy hits you: -${lastLife - stats.life} life.`);
  }
  lastLife = stats.life;

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
  player.sync(core, dtMs, lookAt, core.y - PLAYER_BODY_HEIGHT / 2);
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
  abilityPanel.show(abilities);
  abilityEffects.showAttacks = !equippedWeapon();
  for (const started of abilityEffects.update(abilities, dtMs)) {
    gameLog.log(started.name);
    const id = abilities.indexOf(started);
    if (id <= ABILITY.ATAQUE_CRITICO && !player.isDead) {
      bigTree.chop(player.x, player.y, vectorOf(player.facing));
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
  pickUpItems();
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
  bigTree.update(dtMs);
  plazaDeco.update(dtMs);
  bushViews.update(dtMs, cover.bush);

  camera.follow(player.x, playerCenterY(), player.facing, dtMs);
  camera.clampTo(map.width, map.height, maze.wallHeight);
  fireAnimator.update(dtMs);
}

function pickUpItems(): void {
  propViews = propViews.filter((view) => {
    const { prop } = view;
    if (!prop.pickup || prop.pickup.pickupWithKey || view.fall) return true;
    const near = Math.hypot(prop.x - player.x, prop.y - player.y) <= PICKUP_RADIUS;
    if (view.waitForLeave) {
      if (!near) view.waitForLeave = false;
      return true;
    }
    if (!near) return true;
    if (!inventory.add(prop.pickup)) return true; // full: leave it on the floor
    gameLog.log(`Picked up: ${prop.pickup.name}`);
    if (prop.pickup.id === "map_book") gameLog.log("Press ` to open it and draw the maze.");
    view.sprite.destroy();
    return false;
  });
}

// The nearest item on the floor that is picked up with E, if one is in reach.
function keyPickupInReach(): PropView | undefined {
  let nearest: PropView | undefined;
  let nearestDistance = KEY_PICKUP_RADIUS;
  for (const view of propViews) {
    if (!view.prop.pickup?.pickupWithKey || view.fall) continue;
    const d = Math.hypot(view.prop.x - player.x, view.prop.y - player.y);
    if (d <= nearestDistance) {
      nearest = view;
      nearestDistance = d;
    }
  }
  return nearest;
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
  if (item.id === ITEMS.spear.id) {
    const towards = directionFromVector(view.prop.x - player.x, view.prop.y - player.y);
    player.startAction("pickup", PICKUP_MS, animationDurationMs(playerSheet, "pickup_right"), towards);
    playerAnimator.restart();
    gameLog.log("The spear is in your right hand: hold the right button to aim, release to throw.");
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
    const canAim = holdsSpear() && !player.isDead && !player.isActing && !player.isJumping;
    if (!(mouse.rightHeld && canAim && mouse.overGame() && !book.isOpen)) return;
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
    if (mouse.rightHeld) return;
    if (spearThrow.ms < SPEAR_CHARGE_MS || !aim) {
      player.endAction(); // let go before it charged: no throw
      endThrow();
      return;
    }
    spearThrow = { phase: "throw", ms: THROW_HOLD_MS, dirX: aim.x, dirY: aim.y };
    return;
  }
  if (!spearThrow.released && spearThrow.ms >= THROW_RELEASE_MS) {
    spearThrow.released = true;
    equipment.take("rightHand"); // it is in the air now, not in the hand
    const { dirX, dirY } = spearThrow;
    const aim = game.throwSpear(dirX, dirY, true); // where it is going to hit
    const hit = aim.enemy >= 0;
    launchSpear(
      { x: player.x + dirX * SPEAR_HAND_AHEAD, y: player.y + dirY * SPEAR_HAND_AHEAD, z: SPEAR_HAND_HEIGHT },
      { x: aim.hitX, y: aim.hitY, z: hit ? SPEAR_HIT_HEIGHT : 0 },
      dirX,
      dirY,
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
): void {
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  flyingSpear = { from, to, ms: 0, totalMs: (far / SPEAR_FLIGHT_SPEED) * 1000, dirX, dirY };
}

// Moves the spear in the air. On arrival C does the throw: an enemy still in
// its way dies (carried to the wall, see EnemyViews); if it moved away the
// spear flies on to where it ends up. Then it sticks there, to be picked up.
function updateFlyingSpear(dtMs: number): void {
  if (!flyingSpear) return;
  flyingSpear.ms += dtMs;
  if (flyingSpear.ms < flyingSpear.totalMs) return;
  const { to, dirX, dirY } = flyingSpear;
  if (!flyingSpear.thrown) {
    const thrown = game.throwSpear(dirX, dirY);
    gameLog.log(thrown.enemy >= 0 ? "The spear hits!" : "The spear misses.");
    if (thrown.enemy < 0 && Math.hypot(thrown.x - to.x, thrown.y - to.y) > 2) {
      launchSpear(to, { x: thrown.x, y: thrown.y, z: 0 }, dirX, dirY);
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
// it can be thrown. Screen space, like the key prompt.
function showSpearBar(): void {
  spearBar.visible = spearThrow?.phase === "aim";
  if (!spearThrow || !spearBar.visible) return;
  const [sx, sy] = worldToScreen(player.x, player.y + SPEAR_BAR_BELOW_FEET);
  const x = Math.round(sx - SPEAR_BAR_WIDTH / 2);
  const y = Math.round(sy);
  const charge = Math.min(1, spearThrow.ms / SPEAR_CHARGE_MS);
  const ready = charge === 1;
  spearBar
    .clear()
    .rect(x - 1, y - 1, SPEAR_BAR_WIDTH + 2, 4)
    .fill(0x1a1622)
    .rect(x, y, Math.round(SPEAR_BAR_WIDTH * charge), 2)
    .fill(ready ? SPEAR_BAR_READY : SPEAR_BAR_CHARGING);
}

// The weapon (or torch) in the right hand, the one that swings.
function equippedWeapon(): ItemKind | null {
  return equipment.slots.rightHand;
}

// Double click on an inventory slot: a potion is drunk, the map book opens,
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
  if (item.id === "map_book") {
    book.toggle();
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

// A key cap with an "E" above the player's head while an item to pick up
// with E is in reach. Screen space, after the darkness, so it shows at night.
function showKeyPrompt(): void {
  keyPrompt.visible = keyPickupInReach() !== undefined;
  if (!keyPrompt.visible) return;
  const [sx, sy] = worldToScreen(player.x, player.y - PLAYER_BODY_HEIGHT - PROMPT_ABOVE_HEAD);
  const bob = Math.round(Math.sin(performance.now() / 250)); // 1 px up and down
  keyPrompt.position.set(Math.round(sx - KEY_PROMPT_SIZE / 2), Math.round(sy - KEY_PROMPT_SIZE) + bob);
}

// Leaves `item` on the floor at the player's feet.
function dropAtFeet(item: ItemKind): void {
  const prop: Prop = {
    sprite: item.sprite,
    frame: item.frame,
    x: Math.round(player.x),
    y: Math.round(player.y),
    pickup: item,
  };
  propViews.push(addProp(prop, false, { waitForLeave: true }));
  gameLog.log(`No room in the inventory: the ${item.name.toLowerCase()} is on the floor.`);
}

// Takes one item out of an inventory slot and throws it on the floor ahead of
// the player. Where that is a wall or the tree's trunk, it falls at the feet.
function dropItem(index: number): void {
  const item = inventory.removeOne(index);
  if (!item) {
    gameLog.log("Nothing to drop in that slot.");
    return;
  }
  const [dirX, dirY] = vectorOf(player.facing);
  let x = Math.round(player.x + dirX * DROP_AHEAD);
  let y = Math.round(player.y + dirY * DROP_AHEAD);
  const t = map.tileSize;
  const trunk = sampleTrunkBox(tree);
  const inTrunk = x >= trunk.x && x <= trunk.x + trunk.w && y >= trunk.y && y <= trunk.y + trunk.h;
  if (map.isWall(Math.floor(x / t), Math.floor(y / t)) || inTrunk) {
    x = Math.round(player.x);
    y = Math.round(player.y);
  }
  const prop: Prop = {
    sprite: item.sprite,
    frame: item.frame,
    x,
    y,
    pickup: item,
  };
  propViews.push(
    addProp(prop, false, {
      waitForLeave: true,
      fall: { fromX: player.x, fromY: player.y, ms: DROP_FALL_MS },
    }),
  );
  gameLog.log(`Dropped: ${item.name}`);
  if (item.id === "map_book" && book.isOpen && !inventory.has("map_book")) book.toggle();
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
  maze.show(view, playerBody(), game.maze.gateLeaves());
  const cover = game.cover();
  const enemies = game.enemies();
  enemyViews.show(enemies, enemyAnimMs, cover.bush);
  showFocusRing(enemies, cover);
  enemyAnimMs = 0;
  bigTree.show(playerBody());
  targetMarker.show(target, performance.now());
  const pinned = new Set(enemies.filter((e) => e.pinned).map((e) => e.slot));
  for (const v of propViews) {
    showProp(v);
    if (v.pinnedEnemy !== undefined && pinned.has(v.pinnedEnemy)) v.sprite.visible = false;
  }
  showFlyingSpear();
  showPlayer(cover.hidden ? HIDDEN_ALPHA : 1);

  // Screen space.
  const [dirX, dirY] = vectorOf(player.facing);
  const [lightX, lightY] = worldToScreen(player.x, playerCenterY());
  lighting.setDaylight(game.clock().daylight);
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
  showKeyPrompt();
  showSpearBar();
  showAbilityEffects();
  hud.showMedusa(game.medusaLife(), game.medusaLifeMax());
  const { life, lifeMax } = game.playerStats();
  hud.showLife(life, lifeMax);
  hud.showClock(game.clock(), gateOpening, timeSpeed, canvas.width, performance.now());
  hud.showBanners(growthBannerMs, deathBannerMs, DEATH_BANNER_MS, canvas.width, canvas.height);
  cursor.setShape(book.isOpen && mouse.isOver(book.element) ? (mouse.rightHeld ? "eraser" : "pencil") : "arrow");
  cursor.update(mouse.locked, mouse.x, mouse.y);
  app.render();
}

function showControlsHint(root: HTMLElement): void {
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "W A S D: move · Spear in the right hand: hold the right button to aim (the bar under the feet charges), release to throw · `: map book (left draws, right erases) · 1-9 or click a slot: select · X or right click a slot: drop · E on a branch, a weapon or the torch: pick it up · Inventory tab: double click an item to use or hold it, or drag it onto a body square (right click on the square: take off) · Next to an enemy: swings at it on its own, one at a time (white ring) · C: support · V: parry · Space: jump · R: punch the ground · F: clock speed · G: test gates · Esc: menu";
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
    ["puertas", `${Math.round(gateOpening * 100)}% abiertas`],
    ["muertes", `${game.playerStats().deaths} · delirio ${game.playerStats().delirium}`],
    ["compuertas", clock.gatesOpen ? "ABIERTAS" : "cerradas"],
    ["expansiones", String(clock.expansions)],
    ["proxima", clock.nextExpansionMs < 0 ? "no crece mas" : formatMs(clock.nextExpansionMs)],
    ["semilla", String(seed)],
  ]);
}

// The big tree's sheets (whole, trunk, crown) and the grass around its foot.
async function loadBigTreeArt(): Promise<BigTreeArt> {
  const [whole, trunk, crown, grassBack, grassFront, sticks, shadow] = await Promise.all([
    loadSpriteSheet(`${BASE}sprites/arbol_1`),
    loadSpriteSheet(`${BASE}sprites/arbol_1_tronco`),
    loadSpriteSheet(`${BASE}sprites/arbol_1_copa`),
    loadImage(`${BASE}sprites/pasto_arbol_atras.png`),
    loadImage(`${BASE}sprites/pasto_arbol_frente.png`),
    loadImage(`${BASE}sprites/palitos.png`),
    loadImage(`${BASE}sprites/sombra_arbol.png`),
  ]);
  return {
    whole,
    trunk,
    crown,
    grassBack: Texture.from(grassBack),
    grassFront: Texture.from(grassFront),
    sticks: Texture.from(sticks),
    shadow: Texture.from(shadow),
  };
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
function playerBody(): Box {
  return {
    left: player.x - PLAYER_BODY_WIDTH / 2,
    top: player.y - PLAYER_BODY_HEIGHT,
    right: player.x + PLAYER_BODY_WIDTH / 2,
    bottom: player.y,
  };
}

// Puts a prop on the floor, as a looping animation or as one fixed frame.
function addProp(
  prop: Prop,
  animated: boolean,
  extra: Pick<PropView, "waitForLeave" | "fall" | "pinnedEnemy"> = {},
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
  return { prop, sheet, animator, sprite, ...extra };
}

function showProp({ prop, sheet, animator, sprite, fall }: PropView): void {
  let { x, y } = prop;
  if (fall) {
    // From the hand to the floor in a hop: p goes 0 -> 1 while it falls.
    const p = 1 - fall.ms / DROP_FALL_MS;
    x = fall.fromX + (prop.x - fall.fromX) * p;
    y = fall.fromY + (prop.y - fall.fromY) * p - Math.sin(Math.PI * p) * DROP_HOP;
  }
  const frame = animator ? animator.currentFrame() : sheet.frames[prop.frame ?? 0];
  sprite.visible = frame !== null;
  if (frame) placeFrame(sprite, frame, x, y);
}

function coreState() {
  const p = game.player();
  return {
    ...p,
    state: STATE[p.state] ?? `unknown (${p.state})`,
    jumping: game.abilities()[ABILITY.SALTAR]?.active ?? false,
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
  if (e.code in WASD && mouse.locked) wasdHeld.add(e.code);
  if (e.code === "KeyE" && mouse.locked && !e.repeat) pickUpWithKey();
  if (e.code === "KeyT") game.reset();
  if (isMapKey(e) && mouse.locked) {
    e.preventDefault();
    if (inventory.has("map_book")) book.toggle();
    else gameLog.log("You have no map. Look for the book in the square.");
  }
  if (e.code === "KeyG") {
    game.testGates();
    timeSpeed = 1;
    target = null;
    player.sync(coreState(), 0);
    camera.x = player.x; // jump there instead of sliding across the square
    camera.y = playerCenterY();
    gameLog.log("Test: the gates are about to close.");
  }
  if (e.code === "KeyF") {
    timeSpeed = TIME_SPEEDS[(TIME_SPEEDS.indexOf(timeSpeed) + 1) % TIME_SPEEDS.length];
    game.setTimeSpeed(timeSpeed);
    gameLog.log(`Clock speed x${timeSpeed}`);
  }
  if (e.code === "KeyX" && mouse.locked) dropItem(inventory.selected);
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
  if (mouse.locked) update(dtMs); // paused while the menu is open
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
