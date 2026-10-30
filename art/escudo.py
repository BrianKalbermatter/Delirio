"""A round shield for the player: a wooden face painted red, a bronze rim and
a bronze boss in the middle, lit from the top left. Drawn pixel by pixel at
the size of Brian's weapon drawings (armas.WEAPONS scales it down when held),
then saved as an Aseprite file next to his weapons, where armas_build.sh
exports it like the others.

    python3 art/escudo.py <out.png>
    Aseprite -b <out.png> --save-as Escudo_Redondo.aseprite

The hand holds it by the middle (the grip in armas.WEAPONS is the centre).
"""
import math
import sys

from PIL import Image

SIZE = 48
CENTER = (23.5, 23.5)
RADIUS = 21.0

OUTLINE = (46, 34, 47, 255)  # #2e222f, like the rest of the art
BRONZE_DARK = (122, 72, 46, 255)
BRONZE = (190, 128, 64, 255)
BRONZE_LIGHT = (240, 190, 108, 255)
RED_DARK = (110, 32, 44, 255)
RED = (160, 46, 52, 255)
RED_LIGHT = (198, 74, 66, 255)
PLANK_LINE = (92, 26, 38, 255)
BAND = (222, 196, 140, 255)  # a pale painted ring
BAND_DARK = (176, 148, 100, 255)


def draw() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    cx, cy = CENTER
    for y in range(SIZE):
        for x in range(SIZE):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy) / RADIUS
            if r > 1:
                continue
            light = -(dx + dy) / (RADIUS * math.sqrt(2))  # +1 top left, -1 bottom right
            if r > 0.86:  # the bronze rim
                color = BRONZE_LIGHT if light > 0.45 else BRONZE if light > -0.35 else BRONZE_DARK
            elif 0.6 < r <= 0.68:  # the painted ring
                color = BAND if light > -0.2 else BAND_DARK
            elif r <= 0.22:  # the boss
                color = BRONZE_LIGHT if light > 0.3 and r < 0.16 else BRONZE if light > -0.4 else BRONZE_DARK
            else:  # painted wood
                color = RED_LIGHT if light > 0.5 else RED if light > -0.45 else RED_DARK
                if r > 0.24 and int(x - cx + 100) % 7 == 0:
                    color = PLANK_LINE  # the planks under the paint
            px[x, y] = color
    # A glint on the rim and on the boss.
    px[int(cx - RADIUS * 0.55), int(cy - RADIUS * 0.62)] = (255, 244, 210, 255)
    px[int(cx - 2), int(cy - 2)] = (255, 244, 210, 255)
    return outline(img)


def outline(img: Image.Image) -> Image.Image:
    px = img.load()
    out = img.copy()
    opx = out.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if px[x, y][3]:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < SIZE and 0 <= ny < SIZE and px[nx, ny][3]:
                    opx[x, y] = OUTLINE
                    break
    # The boss stands out: a dark ring around it.
    cx, cy = CENTER
    for y in range(SIZE):
        for x in range(SIZE):
            r = math.hypot(x - cx, y - cy) / RADIUS
            if 0.22 < r <= 0.27:
                opx[x, y] = OUTLINE
    return out


if __name__ == "__main__":
    draw().save(sys.argv[1])
    print(f"Wrote {sys.argv[1]}")
