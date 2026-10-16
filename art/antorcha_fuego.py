"""The torch's fire, animated: a flame that sways and flickers, with a few
sparks rising from it. The game draws it on the flame of Brian's torch
(sprites/Objetos/Antorcha.aseprite) wherever the torch is in the hand.

Output: client/public/sprites/antorcha_fuego.png/.json, one tag "fuego". The
flame's base, the point that goes on the torch's flame, is at (W/2, BASE_Y).

Run from the repo root: python3 art/antorcha_fuego.py
"""
import math
import random
import sys

from PIL import Image

sys.path.insert(0, "art")
import armas  # noqa: E402

W, H = 14, 22
BASE_Y = 17  # flame base row; below it only the glowing bottom of the flame
FRAMES = 8
FRAME_MS = 80

# The torch's own colors, outside in, plus a hot core.
OUTLINE = (101, 20, 20)
OUTER = (172, 50, 50)
MID = (217, 87, 99)
ORANGE = (223, 113, 38)
YELLOW = (176, 150, 42)
CORE = (242, 214, 120)
SPARK = [(223, 113, 38), (217, 87, 99), (172, 50, 50)]


def flame(i):
    img = Image.new("RGBA", (W, H))
    phase = 2 * math.pi * i / FRAMES
    cx = W / 2
    height = 11 + 1.5 * math.sin(phase * 2) + 1.0 * math.sin(phase + 1.3)
    width = 4.2 + 0.5 * math.sin(phase * 2 + 0.7)

    def inside(x, y, shrink):
        # Teardrop: round at the base, a tip that sways from side to side.
        up = BASE_Y - y  # 0 at the base, height at the tip
        if up < -3 + shrink or up > height - shrink * 1.6:
            return False
        t = min(1.0, max(0.0, up) / height)
        sway = (1.6 * math.sin(phase + t * 3.0) + 0.7 * math.sin(phase * 3 + t * 6)) * t
        if up < 0:
            half = width * math.sqrt(max(0.0, 1 - (up / 3) ** 2))
        else:
            half = width * (1 - t) ** 0.8 * (1 + 0.15 * math.sin(phase * 2 + t * 9))
        return half - shrink >= 0.5 and abs(x + 0.5 - (cx + sway)) <= half - shrink

    for y in range(H):
        for x in range(W):
            if inside(x, y, 2.4):
                c = CORE
            elif inside(x, y, 1.6):
                c = YELLOW
            elif inside(x, y, 0.8):
                c = ORANGE
            elif inside(x, y, 0.1):
                c = MID
            elif inside(x, y, -0.6):
                c = OUTER
            elif inside(x, y, -1.2):
                c = OUTLINE
            else:
                continue
            img.putpixel((x, y), c + (255,))

    # Sparks: each rises over the loop from the tip, drifting and fading.
    rng = random.Random(7)
    for k in range(3):
        start = rng.random()
        drift = rng.uniform(-2, 2)
        life = (i / FRAMES + start) % 1.0
        y = round(BASE_Y - 7 - life * 12)
        x = round(cx + drift * life + 1.0 * math.sin(phase + k))
        if 0 <= y < H and 0 <= x < W and not img.getpixel((x, y))[3]:
            img.putpixel((x, y), SPARK[min(2, int(life * 3))] + (255,))
    return img


def main():
    frames = [flame(i) for i in range(FRAMES)]
    armas.write_sheet("client/public/sprites/antorcha_fuego", frames, W, H, FRAMES, [FRAME_MS] * FRAMES,
                      [("fuego", 0, FRAMES - 1)], "antorcha_fuego")
    print(f"antorcha_fuego: {FRAMES} frames of {W}x{H}")


if __name__ == "__main__":
    main()
