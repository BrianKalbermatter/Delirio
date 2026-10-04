"""Closed leather book lying on the floor: the player's maze map.

Usage: python3 libro.py <out_dir>
Writes libro.png and libro.json (Aseprite json-array format, one frame).
"""
import json
import sys

from PIL import Image

W, H = 24, 18

OUTLINE = (24, 16, 14)
LEATHER = [(58, 30, 22), (86, 46, 30), (112, 64, 40), (138, 84, 52)]
PAGES = [(170, 156, 120), (214, 200, 160)]
GOLD = [(140, 104, 40), (210, 170, 70)]
SHADOW = (10, 8, 12, 110)


def build(out_dir):
    img = Image.new("RGBA", (W, H))
    px = img.load()

    # Soft shadow on the floor
    for x in range(3, W - 1):
        px[x, H - 2] = SHADOW
        px[x, H - 1] = (10, 8, 12, 60)

    # Book block seen from above, slightly in perspective: cover on top,
    # page edges visible along the bottom and right.
    left, top, right, bottom = 2, 2, W - 3, H - 3
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            edge = x in (left, right) or y in (top, bottom)
            if edge:
                px[x, y] = OUTLINE + (255,)
            elif y >= bottom - 2 or x >= right - 2:
                # Page edges: light paper lines
                px[x, y] = PAGES[(x + y) % 2] + (255,)
            else:
                # Leather cover: lit from the top-left
                tone = 2 if y < top + 3 else 1
                if x < left + 2:
                    tone = 3
                if (x * 7 + y * 13) % 23 == 0:
                    tone = max(0, tone - 1)  # grain
                px[x, y] = LEATHER[tone] + (255,)

    # Spine shadow and a gold clasp / corner pieces
    for y in range(top + 1, bottom - 2):
        px[left + 3, y] = LEATHER[0] + (255,)
    for x, y in [(left + 1, top + 1), (right - 3, top + 1), (left + 1, bottom - 3), (right - 3, bottom - 3)]:
        px[x, y] = GOLD[1] + (255,)
    cy = (top + bottom - 2) // 2
    for y in range(cy - 1, cy + 2):
        px[right - 3, y] = GOLD[0] + (255,)
    px[right - 3, cy] = GOLD[1] + (255,)

    img.save(f"{out_dir}/libro.png")
    data = {
        "frames": [{
            "filename": "libro 0",
            "frame": {"x": 0, "y": 0, "w": W, "h": H},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": W, "h": H},
            "sourceSize": {"w": W, "h": H},
            "duration": 100,
        }],
        "meta": {"image": "libro.png", "size": {"w": W, "h": H}, "frameTags": []},
    }
    with open(f"{out_dir}/libro.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".")
