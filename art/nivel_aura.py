"""The level up, around the player: yellow stars turn around the body, closing
in and leaving a trail of essence around it, until it bursts in red, blue and
yellow. Drawn pixel by pixel, no antialiasing. Whatever passes behind the body goes to
one set of frames and whatever passes in front to another, the two layers of
Efectos/NivelAura.aseprite.

OUTPUT: <dir>/atras/N.png, <dir>/frente/N.png, <dir>/durations.txt and
<dir>/tags.txt ("name from to" per line, frames from 1), FRAME x FRAME with the
body's center in the middle of the frame.

    python3 art/nivel_aura.py <dir>
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image

FRAME = 128
CENTER = FRAME // 2
FLOOR_Y = CENTER + 31  # the feet: the body is 62 px tall
BODY_H = 66  # the stars climb this high
FLATTEN = 0.42  # circles on the floor, seen at an angle

WRAP_FRAMES = 24  # "rodea": the stars wrap the body
WRAP_MS = 100
BURST_FRAMES = 9  # "estalla": the level up itself
BURST_MS = 110

# Dark, main and light tone of each essence.
RED = ((120, 20, 44, 255), (222, 44, 58, 255), (255, 128, 104, 255))
BLUE = ((24, 38, 122, 255), (44, 104, 236, 255), (128, 204, 255, 255))
YELLOW = ((170, 96, 22, 255), (255, 204, 48, 255), (255, 246, 168, 255))
ESSENCES = (RED, BLUE, YELLOW)
WHITE = (255, 252, 232, 255)

STARS = 3
STAR_SIZE = 6.5  # px, from the middle to a point
STAR_TURN = 0.55  # radians each star turns on itself per frame
TRAIL_FRAMES = 13  # how long the essence left behind lasts
TRAIL_SPECKS = 7  # specks each star leaves per frame
RADIUS_START = 44  # px, far from the body at first
RADIUS_END = 19  # px, wrapping it


def put(img, x, y, color):
    x, y = round(x), round(y)
    if 0 <= x < FRAME and 0 <= y < FRAME:
        img.putpixel((x, y), color)


def blob(img, x, y, size, color):
    for dx in range(size):
        for dy in range(size):
            put(img, x + dx - size // 2, y + dy - size // 2, color)


def star_at(i, t):
    """Where star i is at t (0 to 1 of the wrap): x, y and its depth (positive
    in front of the body). The stars close in and speed up, going up and down
    the body so their trails wind around it."""
    angle = i * 2 * math.pi / STARS + 2 * math.pi * (0.9 * t + 1.6 * t * t)
    radius = RADIUS_START + (RADIUS_END - RADIUS_START) * (t * t * (3 - 2 * t))
    height = 0.5 - 0.42 * math.cos(2 * math.pi * (0.8 * t + i / STARS))
    x = CENTER + radius * math.cos(angle)
    y = FLOOR_Y - height * BODY_H + radius * FLATTEN * math.sin(angle)
    return x, y, math.sin(angle)


def trail(back, front, i, k):
    """The essence star i has left behind: specks that stay where they fell,
    drifting up, darkening and going out one by one."""
    for j in range(max(0, k - TRAIL_FRAMES), k + 1):
        for sub in range(TRAIL_SPECKS):
            rng = random.Random(i * 100000 + j * 100 + sub)
            x, y, depth = star_at(i, (j + sub / TRAIL_SPECKS) / (WRAP_FRAMES - 1))
            spread_x, spread_y, lasts = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.random()
            age = (k - j) / TRAIL_FRAMES
            if age > 0.25 + 0.75 * lasts:
                continue
            x += spread_x * (1 + 5 * age)
            y += spread_y * (1 + 4 * age) - 7 * age
            tone = YELLOW[2] if age < 0.2 else YELLOW[1] if age < 0.6 else YELLOW[0]
            blob(front if depth >= 0 else back, x, y, 2 if age < 0.15 else 1, tone)


def star(img, x, y, size, turn):
    """A five-pointed star turned by `turn`: dark rim, gold, a hot middle."""
    points = []
    for n in range(10):
        r = size if n % 2 == 0 else size * 0.45
        a = turn + n * math.pi / 5
        points.append((r * math.cos(a), r * math.sin(a)))

    def inside(px, py, scale):
        hit = False
        for n in range(10):
            ax, ay = points[n][0] * scale, points[n][1] * scale
            bx, by = points[n - 1][0] * scale, points[n - 1][1] * scale
            if (ay > py) != (by > py) and px < ax + (bx - ax) * (py - ay) / (by - ay):
                hit = not hit
        return hit

    reach = math.ceil(size) + 1
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            if inside(dx, dy, 0.42):
                tone = WHITE
            elif inside(dx, dy, 0.72):
                tone = YELLOW[2]
            elif inside(dx, dy, 1):
                tone = YELLOW[1]
            elif inside(dx, dy, 1.3):
                tone = YELLOW[0]
            else:
                continue
            put(img, x + dx, y + dy, tone)


def floor_ring(back, front, p, rng):
    """A broken ring of essence on the floor, closing in."""
    radius = 50 - 16 * p
    for i in range(0, 360, 3):
        if rng.random() > 0.2 + 0.6 * p:
            continue
        angle = math.radians(i + 40 * p)
        x = CENTER + radius * math.cos(angle)
        y = FLOOR_Y + radius * FLATTEN * math.sin(angle)
        put(front if math.sin(angle) >= 0 else back, x, y, YELLOW[1])


def wrap_frame(k):
    back = Image.new("RGBA", (FRAME, FRAME))
    front = Image.new("RGBA", (FRAME, FRAME))
    p = k / (WRAP_FRAMES - 1)
    floor_ring(back, front, p, random.Random(100 + k))
    for i in range(STARS):
        trail(back, front, i, k)
    for i in range(STARS):
        x, y, depth = star_at(i, p)
        size = STAR_SIZE * min(1, 0.35 + k / 5)  # they appear small
        star(front if depth >= 0 else back, x, y, size, k * STAR_TURN + i)
    return back, front


def ring(img, radius, width, essence, keep, rng):
    for i in range(720):
        if rng.random() > keep:
            continue
        angle = math.radians(i / 2)
        for w in range(width):
            r = radius + w
            tone = essence[2] if w == 0 else essence[1]
            put(img, CENTER + r * math.cos(angle), CENTER + 14 + r * 0.62 * math.sin(angle), tone)


def burst_frame(k, shards):
    back = Image.new("RGBA", (FRAME, FRAME))
    front = Image.new("RGBA", (FRAME, FRAME))
    p = k / (BURST_FRAMES - 1)
    rng = random.Random(500 + k)
    # The core: a white star that swallows the body, then shrinks away.
    core = round(26 * (1 - p) ** 2)
    if core > 0:
        for dy in range(-core * 2, core * 2 + 1):
            for dx in range(-core * 2, core * 2 + 1):
                d = abs(dx) / (core * 0.8) + abs(dy) / (core * 1.5)
                star = (abs(dx) * abs(dy)) ** 0.5 / core
                if d < 1 or star < 0.16 and d < 2.2:
                    put(front, CENTER + dx, CENTER + dy, WHITE if d < 0.75 else YELLOW[2])
    # Three rings going out one after the other.
    keep = 1 - 0.8 * p
    for i, essence in enumerate((YELLOW, RED, BLUE)):
        grown = max(0.0, p * 1.25 - i * 0.12)
        if grown > 0:
            ring(front, 10 + 52 * (1 - (1 - grown) ** 2), 3 if p < 0.5 else 2, essence, keep, rng)
    # Shards flying out.
    for shard in shards:
        d = shard["speed"] * (1 - (1 - p) ** 2)
        x = CENTER + d * math.cos(shard["angle"])
        y = CENTER + d * 0.75 * math.sin(shard["angle"]) + 40 * p * p * shard["fall"]
        if p < 0.92 and rng.random() < 1.05 - p * 0.6:
            blob(front, x, y, 2 if p < 0.5 else 1, shard["essence"][2 if p < 0.4 else 1])
    return back, front


def main(out: Path):
    rng = random.Random(7)
    shards = [
        {
            "angle": rng.uniform(0, 2 * math.pi),
            "speed": rng.uniform(30, 62),
            "fall": rng.uniform(0, 0.5),
            "essence": ESSENCES[i % 3],
        }
        for i in range(42)
    ]
    for layer in ("atras", "frente"):
        (out / layer).mkdir(parents=True, exist_ok=True)
    frames = [wrap_frame(k) for k in range(WRAP_FRAMES)]
    frames += [burst_frame(k, shards) for k in range(BURST_FRAMES)]
    for i, (back, front) in enumerate(frames):
        back.save(out / "atras" / f"{i}.png")
        front.save(out / "frente" / f"{i}.png")
    durations = [WRAP_MS] * WRAP_FRAMES + [BURST_MS] * BURST_FRAMES
    (out / "durations.txt").write_text(" ".join(map(str, durations)))
    total = WRAP_FRAMES + BURST_FRAMES
    (out / "tags.txt").write_text(f"rodea 1 {WRAP_FRAMES}\nestalla {WRAP_FRAMES + 1} {total}\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
