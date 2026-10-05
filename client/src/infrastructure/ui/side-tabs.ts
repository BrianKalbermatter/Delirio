// Side panel split into tabs, one visible at a time. Each tab owns a root
// element where its sections build their DOM.

export class SideTabs<Id extends string> {
  private readonly buttons = new Map<Id, HTMLButtonElement>();
  private readonly pages = new Map<Id, HTMLElement>();

  constructor(root: HTMLElement, tabs: { id: Id; label: string }[], initial: Id) {
    const bar = document.createElement("nav");
    bar.className = "tabs";
    for (const { id, label } of tabs) {
      const button = document.createElement("button");
      button.className = "tab";
      button.textContent = label;
      button.addEventListener("click", () => this.select(id));
      // Keep focus on the game: a focused button would also react to Space.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      bar.appendChild(button);
      this.buttons.set(id, button);

      const page = document.createElement("section");
      page.className = "tab-page";
      this.pages.set(id, page);
    }
    root.replaceChildren(bar, ...this.pages.values());
    this.select(initial);
  }

  page(id: Id): HTMLElement {
    return this.pages.get(id)!;
  }

  select(id: Id): void {
    for (const [tab, button] of this.buttons) button.classList.toggle("is-selected", tab === id);
    for (const [tab, page] of this.pages) page.hidden = tab !== id;
  }
}
