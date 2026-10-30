"""The coin enemies drop when they die: a gold coin spinning on its edge,
hovering a little over its shadow. Drawn pixel by pixel: each frame is the
coin seen at another angle (an ellipse as wide as cos(angle)), its face with a
rim, a lit edge and an embossed mark, and the bare edge when it is side on.

OUTPUT (client/public/assets): moneda.png + moneda.json, FRAMES frames of
SIZE x SIZE with the tag "spin" (frame 0 is the coin face on: the icon).

    python3 art/moneda.py
"""
import json
import math
from pathlib import Path

from PIL import Image

SIZE = 16
FRAMES = 8
FRAME_MS = 90
OUT = Path(__file__).resolve().parent.parent / "client" / "public" / "assets"

OUTLINE = (74, 40, 22, 255)
GOLD_DARK = (176, 104, 26, 255)
GOLD = (236, 170, 44, 255)
GOLD_LIGHT = (255, 222, 104, 255)
SHINE = (255, 250, 214, 255)
SHADOW = (0, 0, 0, 70)

RADIUS = 5.5  # px, the coin face on
CENTER_X = SIZE / 2
CENTER_Y = 7.0  # over its shadow (the frame's bottom is on the floor)


def frame(k: int) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    # Shadow on the floor, as wide as the coin is now.
    angle = 2 * math.pi * k / FRAMES
    half_w = max(0.6, RADIUS * abs(math.cos(angle)))
    for x in range(SIZE):
        if abs(x + 0.5 - CENTER_X) <= max(1.5, half_w) - 0.2:
            px[x, SIZE - 2] = SHADOW
    facing = math.cos(angle) >= 0  # the front (mark) or the back
    for y in range(SIZE):
        for x in range(SIZE):
            dx = (x + 0.5 - CENTER_X) / half_w
            dy = (y + 0.5 - CENTER_Y) / RADIUS
            d = dx * dx + dy * dy
            if d > 1:
                continue
            if half_w < 1.5:  # side on: just the edge
                px[x, y] = GOLD_DARK if y > CENTER_Y else GOLD
                continue
            if d > 0.62:
                color = GOLD_LIGHT if dx < 0 and dy < 0.2 else GOLD_DARK  # the rim, lit on the left
            else:
                color = GOLD
            px[x, y] = color
    if half_w >= 2.5:
        mark(px, half_w, facing)
    return outline(img)


def mark(px, half_w: float, facing: bool) -> None:
    """An embossed square on the face (a diamond on the back), squeezed with
    the coin, and a glint at the top left."""
    cy = int(CENTER_Y)
    cx = int(CENTER_X)
    if half_w >= 4:
        if facing:
            for y in range(cy - 1, cy + 2):
                for x in range(cx - 1, cx + 1):
                    px[x, y] = GOLD_DARK
            px[cx - 1, cy - 1] = GOLD_LIGHT
        else:
            for y, w in ((cy - 1, 0), (cy, 1), (cy + 1, 0)):
                for x in range(cx - 1 - w, cx + 1 + w):
                    px[x, y] = GOLD_DARK
    else:
        px[cx - 1 if half_w < 3 else cx - 1, cy] = GOLD_DARK
    gx = int(CENTER_X - half_w * 0.45)
    px[gx, cy - 3] = SHINE


def outline(img: Image.Image) -> Image.Image:
    """A 1 px dark line around the coin (not around its shadow)."""
    px = img.load()
    out = img.copy()
    opx = out.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if px[x, y][3] == 255:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < SIZE and 0 <= ny < SIZE and px[nx, ny][3] == 255:
                    opx[x, y] = OUTLINE
                    break
    return out


def main() -> None:
    sheet = Image.new("RGBA", (SIZE * FRAMES, SIZE))
    frames = []
    for k in range(FRAMES):
        sheet.paste(frame(k), (k * SIZE, 0))
        frames.append(
            {
                "filename": f"moneda {k}",
                "frame": {"x": k * SIZE, "y": 0, "w": SIZE, "h": SIZE},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": SIZE, "h": SIZE},
                "sourceSize": {"w": SIZE, "h": SIZE},
                "duration": FRAME_MS,
            }
        )
    sheet.save(OUT / "moneda.png")
    meta = {
        "app": "art/moneda.py",
        "image": "moneda.png",
        "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height},
        "scale": "1",
        "frameTags": [{"name": "spin", "from": 0, "to": FRAMES - 1, "direction": "forward"}],
    }
    (OUT / "moneda.json").write_text(json.dumps({"frames": frames, "meta": meta}, indent=1) + "\n")
    print(f"Wrote {OUT / 'moneda.png'} ({FRAMES} frames)")


if __name__ == "__main__":
    main()
