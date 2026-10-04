// Side panel section listing the player's abilities: key, name, and whether
// each one is ready, active or recharging. Stands in for their animations
// until those exist.
import type { AbilityState } from "../wasm/game-wasm";

export class AbilityPanel {
  private readonly list: HTMLOListElement;
  private last = "";

  constructor(
    root: HTMLElement,
    private readonly keyLabels: Record<number, string>,
  ) {
    const title = document.createElement("h2");
    title.textContent = "Abilities";
    this.list = document.createElement("ol");
    this.list.className = "abilities";
    root.append(title, this.list);
  }

  show(abilities: AbilityState[]): void {
    const rows = abilities.map((a, id) => {
      const status = a.active
        ? "ACTIVE"
        : a.cooldownMs > 0
          ? `${(a.cooldownMs / 1000).toFixed(1)}s`
          : "ready";
      const css = a.active ? "is-active" : a.cooldownMs > 0 ? "is-cooling" : "";
      return { key: this.keyLabels[id] ?? "", name: a.name, status, css };
    });
    const text = JSON.stringify(rows);
    if (text === this.last) return; // touch the DOM only on changes
    this.last = text;

    this.list.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement("li");
        li.className = row.css;
        const key = document.createElement("kbd");
        key.textContent = row.key;
        const name = document.createElement("span");
        name.textContent = row.name;
        const status = document.createElement("span");
        status.className = "status";
        status.textContent = row.status;
        li.append(key, name, status);
        return li;
      }),
    );
  }
}
