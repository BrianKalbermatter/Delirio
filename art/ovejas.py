"""The sheep of art/ovejas_original.png, animated. The picture is pixel art blown
up on a meadow, with one pose, grazing, and the feet lost in the grass: this
takes one sheep back to its real pixels, cuts its body and head out by hand and
draws legs that walk.

Usage: python3 art/ovejas.py   (needs numpy)
Writes client/public/sprites/oveja.{png,json}, facing right (the game mirrors
it), tags `pasta` (head down), `camina` and `corre` (head up), with its shadow.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "ovejas_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "oveja")

PIXEL = 736 / 130  # screen px per real pixel
ORIGIN = (187, 262)  # where the sheep's first real pixel starts in the picture
SIZE = (35, 28)  # real pixels cut
# The sheep's outline, by hand, in real pixels: body and head, no legs.
OUTLINE = [
    (8, 1), (14, 1), (15, 2), (19, 2), (20, 3), (22, 3), (23, 5), (25, 6), (26, 7), (27, 9), (28, 10), (29, 12),
    (30, 14), (31, 16), (34, 17), (34, 19), (32, 20), (32, 25), (30, 26), (27, 25), (25, 23), (24, 20), (16, 20),
    (10, 19), (4, 19), (3, 13), (1, 10), (1, 6), (2, 5), (4, 3), (6, 2),
]
HEAD = (24, 17, 35, 27)  # left, top, right, bottom
HEAD_UP = (1, -6)  # how it moves when the sheep looks up
FRAME = (38, 30)  # px of each frame
BODY_AT = (1, 1)  # where the cut goes in the frame
FOOT = 27  # row the hooves stand on
LINE = (20, 16, 22, 255)
LEG = (92, 66, 92, 255)
FAR_LEG = (62, 46, 66, 255)
SHADOW = (0, 0, 0, 60)
HIP = 18  # row the legs start on
KNEE = 22  # row of the joint, on a leg standing straight
# Each leg: column, near or far, front or hind, and the step of the cycle it
# starts on: one foot after the other, like a walk.
LEGS = [(7, False, False, 4), (5, True, False, 0), (22, False, True, 6), (20, True, True, 2)]
# Per step of the cycle: where the hoof is (forward), how high it lifts and how
# far the joint sticks out. On the ground the leg is straight and sweeps back;
# in the air it bends and swings forward.
STRIDE = [(2, 0, 0), (1, 0, 0), (0, 0, 0), (-1, 0, 0), (-2, 0, 0), (-2, 2, 2), (-1, 4, 3), (1, 3, 2)]


def real_pixels():
    a = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float)
    out = np.zeros((SIZE[1], SIZE[0], 3), np.uint8)
    for j in range(SIZE[1]):
        for i in range(SIZE[0]):
            x, y = ORIGIN[0] + i * PIXEL, ORIGIN[1] + j * PIXEL
            cell = a[round(y + 1):round(y + PIXEL - 1), round(x + 1):round(x + PIXEL - 1)]
            out[j, i] = np.median(cell.reshape(-1, 3), axis=0)
    return out


def cut():
    mask = Image.new("L", SIZE)
    ImageDraw.Draw(mask).polygon(OUTLINE, fill=255)
    px = real_pixels()
    # What the outline caught of the meadow along its edge
    r, g, b = (px[..., i].astype(int) for i in range(3))
    meadow = (g >= r - 8) & (r - b > 35)
    sheep = Image.fromarray(px).convert("RGBA")
    sheep.putalpha(Image.fromarray(np.where(meadow, 0, np.asarray(mask)).astype(np.uint8)))
    return sheep


def legs(img, step, lift_body):
    for x, near, front, start in LEGS:
        foot, lift, bend = STRIDE[(step + start) % len(STRIDE)] if step is not None else (0, 0, 0)
        hip = x + BODY_AT[0]
        # The front knee bends forward, the hind hock backward
        knee = hip + foot / 2 + (bend if front else -bend)
        top, joint, bottom = HIP - lift_body, KNEE - lift // 2, FOOT - lift
        for y in range(top, bottom + 1):
            if y <= joint:
                col = hip + (knee - hip) * (y - top) / max(1, joint - top)
            else:
                col = knee + (hip + foot - knee) * (y - joint) / max(1, bottom - joint)
            col = round(col)
            img.putpixel((col, y), LINE)
            img.putpixel((col + 1, y), LEG if near else FAR_LEG)
            img.putpixel((col + 2, y), LINE)
        hoof = round(hip + foot)
        for dx in range(3):
            img.putpixel((hoof + dx, bottom), LINE)


def frame(sheep, step, head_up, bob, nibble=0):
    img = Image.new("RGBA", FRAME)
    ImageDraw.Draw(img).ellipse((5, FOOT - 3, 33, FOOT + 2), fill=SHADOW)
    legs(img, step, bob)
    body = sheep.copy()
    head = body.crop(HEAD)
    body.paste((0, 0, 0, 0), HEAD)
    at = (BODY_AT[0], BODY_AT[1] - bob)
    img.alpha_composite(body, at)
    dx, dy = HEAD_UP if head_up else (0, nibble)
    if nibble:  # the neck stays, the head just dips
        img.alpha_composite(head, (at[0] + HEAD[0], at[1] + HEAD[1]))
    img.alpha_composite(head, (at[0] + HEAD[0] + dx, at[1] + HEAD[1] + dy))
    return img


def main():
    sheep = cut()
    drawings = [frame(sheep, None, False, 0), frame(sheep, None, False, 0, nibble=1)]
    drawings += [frame(sheep, step, True, step // 2 % 2) for step in range(len(STRIDE))]
    sheet = Image.new("RGBA", (FRAME[0] * len(drawings), FRAME[1]))
    for i, d in enumerate(drawings):
        sheet.paste(d, (i * FRAME[0], 0))
    sheet.save(OUT + ".png")

    def entry(i, duration):
        cell = {"x": i * FRAME[0], "y": 0, "w": FRAME[0], "h": FRAME[1]}
        return {
            "frame": cell,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME[0], "h": FRAME[1]},
            "sourceSize": {"w": FRAME[0], "h": FRAME[1]},
            "duration": duration,
        }

    walking = range(2, 2 + len(STRIDE))
    frames = [entry(0, 700), entry(1, 260)] + [entry(i, 105) for i in walking] + [entry(i, 50) for i in walking]
    tags = [
        {"name": "pasta", "from": 0, "to": 1, "direction": "forward"},
        {"name": "camina", "from": 2, "to": 1 + len(STRIDE), "direction": "forward"},
        {"name": "corre", "from": 2 + len(STRIDE), "to": 1 + 2 * len(STRIDE), "direction": "forward"},
    ]
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": frames, "meta": {"frameTags": tags}}, f, indent=1)


if __name__ == "__main__":
    main()
