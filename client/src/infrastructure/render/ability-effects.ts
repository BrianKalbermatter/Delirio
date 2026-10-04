// Placeholder visuals for the abilities until they have sprites: a colored
// shape around the player while an ability is active, and its name floating
// up when it starts. Activations are detected from the C state (inactive ->
// active), so an ability that was still recharging shows nothing.
import { ABILITY, type AbilityState } from "../wasm/game-wasm";

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

interface Label {
  text: string;
  color: string;
  ageMs: number;
}

export class AbilityEffects {
  private wasActive: boolean[] = [];
  private labels: Label[] = [];
  private active: number[] = [];

  // Returns the abilities that started this frame (for the log).
  update(abilities: AbilityState[], dtMs: number): AbilityState[] {
    const started: AbilityState[] = [];
    this.active = [];
    abilities.forEach((a, id) => {
      if (a.active) this.active.push(id);
      if (a.active && !this.wasActive[id]) {
        started.push(a);
        this.labels.push({ text: a.name, color: COLOR[id] ?? "#fff", ageMs: 0 });
      }
      this.wasActive[id] = a.active;
    });
    for (const label of this.labels) label.ageMs += dtMs;
    this.labels = this.labels.filter((l) => l.ageMs < LABEL_MS);
    return started;
  }

  // (x, feetY) player feet on screen, bodyH its drawn height, (dirX, dirY) facing.
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    feetY: number,
    bodyH: number,
    dirX: number,
    dirY: number,
    timeMs: number,
  ): void {
    const cy = feetY - bodyH / 2;
    ctx.save();
    ctx.lineWidth = 2;
    for (const id of this.active) {
      if (TEXT_ONLY.has(id)) continue;
      ctx.strokeStyle = COLOR[id];
      ctx.fillStyle = COLOR[id];
      ctx.beginPath();
      if (ATTACKS.has(id)) {
        // Slash: an arc in front of the player.
        const angle = Math.atan2(dirY, dirX);
        const reach = id === ABILITY.ATAQUE_LARGO ? 34 : 24;
        ctx.arc(x + dirX * 6, cy + dirY * 6, reach, angle - 0.9, angle + 0.9);
        ctx.stroke();
      } else if (id === ABILITY.PARRY) {
        // Quick bright ring.
        ctx.arc(x, cy, 22, 0, Math.PI * 2);
        ctx.stroke();
      } else if (id === ABILITY.BLOQUEAR) {
        // Shield: a half ring on the facing side.
        const angle = Math.atan2(dirY, dirX);
        ctx.arc(x, cy, 20, angle - 1.3, angle + 1.3);
        ctx.stroke();
      } else {
        // Aura (support, ulti): pulsing ellipse on the floor.
        const pulse = 1 + 0.12 * Math.sin(timeMs / 90);
        const size = id === ABILITY.ULTI ? 34 : 24;
        ctx.globalAlpha = 0.8;
        ctx.ellipse(x, feetY, size * pulse, size * 0.45 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Names floating up and fading out.
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    this.labels.forEach((label, i) => {
      const t = label.ageMs / LABEL_MS;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, Math.round(x), Math.round(feetY - bodyH - 6 - t * 14 - i * 10));
    });
    ctx.restore();
  }
}
