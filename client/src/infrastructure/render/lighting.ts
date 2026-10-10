// Ambient light of the maze, driven by the time of day, plus a soft light
// around the player. At night everything sinks into the dark except the
// player's surroundings; by day the maze is visible; at dawn and dusk the
// light turns warm while it changes. The player's light leans towards where
// they look, like the camera.
//
// The darkness is one screen-sized quad whose shader cuts the player's light
// out of it, so nothing is redrawn or allocated as the light moves or grows.
import "pixi.js/advanced-blend-modes"; // the twilight tint blends with soft-light
import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup } from "pixi.js";

type Rgb = [number, number, number];

const LEAN = 25; // px the light shifts towards the facing direction

// Darkness over the screen at night and by day.
const NIGHT = { color: [10, 10, 38] as Rgb, alpha: 0.85 }; // deep blue, not grey
const DAY = { color: [20, 16, 12] as Rgb, alpha: 0.04 }; // barely there: keep the colors alive
// Tint at dawn and dusk (strongest halfway through the change).
const TWILIGHT: Rgb = [110, 50, 18];
const TWILIGHT_ALPHA = 0.45;
// By day the player's light reaches this far: the whole screen.
const DAY_RADIUS = 900;

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// The darkness color, minus the light: fully lit inside the inner radius,
// fading through 0.45 at 60% of the way to nothing at the outer radius.
const FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform vec4 uDark;

void main() {
  float r = distance(vUV * uSize, uCenter);
  float t = clamp((r - uRadii.x) / (uRadii.y - uRadii.x), 0.0, 1.0);
  float light = t < 0.6 ? mix(1.0, 0.45, t / 0.6) : mix(0.45, 0.0, (t - 0.6) / 0.4);
  float alpha = uDark.a * (1.0 - light);
  finalColor = vec4(uDark.rgb * alpha, alpha);
}`;

export class Lighting {
  // The player's own faint glow at night. A light source item (lantern,
  // torch...) can raise these at runtime to widen the visible area.
  innerRadius = 24; // fully lit
  outerRadius = 120; // fully dark from here on

  // Screen space, over the world. The owner adds it to the stage.
  readonly view = new Container();
  private daylight = 0; // 0 = dark night, 1 = full day
  private readonly darkness: Mesh<MeshGeometry, Shader>;
  private readonly uniforms = new UniformGroup({
    uSize: { value: new Float32Array(2), type: "vec2<f32>" },
    uCenter: { value: new Float32Array(2), type: "vec2<f32>" },
    uRadii: { value: new Float32Array(2), type: "vec2<f32>" },
    uDark: { value: new Float32Array(4), type: "vec4<f32>" },
  });
  private readonly twilight = new Graphics();

  constructor(width: number, height: number) {
    const quad = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this.darkness = new Mesh({
      geometry: new MeshGeometry({ positions: quad, uvs: quad, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }),
      shader: Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT },
        resources: { lightUniforms: this.uniforms },
      }),
    });
    this.twilight.blendMode = "soft-light";
    this.view.addChild(this.darkness, this.twilight);
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.darkness.scale.set(width, height);
    this.uniforms.uniforms.uSize.set([width, height]);
    this.twilight.clear().rect(0, 0, width, height).fill(rgb(TWILIGHT));
  }

  setDaylight(value: number): void {
    this.daylight = Math.min(1, Math.max(0, value));
  }

  // (x, y) in screen pixels; (dirX, dirY) unit vector of the facing.
  update(x: number, y: number, dirX: number, dirY: number): void {
    const d = this.daylight;
    const u = this.uniforms.uniforms;
    u.uCenter.set([x + dirX * LEAN, y + dirY * LEAN]);
    u.uRadii.set([lerp(this.innerRadius, DAY_RADIUS * 0.4, d), lerp(this.outerRadius, DAY_RADIUS, d)]);
    const [r, g, b] = mix(NIGHT.color, DAY.color, d);
    u.uDark.set([Math.round(r) / 255, Math.round(g) / 255, Math.round(b) / 255, lerp(NIGHT.alpha, DAY.alpha, d)]);

    // Warm tint while it is getting light or dark.
    const twilight = 4 * d * (1 - d); // 0 at night and by day, 1 halfway
    this.twilight.visible = twilight > 0.01;
    this.twilight.alpha = TWILIGHT_ALPHA * twilight;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgb([r, g, b]: Rgb): number {
  return (r << 16) | (g << 8) | b;
}
