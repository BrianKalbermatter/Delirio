"""The big tree's shadow on the ground, with the sun right above: a flat oval
under the crown, a darker core near the trunk and a dithered edge, so it is
soft but still pixel art. Kept faint so the grass shows through.

Usage: python3 sombra_arbol.py <out_dir>
Writes sombra_arbol.png; the game draws it centred under the crown.
"""
import sys

from PIL import Image

HALF_W, HALF_H = 112, 30  # the oval's half width and half height, px
SHADE = (20, 28, 18)  # near black: the grass under it just gets darker
CORE_ALPHA = 64  # near the trunk, where the crown is thickest
ALPHA = 42
CORE = 0.55  # the core's share of the oval
EDGE = 0.82  # past this, every other pixel: the dithered rim


def build(out_dir):
    img = Image.new("RGBA", (2 * HALF_W + 1, 2 * HALF_H + 1))
    for y in range(img.height):
        for x in range(img.width):
            r = (((x - HALF_W) / HALF_W) ** 2 + ((y - HALF_H) / HALF_H) ** 2) ** 0.5
            if r > 1 or (r > EDGE and (x + y) % 2):
                continue
            img.putpixel((x, y), SHADE + (CORE_ALPHA if r < CORE else ALPHA,))
    img.save(f"{out_dir}/sombra_arbol.png")


if __name__ == "__main__":
    build(sys.argv[1])
