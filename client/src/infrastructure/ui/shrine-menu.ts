// The list of the shrines awake, opened with E on one of them: pick where to go.
// The game waits while it is open. Plain buttons: the locked mouse clicks them,
// and 1-9 do too; E closes it.
import { SHRINE_NAMES, type Shrine } from "../../domain/shrines";
import type { SpriteSheet } from "../render/sprite-sheet";

const THUMB_SCALE = 0.5; // of the drawing, 48x80

export class ShrineMenu {
  private readonly element = document.createElement("div");
  private readonly list = document.createElement("div");
  private targets: Shrine[] = [];

  constructor(
    root: HTMLElement,
    private readonly sheet: SpriteSheet,
    private readonly onPick: (shrine: Shrine) => void,
  ) {
    this.element.className = "shrine-menu";
    this.element.hidden = true;
    const title = document.createElement("p");
    title.className = "shrine-menu-title";
    title.textContent = "Shrines";
    const help = document.createElement("p");
    help.className = "shrine-menu-help";
    help.textContent = "Click or 1-9: travel · E: close";
    this.element.append(title, this.list, help);
    root.appendChild(this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  // `here`: the shrine the player stands at, listed but not a destination.
  open(awake: Shrine[], here: Shrine): void {
    this.targets = awake.filter((s) => s !== here);
    this.list.replaceChildren(...awake.map((shrine) => this.row(shrine, here)));
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
  }

  // A key while it is open: 1-9 go to that destination, E closes.
  press(code: string): void {
    if (code === "KeyE") this.close();
    const digit = /^Digit([1-9])$/.exec(code);
    const target = digit ? this.targets[Number(digit[1]) - 1] : undefined;
    if (target) this.pick(target);
  }

  private pick(shrine: Shrine): void {
    this.close();
    this.onPick(shrine);
  }

  private row(shrine: Shrine, here: Shrine): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shrine-menu-row";
    button.disabled = shrine === here;
    const number = this.targets.indexOf(shrine) + 1;
    const name = document.createElement("span");
    name.textContent = shrine === here ? `${SHRINE_NAMES[shrine.id]} (you are here)` : `${number}. ${SHRINE_NAMES[shrine.id]}`;
    button.append(this.thumb(shrine), name);
    button.addEventListener("click", () => this.pick(shrine));
    return button;
  }

  private thumb(shrine: Shrine): HTMLCanvasElement {
    const { x, y, w, h } = this.sheet.frames[shrine.id];
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w * THUMB_SCALE}px`;
    canvas.style.height = `${h * THUMB_SCALE}px`;
    canvas.getContext("2d")!.drawImage(this.sheet.image, x, y, w, h, 0, 0, w, h);
    return canvas;
  }
}
