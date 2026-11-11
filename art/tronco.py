"""The log the trees drop when they are felled (art/tronco_original.png). The
picture is pixel art blown up ~16.6x on white, smoothed when it was scaled:
this finds its grid, takes each real pixel's most common colour, snaps the
smoothing back onto the few colours of the drawing and drops the white.

Usage: python3 art/tronco.py
Writes client/public/assets/tronco.{png,json}: frame 0 as drawn, frame 1
mirrored (logs lie both ways round on the floor; frame 0 is the icon).
"""
import json
import math
import os
from collections import Counter

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "tronco_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "assets", "tronco")

EDGE = 40  # brightness step between two screen px that marks a pixel border
PAPER = 225  # every channel above this: the white around it
SAME = 30  # colours closer than this (sum of channel differences) are one


def grid(grey):
    """Pixel size and where the borders fall (x, y), from the brightness steps."""
    w, h = grey.size
    px = grey.load()
    steps_x, steps_y = [0] * w, [0] * h
    for y in range(1, h):
        for x in range(1, w):
            if abs(px[x, y] - px[x - 1, y]) > EDGE:
                steps_x[x] += 1
            if abs(px[x, y] - px[x, y - 1]) > EDGE:
                steps_y[y] += 1

    def fit(steps, period):
        c = sum(v * math.cos(2 * math.pi * i / period) for i, v in enumerate(steps))
        s = sum(v * math.sin(2 * math.pi * i / period) for i, v in enumerate(steps))
        return math.hypot(c, s), (math.atan2(s, c) * period / (2 * math.pi)) % period

    period = max((p / 10 for p in range(120, 240)), key=lambda p: fit(steps_x, p)[0] + fit(steps_y, p)[0])
    return period, fit(steps_x, period)[1], fit(steps_y, period)[1]


def build():
    picture = Image.open(SOURCE).convert("RGB")
    period, ox, oy = grid(picture.convert("L"))
    cols, rows = int(picture.width / period), int(picture.height / period)
    inner = range(int(period * 0.25), int(period * 0.75))
    found = {}
    for j in range(rows):
        for i in range(cols):
            x0, y0 = ox + i * period, oy + j * period
            if x0 + period >= picture.width or y0 + period >= picture.height:
                continue
            c = Counter(picture.getpixel((int(x0 + a), int(y0 + b))) for a in inner for b in inner).most_common(1)[0][0]
            if min(c) <= PAPER:
                found[(i, j)] = c

    palette = []

    def snap(c):
        for p in palette:
            if sum(abs(a - b) for a, b in zip(c, p)) < SAME:
                return p
        palette.append(c)
        return c

    for c, _ in Counter(found.values()).most_common():
        snap(c)
    art = Image.new("RGBA", (cols, rows))
    for (i, j), c in found.items():
        art.putpixel((i, j), snap(c) + (255,))
    art = art.crop(art.getbbox())

    w, h = art.size
    sheet = Image.new("RGBA", (w * 2, h))
    sheet.paste(art, (0, 0))
    sheet.paste(ImageOps.mirror(art), (w, 0))
    sheet.save(OUT + ".png")
    frames = [
        {
            "filename": f"tronco {k}",
            "frame": {"x": k * w, "y": 0, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "duration": 100,
        }
        for k in range(2)
    ]
    data = {"frames": frames, "meta": {"image": "tronco.png", "size": {"w": w * 2, "h": h}, "frameTags": []}}
    with open(OUT + ".json", "w") as f:
        json.dump(data, f, indent=1)
    print(f"tronco: {w}x{h}, {len(palette)} colours, grid {period:.1f}px")


if __name__ == "__main__":
    build()
