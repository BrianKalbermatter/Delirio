// Short list of what just happened in the game, newest first.

const LOG_LINES = 8;

export class GameLog {
  private readonly list: HTMLOListElement;

  constructor(root: HTMLElement) {
    const title = document.createElement("h2");
    title.textContent = "Log";
    this.list = document.createElement("ol");
    this.list.className = "log";
    root.append(title, this.list);
  }

  log(message: string): void {
    const li = document.createElement("li");
    li.textContent = message;
    this.list.prepend(li);
    while (this.list.children.length > LOG_LINES) this.list.lastElementChild!.remove();
  }
}
