"""The bonfire of art/hoguera_original.png: a skeleton bent over a yellow fire, on a
heap of its own bones. The enemies' spawner. The picture is pixel art blown up
10.8x on a dark gradient: this takes it back to its real pixels, cuts it out and
makes the fire burn.

Usage: python3 art/hoguera.py   (needs numpy and scipy)
Writes client/public/sprites/hoguera.{png,json}. Tags: "arde" (whole), "herida"
(half the fire, the skull on the way down), "agoniza" (embers) and "apagada" (the
heap, cold, with the skull on it).
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "hoguera_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "hoguera")

GRID = 10.8  # screen px per real pixel
ORIGIN = (1.4, 3.4)  # where the first real pixel starts
FRAME = (112, 104)
BURN_FRAMES = 6
BURN_MS = 110
# In real pixels of the picture.
PILE_TOP = 66  # from here down: the heap of bones
LAST_ROW = 97  # past this, the frame of the picture
FIRE_BOX = (42, 44, 82, 84)  # left, top, right, bottom
SKULL_BOX = (17, 7, 37, 50)
# Yellow of the fire, dark to hot.
FIRE = [(150, 138, 30), (205, 190, 40), (238, 226, 66), (250, 244, 120), (255, 252, 190)]
EMBER = [(70, 58, 20), (126, 100, 28), (196, 150, 40)]
COLD = 0.6  # what is left of the light on the bones once it goes out


def real_pixels():
    image = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float)
    rows = int((image.shape[0] - ORIGIN[1]) / GRID)
    cols = int((image.shape[1] - ORIGIN[0]) / GRID)
    px = np.zeros((rows, cols, 3), np.uint8)
    for j in range(rows):
        for i in range(cols):
            y, x = ORIGIN[1] + (j + 0.5) * GRID, ORIGIN[0] + (i + 0.5) * GRID
            block = image[int(y - 2):int(y + 3), int(x - 2):int(x + 3)]
            px[j, i] = np.median(block.reshape(-1, 3), axis=0)
    return px


def cut_out(px):
    """What is drawn. Above the fire, anything greener than the blue-black behind
    it; the heap, anything that is not night; the fire's halo stays out (the game
    lights it): it is as red as it is green and dim."""
    r, g, b = (px[..., i].astype(int) for i in range(3))
    rows = np.arange(px.shape[0])[:, None]
    body = (rows < PILE_TOP) & (g - b > 16)
    pile = (rows >= PILE_TOP) & (r + g > 62)
    drawn = (body | pile) & (rows < LAST_ROW)
    left, top, right, bottom = FIRE_BOX
    around = np.zeros_like(drawn)
    around[top - 8:PILE_TOP + 6, left - 12:right + 12] = True
    halo = around & (r < 118) & (g - r < 6)
    drawn &= ~halo
    # The black of the sockets
    left, top, right, bottom = SKULL_BOX
    box = np.zeros_like(drawn)
    box[top:32, left:right] = True
    drawn |= ndimage.binary_fill_holes(ndimage.binary_closing(drawn, iterations=2)) & box
    return np.dstack([px, drawn * np.uint8(255)])


def fire_mask(rgba):
    """The flames: bright and yellow. The bones in them are greener."""
    left, top, right, bottom = FIRE_BOX
    r, g = rgba[..., 0].astype(int), rgba[..., 1].astype(int)
    flame = (r >= 118) & (g - r < 6) & (rgba[..., 3] > 0)
    box = np.zeros(flame.shape, bool)
    box[top:bottom, left:right] = True
    return flame & box


def burning(rgba, fire, step, height=1.0):
    """The fire at `step`: the drawing's own flames, waving more the higher they
    are, a band of heat climbing them and tongues leaving the tips."""
    out = rgba.copy()
    out[fire] = 0
    ys, xs = np.nonzero(fire)
    bottom, top = ys.max(), ys.min()
    phase = 2 * math.pi * step / BURN_FRAMES
    for y, x in zip(ys, xs):
        up = (bottom - y) / max(1, bottom - top)  # 0 at the base, 1 at the tip
        if up > height + 0.06 * math.sin(phase + x * 0.6):
            continue
        sway = round(up * 2.6 * math.sin(phase + y * 0.35))
        heat = 1 + 0.16 * math.sin(phase * 2 + y * 0.55)
        colour = np.minimum(255, rgba[y, x, :3] * heat).astype(np.uint8)
        nx = x + sway
        if 0 <= nx < out.shape[1]:
            out[y, nx] = (*colour, 255)
    rng = random.Random(step)
    tip = bottom - height * (bottom - top)
    for _ in range(round(9 * height)):
        x = int(rng.uniform(xs.min() + 4, xs.max() - 4))
        y = int(tip + rng.uniform(-9, 3))
        out[y, x] = (*FIRE[rng.randrange(1, 4)], 255)
    return out


def drips(rgba, step):
    """What runs down from the skull's jaw falls a pixel a step."""
    out = rgba.copy()
    left, top, right, bottom = SKULL_BOX
    below = 34  # the jaw ends here
    r, g = rgba[..., 0].astype(int), rgba[..., 1].astype(int)
    part = np.zeros(rgba.shape[:2], bool)
    part[below:bottom, left:right] = (r[below:bottom, left:right] > 170) & (g[below:bottom, left:right] > 160)
    ys, xs = np.nonzero(part)
    colours = rgba[ys, xs].copy()
    out[ys, xs] = 0
    length = bottom - below
    for y, x, c in zip(ys, xs, colours):
        out[below + (y - below + step) % length, x] = c
    return out


def heap(rgba, fire):
    """Cold: no fire, the back and the ribs gone, the skull on the bones."""
    out = rgba.copy()
    left, top, right, bottom = SKULL_BOX
    skull = rgba[top:34, left:right].copy()
    out[:PILE_TOP] = 0
    out[fire] = 0
    out[..., :3] = (out[..., :3] * COLD).astype(np.uint8)
    skull[..., :3] = (skull[..., :3] * COLD).astype(np.uint8)
    # It rolled down the heap
    dark = Image.fromarray(out, "RGBA")
    dark.alpha_composite(Image.fromarray(skull, "RGBA").rotate(-24, expand=True), (40, 52))
    return np.asarray(dark)


def embers(rgba, fire, step):
    out = rgba.copy()
    out[fire] = 0
    ys, xs = np.nonzero(fire)
    bottom = ys.max()
    phase = 2 * math.pi * step / BURN_FRAMES
    for y, x in zip(ys, xs):
        if y < bottom - 9:
            continue
        heat = 1 + math.sin(phase + x * 1.3 + y * 0.7)
        out[y, x] = (*EMBER[int(heat * 1.49)], 255)
    return out


def to_frame(rgba):
    img = Image.new("RGBA", FRAME)
    part = Image.fromarray(np.ascontiguousarray(rgba), "RGBA")
    box = part.getbbox()
    FULL = (0, 0, part.width, part.height)
    img.alpha_composite(part.crop(FULL), ((FRAME[0] - part.width) // 2, FRAME[1] - part.height))
    return img, box


def main():
    rgba = cut_out(real_pixels())
    # Everything sits on the frame's bottom: the heap's last row is the floor
    last = np.nonzero(rgba[..., 3].any(axis=1))[0].max()
    rgba = rgba[:last + 1]
    fire = fire_mask(rgba)
    print("drawn", rgba.shape, "fire px", int(fire.sum()))

    # The picture's dim yellow halo stayed out: the bones stay lit by the fire
    tags = {
        "arde": [drips(burning(rgba, fire, s), s) for s in range(BURN_FRAMES)],
        "herida": [drips(burning(rgba, fire, s, 0.55), s) for s in range(BURN_FRAMES)],
        "agoniza": [embers(rgba, fire, s) for s in range(BURN_FRAMES)],
        "apagada": [heap(rgba, fire)],
    }
    frames, frame_tags = [], []
    for tag, parts in tags.items():
        frame_tags.append({"name": tag, "from": len(frames), "to": len(frames) + len(parts) - 1, "direction": "forward"})
        frames += [to_frame(p)[0] for p in parts]
    sheet = Image.new("RGBA", (FRAME[0] * BURN_FRAMES, FRAME[1] * len(tags)))
    entries = []
    row = {t["from"]: i for i, t in enumerate(frame_tags)}
    for t in frame_tags:
        for k in range(t["to"] - t["from"] + 1):
            x, y = k * FRAME[0], row[t["from"]] * FRAME[1]
            sheet.paste(frames[t["from"] + k], (x, y))
            entries.append({
                "frame": {"x": x, "y": y, "w": FRAME[0], "h": FRAME[1]},
                "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME[0], "h": FRAME[1]},
                "sourceSize": {"w": FRAME[0], "h": FRAME[1]},
                "duration": BURN_MS,
            })
    sheet.save(OUT + ".png")
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": entries, "meta": {"frameTags": frame_tags}}, f, indent=1)


if __name__ == "__main__":
    main()
