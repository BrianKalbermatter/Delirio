"""Pixel-art trees with a chop animation: the tree shakes and drops leaves.

Usage: python3 arboles.py <out_dir>
Writes one PNG per tree, layer (Sombra, Tronco, Copa, Hojas) and frame:
<out_dir>/<tree>/<layer>_<frame>.png, plus arboles.txt with the tree names.
arboles_aseprite.lua assembles them into one .aseprite file per tree.

Frames: 0 is idle; 1..7 are the chop: the crown sways and leaves fall to the
ground. Common trees are 200x240, the giant dark-forest trees 240x288.
"""
import math
import os
import random
import sys

from PIL import Image

# Trees are designed on an 80x96 frame (base at y = 86) and grown by their
# scale when generated, so the art keeps the maze's pixel size instead of
# being stretched in the game. Common trees x2.5, the giant forest trees x3.
SCALE = 2.5
DESIGN_W, DESIGN_H = 80, 96
DESIGN_CX, DESIGN_BASE = 40, 86

# Frame size, trunk base line and sway of the tree being drawn (use_scale).
FW = FH = BASE_Y = CX = 0
SWAY = []


def use_scale(scale):
    global FW, FH, BASE_Y, CX, SWAY
    FW, FH = round(DESIGN_W * scale), round(DESIGN_H * scale)
    BASE_Y = round(DESIGN_BASE * scale)
    CX = FW // 2
    SWAY = [round(v * scale) for v in (3, -3, 2, -2, 1, -0.5, 0)]

# Light comes from the top-left, as in the reference sprite.
# Colours come from the maze palette (art/maze_tiles.py, Endesga-32 ramps) so
# the trees sit in the same world as the wall tops, floor and stone.
GAP = (24, 20, 37)                      # the maze's darkest outline/gap colour
SHADOW = GAP + (110,)

LEAVES = {
    # Same ramp as the mossy wall tops (CAP)
    "hedge":  [GAP, (25, 60, 62), (38, 92, 66), (62, 137, 72), (99, 199, 77)],
    # Brighter crown, topped with the palette's warm yellow
    "spring": [(25, 60, 62), (38, 92, 66), (62, 137, 72), (99, 199, 77), (254, 231, 97)],
    # Dark crown, the wall face ramp (FACE)
    "deep":   [GAP, (25, 48, 56), (32, 70, 64), (44, 96, 72), (60, 124, 80)],
    # Gloomy forest: the bottom of the FACE ramp, almost black
    "gloom":  [(12, 10, 18), (20, 24, 40), (25, 48, 56), (32, 70, 64), (44, 96, 72)],
}
BARK = {
    "brown": [(62, 39, 49), (115, 62, 57), (184, 111, 80), (228, 166, 114)],   # maze WOOD
    "grey":  [GAP, (58, 68, 102), (78, 92, 128), (104, 122, 158)],            # maze SLAB
    "dark":  [(12, 10, 18), (38, 30, 44), (62, 39, 49), (96, 62, 64)],         # old, wet wood
}
WOOD = [(184, 111, 80), (228, 166, 114), (232, 183, 150)]   # broken/cut wood
MOSS = (99, 199, 77)                                        # maze GRASS / FACE_MOSS
HOLE = GAP

# Horizontal sway of the crown per chop frame (the top moves the most).
CHOP_FRAMES = 7


# ---------------------------------------------------------------- layers

class Layer:
    """Sparse RGBA layer: {(x, y): color}."""

    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < FW and 0 <= y < FH:
            self.px[(x, y)] = c if len(c) == 4 else c + (255,)


def outline(layer, mask, color):
    """Paint every empty pixel that touches the mask (4-neighbourhood)."""
    for (x, y) in list(mask):
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in mask:
                layer.put(nx, ny, color)


# ---------------------------------------------------------------- trunk

def stamp_trunk(shade, points):
    """Stamp a thick polyline; shade[(x, y)] = -1 (lit side) .. 1 (dark side)."""
    for (x0, y0, w0), (x1, y1, w1) in zip(points, points[1:]):
        steps = max(1, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for i in range(steps + 1):
            t = i / steps
            x, y, w = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t
            half = w / 2
            for px in range(int(math.floor(x - half)), int(math.ceil(x + half)) + 1):
                d = (px + 0.5 - x) / max(half, 0.5)
                if abs(d) <= 1.0:
                    shade[(px, int(round(y)))] = d


def draw_trunk(layer, spec, rng):
    bark = BARK[spec.get("bark", "brown")]
    shade = {}
    for part in spec["trunk"]:
        stamp_trunk(shade, part)
    roots = []
    for dx, length, w in spec.get("roots", []):
        tip = (CX + dx * length, BASE_Y + 2 * spec["scale"])
        stamp_trunk(shade, [(CX + dx * 2 * spec["scale"], BASE_Y - 3 * spec["scale"], w), (tip[0], tip[1], 1)])
        roots.append(tip)

    outline(layer, shade, bark[0])
    for (x, y), d in shade.items():
        tone = 3 if d < -0.45 else 2 if d < 0.35 else 1
        # Bark grain: short vertical dark streaks
        if tone > 1 and rng.random() < 0.05:
            tone -= 1
        if (x * 5 + (y // 3) * 11) % 17 == 0:
            tone = max(1, tone - 1)
        layer.put(x, y, bark[tone])

    for tx, ty in roots:
        for _ in range(3):
            layer.put(int(tx + rng.randint(-2, 2)), int(ty) - rng.randint(0, 1), MOSS)

    for hx, hy, hw, hh in spec.get("holes", []):
        for y in range(hy - hh, hy + hh + 1):
            for x in range(hx - hw, hx + hw + 1):
                if ((x - hx) / hw) ** 2 + ((y - hy) / hh) ** 2 <= 1:
                    layer.put(x, y, HOLE)
        layer.put(hx - hw, hy + hh, bark[3])

    if "broken" in spec:
        draw_break(layer, spec["broken"], rng)
    return shade


def draw_break(layer, brk, rng):
    """Snapped top: light inner wood plus jagged splinters."""
    x, y, w = brk
    half = w // 2
    for px in range(x - half, x + half + 1):
        layer.put(px, y, WOOD[1])
        layer.put(px, y + 1, WOOD[0])
    layer.put(x - half + 1, y, WOOD[2])
    for px in range(x - half, x + half + 1, 2):
        h = rng.randint(1, 6)
        for k in range(1, h + 1):
            layer.put(px, y - k, WOOD[2] if k < h else WOOD[1])
        layer.put(px, y - h - 1, BARK["brown"][0])
        layer.put(px + 1, y - k, BARK["brown"][1])


# ---------------------------------------------------------------- crown

def clumps_for(blob, rng, density):
    """Leaf clumps filling an ellipse, extra ones on the rim for a bumpy edge."""
    cx, cy, rx, ry = blob
    out = []
    n = int(rx * ry * density)
    for i in range(n):
        a = rng.random() * math.tau
        rim = i % 3 == 0
        r = rng.uniform(0.82, 1.0) if rim else math.sqrt(rng.random()) * 0.85
        out.append((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r,
                    rng.uniform(2.2, 3.8), blob))
    return out


def crown_tone(x, y, blob, loc, rng):
    """Tone index 1..4 from the whole-crown light plus a local clump term."""
    bx, by, brx, bry = blob
    g = ((bx - x) / brx + (by - y) / bry) * 0.5
    if y > by + bry * 0.35:
        g -= 0.35                                    # underside in shade
    v = 0.55 * g + 0.45 * loc + rng.uniform(-0.08, 0.08)
    return max(1, min(4, int((v + 1) / 2 * 5)))


def draw_crown(layer, spec, rng):
    pal = LEAVES[spec["leaves"]]
    clumps = []
    for blob in spec["crown"]:
        clumps += clumps_for(blob, rng, spec.get("density", 0.22))
    clumps.sort(key=lambda c: c[1])      # back to front

    mask = {}
    # Solid inner body so no gaps show between clumps.
    for blob in spec["crown"]:
        bx, by, brx, bry = blob
        for y in range(int(by - bry), int(by + bry) + 1):
            for x in range(int(bx - brx), int(bx + brx) + 1):
                if ((x - bx) / (brx * 0.88)) ** 2 + ((y - by) / (bry * 0.88)) ** 2 <= 1:
                    mask[(x, y)] = pal[max(1, crown_tone(x, y, blob, -0.3, rng) - 1)]
    for x0, y0, r, blob in clumps:
        for y in range(int(y0 - r) - 1, int(y0 + r) + 2):
            for x in range(int(x0 - r) - 1, int(x0 + r) + 2):
                dx, dy = x + 0.5 - x0, y + 0.5 - y0
                dist = math.hypot(dx, dy)
                if dist > r:
                    continue
                tone = crown_tone(x, y, blob, -(dx + dy) / (r * 1.6), rng)
                if dist > r - 1.2 and dx + dy > 0:
                    tone = max(1, tone - 1)                      # clump rim
                mask[(x, y)] = pal[tone]
    outline(layer, mask, pal[0])
    for (x, y), c in mask.items():
        layer.put(x, y, c)
    return mask


# ---------------------------------------------------------------- tree

def render_tree(spec):
    """Trunk and crown on separate layers, so the game can fade the crown
    while the trunk stays solid. Returns (trunk, crown, crown mask, top)."""
    rng = random.Random(spec["seed"])
    trunk = Layer()
    draw_trunk(trunk, spec, rng)
    crown = Layer()
    mask = draw_crown(crown, spec, rng) if spec.get("crown") else {}
    top = min((y for _, y in [*trunk.px, *crown.px]), default=BASE_Y)
    return trunk, crown, mask, top


def shadow_layer(spec):
    sh = Layer()
    sx, rx, ry = spec["shadow"]
    cy = BASE_Y - 1
    for y in range(cy - ry, cy + ry + 1):
        for x in range(CX + sx - rx, CX + sx + rx + 1):
            if ((x - CX - sx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                sh.put(x, y, SHADOW)
    return sh


def falling_leaves(spec, crown, rng):
    """Leaves that break off on the first hit and drift down to the ground."""
    if not crown:
        return []
    pal = LEAVES[spec["leaves"]]
    # Leaves come off the crown's edge, so they read against the background.
    edge = [(x, y) for (x, y) in crown
            if any(n not in crown for n in ((x + 2, y), (x - 2, y), (x, y + 2)))]
    xs = [x for x, _ in crown]
    mid = (min(xs) + max(xs)) / 2
    out = []
    for _ in range(spec.get("drop", 10)):
        x, y = rng.choice(edge)
        side = 1 if x >= mid else -1
        out.append({
            "x": x, "y": y,
            "vx": side * rng.uniform(0.3, 1.6) * spec["scale"],
            "vy": rng.uniform(1.5, 3.2) * spec["scale"],
            "phase": rng.uniform(0, math.tau),
            "ground": BASE_Y + rng.randint(round(-4 * spec["scale"]), round(6 * spec["scale"])),
            "c": rng.choice(pal[2:]),
        })
    return out


# Tumbling leaf: first pixels are the lit face, the last one is the dark edge.
LEAF_SHAPES = [
    ((0, 0), (1, 0), (1, 1)),
    ((0, 0), (1, 1), (0, 1)),
    ((1, 0), (0, 1), (1, 1)),
    ((0, 0), (0, 1), (1, 1)),
]
LEAF_LANDED = ((0, 0), (1, 0), (2, 0))


def compose_layers(spec, trunk, crown, top, frame, leaves):
    """One frame split into the layers used in Aseprite:
    shadow, trunk, crown, leaves (bottom to top)."""
    shadow = Image.new("RGBA", (FW, FH))
    for (x, y), c in shadow_layer(spec).px.items():
        shadow.putpixel((x, y), c)

    sway = SWAY[frame - 1] if frame > 0 else 0
    height = max(1, BASE_Y - top)

    def bent(layer):
        img = Image.new("RGBA", (FW, FH))
        for (x, y), c in layer.px.items():
            # Bend: the base stays planted, the top moves the full sway.
            t = max(0.0, (BASE_Y - 4 - y) / height)
            nx = x + int(round(sway * t))
            if 0 <= nx < FW:
                img.putpixel((nx, y), c)
        return img

    falling = Image.new("RGBA", (FW, FH))
    if frame > 0:
        pal = LEAVES[spec["leaves"]]
        for leaf in leaves:
            k = frame
            y = leaf["y"] + leaf["vy"] * k + 0.35 * k * k
            x = leaf["x"] + leaf["vx"] * k + math.sin(leaf["phase"] + k * 1.3) * 2 * spec["scale"]
            landed = y >= leaf["ground"]
            y = min(y, leaf["ground"])
            shape = LEAF_LANDED if landed else LEAF_SHAPES[(k + int(leaf["phase"] * 3)) % 4]
            for i, (dx, dy) in enumerate(shape):
                px, py = int(x) + dx, int(y) + dy
                if 0 <= px < FW and 0 <= py < FH:
                    c = pal[0] if i == len(shape) - 1 else leaf["c"]
                    falling.putpixel((px, py), c + (255,))
    return {"Sombra": shadow, "Tronco": bent(trunk), "Copa": bent(crown), "Hojas": falling}


# ---------------------------------------------------------------- catalogue

def trunk_line(points):
    return [tuple(p) for p in points]


DESIGN_TREES = [
    {   # Close to the reference: round bright crown, short stocky trunk.
        "name": "redondo", "seed": 11, "leaves": "spring",
        "trunk": [trunk_line([(DESIGN_CX, DESIGN_BASE, 9), (DESIGN_CX, DESIGN_BASE - 14, 8), (DESIGN_CX + 1, DESIGN_BASE - 26, 7)])],
        "roots": [(-1, 7, 4), (1, 7, 4), (-0.4, 5, 3), (0.5, 5, 3)],
        "crown": [(DESIGN_CX, 44, 25, 23)],
        "shadow": (12, 26, 7), "drop": 12,
    },
    {   # Big old tree: tall trunk that forks, wide three-lobed crown.
        "name": "grande", "seed": 23, "leaves": "hedge", "density": 0.2,
        "trunk": [
            trunk_line([(DESIGN_CX, DESIGN_BASE, 12), (DESIGN_CX, DESIGN_BASE - 20, 10), (DESIGN_CX - 1, DESIGN_BASE - 32, 9)]),
            trunk_line([(DESIGN_CX - 1, DESIGN_BASE - 30, 6), (DESIGN_CX - 12, DESIGN_BASE - 44, 4)]),
            trunk_line([(DESIGN_CX, DESIGN_BASE - 30, 6), (DESIGN_CX + 13, DESIGN_BASE - 46, 4)]),
        ],
        "roots": [(-1, 9, 5), (1, 9, 5), (-0.5, 7, 4), (0.6, 7, 4)],
        "crown": [(DESIGN_CX - 14, 34, 19, 17), (DESIGN_CX + 14, 32, 19, 17), (DESIGN_CX, 24, 22, 18)],
        "shadow": (12, 34, 8), "drop": 16,
    },
    {   # Deformed: crooked leaning trunk, lopsided crown plus a lonely clump.
        "name": "deforme", "seed": 37, "leaves": "hedge",
        "trunk": [
            trunk_line([(DESIGN_CX - 4, DESIGN_BASE, 8), (DESIGN_CX - 2, DESIGN_BASE - 10, 7), (DESIGN_CX + 6, DESIGN_BASE - 18, 6),
                        (DESIGN_CX + 4, DESIGN_BASE - 28, 6), (DESIGN_CX + 12, DESIGN_BASE - 40, 5)]),
            trunk_line([(DESIGN_CX + 4, DESIGN_BASE - 26, 4), (DESIGN_CX - 10, DESIGN_BASE - 34, 3), (DESIGN_CX - 16, DESIGN_BASE - 33, 2)]),
        ],
        "roots": [(-1, 8, 4), (0.8, 5, 3)],
        "crown": [(DESIGN_CX + 12, 38, 20, 14), (DESIGN_CX + 20, 30, 10, 10), (DESIGN_CX - 17, 50, 7, 6)],
        "shadow": (14, 24, 6), "drop": 9,
    },
    {   # Broken: thick trunk snapped halfway, one branch still holding leaves.
        "name": "roto", "seed": 41, "leaves": "deep", "bark": "grey",
        "trunk": [
            trunk_line([(DESIGN_CX - 2, DESIGN_BASE, 12), (DESIGN_CX - 1, DESIGN_BASE - 18, 11), (DESIGN_CX, DESIGN_BASE - 34, 10)]),
            trunk_line([(DESIGN_CX + 2, DESIGN_BASE - 22, 4), (DESIGN_CX + 14, DESIGN_BASE - 34, 3), (DESIGN_CX + 18, DESIGN_BASE - 42, 2)]),
            trunk_line([(DESIGN_CX - 4, DESIGN_BASE - 28, 3), (DESIGN_CX - 12, DESIGN_BASE - 33, 2)]),
        ],
        "roots": [(-1, 9, 5), (1, 8, 5), (0.3, 6, 3)],
        "broken": (DESIGN_CX, DESIGN_BASE - 35, 10),
        "crown": [(DESIGN_CX + 17, 42, 9, 8), (DESIGN_CX - 13, 51, 4, 4)],
        "shadow": (8, 18, 5), "drop": 5,
    },
    {   # Young tree: thin trunk, small bright crown.
        "name": "joven", "seed": 53, "leaves": "spring", "density": 0.26,
        "trunk": [trunk_line([(DESIGN_CX, DESIGN_BASE, 5), (DESIGN_CX, DESIGN_BASE - 16, 4), (DESIGN_CX + 1, DESIGN_BASE - 30, 3)])],
        "roots": [(-1, 4, 2), (1, 4, 2)],
        "crown": [(DESIGN_CX + 1, 50, 14, 15)],
        "shadow": (8, 15, 4), "drop": 7,
    },
    {   # Ancient: tall hollow trunk with a knot hole, heavy drooping dark crown.
        "name": "viejo", "seed": 67, "leaves": "deep", "bark": "grey", "density": 0.2,
        "trunk": [
            trunk_line([(DESIGN_CX + 1, DESIGN_BASE, 13), (DESIGN_CX - 1, DESIGN_BASE - 16, 10), (DESIGN_CX + 2, DESIGN_BASE - 30, 9),
                        (DESIGN_CX, DESIGN_BASE - 42, 8)]),
            trunk_line([(DESIGN_CX + 2, DESIGN_BASE - 34, 4), (DESIGN_CX + 16, DESIGN_BASE - 40, 3)]),
        ],
        "roots": [(-1, 10, 5), (1, 9, 5), (-0.5, 8, 4), (0.4, 8, 4), (0.1, 6, 3)],
        "holes": [(DESIGN_CX - 1, DESIGN_BASE - 14, 2, 4)],
        "crown": [(DESIGN_CX, 30, 27, 18), (DESIGN_CX - 20, 42, 9, 10), (DESIGN_CX + 21, 44, 9, 11)],
        "shadow": (12, 32, 8), "drop": 14,
    },

    # ---- Dark forest: giant, thick, gloomy trees (x3).
    {   # Wide giant: a huge trunk splitting into two heavy limbs.
        "name": "bosque_ancho", "seed": 71, "leaves": "gloom", "bark": "dark", "scale": 3,
        "density": 0.2,
        "trunk": [
            trunk_line([(DESIGN_CX, DESIGN_BASE, 22), (DESIGN_CX, DESIGN_BASE - 22, 17), (DESIGN_CX - 1, DESIGN_BASE - 38, 14)]),
            trunk_line([(DESIGN_CX - 2, DESIGN_BASE - 36, 9), (DESIGN_CX - 16, DESIGN_BASE - 50, 6)]),
            trunk_line([(DESIGN_CX + 1, DESIGN_BASE - 36, 9), (DESIGN_CX + 16, DESIGN_BASE - 52, 6)]),
        ],
        "roots": [(-1, 14, 8), (1, 14, 8), (-0.5, 11, 6), (0.6, 11, 6), (0.15, 9, 5)],
        "crown": [(DESIGN_CX, 30, 28, 18), (DESIGN_CX - 18, 40, 14, 12), (DESIGN_CX + 18, 38, 14, 13),
                  (DESIGN_CX, 18, 20, 12)],
        "shadow": (10, 34, 9), "drop": 10,
    },
    {   # Twisted giant: gnarled leaning trunk, a hollow, one bare dead branch.
        "name": "bosque_torcido", "seed": 83, "leaves": "gloom", "bark": "dark", "scale": 3,
        "density": 0.2,
        "trunk": [
            trunk_line([(DESIGN_CX - 4, DESIGN_BASE, 19), (DESIGN_CX - 2, DESIGN_BASE - 14, 16), (DESIGN_CX + 6, DESIGN_BASE - 26, 14),
                        (DESIGN_CX + 2, DESIGN_BASE - 40, 12), (DESIGN_CX + 8, DESIGN_BASE - 52, 9),
                        (DESIGN_CX + 11, DESIGN_BASE - 60, 5), (DESIGN_CX + 12, DESIGN_BASE - 64, 2)]),
            trunk_line([(DESIGN_CX + 1, DESIGN_BASE - 34, 6), (DESIGN_CX - 16, DESIGN_BASE - 46, 4), (DESIGN_CX - 28, DESIGN_BASE - 58, 2)]),
            trunk_line([(DESIGN_CX - 16, DESIGN_BASE - 46, 2), (DESIGN_CX - 20, DESIGN_BASE - 40, 1)]),
        ],
        "roots": [(-1, 13, 7), (1, 10, 6), (0.4, 8, 5), (-0.4, 9, 5)],
        "holes": [(DESIGN_CX - 3, DESIGN_BASE - 12, 3, 5)],
        "crown": [(DESIGN_CX + 10, 26, 24, 16), (DESIGN_CX + 22, 38, 11, 10), (DESIGN_CX - 4, 32, 14, 11)],
        "shadow": (12, 30, 8), "drop": 8,
    },
    {   # Tall giant: straight thick trunk under a heavy, drooping crown.
        "name": "bosque_alto", "seed": 97, "leaves": "gloom", "bark": "dark", "scale": 3,
        "density": 0.2,
        "trunk": [
            trunk_line([(DESIGN_CX + 1, DESIGN_BASE, 18), (DESIGN_CX, DESIGN_BASE - 30, 14), (DESIGN_CX + 1, DESIGN_BASE - 60, 11),
                        (DESIGN_CX + 2, DESIGN_BASE - 68, 6), (DESIGN_CX + 2, DESIGN_BASE - 72, 2)]),
        ],
        "roots": [(-1, 12, 7), (1, 12, 7), (-0.5, 9, 5), (0.5, 9, 5)],
        "holes": [(DESIGN_CX + 2, DESIGN_BASE - 26, 2, 4)],
        "crown": [(DESIGN_CX, 20, 20, 14), (DESIGN_CX, 36, 28, 12), (DESIGN_CX - 22, 46, 8, 9),
                  (DESIGN_CX + 22, 47, 8, 9)],
        "shadow": (10, 30, 8), "drop": 9,
    },
]


def scaled(spec):
    """A design-space tree grown to its real frame size (sets use_scale)."""
    scale = spec.get("scale", SCALE)
    use_scale(scale)
    px = lambda x: (x - DESIGN_CX) * scale + CX
    py = lambda y: (y - DESIGN_BASE) * scale + BASE_Y
    k = lambda v: v * scale
    out = dict(spec, scale=scale)
    out["trunk"] = [[(px(x), py(y), k(w)) for x, y, w in part] for part in spec["trunk"]]
    out["roots"] = [(dx, k(length), k(w)) for dx, length, w in spec.get("roots", [])]
    out["crown"] = [(px(x), py(y), k(rx), k(ry)) for x, y, rx, ry in spec.get("crown", [])]
    out["holes"] = [(round(px(x)), round(py(y)), round(k(w)), round(k(h))) for x, y, w, h in spec.get("holes", [])]
    if "broken" in spec:
        x, y, w = spec["broken"]
        out["broken"] = (round(px(x)), round(py(y)), round(k(w)))
    sx, rx, ry = spec["shadow"]
    out["shadow"] = (round(k(sx)), round(k(rx)), round(k(ry)))
    out["drop"] = round(k(spec.get("drop", 10)))
    return out



# ---------------------------------------------------------------- export

def build_layers(out_dir):
    """Per-tree, per-layer frame PNGs: <out_dir>/<tree>/<layer>_<frame>.png.

    arboles_aseprite.lua assembles them into one .aseprite file per tree.
    """
    for design in DESIGN_TREES:
        spec = scaled(design)
        trunk, crown, mask, top = render_tree(spec)
        leaves = falling_leaves(spec, mask, random.Random(spec["seed"] * 7))
        os.makedirs(f"{out_dir}/{spec['name']}", exist_ok=True)
        for f in range(CHOP_FRAMES + 1):
            for layer, img in compose_layers(spec, trunk, crown, top, f, leaves).items():
                img.save(f"{out_dir}/{spec['name']}/{layer}_{f}.png")
    with open(f"{out_dir}/arboles.txt", "w") as f:
        f.write(" ".join(spec["name"] for spec in DESIGN_TREES))


if __name__ == "__main__":
    build_layers(sys.argv[-1] if len(sys.argv) > 1 else ".")
