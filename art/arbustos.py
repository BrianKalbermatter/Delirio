#!/usr/bin/env python3
"""Turns the painted bushes of sprites/Plaza/Arbustos_original.png into pixel art
sized for the game: each one cut off its grey background, shrunk to HEIGHT px and
folded into a small palette. The source stays out of this repo.

Writes <dir>/<n>.png, each standing on the bottom middle of a WIDTH x HEIGHT frame.

Usage: python3 art/arbustos.py <Arbustos_original.png> <dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from arbol2 import fold

# The dense ones, the ones that hide somebody: boxes in the image (left, top,
# right, bottom).
BUSHES = [
    (365, 100, 785, 420),
    (830, 115, 1155, 412),
    (340, 738, 606, 975),
    (0, 1040, 366, 1350),
    (365, 1025, 822, 1350),
    (830, 1012, 1200, 1346),
    (0, 1722, 366, 2016),
    (385, 1692, 792, 2024),
    (815, 1712, 1196, 1988),
]
WIDTH = 176  # px of each frame
HEIGHT = 128
TALL = 124  # px of the bush
COLORS = 20
GREEN = 12  # this much more green than red and blue is the plant, not the grey
COVER = 0.5  # share of a pixel the plant must fill to stay


def cut(box: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The plant's mask: green, in one piece, without holes."""
    red, green, blue = (box[..., i].astype(int) for i in range(3))
    mask = green - np.maximum(red, blue) >= GREEN
    mask |= box.max(axis=2) < 90  # the dark outline
    labels, count = ndimage.label(ndimage.binary_closing(mask, iterations=2))
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return ndimage.binary_fill_holes(labels == 1 + int(np.argmax(sizes)))


def bush(image: np.ndarray, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    part = image[top:bottom, left:right]
    mask = cut(part)
    ys, xs = np.nonzero(mask)
    part = part[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    mask = mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]

    tall = TALL
    wide = round(part.shape[1] * tall / part.shape[0])
    if wide > WIDTH:
        tall = round(tall * WIDTH / wide)
        wide = WIDTH
    weighted = (part * mask[..., None]).astype(np.uint8)
    color = np.asarray(Image.fromarray(weighted).resize((wide, tall), Image.Resampling.BOX), float)
    cover = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((wide, tall), Image.Resampling.BOX), float) / 255
    solid = cover >= COVER
    color = np.clip(color / np.maximum(cover, 0.01)[..., None], 0, 255).astype(np.uint8)

    out = np.zeros((tall, wide, 4), np.uint8)
    out[..., :3][solid] = fold(color[solid], COLORS)
    out[..., 3] = np.where(solid, 255, 0)
    frame = Image.new("RGBA", (WIDTH, HEIGHT))
    frame.paste(Image.fromarray(out), ((WIDTH - wide) // 2, HEIGHT - tall))
    return frame


def main() -> None:
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    image = np.asarray(Image.open(source).convert("RGB"))
    for i, box in enumerate(BUSHES):
        bush(image, box).save(out_dir / f"{i}.png")


if __name__ == "__main__":
    main()
