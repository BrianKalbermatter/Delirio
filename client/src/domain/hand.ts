// What the cursor carries in the inventory tab, like Minecraft's: a click on
// any square (inventory, body part, crafting) picks up what is there, and a
// click on another lays it down: stacked on the same item, swapped with a
// different one. The right button picks up half a stack, or lays down one.
// Nothing is lost while carried: it is out of the squares, here.
import { Equipment, type EquipSlot } from "./equipment";
import type { CraftingGrid } from "./crafting";
import type { Inventory, Slot } from "./inventory";
import type { ItemKind } from "./items";

export type Place =
  | { kind: "inventory"; index: number }
  | { kind: "equipment"; slot: EquipSlot }
  | { kind: "crafting"; cell: number };

export function samePlace(a: Place, b: Place): boolean {
  if (a.kind === "inventory" && b.kind === "inventory") return a.index === b.index;
  if (a.kind === "equipment" && b.kind === "equipment") return a.slot === b.slot;
  if (a.kind === "crafting" && b.kind === "crafting") return a.cell === b.cell;
  return false;
}

export class Hand {
  held: Slot | null = null;
  // Bumped on every change, so views can redraw only when needed.
  version = 0;

  constructor(
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
    private readonly crafting: CraftingGrid,
  ) {}

  // Left click on `place`: picks up all there is, or lays down all that is
  // held (as much as fits). A message when it could not.
  click(place: Place): string | null {
    return this.held ? this.lay(place, this.held.count) : this.pick(place, false);
  }

  // Right click: picks up half (the bigger half), or lays down one.
  rightClick(place: Place): string | null {
    return this.held ? this.lay(place, 1) : this.pick(place, true);
  }

  // Takes one of what is held out of the hand (to throw it on the floor).
  takeOne(): ItemKind | null {
    if (!this.held) return null;
    const { item } = this.held;
    this.held.count--;
    if (this.held.count === 0) this.held = null;
    this.version++;
    return item;
  }

  // Back into the inventory (when the game pauses). Returns what did not fit.
  stow(): Slot | null {
    const held = this.held;
    if (!held) return null;
    while (held.count > 0 && this.inventory.add(held.item)) held.count--;
    this.held = null;
    this.version++;
    return held.count > 0 ? held : null;
  }

  private pick(place: Place, half: boolean): string | null {
    if (place.kind === "inventory") {
      const slot = this.inventory.slots[place.index];
      if (!slot) return null;
      this.hold(this.inventory.take(place.index, half ? Math.ceil(slot.count / 2) : slot.count));
      return null;
    }
    if (place.kind === "equipment") {
      const item = this.equipment.take(place.slot);
      if (item) this.hold({ item, count: 1 });
      return null;
    }
    if (!this.crafting.cells[place.cell]) return null;
    if (this.crafting.isCrafting) return "Wait until it is made, or stop it (right click on the result).";
    const item = this.crafting.take(place.cell);
    if (item) this.hold({ item, count: 1 });
    return null;
  }

  // Lays `count` of what is held on `place` (all of it if `count` is all).
  private lay(place: Place, count: number): string | null {
    const held = this.held!;
    if (place.kind === "inventory") {
      const there = this.inventory.slots[place.index];
      if (there && there.item.id !== held.item.id) {
        // A different item: swapped, unless only part of the hand goes down.
        if (count < held.count) return null;
        const taken = this.inventory.take(place.index, there.count);
        this.inventory.place(place.index, held);
        this.hold(taken);
        return null;
      }
      this.inventory.place(place.index, { item: held.item, count });
      this.spend(count);
      return null;
    }
    // A body part and a crafting square hold a single item.
    if (place.kind === "equipment") {
      if (!Equipment.fits(held.item, place.slot)) return `The ${held.item.name.toLowerCase()} does not go there.`;
      const old = this.equipment.slots[place.slot];
      if (old && held.count > 1) {
        // Two kinds cannot be held at once: what was there goes to the inventory.
        if (!this.inventory.add(old)) return "The inventory is full.";
        this.equipment.take(place.slot);
      }
      const swapped = this.equipment.put(place.slot, held.item);
      this.spend(1);
      if (swapped) this.hold({ item: swapped, count: 1 });
      return null;
    }
    if (this.crafting.isCrafting) return "Wait until it is made, or stop it (right click on the result).";
    const there = this.crafting.cells[place.cell];
    if (there) {
      if (there.id === held.item.id || held.count > 1) return null;
      this.crafting.take(place.cell);
      this.crafting.put(place.cell, held.item);
      this.hold({ item: there, count: 1 });
      return null;
    }
    this.crafting.put(place.cell, held.item);
    this.spend(1);
    return null;
  }

  private hold(slot: Slot | null): void {
    this.held = slot;
    this.version++;
  }

  // `count` of what is held went down somewhere.
  private spend(count: number): void {
    this.held!.count -= count;
    if (this.held!.count <= 0) this.held = null;
    this.version++;
  }
}
