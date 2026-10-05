"""Procedural tileset for the maze: dirt floor, stone paving, mossy wall tops
and tall wall faces. Saturated mid-value palette (warm earth, blue-violet
stone, living greens) so the black, pink and cyan player always stands out.

Usage: python3 maze_tiles.py <out_dir>
Writes maze_tiles.png and maze_tiles.json (frames by name, Aseprite-like).
"""
import json
import math
import random
import sys

from PIL import Image

T = 32  # tile size
WALL_H = 96  # wall face height: about twice the player's height

# Palette: Endesga-32-style ramps. Warm earth, blue-violet stone and living
# greens, saturated but kept in the mid values, so the black, pink and cyan
# player still owns the brightest and most saturated pixels on screen.
DIRT = [(104, 66, 50), (132, 86, 60), (156, 104, 70), (180, 124, 82)]
DIRT_SPECK = (78, 48, 40)
PEBBLE = [(90, 105, 136), (192, 203, 220)]
GRASS = [(38, 92, 66), (62, 137, 72), (99, 199, 77)]

SLAB = [(38, 43, 68), (58, 68, 102), (78, 92, 128), (104, 122, 158)]
SLAB_GAP = (24, 20, 37)
SLAB_MOSS = (62, 137, 72)

CAP = [(25, 60, 62), (38, 92, 66), (58, 126, 70), (84, 168, 74), (122, 196, 94)]
CAP_GAP = (24, 20, 37)

FACE = [(20, 24, 40), (25, 48, 56), (32, 70, 64), (44, 96, 72), (60, 124, 80)]

# Gates of the central square: iron bars over darkness, wooden top beam.
IRON = [(38, 43, 68), (58, 68, 102), (90, 105, 136), (139, 155, 180)]
GATE_DARK = (24, 20, 37)
WOOD = [(62, 39, 49), (115, 62, 57), (184, 111, 80), (228, 166, 114)]
FACE_MOSS = [(62, 137, 72), (99, 199, 77)]


def put(img, x, y, color, wrap=True):
    w, h = img.size
    if wrap:
        x %= w
        y %= h
    elif not (0 <= x < w and 0 <= y < h):
        return
    img.putpixel((x, y), color + (255,))


def get(img, x, y):
    w, h = img.size
    return img.getpixel((x % w, y % h))[:3]


def floor_dirt(rng, grass):
    img = Image.new("RGBA", (T, T))
    # Base in 2x2 clusters, so the noise reads as pixel art and not as static.
    for cy in range(0, T, 2):
        for cx in range(0, T, 2):
            tone = DIRT[min(3, max(0, int(rng.gauss(1.5, 0.8))))]
            for dy in range(2):
                for dx in range(2):
                    put(img, cx + dx, cy + dy, tone)
    for _ in range(14):
        put(img, rng.randrange(T), rng.randrange(T), DIRT_SPECK)
    for _ in range(rng.randint(1, 3)):
        x, y = rng.randrange(T), rng.randrange(T)
        put(img, x, y, PEBBLE[1])
        put(img, x + 1, y, PEBBLE[1])
        put(img, x, y + 1, PEBBLE[0])
        put(img, x + 1, y + 1, PEBBLE[0])
    if grass:
        x, y = rng.randrange(4, T - 4), rng.randrange(6, T - 2)
        for i, dx in enumerate((-2, -1, 0, 1, 2)):
            height = (1, 3, 4, 2, 1)[i]
            for k in range(height):
                put(img, x + dx, y - k, GRASS[min(2, k)])
    return img


def paving(rng):
    img = floor_dirt(rng, grass=False)
    # Two rows of slabs, the second one offset half a slab.
    rows = [(0, 15, 0), (16, 15, 8)]
    for top, height, offset in rows:
        x = -offset
        while x < T:
            width = rng.choice((10, 12, 14, 16))
            if rng.random() < 0.85:  # some slabs are missing: dirt shows through
                slab(img, rng, x, top, width - 1, height)
            x += width
    return img


def slab(img, rng, x0, y0, w, h):
    base = rng.choice((1, 1, 2))
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            corner = (x in (x0, x0 + w - 1)) and (y in (y0, y0 + h - 1))
            if corner:
                continue
            tone = base
            if y == y0 or x == x0:
                tone = base + 1  # lit top-left edge
            if y == y0 + h - 1 or x == x0 + w - 1:
                tone = base - 1  # shaded bottom-right edge
            put(img, x, y, SLAB[max(0, min(3, tone))])
    # A crack and a bit of moss in the seams.
    if rng.random() < 0.25:
        cx, cy = x0 + rng.randrange(2, max(3, w - 2)), y0 + 1
        for _ in range(rng.randint(2, 4)):
            put(img, cx, cy, SLAB_GAP)
            cx += rng.choice((-1, 0, 0, 1))
            cy += 1
    for _ in range(rng.randint(0, 3)):
        put(img, x0 + rng.randrange(w), y0 + h - 1, SLAB_MOSS)
    for x in range(x0, x0 + w):
        put(img, x, y0 + h, SLAB_GAP)
    for y in range(y0, y0 + h + 1):
        put(img, x0 + w, y, SLAB_GAP)


TOP_GRID = 4  # wall tops: one seamless texture of 4x4 tiles
FACE_GRID = 3  # wall faces: one seamless strip 3 tiles wide


def wall_top(rng):
    """Packed round moss-covered stones, seen from above. One seamless texture
    of TOP_GRID x TOP_GRID tiles, so neighbouring tiles continue each other."""
    size = T * TOP_GRID
    img = Image.new("RGBA", (size, size), CAP_GAP + (255,))
    stones = []
    for _ in range(200 * TOP_GRID * TOP_GRID):
        r = rng.uniform(4.0, 7.0)
        x, y = rng.uniform(0, size), rng.uniform(0, size)
        if all(wrapped_dist(x, y, sx, sy, size) > (r + sr) * 0.78 for sx, sy, sr in stones):
            stones.append((x, y, r))
    # Draw back to front so lower stones overlap the ones above them.
    for sx, sy, r in sorted(stones, key=lambda s: s[1]):
        for y in range(int(sy - r - 1), int(sy + r + 2)):
            for x in range(int(sx - r - 1), int(sx + r + 2)):
                dx, dy = x + 0.5 - sx, (y + 0.5 - sy) * 1.15
                d = math.hypot(dx, dy)
                if d > r:
                    continue
                # Light from the top-left: rim light up, shadow down.
                light = -(dx * 0.5 + dy * 0.85) / r
                tone = 2.4 + light * 1.4 - (d / r) ** 3 * 0.8
                if dy > r * 0.55:
                    tone = 0.8
                put(img, x, y, CAP[max(0, min(4, round(tone)))])
    # A few grass blades on the caps.
    for _ in range(rng.randint(0, 2) * TOP_GRID * TOP_GRID):
        x, y = rng.randrange(size), rng.randrange(size)
        put(img, x, y, GRASS[2])
        put(img, x, y + 1, GRASS[1])
    return img


def wrapped_dist(x1, y1, x2, y2, size):
    dx = min(abs(x1 - x2), size - abs(x1 - x2))
    dy = min(abs(y1 - y2), size - abs(y1 - y2))
    return math.hypot(dx, dy)


def wall_face(rng):
    """Tall front face: columns of stacked round stones, darker towards the floor."""
    width_px = T * FACE_GRID
    img = Image.new("RGBA", (width_px, WALL_H), FACE[0] + (255,))
    x = 0
    while x < width_px:
        # The last columns share what is left, so the strip ends exactly at its
        # edge and wraps seamlessly, with no thin leftover column.
        remaining = width_px - x
        if remaining <= 12:
            width = remaining
        elif remaining < 21:
            width = remaining // 2
        else:
            width = rng.choice((9, 10, 11, 12))
        column(img, rng, x, width)
        x += width
    # Moss dripping from the top edge.
    for x in range(width_px):
        drip = rng.choice((1, 2, 2, 3, 4, 6)) if rng.random() < 0.7 else 0
        for y in range(drip):
            put(img, x, y, FACE_MOSS[1 if y < drip - 1 else 0], wrap=False)
    # Moss streaks running down some columns.
    for _ in range(rng.randint(2, 4) * FACE_GRID):
        x, length = rng.randrange(width_px), rng.randint(8, 30)
        y0 = rng.randrange(0, 20)
        for y in range(y0, y0 + length):
            if rng.random() < 0.8:
                put(img, x, y, FACE_MOSS[0], wrap=False)
            x += rng.choice((0, 0, 0, 1, -1))

    # Vertical darkening: the bottom of a tall wall gets little light.
    for y in range(WALL_H):
        k = 1.0 - 0.55 * (y / WALL_H) ** 1.4
        if y >= WALL_H - 4:
            k *= 0.55  # ambient occlusion where the wall meets the floor
        for x in range(width_px):
            r, g, b = get(img, x, y)
            put(img, x, y, (int(r * k), int(g * k), int(b * k)))
    return img


def column(img, rng, x0, width):
    shade = rng.choice((-0.6, -0.3, 0.0, 0.0, 0.3))  # columns are not all equally lit
    y = -rng.randrange(0, 8)
    while y < WALL_H:
        height = rng.choice((7, 8, 9, 10))
        for yy in range(y, y + height - 1):
            for xx in range(x0, x0 + width - 1):
                # Cylinder shading: lit left of center, dark at the edges.
                u = (xx - x0 + 0.5) / (width - 1) * 2 - 1
                v = (yy - y + 0.5) / (height - 1) * 2 - 1
                if u * u + v * v * 0.6 > 1.05:
                    continue
                tone = 3.0 + shade - abs(u + 0.25) * 2.2 - max(0, v) * 0.9
                if v < -0.6:
                    tone += 0.6
                put(img, xx, yy, FACE[max(1, min(4, round(tone)))], wrap=False)
        y += height


def gate_face():
    """Iron portcullis, FACE_GRID tiles wide: vertical bars every 8 px, two
    cross bars and rivets, with darkness showing between the bars."""
    width_px = T * FACE_GRID
    img = Image.new("RGBA", (width_px, WALL_H), GATE_DARK + (255,))
    for x in range(width_px):
        u = x % 8
        if u in (3, 4, 5):  # a bar: lit left, dark right
            tone = {3: 2, 4: 1, 5: 0}[u]
            for y in range(WALL_H):
                put(img, x, y, IRON[tone], wrap=False)
    for y0 in (14, 54):  # cross bars
        for y in range(y0, y0 + 5):
            tone = 3 if y == y0 else 0 if y == y0 + 4 else 1
            for x in range(width_px):
                put(img, x, y, IRON[tone], wrap=False)
        for x in range(4, width_px, 8):  # rivets where bars cross
            put(img, x, y0 + 2, IRON[3], wrap=False)
    # Pointed bar tips at the bottom
    for x in range(width_px):
        if x % 8 in (3, 4, 5):
            for y in range(WALL_H - 4, WALL_H):
                if x % 8 != 4 and y > WALL_H - 3:
                    put(img, x, y, GATE_DARK, wrap=False)
    # Same vertical darkening as the walls
    for y in range(WALL_H):
        k = 1.0 - 0.35 * (y / WALL_H)
        for x in range(width_px):
            r, g, b = get(img, x, y)
            put(img, x, y, (int(r * k), int(g * k), int(b * k)))
    return img


def gate_top(rng):
    """Top of a closed gate: wooden planks with an iron band."""
    img = Image.new("RGBA", (T, T))
    for y in range(T):
        plank = y // 8
        for x in range(T):
            tone = 2 if y % 8 == 0 else 0 if y % 8 == 7 else 1
            if rng.random() < 0.08:
                tone = max(0, tone - 1)
            put(img, x, y, WOOD[tone if plank % 2 else min(3, tone + 1)])
    for x in range(T):  # iron band
        for y in (14, 15, 16):
            put(img, x, y, IRON[1 if y == 16 else 2])
    return img


def build(out_dir):
    rng = random.Random(7)
    tiles = {}
    for i in range(4):
        tiles[f"floor_{i}"] = floor_dirt(rng, grass=(i == 3))
    for i in range(4):
        tiles[f"paving_{i}"] = paving(rng)
    top = wall_top(rng)
    for j in range(TOP_GRID):
        for i in range(TOP_GRID):
            tiles[f"wall_top_{j * TOP_GRID + i}"] = top.crop((i * T, j * T, (i + 1) * T, (j + 1) * T))
    face = wall_face(rng)
    for i in range(FACE_GRID):
        tiles[f"wall_face_{i}"] = face.crop((i * T, 0, (i + 1) * T, WALL_H))
    tiles["gate_top_0"] = gate_top(rng)
    gate = gate_face()
    for i in range(FACE_GRID):
        tiles[f"gate_face_{i}"] = gate.crop((i * T, 0, (i + 1) * T, WALL_H))

    # Pack: small tiles in a row on top, faces in a row below.
    # Pack: small tiles in rows of 8 on top, faces in a row below.
    per_row = 8
    small = [k for k in tiles if "_face_" not in k]
    faces = [k for k in tiles if "_face_" in k]
    small_rows = -(-len(small) // per_row)
    sheet = Image.new("RGBA", (per_row * T, small_rows * T + WALL_H))
    frames = {}
    for i, name in enumerate(small):
        x, y = (i % per_row) * T, (i // per_row) * T
        sheet.paste(tiles[name], (x, y))
        frames[name] = {"x": x, "y": y, "w": T, "h": T}
    for i, name in enumerate(faces):
        sheet.paste(tiles[name], (i * T, small_rows * T))
        frames[name] = {"x": i * T, "y": small_rows * T, "w": T, "h": WALL_H}

    sheet.save(f"{out_dir}/maze_tiles.png")
    with open(f"{out_dir}/maze_tiles.json", "w") as f:
        json.dump(
            {
                "tileSize": T,
                "wallHeight": WALL_H,
                "wallTopGrid": TOP_GRID,
                "wallFaceGrid": FACE_GRID,
                "frames": frames,
            },
            f,
            indent=2,
        )


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".")
