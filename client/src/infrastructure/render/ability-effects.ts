// Placeholder visuals for the abilities until they have sprites: a colored
// shape around the player while an ability is active, and its name floating
// up when it starts. Activations are detected from the C state (inactive ->
// active), so an ability that was still recharging shows nothing.
import { Container, Graphics, type Text } from "pixi.js";
import { ABILITY, type AbilityState } from "../wasm/game-wasm";
import { pixelText, placeText } from "./hud";

const COLOR: Record<number, string> = {
  [ABILITY.ATAQUE_LIGERO]: "#d8cfb8",
  [ABILITY.ATAQUE_RAPIDO]: "#e0d090",
  [ABILITY.ATAQUE_LARGO]: "#e0a458",
  [ABILITY.ATAQUE_CRITICO]: "#d95763",
  [ABILITY.APOYO]: "#7ccf7a",
  [ABILITY.PARRY]: "#aaf5ff",
  [ABILITY.ULTI]: "#c58cf0",
  [ABILITY.BLOQUEAR]: "#8fa6c9",
  [ABILITY.RODAR]: "#d8cfb8",
  [ABILITY.CORRER]: "#d8cfb8",
};

// Shown as floating text but with no shape (their effect is the movement).
const TEXT_ONLY = new Set<number>([ABILITY.RODAR, ABILITY.CORRER]);
const ATTACKS = new Set<number>([
  ABILITY.ATAQUE_LIGERO,
  ABILITY.ATAQUE_RAPIDO,
  ABILITY.ATAQUE_LARGO,
  ABILITY.ATAQUE_CRITICO,
]);

const LABEL_MS = 800;
const LABEL_FONT = { fontFamily: "monospace", fontSize: 9 };

interface Label {
  text: Text;
  ageMs: number;
}

export class AbilityEffects {
  // Screen space. The owner adds it to the stage.
  readonly view = new Container();
  private readonly shapes = new Graphics();
  private wasActive: boolean[] = [];
  private labels: Label[] = [];
  private active: number[] = [];

  constructor() {
    this.view.addChild(this.shapes);
  }

  // Returns the abilities that started this frame (for the log).
  update(abilities: AbilityState[], dtMs: number): AbilityState[] {
    const started: AbilityState[] = [];
    this.active = [];
    abilities.forEach((a, id) => {
      if (a.active) this.active.push(id);
      if (a.active && !this.wasActive[id]) {
        started.push(a);
        const text = pixelText({ ...LABEL_FONT, fill: COLOR[id] ?? "#fff" }, a.name);
        this.view.addChild(text);
        this.labels.push({ text, ageMs: 0 });
      }
      this.wasActive[id] = a.active;
    });
    for (const label of this.labels) label.ageMs += dtMs;
    this.labels = this.labels.filter((label) => {
      if (label.ageMs < LABEL_MS) return true;
      label.text.destroy();
      return false;
    });
    return started;
  }

  // (x, feetY) player feet on screen, bodyH its drawn height, (dirX, dirY) facing.
  show(x: number, feetY: number, bodyH: number, dirX: number, dirY: number, timeMs: number): void {
    const cy = feetY - bodyH / 2;
    const g = this.shapes.clear();
    for (const id of this.active) {
      if (TEXT_ONLY.has(id)) continue;
      const stroke = { width: 2, color: COLOR[id] };
      if (ATTACKS.has(id)) {
        // Slash: an arc in front of the player.
        const angle = Math.atan2(dirY, dirX);
        const reach = id === ABILITY.ATAQUE_LARGO ? 34 : 24;
        const ax = x + dirX * 6;
        const ay = cy + dirY * 6;
        g.moveTo(ax + reach * Math.cos(angle - 0.9), ay + reach * Math.sin(angle - 0.9));
        g.arc(ax, ay, reach, angle - 0.9, angle + 0.9).stroke(stroke);
      } else if (id === ABILITY.PARRY) {
        // Quick bright ring.
        g.circle(x, cy, 22).stroke(stroke);
      } else if (id === ABILITY.BLOQUEAR) {
        // Shield: a half ring on the facing side.
        const angle = Math.atan2(dirY, dirX);
        g.moveTo(x + 20 * Math.cos(angle - 1.3), cy + 20 * Math.sin(angle - 1.3));
        g.arc(x, cy, 20, angle - 1.3, angle + 1.3).stroke(stroke);
      } else {
        // Aura (support, ulti): pulsing ellipse on the floor.
        const pulse = 1 + 0.12 * Math.sin(timeMs / 90);
        const size = id === ABILITY.ULTI ? 34 : 24;
        g.ellipse(x, feetY, size * pulse, size * 0.45 * pulse).stroke({ ...stroke, alpha: 0.8 });
      }
    }

    // Names floating up and fading out.
    this.labels.forEach((label, i) => {
      const t = label.ageMs / LABEL_MS;
      label.text.alpha = 1 - t;
      placeText(label.text, Math.round(x), Math.round(feetY - bodyH - 6 - t * 14 - i * 10), "center");
    });
  }
}
