// Inventory tab of the side panel: the slot grid on top, the selected item,
// and below them the player standing on a lit background with a square on
// each body part. Items are put on by dragging them onto a square, by
// selecting them and clicking the square, or with a double click (use it).
// Under the player, the crafting grid: items go in the same way, and a click
// on the result starts making it while a bar fills up.
// Plain DOM next to the game canvas.
import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, type EquipSlot, type Equipment } from "../../domain/equipment";
import { CRAFT_SIZE, type CraftingGrid } from "../../domain/crafting";
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
  // Right click on a slot: drop one item of it.
  drop: (index: number) => void;
  // Double click on a slot: drink it, hold it, wear it...
  use: (index: number) => void;
  // A slot dragged onto another: moved there (stacked or swapped).
  move: (from: number, to: number) => void;
  // An inventory slot dragged onto a body part's square.
  equip: (slot: EquipSlot, index: number) => void;
  // Left click on a body part's square: put the selected item on it, or take
  // off what it has.
  clickEquip: (slot: EquipSlot) => void;
  // Right click on it: take it off.
  takeOff: (slot: EquipSlot) => void;
  // An inventory slot dragged (or the selected one clicked) onto a crafting
  // square, and a crafting square emptied back into the inventory.
  putInCraft: (cell: number, index: number) => void;
  takeFromCraft: (cell: number) => void;
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
  private readonly ghost = document.createElement("canvas");
  readonly doll: HTMLCanvasElement;
  private renderedVersion = "";
  private readonly boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  private lastClick = { index: -1, ms: 0 };
  // The slot being dragged and where the cursor was when it was grabbed.
  private drag: { index: number; x: number; y: number; moved: boolean } | null = null;

  constructor(
    root: HTMLElement,
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
    private readonly crafting: CraftingGrid,
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
      <div class="craft">
        <div class="craft-grid"></div>
        <span class="craft-arrow">&#9654;</span>
        <button class="slot craft-result"></button>
      </div>
      <div class="craft-bar"><div class="craft-fill"></div><span class="craft-label"></span></div>
    `;
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
      button.addEventListener("click", () => {
        if (crafting.cells[cell]) on.takeFromCraft(cell);
        else on.putInCraft(cell, inventory.selected);
      });
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        on.takeFromCraft(cell);
      });
      button.addEventListener(VIRTUAL_MOUSEUP, () => {
        if (this.drag?.moved) on.putInCraft(cell, this.drag.index);
      });
      button.addEventListener("mousedown", (e) => e.preventDefault());
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
    document.body.appendChild(this.ghost);

    for (const slot of EQUIP_SLOTS) {
      const button = document.createElement("button");
      button.className = `slot equip equip-${slot}`;
      button.dataset.label = EQUIP_SLOT_NAMES[slot];
      button.addEventListener("click", () => on.clickEquip(slot));
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        on.takeOff(slot);
      });
      button.addEventListener(VIRTUAL_MOUSEUP, () => {
        if (this.drag?.moved) on.equip(slot, this.drag.index);
      });
      button.addEventListener("mousedown", (e) => e.preventDefault());
      dollEl.appendChild(button);
      this.equipEls.set(slot, button);
    }

    inventory.slots.forEach((_, i) => {
      const button = document.createElement("button");
      button.className = "slot";
      button.addEventListener("click", () => {
        inventory.select(i);
        const now = performance.now();
        if (this.lastClick.index === i && now - this.lastClick.ms < DOUBLE_CLICK_MS) {
          this.lastClick.index = -1;
          on.use(i);
          return;
        }
        this.lastClick = { index: i, ms: now };
        if (inventory.slots[i]) this.drag = { index: i, x: cursor.x, y: cursor.y, moved: false };
      });
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        on.drop(i);
      });
      button.addEventListener(VIRTUAL_MOUSEUP, () => {
        if (this.drag?.moved && this.drag.index !== i) on.move(this.drag.index, i);
      });
      // Keep focus on the game: a focused button would also react to Space.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      slotsEl.appendChild(button);
      this.slotEls.push(button);
    });

    // Released anywhere: the drag ends (after the square under it took it).
    document.addEventListener(VIRTUAL_MOUSEUP, () => {
      if (this.drag) this.slotEls[this.drag.index]?.classList.remove("is-dragging");
      this.drag = null;
      this.ghost.hidden = true;
    });
  }

  // The inventory slot being dragged (null when none, or not moved yet), for
  // a release outside the panel (on the map: drop it there).
  get draggedIndex(): number | null {
    return this.drag?.moved ? this.drag.index : null;
  }

  // Called every frame; only touches the DOM when the inventory changed, and
  // moves the dragged item with the cursor.
  update(): void {
    this.showDrag();
    this.showCraftProgress();
    const version = `${this.inventory.version}/${this.equipment.version}/${this.crafting.version}`;
    if (this.renderedVersion === version) return;
    this.renderedVersion = version;
    this.showCrafting();

    for (const [slot, el] of this.equipEls) {
      const item = this.equipment.slots[slot];
      el.replaceChildren();
      el.classList.toggle("is-empty", !item);
      el.title = item
        ? `${EQUIP_SLOT_NAMES[slot]}: ${item.name} (click or right click: take off)`
        : `${EQUIP_SLOT_NAMES[slot]} (drag an item here)`;
      if (item) el.appendChild(this.icon(item));
    }

    this.inventory.slots.forEach((slot, i) => {
      const el = this.slotEls[i];
      el.classList.toggle("is-selected", i === this.inventory.selected);
      el.replaceChildren();
      el.title = "";
      if (!slot) return;
      el.title = `${slot.item.name} (double click: use · right click: drop)`;
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

  private showCrafting(): void {
    this.crafting.cells.forEach((item, cell) => {
      const el = this.craftEls[cell];
      el.replaceChildren();
      el.title = item ? `${item.name} (click or right click: take back)` : "";
      if (item) el.appendChild(this.icon(item));
      el.classList.toggle("is-locked", this.crafting.isCrafting);
    });
    const recipe = this.crafting.match();
    const result = recipe ? ITEMS[recipe.result] : null;
    this.craftResult.replaceChildren();
    if (result) this.craftResult.appendChild(this.icon(result));
    this.craftResult.classList.toggle("is-ready", result !== null && !this.crafting.isCrafting);
    this.craftResult.classList.toggle("is-crafting", this.crafting.isCrafting);
    this.craftResult.title = !result
      ? "Nothing to make with this"
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

  private showDrag(): void {
    const drag = this.drag;
    const item = drag ? this.inventory.slots[drag.index]?.item : undefined;
    if (!drag || !item) {
      this.ghost.hidden = true;
      return;
    }
    if (!drag.moved && Math.hypot(this.cursor.x - drag.x, this.cursor.y - drag.y) < DRAG_START) return;
    if (!drag.moved) {
      drag.moved = true;
      this.slotEls[drag.index]?.classList.add("is-dragging");
      const icon = this.icon(item);
      this.ghost.width = icon.width;
      this.ghost.height = icon.height;
      this.ghost.getContext("2d")!.drawImage(icon, 0, 0);
    }
    this.ghost.hidden = false;
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
