"""The pit by the spawn, cut out of Brian's picture (art/hueco_original.png).

The picture is pixel art blown up 4x and saved with noise, on a meadow: this
takes it back to its real pixels, cuts the pit off the meadow (the floor down
in the pit stays: it is walled in by the rim) and closes the bottom of the rim,
which the picture cuts short.

Usage: python3 art/hueco.py   (needs numpy and scipy)
Writes client/public/sprites/hueco.png and prints the rows of the pit's
collision, which go in src/mecanicas/laberinto.c.
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "hueco_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "hueco.png")

GRID = 4  # screen px per real pixel in the picture
GRID_START = 2  # where the first whole pixel starts
MEADOW = (133, 169, 63)  # the picture's grass
MEADOW_NEAR = 36  # this close to it (sum of channels) is meadow, or a pale tuft
BLADES = 7  # px past the rim where the grass blades still belong to the pit
COLOURS = 48
ROW_STEP = 4  # px of the drawing per row of the collision
SOLID_INSET = 2  # px of the rim that can be walked on
EXTRA_ROWS = 3  # rim added under the picture's bottom edge
RIM_NARROWS = 3  # px it loses on each side per row added
TOP = 9  # nothing above this row: the flowers over the rim stay in the meadow

# The outer edge of the rim, by hand, in real pixels of the picture.
RIM = [
    (78, 13), (93, 11), (100, 20), (108, 27), (117, 35), (119, 42), (122, 62), (120, 75),
    (122, 86), (115, 91), (107, 102), (100, 113), (66, 113), (58, 100), (50, 90), (44, 85),
    (47, 75), (42, 62), (46, 42), (47, 36), (52, 30), (60, 24), (68, 17),
]


def real_pixels(path):
    """The picture at its real size: the median of each block drops the noise."""
    a = np.asarray(Image.open(path).convert("RGB"))
    h = (a.shape[0] - GRID_START) // GRID
    w = (a.shape[1] - GRID_START) // GRID
    a = a[GRID_START:GRID_START + h * GRID, GRID_START:GRID_START + w * GRID]
    blocks = a.reshape(h, GRID, w, GRID, 3).transpose(0, 2, 1, 3, 4).reshape(h, w, GRID * GRID, 3)
    return np.median(blocks, axis=2).astype(np.uint8)


def close_rim(px):
    """Adds the bottom of the rim: its last rows again, mirrored and narrowing."""
    h, w, _ = px.shape
    out = np.concatenate([px, np.tile(np.array(MEADOW, np.uint8), (EXTRA_ROWS, w, 1))])
    left, right = min(x for x, y in RIM if y == 113), max(x for x, y in RIM if y == 113)
    for k in range(EXTRA_ROWS):
        left, right = left + RIM_NARROWS, right - RIM_NARROWS
        out[h + k, left:right] = px[h - 1 - k, left:right]
    return out


def polygon(shape, points):
    img = Image.new("1", (shape[1], shape[0]))
    ImageDraw.Draw(img).polygon(points, fill=1)
    return np.array(img)


def main():
    px = close_rim(real_pixels(SOURCE))
    rim = polygon(px.shape, RIM)
    rim[px.shape[0] - EXTRA_ROWS:] |= (np.abs(px[-EXTRA_ROWS:].astype(int) - MEADOW).sum(2) > MEADOW_NEAR)

    # Meadow reached from outside goes; what the rim walls in stays.
    near = ndimage.binary_dilation(rim, iterations=BLADES)
    meadow = np.abs(px.astype(int) - MEADOW).sum(2) <= MEADOW_NEAR
    outside = ~near | (meadow & ~rim)
    labels, _ = ndimage.label(outside)
    outside = labels == labels[0, 0]
    kept = ~outside
    kept[:TOP] = False
    labels, n = ndimage.label(kept, structure=np.ones((3, 3)))
    kept = labels == 1 + np.argmax(ndimage.sum(kept, labels, range(1, n + 1)))

    ys, xs = np.where(kept)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    colours = Image.fromarray(px).quantize(COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    rgba = np.dstack([np.asarray(colours.convert("RGB")), kept * np.uint8(255)])[y0:y1, x0:x1]
    Image.fromarray(rgba, "RGBA").save(OUT)
    print(f"{OUT}: {x1 - x0}x{y1 - y0}")

    solid = ndimage.binary_erosion(rim, iterations=SOLID_INSET)[y0:y1, x0:x1]
    first, last = np.where(solid.any(axis=1))[0][[0, -1]]
    rows = []
    for y in range(first, last + 1, ROW_STEP):
        cols = np.where(solid[y:y + ROW_STEP].any(axis=0))[0]
        rows.append((int(cols.min()), int(cols.max()) + 1))
    print(f"HUECO_ARRIBA {first}, HUECO_ALTO_FILA {ROW_STEP}, HUECO_FILAS:")
    print(", ".join(f"{{{a}, {b}}}" for a, b in rows))


if __name__ == "__main__":
    main()
