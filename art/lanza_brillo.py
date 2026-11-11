"""The flash of the spear once it is charged: `destello`, a star that bursts out of
its point with a ring, once, and `brillo`, the small twinkle that stays on it until
it is thrown. The game draws them on the point (sprites/lanza_punta.json).

Usage: python3 art/lanza_brillo.py <client/public>   (bash art/armas_build.sh runs it)
Writes sprites/lanza_brillo.{png,json}.
"""
import math
import sys

from PIL import Image

import armas

SIZE = 56
C = SIZE // 2
WHITE, CREAM, GOLD, AMBER = (255, 255, 255), (255, 240, 190), (251, 185, 84), (214, 120, 48)
# Burst: (long ray, diagonal ray, core radius, ring radius); ring 0 is no ring
BURST = [(6, 0, 2, 0), (15, 5, 4, 0), (23, 9, 5, 7), (26, 10, 4, 12), (20, 7, 3, 17), (13, 4, 2, 21), (8, 2, 1, 24)]
BURST_MS = [30, 40, 50, 50, 60, 60, 70]
TWINKLE = [(4, 0), (6, 2), (9, 3), (6, 2), (4, 0), (3, 0), (2, 0), (3, 0)]
TWINKLE_MS = [70] * 8


def dot(img, x, y, colour):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        img.putpixel((x, y), colour + (255,))


def ray(img, dx, dy, length):
    """A ray from the middle, thin at its end: white, cream, gold, amber."""
    for r in range(length + 1):
        share = r / max(1, length)
        colour = WHITE if share < 0.35 else CREAM if share < 0.6 else GOLD if share < 0.85 else AMBER
        dot(img, C + dx * r, C + dy * r, colour)
        if share < 0.3:  # thick near the core
            dot(img, C + dx * r + dy, C + dy * r + dx, CREAM)
            dot(img, C + dx * r - dy, C + dy * r - dx, CREAM)


def star(long, diagonal, core=0):
    img = Image.new("RGBA", (SIZE, SIZE))
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ray(img, dx, dy, long)
    for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        ray(img, dx, dy, diagonal)
    for y in range(-core, core + 1):
        for x in range(-core, core + 1):
            if x * x + y * y <= core * core:
                dot(img, C + x, C + y, WHITE)
    return img


def ring(img, radius):
    steps = int(radius * 7)
    for k in range(steps):
        a = 2 * math.pi * k / steps
        if (k // 2) % 3 != 2:  # broken, so it thins out
            dot(img, round(C + radius * math.cos(a)), round(C + radius * math.sin(a)), GOLD if radius < 15 else AMBER)


def main(public):
    cells = []
    for long, diagonal, core, radius in BURST:
        img = star(long, diagonal, core)
        if radius:
            ring(img, radius)
        cells.append(img)
    tags = [("destello", 0, len(cells) - 1)]
    cells += [star(long, diagonal, 1) for long, diagonal in TWINKLE]
    tags.append(("brillo", len(BURST), len(cells) - 1))
    armas.write_packed_sheet(f"{public}/sprites/lanza_brillo", cells, BURST_MS + TWINKLE_MS, tags, "lanza_brillo")


if __name__ == "__main__":
    main(sys.argv[1])
