// Composition root: wires infrastructure adapters to application use cases.
// The game logic lives in C (src/main.c, through the bridge src/web.c, compiled
// to WebAssembly). Movement is mouse only (Diablo style): while the left button
// is held, the client sends the world point under the cursor to C, then reads
// the state back and draws it: player, maze, light and panel. The maze itself
// is generated and grown by C (src/mecanicas/laberinto.c); the client mirrors
// its grid to draw it.
// The mouse is locked inside the whole window (game and inventory panel) until
// Esc, which opens the pause menu.
import { Character } from "./domain/character";
import { vectorOf } from "./domain/facing";
import { Inventory } from "./domain/inventory";
import { ITEMS } from "./domain/items";
import { ITEM_SPRITES, placeItems, type Prop } from "./domain/level-items";
import { Square } from "./domain/square";
import { placeSampleTree, sampleTrunkBox } from "./domain/sample-tree";
import { TileMap } from "./domain/tile-map";
import { ABILITY_KEY_LABEL, AbilityKeys } from "./infrastructure/input/ability-keys";
import { LockedMouse } from "./infrastructure/input/locked-mouse";
import { AbilityEffects } from "./infrastructure/render/ability-effects";
import { Animator } from "./infrastructure/render/animator";
import { BigTree, type BigTreeArt } from "./infrastructure/render/big-tree";
import { PlazaDeco } from "./infrastructure/render/plaza-deco";
import { Camera } from "./infrastructure/render/camera";
import { CursorOverlay, drawTargetMarker } from "./infrastructure/render/cursor";
import { Glow } from "./infrastructure/render/glow";
import { Lighting } from "./infrastructure/render/lighting";
import {
  type Box,
  loadMazeTiles,
  MazeRenderer,
  type View,
} from "./infrastructure/render/maze-renderer";
import {
  DEFAULT_ANIMATION,
  drawFrame,
  loadImage,
  loadSpriteSheet,
  type SpriteSheet,
} from "./infrastructure/render/sprite-sheet";
import { AbilityPanel } from "./infrastructure/ui/ability-panel";
import { CoreDebug } from "./infrastructure/ui/core-debug";
import { InventoryPanel } from "./infrastructure/ui/inventory-panel";
import { GameLog } from "./infrastructure/ui/game-log";
import { SideTabs } from "./infrastructure/ui/side-tabs";
import { MapBook } from "./infrastructure/ui/map-book";
import { PauseMenu } from "./infrastructure/ui/pause-menu";
import { ABILITY, loadGameWasm, STATE } from "./infrastructure/wasm/game-wasm";

// The canvas fills the whole game area. Its internal resolution adapts to the
// area so that it is always shown at an integer scale: every pixel the same
// size, nothing stretched. The scale aims at about TARGET_VIEW_HEIGHT pixels
// of world vertically; a bigger window shows a bit more of the maze.
const TARGET_VIEW_HEIGHT = 480;
// Empty rows under the feet in personaje_2's canvas; drawn lower so the feet
// land on the collision box.
const PLAYER_FEET_PADDING = 13;
// Drawn size of the player, for fading walls and the light position.
const PLAYER_BODY_WIDTH = 34;
const PLAYER_BODY_HEIGHT = 46;
const PICKUP_RADIUS = 22;
const SIGHT_AHEAD = 140; // px the walls also clear ahead of the player
// Items picked up with E (branches): reach from the feet, and the key prompt
// shown above the head while one is in reach.
const KEY_PICKUP_RADIUS = 26;
const PROMPT_SIZE = 13;
const PROMPT_ABOVE_HEAD = 6;
// A dropped item lands this far ahead of the feet (past PICKUP_RADIUS), after
// a short hop out of the hand.
const DROP_AHEAD = 32;
const DROP_FALL_MS = 280;
const DROP_HOP = 16; // px of the hop's peak
const TARGET_REACHED = 4; // px: the floor marker hides when the player gets this close
// The player's cyan "breathes": one slow pulse every two idle loops
// (idle = 6 frames x 150 ms), in step with the idle movement.
const PLAYER_CYAN: [number, number, number] = [95, 205, 228];
const PLAYER_GLOW: [number, number, number] = [110, 225, 255];
const BREATH_MS = 1800;
const INVENTORY_SIZE = 12;
const GROWTH_BANNER_MS = 2500; // "the maze grows" message on screen
const DEATH_BANNER_MS = 3000;
// Testing aid: F cycles the clock speed, to see dusk and night without waiting
// half an hour. Only the clock goes faster, not the movement.
const TIME_SPEEDS = [1, 60, 600];

const gameEl = document.getElementById("game")!;
const panelEl = document.getElementById("panel")!;

const canvas = document.createElement("canvas");
gameEl.appendChild(canvas);
const ctx = canvas.getContext("2d")!;
let screenScale = 1; // CSS pixels per canvas pixel
fitCanvas();

// Every item sprite, loaded once from public/assets. Paths start at the base
// the site is served from ("/" locally, "/Delirio/" on GitHub Pages).
const BASE = import.meta.env.BASE_URL;
const assetNames = ITEM_SPRITES;
const [game, playerSheet, mazeTiles, treeArt, flowerSheet, tallFlowerSheet, ...assetSheets] = await Promise.all([
  loadGameWasm(),
  loadSpriteSheet(`${BASE}sprites/personaje_2`, { pivotOnBody: true }),
  loadMazeTiles(`${BASE}assets/maze_tiles`),
  loadBigTreeArt(),
  loadSpriteSheet(`${BASE}sprites/flores`),
  loadSpriteSheet(`${BASE}sprites/flores_2`),
  ...assetNames.map((name) => loadSpriteSheet(`${BASE}assets/${name}`)),
]);
// roll_start in the sheet already rolls once and lands; the roll only uses its
// first frames, up to curling into a ball, and the ball phase comes from "roll".
for (const side of ["left", "right"]) {
  const start = playerSheet.animations.get(`roll_start_${side}`);
  if (start) playerSheet.animations.set(`roll_in_${side}`, start.slice(0, 7));
}
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
let deathBannerMs = 0;
let timeSpeed = 1;
syncMaze();

// A prop is drawn either as a looping animation or as one fixed frame.
interface PropView {
  prop: Prop;
  sheet: SpriteSheet;
  animator: Animator | null;
  // A dropped item is not picked up again until the player has walked away.
  waitForLeave?: boolean;
  // While it falls from the hand: where it was thrown from and time left.
  fall?: { fromX: number; fromY: number; ms: number };
}
const spawn = game.player();
const items = placeItems(map, spawn);
let propViews: PropView[] = items.map((prop) => {
  const sheet = sheets.get(prop.sprite)!;
  if (prop.frame !== undefined) return { prop, sheet, animator: null };
  const animator = new Animator(sheet);
  animator.play(prop.animation ?? DEFAULT_ANIMATION);
  return { prop, sheet, animator };
});
const square = new Square(map, spawn);
// The big tree: its trunk is solid, C keeps it with the walls.
const tree = placeSampleTree(spawn);
game.maze.addObstacle(sampleTrunkBox(tree));
const bigTree = new BigTree(tree, treeArt);
const plazaDeco = new PlazaDeco(tree.flowers, [flowerSheet, tallFlowerSheet]);
// Fallen branches lie around the tree, each drawn with its own variant.
propViews.push(
  ...tree.branches.map((b) => ({
    prop: { sprite: ITEMS.branch.sprite, frame: b.kind, x: b.x, y: b.y, pickup: ITEMS.branch },
    sheet: sheets.get(ITEMS.branch.sprite)!,
    animator: null,
  })),
);

const player = new Character();
player.sync(coreState(), 0);
const playerAnimator = new Animator(playerSheet);
const playerGlow = new Glow(playerSheet, PLAYER_CYAN, PLAYER_GLOW);
const camera = new Camera(player.x, playerCenterY(), canvas.width, canvas.height);
const maze = new MazeRenderer(ctx, map, mazeTiles, square);
const lighting = new Lighting(canvas.width, canvas.height);
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
  canvas.width = Math.ceil(areaWidth / scale);
  canvas.height = Math.ceil(areaHeight / scale);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
  // Resizing a canvas resets its context state.
  ctx.imageSmoothingEnabled = false;
}

const inventory = new Inventory(INVENTORY_SIZE);
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
const panel = new InventoryPanel(tabs.page("inventory"), inventory, sheets, (i) => dropItem(i));
const abilityPanel = new AbilityPanel(tabs.page("skills"), ABILITY_KEY_LABEL);
const abilityEffects = new AbilityEffects();
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
    // E over a branch picks it up instead of attacking.
    if (ability === ABILITY.ATAQUE_LARGO && pickUpWithKey()) return;
    game.useAbility(ability);
  },
  (ability, held) => game.holdAbility(ability, held),
);
let blocking = false;
let medusaWasAlive = true;

// Last point sent to C, only to draw the marker on the floor.
let target: { x: number; y: number } | null = null;

// Copies the C grid when the maze changed. Returns true if it did.
function syncMaze(): boolean {
  const version = game.maze.version();
  if (version === mazeVersion) return false;
  mazeVersion = version;
  map.refill(game.maze.isWall, game.maze.isDoor);
  return true;
}

function update(dtMs: number): void {
  // Dragging onto the panel keeps the last target instead of walking to the edge.
  if (mouse.held && mouse.overGame() && !book.isOpen) {
    target = cursorInWorld();
    game.setTarget(target.x, target.y);
  }
  const wantsBlock = mouse.rightHeld && !book.isOpen;
  if (wantsBlock !== blocking) {
    blocking = wantsBlock;
    game.holdAbility(ABILITY.BLOQUEAR, blocking);
  }
  game.update(dtMs); // the C core moves the game one step
  if (syncMaze()) maze.invalidateFloor();

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
  for (const started of abilityEffects.update(abilities, dtMs)) {
    gameLog.log(started.name);
    if (abilities.indexOf(started) <= ABILITY.ATAQUE_CRITICO) {
      bigTree.chop(player.x, player.y, vectorOf(player.facing));
    }
  }
  pickUpItems();

  playerAnimator.play(player.animationTag, !player.isDead);
  playerAnimator.update(dtMs, player.animationSpeed, player.animationReversed);
  for (const view of propViews) {
    view.animator?.update(dtMs);
    if (view.fall) {
      view.fall.ms -= dtMs;
      if (view.fall.ms <= 0) view.fall = undefined;
    }
  }
  bigTree.update(dtMs);
  plazaDeco.update(dtMs);

  camera.follow(player.x, playerCenterY(), player.facing, dtMs);
  camera.clampTo(map.width, map.height, maze.wallHeight);
  panel.update();
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

// E: picks up the item in reach. False when there is none, so E attacks.
function pickUpWithKey(): boolean {
  const view = keyPickupInReach();
  if (!view) return false;
  const item = view.prop.pickup!;
  if (!inventory.add(item)) {
    gameLog.log("The inventory is full.");
    return true;
  }
  propViews = propViews.filter((v) => v !== view);
  gameLog.log(`Picked up: ${item.name}`);
  return true;
}

// A key cap with an "E" above the player's head while an item to pick up
// with E is in reach. Screen space, after the darkness, so it shows at night.
function drawKeyPrompt(): void {
  if (!keyPickupInReach()) return;
  const [sx, sy] = worldToScreen(player.x, player.y - PLAYER_BODY_HEIGHT - PROMPT_ABOVE_HEAD);
  const bob = Math.round(Math.sin(performance.now() / 250)); // 1 px up and down
  const left = Math.round(sx - PROMPT_SIZE / 2);
  const top = Math.round(sy - PROMPT_SIZE) + bob;
  ctx.fillStyle = "#1a1622";
  ctx.fillRect(left, top, PROMPT_SIZE, PROMPT_SIZE);
  ctx.fillStyle = "#e8e0c8";
  ctx.fillRect(left + 1, top + 1, PROMPT_SIZE - 2, PROMPT_SIZE - 3); // key face
  ctx.fillStyle = "#a89a7c";
  ctx.fillRect(left + 1, top + PROMPT_SIZE - 2, PROMPT_SIZE - 2, 1); // key side
  // The letter E, drawn in pixels so it stays sharp: a stem and three bars.
  ctx.fillStyle = "#1a1622";
  const lx = left + 4;
  const ly = top + 3;
  ctx.fillRect(lx, ly, 1, 6);
  ctx.fillRect(lx, ly, 5, 1);
  ctx.fillRect(lx, ly + 2, 4, 1);
  ctx.fillRect(lx, ly + 5, 5, 1);
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
  const prop: Prop = { sprite: item.sprite, frame: item.frame, x, y, pickup: item };
  propViews.push({
    prop,
    sheet: sheets.get(item.sprite)!,
    animator: null,
    waitForLeave: true,
    fall: { fromX: player.x, fromY: player.y, ms: DROP_FALL_MS },
  });
  gameLog.log(`Dropped: ${item.name}`);
  if (item.id === "map_book" && book.isOpen && !inventory.has("map_book")) book.toggle();
}

function draw(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0d0b12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // World space.
  camera.apply(ctx);
  const view: View = {
    left: camera.x - canvas.width / 2,
    top: camera.y - canvas.height / 2,
    width: canvas.width,
    height: canvas.height,
  };
  maze.drawFloor(view);
  bigTree.drawGround(ctx);
  if (target) drawTargetMarker(ctx, target.x, target.y, performance.now());
  drawSortedByDepth(view);

  // Screen space.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const [dirX, dirY] = vectorOf(player.facing);
  const [lightX, lightY] = worldToScreen(player.x, playerCenterY());
  lighting.setDaylight(game.clock().daylight);
  lighting.draw(ctx, lightX, lightY, dirX, dirY);
  drawPlayerGlow(); // after the darkness: it is the player's own light
  drawKeyPrompt();
  drawAbilityEffects();
  drawMedusaHud();
  drawTimeHud();
  cursor.setShape(
    book.isOpen && mouse.isOver(book.element) ? (mouse.rightHeld ? "eraser" : "pencil") : "arrow",
  );
  cursor.update(mouse.locked, mouse.x, mouse.y);
}

function showControlsHint(root: HTMLElement): void {
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Left click: move · `: map book (left draws, right erases) · 1-9 or click a slot: select · X or right click a slot: drop · E on a branch: pick it up · F: clock speed · G: test gates · Esc: menu";
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

// Top-down depth: whatever stands lower on screen is drawn on top. Walls take
// part too, so they hide whatever is behind them.
function drawSortedByDepth(view: View): void {
  const drawables = [
    ...maze.wallDrawables(view, playerBody(), playerSight()).map((w) => ({ y: w.depthY, draw: w.draw })),
    ...maze.gateDrawables(game.maze.gateLeaves(), playerBody(), playerSight()).map((g) => ({
      y: g.depthY,
      draw: g.draw,
    })),
    ...propViews.map((v) => ({ y: v.prop.y, draw: () => drawProp(v) })),
    { y: tree.y, draw: () => bigTree.draw(ctx, playerBody()) },
    ...plazaDeco.drawables(ctx),
    { y: player.y, draw: drawPlayer },
  ];
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();
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
  return { whole, trunk, crown, grassBack, grassFront, sticks, shadow };
}

function drawPlayer(): void {
  playerAnimator.draw(ctx, player.x, player.y + PLAYER_FEET_PADDING);
}

function drawAbilityEffects(): void {
  const [dirX, dirY] = vectorOf(player.facing);
  const x = player.x + Math.round(canvas.width / 2 - camera.x);
  const feetY = player.y + Math.round(canvas.height / 2 - camera.y);
  abilityEffects.draw(ctx, x, feetY, PLAYER_BODY_HEIGHT, dirX, dirY, performance.now());
}

// Slow breath: dim -> bright -> dim, starting with the idle loop.
function drawPlayerGlow(): void {
  const frame = playerAnimator.currentFrame();
  if (!frame) return;
  const phase = (playerAnimator.motionTimeMs % BREATH_MS) / BREATH_MS;
  const breath = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2); // 0 -> 1 -> 0
  // Same spot drawFrame uses, through the same rounded camera offset.
  const left = Math.round(player.x - frame.anchorX) + Math.round(canvas.width / 2 - camera.x);
  const top = Math.round(player.y + PLAYER_FEET_PADDING - frame.h) + Math.round(canvas.height / 2 - camera.y);
  playerGlow.draw(ctx, frame, left, top, breath);
}

// Where the player's body is drawn, in world pixels.
// The area the walls clear for the player: the body, stretched SIGHT_AHEAD px
// towards where the player faces, so the way ahead (a gate, a dead end) shows.
function playerSight(): Box {
  const body = playerBody();
  const [dirX, dirY] = vectorOf(player.facing);
  const ax = dirX * SIGHT_AHEAD;
  const ay = dirY * SIGHT_AHEAD;
  return {
    left: Math.min(body.left, body.left + ax),
    right: Math.max(body.right, body.right + ax),
    top: Math.min(body.top, body.top + ay),
    bottom: Math.max(body.bottom, body.bottom + ay),
  };
}

function playerBody(): Box {
  return {
    left: player.x - PLAYER_BODY_WIDTH / 2,
    top: player.y - PLAYER_BODY_HEIGHT,
    right: player.x + PLAYER_BODY_WIDTH / 2,
    bottom: player.y,
  };
}

function drawProp({ prop, sheet, animator, fall }: PropView): void {
  let { x, y } = prop;
  if (fall) {
    // From the hand to the floor in a hop: p goes 0 -> 1 while it falls.
    const p = 1 - fall.ms / DROP_FALL_MS;
    x = fall.fromX + (prop.x - fall.fromX) * p;
    y = fall.fromY + (prop.y - fall.fromY) * p - Math.sin(Math.PI * p) * DROP_HOP;
  }
  if (animator) animator.draw(ctx, x, y);
  else drawFrame(ctx, sheet, sheet.frames[prop.frame ?? 0], x, y);
}

function coreState() {
  const p = game.player();
  return {
    ...p,
    state: STATE[p.state] ?? `unknown (${p.state})`,
    rolling: game.abilities()[ABILITY.RODAR]?.active ?? false,
  };
}

// The camera centers on the body, not on the feet.
function playerCenterY(): number {
  return player.y - PLAYER_BODY_HEIGHT / 2;
}

function worldToScreen(x: number, y: number): [number, number] {
  return [x - camera.x + canvas.width / 2, y - camera.y + canvas.height / 2];
}

// m:ss
function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Top center: day and time left of the current phase, and when the maze grows
// next. Plus a warning when it does.
function drawTimeHud(): void {
  const clock = game.clock();
  const phase = { DIA: "DAY", TARDE: "DUSK", NOCHE: "NIGHT" }[clock.phase];
  const line1 = `DAY ${clock.day}  ·  ${phase} ${formatMs(clock.phaseLeftMs)}${timeSpeed > 1 ? `  ·  x${timeSpeed}` : ""}`;
  const next = clock.nextExpansionMs;
  const line2 =
    next < 0 ? "THE MAZE IS FULL SIZE"
    : clock.expansions === 0 ? `MAZE GROWS IN ${formatMs(next)}`
    : `MAZE GROWS AT NIGHTFALL  ${formatMs(next)}`;
  const urgent = next >= 0 && next <= 10000;
  const closing = clock.gatesOpen && gateOpening < 1 && clock.phase === "TARDE";
  const gates = !clock.gatesOpen
    ? `GATES CLOSED · OPEN IN ${formatMs(clock.gatesChangeMs)}`
    : closing
      ? `GATES CLOSING! ${formatMs(clock.gatesChangeMs)}`
      : `GATES OPEN · CLOSE IN ${formatMs(clock.gatesChangeMs)}`;
  const gatesUrgent = closing;

  ctx.save();
  ctx.textAlign = "center";
  const cx = Math.round(canvas.width / 2);
  ctx.font = "bold 12px monospace";
  const width = Math.max(...[line1, line2, gates].map((t) => ctx.measureText(t).width)) + 20;
  ctx.fillStyle = "rgba(9, 7, 16, 0.72)";
  ctx.fillRect(Math.round(cx - width / 2), 6, Math.round(width), 50);

  const phaseColor = { DIA: "#d8cfb8", TARDE: "#e0a458", NOCHE: "#8f86c9" }[clock.phase];
  ctx.fillStyle = phaseColor;
  ctx.fillText(line1, cx, 20);
  ctx.font = "11px monospace";
  ctx.fillStyle = urgent && Math.floor(performance.now() / 250) % 2 === 0 ? "#d95763" : "#b9b3a6";
  ctx.fillText(line2, cx, 35);
  // Last minute before the gates close: red, blinking
  const blink = Math.floor(performance.now() / 300) % 2 === 0;
  ctx.fillStyle = gatesUrgent && blink ? "#d95763" : clock.gatesOpen ? "#7ccf7a" : "#8f86c9";
  ctx.fillText(gates, cx, 49);

  if (growthBannerMs > 0) {
    ctx.globalAlpha = Math.min(1, growthBannerMs / 600);
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#e0a458";
    ctx.fillText("THE MAZE GROWS", cx, 80);
  }

  // Death: red flash fading out, and the message
  if (deathBannerMs > 0) {
    const t = deathBannerMs / DEATH_BANNER_MS;
    ctx.globalAlpha = 0.45 * t * t;
    ctx.fillStyle = "#7a0f18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.min(1, deathBannerMs / 600);
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#d95763";
    ctx.fillText("YOU DIED", cx, Math.round(canvas.height / 2) - 40);
  }
  ctx.restore();
}

function drawMedusaHud(): void {
  const life = game.medusaLife();
  const max = game.medusaLifeMax();
  const ratio = life / max;

  ctx.fillStyle = "#5fcde4";
  ctx.font = "10px monospace";
  ctx.fillText(`MEDUSA ${life} / ${max}${life === 0 ? "  DEAD - T reset" : ""}`, 12, 18);
  ctx.strokeStyle = "#3a3445";
  ctx.strokeRect(12, 24, 120, 8);
  ctx.fillStyle = ratio > 0.3 ? "#6a8a4a" : "#d95763";
  ctx.fillRect(13, 25, 118 * ratio, 6);
}

window.addEventListener("keydown", (e) => {
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
