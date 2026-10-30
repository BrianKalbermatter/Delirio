"""Inventory icons drawn for the inventory, for items whose own sprite does not
read at slot size (the spear is a 1 px diagonal 55 px long: shrunk to a slot
it is a brown smudge). Each icon is 32x32, drawn here pixel by pixel from
shapes along a diagonal, then outlined.

OUTPUT (client/public/assets): iconos.png + iconos.json, one frame per icon
in ICONS order (Aseprite's JSON array format, like the other sheets).

    python3 art/iconos.py
"""
import json
import math
from pathlib import Path

from PIL import Image

SIZE = 32
OUT = Path(__file__).resolve().parent.parent / "client" / "public" / "assets"

OUTLINE = (26, 18, 22, 255)
WOOD_LIGHT = (222, 160, 88, 255)
WOOD = (176, 112, 52, 255)
WOOD_DARK = (112, 66, 30, 255)
STEEL_LIGHT = (246, 250, 255, 255)
STEEL = (196, 206, 222, 255)
STEEL_DARK = (118, 130, 156, 255)
BINDING = (250, 190, 84, 255)
BINDING_DARK = (170, 104, 40, 255)


def spear() -> Image.Image:
    """Butt at the bottom left, point at the top right: a two pixel shaft, a
    gold binding and a wide leaf-shaped head with a bright edge."""
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    # Along the diagonal: u from the butt to the point, v across it.
    x0, y0 = 3.5, 28.5
    length = 34.0
    head_from = 21.0  # u where the head starts (the binding just before)

    def axis(x: float, y: float) -> tuple[float, float]:
        dx, dy = x - x0, y0 - y
        return (dx + dy) / math.sqrt(2), (dx - dy) / math.sqrt(2)

    for y in range(SIZE):
        for x in range(SIZE):
            u, v = axis(x + 0.5, y + 0.5)
            if u < 0 or u > length:
                continue
            if u >= head_from:
                t = (u - head_from) / (length - head_from)  # 0 at the base, 1 at the tip
                half = 3.2 * math.sin(math.pi * min(1.0, t * 1.45)) if t < 0.35 else 3.2 * (1 - t) / 0.65
                if abs(v) > half:
                    continue
                if abs(v) < 0.6:
                    px[x, y] = STEEL_LIGHT  # the ridge down the middle
                else:
                    px[x, y] = STEEL if v > 0 else STEEL_DARK
            elif u >= head_from - 2.6:
                if abs(v) <= 1.6:
                    px[x, y] = BINDING if v > -0.3 else BINDING_DARK
            elif abs(v) <= 1.05:
                px[x, y] = WOOD_LIGHT if v > 0.35 else WOOD if v > -0.35 else WOOD_DARK
    return outline(img)


def outline(img: Image.Image) -> Image.Image:
    """A 1 px dark line around everything drawn (4-neighbours)."""
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
    return out


ICONS = [("spear", spear)]


def main() -> None:
    sheet = Image.new("RGBA", (SIZE * len(ICONS), SIZE))
    frames = []
    for i, (name, draw) in enumerate(ICONS):
        sheet.paste(draw(), (i * SIZE, 0))
        frames.append(
            {
                "filename": f"iconos {i} ({name})",
                "frame": {"x": i * SIZE, "y": 0, "w": SIZE, "h": SIZE},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": SIZE, "h": SIZE},
                "sourceSize": {"w": SIZE, "h": SIZE},
                "duration": 100,
            }
        )
    sheet.save(OUT / "iconos.png")
    meta = {
        "app": "art/iconos.py",
        "image": "iconos.png",
        "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height},
        "scale": "1",
        "frameTags": [],
    }
    (OUT / "iconos.json").write_text(json.dumps({"frames": frames, "meta": meta}, indent=1) + "\n")
    print(f"Wrote {OUT / 'iconos.png'} ({len(ICONS)} icons)")


if __name__ == "__main__":
    main()
