"""Chop animation for a tree coloured by pintar_arbol.py, like the old trees:
frame 0 is idle; frames 1..7 are the chop, where the tree sways (its foot
stays planted, the top moves the most) and leaves break off the crown's edge
and tumble down to the ground.

Usage: python3 animar_arbol.py <line_art.png> <layers_dir>
Writes <layers_dir>/<Layer>_<frame>.png for the layers Sombra, Tronco, Copa
and Hojas (bottom to top), ready for arbol_aseprite.lua.
"""
import math
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pintar_arbol import BARK, BARK_CUT, BARK_LINE_NEW, LEAF, paint  # noqa: E402

FRAMES = 8
SWAY = [8, -8, 5, -5, 3, -1, 0]  # px at the top of the crown, per chop frame
DROP = 14  # leaves that fall on each chop
LAYERS = ["Sombra", "Tronco", "Copa", "Hojas"]

# Tumbling leaf, LEAF_PX px per pixel so it reads on a tree this size: the first
# pixels are the lit face, the last one the dark edge.
LEAF_SHAPES = [
    ((0, 0), (1, 0), (1, 1)),
    ((0, 0), (1, 1), (0, 1)),
    ((1, 0), (0, 1), (1, 1)),
    ((0, 0), (0, 1), (1, 1)),
]
LEAF_LANDED = ((0, 0), (1, 0), (2, 0))
LEAF_PX = 3


def split(painted):
    """Trunk pixels (bark colours) apart from everything else (the crown)."""
    bark = set(BARK) | {BARK_LINE_NEW, BARK_CUT}
    trunk, crown = {}, {}
    w, h = painted.size
    px = painted.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3]:
                (trunk if c[:3] in bark else crown)[(x, y)] = c
    return trunk, crown


def bent(pixels, size, foot_y, top_y, sway):
    img = Image.new("RGBA", size)
    height = max(1, foot_y - top_y)
    for (x, y), c in pixels.items():
        t = max(0.0, (foot_y - 6 - y) / height) ** 1.3  # foot planted, top moves most
        nx = x + int(round(sway * t))
        if 0 <= nx < size[0]:
            img.putpixel((nx, y), c)
    return img


def falling_leaves(crown, foot_y, rng):
    edge = [
        (x, y)
        for (x, y) in crown
        if any(n not in crown for n in ((x + 2, y), (x - 2, y), (x, y + 2))) and crown[(x, y)][:3] in LEAF
    ]
    mid = sum(x for x, _ in crown) / len(crown)
    leaves = []
    for _ in range(DROP):
        x, y = rng.choice(edge)
        leaves.append({
            "x": x, "y": y,
            "vx": (1 if x >= mid else -1) * rng.uniform(1, 4),
            "vy": rng.uniform(4, 8),
            "phase": rng.uniform(0, math.tau),
            "ground": foot_y + rng.randint(-10, 14),
            "c": rng.choice(LEAF[2:]),
        })
    return leaves


def leaves_frame(size, leaves, k):
    img = Image.new("RGBA", size)
    for leaf in leaves:
        y = leaf["y"] + leaf["vy"] * k + 1.0 * k * k
        x = leaf["x"] + leaf["vx"] * k + math.sin(leaf["phase"] + k * 1.3) * 5
        landed = y >= leaf["ground"]
        y = min(y, leaf["ground"])
        shape = LEAF_LANDED if landed else LEAF_SHAPES[(k + int(leaf["phase"] * 3)) % 4]
        for i, (dx, dy) in enumerate(shape):
            c = LEAF[0] if i == len(shape) - 1 else leaf["c"]
            for sx in range(LEAF_PX):
                for sy in range(LEAF_PX):
                    px, py = int(x) + dx * LEAF_PX + sx, int(y) + dy * LEAF_PX + sy
                    if 0 <= px < size[0] and 0 <= py < size[1]:
                        img.putpixel((px, py), c + (255,))
    return img


def build(src_path, out_dir):
    painted = paint(Image.open(src_path))
    size = painted.size
    trunk, crown = split(painted)
    foot_y = max(y for _, y in trunk)
    top_y = min(y for _, y in crown)
    leaves = falling_leaves(crown, foot_y, random.Random(7))
    empty = Image.new("RGBA", size)
    for f in range(FRAMES):
        sway = SWAY[f - 1] if f > 0 else 0
        layers = {
            "Sombra": empty,  # left for a hand-drawn shadow
            "Tronco": bent(trunk, size, foot_y, top_y, sway),
            "Copa": bent(crown, size, foot_y, top_y, sway),
            "Hojas": leaves_frame(size, leaves, f) if f > 0 else empty,
        }
        for name in LAYERS:
            layers[name].save(f"{out_dir}/{name}_{f}.png")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
