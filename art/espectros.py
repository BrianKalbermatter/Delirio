"""The three new enemies, each drawn once: the ghost (art/fantasma_original.png),
the spirit that throws (art/espiritu_original.png) and the skeleton that gets up
from the dead (art/esqueleto_original.png). This takes each picture back to its
real pixels, cuts it out and moves it. All three look left: the game mirrors them.

Usage: python3 art/espectros.py   (needs numpy and scipy)
Writes client/public/sprites/{fantasma,espiritu,esqueleto,espiritu_tiro}.{png,json}.
Each stands on the bottom middle of its frame, on the shadow drawn there.
Tags: fantasma flota/ataca/aparece/muere, espiritu flota/lanza/aparece/muere,
esqueleto quieto/camina/ataca/levanta/muere, espiritu_tiro vuela.
"""
import json
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "client", "public", "sprites")
SHADOW = (0, 0, 0, 90)


def real_pixels(name, grid, ox=0.0, oy=0.0):
    image = np.asarray(Image.open(os.path.join(HERE, name)).convert("RGB")).astype(float)
    rows, cols = int((image.shape[0] - oy) / grid), int((image.shape[1] - ox) / grid)
    px = np.zeros((rows, cols, 3), np.uint8)
    for j in range(rows):
        for i in range(cols):
            y, x = oy + (j + 0.5) * grid, ox + (i + 0.5) * grid
            px[j, i] = image[int(y), int(x)]
    return px


def trimmed(rgba):
    ys, xs = np.nonzero(rgba[..., 3])
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def background(px):
    return np.median(px.reshape(-1, 3), axis=0).astype(int)


def on_frame(size, parts, shadow_w, lift=0):
    """`parts`: (rgba, x, y) from the frame's bottom middle, feet at y = 0. The
    shadow stays on the floor whatever floats over it."""
    img = Image.new("RGBA", size)
    if shadow_w:
        cx, floor = size[0] // 2, size[1] - 3
        half = max(2, shadow_w // 2 - lift)
        ImageDraw.Draw(img).ellipse((cx - half, floor - 2, cx + half, floor + 2), fill=SHADOW)
    for rgba, x, y in parts:
        part = Image.fromarray(np.ascontiguousarray(rgba), "RGBA")
        layer = Image.new("RGBA", size)
        layer.paste(part, (size[0] // 2 - part.width // 2 + x, size[1] - 3 - part.height + y))
        img.alpha_composite(layer)
    return img


def shear(rgba, by_row):
    """Moves each row sideways by by_row(row) px, keeping the canvas."""
    out = np.zeros_like(rgba)
    for y in range(rgba.shape[0]):
        d = int(round(by_row(y)))
        if d > 0:
            out[y, d:] = rgba[y, :-d]
        elif d < 0:
            out[y, :d] = rgba[y, -d:]
        else:
            out[y] = rgba[y]
    return out


def padded(rgba, side):
    out = np.zeros((rgba.shape[0], rgba.shape[1] + 2 * side, 4), np.uint8)
    out[:, side:side + rgba.shape[1]] = rgba
    return out


def dissolved(rgba, share, seed, rise=0):
    """`share` of its pixels gone, the first ones from the top, the rest going up."""
    out = rgba.copy()
    rng = np.random.default_rng(seed)
    noise = rng.random(rgba.shape[:2]) + np.linspace(-0.25, 0.25, rgba.shape[0])[:, None]
    out[noise < share * 1.5 - 0.25, 3] = 0
    if rise:
        out = np.roll(out, -rise, axis=0)
        out[-rise:] = 0
    return out


def write(name, tags, size, ms):
    width = max(len(frames) for frames in tags.values())
    sheet = Image.new("RGBA", (size[0] * width, size[1] * len(tags)))
    entries, frame_tags = [], []
    for row, (tag, frames) in enumerate(tags.items()):
        frame_tags.append({"name": tag, "from": len(entries), "to": len(entries) + len(frames) - 1, "direction": "forward"})
        for k, frame in enumerate(frames):
            x, y = k * size[0], row * size[1]
            sheet.paste(frame, (x, y))
            entries.append({
                "frame": {"x": x, "y": y, "w": size[0], "h": size[1]},
                "spriteSourceSize": {"x": 0, "y": 0, "w": size[0], "h": size[1]},
                "sourceSize": {"w": size[0], "h": size[1]},
                "duration": ms.get(tag, 100),
            })
    sheet.save(os.path.join(SPRITES, name + ".png"))
    with open(os.path.join(SPRITES, name + ".json"), "w") as f:
        json.dump({"frames": entries, "meta": {"frameTags": frame_tags}}, f, indent=1)


# ---------------------------------------------------------------- ghost

GHOST_FRAME = (72, 120)
GHOST_HOVER = 12  # px from the floor to the hem
GHOST_STEPS = 8


def ghost():
    px = real_pixels("fantasma_original.png", 2.875)
    solid = np.abs(px.astype(int) - background(px)).sum(2) > 26
    solid[int(538 / 2.875):] = False  # its shadow
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    main = labels == 1 + int(np.argmax(sizes))
    rgba = np.dstack([px, solid * np.uint8(255)])
    ys, xs = np.nonzero(solid)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    body = rgba[top:bottom, left:right].copy()
    body[~main[top:bottom, left:right], 3] = 0
    lines = rgba[top:bottom, left:right].copy()
    lines[main[top:bottom, left:right], 3] = 0
    body, lines = padded(body, 8), padded(lines, 8)
    height = body.shape[0]
    hem_from = height * 0.62

    def pose(step, lean=0.0):
        phase = 2 * math.pi * step / GHOST_STEPS
        # The rags wave more the lower they hang; a lean pushes the head forward
        moved = shear(body, lambda y: (1.6 * ((y - hem_from) / (height - hem_from)) * math.sin(phase + y * 0.3) if y > hem_from else 0)
                      + lean * (1 - y / height))
        flowing = np.roll(lines, -(step * 3) % height, axis=0)
        bob = round(2 * math.sin(phase))
        return moved, flowing, bob

    def drawn(step, lean=0.0, share=0.0):
        moved, flowing, bob = pose(step, lean)
        moved = dissolved(moved, share, 7, round(share * 10)) if share else moved
        flowing = dissolved(flowing, min(1, share * 1.6), 8) if share else flowing
        y = -GHOST_HOVER + bob
        return on_frame(GHOST_FRAME, [(flowing, 0, y), (moved, 0, y)], round(26 * (1 - share)), bob)

    tags = {
        "flota": [drawn(s) for s in range(GHOST_STEPS)],
        "ataca": [drawn(s, -5.0) for s in range(GHOST_STEPS)],
        "aparece": [drawn(s, 0, 1 - (s + 1) / GHOST_STEPS) for s in range(GHOST_STEPS)],
        "muere": [drawn(s, 0, (s + 1) / GHOST_STEPS) for s in range(GHOST_STEPS)],
    }
    write("fantasma", tags, GHOST_FRAME, {"flota": 120, "ataca": 80, "aparece": 90, "muere": 90})
    print("ghost", body.shape)


# ---------------------------------------------------------------- spirit

SPIRIT_FRAME = (72, 96)
SPIRIT_HOVER = 14
SPIRIT_STEPS = 8
# How far back (+) or forward (-) the throw takes the cloak, frame by frame.
THROW = [3, 7, 10, 4, -8, -11, -6, -2]


def spirit():
    px = real_pixels("espiritu_original.png", 3, ox=1)
    solid = np.abs(px.astype(int) - background(px)).sum(2) > 26
    solid[int(330 / 3):] = False  # its shadow
    labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
    solid = labels == 1 + int(np.argmax(ndimage.sum(solid, labels, range(1, n + 1))))
    body = padded(trimmed(np.dstack([px, solid * np.uint8(255)])), 13)
    height = body.shape[0]

    def drawn(step, back=0.0, share=0.0):
        phase = 2 * math.pi * step / SPIRIT_STEPS
        hood = 0.3 * height

        def row(y):
            low = max(0.0, (y - hood) / (height - hood))
            return 2.2 * low * math.sin(phase + y * 0.16) + back * (1 - y / height) - back * low * 0.5

        moved = shear(body, row)
        moved = dissolved(moved, share, 11, round(share * 6)) if share else moved
        bob = round(2 * math.sin(phase + 1))
        return on_frame(SPIRIT_FRAME, [(moved, 0, -SPIRIT_HOVER + bob)], round(30 * (1 - share)), bob)

    tags = {
        "flota": [drawn(s) for s in range(SPIRIT_STEPS)],
        "lanza": [drawn(s, THROW[s]) for s in range(SPIRIT_STEPS)],
        "aparece": [drawn(s, 0, 1 - (s + 1) / SPIRIT_STEPS) for s in range(SPIRIT_STEPS)],
        "muere": [drawn(s, 0, (s + 1) / SPIRIT_STEPS) for s in range(SPIRIT_STEPS)],
    }
    write("espiritu", tags, SPIRIT_FRAME, {"flota": 130, "lanza": 90, "aparece": 90, "muere": 90})
    print("spirit", body.shape)


def thrown():
    """What the spirit throws: a clot of the dark, lit from inside by the bonfire."""
    size = (16, 16)
    frames = []
    for step in range(4):
        img = Image.new("RGBA", size)
        d = ImageDraw.Draw(img)
        d.ellipse((2, 2, 13, 13), fill=(16, 12, 18, 255))
        d.ellipse((4, 4, 11, 11), fill=(40, 34, 44, 255))
        a = step * math.pi / 2
        for k in range(3):
            t = a + k * 2.1
            x, y = 8 + 5 * math.cos(t), 8 + 5 * math.sin(t)
            d.point((round(x), round(y)), fill=(238, 226, 66, 255))
            d.point((round(8 + 2 * math.cos(t + 1)), round(8 + 2 * math.sin(t + 1))), fill=(150, 138, 30, 255))
        frames.append(img)
    write("espiritu_tiro", {"vuela": frames}, size, {"vuela": 70})


# ---------------------------------------------------------------- skeleton

BONES_FRAME = (64, 80)
BONES_SHRINK = 0.75  # the picture is a head too tall next to a spartan
HIP = 0.53  # share of its height, from the top
WALK_STEPS = 8


def skeleton():
    px = real_pixels("esqueleto_original.png", 4)
    r, g, b = (px[..., i].astype(int) for i in range(3))
    solid = (r + g + b < 300) | (r - b > 60)
    full = trimmed(np.dstack([px, solid * np.uint8(255)]))
    small = Image.fromarray(full, "RGBA")
    small = small.resize((round(small.width * BONES_SHRINK), round(small.height * BONES_SHRINK)), Image.NEAREST)
    body = padded(np.asarray(small), 12)
    height, width = body.shape[:2]
    hip = int(height * HIP)
    middle = width // 2 + 1
    top = body.copy()
    top[hip:] = 0
    legs = body.copy()
    legs[:hip] = 0
    left = legs.copy()
    left[:, middle:] = 0
    right = legs.copy()
    right[:, :middle] = 0

    def leg(part, swing):
        """Swung from the hip; the one going forward lifts its foot."""
        moved = shear(part, lambda y: swing * max(0, y - hip) / (height - hip))
        lift = round(max(0, -swing) * 0.5)
        if lift:
            moved = np.roll(moved, -lift, axis=0)
        return moved

    def walk(step):
        phase = 2 * math.pi * step / WALK_STEPS
        swing = 6 * math.sin(phase)
        bob = -round(abs(math.sin(phase)) * 2)
        lean = shear(top, lambda y: -1.5 * (1 - y / hip) if y < hip else 0)
        return on_frame(BONES_FRAME, [(leg(left, swing), 0, 0), (leg(right, -swing), 0, 0), (lean, 0, bob)], 24)

    def idle(step):
        sway = shear(top, lambda y: math.sin(step * math.pi / 2) * (1 - y / hip) if y < hip else 0)
        return on_frame(BONES_FRAME, [(legs, 0, 0), (sway, 0, 0)], 24)

    def reach(step):
        phase = 2 * math.pi * step / 4
        swing = 7 * math.sin(phase)
        lean = shear(top, lambda y: -5 * (1 - y / hip) if y < hip else 0)
        return on_frame(BONES_FRAME, [(leg(left, swing), 0, 0), (leg(right, -swing), 0, 0), (lean, 0, 0)], 24)

    def rise(step, steps=10):
        up = (step + 1) / steps
        shown = round(height * up)
        part = np.zeros_like(body)
        part[height - shown:] = body[:shown]
        rng = random.Random(step)
        wobble = shear(part, lambda y: math.sin(step * 2.1) * 1.5 * (1 - up))
        img = on_frame(BONES_FRAME, [(wobble, 0, 0)], round(24 * up))
        d = ImageDraw.Draw(img)
        for _ in range(12):  # the dirt it pushes aside
            x = BONES_FRAME[0] // 2 + rng.randint(-13, 13)
            y = BONES_FRAME[1] - 3 + rng.randint(-2, 1)
            d.point((x, y), fill=(58, 44, 36, 255))
        return img

    # The death: every bone drops on its own and stays where it lands
    labels, n = ndimage.label(body[..., 3] > 0, structure=np.ones((3, 3)))
    pieces = []
    rng = random.Random(5)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(labels == i)
        part = np.zeros_like(body)
        part[ys, xs] = body[ys, xs]
        pieces.append((part, height - 1 - ys.max(), rng.uniform(-8, 8), rng.uniform(0.6, 1.0)))

    def fall(step, steps=9):
        t = (step + 1) / steps
        parts = []
        for part, drop, side, speed in pieces:
            k = min(1.0, t * t / speed)
            parts.append((part, round(side * k), round(drop * k)))
        return on_frame(BONES_FRAME, parts, 24)

    tags = {
        "quieto": [idle(s) for s in range(4)],
        "camina": [walk(s) for s in range(WALK_STEPS)],
        "ataca": [reach(s) for s in range(4)],
        "levanta": [rise(s) for s in range(10)],
        "muere": [fall(s) for s in range(9)],
    }
    write("esqueleto", tags, BONES_FRAME, {"quieto": 220, "camina": 110, "ataca": 90, "levanta": 110, "muere": 90})
    print("skeleton", body.shape, "bones", n)


if __name__ == "__main__":
    ghost()
    spirit()
    thrown()
    skeleton()
