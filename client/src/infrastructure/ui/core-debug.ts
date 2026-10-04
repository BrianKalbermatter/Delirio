// Live view of what goes into and comes out of the C core each frame, so
// changes in src/main.c can be checked at a glance.

export class CoreDebug {
  private readonly el: HTMLPreElement;
  private last = "";

  constructor(root: HTMLElement) {
    const title = document.createElement("h2");
    title.textContent = "C core (main.c)";
    this.el = document.createElement("pre");
    this.el.className = "core";
    root.append(title, this.el);
  }

  // One line per [label, value].
  show(rows: [string, string][]): void {
    const width = Math.max(...rows.map(([label]) => label.length)) + 2;
    const text = rows.map(([label, value]) => label.padEnd(width) + value).join("\n");
    if (text === this.last) return; // touch the DOM only on changes
    this.last = text;
    this.el.textContent = text;
  }
}
