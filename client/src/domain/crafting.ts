// Crafting: a 3x3 grid under the player in the inventory tab. Items placed in
// it (one per square) that make a recipe's shape, anywhere in the grid and
// also mirrored, can be crafted: it takes the recipe's time, a bar fills up,
// and then the items are used up and the result comes out.
import { ITEMS, type ItemKind } from "./items";

export const CRAFT_SIZE = 3;

export interface Recipe {
  result: string; // item id
  // Rows of the shape, one character per square ("." empty); `key` says
  // which item each character is.
  pattern: string[];
  key: Record<string, string>;
  ms: number; // how long it takes to make
}

export const RECIPES: Recipe[] = [
  {
    result: "torch",
    pattern: ["B", "B"],
    key: { B: "branch" },
    ms: 3000,
  },
  {
    // Three branches on a diagonal (either one: the shape also counts mirrored).
    result: "spear",
    pattern: ["B..", ".B.", "..B"],
    key: { B: "branch" },
    ms: 4000,
  },
  {
    result: "axe",
    pattern: ["SS", ".B", ".B"],
    key: { S: "enemy_sword", B: "branch" },
    ms: 5000,
  },
];

export class CraftingGrid {
  readonly cells: (ItemKind | null)[] = Array.from({ length: CRAFT_SIZE * CRAFT_SIZE }, () => null);
  // Bumped on every change, so views can redraw only when needed.
  version = 0;
  // What is being made and for how long already.
  private job: { recipe: Recipe; ms: number } | null = null;

  get isCrafting(): boolean {
    return this.job !== null;
  }

  // 0..1 of the current job (0 when none).
  get progress(): number {
    return this.job ? Math.min(1, this.job.ms / this.job.recipe.ms) : 0;
  }

  // Puts `item` in an empty square. False if it is taken or crafting.
  put(cell: number, item: ItemKind): boolean {
    if (this.job || this.cells[cell]) return false;
    this.cells[cell] = item;
    this.version++;
    return true;
  }

  // Takes the item out of a square (null if empty or crafting).
  take(cell: number): ItemKind | null {
    const item = this.cells[cell];
    if (this.job || !item) return null;
    this.cells[cell] = null;
    this.version++;
    return item;
  }

  // The recipe the grid makes now, if any.
  match(): Recipe | null {
    const shape = trim(this.cells.map((item) => item?.id ?? null));
    if (!shape) return null;
    return RECIPES.find((r) => sameShape(shape, r) || sameShape(shape.map((row) => [...row].reverse()), r)) ?? null;
  }

  // Starts making what the grid matches. False if nothing (or already busy).
  start(): Recipe | null {
    const recipe = this.job ? null : this.match();
    if (!recipe) return null;
    this.job = { recipe, ms: 0 };
    this.version++;
    return recipe;
  }

  // Cancels the job: the items stay where they were.
  cancel(): void {
    if (!this.job) return;
    this.job = null;
    this.version++;
  }

  // Moves the job on. When it is done the items are used up and the result
  // is returned (null meanwhile).
  update(dtMs: number): ItemKind | null {
    if (!this.job) return null;
    this.job.ms += dtMs;
    if (this.job.ms < this.job.recipe.ms) return null;
    const result = ITEMS[this.job.recipe.result];
    this.job = null;
    this.cells.fill(null);
    this.version++;
    return result;
  }
}

// The item ids in rows, without the empty rows and columns around them
// (null if the grid is empty).
function trim(ids: (string | null)[]): (string | null)[][] | null {
  const rows = Array.from({ length: CRAFT_SIZE }, (_, r) => ids.slice(r * CRAFT_SIZE, (r + 1) * CRAFT_SIZE));
  const used = (r: number, c: number) => rows[r][c] !== null;
  const rowsUsed = rows.map((_, r) => rows[r].some((_, c) => used(r, c)));
  const colsUsed = rows[0].map((_, c) => rows.some((_, r) => used(r, c)));
  if (!rowsUsed.includes(true)) return null;
  const [r0, r1] = [rowsUsed.indexOf(true), rowsUsed.lastIndexOf(true)];
  const [c0, c1] = [colsUsed.indexOf(true), colsUsed.lastIndexOf(true)];
  return rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
}

function sameShape(shape: (string | null)[][], recipe: Recipe): boolean {
  const { pattern, key } = recipe;
  if (shape.length !== pattern.length) return false;
  return pattern.every((row, r) => {
    if (shape[r].length !== row.length) return false;
    return [...row].every((ch, c) => shape[r][c] === (ch === "." ? null : key[ch]));
  });
}
