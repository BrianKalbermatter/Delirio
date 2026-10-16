// What the player wears and holds: one item per body part. Items go in and
// out of here from the inventory.
import type { ItemKind } from "./items";

export type EquipSlot = "head" | "body" | "legs" | "rightHand" | "leftHand";

export const EQUIP_SLOTS: EquipSlot[] = ["head", "body", "legs", "rightHand", "leftHand"];

export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  head: "Helmet",
  body: "Armor",
  legs: "Pants",
  rightHand: "Right hand",
  leftHand: "Left hand",
};

export class Equipment {
  readonly slots: Record<EquipSlot, ItemKind | null> = {
    head: null,
    body: null,
    legs: null,
    rightHand: null,
    leftHand: null,
  };
  // Bumped on every change, so views can redraw only when needed.
  version = 0;

  // Whether `item` can go on `slot`: worn items on their body part, anything
  // held (weapons, torches) in either hand.
  static fits(item: ItemKind, slot: EquipSlot): boolean {
    if (slot === "rightHand" || slot === "leftHand") return !!item.weapon;
    return item.wear === slot;
  }

  // The first free slot `item` fits on (the right hand before the left), or
  // null when there is none.
  freeSlotFor(item: ItemKind): EquipSlot | null {
    return EQUIP_SLOTS.find((s) => this.slots[s] === null && Equipment.fits(item, s)) ?? null;
  }

  // Puts `item` on `slot` and returns what was there.
  put(slot: EquipSlot, item: ItemKind): ItemKind | null {
    const old = this.slots[slot];
    this.slots[slot] = item;
    this.version++;
    return old;
  }

  take(slot: EquipSlot): ItemKind | null {
    const item = this.slots[slot];
    if (!item) return null;
    this.slots[slot] = null;
    this.version++;
    return item;
  }

  // Held or worn items, for effects that do not care where (a torch's light).
  get items(): ItemKind[] {
    return EQUIP_SLOTS.map((s) => this.slots[s]).filter((i): i is ItemKind => i !== null);
  }
}
