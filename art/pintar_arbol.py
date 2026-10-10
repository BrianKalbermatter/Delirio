"""Colours a hand-drawn tree (line art) in the meadow style, keeping its design.

The crown is drawn as black contours of leaf clumps; its inside is left empty.
This fills every enclosed area with greens lit from the top left, puts a
shadow under each contour (so each clump reads as hanging over the one
below), adds a subtle, regular leaf texture, and turns the black contours
into dark greens. The trunk keeps its lines: stray pixels are cleaned, and it
gets soft shading (lit left, dark right, darker under the crown).

Usage: python3 pintar_arbol.py <in.png> <out.png>
"""
import sys
from collections import Counter, deque

from PIL import Image

# Colours of the line art (DawnBringer-32, as drawn).
INK = (0, 0, 0)  # crown contours
BARK_LINE = (67, 45, 19)  # trunk lines and grooves
BARK_FILL = (217, 160, 102)
BARK_CUT = (102, 57, 49)  # where branches go into the crown
HOLLOW = [(50, 60, 57), (69, 40, 60)]  # the dark gap under the crown
GREENS_DRAWN = [(106, 190, 48), (75, 105, 47)]

# Crown palette, dark to light, plus contours.
SILHOUETTE = (18, 36, 24)
CONTOUR = (30, 60, 36)
LEAF = [(34, 72, 40), (48, 100, 46), (70, 134, 52), (102, 168, 60), (146, 202, 82), (184, 228, 108)]
HOLLOW_SHADE = (24, 44, 30)
# Trunk palette.
BARK_LINE_NEW = (58, 38, 24)
BARK = [(150, 100, 62), (184, 132, 82), (212, 158, 102), (234, 190, 134)]  # shade .. lit

# Leaves: one small leaf per LEAF_CELL x LEAF_CELL cell, nudged by a hash so
# they never line up like wallpaper. Offsets of light for each leaf pixel.
LEAF_CELL = 6
LEAF_MARK = {(0, 0): 1, (1, 0): 1, (-1, 1): 1, (0, 1): 0, (1, 1): -1, (2, 1): -1, (0, 2): -1}
SHADOW_REACH = 2  # px under a contour that fall in the shadow of the clump above
REACH = 80  # px looked at, at most, to find the edges of a clump
SMOOTH = 3  # px radius that evens out the light, so it never breaks in blocks


def hash2(x, y):
    h = (x * 73856093) ^ (y * 19349663)
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return h ^ (h >> 16)


def leaf_marks(crown):
    """Light offset per crown pixel from the scattered leaves."""
    marks = {}
    xs = [x for x, _ in crown]
    ys = [y for _, y in crown]
    for gy in range(min(ys) // LEAF_CELL, max(ys) // LEAF_CELL + 1):
        for gx in range(min(xs) // LEAF_CELL, max(xs) // LEAF_CELL + 1):
            h = hash2(gx, gy)
            lx = gx * LEAF_CELL + h % (LEAF_CELL - 2)
            ly = gy * LEAF_CELL + (h >> 8) % (LEAF_CELL - 2)
            for (dx, dy), v in LEAF_MARK.items():
                if (lx + dx, ly + dy) in crown:
                    marks[(lx + dx, ly + dy)] = v
    return marks


def neighbours4(x, y):
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def exterior(drawn, w, h):
    """Empty pixels reachable from the border, with every drawn line made 1 px
    thicker so small gaps in the contours do not let the outside leak in."""
    thick = set()
    for x, y in drawn:
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            thick.add((x + dx, y + dy))
    outside = set()
    queue = deque((x, y) for x in range(w) for y in (0, h - 1))
    queue.extend((x, y) for y in range(h) for x in (0, w - 1))
    while queue:
        p = queue.popleft()
        x, y = p
        if p in outside or p in thick or not (0 <= x < w and 0 <= y < h):
            continue
        outside.add(p)
        queue.extend(neighbours4(x, y))
    return outside


def reach(x, y, dx, dy, crown):
    """Steps from (x, y) towards (dx, dy) before leaving the clump."""
    k = 0
    while k < REACH and (x + dx * (k + 1), y + dy * (k + 1)) in crown:
        k += 1
    return k


def clump_light(crown):
    """Volume of every clump, with the sun right above: lit at the clump's
    top, in shade at its bottom. Evened out over SMOOTH px."""
    raw = {}
    for x, y in crown:
        up, down = reach(x, y, 0, -1, crown), reach(x, y, 0, 1, crown)
        top = 1 - (up + 0.5) / (up + down + 1)  # 1 at the clump's top edge, 0 at its bottom
        raw[(x, y)] = 3.4 * top**1.3
    # Box blur inside the crown: a running sum per row, then per column.
    rows = {}
    for (x, y), v in raw.items():
        total = count = 0
        for dx in range(-SMOOTH, SMOOTH + 1):
            n = raw.get((x + dx, y))
            if n is not None:
                total += n
                count += 1
        rows[(x, y)] = total / count
    light = {}
    for (x, y) in raw:
        total = count = 0
        for dy in range(-SMOOTH, SMOOTH + 1):
            n = rows.get((x, y + dy))
            if n is not None:
                total += n
                count += 1
        light[(x, y)] = total / count
    return light


def paint(src):
    img = src.convert("RGBA")
    w, h = img.size
    px = img.load()
    color = {(x, y): px[x, y][:3] for y in range(h) for x in range(w) if px[x, y][3]}
    outside = exterior(color, w, h)

    # Crown: empty pixels enclosed by contours, plus the greens already drawn.
    crown = {(x, y) for y in range(h) for x in range(w) if (x, y) not in color and (x, y) not in outside}
    for _ in range(2):  # drop the rim the thickening added outside the contour
        crown = {p for p in crown if not any(n in outside for n in neighbours4(*p))}
    crown |= {p for p, c in color.items() if c in GREENS_DRAWN}
    ink = {p for p, c in color.items() if c == INK}

    ys = [y for _, y in crown]
    cy = (min(ys) + max(ys)) / 2
    ry = (max(ys) - min(ys)) / 2

    out = Image.new("RGBA", (w, h))
    o = out.load()
    marks = leaf_marks(crown)
    volume = clump_light(crown)
    for (x, y) in crown:
        ny = (y - cy) / ry
        # Sun from above: each clump has its own volume, and the whole crown
        # gets darker towards its bottom, deeper inside the tree.
        level = 1.0 + volume[(x, y)] - 0.8 * ny
        # In the shadow of the clump just above, which hangs over this one.
        for k in range(1, SHADOW_REACH + 1):
            if (x, y - k) in ink:
                level -= (SHADOW_REACH + 1 - k) * 0.7
                break
        # Sunlit rim under the crown's top edge.
        if (x, y - 1) in ink and (x, y - 2) in outside:
            level += 1.0
        level += marks.get((x, y), 0) * 0.7
        o[x, y] = LEAF[max(0, min(len(LEAF) - 1, int(level)))] + (255,)

    # Contours: the silhouette darkest, the inner ones a deep green.
    for p in ink:
        edge = any(n in outside for n in neighbours4(*p))
        o[p] = (SILHOUETTE if edge else CONTOUR) + (255,)

    # The dark gap under the crown, between the branches.
    for p, c in color.items():
        if c in HOLLOW:
            o[p] = HOLLOW_SHADE + (255,)

    paint_trunk(color, o, crown)
    return out


def paint_trunk(color, o, crown):
    trunk_colors = (BARK_LINE, BARK_FILL, BARK_CUT)
    trunk = {p: c for p, c in color.items() if c in trunk_colors}
    # Clean stray pixels: a pixel unlike all but one of its 8 neighbours takes
    # their most common colour.
    clean = {}
    for (x, y), c in trunk.items():
        around = [trunk.get((x + dx, y + dy)) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
        around = [a for a in around if a is not None]
        same = sum(1 for a in around if a == c)
        clean[(x, y)] = Counter(around).most_common(1)[0][0] if around and same <= 1 else c
    # Lowest crown pixel of each column: the trunk is darker right under it.
    crown_bottom = {}
    for x, y in crown:
        crown_bottom[x] = max(crown_bottom.get(x, -1), y)
    # Round shading: how far across the whole trunk a pixel is, from its
    # left edge to its right edge, grooves included, so rows do not streak.
    for (x, y), c in clean.items():
        if c != BARK_FILL:
            continue
        left = right = 0
        while (x - left - 1, y) in clean:
            left += 1
        while (x + right + 1, y) in clean:
            right += 1
        u = (left + 0.5) / (left + right + 1)
        tone = 3 if u < 0.22 else 2 if u < 0.6 else 1 if u < 0.85 else 0
        if 0 <= y - crown_bottom.get(x, -100) <= 14:  # under the crown
            tone = max(0, tone - 1)
        o[x, y] = BARK[tone] + (255,)
    for p, c in clean.items():
        if c == BARK_LINE:
            o[p] = BARK_LINE_NEW + (255,)
        elif c == BARK_CUT:
            o[p] = c + (255,)


if __name__ == "__main__":
    paint(Image.open(sys.argv[1])).save(sys.argv[2])
