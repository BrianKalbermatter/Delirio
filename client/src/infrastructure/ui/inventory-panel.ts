// Inventory tab of the side panel: slot grid and the selected item.
// Plain DOM next to the game canvas.
import type { Inventory } from "../../domain/inventory";
import type { SpriteSheet } from "../render/sprite-sheet";

const ICON_SIZE = 32;

export class InventoryPanel {
  private readonly slotEls: HTMLButtonElement[] = [];
  private readonly selectedEl: HTMLElement;
  private renderedVersion = -1;

  constructor(
    root: HTMLElement,
    private readonly inventory: Inventory,
    private readonly sheets: Map<string, SpriteSheet>,
  ) {
    root.innerHTML = `
      <h2>Inventory</h2>
      <div class="slots"></div>
      <h2>Selected</h2>
      <div class="selected"></div>
    `;
    const slotsEl = root.querySelector<HTMLElement>(".slots")!;
    this.selectedEl = root.querySelector<HTMLElement>(".selected")!;

    inventory.slots.forEach((_, i) => {
      const button = document.createElement("button");
      button.className = "slot";
      button.addEventListener("click", () => inventory.select(i));
      // Keep focus on the game: a focused button would also react to Space.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      slotsEl.appendChild(button);
      this.slotEls.push(button);
    });
  }

  // Called every frame; only touches the DOM when the inventory changed.
  update(): void {
    if (this.renderedVersion === this.inventory.version) return;
    this.renderedVersion = this.inventory.version;

    this.inventory.slots.forEach((slot, i) => {
      const el = this.slotEls[i];
      el.classList.toggle("is-selected", i === this.inventory.selected);
      el.replaceChildren();
      if (!slot) return;
      el.title = slot.item.name;
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
