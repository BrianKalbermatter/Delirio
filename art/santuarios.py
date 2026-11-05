"""The ten shrines of art/santuarios_original.png, cut out of their panels. The
picture is pixel art blown up 2x, five panels a row, each on its own colour.

Usage: python3 art/santuarios.py   (needs numpy and scipy)
Writes client/public/sprites/santuarios.{png,json}: frames 0..9 awake, as drawn,
in the picture's order (the first one, the book's), and 10..19 the same asleep.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "santuarios_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "santuarios")

GRID = 2  # screen px per real pixel
LEFT = 12  # where the panels start and how far apart they are, in the picture
ROWS = (20, 198)
PANEL = (96, 160)
COLUMNS = 5
FRAME = (48, 80)
NEAR_PANEL = 34  # this close to the panel's colour (sum of channels) is panel
NEAR_GAP = 16  # tighter, for the panel left inside a gap...
GAP_PX = 5  # ...of at least this many pixels
ASLEEP_LIGHT = 0.5  # what is left of its colours, asleep...
ASLEEP_GREY = (58, 58, 66)  # ...the rest is this


def cut(image, left, top):
    px = image[top:top + PANEL[1]:GRID, left:left + PANEL[0]:GRID]
    border = np.concatenate([px[0], px[:, 0], px[:, -1]])
    panel = np.median(border, axis=0).astype(int)
    near = np.abs(px.astype(int) - panel).sum(2) <= NEAR_PANEL
    # Only what touches the sides and the top: the same colour inside is drawing
    labels, _ = ndimage.label(near)
    edge = set(labels[0]) | set(labels[:, 0]) | set(labels[:, -1])
    edge.discard(0)
    solid = ~np.isin(labels, list(edge))
    # The panel seen through a gap in the drawing
    exact = np.abs(px.astype(int) - panel).sum(2) <= NEAR_GAP
    gaps, n = ndimage.label(exact & solid)
    for i in range(1, n + 1):
        if (gaps == i).sum() >= GAP_PX:
            solid[gaps == i] = False
    return np.dstack([px, solid * np.uint8(255)])


def asleep(rgba):
    out = rgba.copy()
    out[..., :3] = (rgba[..., :3] * ASLEEP_LIGHT + np.array(ASLEEP_GREY) * (1 - ASLEEP_LIGHT)).astype(np.uint8)
    return out


def main():
    image = np.asarray(Image.open(SOURCE).convert("RGB"))
    awake = [cut(image, LEFT + c * PANEL[0], top) for top in ROWS for c in range(COLUMNS)]
    frames = awake + [asleep(a) for a in awake]
    sheet = Image.new("RGBA", (FRAME[0] * len(awake), FRAME[1] * 2))
    entries = []
    for i, f in enumerate(frames):
        x, y = (i % len(awake)) * FRAME[0], (i // len(awake)) * FRAME[1]
        sheet.paste(Image.fromarray(np.ascontiguousarray(f), "RGBA"), (x, y))
        entries.append({
            "frame": {"x": x, "y": y, "w": FRAME[0], "h": FRAME[1]},
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME[0], "h": FRAME[1]},
            "sourceSize": {"w": FRAME[0], "h": FRAME[1]},
            "duration": 100,
        })
    sheet.save(OUT + ".png")
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": entries, "meta": {"frameTags": []}}, f, indent=1)


if __name__ == "__main__":
    main()
