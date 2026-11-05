// The level up: a shockwave of essence bursting out of the player, once the
// aura (level-aura.ts) has wrapped them. It has no color of its own: it is
// only seen in the image it bends as it crosses the screen, slowly, bending
// it harder the further it gets, with ripples behind it.
//
// It is a filter over the scene (the world and its light, not the HUD), so it
// is only attached while a wave is running: the rest of the time it costs
// nothing.
import { type Container, defaultFilterVert, Filter, GlProgram, Rectangle, UniformGroup } from "pixi.js";

const DURATION_MS = 3400;
// The front ends this far from where it started, as a share of the screen's
// diagonal: past the corners even if the player is off center.
const REACH = 0.7;
const RING_WIDTH = 46; // px, half the width of the front
const RING_GROWTH = 1.6; // the front widens this many times on its way out
const BEND_PX = 24; // how far the front pushes the image, at its strongest
const RIPPLE_PX = 7; // how far the ripples behind the front push it
const BEND_START = 0.4; // share of that strength as it leaves the player
const PEAK = 0.35; // share of the wave's life when it is strongest
// The ground is seen at an angle: the wave spreads wider than it is tall.
const FLATTEN = 0.8;

// Coordinates are screen pixels. Every sample lands on the center of a whole
// pixel, so the pixel art stays crisp while it bends.
const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform highp vec4 uOutputFrame;

uniform vec2 uCenter;
uniform vec4 uWave; // radius, half width, bend, ripple

vec4 sampleAt(vec2 screen) {
  vec2 pixel = floor(screen - uOutputFrame.xy) + 0.5;
  return texture(uTexture, clamp(pixel * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
}

void main() {
  vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 away = (screen - uCenter) / vec2(1.0, ${FLATTEN.toFixed(2)});
  float dist = length(away);
  vec2 dir = dist > 0.001 ? away / dist : vec2(0.0);

  // -1 at the inner edge of the front, 0 on its crest, 1 at the outer edge.
  float x = (dist - uWave.x) / uWave.y;
  float ring = pow(max(0.0, 1.0 - x * x), 2.0);
  // Pulls the image in from both sides of the crest, like a lens.
  float bend = x * ring * uWave.z;
  // Fading out towards the player, only where the front has already passed.
  float behind = clamp(uWave.x - dist, 0.0, uWave.x) / max(uWave.x, 1.0);
  float ripple = sin((uWave.x - dist) * 0.11) * (1.0 - ring) * step(x, 0.0) * (1.0 - behind) * uWave.w;

  finalColor = sampleAt(screen + dir * (bend + ripple));
}`;

export class LevelWave {
  private readonly uniforms = new UniformGroup({
    uCenter: { value: new Float32Array(2), type: "vec2<f32>" },
    uWave: { value: new Float32Array(4), type: "vec4<f32>" },
  });
  private readonly filter: Filter;
  private readonly area = new Rectangle();
  private ageMs = DURATION_MS; // this old: no wave running
  private worldX = 0;
  private worldY = 0;

  // `scene` is what bends, in screen space, covering width x height.
  constructor(
    private readonly scene: Container,
    width: number,
    height: number,
  ) {
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: FRAGMENT, name: "level-wave" }),
      resources: { waveUniforms: this.uniforms },
    });
    // A fixed area: otherwise Pixi would measure the whole world every frame.
    scene.filterArea = this.area;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.area.width = width;
    this.area.height = height;
  }

  // The wave stays where it was born: it does not follow the player.
  start(worldX: number, worldY: number): void {
    this.worldX = worldX;
    this.worldY = worldY;
    this.ageMs = 0;
    this.scene.filters = [this.filter];
  }

  update(dtMs: number): void {
    if (this.ageMs >= DURATION_MS) return;
    this.ageMs += dtMs;
    if (this.ageMs >= DURATION_MS) this.scene.filters = null;
  }

  // `toScreen` turns a world point into screen pixels (the camera moves).
  show(toScreen: (x: number, y: number) => [number, number]): void {
    if (this.ageMs >= DURATION_MS) return;
    const t = this.ageMs / DURATION_MS;
    const out = 1 - (1 - t) ** 2; // bursts out, then slows down
    // Grows as it goes out, then dies away.
    const strength = t < PEAK ? BEND_START + (1 - BEND_START) * (t / PEAK) : ((1 - t) / (1 - PEAK)) ** 1.5;
    const u = this.uniforms.uniforms;
    u.uCenter.set(toScreen(this.worldX, this.worldY));
    u.uWave.set([
      Math.hypot(this.area.width, this.area.height) * REACH * out,
      RING_WIDTH * (1 + (RING_GROWTH - 1) * t),
      BEND_PX * strength,
      RIPPLE_PX * strength,
    ]);
  }
}
