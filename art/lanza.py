"""The spear of the main character, out of art/personaje_4_original.png. There it
points down in his hand, with his legs behind it: the head is cut from the picture
by its colours and the shaft, thin and straight, drawn again. As the other weapons'
exports it stands with its head up and to the right.

Usage: python3 art/lanza.py <lanza.png>   (bash art/armas_build.sh runs it)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "personaje_4_original.png")

GRID = 6  # screen px per real pixel
HEAD_BOX = (56, 74, 70, 101)  # left, top, right, bottom of the head, in real pixels
CANVAS = 44
SHAFT_FROM = (2, 41)  # the butt...
SHAFT_TO = (29, 14)  # ...to where the head starts
SHAFT = (58, 34, 44, 255)
SHAFT_LIGHT = (104, 66, 70, 255)
HEAD_AT = (27, 5)


def real_pixels():
    image = np.asarray(Image.open(SOURCE).convert("RGB"))
    h, w = image.shape[0] // GRID, image.shape[1] // GRID
    cut = image[:h * GRID, :w * GRID].reshape(h, GRID, w, GRID, 3)
    return np.median(cut.transpose(0, 2, 1, 3, 4).reshape(h, w, GRID * GRID, 3), axis=2).astype(np.uint8)


def head():
    left, top, right, bottom = HEAD_BOX
    px = real_pixels()[top:bottom, left:right]
    r, g, b = (px[..., i].astype(int) for i in range(3))
    cream = (r > 165) & (g > 125) & (b < 235) & (r - b > 20) | (r + g + b > 560)
    labels, n = ndimage.label(cream, structure=np.ones((3, 3)))
    sizes = ndimage.sum(cream, labels, range(1, n + 1))
    keep = labels == 1 + int(np.argmax(sizes))
    keep = ndimage.binary_fill_holes(ndimage.binary_closing(keep))
    rgba = np.dstack([px, keep * np.uint8(255)])
    ys, xs = np.nonzero(keep)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(np.ascontiguousarray(rgba[::-1]), "RGBA")  # it points down there


def main(path):
    img = Image.new("RGBA", (CANVAS, CANVAS))
    d = ImageDraw.Draw(img)
    d.line((*SHAFT_FROM, *SHAFT_TO), fill=SHAFT, width=2)
    d.line((SHAFT_FROM[0] + 1, SHAFT_FROM[1] - 1, SHAFT_TO[0] + 1, SHAFT_TO[1] - 1), fill=SHAFT_LIGHT)
    img.alpha_composite(head(), HEAD_AT)
    img.save(path)


if __name__ == "__main__":
    main(sys.argv[1])
