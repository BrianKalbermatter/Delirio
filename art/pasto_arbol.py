"""Grass around the foot of a big tree, with fallen twigs in it, in two halves:
the back one is drawn before the tree and the front one after it. Brian's
gramilla (big and small) covers the roots where they meet the ground, so they
look like they come out of the earth; small tufts fill the ground around.

Usage: python3 pasto_arbol.py <sprites_dir>
Reads gramilla.png and gramilla_chica.png (art/gramilla.py) from sprites_dir
and writes pasto_arbol_atras.png and pasto_arbol_frente.png there, both W x H
with the tree's foot at (FOOT_X, FOOT_Y).
"""
import math
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from arbol import BARK  # noqa: E402
from maze_tiles import SMALL_TUFTS, TUFT_COLORS  # noqa: E402

W, H = 220, 72
FOOT_X, FOOT_Y = 110, 44
RING = (84, 20)  # half width and half height of the grass oval, px
RING_LIFT = 8  # the oval sits this far above the foot, over the roots
CLUMPS = 40  # small tufts on the ground around
TWIGS = 8
# Gramilla over the roots of Arbol1: base point from the foot (px) and size.
# Root tips are about 62 px left and 44 px right of the foot, 2-30 px up.
GRAMILLAS = [
    (-22, -34, "chica"), (24, -34, "chica"),  # behind the trunk
    (-56, -16, "grande"), (40, -14, "grande"), (-30, 3, "grande"), (10, 4, "grande"),
    (-66, -22, "chica"), (-44, -5, "chica"), (-12, 2, "chica"),
    (26, 0, "chica"), (52, -7, "chica"), (-4, -12, "chica"),
]

# Twigs lying in the grass: 3 lit, 2 bark, 1 shade, "o" outline.
TWIG_SHAPES = [
    ["...........oo.", "..oo......o3o.", ".o33o....o32o.", "..o223oo322o..", "...o2222211o..", "..o3221111o...", ".o32ooooo1o...", "o32o.....o....", "o1o...........", ".o............"],
    ["..o...........", ".o3o.oooooo.o.", "o322o333333o3o", ".o2222222222o.", "..o11111111o..", "...oooooooo..."],
    ["oo..........", "o3o.........", "o23o..o.....", ".o23oo3o....", "..o2223oooo.", "...o112223o.", "....oo1111o.", "......oooo.."],
]


def stamp(img, shape, x, y, colors):
    for j, line in enumerate(shape):
        for i, ch in enumerate(line):
            if ch != "." and 0 <= x + i < W and 0 <= y + j < H:
                img.putpixel((x + i, y + j), colors[ch] + (255,))


def build(out_dir):
    rng = random.Random(3)
    tufts = {
        "grande": Image.open(f"{out_dir}/gramilla.png").convert("RGBA"),
        "chica": Image.open(f"{out_dir}/gramilla_chica.png").convert("RGBA"),
    }
    back = Image.new("RGBA", (W, H))
    front = Image.new("RGBA", (W, H))
    rx, ry = RING
    items = []
    for k in range(CLUMPS):
        angle = k / CLUMPS * math.tau + rng.uniform(-0.1, 0.1)
        reach = rng.uniform(0.5, 1.05)
        x = FOOT_X + math.cos(angle) * rx * reach
        y = FOOT_Y - RING_LIFT + math.sin(angle) * ry * reach
        items.append((y, "grass", rng.choice(SMALL_TUFTS), x))
    for dx, dy, size in GRAMILLAS:
        items.append((FOOT_Y + dy, "gramilla", tufts[size], FOOT_X + dx))
    for _ in range(TWIGS):
        angle = rng.uniform(0, math.tau)
        x = FOOT_X + math.cos(angle) * rx * rng.uniform(0.3, 0.8)
        y = FOOT_Y - RING_LIFT + math.sin(angle) * ry * rng.uniform(0.3, 0.8)
        items.append((y, "twig", rng.choice(TWIG_SHAPES), x))
    bark = {str(i): c for i, c in enumerate(BARK)}
    bark["o"] = (40, 28, 22)
    # Top to bottom, so lower clumps overlap the ones behind them.
    for y, kind, shape, x in sorted(items, key=lambda item: item[0]):
        img = back if y < FOOT_Y - 20 else front  # the far side goes behind the trunk
        if kind == "gramilla":  # stands on its base, centred
            img.alpha_composite(shape, (round(x - shape.width / 2), round(y - shape.height)))
            continue
        left = round(x - len(shape[0]) / 2)
        top = round(y - len(shape))  # a clump stands on its base
        stamp(img, shape, left, top, TUFT_COLORS if kind == "grass" else bark)
    back.save(f"{out_dir}/pasto_arbol_atras.png")
    front.save(f"{out_dir}/pasto_arbol_frente.png")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".")
