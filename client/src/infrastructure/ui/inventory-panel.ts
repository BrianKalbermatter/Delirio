// Inventory tab of the side panel: the slot grid on top, the selected item,
// and below them the player standing on a lit background with a square on
// each body part. Items are put on by dragging them onto a square, by
// selecting them and clicking the square, or with a double click (use it).
// Plain DOM next to the game canvas.
import { EQUIP_SLOT_NAMES, EQUIP_SLOTS, type EquipSlot, type Equipment } from "../../domain/equipment";
import type { Inventory } from "../../domain/inventory";
import { VIRTUAL_MOUSEUP } from "../input/locked-mouse";
import type { SpriteSheet } from "../render/sprite-sheet";

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
  // An inventory slot dragged onto a body part's square.
  equip: (slot: EquipSlot, index: number) => void;
  // Left click on a body part's square: put the selected item on it, or take
  // off what it has.
  clickEquip: (slot: EquipSlot) => void;
  // Right click on it: take it off.
  takeOff: (slot: EquipSlot) => void;
}

export class InventoryPanel {
  private readonly slotEls: HTMLButtonElement[] = [];
  private readonly equipEls = new Map<EquipSlot, HTMLButtonElement>();
  private readonly selectedEl: HTMLElement;
  private readonly ghost = document.createElement("canvas");
  readonly doll: HTMLCanvasElement;
  private renderedVersion = "";
  private lastClick = { index: -1, ms: 0 };
  // The slot being dragged and where the cursor was when it was grabbed.
  private drag: { index: number; x: number; y: number; moved: boolean } | null = null;

  constructor(
    root: HTMLElement,
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
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
      <p class="hint">Double click an item to use it or hold it. Drag it onto a square to put it there.</p>
    `;
    const slotsEl = root.querySelector<HTMLElement>(".slots")!;
    this.selectedEl = root.querySelector<HTMLElement>(".selected")!;
    const dollEl = root.querySelector<HTMLElement>(".doll")!;
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
      // Keep focus on the game: a focused button would also react to Space.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      slotsEl.appendChild(button);
      this.slotEls.push(button);
    });

    // Released anywhere: the drag ends (after the square under it took it).
    document.addEventListener(VIRTUAL_MOUSEUP, () => {
      this.drag = null;
      this.ghost.hidden = true;
    });
  }

  // Called every frame; only touches the DOM when the inventory changed, and
  // moves the dragged item with the cursor.
  update(): void {
    this.showDrag();
    const version = `${this.inventory.version}/${this.equipment.version}`;
    if (this.renderedVersion === version) return;
    this.renderedVersion = version;

    for (const [slot, el] of this.equipEls) {
      const item = this.equipment.slots[slot];
      el.replaceChildren();
      el.classList.toggle("is-empty", !item);
      el.title = item
        ? `${EQUIP_SLOT_NAMES[slot]}: ${item.name} (click or right click: take off)`
        : `${EQUIP_SLOT_NAMES[slot]} (drag an item here)`;
      if (item) el.appendChild(this.icon(item.sprite, item.frame));
    }

    this.inventory.slots.forEach((slot, i) => {
      const el = this.slotEls[i];
      el.classList.toggle("is-selected", i === this.inventory.selected);
      el.replaceChildren();
      el.title = "";
      if (!slot) return;
      el.title = `${slot.item.name} (double click: use · right click: drop)`;
      el.appendChild(this.icon(slot.item.sprite, slot.item.frame));
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
      const icon = this.icon(item.sprite, item.frame);
      this.ghost.width = icon.width;
      this.ghost.height = icon.height;
      this.ghost.getContext("2d")!.drawImage(icon, 0, 0);
    }
    this.ghost.hidden = false;
    this.ghost.style.transform = `translate(${this.cursor.x - ICON_SIZE / 2}px, ${this.cursor.y - ICON_SIZE / 2}px)`;
  }

  // Item icon cut from its sprite sheet, centered in a 32x32 canvas.
  private icon(sprite: string, frameIndex: number): HTMLCanvasElement {
    const sheet = this.sheets.get(sprite)!;
    const f = sheet.frames[frameIndex];
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const scale = Math.min(1, ICON_SIZE / Math.max(f.w, f.h));
    const w = f.w * scale;
    const h = f.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.image, f.x, f.y, f.w, f.h, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
    return canvas;
  }
}
