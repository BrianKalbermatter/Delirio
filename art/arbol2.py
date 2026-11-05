#!/usr/bin/env python3
"""Recovers the pixels of art/arbol2_original.png, a tree that came enlarged
(GRID px per art pixel), on a flat grey background and with compression noise.
Nothing is redrawn: each art pixel is the median of its cell of the image, and
the noise is folded into a small palette.

Writes <dir>/arbol.png (the tree) and <dir>/sombra.png (its shadow, as black
with alpha, so it darkens whatever ground is under it).

Usage: python3 art/arbol2.py <art/arbol2_original.png> <dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GRID = 5.74  # px of the image per art pixel
OFFSET = (0.5, 3.5)  # where the grid starts in the image: x, y
BACKGROUND = 116  # grey of the background...
SHADOW = 81  # ...and of the shadow on it
GREY_TOLERANCE = 14  # a cell this far from R = G = B counts as grey
GREY_MARGIN = 20  # how far a grey can stray from those two (a birch's trunk is grey too)
LEAF_COLORS = 24  # size of each palette
BARK_COLORS = 12
BARK_RED = 24  # a colour with this much more red than green is bark
SHADOW_ALPHA = round(255 * (1 - SHADOW / BACKGROUND))


def cells(image: np.ndarray, grid: float = GRID, offset: tuple[float, float] = OFFSET) -> np.ndarray:
    """One colour per art pixel: the median of the middle of its cell."""
    height, width, _ = image.shape
    cols = int((width - offset[0]) / grid)
    rows = int((height - offset[1]) / grid)
    out = np.zeros((rows, cols, 3), np.uint8)
    for r in range(rows):
        y0 = offset[1] + r * grid
        for c in range(cols):
            x0 = offset[0] + c * grid
            # Skips the rim of the cell, where the compression blurs neighbours
            cell = image[round(y0 + 1) : round(y0 + grid - 1), round(x0 + 1) : round(x0 + grid - 1)]
            out[r, c] = np.median(cell.reshape(-1, 3), axis=0)
    return out


def split(pixels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Masks of what was drawn and of the shadow; the rest is background."""
    channels = pixels.astype(int)
    grey = channels.max(axis=2) - channels.min(axis=2) <= GREY_TOLERANCE
    level = channels.mean(axis=2)
    middle = (BACKGROUND + SHADOW) / 2
    is_shadow = grey & (level < middle) & (level >= SHADOW - GREY_MARGIN)
    is_background = grey & (level >= middle) & (level <= BACKGROUND + GREY_MARGIN)
    return ~is_shadow & ~is_background, is_shadow


def fold(colors: np.ndarray, count: int) -> np.ndarray:
    """The same colours, folded into a palette of `count`."""
    strip = Image.fromarray(colors.reshape(1, -1, 3))
    folded = strip.quantize(count, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.asarray(folded.convert("RGB")).reshape(-1, 3)


def main() -> None:
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    pixels = cells(np.asarray(Image.open(source).convert("RGB")))

    channels = pixels.astype(int)
    is_tree, is_shadow = split(pixels)

    # Bark and leaves get a palette each: in a shared one the many greens leave
    # no room for the browns, and the trunk comes out green.
    is_bark = is_tree & (channels[..., 0] - channels[..., 1] >= BARK_RED)
    tree = np.zeros((*pixels.shape[:2], 4), np.uint8)
    tree[..., :3][is_bark] = fold(pixels[is_bark], BARK_COLORS)
    tree[..., :3][is_tree & ~is_bark] = fold(pixels[is_tree & ~is_bark], LEAF_COLORS)
    tree[..., 3] = np.where(is_tree, 255, 0)

    shadow = np.zeros_like(tree)
    shadow[..., 3] = np.where(is_shadow, SHADOW_ALPHA, 0)

    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(tree).save(out_dir / "arbol.png")
    Image.fromarray(shadow).save(out_dir / "sombra.png")
    print(f"{tree.shape[1]}x{tree.shape[0]}, tree box {Image.fromarray(tree).getbbox()}, shadow box {Image.fromarray(shadow).getbbox()}")


if __name__ == "__main__":
    main()
