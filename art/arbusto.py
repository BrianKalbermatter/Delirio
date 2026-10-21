"""Bushes the player hides in, like League of Legends' brush (src/mecanicas/
arbustos.c). A mound of leaf clumps, lit from above like the big tree
(pintar_arbol.py palette), on a soft shadow. Three variants, each with a
small sway loop for when someone moves inside.

Usage: python3 art/arbusto.py client/public/sprites
Writes arbusto.png and arbusto.json (Aseprite json-array format, one tag
per variant: viento_0, viento_1, viento_2; the first frame of each is the
bush at rest). Brian can repaint the sheet in Aseprite and export over it.
"""
import json
import math
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pintar_arbol import HOLLOW_SHADE, LEAF  # noqa: E402

# The C bush is a circle of 76 px on the floor (ARBUSTO_RADIO). The sheet's
# bottom center goes on its lowest point; the clumps rise over the circle.
RADIUS = 76
W, H = 2 * RADIUS + 16, 2 * RADIUS + 32
FOOT_Y = H - 6  # the circle's lowest point inside the frame
CENTER = (W / 2, FOOT_Y - RADIUS)
OUTLINE = HOLLOW_SHADE
SHADOW = (0, 0, 0, 70)
VARIANTS = 3
SWAY = [0, 2, 0, -2]  # px the top leans in each frame of the loop
FRAME_MS = 160
LIGHT = (-0.45, -0.85)  # from the top left, like the tree


def clumps(seed):
    """Leaf clumps (x, y, r, lift) spread over the floor circle, back to front."""
    rnd = random.Random(seed)
    out = []
    for _ in range(60):
        a = rnd.uniform(0, 2 * math.pi)
        d = RADIUS * 0.8 * math.sqrt(rnd.random())
        x = CENTER[0] + math.cos(a) * d
        y = CENTER[1] + math.sin(a) * d
        r = rnd.uniform(13, 20)
        # Resting on the floor, and higher in the middle: a mound, not a carpet.
        lift = r * 0.5 + 22 * (1 - d / RADIUS) + rnd.uniform(-2, 2)
        out.append((x, y, r, lift))
    return sorted(out, key=lambda c: c[1])


def leaf_noise(x, y, seed):
    """-1, 0 or +1 per 2x2 block: small leaves breaking up the shading."""
    h = ((x // 2) * 73856093) ^ ((y // 2) * 19349663) ^ (seed * 83492791)
    return 1 if h % 7 == 0 else -1 if h % 7 == 1 else 0


def paint_bush(seed):
    img = Image.new("RGBA", (W, H))
    px = img.load()
    # A dark body under the clumps, so no floor shows between them.
    rx, ry = RADIUS * 0.85, RADIUS * 0.62
    bx, by = CENTER[0], CENTER[1] - 10
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - bx) / rx) ** 2 + ((y + 0.5 - by) / ry) ** 2 <= 1:
                px[x, y] = LEAF[1] + (255,)
    for x0, y0, r, lift in clumps(seed):
        cy = y0 - lift
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(x0 - r) - 1, int(x0 + r) + 2):
                if not (0 <= x < W and 0 <= y < H):
                    continue
                nx, ny = (x + 0.5 - x0) / r, (y + 0.5 - cy) / r
                d = math.hypot(nx, ny)
                if d > 1:
                    continue
                # The lower rim of each clump is dark: it reads over the ones behind.
                if d > 0.86 and ny > 0.15:
                    px[x, y] = LEAF[0] + (255,)
                    continue
                lit = -(nx * LIGHT[0] + ny * LIGHT[1])  # -1 .. 1
                level = 2.4 + 2.0 * lit - 1.2 * d * d + 0.5 * leaf_noise(x, y, seed)
                level = max(1, min(len(LEAF) - 1, round(level)))
                px[x, y] = LEAF[level] + (255,)
    # Silhouette outline.
    out = img.copy()
    opx = out.load()
    for y in range(H):
        for x in range(W):
            if px[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy][3]:
                    opx[x, y] = OUTLINE + (255,)
                    break
    # Sat on its shadow: the lowest leaves a little above the circle's foot.
    bottom = out.getbbox()[3]
    grounded = Image.new("RGBA", (W, H))
    grounded.paste(out, (0, FOOT_Y - 8 - bottom))
    return grounded


def shadow():
    img = Image.new("RGBA", (W, H))
    rx, ry = RADIUS + 4, 16
    cx, cy = W / 2, FOOT_Y - 16
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                img.putpixel((x, y), SHADOW)
    return img


def sway(bush, amount):
    """Leans the top `amount` px; the foot stays."""
    out = Image.new("RGBA", (W, H))
    for y in range(H):
        dx = round(amount * ((FOOT_Y - y) / FOOT_Y) ** 1.5) if y < FOOT_Y else 0
        row = bush.crop((0, y, W, y + 1))
        out.paste(row, (dx, y))
    return out


def build(out_dir):
    base = shadow()
    frames = []
    for v in range(VARIANTS):
        bush = paint_bush(seed=11 + 7 * v)
        for amount in SWAY:
            frame = base.copy()
            frame.alpha_composite(sway(bush, amount))
            frames.append(frame)
    cols = len(SWAY)
    sheet = Image.new("RGBA", (W * cols, H * VARIANTS))
    data = {"frames": [], "meta": {}}
    for i, frame in enumerate(frames):
        x, y = (i % cols) * W, (i // cols) * H
        sheet.paste(frame, (x, y))
        data["frames"].append(
            {
                "filename": f"Arbusto {i}.aseprite",
                "frame": {"x": x, "y": y, "w": W, "h": H},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": W, "h": H},
                "sourceSize": {"w": W, "h": H},
                "duration": FRAME_MS,
            }
        )
    data["meta"] = {
        "app": "art/arbusto.py",
        "image": "arbusto.png",
        "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height},
        "scale": "1",
        "frameTags": [
            {"name": f"viento_{v}", "from": v * cols, "to": v * cols + cols - 1, "direction": "forward"}
            for v in range(VARIANTS)
        ],
    }
    sheet.save(os.path.join(out_dir, "arbusto.png"))
    with open(os.path.join(out_dir, "arbusto.json"), "w") as f:
        json.dump(data, f, indent=1)


if __name__ == "__main__":
    build(sys.argv[1])
