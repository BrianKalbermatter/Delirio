"""Decoration of the square around Brian's tree: fallen branches the player
can pick up, in the browns and greens of the tree (pintar_arbol.py).

Usage: python3 plaza_deco.py <frames_dir>
Writes <frames_dir>/ramas/<n>.png plus a durations.txt (ms per frame), for
frames_aseprite.lua.
"""
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pintar_arbol import BARK, LEAF  # noqa: E402


def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c + (255,))


# ---------------------------------------------------------------- branches
# Fallen branches the player can pick up (E), in the tree trunk's browns.

BRANCH_W, BRANCH_H = 32, 20
BRANCH_LINE = (58, 38, 24)  # the trunk's outline colour
# Each branch: the main stick (from, to) and its twigs, as (from, to, width).
BRANCHES = [
    [((3, 14), (28, 8), 1.5), ((14, 11), (19, 3), 0.5), ((22, 9), (29, 13), 0.5)],
    [((4, 8), (27, 15), 1.5), ((11, 10), (9, 3), 0.5), ((19, 13), (25, 6), 0.5)],
    [((3, 12), (28, 12), 1.5), ((9, 12), (5, 5), 0.5), ((17, 12), (22, 5), 0.5), ((22, 12), (27, 17), 0.5)],
]
# Leaves still on a branch: (x, y) of each, two pixels, lit and shaded.
BRANCH_LEAVES = [[(20, 2), (5, 12)], [(8, 2), (26, 5)], [(4, 4), (23, 4)]]


def stick(img, a, b, w, color_of):
    """A straight stick from a to b, w px to each side of its line."""
    (x0, y0), (x1, y1) = a, b
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for k in range(steps + 1):
        t = k / steps
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for dy in range(-math.ceil(w), math.ceil(w) + 1):
            if abs(dy) <= w + 0.01:
                put(img, round(x), round(y + dy), color_of(dy, w))


def branch(parts, leaves):
    img = Image.new("RGBA", (BRANCH_W, BRANCH_H))
    outline = lambda dy, w: BRANCH_LINE  # noqa: E731
    # Lit on top, shaded under, like the tree with the sun above.
    bark = lambda dy, w: BARK[3] if dy < 0 else BARK[1] if dy > 0 else BARK[2]  # noqa: E731
    for a, b, w in parts:  # outline first, then the bark over it
        stick(img, a, b, w + 1, outline)
    for a, b, w in parts:
        stick(img, a, b, w, bark)
    # A knot along the main stick.
    (x0, y0), (x1, y1), _ = parts[0]
    put(img, round((x0 + x1) / 2), round((y0 + y1) / 2), BARK[0])
    for x, y in leaves:
        put(img, x, y, LEAF[4])
        put(img, x + 1, y, LEAF[3])
        put(img, x, y + 1, LEAF[2])
        put(img, x + 1, y + 1, LEAF[1])
    return img


def build(out_dir):
    branch_dir = os.path.join(out_dir, "ramas")
    os.makedirs(branch_dir, exist_ok=True)
    for i, (parts, leaves) in enumerate(zip(BRANCHES, BRANCH_LEAVES)):
        branch(parts, leaves).save(os.path.join(branch_dir, f"{i}.png"))
    with open(os.path.join(branch_dir, "durations.txt"), "w") as f:
        f.write(" ".join("100" for _ in BRANCHES))


if __name__ == "__main__":
    build(sys.argv[1])
