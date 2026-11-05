"""The birds of art/aves_original.png, with wings. The picture is pixel art blown
up 3x with one pose each, perched and looking left: this takes each bird back to
its real pixels and adds a peck and a wing that flaps.

Usage: python3 art/aves.py   (needs numpy and scipy)
Writes client/public/sprites/aves.{png,json}: FRAMES frames per bird, in the
order of BIRDS: perched, pecking, wing up, wing level, wing down. Each bird stands
on the bottom middle of its frame.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "aves_original.png")
OUT = os.path.join(HERE, "..", "client", "public", "sprites", "aves")

GRID = 3  # screen px per real pixel
GROUND_NEAR = 40  # this close to the grey (sum of channels) is the ground
FRAME = (32, 32)  # px of each frame
LINE = (22, 16, 24, 255)
# Each bird: box in the picture and the colour of its wing.
BIRDS = [
    ((120, 188, 171, 241), (84, 142, 172, 255)),  # blue jay
    ((185, 192, 249, 241), (170, 58, 78, 255)),  # macaw
    ((260, 196, 314, 242), (66, 134, 62, 255)),  # parrot
    ((333, 188, 393, 236), (92, 72, 132, 255)),  # plum bird
    ((116, 262, 172, 316), (130, 86, 50, 255)),  # owl
    ((186, 276, 244, 316), (92, 160, 132, 255)),  # hummingbird
    ((252, 272, 316, 316), (96, 86, 116, 255)),  # toucan
    ((332, 246, 395, 318), (236, 230, 236, 255)),  # goose
]
# The wing from its root, in px: up, level and down.
WINGS = [
    [(-2, 1), (3, 1), (6, -8), (1, -6)],
    [(-2, 0), (3, 2), (10, -1), (6, -3)],
    [(-2, 0), (3, 0), (7, 7), (2, 6)],
]


def real_pixels(part):
    def blocks(ox, oy):
        h, w = (part.shape[0] - oy) // GRID, (part.shape[1] - ox) // GRID
        cut = part[oy:oy + h * GRID, ox:ox + w * GRID]
        return cut.reshape(h, GRID, w, GRID, 3).transpose(0, 2, 1, 3, 4).reshape(h, w, GRID * GRID, 3)

    best = min(((ox, oy) for ox in range(GRID) for oy in range(GRID)), key=lambda o: blocks(*o).astype(float).std(axis=2).mean())
    return np.median(blocks(*best), axis=2).astype(np.uint8)


def cut(image, box, ground):
    left, top, right, bottom = box
    px = real_pixels(image[top:bottom, left:right])
    solid = np.abs(px.astype(int) - ground).sum(2) > GROUND_NEAR
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    solid = labels == 1 + int(np.argmax(ndimage.sum(solid, labels, range(1, n + 1))))
    ys, xs = np.nonzero(solid)
    rgba = np.dstack([px, solid * np.uint8(255)])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(rgba, "RGBA")


def perched(bird):
    img = Image.new("RGBA", FRAME)
    img.alpha_composite(bird, ((FRAME[0] - bird.width) // 2, FRAME[1] - bird.height))
    return img


def pecking(bird):
    """The front of the bird dips: its top half a pixel forward and down."""
    img = perched(bird)
    top = FRAME[1] - bird.height
    half = top + bird.height // 2
    head = img.crop((0, top, FRAME[0], half))
    img.paste((0, 0, 0, 0), (0, top, FRAME[0], half))
    img.alpha_composite(head, (0, top + 1))
    moved = Image.new("RGBA", FRAME)
    moved.alpha_composite(img.crop((1, 0, FRAME[0], half + 1)), (0, 0))
    moved.alpha_composite(img.crop((0, half + 1, FRAME[0], FRAME[1])), (0, half + 1))
    return moved


def flapping(bird, wing, colour):
    img = perched(bird)
    root = (FRAME[0] // 2 + 1, FRAME[1] - bird.height // 2 - 1)
    ImageDraw.Draw(img).polygon([(root[0] + x, root[1] + y) for x, y in wing], fill=colour, outline=LINE)
    return img


def main():
    image = np.asarray(Image.open(SOURCE).convert("RGB"))
    ground = np.median(image.reshape(-1, 3), axis=0).astype(int)
    frames = []
    for box, colour in BIRDS:
        bird = cut(image, box, ground)
        print(bird.size)
        frames += [perched(bird), pecking(bird)] + [flapping(bird, w, colour) for w in WINGS]
    per_bird = 2 + len(WINGS)
    sheet = Image.new("RGBA", (FRAME[0] * per_bird, FRAME[1] * len(BIRDS)))
    entries = []
    for i, f in enumerate(frames):
        x, y = (i % per_bird) * FRAME[0], (i // per_bird) * FRAME[1]
        sheet.paste(f, (x, y))
        entries.append({
            "frame": {"x": x, "y": y, "w": FRAME[0], "h": FRAME[1]},
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME[0], "h": FRAME[1]},
            "sourceSize": {"w": FRAME[0], "h": FRAME[1]},
            "duration": 100,
        })
    sheet.save(OUT + ".png")
    with open(OUT + ".json", "w") as f:
        json.dump({"frames": entries, "meta": {"frameTags": []}}, f, indent=1)


if __name__ == "__main__":
    main()
