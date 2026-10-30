// Overlay over the game shown whenever the mouse is not locked: at start
// ("click to play") and after Esc (the options menu). Clicking "Resume" locks
// the mouse again.

export class PauseMenu {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly error: HTMLElement;
  private readonly resume: HTMLButtonElement;

  // onResume gets the click position, where the virtual cursor starts.
  // onNewGame leaves this game for a new maze from the base.
  constructor(
    root: HTMLElement,
    onResume: (x: number, y: number) => Promise<void>,
    onNewGame: () => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "pause";
    this.el.innerHTML = `
      <div class="pause-box">
        <h1 class="pause-title"></h1>
        <button class="pause-resume" type="button">Play</button>
        <button class="pause-new" type="button">New game</button>
        <p class="pause-help">Left click: move · Esc: this menu</p>
        <p class="pause-options">Options: coming soon</p>
        <p class="pause-error" role="alert"></p>
      </div>
    `;
    this.title = this.el.querySelector(".pause-title")!;
    this.error = this.el.querySelector(".pause-error")!;
    this.resume = this.el.querySelector<HTMLButtonElement>(".pause-resume")!;
    this.resume.addEventListener("click", async (e) => {
      // Only real mouse clicks: a keyboard "click" (Space/Enter on the focused
      // button) has no position and must not steal game keys.
      if (e.detail === 0) return;
      this.error.textContent = "";
      try {
        await onResume(e.clientX, e.clientY);
      } catch {
        // Chrome refuses to re-lock for about a second after Esc.
        this.error.textContent = "The browser needs a second after Esc. Click again.";
      }
    });
    this.el.querySelector<HTMLButtonElement>(".pause-new")!.addEventListener("click", (e) => {
      if (e.detail === 0) return; // only real clicks, like Resume
      if (confirm("Start a new maze from the base? Level and skills are kept; what you carry is lost.")) onNewGame();
    });
    root.appendChild(this.el);
    this.show(true);
  }

  show(firstTime = false): void {
    this.title.textContent = firstTime ? "Delirio" : "Paused";
    this.resume.textContent = firstTime ? "Play" : "Resume";
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    // Drop the focus from the button, or Space would keep "pressing" it.
    this.resume.blur();
  }
}
