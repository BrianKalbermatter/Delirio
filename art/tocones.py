"""The stumps of art/tocones_original.png: a cut trunk, a dead tree and a double
stump. The picture is pixel art blown up 4x on a sheet of paper, with a frame
and a signature: this takes each one back to its real pixels and off the paper.

Usage: python3 art/tocones.py   (needs numpy and scipy)
Each stump comes out as it is and aged: more years mean greyer wood and more
moss climbing it, from the foot up.

Writes client/public/sprites/tocones.{png,json}, every stump standing on the
bottom middle of its frame: the three stumps, then the three a bit older, then
the three oldest.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "tocones_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "tocones")

GRID = 4  # screen px per real pixel
PAPER_LIGHT = 150  # the paper is at least this bright...
PAPER_GREY = 34  # ...and this close to grey (brightest minus darkest channel)
HOLE_GREY = 22  # paper seen through a hole in the wood: greyer than pale wood
FRINGE_LIGHT = 165  # pale pixels along the edge are the paper bleeding in...
FRINGE_GREY = 60  # ...when they are this close to grey
SPECK = 5  # loose bits under this many pixels go
# Each stump in the picture (left, top, right, bottom).
STUMPS = [(76, 196, 304, 412), (320, 96, 544, 476), (568, 192, 832, 428)]
AGES = [(0, 0), (0.18, 0.3), (0.34, 0.55)]  # by age: how grey the wood, how much moss
MOSS = [(50, 80, 44), (74, 112, 50), (104, 140, 62)]
MOSS_SPOTS = 2.0  # px: how big the patches are
FOOT_BIAS = 0.4  # moss likes the foot this much more than the top
DARKEST = 30  # holes and charred wood stay bare


def real_pixels(part):
    """The stump at its real size, on whichever offset fits its blocks best."""
    def blocks(ox, oy):
        h, w = (part.shape[0] - oy) // GRID, (part.shape[1] - ox) // GRID
        cut = part[oy:oy + h * GRID, ox:ox + w * GRID]
        return cut.reshape(h, GRID, w, GRID, 3).transpose(0, 2, 1, 3, 4).reshape(h, w, GRID * GRID, 3)

    best = min(((ox, oy) for ox in range(GRID) for oy in range(GRID)), key=lambda o: blocks(*o).astype(float).std(axis=2).mean())
    return np.median(blocks(*best), axis=2).astype(np.uint8)


def stump(image, box):
    left, top, right, bottom = box
    px = real_pixels(image[top:bottom, left:right])
    c = px.astype(int)
    paper = (c.max(axis=2) >= PAPER_LIGHT) & (c.max(axis=2) - c.min(axis=2) <= PAPER_GREY)
    # Only the paper reached from the edge: pale wood inside the stump stays
    labels, _ = ndimage.label(paper)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    solid = ~np.isin(labels, edge[edge > 0])
    light, grey = c.max(axis=2), c.max(axis=2) - c.min(axis=2)
    solid &= ~((light >= PAPER_LIGHT) & (grey <= HOLE_GREY))
    fringe = (light >= FRINGE_LIGHT) & (grey <= FRINGE_GREY)
    for _ in range(2):
        solid &= ~(fringe & ndimage.binary_dilation(~solid))
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    solid = np.isin(labels, 1 + np.nonzero(sizes >= SPECK)[0])
    ys, xs = np.nonzero(solid)
    return np.dstack([px, solid * np.uint8(255)])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def aged(px, grey, moss, seed):
    """The same stump after some years: greyer wood, and moss on it."""
    if moss == 0:
        return px
    rng = np.random.default_rng(seed)
    rgb = px[..., :3].astype(float)
    solid = px[..., 3] > 0
    wood = solid & (rgb[..., 0] > rgb[..., 1]) & (rgb[..., 0] - rgb[..., 2] > 15)
    plain = rgb.mean(axis=2, keepdims=True) * np.array([0.98, 1.0, 0.9])
    rgb[wood] += (plain[wood] - rgb[wood]) * grey

    spots = ndimage.gaussian_filter(rng.random(solid.shape), MOSS_SPOTS)
    spots = spots.ravel().argsort().argsort().reshape(solid.shape) / spots.size  # evenly 0..1
    height = np.linspace(0, FOOT_BIAS, solid.shape[0])[:, None]
    light = rgb.mean(axis=2)
    grown = solid & (spots + height > 1 + FOOT_BIAS / 2 - moss) & (light > DARKEST)
    tone = np.digitize(light + rng.normal(0, 14, light.shape), [75, 125])
    rgb[grown] = np.array(MOSS)[tone[grown]]
    return np.dstack([rgb.astype(np.uint8), px[..., 3]])


def main():
    image = np.asarray(Image.open(SOURCE).convert("RGB"))
    whole = [stump(image, box) for box in STUMPS]
    stumps = [aged(s, grey, moss, i * 7 + age) for age, (grey, moss) in enumerate(AGES) for i, s in enumerate(whole)]
    width = max(s.shape[1] for s in stumps)
    height = max(s.shape[0] for s in stumps)
    width += width % 2
    sheet = Image.new("RGBA", (width * len(stumps), height))
    frames = []
    for i, s in enumerate(stumps):
        sheet.paste(Image.fromarray(s, "RGBA"), (i * width + (width - s.shape[1]) // 2, height - s.shape[0]))
        print(f"frame {i}: {s.shape[1]}x{s.shape[0]}")
        frames.append({
            "frame": {"x": i * width, "y": 0, "w": width, "h": height},
            "spriteSourceSize": {"x": 0, "y": 0, "w": width, "h": height},
            "sourceSize": {"w": width, "h": height},
            "duration": 100,
        })
    sheet.save(OUT + ".png")
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": frames, "meta": {"frameTags": []}}, f, indent=1)


if __name__ == "__main__":
    main()
