"""The fruit bushes of Brian's picture (art/arbustos_frutos_original.png): small
berries, grapes and pomegranates. The picture is pixel art blown up 8x on a grey
ground: this takes each bush back to its real pixels and off the grey.

Usage: python3 art/arbustos_frutos.py   (needs numpy and scipy)
Writes client/public/sprites/arbusto_frutos.{png,json}: each bush standing on
the bottom middle of its frame, then the same three already picked, with leaves
where the fruit was. And client/public/assets/frutas.{png,json}: one fruit of
each, the items. The game shows the bushes at several sizes (render/bushes.ts).
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "arbustos_frutos_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "arbusto_frutos")
OUT_FRUIT = os.path.join(HERE, "..", "client", "public", "assets", "frutas")

GRID = 8  # screen px per real pixel
GROUND = (168, 168, 168)
GROUND_NEAR = 30  # this close to it (sum of channels) is the ground
SPECK = 6  # loose bits under this many pixels go
# Each bush in the picture (left, top, right, bottom).
BUSHES = [(136, 44, 456, 340), (552, 344, 1064, 752), (48, 576, 473, 1049)]
FRUIT_CELL = 24  # px of each item's frame
FRUIT_SCALE = 2  # the fruit is this much bigger as an item
# The berries are specks on the bush, too small to cut out: drawn for the item.
BERRY_COLOURS = {"d": (24, 22, 66), "b": (48, 66, 168), "l": (104, 132, 226), "g": (34, 96, 84)}
BERRIES = [
    "....gg....",
    "...gg.....",
    ".ddd.ddd..",
    "dbbbdbbbd.",
    "dlbbdlbbd.",
    "dbbbdbbbd.",
    ".dddddddd.",
    "..dbbbd...",
    "..dlbbd...",
    "..dbbbd...",
    "...ddd....",
]


def fruit_mask(bush_px, index):
    """Where the fruit is: blue and purple on the first two, red on the third."""
    r, g, b = (bush_px[..., i].astype(int) for i in range(3))
    mask = r - g > 45 if index == 2 else b > g + 10
    return mask & (bush_px[..., 3] > 0)


def picked(bush_px, mask):
    """The bush without its fruit: each pixel takes the colour of the nearest leaf."""
    grown = ndimage.binary_dilation(mask)
    nearest = ndimage.distance_transform_edt(grown | (bush_px[..., 3] == 0), return_distances=False, return_indices=True)
    out = bush_px.copy()
    out[grown] = bush_px[nearest[0][grown], nearest[1][grown]]
    return out


def fruit_item(bush_px, mask):
    """The biggest clump of fruit, blown up to fill an item's frame."""
    labels, n = ndimage.label(ndimage.binary_opening(mask, np.ones((2, 2))), structure=np.ones((3, 3)))
    biggest = labels == 1 + int(np.argmax(ndimage.sum(mask, labels, range(1, n + 1))))
    ys, xs = np.nonzero(biggest)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    part = bush_px[y0:y1, x0:x1].copy()
    part[~biggest[y0:y1, x0:x1], 3] = 0
    img = Image.fromarray(part, "RGBA")
    return img.resize((img.width * FRUIT_SCALE, img.height * FRUIT_SCALE), Image.Resampling.NEAREST)


def real_pixels(part):
    """The bush at its real size, on whichever offset fits its blocks best."""
    def blocks(ox, oy):
        h, w = (part.shape[0] - oy) // GRID, (part.shape[1] - ox) // GRID
        cut = part[oy:oy + h * GRID, ox:ox + w * GRID]
        return cut.reshape(h, GRID, w, GRID, 3).transpose(0, 2, 1, 3, 4).reshape(h, w, GRID * GRID, 3)

    best = min(((ox, oy) for ox in range(GRID) for oy in range(GRID)), key=lambda o: blocks(*o).astype(float).std(axis=2).mean())
    return np.median(blocks(*best), axis=2).astype(np.uint8)


def bush(image, box):
    left, top, right, bottom = box
    px = real_pixels(image[top:bottom, left:right])
    solid = np.abs(px.astype(int) - GROUND).sum(2) > GROUND_NEAR
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    solid = np.isin(labels, 1 + np.nonzero(sizes >= SPECK)[0])
    ys, xs = np.nonzero(solid)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return np.dstack([px, solid * np.uint8(255)])[y0:y1, x0:x1]


def berries():
    img = Image.new("RGBA", (len(BERRIES[0]), len(BERRIES)))
    for y, row in enumerate(BERRIES):
        for x, c in enumerate(row):
            if c != ".":
                img.putpixel((x, y), BERRY_COLOURS[c] + (255,))
    return img.resize((img.width * FRUIT_SCALE, img.height * FRUIT_SCALE), Image.Resampling.NEAREST)


def main():
    image = np.asarray(Image.open(SOURCE).convert("RGB"))
    whole = [bush(image, box) for box in BUSHES]
    masks = [fruit_mask(b, i) for i, b in enumerate(whole)]
    bushes = whole + [picked(b, m) for b, m in zip(whole, masks)]
    width = max(b.shape[1] for b in bushes)
    height = max(b.shape[0] for b in bushes)
    width += width % 2  # so the middle is a whole pixel
    sheet = Image.new("RGBA", (width * len(bushes), height))
    frames = []
    for i, b in enumerate(bushes):
        sheet.paste(Image.fromarray(b, "RGBA"), (i * width + (width - b.shape[1]) // 2, height - b.shape[0]))
        print(f"frame {i}: {b.shape[1]}x{b.shape[0]}")
        frames.append({
            "frame": {"x": i * width, "y": 0, "w": width, "h": height},
            "spriteSourceSize": {"x": 0, "y": 0, "w": width, "h": height},
            "sourceSize": {"w": width, "h": height},
            "duration": 100,
        })
    sheet.save(OUT + ".png")
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": frames, "meta": {"frameTags": []}}, f, indent=1)

    items = Image.new("RGBA", (FRUIT_CELL * len(whole), FRUIT_CELL))
    cells = []
    for i, (b, m) in enumerate(zip(whole, masks)):
        fruit = berries() if i == 0 else fruit_item(b, m)
        fruit.thumbnail((FRUIT_CELL, FRUIT_CELL), Image.Resampling.NEAREST)
        items.paste(fruit, (i * FRUIT_CELL + (FRUIT_CELL - fruit.width) // 2, FRUIT_CELL - fruit.height))
        cells.append({
            "frame": {"x": i * FRUIT_CELL, "y": 0, "w": FRUIT_CELL, "h": FRUIT_CELL},
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRUIT_CELL, "h": FRUIT_CELL},
            "sourceSize": {"w": FRUIT_CELL, "h": FRUIT_CELL},
            "duration": 100,
        })
    items.save(OUT_FRUIT + ".png")
    with open(OUT_FRUIT + ".json", "w") as f:
        json.dump({"frames": cells, "meta": {"frameTags": []}}, f, indent=1)


if __name__ == "__main__":
    main()
