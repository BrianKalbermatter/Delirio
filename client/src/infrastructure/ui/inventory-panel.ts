// Inventory tab of the side panel: the slot grid on top, the selected item,
// and below them the player standing on a lit background with a square on
// each body part. Under the player, the crafting grid, and a click on the
// result starts making it while a bar fills up.
//
// Items move freely between all those squares (domain/hand.ts): a click picks
// up what a square has and it follows the cursor, a click on another square
// lays it down (stacked, or swapped). Dragging works too: press on a square,
// let go on another. The right button picks up half a stack or lays down
// one; a double click uses an item. On the map, what is carried is dropped. Beside it, the recipe
// book: everything the build level allows, with its shape, and what the next
// build level unlocks (greyed).
// Plain DOM next to the game canvas.
import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, type EquipSlot, type Equipment } from "../../domain/equipment";
import { CRAFT_SIZE, type CraftingGrid, MAX_BUILD_LEVEL, type Recipe, RECIPES } from "../../domain/crafting";
import { type Hand, type Place, samePlace } from "../../domain/hand";
import type { Inventory } from "../../domain/inventory";
import { ITEMS } from "../../domain/items";
import type { ItemKind } from "../../domain/items";
import { VIRTUAL_MOUSEUP } from "../input/locked-mouse";
import type { Frame, SpriteSheet } from "../render/sprite-sheet";

const ICON_SIZE = 32;
// The player's figure, at three times the size of its sprite (64x96).
export const DOLL_SCALE = 3;
export const DOLL_WIDTH = 64 * DOLL_SCALE;
export const DOLL_HEIGHT = 96 * DOLL_SCALE;
// Two clicks on the same slot this close together are a double click.
const DOUBLE_CLICK_MS = 350;
// The cursor has to move this far (px) holding an item before it is dragged.
const DRAG_START = 4;

export interface InventoryHandlers {
  // Double click on a slot: drink it, hold it, wear it...
  use: (index: number) => void;
  // Why an item could not go where it was laid down.
  refused: (message: string) => void;
  // Click on the result: start making it, or stop (right click).
  craft: () => void;
  cancelCraft: () => void;
}

export class InventoryPanel {
  private readonly slotEls: HTMLButtonElement[] = [];
  private readonly equipEls = new Map<EquipSlot, HTMLButtonElement>();
  private readonly selectedEl: HTMLElement;
  private readonly craftEls: HTMLButtonElement[] = [];
  private readonly craftResult: HTMLButtonElement;
  private readonly craftFill: HTMLElement;
  private readonly craftLabel: HTMLElement;
  private readonly recipesEl: HTMLElement;
  private shownBuildLevel = 0;
  private readonly ghost = document.createElement("div");
  private shownHeld = -1; // the hand's version the ghost shows
  readonly doll: HTMLCanvasElement;
  private renderedVersion = "";
  private readonly boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  private lastClick = { index: -1, ms: 0 };
  // The square pressed with the left button while it is down, where the
  // cursor was then, and whether that press picked something up (so letting
  // go on another square, a drag, lays it there).
  private press: { place: Place; x: number; y: number; picked: boolean } | null = null;

  constructor(
    root: HTMLElement,
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
    private readonly crafting: CraftingGrid,
    private readonly hand: Hand,
    private readonly sheets: Map<string, SpriteSheet>,
    private readonly cursor: { x: number; y: number },
    on: InventoryHandlers,
  ) {
    root.innerHTML = `
      <h2>Inventory</h2>
      <div class="slots"></div>
      <div class="selected"></div>
      <h2>Equipment</h2>
      <div class="doll"><canvas width="${DOLL_WIDTH}" height="${DOLL_HEIGHT}"></canvas></div>
      <h2>Crafting</h2>
      <div class="craft-area">
        <div class="craft-bench">
          <div class="craft">
            <div class="craft-grid"></div>
            <span class="craft-arrow">&#9654;</span>
            <button class="slot craft-result"></button>
          </div>
          <div class="craft-bar"><div class="craft-fill"></div><span class="craft-label"></span></div>
        </div>
        <div class="recipes"></div>
      </div>
    `;
    this.recipesEl = root.querySelector<HTMLElement>(".recipes")!;
    const slotsEl = root.querySelector<HTMLElement>(".slots")!;
    this.selectedEl = root.querySelector<HTMLElement>(".selected")!;
    const dollEl = root.querySelector<HTMLElement>(".doll")!;
    const craftGrid = root.querySelector<HTMLElement>(".craft-grid")!;
    this.craftResult = root.querySelector<HTMLButtonElement>(".craft-result")!;
    this.craftFill = root.querySelector<HTMLElement>(".craft-fill")!;
    this.craftLabel = root.querySelector<HTMLElement>(".craft-label")!;
    for (let cell = 0; cell < CRAFT_SIZE * CRAFT_SIZE; cell++) {
      const button = document.createElement("button");
      button.className = "slot craft-cell";
      this.wire(button, { kind: "crafting", cell }, on);
      craftGrid.appendChild(button);
      this.craftEls.push(button);
    }
    this.craftResult.addEventListener("click", () => on.craft());
    this.craftResult.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      on.cancelCraft();
    });
    this.craftResult.addEventListener("mousedown", (e) => e.preventDefault());
    this.doll = dollEl.querySelector("canvas")!;
    this.ghost.className = "drag-ghost";
    this.ghost.hidden = true;
    this.ghost.append(document.createElement("canvas"), document.createElement("span"));
    document.body.appendChild(this.ghost);

    for (const slot of EQUIP_SLOTS) {
      const button = document.createElement("button");
      button.className = `slot equip equip-${slot}`;
      button.dataset.label = EQUIP_SLOT_NAMES[slot];
      this.wire(button, { kind: "equipment", slot }, on);
      dollEl.appendChild(button);
      this.equipEls.set(slot, button);
    }

    inventory.slots.forEach((_, i) => {
      const button = document.createElement("button");
      button.className = "slot";
      this.wire(button, { kind: "inventory", index: i }, on);
      slotsEl.appendChild(button);
      this.slotEls.push(button);
    });

    // Released anywhere: the press ends (after the square under it took it).
    document.addEventListener(VIRTUAL_MOUSEUP, () => {
      this.press = null;
    });
  }

  // Whether what the hand carries is being dragged out of a square (let go on
  // the map, it is dropped there).
  get dragging(): boolean {
    return this.press !== null && this.press.picked && this.hand.held !== null && this.moved(this.press);
  }

  // A square's clicks: left picks up or lays down (a double click on an
  // inventory slot uses it), right takes half or lays one, and letting go on
  // it after dragging from another lays down what was picked up there.
  private wire(button: HTMLButtonElement, place: Place, on: InventoryHandlers): void {
    const report = (message: string | null) => {
      if (message) on.refused(message);
    };
    button.addEventListener("click", () => {
      if (place.kind === "inventory") {
        const i = place.index;
        this.inventory.select(i);
        const now = performance.now();
        if (this.lastClick.index === i && now - this.lastClick.ms < DOUBLE_CLICK_MS) {
          // The first click picked it up: back in its slot, and used.
          this.lastClick.index = -1;
          if (this.hand.held && !this.inventory.slots[i]) report(this.hand.click(place));
          this.press = null;
          on.use(i);
          return;
        }
        this.lastClick = { index: i, ms: now };
      }
      const picked = this.hand.held === null;
      report(this.hand.click(place));
      this.press = { place, x: this.cursor.x, y: this.cursor.y, picked: picked && this.hand.held !== null };
    });
    button.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      report(this.hand.rightClick(place));
    });
    button.addEventListener(VIRTUAL_MOUSEUP, () => {
      const press = this.press;
      if (press?.picked && this.hand.held && this.moved(press) && !samePlace(press.place, place)) {
        report(this.hand.click(place));
      }
    });
    // Keep focus on the game: a focused button would also react to Space.
    button.addEventListener("mousedown", (e) => e.preventDefault());
  }

  private moved(press: { x: number; y: number }): boolean {
    return Math.hypot(this.cursor.x - press.x, this.cursor.y - press.y) >= DRAG_START;
  }

  // Called every frame; only touches the DOM when the inventory changed, and
  // moves the dragged item with the cursor.
  update(): void {
    this.showDrag();
    this.showCraftProgress();
    const version = `${this.inventory.version}/${this.equipment.version}/${this.crafting.version}/${this.hand.version}`;
    if (this.renderedVersion === version) return;
    this.renderedVersion = version;
    this.showCrafting();

    for (const [slot, el] of this.equipEls) {
      const item = this.equipment.slots[slot];
      el.replaceChildren();
      el.classList.toggle("is-empty", !item);
      el.title = item
        ? `${EQUIP_SLOT_NAMES[slot]}: ${item.name} (click: pick up)`
        : `${EQUIP_SLOT_NAMES[slot]} (lay an item here)`;
      if (item) el.appendChild(this.icon(item));
    }

    this.inventory.slots.forEach((slot, i) => {
      const el = this.slotEls[i];
      el.classList.toggle("is-selected", i === this.inventory.selected);
      el.replaceChildren();
      el.title = "";
      if (!slot) return;
      el.title = `${slot.item.name} (click: pick up · right click: half · double click: use)`;
      el.appendChild(this.icon(slot.item));
      if (slot.count > 1) {
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = String(slot.count);
        el.appendChild(count);
      }
    });

    const selected = this.inventory.selectedSlot;
    this.selectedEl.textContent = selected
      ? `${selected.item.name}${selected.count > 1 ? ` ×${selected.count}` : ""}`
      : "Empty slot";
  }

  // The recipe book: the build level on top, what it allows (with the shape
  // to lay in the grid) and, greyed, what the next level unlocks.
  private showRecipes(): void {
    const level = this.crafting.buildLevel;
    if (level === this.shownBuildLevel) return;
    this.shownBuildLevel = level;
    const section = (title: string, recipes: Recipe[], locked: boolean) => {
      const h = document.createElement("h3");
      h.className = `build-level${locked ? " is-locked" : ""}`;
      h.textContent = title;
      const list = document.createElement("ul");
      list.className = "recipe-list";
      for (const recipe of recipes) list.appendChild(this.recipeRow(recipe, locked));
      this.recipesEl.append(h, list);
    };
    this.recipesEl.replaceChildren();
    section(`Build level ${level}`, RECIPES.filter((r) => r.level <= level), false);
    const next = RECIPES.filter((r) => r.level === level + 1);
    if (level < MAX_BUILD_LEVEL && next.length > 0) {
      section(`Build level ${level + 1} · raise Build in Skills`, next, true);
    }
  }

  private recipeRow(recipe: Recipe, locked: boolean): HTMLElement {
    const li = document.createElement("li");
    li.classList.toggle("is-locked", locked);
    const item = ITEMS[recipe.result];
    const result = document.createElement("span");
    result.className = "recipe-result";
    result.appendChild(this.icon(item));
    const name = document.createElement("span");
    name.className = "recipe-name";
    const ingredients = new Map<string, number>();
    for (const row of recipe.pattern) {
      for (const ch of row) if (ch !== ".") ingredients.set(recipe.key[ch], (ingredients.get(recipe.key[ch]) ?? 0) + 1);
    }
    name.textContent = item.name;
    const needs = document.createElement("span");
    needs.className = "recipe-needs";
    needs.textContent = [...ingredients].map(([id, n]) => `${n} ${ITEMS[id].name.toLowerCase()}`).join(" · ");
    name.appendChild(needs);
    // The shape, in a little 3x3 grid
    const shape = document.createElement("span");
    shape.className = "recipe-shape";
    for (let r = 0; r < CRAFT_SIZE; r++) {
      for (let c = 0; c < CRAFT_SIZE; c++) {
        const cell = document.createElement("span");
        const ch = recipe.pattern[r]?.[c];
        if (ch && ch !== ".") cell.appendChild(this.icon(ITEMS[recipe.key[ch]]));
        shape.appendChild(cell);
      }
    }
    li.title = locked
      ? `${item.name}: unlocked at build level ${recipe.level}`
      : `${item.name}: lay it out like this in the crafting grid (mirrored also works)`;
    li.append(result, name, shape);
    return li;
  }

  private showCrafting(): void {
    this.showRecipes();
    this.crafting.cells.forEach((item, cell) => {
      const el = this.craftEls[cell];
      el.replaceChildren();
      el.title = item ? `${item.name} (click: pick up)` : "";
      if (item) el.appendChild(this.icon(item));
      el.classList.toggle("is-locked", this.crafting.isCrafting);
    });
    const recipe = this.crafting.match();
    const result = recipe ? ITEMS[recipe.result] : null;
    const locked = this.crafting.lockedMatch();
    this.craftResult.replaceChildren();
    if (result) this.craftResult.appendChild(this.icon(result));
    else if (locked) this.craftResult.appendChild(this.icon(ITEMS[locked.result]));
    this.craftResult.classList.toggle("is-locked", !result && locked !== null);
    this.craftResult.classList.toggle("is-ready", result !== null && !this.crafting.isCrafting);
    this.craftResult.classList.toggle("is-crafting", this.crafting.isCrafting);
    this.craftResult.title = !result
      ? locked
        ? `${ITEMS[locked.result].name}: needs build level ${locked.level} (raise Build in Skills)`
        : "Nothing to make with this"
      : this.crafting.isCrafting
        ? `Making: ${result.name} (right click: stop)`
        : `Click to make: ${result.name}`;
  }

  // The bar under the grid, every frame while something is being made.
  private showCraftProgress(): void {
    const recipe = this.crafting.isCrafting ? this.crafting.match() : null;
    const p = this.crafting.progress;
    this.craftFill.style.width = `${Math.round(p * 100)}%`;
    const label = recipe ? `Making ${ITEMS[recipe.result].name}... ${Math.floor(p * 100)}%` : "";
    if (this.craftLabel.textContent !== label) this.craftLabel.textContent = label;
  }

  // What the hand carries, under the cursor, with how many.
  private showDrag(): void {
    const held = this.hand.held;
    this.ghost.hidden = !held;
    if (!held) return;
    if (this.shownHeld !== this.hand.version) {
      this.shownHeld = this.hand.version;
      const [canvas, count] = this.ghost.children as unknown as [HTMLCanvasElement, HTMLElement];
      const icon = this.icon(held.item);
      canvas.width = icon.width;
      canvas.height = icon.height;
      canvas.getContext("2d")!.drawImage(icon, 0, 0);
      count.textContent = held.count > 1 ? String(held.count) : "";
    }
    const half = this.ghost.offsetWidth / 2;
    this.ghost.style.transform = `translate(${this.cursor.x - half}px, ${this.cursor.y - half}px)`;
  }

  // Item icon cut from its sprite sheet: only its drawn pixels, as big as
  // fits (whole times bigger, so pixels stay square), centered in 32x32.
  private icon(item: ItemKind): HTMLCanvasElement {
    const sheet = this.sheets.get(item.iconSprite ?? item.sprite)!;
    const f = sheet.frames[item.icon ?? item.frame];
    const box = this.drawnBox(sheet, f);
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const fit = ICON_SIZE / Math.max(box.w, box.h);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const w = box.w * scale;
    const h = box.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, f.x + box.x, f.y + box.y, box.w, box.h, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
    return canvas;
  }

  // The part of frame `f` with pixels drawn (the whole frame if empty).
  private drawnBox(sheet: SpriteSheet, f: Frame): { x: number; y: number; w: number; h: number } {
    const key = `${sheet.image.src}#${f.x},${f.y}`;
    const cached = this.boxes.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const pixels = ctx.getImageData(0, 0, f.w, f.h).data;
    let [x0, y0, x1, y1] = [f.w, f.h, -1, -1];
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (pixels[(y * f.w + x) * 4 + 3] === 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    const box = x1 < 0 ? { x: 0, y: 0, w: f.w, h: f.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    this.boxes.set(key, box);
    return box;
  }
}
