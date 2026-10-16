"""Paints the two unfinished trunks of Brian's Arboles/Arbol1.aseprite.

Usage: python3 troncos_arbol1.py <in.png> <out.png>
<in.png> is Arbol1.aseprite exported flat (540x540).

Matches his reference tree: a muted red-brown trunk, dark under the crown,
lighter tan roots at the base, plain blocky shading (no fine texture).
- Big trunk (left): his line art is kept; the inside is filled. Small gaps in
  the lines are closed first so the fill does not leak.
- Small trunk (under the small crown, right): his sketch is redrawn as a
  small pixel trunk with roots, behind the crown's bottom edge.
"""
import sys
from collections import deque

from PIL import Image

LINE = (67, 45, 19)          # Brian's line colour, kept as the outline
KNOT = [(46, 27, 26), (62, 36, 38)]
BARK = [(88, 50, 48), (114, 68, 60), (140, 88, 70)]   # dark, mid, light
ROOT = [(168, 116, 86), (196, 148, 106)]              # tan, lit tan

BIG_BOX = (100, 185, 280, 350)     # x0, y0, x1, y1 of the big trunk
KNOT_BOX = (175, 255, 193, 282)    # the hole in the big trunk
CROWN_SHADE_Y = 222                # above: shaded by the crown
ROOT_Y = 286                       # below: roots, lit tan

# Small trunk, origin (340, 230). o line, d dark, m mid, l light,
# r root, h lit root. Rows 230-231 only fill where the crown leaves room.
SMALL_ORIGIN = (340, 230)
SMALL = [
    "........oddddo........",
    "........odddmo........",
    "........ommmdo........",
    "........olmmdo........",
    "........olmmdo........",
    ".......olmmmddo.......",
    ".......olrmmmdo.......",
    "......olrrmmmddo......",
    ".....olhrrmrmmddo.....",
    "....ohhrrorrmrrddo....",
    "...ohhrro..orrrrdo....",
    "..ooooo....ohhrrdo....",
    "...........oooooo.....",
]
SMALL_COLORS = {"o": LINE, "d": BARK[0], "m": BARK[1], "l": BARK[2],
                "r": ROOT[0], "h": ROOT[1]}
CROWN_EDGE = (75, 105, 47)         # the small crown's bottom line


def hash2(x, y):
    h = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return h ^ (h >> 16)


def big_trunk(px):
    x0, y0, x1, y1 = BIG_BOX
    line = {(x, y) for y in range(y0, y1) for x in range(x0, x1)
            if px[x, y][3] and px[x, y][:3] == LINE}
    # Close small gaps: grow the lines by 2 px, flood the outside from the
    # box border, then give the 2 px back to the outside.
    grown = {(x + dx, y + dy) for x, y in line for dx in range(-2, 3) for dy in range(-2, 3)}
    outside = set()
    todo = deque((x, y) for x in range(x0, x1) for y in (y0, y1 - 1))
    todo.extend((x, y) for y in range(y0, y1) for x in (x0, x1 - 1))
    while todo:
        p = todo.popleft()
        if p in outside or p in grown or not (x0 <= p[0] < x1 and y0 <= p[1] < y1):
            continue
        outside.add(p)
        todo.extend(((p[0] + 1, p[1]), (p[0] - 1, p[1]), (p[0], p[1] + 1), (p[0], p[1] - 1)))
    for _ in range(2):
        outside |= {(x + dx, y + dy) for x, y in outside
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))} - line
    inside = {(x, y) for y in range(y0, y1) for x in range(x0, x1)
              if (x, y) not in outside and (x, y) not in line}

    def run(x, y, dx, dy, limit=6):
        """Pixels from (x, y) to the edge of the fill along (dx, dy)."""
        for k in range(1, limit + 1):
            if (x + dx * k, y + dy * k) not in inside:
                return k
        return limit + 1

    kx0, ky0, kx1, ky1 = KNOT_BOX
    for x, y in inside:
        if kx0 <= x < kx1 and ky0 <= y < ky1 and knot_inside(px, x, y):
            px[x, y] = KNOT[0 if run(x, y, 0, -1, 3) > 2 else 1] + (255,)
            continue
        # Height decides the base tone: crown shade, bark, then roots. The
        # borders between them are ragged, in 3 px columns.
        shade_y = CROWN_SHADE_Y + hash2(x // 3, 1) % 11 - 5
        root_y = ROOT_Y + hash2(x // 3, 2) % 11 - 5
        if y < shade_y:
            k = 0
        elif y < root_y:
            k = 1
        elif y < root_y + 6:
            k = 2
        else:
            k = 3
        # Sun from the top left: lit tops and left sides, dark right sides.
        if run(x, y, 0, -1) <= 2:
            k += 1
        elif run(x, y, -1, 0) <= 3 and y >= CROWN_SHADE_Y:
            k += 1
        if run(x, y, 1, 0) <= 3:
            k -= 1
        # Chunky 3x3 blotches, like the reference, nothing finer.
        n = hash2(x // 3, y // 3) % 100
        if n < 6:
            k -= 1
        elif n > 95:
            k += 1
        # A few bark grooves running down the trunk.
        if ROOT_Y > y >= CROWN_SHADE_Y and hash2(x, 7) % 13 == 0 and hash2(x, y // 8) % 2 == 0:
            k -= 1
        ramp = BARK + ROOT
        px[x, y] = ramp[max(0, min(len(ramp) - 1, k))] + (255,)


def knot_inside(px, x, y):
    """True inside the knot's oval: lines on both sides on this row."""
    kx0, _, kx1, _ = KNOT_BOX
    left = any(px[i, y][3] and px[i, y][:3] == LINE for i in range(kx0, x))
    right = any(px[i, y][3] and px[i, y][:3] == LINE for i in range(x + 1, kx1))
    return left and right


def small_trunk(px):
    ox, oy = SMALL_ORIGIN
    # Clear the sketch below the crown's bottom line.
    for y in range(oy, oy + len(SMALL) + 1):
        for x in range(ox - 2, ox + len(SMALL[0]) + 1):
            if px[x, y][3] and px[x, y][:3] != CROWN_EDGE:
                px[x, y] = (0, 0, 0, 0)
    for j, row in enumerate(SMALL):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            x, y = ox + i, oy + j
            if j < 2 and px[x, y][3]:
                continue          # the crown stays in front
            px[x, y] = SMALL_COLORS[ch] + (255,)


def main():
    img = Image.open(sys.argv[1]).convert("RGBA")
    px = img.load()
    big_trunk(px)
    small_trunk(px)
    img.save(sys.argv[2])


if __name__ == "__main__":
    main()
