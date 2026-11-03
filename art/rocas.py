"""Rocks for the maze, in the colours of Brian's Roca1 (sprites/Plaza/Roca1.aseprite).

- assets/rocas: the big rocks (solid, broken with a pickaxe). Frame 0 is
  Brian's own Roca1, cut to its pixels; the rest are new shapes drawn the
  same way: a mottled top face, a flat front, a dark left side, a heavy black
  shadow on the right, a crack with a lit edge, and a black outline.
- assets/piedritas: the pebbles (picked up with E): small rocks of the same
  palette, several shapes.
(The pickaxe that breaks them is Brian's PicoPiedra, built by art/armas.py.)

Usage: python3 rocas.py <Roca1.png exported from Aseprite> <client/public/assets>
(export it with: Aseprite -b Roca1.aseprite --save-as roca1.png)
"""
import json
import math
import random
import sys

from PIL import Image

# Brian's palette (Roca1): outline, sides, front, moss on top, top, light.
BLACK = (0, 0, 0)
SIDE = (50, 60, 57)
FRONT = (62, 96, 98)
MOSS = (26, 63, 55)
TOP = (72, 107, 95)
LIGHT = (99, 125, 116)

BIG_SHAPES = [
    # width, height, facets, top share, right shadow width
    (26, 18, 8, 0.36, 3),
    (31, 16, 9, 0.42, 3),  # long and low
    (19, 24, 7, 0.30, 2),  # tall
    (25, 21, 9, 0.34, 3),  # round boulder
    (22, 16, 7, 0.40, 2),
    (29, 20, 8, 0.33, 3),
]
PEBBLE_SHAPES = [(6, 4, 5), (8, 5, 6), (5, 4, 5), (9, 6, 6), (7, 5, 5), (10, 7, 7)]


def put(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), color + (255,))


def polygon_mask(rng, w, h, facets):
    """An irregular faceted outline: `facets` corners around an ellipse, each
    pushed in or out a little, flatter at the bottom (it sits on the floor)."""
    cx, cy = (w - 1) / 2, (h - 1) / 2
    corners = []
    for k in range(facets):
        a = 2 * math.pi * (k + rng.uniform(-0.25, 0.25)) / facets
        r = rng.uniform(0.82, 1.0)
        x, y = cx + math.cos(a) * cx * r, cy + math.sin(a) * cy * r
        if y > cy:  # the bottom is flatter
            y = cy + (y - cy) * 1.15
        corners.append((x, min(h - 1, y)))
    inside = set()
    for y in range(h):
        for x in range(w):
            if point_in_polygon(x, y, corners):
                inside.add((x, y))
    return inside


def point_in_polygon(x, y, poly):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def shade(rng, img, inside, w, h, top_share, shadow, crack):
    """Colours like Roca1: lit top face with a little moss, flat front, dark
    left side, black shadow on the right, darker bottom."""
    rows = {}
    for x, y in inside:
        l, r = rows.get(y, (x, x))
        rows[y] = (min(l, x), max(r, x))
    top_y = min(rows)
    bottom_y = max(rows)
    split = top_y + max(2, round((bottom_y - top_y) * top_share))
    for (x, y) in inside:
        l, r = rows[y]
        # The top face bulges: its lower edge is a gentle curve
        mid = (l + r) / 2
        edge = split + round(abs(x - mid) / max(1, (r - l)) * 2)
        if y < edge:
            color = TOP
            if y <= rows_top(rows, x) + 1 and x < mid + 2:
                color = LIGHT
        else:
            color = FRONT
            if x - l < 2 + (y > split + 3):
                color = SIDE
            if y >= bottom_y - 1:
                color = SIDE
        if r - x < shadow and y >= edge - 1:
            color = BLACK if r - x < shadow - 1 else SIDE
        put(img, x + 1, y + 1, color)
    # Moss on the top face, in small clumps
    tops = [(x, y) for (x, y) in inside if y < split and img.getpixel((x + 1, y + 1))[:3] == TOP]
    for _ in range(max(1, len(tops) // 18)):
        if not tops:
            break
        x, y = rng.choice(tops)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0)):
            if (x + dx, y + dy) in inside and y + dy < split and rng.random() < 0.75:
                put(img, x + dx + 1, y + dy + 1, MOSS)
    # A lip between the top face and the front, on the left
    split = min(split, bottom_y)
    for x in range(rows[split][0] + 1, round((rows[split][0] + rows[split][1]) / 2)):
        if rng.random() < 0.5:
            put(img, x + 1, split + 1, SIDE)
    if crack and split + 1 in rows:
        l, r = rows[split + 1]
        x = rng.randrange(l + 3, max(l + 4, r - shadow - 3))
        y = split + 1
        for _ in range(rng.randint(3, max(3, (bottom_y - split) - 2))):
            if (x, y) not in inside or (x + 1, y) not in inside:
                break
            put(img, x + 1, y + 1, BLACK)
            put(img, x + 2, y + 1, LIGHT)
            x += rng.choice((-1, 0, 0))
            y += 1


def rows_top(rows, x):
    """The highest row of the rock at column x."""
    return min((y for y, (l, r) in rows.items() if l <= x <= r), default=0)


def rock(rng, w, h, facets, top_share, shadow):
    img = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    inside = polygon_mask(rng, w, h, facets)
    shade(rng, img, inside, w, h, top_share, shadow, crack=True)
    outline(img)
    return img


def outline(img):
    """Black outline around the opaque pixels."""
    px = img.load()
    w, h = img.size
    solid = {(x, y) for y in range(h) for x in range(w) if px[x, y][3]}
    for x, y in list(solid):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in solid and 0 <= q[0] < w and 0 <= q[1] < h:
                px[q] = BLACK + (255,)


def pebble(rng, w, h, facets):
    img = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    inside = polygon_mask(rng, w, h, facets)
    shade(rng, img, inside, w, h, 0.4, 1, crack=False)
    outline(img)
    return img


def write_sheet(images, path, name):
    """A packed row of frames, in the json-array format Aseprite writes."""
    w = sum(i.width for i in images)
    h = max(i.height for i in images)
    sheet = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    frames = []
    x = 0
    for k, img in enumerate(images):
        # Feet on the bottom row: frames share the height, aligned at the bottom
        cell = Image.new("RGBA", (img.width, h), (0, 0, 0, 0))
        cell.paste(img, (0, h - img.height))
        sheet.paste(cell, (x, 0))
        frames.append({
            "filename": f"{name} {k}",
            "frame": {"x": x, "y": 0, "w": img.width, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": img.width, "h": h},
            "sourceSize": {"w": img.width, "h": h},
            "duration": 100,
        })
        x += img.width
    sheet.save(f"{path}.png")
    meta = {"app": "art/rocas.py", "image": f"{name}.png", "format": "RGBA8888",
            "size": {"w": w, "h": h}, "scale": "1", "frameTags": []}
    with open(f"{path}.json", "w") as f:
        json.dump({"frames": frames, "meta": meta}, f, indent=1)


def main(roca1_png, out):
    brian = Image.open(roca1_png).convert("RGBA")
    brian = brian.crop(brian.getbbox())
    rng = random.Random(53)
    big = [brian] + [rock(rng, *shape) for shape in BIG_SHAPES]
    small = [pebble(rng, *shape) for shape in PEBBLE_SHAPES]
    write_sheet(big, f"{out}/rocas", "rocas")
    write_sheet(small, f"{out}/piedritas", "piedritas")
    print(f"{len(big)} rocks and {len(small)} pebbles in {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ".")
