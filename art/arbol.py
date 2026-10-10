"""Sample tree in the style of the meadow reference: a round crown made of rows
of leaf clusters whose pointed leaves hang over the row below, lit from the top
left, with clean bands of a few greens (no colour noise). A short trunk with
roots, grass around the base with twigs fallen into it, and a few loose sticks
for the ground nearby.

Usage: python3 arbol.py <out_dir> [layers_dir]
Writes arbol.png (the tree; its base, the trunk's foot, is BASE px from the
top, centred) and palitos.png (a strip of STICK x STICK loose sticks). With
layers_dir, also one PNG per layer, for arbol_aseprite.lua.
"""
import math
import sys

from PIL import Image

W, H = 112, 128
BASE = 116  # y of the trunk's foot
CX = 56  # trunk centre

OUTLINE = (24, 50, 30)
LEAF = [(38, 84, 42), (58, 120, 52), (88, 154, 66), (132, 188, 86)]  # shadow .. lit
BARK = [(48, 34, 30), (84, 60, 42), (120, 90, 58), (156, 124, 80)]
GROUND_SHADOW = (130, 178, 52)
GRASS = {"s": (142, 188, 56), "d": (84, 132, 42), "m": (116, 164, 48), "l": (196, 230, 98)}
STICK = 16

# Light offset of each pixel of a leaf scale (6 x 4, rows offset by 3).
LEAF_SCALE = [
    [0, 1, 1, 1, 0, 0],
    [1, 0, 0, 0, 1, 0],
    [-1, 0, 0, 0, -1, 0],
    [0, -1, -1, -1, 0, 0],
]

# Leaf clumps: centre x, centre y, radius. Listed bottom to top: upper clumps
# are drawn last, their leafy edge hanging over the clump below.
CLUMPS = [
    (36, 70, 15), (78, 68, 15), (57, 62, 17),
    (28, 50, 15), (86, 48, 14), (56, 44, 18),
    (40, 28, 14), (72, 26, 14), (56, 16, 12),
]


def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c + (255,))


def light(nx, ny):
    """Light from the top left: 1 lit, 0 in shadow."""
    return max(0.0, min(1.0, 0.5 - 0.55 * nx - 0.65 * ny))


def ground_shadow(img):
    cx, cy, rx, ry = CX, BASE - 1, 34, 8
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                put(img, x, y, GROUND_SHADOW)


def bark_tone(u):
    """u: 0 at the trunk's left edge .. 1 at its right edge (light from the left)."""
    return 3 if u < 0.2 else 2 if u < 0.5 else 1 if u < 0.85 else 0


def limb(img, x0, y0, x1, y1, w0, w1):
    """A tapering trunk or branch from (x0, y0) to (x1, y1), outlined."""
    steps = max(abs(y1 - y0), abs(x1 - x0), 1)
    pts = []
    for k in range(steps + 1):
        t = k / steps
        pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t))
    for x, y, w in pts:  # outline first, then the bark over it
        for dx in range(-int(w) - 1, int(w) + 2):
            put(img, px(x + dx), px(y), OUTLINE)
    for x, y, w in pts:
        for dx in range(-int(w), int(w) + 1):
            u = (dx + w) / (2 * w) if w else 0.5
            put(img, px(x + dx), px(y), BARK[bark_tone(u)])


def px(v):
    """Pixel of a coordinate. Not round(): it rounds .5 to even and leaves gaps."""
    return math.floor(v + 0.5)


def trunk(img):
    limb(img, CX, BASE, CX + 2, 60, 6, 4)
    limb(img, CX + 1, 82, CX - 16, 58, 2.5, 1.5)  # branches into the crown
    limb(img, CX + 2, 76, CX + 18, 56, 2.5, 1.5)
    # Roots flaring over the ground.
    for dx, length, lift in ((-1, 12, 3), (1, 13, 2), (-1, 6, 0), (1, 6, 0)):
        limb(img, CX + dx * 3, BASE - 3 - lift, CX + dx * (5 + length), BASE + (1 if lift else 3), 2.5, 0.5)


def in_clump(x, y, cx, cy, r):
    """Round top; the bottom edge is scalloped, a leaf tip every 5 px."""
    dx, dy = x - cx, y - cy
    if dy <= 0:
        return dx * dx + dy * dy <= r * r
    if abs(dx) > r:
        return False
    edge = math.sqrt(r * r - dx * dx) * 0.75 + (2 - abs(((dx + 50) % 5) - 2))
    return dy <= edge


def crown(img):
    owner = {}
    for k, (cx, cy, r) in enumerate(CLUMPS):
        for y in range(cy - r - 1, cy + r + 3):
            for x in range(cx - r - 1, cx + r + 2):
                if in_clump(x, y, cx, cy, r):
                    owner[(x, y)] = k
    for (x, y), k in owner.items():
        cx, cy, r = CLUMPS[k]
        nx, ny = (x - cx) / r, (y - cy) / r
        level = light(nx, ny) * 3.2 + 0.2
        # Lower clumps sit in the crown's shade.
        level -= (cy - 16) / 90
        # Leaf scales: small ovals, lit on top and shaded under, in offset
        # rows. Regular, so it reads as leaves and not as colour noise.
        v = (y - cy + 40) % 4
        u = (x - cx + 60 + ((y - cy + 40) // 4 % 2) * 3) % 6
        level += LEAF_SCALE[v][u] * 0.75
        tone = max(0, min(3, int(level)))
        # Shadow where an upper clump hangs over this one.
        above = owner.get((x, y - 2))
        if above is not None and above != k and CLUMPS[above][1] < cy:
            tone = 0
        put(img, x, y, LEAF[tone])
    # Outline the silhouette and the edge of every clump over another.
    for (x, y), k in owner.items():
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            other = owner.get((x + ox, y + oy))
            if other is None:
                put(img, x + ox, y + oy, OUTLINE)
            elif other != k and CLUMPS[other][1] > CLUMPS[k][1] and oy == 1:
                put(img, x, y + 1, OUTLINE)


# Grass around the base, hiding the roots; "b"/"B" are twigs fallen into it.
BASE_GRASS = [
    "......l.........l.........l.....l.........",
    "..l...ml...l...lm..l...l..ml...lm..l......",
    "..ml..mm..lm.l.mm.lm..lm..mm.l.mm.lm...l..",
    "l..mmdm.mmd..mmdmmm..mmd.mdm.mmd.mm...mm..",
    "mm.mdmdmmdm.bBmdmdm.mdmmdmdmmdm.mdmm.md.l.",
    ".mmddmddmddmmbBBdmddmddmddmmBBbdmddmmdmmm.",
    "lmddddddddddmddbBdddddddddBBbddddddddddmdl",
    "mdddddddddddddddddddddddddddddddddddddddm.",
    "sddddddddddddddddddddddddddddddddddddddds.",
    ".sssssssssssssssssssssssssssssssssssssss..",
]


def base_grass(img):
    x0 = CX - len(BASE_GRASS[0]) // 2
    y0 = BASE + 5 - len(BASE_GRASS)
    for j, line in enumerate(BASE_GRASS):
        for i, ch in enumerate(line):
            if ch in "bB":
                put(img, x0 + i, y0 + j, BARK[2] if ch == "b" else BARK[0])
            elif ch != ".":
                put(img, x0 + i, y0 + j, GRASS[ch])


# Loose sticks: 3 lit, 2 bark, 0 dark underside.
STICKS = [
    ["..........3.", "........32..", "..33...32...", "...2232.....", ".322220.....", "3200.0......", "00.........."],
    ["............", "..3........", ".3223333333.", "..0222222220", "...00000000."],
    ["3...........", "02..........", ".032........", "..0232..3...", "...0022232..", ".....00000.."],
    ["....3.....", "...32..3..", ".332232.20", "3200.0220.", "00.....0.."],
]


def sticks():
    strip = Image.new("RGBA", (STICK * len(STICKS), STICK))
    for k, shape in enumerate(STICKS):
        x0 = k * STICK + (STICK - len(shape[0])) // 2
        y0 = (STICK - len(shape)) // 2
        for j, line in enumerate(shape):
            for i, ch in enumerate(line):
                if ch != ".":
                    put(strip, x0 + i, y0 + j, BARK[int(ch)])
    return strip


# Layers, bottom to top, as they go into the Aseprite file.
LAYERS = [("Sombra", ground_shadow), ("Tronco", trunk), ("Copa", crown), ("Pasto", base_grass)]


def build(out_dir, layers_dir=None):
    tree = Image.new("RGBA", (W, H))
    for name, draw in LAYERS:
        layer = Image.new("RGBA", (W, H))
        draw(layer)
        if layers_dir:
            layer.save(f"{layers_dir}/{name}.png")
        tree.alpha_composite(layer)
    tree.save(f"{out_dir}/arbol.png")
    sticks().save(f"{out_dir}/palitos.png")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".", sys.argv[2] if len(sys.argv) > 2 else None)
