// The weather: what falls from the sky, how hard the wind blows, and what is
// left lying on the ground.
//
// Procedural and random at once: the game clock is cut into spells of
// SPELL_MS, and each spell draws its weather from the world's seed, weighted
// by the month of the lunar calendar (Creta: dry summers with a strong north
// wind, rain and storms in autumn and winter, snow in the coldest months, ash
// now and then from the island that burns). A spell often keeps the weather of
// the one before, so a rain may last several. Every game, its own sky; the
// same game, the same sky after reloading.
//
// When the weather changes the wind rises and carries it off: the old one
// fades out while the new one comes in.
//
// What falls piles up on the ground (GroundCover): puddles, snow, ash. It grows
// while it falls and goes away slowly when it stops: the sun dries and melts,
// the rain washes the ash, the wind blows it off.
//
// A clear spell is a sunny day: its strength is how sunny. The sun dries the
// puddles and melts the snow faster, and few clouds cast their shadows.
import { random } from "./rocks";

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "snow" | "ash";
export const WEATHER_KINDS: readonly WeatherKind[] = ["clear", "cloudy", "rain", "storm", "snow", "ash"];

const SPELL_MS = 75_000; // game ms each spell lasts
const FADE_MS = 30_000; // the old weather goes and the new one comes in this long
const KEEP = 0.5; // chance a spell keeps the weather of the one before
const KEEP_DEPTH = 8; // how far back a kept weather is looked for
const SALT = 0x2f6b9a1d;

// How likely each weather is in each month (calendar month 0..5):
// clear, cloudy, rain, storm, snow, ash.
const MONTH_WEIGHTS: readonly (readonly number[])[] = [
  [2, 3, 3, 2, 3, 0.3], // Zeus: deep winter
  [2, 3, 3, 1, 2.5, 0.3], // Deukos: winter going
  [4, 3, 3, 1, 0.3, 0.3], // Sfagianes: spring
  [7, 2, 0.5, 0.7, 0, 0.5], // Lapatos: summer
  [7, 1.5, 0.2, 0.4, 0, 1], // Dipsios: the thirst, the driest
  [3, 3, 4, 2.5, 0.5, 0.4], // Klareon: autumn rains
];
// The wind of each month, 0..1: the summer north wind blows hard.
const MONTH_WIND = [0.35, 0.3, 0.25, 0.5, 0.55, 0.35];

// How dark each weather makes the day (0 none, 1 night).
const OVERCAST: Record<WeatherKind, number> = { clear: 0, cloudy: 0.3, rain: 0.5, storm: 0.75, snow: 0.4, ash: 0.65 };

interface Spell {
  kind: WeatherKind;
  strength: number; // 0..1: how hard it falls
  wind: number; // 0..1
  windAngle: number; // radians: where it blows to
}

// The sky on one side of a front: how much of each thing, 0..1.
export interface Sky {
  rain: number; // rain and storm together
  storm: number; // lightning
  snow: number;
  ash: number;
  overcast: number; // how much of the daylight the clouds take
  sun: number; // how sunny (a clear sky; a little with scattered clouds)
  clouds: number; // cloud shadows going over the floor
}

// The fields of Sky are the whole view's average: the two sides of the front
// mixed by how far it went.
export interface WeatherNow extends Sky {
  kind: WeatherKind; // what is mostly falling now
  // While the weather changes, a front goes by with the wind: `old` is the sky
  // it leaves behind it, `new` the one it brings, and `front` how far it went
  // (0 just coming, 1 gone by: all `new`).
  old: Sky;
  new: Sky;
  front: number;
  wind: number; // 0..~1.6, gusts included
  windX: number; // unit vector of where it blows
  windY: number;
}

export class Weather {
  // Forced from the outside (a test, the URL): these weathers, one spell each
  // in turn (just one: that weather all the time).
  forced: WeatherKind[] = [];

  constructor(private readonly seed: number) {}

  // The weather `clockMs` into the game, in calendar `month` (0..5).
  at(clockMs: number, month: number): WeatherNow {
    const n = Math.floor(clockMs / SPELL_MS);
    const into = clockMs - n * SPELL_MS;
    const now = this.spell(n, month);
    const before = this.spell(n - 1, month);
    const after = this.spell(n + 1, month);
    const changed = now.kind !== before.kind;
    const t = changed ? smooth(into / FADE_MS) : 1;
    const strength = changed ? now.strength : lerp(before.strength, now.strength, smooth(into / FADE_MS));
    const fresh = skyOf(now.kind, strength);
    const old = changed ? skyOf(before.kind, before.strength) : fresh;

    // The wind carries the weather off: it rises while one goes and the next
    // comes, and in the last part of a spell that is about to change.
    let wind = lerp(before.wind, now.wind, smooth(into / FADE_MS));
    if (changed) wind += Math.sin(Math.PI * t) * 0.55;
    if (after.kind !== now.kind) wind += smooth((into - (SPELL_MS - FADE_MS)) / FADE_MS) * 0.45;
    // Gusts: slow swells and quick blows.
    const gust = valueNoise(clockMs / 9000, this.seed) * 0.6 + valueNoise(clockMs / 1800, this.seed + 7) * 0.4;
    wind *= 0.55 + gust * 0.9;
    const angle = lerpAngle(before.windAngle, now.windAngle, smooth(into / FADE_MS)) + (valueNoise(clockMs / 6000, this.seed + 3) - 0.5) * 0.5;

    const mixed = (key: keyof Sky) => lerp(old[key], fresh[key], t);
    const result: WeatherNow = {
      kind: t >= 0.5 ? now.kind : before.kind,
      rain: mixed("rain"),
      storm: mixed("storm"),
      snow: mixed("snow"),
      ash: mixed("ash"),
      sun: mixed("sun"),
      clouds: mixed("clouds"),
      overcast: mixed("overcast"),
      old,
      new: fresh,
      front: t,
      wind,
      windX: Math.cos(angle),
      windY: Math.sin(angle) * 0.6, // top-down: mostly across the screen
    };
    return result;
  }

  private spell(n: number, month: number, depth = 0): Spell {
    if (this.forced.length > 0) {
      const kind = this.forced[((n % this.forced.length) + this.forced.length) % this.forced.length];
      return { kind, strength: 0.9, wind: kind === "storm" ? 0.8 : 0.4, windAngle: 0.2 };
    }
    const rng = random(this.seed ^ SALT, n, month);
    const keep = rng() < KEEP && depth < KEEP_DEPTH;
    const kind = keep ? this.spell(n - 1, month, depth + 1).kind : pick(MONTH_WEIGHTS[month] ?? MONTH_WEIGHTS[0], rng());
    let strength = 0.45 + rng() * 0.55;
    let wind = MONTH_WIND[month] ?? 0.3;
    wind = Math.min(1, wind * (0.5 + rng()));
    if (kind === "storm") {
      strength = 0.8 + rng() * 0.2;
      wind = Math.max(wind, 0.75 + rng() * 0.25);
    }
    // Mostly blowing east or west, a little up or down.
    const windAngle = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.9;
    return { kind, strength, wind, windAngle };
  }
}

// What lies on the ground, 0..1 each: kept in the save.
export interface Cover {
  wet: number;
  snow: number;
  ash: number;
}

const WET_FILL_MS = 50_000; // full puddles after this long of hard rain
const DRY_MS = 150_000; // and dry in this long of full sun
const SNOW_FILL_MS = 140_000;
const MELT_MS = 260_000; // in full sun; much slower at night
const RAIN_MELT_MS = 60_000; // rain melts the snow faster
const ASH_FILL_MS = 120_000;
const ASH_GONE_MS = 420_000; // with little wind; a gale clears it in a third of that
const RAIN_WASH_MS = 45_000; // rain washes the ash away

export class GroundCover implements Cover {
  wet = 0;
  snow = 0;
  ash = 0;

  // `daylight`: 0 night, 1 full day.
  update(dtMs: number, now: WeatherNow, daylight: number): void {
    const sun = (0.25 + 0.75 * daylight) * (1 + now.sun * daylight);
    this.wet += (now.rain * dtMs) / WET_FILL_MS;
    this.wet -= ((1 - now.rain) * sun * (1 + now.wind * 0.5) * dtMs) / DRY_MS;
    this.snow += (now.snow * dtMs) / SNOW_FILL_MS;
    this.snow -= ((1 - now.snow) * sun * dtMs) / MELT_MS + (now.rain * dtMs) / RAIN_MELT_MS;
    this.ash += (now.ash * dtMs) / ASH_FILL_MS;
    this.ash -= ((1 - now.ash) * (0.4 + now.wind) * dtMs) / ASH_GONE_MS + (now.rain * dtMs) / RAIN_WASH_MS;
    this.wet = clamp01(this.wet);
    this.snow = clamp01(this.snow);
    this.ash = clamp01(this.ash);
  }

  set(cover: Partial<Cover> | undefined): void {
    this.wet = clamp01(Number(cover?.wet) || 0);
    this.snow = clamp01(Number(cover?.snow) || 0);
    this.ash = clamp01(Number(cover?.ash) || 0);
  }

  get saved(): Cover {
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return { wet: round(this.wet), snow: round(this.snow), ash: round(this.ash) };
  }
}

function skyOf(kind: WeatherKind, strength: number): Sky {
  const falls = (k: WeatherKind) => (kind === k ? strength : 0);
  return {
    rain: falls("rain") + falls("storm"),
    storm: falls("storm"),
    snow: falls("snow"),
    ash: falls("ash"),
    overcast: OVERCAST[kind] * Math.max(strength, 0.6),
    // A clear spell's strength is how sunny it is: the sunnier, the fewer clouds.
    sun: kind === "clear" ? 0.5 + strength * 0.5 : kind === "cloudy" ? 0.3 : 0,
    clouds: kind === "clear" ? 0.35 * (1 - strength) + 0.05 : kind === "cloudy" ? 0.6 + strength * 0.35 : 0,
  };
}

function pick(weights: readonly number[], roll: number): WeatherKind {
  const total = weights.reduce((a, b) => a + b, 0);
  let left = roll * total;
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i];
    if (left < 0) return WEATHER_KINDS[i];
  }
  return "clear";
}

// Smooth 1D noise, 0..1.
function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = random(seed, i, 0)();
  const b = random(seed, i + 1, 0)();
  return lerp(a, b, f * f * (3 - 2 * f));
}

function smooth(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
