// The weather drawn (domain/weather.ts says what it is):
//
//  - WeatherGround: what lies on the floor, one world-space quad over the view
//    whose shader paints puddles, snow and ash in 2 px blocks, more of the
//    floor the more there is. The snow and the ash drift with the wind.
//  - WeatherAir: what falls (rain streaks and their splashes, snowflakes, ash
//    and embers), the breezes when the wind blows (pale wavy lines going by)
//    and what it lifts from the ground (leaves, dust, snow, ash). World space,
//    over everything standing; each speck falls from a height onto its spot of
//    floor, so it is drawn `z` px above it.
//  - WeatherSky: screen space. A grey (or rusty, with ash) veil and the warm
//    light of a sunny day, under the night, and the lightning of a storm over it.
//
// When the weather changes a front goes by with the wind (Front): a band with
// a wavy edge that crosses the view little by little. Behind it, the new sky
// (the sun coming in, or the clouds closing in, the rain starting); ahead of
// it, the old one. Its edge shows as a darker strip of cloud.
import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup } from "pixi.js";
import type { Cover, Sky, WeatherNow } from "../../domain/weather";

export interface View {
  left: number; // world px at the screen's top left corner
  top: number;
  width: number;
  height: number;
}

// --- The front --------------------------------------------------------------

const FRONT_BAND = 70; // px: half the width of the front's soft edge
const FRONT_WAVE = 22; // px its edge bends, at most

// The same in GLSL (FRONT_GLSL) and here: 1 where the new sky already is, 0
// where the old one still is, from world px. uFront: the view's middle (xy)
// and where the wind blows (zw, unit); uFrontAt: where the front is along it,
// FRONT_BAND, seconds, 1 while it goes by.
const FRONT_GLSL = `
uniform vec4 uFront;
uniform vec4 uFrontAt;

float frontEdge(vec2 world) {
  vec2 d = world - uFront.xy;
  float across = dot(d, vec2(-uFront.w, uFront.z));
  float wave = sin(across / 57.0 + uFrontAt.z * 0.3) * 16.0 + sin(across / 23.0 - uFrontAt.z * 0.5) * 6.0;
  return dot(d, uFront.zw) - uFrontAt.x + wave;
}

float newness(vec2 world) {
  if (uFrontAt.w < 0.5) return 1.0;
  return 1.0 - smoothstep(-uFrontAt.y, uFrontAt.y, frontEdge(world));
}`;

export class Front {
  readonly center = new Float32Array(4);
  readonly at = new Float32Array(4);

  // Where it is this frame: it starts upwind of the view and ends downwind.
  set(now: WeatherNow, view: View, timeMs: number): void {
    const length = Math.hypot(now.windX, now.windY) || 1;
    const ax = now.windX / length;
    const ay = now.windY / length;
    const reach = (Math.abs(ax) * view.width + Math.abs(ay) * view.height) / 2 + FRONT_BAND + FRONT_WAVE;
    this.center.set([view.left + view.width / 2, view.top + view.height / 2, ax, ay]);
    this.at.set([-reach + 2 * reach * now.front, FRONT_BAND, (timeMs / 1000) % 10000, now.front < 1 ? 1 : 0]);
  }

  newness(x: number, y: number): number {
    if (this.at[3] < 0.5) return 1;
    const [cx, cy, ax, ay] = this.center;
    const dx = x - cx;
    const dy = y - cy;
    const across = -dx * ay + dy * ax;
    const t = this.at[2];
    const wave = Math.sin(across / 57 + t * 0.3) * 16 + Math.sin(across / 23 - t * 0.5) * 6;
    const edge = dx * ax + dy * ay - this.at[0] + wave;
    const k = Math.min(1, Math.max(0, (edge + FRONT_BAND) / (2 * FRONT_BAND)));
    return 1 - k * k * (3 - 2 * k);
  }

  // How much of `key` at (x, y): the old sky's or the new one's.
  amount(now: WeatherNow, key: keyof Sky, x: number, y: number): number {
    const n = this.newness(x, y);
    return now.old[key] * (1 - n) + now.new[key] * n;
  }
}

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

// Premultiplied colour, each layer laid over the one before: the floor wet
// and darker with puddles in its low spots, the ash, the snow on top.
const FRAGMENT = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec4 uCover; // wet, snow, ash, seconds
uniform vec4 uShift; // where the wind took the ash (xy) and the snow (zw), px
uniform vec4 uClouds; // shadows: how many (old sky, new sky), where the wind took them (zw)
${FRONT_GLSL}

const float BLOCK = 2.0;
const float CLOUD_SHADE = 0.22; // how dark a cloud shadow is, by day

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  return noise(p) * 0.55 + noise(p * 2.03 + 17.0) * 0.3 + noise(p * 4.1 + 31.0) * 0.15;
}

vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

// How much of a patch of the given level (0..1 noise) is under a cover of this amount:
// 1 inside, 0 outside, a dithered band at the border.
float patch(float level, float amount, vec2 at) {
  float edge = amount * 1.2 - 0.12;
  if (level < edge - 0.05) return 1.0;
  if (level < edge) return step(0.5, hash(at + 3.7));
  return 0.0;
}

void main() {
  vec2 world = uOrigin + vUV * uSize;
  vec2 at = floor(world / BLOCK) * BLOCK;
  vec4 color = vec4(0.0);

  float wet = uCover.x;
  if (wet > 0.003) {
    float dark = wet * 0.2;
    color = vec4(vec3(0.03, 0.04, 0.08) * dark, dark);
    float low = fbm(at / 44.0);
    float puddle = wet * 0.6 - 0.08;
    if (low < puddle) {
      float shine = step(0.9, noise(vec2(at.x / 9.0 + uCover.w * 0.5, at.y / 3.0)));
      vec3 water = mix(vec3(0.20, 0.26, 0.36), vec3(0.62, 0.72, 0.84), shine);
      color = over(vec4(water * 0.5, 0.5), color);
    } else if (low < puddle + 0.02) {
      color = over(vec4(vec3(0.12, 0.13, 0.18) * 0.35, 0.35), color);
    }
  }

  float ash = uCover.z;
  if (ash > 0.003) {
    vec2 a = floor((world + uShift.xy) / BLOCK) * BLOCK;
    float level = fbm(a / 46.0 + 9.0) * 0.85 + hash(a) * 0.15;
    float on = patch(level, ash, a);
    if (on > 0.0) {
      vec3 grey = mix(vec3(0.22, 0.21, 0.20), vec3(0.47, 0.44, 0.41), hash(a * 1.3));
      if (hash(a + 11.0) > 0.995) grey = vec3(0.95, 0.45, 0.15); // a cinder still hot
      color = over(vec4(grey * 0.9, 0.9) * on, color);
    }
  }

  float snow = uCover.y;
  if (snow > 0.003) {
    vec2 s = floor((world + uShift.zw) / BLOCK) * BLOCK;
    float level = fbm(s / 56.0 + 3.0) * 0.85 + hash(s) * 0.15;
    float on = patch(level, snow, s);
    if (on > 0.0) {
      // Bluish where it is thin, at the edge of the patch.
      float thin = smoothstep(snow * 1.2 - 0.12, snow * 1.2 - 0.3, level);
      vec3 white = mix(vec3(0.76, 0.82, 0.93), vec3(0.95, 0.97, 1.0), thin);
      if (hash(s + 5.0) > 0.985) white = vec3(1.0);
      color = over(vec4(white * 0.95, 0.95) * on, color);
    }
  }

  // Cloud shadows: big soft patches going by, under everything on the floor.
  float clouds = mix(uClouds.x, uClouds.y, newness(world));
  if (clouds > 0.003) {
    vec2 c = floor((world + uClouds.zw) / 4.0) * 4.0;
    float cloud = fbm(c / 300.0 + 40.0);
    float edge = 1.0 - clouds * 0.55;
    float shade = smoothstep(edge, edge + 0.08, cloud);
    shade = floor(shade * 3.0 + 0.5) / 3.0; // a few steps, pixel art
    color = over(color, vec4(vec3(0.02, 0.03, 0.06) * shade * CLOUD_SHADE, shade * CLOUD_SHADE));
  }

  finalColor = color;
}`;

const ASH_DRIFT = 7; // px/s the ash on the floor slides at full wind
const SNOW_DRIFT = 3;
const CLOUD_SPEED = 14; // px/s the cloud shadows go by, plus the wind

export class WeatherGround {
  // World space, on the floor. The owner adds it to the ground layer.
  readonly view = new Container();
  private readonly uniforms = new UniformGroup({
    uSize: { value: new Float32Array(2), type: "vec2<f32>" },
    uOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
    uCover: { value: new Float32Array(4), type: "vec4<f32>" },
    uShift: { value: new Float32Array(4), type: "vec4<f32>" },
    uClouds: { value: new Float32Array(4), type: "vec4<f32>" },
    uFront: { value: new Float32Array(4), type: "vec4<f32>" },
    uFrontAt: { value: new Float32Array(4), type: "vec4<f32>" },
  });
  private readonly quad: Mesh<MeshGeometry, Shader>;
  private readonly shift = [0, 0, 0, 0];
  private readonly cloudShift = [0, 0];

  constructor() {
    const corners = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this.quad = new Mesh({
      geometry: new MeshGeometry({ positions: corners, uvs: corners, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }),
      shader: Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT },
        resources: { coverUniforms: this.uniforms },
      }),
    });
    this.view.addChild(this.quad);
  }

  // The wind pushes what lies on the floor.
  update(dtMs: number, now: WeatherNow): void {
    const push = (now.wind * dtMs) / 1000;
    this.shift[0] -= now.windX * push * ASH_DRIFT;
    this.shift[1] -= now.windY * push * ASH_DRIFT;
    this.shift[2] -= now.windX * push * SNOW_DRIFT;
    this.shift[3] -= now.windY * push * SNOW_DRIFT;
    const cloud = ((CLOUD_SPEED + now.wind * 30) * dtMs) / 1000;
    this.cloudShift[0] -= now.windX * cloud;
    this.cloudShift[1] -= now.windY * cloud;
  }

  // `daylight` 0..1: cloud shadows only show by day.
  show(cover: Cover, now: WeatherNow, front: Front, daylight: number, view: View, timeMs: number): void {
    const clouds = Math.max(now.old.clouds, now.new.clouds) * daylight;
    this.view.visible = cover.wet > 0.003 || cover.snow > 0.003 || cover.ash > 0.003 || clouds > 0.003;
    if (!this.view.visible) return;
    // A little past the screen on every side, on whole blocks.
    const left = Math.floor(view.left / 2) * 2 - 2;
    const top = Math.floor(view.top / 2) * 2 - 2;
    this.quad.position.set(left, top);
    this.quad.scale.set(view.width + 4, view.height + 4);
    const u = this.uniforms.uniforms;
    u.uSize.set([view.width + 4, view.height + 4]);
    u.uOrigin.set([left, top]);
    u.uCover.set([cover.wet, cover.snow, cover.ash, timeMs / 1000]);
    u.uShift.set(this.shift.map(Math.round));
    u.uClouds.set([now.old.clouds * daylight, now.new.clouds * daylight, Math.round(this.cloudShift[0]), Math.round(this.cloudShift[1])]);
    u.uFront.set(front.center);
    u.uFrontAt.set(front.at);
  }
}

// --- What falls ------------------------------------------------------------

const enum Kind {
  Rain,
  Snow,
  Ash,
  Ember,
}

// Motes of dust and pollen floating in the sun, catching the light.
interface Mote {
  x: number;
  y: number;
  phase: number;
  color: number;
}


interface Speck {
  kind: Kind;
  x: number; // its spot on the floor
  y: number;
  z: number; // px above it
  vz: number; // px/s, down
  drift: number; // px/s sideways at full wind
  phase: number;
  size: number;
  color: number;
}

interface Splash {
  x: number;
  y: number;
  ms: number;
}

interface Breeze {
  x: number;
  y: number;
  length: number;
  ms: number;
  life: number;
  phase: number;
  wave: number; // px up and down
}

// Leaves, dust, snow or ash the wind picks up and rolls along the floor.
interface Blown {
  x: number;
  y: number;
  z: number;
  vz: number;
  speed: number;
  ms: number;
  life: number;
  color: number;
  leaf: boolean;
}

// Specks for a 640x360 view at full strength.
const RAIN_MAX = 420;
const STORM_EXTRA = 220;
const SNOW_MAX = 260;
const ASH_MAX = 240;
const SPAWN_PER_FRAME = 30;
const TOP = 240; // px above the floor where the specks start
const MARGIN = 24; // px out of view where they still live
const SPLASH_MS = 200;
const BREEZE_FROM = 0.4; // wind from which breezes go by
const BREEZE_MAX = 10;
const BLOWN_FROM = 0.55; // wind from which it lifts things off the floor
const BLOWN_MAX = 70;

const RAIN_COLOR = 0xa9c4e0;
const SPLASH_COLOR = 0xd6e4f2;
const SNOW_COLORS = [0xf4f7ff, 0xe3eaf6, 0xffffff];
const ASH_COLORS = [0x6b6560, 0x8a837c, 0x4a4542, 0x9d958c];
const EMBER_COLORS = [0xff9a3c, 0xffc061, 0xe8562a];
const LEAF_COLORS = [0x6f8f3a, 0x8a6a2e, 0xa68a3c, 0x55702c];
const DUST_COLORS = [0xc9b48c, 0xb39c74, 0xd8c8a4];
const MOTES_MAX = 45;
const MOTE_COLORS = [0xfff1b8, 0xffe08a, 0xffffff];

export class WeatherAir {
  // World space, over everything standing. The owner adds it to the world.
  readonly view = new Graphics();
  private readonly specks: Speck[] = [];
  private readonly splashes: Splash[] = [];
  private readonly breezes: Breeze[] = [];
  private readonly blown: Blown[] = [];
  private readonly motes: Mote[] = [];
  private daylight = 1;
  private front: Front | null = null;
  private now: WeatherNow | null = null;
  private timeMs = 0;

  update(dtMs: number, now: WeatherNow, front: Front, cover: Cover, view: View, daylight: number): void {
    this.now = now;
    this.front = front;
    this.daylight = daylight;
    this.timeMs += dtMs;
    const dt = dtMs / 1000;
    const area = (view.width * view.height) / (640 * 360);
    const want = [
      Math.round(now.rain * (RAIN_MAX + now.storm * STORM_EXTRA) * area),
      Math.round(now.snow * SNOW_MAX * area),
      Math.round(now.ash * ASH_MAX * area),
    ];
    const have = [0, 0, 0];
    for (const s of this.specks) have[s.kind === Kind.Ember ? Kind.Ash : s.kind]++;

    const windX = now.windX * now.wind;
    const windY = now.windY * now.wind;
    const t = this.timeMs / 1000;
    for (let i = this.specks.length - 1; i >= 0; i--) {
      const s = this.specks[i];
      const sway = s.kind === Kind.Rain ? 0 : Math.sin(t * 1.7 + s.phase) * (s.kind === Kind.Snow ? 10 : 14);
      s.x += (windX * s.drift + sway) * dt;
      s.y += windY * s.drift * dt;
      s.z -= s.vz * dt;
      wrap(s, view);
      if (s.z > 0) continue;
      if (s.kind === Kind.Rain && this.splashes.length < 160) this.splashes.push({ x: s.x, y: s.y, ms: 0 });
      const kind = s.kind === Kind.Ember ? Kind.Ash : s.kind;
      if (have[kind] > want[kind]) {
        this.specks.splice(i, 1);
        have[kind]--;
      } else {
        this.place(s, view, true);
      }
    }
    // New ones, a few a frame: the weather comes in little by little.
    let budget = SPAWN_PER_FRAME;
    for (const kind of [Kind.Rain, Kind.Snow, Kind.Ash]) {
      while (have[kind] < want[kind] && budget-- > 0) {
        const s = this.make(kind, now);
        this.place(s, view, false);
        this.specks.push(s);
        have[kind]++;
      }
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].ms += dtMs;
      if (this.splashes[i].ms >= SPLASH_MS) this.splashes.splice(i, 1);
    }
    this.updateBreezes(dtMs, now, view, area);
    this.updateBlown(dtMs, now, cover, view, area);
    this.updateMotes(dtMs, now, view, area);
  }

  private updateMotes(dtMs: number, now: WeatherNow, view: View, area: number): void {
    const want = Math.round(Math.max(0, now.sun - 0.4) * MOTES_MAX * area * this.daylight);
    while (this.motes.length < want) {
      this.motes.push({
        x: view.left + Math.random() * view.width,
        y: view.top + Math.random() * view.height,
        phase: Math.random() * 7,
        color: pick(MOTE_COLORS),
      });
    }
    if (this.motes.length > want && Math.random() < dtMs / 200) this.motes.pop();
    const dt = dtMs / 1000;
    const t = this.timeMs / 1000;
    for (const m of this.motes) {
      m.x += (now.windX * now.wind * 25 + Math.sin(t * 0.7 + m.phase) * 6) * dt;
      m.y += (now.windY * now.wind * 25 + Math.cos(t * 0.5 + m.phase) * 4 - 2) * dt;
      const w = view.width;
      const h = view.height;
      if (m.x < view.left) m.x += w;
      else if (m.x >= view.left + w) m.x -= w;
      if (m.y < view.top) m.y += h;
      else if (m.y >= view.top + h) m.y -= h;
    }
  }

  draw(): void {
    const g = this.view.clear();
    const now = this.now;
    if (!now) return;
    const t = this.timeMs / 1000;
    const windX = now.windX * now.wind;
    for (const s of this.specks) {
      const x = Math.round(s.x);
      const y = Math.round(s.y - s.z);
      if (s.kind === Kind.Rain) {
        // A streak leaning with the wind, in a few whole-pixel pieces.
        const slant = (windX * s.drift) / s.vz;
        const pieces = Math.abs(slant) < 0.15 ? 1 : 3;
        const piece = Math.ceil(s.size / pieces);
        for (let p = 0; p < pieces; p++) {
          g.rect(Math.round(s.x - slant * piece * p), y - piece * (p + 1), 1, piece);
        }
        g.fill({ color: RAIN_COLOR, alpha: 0.5 });
      } else if (s.kind === Kind.Ember) {
        g.rect(x, y, 1, 1).fill({ color: s.color, alpha: 0.6 + 0.4 * Math.sin(t * 9 + s.phase) });
      } else {
        g.rect(x, y, s.size, s.size).fill({ color: s.color, alpha: s.kind === Kind.Snow ? 0.9 : 0.85 });
      }
    }
    for (const s of this.splashes) {
      const step = s.ms < SPLASH_MS / 2 ? 1 : 2;
      const x = Math.round(s.x);
      const y = Math.round(s.y) - (step === 1 ? 1 : 0);
      g.rect(x - step, y, 1, 1).rect(x + step, y, 1, 1).fill({ color: SPLASH_COLOR, alpha: 0.55 * (1 - s.ms / SPLASH_MS) });
    }
    for (const b of this.breezes) {
      const fade = Math.sin(Math.PI * (b.ms / b.life));
      for (let i = 0; i < b.length; i += 2) {
        const x = b.x - now.windX * i;
        const y = b.y - now.windY * i + Math.sin((i + b.ms * 0.12) / 9 + b.phase) * b.wave;
        g.rect(Math.round(x), Math.round(y), 2, 1);
        g.fill({ color: 0xffffff, alpha: 0.22 * fade * (1 - i / b.length) });
      }
    }
    for (const m of this.motes) {
      // Twinkles: only now and then it catches the sun.
      const glint = Math.sin(t * 1.3 + m.phase * 3);
      if (glint < 0.2) continue;
      g.rect(Math.round(m.x), Math.round(m.y), 1, 1).fill({ color: m.color, alpha: 0.75 * glint * this.daylight });
    }
    for (const b of this.blown) {
      const fade = Math.min(1, (b.life - b.ms) / 400);
      const x = Math.round(b.x);
      const y = Math.round(b.y - b.z);
      // A leaf turns as it goes: lying, then on its side.
      const flat = !b.leaf || Math.sin(b.ms / 70) > 0;
      g.rect(x, y, flat ? 2 : 1, flat ? 1 : 2).fill({ color: b.color, alpha: 0.9 * fade });
    }
  }

  private make(kind: Kind, now: WeatherNow): Speck {
    if (kind === Kind.Rain) {
      return {
        kind,
        x: 0,
        y: 0,
        z: 0,
        vz: 380 + Math.random() * 140 + now.storm * 120,
        drift: 160 + Math.random() * 60,
        phase: 0,
        size: 6 + Math.round(Math.random() * 3 + now.storm * 3),
        color: RAIN_COLOR,
      };
    }
    if (kind === Kind.Snow) {
      return {
        kind,
        x: 0,
        y: 0,
        z: 0,
        vz: 30 + Math.random() * 30,
        drift: 70 + Math.random() * 40,
        phase: Math.random() * 7,
        size: Math.random() < 0.3 ? 2 : 1,
        color: pick(SNOW_COLORS),
      };
    }
    const ember = Math.random() < 0.06;
    return {
      kind: ember ? Kind.Ember : Kind.Ash,
      x: 0,
      y: 0,
      z: 0,
      vz: 22 + Math.random() * 26,
      drift: 90 + Math.random() * 50,
      phase: Math.random() * 7,
      size: Math.random() < 0.35 ? 2 : 1,
      color: ember ? pick(EMBER_COLORS) : pick(ASH_COLORS),
    };
  }

  // Somewhere over the view; from the top, or anywhere on the way down when
  // the weather is just coming (as if it had been falling already).
  // While a front goes by, only on its side that has it: a few tries at a
  // spot, kept as likely as there is of it there.
  private place(s: Speck, view: View, fromTop: boolean): void {
    const key: keyof Sky = s.kind === Kind.Rain ? "rain" : s.kind === Kind.Snow ? "snow" : "ash";
    const now = this.now!;
    const most = Math.max(now.old[key], now.new[key], 0.001);
    for (let tries = 0; tries < 6; tries++) {
      s.x = view.left - MARGIN + Math.random() * (view.width + MARGIN * 2);
      s.y = view.top - MARGIN + Math.random() * (view.height + TOP + MARGIN * 2);
      // The spot it falls on, seen from above: the sky over it is `z` higher on the screen.
      if (!this.front || Math.random() * most < this.front.amount(now, key, s.x, s.y - TOP / 2)) break;
    }
    s.z = fromTop ? TOP * (0.85 + Math.random() * 0.3) : Math.random() * TOP;
  }

  private updateBreezes(dtMs: number, now: WeatherNow, view: View, area: number): void {
    const want = Math.min(BREEZE_MAX, Math.round(Math.max(0, now.wind - BREEZE_FROM) * 9 * area));
    if (this.breezes.length < want && Math.random() < dtMs / 250) {
      // From the side the wind comes from, so it crosses the view.
      const upwind = view.left + view.width / 2 - now.windX * (view.width / 2 + 40);
      this.breezes.push({
        x: upwind + (Math.random() - 0.5) * view.width * 0.6,
        y: view.top + Math.random() * view.height,
        length: 24 + Math.random() * 40,
        ms: 0,
        life: 1400 + Math.random() * 1200,
        phase: Math.random() * 7,
        wave: 1 + Math.random() * 3,
      });
    }
    const speed = 220 + now.wind * 220;
    for (let i = this.breezes.length - 1; i >= 0; i--) {
      const b = this.breezes[i];
      b.ms += dtMs;
      b.x += (now.windX * speed * dtMs) / 1000;
      b.y += (now.windY * speed * dtMs) / 1000;
      if (b.ms >= b.life) this.breezes.splice(i, 1);
    }
  }

  private updateBlown(dtMs: number, now: WeatherNow, cover: Cover, view: View, area: number): void {
    const want = Math.min(BLOWN_MAX, Math.round(Math.max(0, now.wind - BLOWN_FROM) * 60 * area));
    for (let n = 0; n < 3 && this.blown.length < want; n++) {
      // What lies there is what flies: snow, ash, leaves on dry ground, dust.
      const roll = Math.random();
      let color: number;
      let leaf = false;
      if (roll < cover.snow * 0.8) color = pick(SNOW_COLORS);
      else if (roll < (cover.snow + cover.ash) * 0.8) color = pick(ASH_COLORS);
      else if (cover.wet > 0.4) continue; // wet ground: nothing lifts
      else if (Math.random() < 0.5) {
        color = pick(LEAF_COLORS);
        leaf = true;
      } else color = pick(DUST_COLORS);
      this.blown.push({
        x: view.left - now.windX * 20 + Math.random() * view.width,
        y: view.top + Math.random() * view.height,
        z: 0,
        vz: 20 + Math.random() * 60,
        speed: (0.5 + Math.random() * 0.8) * (90 + now.wind * 150),
        ms: 0,
        life: 1500 + Math.random() * 2000,
        color,
        leaf,
      });
    }
    const dt = dtMs / 1000;
    for (let i = this.blown.length - 1; i >= 0; i--) {
      const b = this.blown[i];
      b.ms += dtMs;
      b.x += now.windX * b.speed * dt;
      b.y += now.windY * b.speed * dt;
      b.vz -= 260 * dt;
      b.z += b.vz * dt;
      if (b.z < 0) {
        b.z = 0;
        b.vz = Math.random() * 50 * now.wind; // hops along
      }
      if (b.ms >= b.life) this.blown.splice(i, 1);
    }
  }
}

// A speck that left the view (the camera moved) comes in on the other side.
function wrap(s: Speck, view: View): void {
  const w = view.width + MARGIN * 2;
  const h = view.height + TOP + MARGIN * 2;
  const left = view.left - MARGIN;
  const top = view.top - MARGIN;
  if (s.x < left) s.x += w * Math.ceil((left - s.x) / w);
  else if (s.x >= left + w) s.x -= w * Math.ceil((s.x - left - w + 1) / w);
  if (s.y < top) s.y += h * Math.ceil((top - s.y) / h);
  else if (s.y >= top + h) s.y -= h * Math.ceil((s.y - top - h + 1) / h);
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// --- The sky ---------------------------------------------------------------

// The veil (premultiplied, normal blend) or the sunlight (added), as each side
// of the front has it. uSide: old overcast, old ashiness, old sun, new...
// The front's edge: a darker strip of cloud where the sky changes, and a
// brighter one behind it when it brings the sun.
const SKY_FRAGMENT = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec4 uOld; // overcast, ashiness, sun, -
uniform vec4 uNew;
uniform vec4 uMode; // 0 veil / 1 sunlight, veil alpha, sun alpha, -
${FRONT_GLSL}

const vec3 GREY = vec3(0.22, 0.27, 0.33);
const vec3 RUST = vec3(0.37, 0.27, 0.20);
const vec3 SUN = vec3(1.0, 0.78, 0.44);
const float BLOCK = 3.0;
const float STEPS = 24.0;

void main() {
  vec2 world = floor((uOrigin + vUV * uSize) / BLOCK) * BLOCK;
  float n = newness(world);
  float strip = uFrontAt.w > 0.5 ? exp(-pow(frontEdge(world) / (uFrontAt.y * 0.55), 2.0)) : 0.0;
  if (uMode.x < 0.5) {
    float overcast = mix(uOld.x, uNew.x, n);
    float alpha = overcast * uMode.y + strip * abs(uNew.x - uOld.x) * 0.35;
    alpha = floor(alpha * STEPS + 0.5) / STEPS;
    vec3 color = mix(GREY, RUST, mix(uOld.y, uNew.y, n));
    finalColor = vec4(color * alpha, alpha);
  } else {
    float sun = mix(uOld.z, uNew.z, n);
    float alpha = sun * uMode.z + strip * max(0.0, uNew.z - uOld.z) * uMode.z * 0.8;
    alpha = floor(alpha * STEPS * 4.0 + 0.5) / (STEPS * 4.0);
    finalColor = vec4(SUN * alpha, alpha);
  }
}`;

const VEIL_ALPHA = 0.38; // at full overcast
const STRIKES_PER_S = 0.08; // in a full storm
const FLASH_MS = 520;
const SUN_ALPHA = 0.05;

export class WeatherSky {
  // Screen space. The owner adds `veil` and `sunlight` under the night and
  // `flash` over it.
  readonly veil = new Container();
  readonly sunlight = new Container();
  readonly flash = new Graphics();
  private readonly veilQuad: SkyQuad;
  private readonly sunQuad: SkyQuad;
  private flashMs = -1;
  private width = 0;
  private height = 0;

  // `thunder`: called a moment after a lightning strike.
  constructor(private readonly thunder: () => void) {
    this.veilQuad = new SkyQuad(0);
    this.sunQuad = new SkyQuad(1);
    this.sunQuad.mesh.blendMode = "add";
    this.veil.addChild(this.veilQuad.mesh);
    this.sunlight.addChild(this.sunQuad.mesh);
  }

  update(dtMs: number, now: WeatherNow): void {
    if (this.flashMs >= 0) {
      const was = this.flashMs;
      this.flashMs += dtMs;
      if (was < 260 && this.flashMs >= 260) this.thunder();
      if (this.flashMs >= FLASH_MS) this.flashMs = -1;
    } else if (now.storm > 0.3 && Math.random() < (now.storm * STRIKES_PER_S * dtMs) / 1000) {
      this.flashMs = 0;
    }
  }

  show(now: WeatherNow, front: Front, daylight: number, view: View): void {
    const { width, height } = view;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.flash.clear().rect(0, 0, width, height).fill(0xffffff);
    }
    const ashy = (sky: Sky) => sky.ash / Math.max(0.001, sky.ash + sky.rain + sky.snow);
    const sides = [now.old.overcast, ashy(now.old), now.old.sun, 0, now.new.overcast, ashy(now.new), now.new.sun, 0];
    const changing = front.at[3] > 0.5;
    this.veil.visible = Math.max(now.old.overcast, now.new.overcast) > 0.01 || changing;
    this.sunlight.visible = Math.max(now.old.sun, now.new.sun) * daylight > 0.01;
    if (this.veil.visible) this.veilQuad.set(view, front, sides, [0, VEIL_ALPHA, 0, 0]);
    if (this.sunlight.visible) this.sunQuad.set(view, front, sides, [1, 0, SUN_ALPHA * daylight, 0]);
    // A double flicker, then it fades.
    const ms = this.flashMs;
    const alpha = ms < 0 ? 0 : ms < 60 ? 0.55 : ms < 120 ? 0.1 : ms < 190 ? 0.45 : 0.45 * (1 - (ms - 190) / (FLASH_MS - 190));
    this.flash.alpha = alpha;
    this.flash.visible = alpha > 0.005;
  }
}

class SkyQuad {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms = new UniformGroup({
    uSize: { value: new Float32Array(2), type: "vec2<f32>" },
    uOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
    uOld: { value: new Float32Array(4), type: "vec4<f32>" },
    uNew: { value: new Float32Array(4), type: "vec4<f32>" },
    uMode: { value: new Float32Array(4), type: "vec4<f32>" },
    uFront: { value: new Float32Array(4), type: "vec4<f32>" },
    uFrontAt: { value: new Float32Array(4), type: "vec4<f32>" },
  });

  constructor(mode: number) {
    const corners = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this.mesh = new Mesh({
      geometry: new MeshGeometry({ positions: corners, uvs: corners, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }),
      shader: Shader.from({
        gl: { vertex: VERTEX, fragment: SKY_FRAGMENT },
        resources: { skyUniforms: this.uniforms },
      }),
    });
    this.uniforms.uniforms.uMode[0] = mode;
  }

  set(view: View, front: Front, sides: number[], mode: number[]): void {
    this.mesh.scale.set(view.width, view.height);
    const u = this.uniforms.uniforms;
    u.uSize.set([view.width, view.height]);
    u.uOrigin.set([view.left, view.top]);
    u.uOld.set(sides.slice(0, 4));
    u.uNew.set(sides.slice(4, 8));
    u.uMode.set(mode);
    u.uFront.set(front.center);
    u.uFrontAt.set(front.at);
  }
}
