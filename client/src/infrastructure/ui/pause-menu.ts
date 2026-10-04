// Overlay over the game shown whenever the mouse is not locked: at start
// ("click to play") and after Esc (the options menu). Clicking "Resume" locks
// the mouse again.

export class PauseMenu {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly error: HTMLElement;
  private readonly resume: HTMLButtonElement;

  // onResume gets the click position, where the virtual cursor starts.
  constructor(root: HTMLElement, onResume: (x: number, y: number) => Promise<void>) {
    this.el = document.createElement("div");
    this.el.className = "pause";
    this.el.innerHTML = `
      <div class="pause-box">
        <h1 class="pause-title"></h1>
        <button class="pause-resume" type="button">Play</button>
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
