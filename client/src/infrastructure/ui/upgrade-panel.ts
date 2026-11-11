// Skills tab, on top: the level points and what they buy. Each level gives a
// point; a "+" spends it on more life, more mobility, the double jump, reach
// or the build level. The build level only goes up while the player's level
// is above it (to build level 2 at level 2, to 3 at level 3...): each one
// unlocks more to make (domain/crafting.ts). It
// lives in the side panel, away from the map, so levelling up never stops
// the fight: the points wait until there is a moment to spend them.
import { UPGRADE, UPGRADE_COUNT, type PlayerStats } from "../wasm/game-wasm";

const ROWS: { id: number; name: string; effect: string }[] = [
  { id: UPGRADE.LIFE, name: "Life", effect: "+15 max life" },
  { id: UPGRADE.MOBILITY, name: "Mobility", effect: "+8% walk, run and jump speed" },
  { id: UPGRADE.DOUBLE_JUMP, name: "Double jump", effect: "Space again in the air: jump once more" },
  { id: UPGRADE.REACH, name: "Reach", effect: "Coins on the floor come to you from further away" },
  { id: UPGRADE.BUILD, name: "Build", effect: "Next build level: unlocks more to craft" },
];

export class UpgradePanel {
  private readonly summary: HTMLElement;
  private readonly rows: { level: HTMLElement; effect: HTMLElement; button: HTMLButtonElement; li: HTMLElement }[] = [];
  private last = "";

  constructor(root: HTMLElement, onUpgrade: (id: number) => void) {
    const title = document.createElement("h2");
    title.textContent = "Level";
    this.summary = document.createElement("p");
    this.summary.className = "points";
    const list = document.createElement("ol");
    list.className = "upgrades";
    for (const row of ROWS) {
      const li = document.createElement("li");
      const text = document.createElement("div");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = row.name;
      const effect = document.createElement("span");
      effect.className = "effect";
      effect.textContent = row.effect;
      text.append(name, effect);
      const level = document.createElement("span");
      level.className = "level";
      const button = document.createElement("button");
      button.className = "plus";
      button.textContent = "+";
      button.title = `${row.name}: ${row.effect}`;
      button.addEventListener("click", () => onUpgrade(row.id));
      // Keep focus on the game: a focused button would also react to Space.
      button.addEventListener("mousedown", (e) => e.preventDefault());
      li.append(text, level, button);
      list.append(li);
      this.rows[row.id] = { level, effect, button, li };
    }
    root.prepend(title, this.summary, list);
  }

  show({ level, points, upgrades, upgradeMax, buildLevel }: PlayerStats): void {
    const text = JSON.stringify([level, points, upgrades, buildLevel]);
    if (text === this.last) return; // touch the DOM only on changes
    this.last = text;
    this.summary.textContent = `Level ${level} · ${points} point${points === 1 ? "" : "s"} to spend`;
    this.summary.classList.toggle("has-points", points > 0);
    for (let id = 0; id < UPGRADE_COUNT; id++) {
      const row = this.rows[id];
      const maxed = upgrades[id] >= upgradeMax[id];
      row.level.textContent = upgradeMax[id] === 1 ? (maxed ? "learned" : "") : `${upgrades[id]}/${upgradeMax[id]}`;
      let locked = false;
      if (id === UPGRADE.BUILD) {
        // Shown as the build level itself, and it needs the player above it
        row.level.textContent = `Lv ${buildLevel}`;
        locked = !maxed && level <= buildLevel;
        row.effect.textContent = maxed
          ? "Top build level"
          : locked
            ? `Build level ${buildLevel + 1} needs your level ${buildLevel + 1}`
            : `Up to build level ${buildLevel + 1}: unlocks more to craft`;
      }
      row.button.disabled = points <= 0 || maxed || locked;
      row.li.classList.toggle("is-maxed", maxed);
    }
  }
}
