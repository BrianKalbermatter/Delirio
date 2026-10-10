// What the player carries. Each slot holds one kind of item and a count.
import type { ItemKind } from "./items";

export interface Slot {
  item: ItemKind;
  count: number;
}

export class Inventory {
  readonly slots: (Slot | null)[];
  selected = 0;
  // Bumped on every change, so views can redraw only when needed.
  version = 0;

  constructor(size: number) {
    this.slots = Array.from({ length: size }, () => null);
  }

  // Stacks onto a slot with the same item, or takes the first empty one.
  // Returns false when the inventory is full.
  add(item: ItemKind): boolean {
    const stack = this.slots.find((s) => s?.item.id === item.id);
    if (stack) {
      stack.count++;
    } else {
      const empty = this.slots.indexOf(null);
      if (empty === -1) return false;
      this.slots[empty] = { item, count: 1 };
    }
    this.version++;
    return true;
  }

  // Takes one item out of a slot (emptying it with the last one) and returns
  // it, or null when the slot is empty.
  removeOne(index: number): ItemKind | null {
    const slot = this.slots[index];
    if (!slot) return null;
    slot.count--;
    if (slot.count === 0) this.slots[index] = null;
    this.version++;
    return slot.item;
  }

  select(index: number): void {
    if (index < 0 || index >= this.slots.length || index === this.selected) return;
    this.selected = index;
    this.version++;
  }

  has(itemId: string): boolean {
    return this.slots.some((s) => s?.item.id === itemId);
  }

  get selectedSlot(): Slot | null {
    return this.slots[this.selected];
  }
}
