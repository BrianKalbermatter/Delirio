// Mouse locked inside the whole page (Pointer Lock API): game and side panel.
// While locked the system cursor is hidden and cannot leave the window; the
// browser only reports how much the mouse moved, so this class keeps a virtual
// cursor in window (CSS) pixels.
//
// Since the real cursor is gone, clicks are routed by hand: a click over the
// game canvas or another press surface (the map book) holds the button, a
// click anywhere else clicks the button under the virtual cursor (inventory).
//
// The browser always releases the lock on Esc (no page can prevent it), and
// re-locking needs a user click. Both match the game flow: Esc opens the menu,
// a click on "Resume" locks again.

export class LockedMouse {
  // Virtual cursor in window CSS pixels.
  x = 0;
  y = 0;
  held = false; // left button down over the game or a press surface
  rightHeld = false; // right button down (anywhere)
  private hovered: Element | null = null;
  private readonly pressSurfaces = new Set<Element>();
  private readonly target = document.body;

  constructor(
    private readonly gameCanvas: HTMLCanvasElement,
    onLockChange: (locked: boolean) => void,
  ) {
    document.addEventListener("pointerlockchange", () => {
      if (!this.locked) {
        this.held = false;
        this.rightHeld = false;
        this.setHovered(null);
      }
      onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.x = clamp(this.x + e.movementX, 0, window.innerWidth - 1);
      this.y = clamp(this.y + e.movementY, 0, window.innerHeight - 1);
      this.setHovered(this.buttonUnderCursor());
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 2) {
        this.rightHeld = true;
        return;
      }
      if (e.button !== 0) return;
      if (this.overGame() || this.pressSurfaces.has(this.elementUnderCursor()!)) this.held = true;
      else (this.buttonUnderCursor() as HTMLElement | null)?.click();
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.held = false;
      if (e.button === 2) this.rightHeld = false;
    });
    // The right button is a game action, not the browser's context menu.
    document.addEventListener("contextmenu", (e) => {
      if (this.locked) e.preventDefault();
    });
    window.addEventListener("resize", () => {
      this.x = clamp(this.x, 0, window.innerWidth - 1);
      this.y = clamp(this.y, 0, window.innerHeight - 1);
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  // Must be called from a user gesture (a click). Starts the virtual cursor
  // where the real one was. Rejects if the browser refuses (for example,
  // right after Esc Chrome makes you wait about a second).
  async lock(fromX: number, fromY: number): Promise<void> {
    this.x = fromX;
    this.y = fromY;
    await this.target.requestPointerLock();
  }

  // Another element that receives presses like the game canvas (drawing).
  addPressSurface(el: Element): void {
    this.pressSurfaces.add(el);
  }

  isOver(el: Element): boolean {
    return this.elementUnderCursor() === el;
  }

  overGame(): boolean {
    return this.elementUnderCursor() === this.gameCanvas;
  }

  // Cursor position in the game canvas' own pixels (its internal resolution).
  inCanvas(): { x: number; y: number } {
    const rect = this.gameCanvas.getBoundingClientRect();
    return {
      x: ((this.x - rect.left) / rect.width) * this.gameCanvas.width,
      y: ((this.y - rect.top) / rect.height) * this.gameCanvas.height,
    };
  }

  private elementUnderCursor(): Element | null {
    return document.elementFromPoint(this.x, this.y);
  }

  private buttonUnderCursor(): Element | null {
    return this.elementUnderCursor()?.closest("button") ?? null;
  }

  // The real :hover does not follow a virtual cursor, so mark it by hand.
  private setHovered(el: Element | null): void {
    if (el === this.hovered) return;
    this.hovered?.classList.remove("is-hover");
    el?.classList.add("is-hover");
    this.hovered = el;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
