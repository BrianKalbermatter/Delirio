#!/usr/bin/env python3
"""Recovers the pixels of art/arbol3_original.png like arbol2.py, and pulls the
stones and the grass tufts at its foot away from the tree: in the game they are
loose pieces, scattered under some trees.

Writes to <dir>: arbol.png and sombra.png, on the same canvas, and pie/<n>.png,
one PIECE x PIECE frame per loose piece, standing on the bottom of it: first the
stones, then the tufts (STONE_KINDS and TUFT_KINDS in domain/trees.ts).

Usage: python3 art/arbol3.py <art/arbol3_original.png> <dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from arbol2 import SHADOW_ALPHA, cells, fold, split

GRID = 4.78  # px of the image per art pixel
OFFSET = (0.0, 0.0)
CROWN_COLORS = 24  # size of each palette
BARK_COLORS = 10
LOOSE_COLORS = 14
TRUNK_COLS = (71, 79)  # art pixels: the trunk comes down between these...
TRUNK_BOTTOM = 125  # ...to here
FOOT_TOP = 117  # from this row down, what is beside the trunk is loose
LEAF_RED = 80  # a colour with this much more red than blue is a leaf
BARK_COLS = (66, 84)  # art pixels: there is no bark outside these
MIN_PIECE = 3  # art pixels: anything smaller is noise
PIECE = 16  # px of each frame of the loose pieces
# A point in each loose piece: they touch, so each pixel goes to the nearest.
STONES = 3  # the first seeds; the rest are tufts
SEEDS = [(55, 124), (60, 130), (68, 126), (45, 122), (61, 121), (77, 127), (87, 129), (74, 134)]
STONE_END = 73  # art pixels: past this the big stone is the trunk's foot
EIGHT_WAYS = np.ones((3, 3), int)


def biggest(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask, EIGHT_WAYS)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == 1 + int(np.argmax(sizes))


def frames(art: np.ndarray, mask: np.ndarray, pixels: np.ndarray) -> list[Image.Image]:
    """One frame per seed, with the pixels of `mask` nearest to it. Where a
    stone and a tuft touch, the colour says whose pixel it is."""
    rows, cols = np.indices(mask.shape)
    red, green, blue = (pixels[..., i].astype(int) for i in range(3))
    olive = (green >= 90) & (green >= red - 30) & (green - blue >= 0.3 * green)
    stone = (pixels.min(axis=2) >= 130) | (pixels.max(axis=2) < 60)
    distance = np.stack([np.hypot(cols - x, rows - y) for x, y in SEEDS])
    nearest = distance.argmin(axis=0)
    out = []
    for i in range(len(SEEDS)):
        piece = mask & (nearest == i)
        piece &= ~olive if i < STONES else ~stone
        if i == 2:
            piece &= cols < STONE_END
        labels, _ = ndimage.label(piece, EIGHT_WAYS)
        sizes = np.bincount(labels.ravel())[1:]
        piece = np.isin(labels, 1 + np.nonzero(sizes >= MIN_PIECE)[0])
        ys, xs = np.nonzero(piece)
        box = art[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].copy()
        box[~piece[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]] = 0
        frame = Image.new("RGBA", (PIECE, PIECE))
        frame.paste(Image.fromarray(box), ((PIECE - box.shape[1]) // 2, PIECE - box.shape[0]))
        out.append(frame)
    return out


def layer(pixels: np.ndarray, mask: np.ndarray, colors: int) -> np.ndarray:
    out = np.zeros((*pixels.shape[:2], 4), np.uint8)
    out[..., :3][mask] = fold(pixels[mask], colors)
    out[..., 3] = np.where(mask, 255, 0)
    return out


def main() -> None:
    source, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    pixels = cells(np.asarray(Image.open(source).convert("RGB")), GRID, OFFSET)
    drawn, is_shadow = split(pixels)
    channels = pixels.astype(int)
    red, blue = channels[..., 0], channels[..., 2]

    rows, cols = np.indices(drawn.shape)
    beside_trunk = (cols < TRUNK_COLS[0]) | (cols >= TRUNK_COLS[1])
    loose = drawn & (rows >= FOOT_TOP) & (beside_trunk | (rows >= TRUNK_BOTTOM))
    tree = biggest(drawn & ~loose)
    # The crown's outline is blurred with the grey around it: it stays a leaf
    is_leaf = tree & ((red - blue >= LEAF_RED) | (cols < BARK_COLS[0]) | (cols >= BARK_COLS[1]))
    art = layer(pixels, tree & ~is_leaf, BARK_COLORS)
    art[is_leaf] = layer(pixels, is_leaf, CROWN_COLORS)[is_leaf]

    shadow = np.zeros_like(art)
    shadow[..., 3] = np.where(biggest(is_shadow), SHADOW_ALPHA, 0)

    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(art).save(out_dir / "arbol.png")
    Image.fromarray(shadow).save(out_dir / "sombra.png")
    (out_dir / "pie").mkdir(exist_ok=True)
    for i, frame in enumerate(frames(layer(pixels, loose, LOOSE_COLORS), loose, pixels)):
        frame.save(out_dir / "pie" / f"{i}.png")
    print(f"{art.shape[1]}x{art.shape[0]}, tree {Image.fromarray(art).getbbox()}, shadow {Image.fromarray(shadow).getbbox()}")
    print(f"{len(SEEDS)} loose pieces")


if __name__ == "__main__":
    main()
