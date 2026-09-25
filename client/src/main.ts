// Composition root: wires infrastructure adapters to application use cases.
// Lab mode: renders the C game state (via WebAssembly) on a 2D canvas.
import { loadGameWasm } from "./infrastructure/wasm/game-wasm";

const canvas = document.createElement("canvas");
canvas.width = 640;
canvas.height = 360;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

const game = await loadGameWasm();

function draw(): void {
  const life = game.medusaLife();
  const max = game.medusaLifeMax();
  const ratio = life / max;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#0ff";
  ctx.font = "20px monospace";
  ctx.fillText("MEDUSA", 40, 60);
  ctx.fillText(`${life} / ${max}`, 40, 130);
  ctx.fillText(life === 0 ? "DEAD" : "click / space = attack, R = reset", 40, 300);

  ctx.strokeStyle = "#f0f";
  ctx.strokeRect(40, 80, 400, 24);
  ctx.fillStyle = ratio > 0.3 ? "#0f0" : "#f00";
  ctx.fillRect(42, 82, 396 * ratio, 20);
}

function attack(): void {
  const killed = game.attack();
  if (killed) console.log("medusa killed");
  draw();
}

canvas.addEventListener("click", attack);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") attack();
  if (e.code === "KeyR") {
    game.reset();
    draw();
  }
});

draw();
