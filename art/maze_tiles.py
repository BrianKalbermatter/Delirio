"""Procedural tileset for the maze: dirt floor, stone paving, mossy wall tops
and tall wall faces. Saturated mid-value palette (warm earth, blue-violet
stone, living greens) so the black, pink and cyan player always stands out.

Usage: python3 maze_tiles.py <out_dir>
Writes maze_tiles.png and maze_tiles.json (frames by name, Aseprite-like).
"""
import json
import math
import os
import random
import sys

from PIL import Image

T = 32  # tile size
WALL_H = 288  # wall face height: towering, about six times the player's height

# Palette: Endesga-32-style ramps. Warm earth, blue-violet stone and living
# greens, saturated but kept in the mid values, so the black, pink and cyan
# player still owns the brightest and most saturated pixels on screen.
DIRT = [(104, 66, 50), (132, 86, 60), (156, 104, 70), (180, 124, 82)]
DIRT_SPECK = (78, 48, 40)
PEBBLE = [(90, 105, 136), (192, 203, 220)]
GRASS = [(38, 92, 66), (62, 137, 72), (99, 199, 77)]

SLAB = [(38, 43, 68), (58, 68, 102), (78, 92, 128), (104, 122, 158)]
SLAB_GAP = (24, 20, 37)
SLAB_MOSS = (62, 137, 72)

# Walls and gates use the Mushroom palette (lospec.com/palette-list/mushroom):
# grey-green dungeon bricks with near-black purple outlines.
M_BLACK = (46, 34, 47)  # #2e222f outlines, deepest shadow
M_DARK = (68, 56, 70)  # #443846 mortar, shadow
M_MAUVE = (102, 89, 100)  # #665964 odd bricks
M_STONE = (87, 96, 105)  # #576069 brick
M_LIGHT = (120, 138, 135)  # #788a87 lit stone
M_PALE = (169, 178, 162)  # #a9b2a2 highlight

# Gates of the central square: iron bars over darkness, wooden top beam.
IRON = [M_DARK, M_STONE, M_LIGHT, M_PALE]
GATE_DARK = M_BLACK
WOOD = [(69, 41, 63), (122, 48, 69), (153, 61, 65), (205, 104, 61)]


def put(img, x, y, color, wrap=True):
    w, h = img.size
    if wrap:
        x %= w
        y %= h
    elif not (0 <= x < w and 0 <= y < h):
        return
    img.putpixel((x, y), color + (255,))


def get(img, x, y):
    w, h = img.size
    return img.getpixel((x % w, y % h))[:3]


def floor_dirt(rng, grass):
    img = Image.new("RGBA", (T, T))
    # Base in 2x2 clusters, so the noise reads as pixel art and not as static.
    for cy in range(0, T, 2):
        for cx in range(0, T, 2):
            tone = DIRT[min(3, max(0, int(rng.gauss(1.5, 0.8))))]
            for dy in range(2):
                for dx in range(2):
                    put(img, cx + dx, cy + dy, tone)
    for _ in range(14):
        put(img, rng.randrange(T), rng.randrange(T), DIRT_SPECK)
    for _ in range(rng.randint(1, 3)):
        x, y = rng.randrange(T), rng.randrange(T)
        put(img, x, y, PEBBLE[1])
        put(img, x + 1, y, PEBBLE[1])
        put(img, x, y + 1, PEBBLE[0])
        put(img, x + 1, y + 1, PEBBLE[0])
    if grass:
        x, y = rng.randrange(4, T - 4), rng.randrange(6, T - 2)
        for i, dx in enumerate((-2, -1, 0, 1, 2)):
            height = (1, 3, 4, 2, 1)[i]
            for k in range(height):
                put(img, x + dx, y - k, GRASS[min(2, k)])
    return img


# The square is a grassy meadow; its forest corner has a dark mossy floor.
FOREST_FLOOR = [(20, 24, 40), (25, 48, 56), (32, 70, 64), (44, 96, 72)]
DEAD_LEAVES = [(62, 39, 49), (115, 62, 57), (184, 111, 80)]


# Square meadow: Brian's Pasto.aseprite (exported to art/pasto.png), a green
# ground with dark grass strokes. The strokes are cut into separate patterns
# and scattered over GRASS_VARIANTS tiles, so no repetition shows.
PASTO_PNG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pasto.png")
GRASS_VARIANTS = 8
# Older flat lime, still the base of the tree tufts' palette. TUFT_COLORS and SMALL_TUFTS are the
# grass tufts drawn around trees (art/pasto_arbol.py): darker blades, a soft
# shadow under them and lit tips.
LIME = (164, 210, 62)
TUFT_COLORS = {
    "s": (142, 188, 56),  # shadow on the ground
    "d": (84, 132, 42),  # deep blades
    "m": (116, 164, 48),  # blades
    "l": (196, 230, 98),  # lit tips
}
# Small grass tufts.
SMALL_TUFTS = [
    [
        "l.....l.",
        "ml...lm.",
        ".mm.mm..",
        "l.mdm..l",
        "mm.dm.mm",
        ".mdddmm.",
        "sdddddds",
        ".ssssss.",
    ],
    [
        "...l...",
        ".l.m.l.",
        ".mlmlm.",
        "l.mdm.l",
        "mmddmmm",
        "sdddddd",
        ".sssss.",
    ],
    [
        "l......l",
        ".m.l..m.",
        ".mm.mmm.",
        "..mdmm..",
        ".mdddm..",
        "sddddds.",
        ".sssss..",
    ],
]


def grass_patterns():
    """Brian's ground colour and his strokes, one pattern per 8-connected group
    of stroke pixels: a list of (dx, dy) offsets from its top-left corner."""
    img = Image.open(PASTO_PNG).convert("RGB")
    px = img.load()
    w, h = img.size
    counts = {}
    for y in range(h):
        for x in range(w):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    ground = max(counts, key=counts.get)
    strokes = {(x, y) for y in range(h) for x in range(w) if px[x, y] != ground}
    stroke_color = px[next(iter(strokes))] if strokes else ground
    patterns = []
    while strokes:
        todo = [strokes.pop()]
        group = []
        while todo:
            x, y = todo.pop()
            group.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (x + dx, y + dy)
                    if q in strokes:
                        strokes.remove(q)
                        todo.append(q)
        x0 = min(p[0] for p in group)
        y0 = min(p[1] for p in group)
        patterns.append(sorted((x - x0, y - y0) for x, y in group))
    patterns.sort()
    return ground, stroke_color, patterns


def grass(rng, ground, stroke, patterns):
    """Brian's ground with his strokes scattered at random, mirrored now and
    then. Strokes stay inside the tile and never touch each other."""
    img = Image.new("RGBA", (T, T), ground + (255,))
    px = img.load()
    big = [p for p in patterns if len(p) > 1]
    dots = [p for p in patterns if len(p) == 1]
    taken = set()
    wanted = [rng.choice(big) for _ in range(rng.randint(2, 3))]
    if dots:
        wanted += [dots[0]] * rng.randint(2, 4)
    for pattern in wanted:
        if rng.random() < 0.5:
            wmax = max(p[0] for p in pattern)
            pattern = [(wmax - x, y) for x, y in pattern]
        pw = max(p[0] for p in pattern) + 1
        ph = max(p[1] for p in pattern) + 1
        for _ in range(30):
            ox, oy = rng.randint(1, T - pw - 1), rng.randint(1, T - ph - 1)
            cells = {(ox + x, oy + y) for x, y in pattern}
            halo = {(x + dx, y + dy) for x, y in cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
            if not halo & taken:
                taken |= halo
                for c in cells:
                    px[c] = stroke + (255,)
                break
    return img


def forest_floor(rng):
    img = Image.new("RGBA", (T, T))
    for cy in range(0, T, 2):
        for cx in range(0, T, 2):
            tone = FOREST_FLOOR[min(3, max(0, int(rng.gauss(1.2, 0.8))))]
            for dy in range(2):
                for dx in range(2):
                    put(img, cx + dx, cy + dy, tone)
    # Fallen leaves and a few moss tufts.
    for _ in range(rng.randint(3, 7)):
        x, y = rng.randrange(T), rng.randrange(T)
        c = rng.choice(DEAD_LEAVES)
        put(img, x, y, c)
        put(img, x + 1, y, c)
        put(img, x + 1, y + 1, FOREST_FLOOR[0])
    for _ in range(rng.randint(2, 5)):
        x, y = rng.randrange(T), rng.randrange(T)
        put(img, x, y, FOREST_FLOOR[3])
        put(img, x, y - 1, (62, 137, 72))
    return img


def paving(rng):
    img = floor_dirt(rng, grass=False)
    # Two rows of slabs, the second one offset half a slab.
    rows = [(0, 15, 0), (16, 15, 8)]
    for top, height, offset in rows:
        x = -offset
        while x < T:
            width = rng.choice((10, 12, 14, 16))
            if rng.random() < 0.85:  # some slabs are missing: dirt shows through
                slab(img, rng, x, top, width - 1, height)
            x += width
    return img


def slab(img, rng, x0, y0, w, h):
    base = rng.choice((1, 1, 2))
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            corner = (x in (x0, x0 + w - 1)) and (y in (y0, y0 + h - 1))
            if corner:
                continue
            tone = base
            if y == y0 or x == x0:
                tone = base + 1  # lit top-left edge
            if y == y0 + h - 1 or x == x0 + w - 1:
                tone = base - 1  # shaded bottom-right edge
            put(img, x, y, SLAB[max(0, min(3, tone))])
    # A crack and a bit of moss in the seams.
    if rng.random() < 0.25:
        cx, cy = x0 + rng.randrange(2, max(3, w - 2)), y0 + 1
        for _ in range(rng.randint(2, 4)):
            put(img, cx, cy, SLAB_GAP)
            cx += rng.choice((-1, 0, 0, 1))
            cy += 1
    for _ in range(rng.randint(0, 3)):
        put(img, x0 + rng.randrange(w), y0 + h - 1, SLAB_MOSS)
    for x in range(x0, x0 + w):
        put(img, x, y0 + h, SLAB_GAP)
    for y in range(y0, y0 + h + 1):
        put(img, x0 + w, y, SLAB_GAP)


TOP_GRID = 4  # wall tops: one seamless texture of 4x4 tiles
FACE_GRID = 3  # wall faces: one seamless strip 3 tiles wide


SLAB_TOP = 16  # wall tops: square slabs, every other row shifted by half


def wall_top(rng):
    """Wall tops seen from above: square stone slabs lit from the top-left,
    one seamless texture of TOP_GRID x TOP_GRID tiles."""
    size = T * TOP_GRID
    img = Image.new("RGBA", (size, size), M_DARK + (255,))
    s = SLAB_TOP
    for row in range(size // s):
        shift = (row % 2) * (s // 2)
        for i in range(size // s):
            x0, y0 = i * s + shift, row * s
            fill = M_STONE if rng.random() < 0.2 else M_LIGHT
            for y in range(y0, y0 + s - 1):
                for x in range(x0, x0 + s - 1):
                    color = fill
                    if y == y0 or x == x0:
                        color = M_PALE if fill == M_LIGHT else M_LIGHT
                    elif y == y0 + s - 2 or x == x0 + s - 2:
                        color = M_STONE if fill == M_LIGHT else M_DARK
                    put(img, x, y, color)
            if rng.random() < 0.25:  # a crack across the slab
                x, y = x0 + rng.randrange(3, s - 4), y0 + 2
                for _ in range(rng.randint(4, 9)):
                    put(img, x, y, M_DARK)
                    x += rng.choice((-1, 0, 1))
                    y += 1
    return img


CORNICE_H = 20  # stone band along the top of every wall face
PLINTH_H = 12  # stone band along the floor
PILLAR_W = 16  # one pillar every FACE_GRID tiles, at the start of the strip
BRICK_W, BRICK_H = 12, 6  # brick pitch, mortar included


def wall_face(rng):
    """Tall front face in the style of a dungeon wall: a cornice on top, a
    plinth below, a pillar every FACE_GRID tiles and recessed bricks between."""
    width_px = T * FACE_GRID
    img = Image.new("RGBA", (width_px, WALL_H), M_DARK + (255,))
    bricks(img, rng, PILLAR_W, width_px)
    pillar(img, rng)
    cornice(img, width_px)
    plinth(img, width_px)
    return img


def bricks(img, rng, x0, x1):
    """Running-bond bricks between the pillars, darker towards the floor."""
    bottom = WALL_H - PLINTH_H
    for row, y0 in enumerate(range(CORNICE_H, bottom, BRICK_H)):
        shift = (row % 2) * (BRICK_W // 2)
        for bx in range(x0 - shift, x1, BRICK_W):
            roll = rng.random()
            fill = M_MAUVE if roll < 0.08 else M_DARK if roll < 0.12 else M_STONE
            # Near the floor more and more bricks sit in shadow.
            depth = (y0 - (bottom - 60)) / 60
            if depth > 0 and rng.random() < depth * 0.7:
                fill = M_DARK
            lit = fill == M_STONE and rng.random() < 0.4
            for y in range(y0, min(y0 + BRICK_H - 1, bottom)):
                for x in range(max(bx, x0), min(bx + BRICK_W - 1, x1)):
                    put(img, x, y, M_LIGHT if lit and y == y0 else fill, wrap=False)
            if rng.random() < 0.04:  # a cracked brick
                x, y = rng.randrange(max(bx, x0), max(max(bx, x0) + 1, min(bx + BRICK_W - 1, x1))), y0
                for _ in range(BRICK_H - 1):
                    put(img, x, y, M_BLACK, wrap=False)
                    x += rng.choice((0, 1))
                    y += 1
    # Shadows cast into the recess by the cornice and the pillar.
    for x in range(x0, x1):
        put(img, x, CORNICE_H, M_BLACK, wrap=False)
        put(img, x, CORNICE_H + 1, M_DARK, wrap=False)
    for y in range(CORNICE_H, bottom):
        put(img, x0, y, M_BLACK, wrap=False)
        put(img, x0 + 1, y, M_DARK, wrap=False)


def pillar(img, rng):
    """A pillar of stacked blocks standing in front of the bricks."""
    w = PILLAR_W
    bottom = WALL_H - PLINTH_H
    for row, y0 in enumerate(range(CORNICE_H, bottom, 8)):
        split = rng.random() < 0.5  # one wide block or two half blocks
        for y in range(y0, min(y0 + 8, bottom)):
            for x in range(w):
                if y == y0 + 7 or (split and x == w // 2 and row % 2 == 0):
                    color = M_DARK
                elif x == 1 or y == y0:
                    color = M_LIGHT
                elif x == w - 2:
                    color = M_DARK
                else:
                    color = M_STONE
                if x in (0, w - 1):
                    color = M_BLACK
                put(img, x, y, color, wrap=False)
    # Capital under the cornice
    for y in range(CORNICE_H, CORNICE_H + 6):
        for x in range(w):
            color = M_PALE if y == CORNICE_H else M_STONE if y == CORNICE_H + 4 else M_LIGHT
            if y == CORNICE_H + 5 or x in (0, w - 1):
                color = M_BLACK
            put(img, x, y, color, wrap=False)


def cornice(img, width_px):
    """Long stone blocks along the top, a recessed plaque over each pillar gap."""
    for y in range(CORNICE_H):
        for x in range(width_px):
            if y == 0 or y == CORNICE_H - 1:
                color = M_BLACK
            elif y <= 2:
                color = M_PALE
            elif y >= CORNICE_H - 3:
                color = M_STONE if y == CORNICE_H - 3 else M_DARK
            else:
                color = M_LIGHT
            put(img, x, y, color, wrap=False)
    for x in range(0, width_px, 24):  # joints between the blocks
        for y in range(1, CORNICE_H - 3):
            put(img, x, y, M_DARK, wrap=False)
            if y > 2:
                put(img, x + 1, y, M_PALE, wrap=False)
    # Recessed plaque centred over the bricks
    px0, px1 = PILLAR_W + 22, width_px - 22
    for y in range(6, 14):
        for x in range(px0, px1):
            edge_y = y in (6, 13)
            edge_x = x in (px0, px1 - 1)
            if edge_y and edge_x:
                continue  # rounded corners
            color = M_DARK if y == 6 or x == px0 else M_PALE if y == 13 or x == px1 - 1 else M_STONE
            put(img, x, y, color, wrap=False)


def plinth(img, width_px):
    """Stone band where the wall meets the floor, with contact shadow."""
    top = WALL_H - PLINTH_H
    for y in range(top, WALL_H):
        for x in range(width_px):
            k = y - top
            if k == 0:
                color = M_BLACK
            elif k == 1:
                color = M_PALE
            elif k < PLINTH_H - 4:
                color = M_LIGHT
            elif k < PLINTH_H - 2:
                color = M_STONE
            else:
                color = M_DARK if k == PLINTH_H - 2 else M_BLACK
            put(img, x, y, color, wrap=False)
    for x in range(PILLAR_W, width_px, 24):  # joints
        for y in range(top + 1, WALL_H - 2):
            put(img, x, y, M_DARK, wrap=False)
    # The pillar's base sticks out a bit further.
    for y in range(top, WALL_H - 1):
        put(img, 0, y, M_BLACK, wrap=False)
        put(img, PILLAR_W - 1, y, M_BLACK, wrap=False)


def gate_face():
    """Iron portcullis, FACE_GRID tiles wide: vertical bars every 8 px, two
    cross bars and rivets, with darkness showing between the bars."""
    width_px = T * FACE_GRID
    img = Image.new("RGBA", (width_px, WALL_H), GATE_DARK + (255,))
    for x in range(width_px):
        u = x % 8
        if u in (3, 4, 5):  # a bar: lit left, dark right
            tone = {3: 2, 4: 1, 5: 0}[u]
            for y in range(WALL_H):
                put(img, x, y, IRON[tone], wrap=False)
    for y0 in range(14, WALL_H - 20, 40):  # cross bars, every 40 px down the gate
        for y in range(y0, y0 + 5):
            tone = 3 if y == y0 else 0 if y == y0 + 4 else 1
            for x in range(width_px):
                put(img, x, y, IRON[tone], wrap=False)
        for x in range(4, width_px, 8):  # rivets where bars cross
            put(img, x, y0 + 2, IRON[3], wrap=False)
    # Pointed bar tips at the bottom
    for x in range(width_px):
        if x % 8 in (3, 4, 5):
            for y in range(WALL_H - 4, WALL_H):
                if x % 8 != 4 and y > WALL_H - 3:
                    put(img, x, y, GATE_DARK, wrap=False)
    return img


def gate_top(rng):
    """Top of a closed gate: wooden planks with an iron band."""
    img = Image.new("RGBA", (T, T))
    for y in range(T):
        plank = y // 8
        for x in range(T):
            tone = 2 if y % 8 == 0 else 0 if y % 8 == 7 else 1
            if rng.random() < 0.08:
                tone = max(0, tone - 1)
            put(img, x, y, WOOD[tone if plank % 2 else min(3, tone + 1)])
    for x in range(T):  # iron band
        for y in (14, 15, 16):
            put(img, x, y, IRON[1 if y == 16 else 2])
    return img


def build(out_dir):
    rng = random.Random(7)
    tiles = {}
    for i in range(4):
        tiles[f"floor_{i}"] = floor_dirt(rng, grass=(i == 3))
    for i in range(4):
        tiles[f"paving_{i}"] = paving(rng)
    top = wall_top(rng)
    for j in range(TOP_GRID):
        for i in range(TOP_GRID):
            tiles[f"wall_top_{j * TOP_GRID + i}"] = top.crop((i * T, j * T, (i + 1) * T, (j + 1) * T))
    face = wall_face(rng)
    for i in range(FACE_GRID):
        tiles[f"wall_face_{i}"] = face.crop((i * T, 0, (i + 1) * T, WALL_H))
    tiles["gate_top_0"] = gate_top(rng)
    # Own generator, so adding square tiles never changes the maze tiles.
    square_rng = random.Random(11)
    for i in range(4):
        tiles[f"forest_{i}"] = forest_floor(square_rng)
    # Own generator too, so the forest floor stays as it was.
    grass_rng = random.Random(23)
    ground, stroke, patterns = grass_patterns()
    for i in range(GRASS_VARIANTS):
        tiles[f"grass_{i}"] = grass(grass_rng, ground, stroke, patterns)
    gate = gate_face()
    for i in range(FACE_GRID):
        tiles[f"gate_face_{i}"] = gate.crop((i * T, 0, (i + 1) * T, WALL_H))

    # Pack: small tiles in a row on top, faces in a row below.
    # Pack: small tiles in rows of 8 on top, faces in a row below.
    per_row = 8
    small = [k for k in tiles if "_face_" not in k]
    faces = [k for k in tiles if "_face_" in k]
    small_rows = -(-len(small) // per_row)
    sheet = Image.new("RGBA", (per_row * T, small_rows * T + WALL_H))
    frames = {}
    for i, name in enumerate(small):
        x, y = (i % per_row) * T, (i // per_row) * T
        sheet.paste(tiles[name], (x, y))
        frames[name] = {"x": x, "y": y, "w": T, "h": T}
    for i, name in enumerate(faces):
        sheet.paste(tiles[name], (i * T, small_rows * T))
        frames[name] = {"x": i * T, "y": small_rows * T, "w": T, "h": WALL_H}

    sheet.save(f"{out_dir}/maze_tiles.png")
    with open(f"{out_dir}/maze_tiles.json", "w") as f:
        json.dump(
            {
                "tileSize": T,
                "wallHeight": WALL_H,
                "wallTopGrid": TOP_GRID,
                "wallFaceGrid": FACE_GRID,
                "frames": frames,
            },
            f,
            indent=2,
        )


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".")
