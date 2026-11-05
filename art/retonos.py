#!/usr/bin/env python3
"""Draws the saplings: the two trees of the square in miniature, shrunk from
their sprites. Each frame stands on the bottom of a PIECE x PIECE canvas.

Writes <dir>/<n>.png, in the order of SPECIES in domain/trees.ts.

Usage: python3 art/retonos.py client/public/sprites <dir>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PIECE = 24  # px of each frame
HEIGHT = 22  # px of the sapling
COVER = 0.45  # share of a pixel the tree must fill to stay
OUTLINE_DARKEN = 0.55  # the rim of the shrunk tree, so it reads as a drawing
TREES = ["arbol_2.png", "arbol_3.png"]


def miniature(path: Path) -> Image.Image:
    tree = Image.open(path).convert("RGBA")
    tree = tree.crop(tree.getbbox())
    width = round(tree.width * HEIGHT / tree.height)
    # Colour weighted by alpha, or the transparent black would dirty the edges
    rgba = np.asarray(tree, float)
    alpha = rgba[..., 3:] / 255
    premultiplied = Image.fromarray((rgba[..., :3] * alpha).astype(np.uint8))
    color = np.asarray(premultiplied.resize((width, HEIGHT), Image.Resampling.BOX), float)
    cover = np.asarray(tree.getchannel("A").resize((width, HEIGHT), Image.Resampling.BOX), float) / 255
    solid = cover >= COVER
    color = color / np.maximum(cover, 0.01)[..., None]

    # Rim: a solid pixel with a hole beside it
    padded = np.pad(solid, 1)
    inner = padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:]
    color[solid & ~inner] *= OUTLINE_DARKEN

    out = np.zeros((HEIGHT, width, 4), np.uint8)
    out[..., :3] = np.clip(color, 0, 255)
    out[..., 3] = np.where(solid, 255, 0)
    frame = Image.new("RGBA", (PIECE, PIECE))
    frame.paste(Image.fromarray(out), ((PIECE - width) // 2, PIECE - HEIGHT))
    return frame


def main() -> None:
    sprites, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(TREES):
        miniature(sprites / name).save(out_dir / f"{i}.png")


if __name__ == "__main__":
    main()
