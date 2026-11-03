"""Small flowers for the square's meadow, growing low among Brian's Flores and
Flores2: tiny heads on short stems, in the colours of his flowers (lilac and
magenta petals, his greens for the stems and leaves).

Usage: python3 florcitas.py <client/public/sprites>
Writes florcitas.png and florcitas.json (one frame per variant, json-array like Aseprite).
"""
import json
import random
import sys

from PIL import Image

STEM = [(40, 116, 30), (66, 192, 49)]
LEAF = (106, 190, 48)
OUTLINE = (75, 105, 47)
PETALS = [
    [(188, 141, 197), (118, 66, 138)],  # lilac (Flores)
    [(210, 44, 208), (118, 66, 138)],  # magenta (Flores2)
    [(215, 123, 186), (118, 66, 138)],  # pink (Flores2)
]
W, H = 9, 9
VARIANTS = 9


def put(img, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), c + (255,))


def flower(rng, petals):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    heads = rng.choice((1, 1, 2, 3))
    for h in range(heads):
        x = 4 + (h - (heads - 1) / 2) * 3 + rng.choice((-1, 0, 0))
        x = int(round(x))
        top = rng.randint(1, 3)
        for y in range(top + 2, H):  # stem down to the ground
            put(img, x, y, STEM[0] if y > top + 3 else STEM[1])
        light, dark = petals
        # A head: a plus of petals, the lower one darker, a light centre
        put(img, x, top, light)
        put(img, x - 1, top + 1, light)
        put(img, x + 1, top + 1, dark)
        put(img, x, top + 2, dark)
        put(img, x, top + 1, (242, 236, 139))
    # Two leaves at the foot
    put(img, 3, H - 2, LEAF)
    put(img, 5, H - 2, LEAF)
    put(img, 2, H - 1, OUTLINE)
    put(img, 6, H - 1, OUTLINE)
    return img


def main(out):
    rng = random.Random(61)
    images = [flower(rng, PETALS[i % len(PETALS)]) for i in range(VARIANTS)]
    sheet = Image.new("RGBA", (W * VARIANTS, H), (0, 0, 0, 0))
    frames = []
    for i, img in enumerate(images):
        sheet.paste(img, (i * W, 0))
        frames.append({
            "filename": f"florcitas {i}",
            "frame": {"x": i * W, "y": 0, "w": W, "h": H},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": W, "h": H},
            "sourceSize": {"w": W, "h": H},
            "duration": 100,
        })
    sheet.save(f"{out}/florcitas.png")
    meta = {"app": "art/florcitas.py", "image": "florcitas.png", "format": "RGBA8888",
            "size": {"w": W * VARIANTS, "h": H}, "scale": "1", "frameTags": []}
    with open(f"{out}/florcitas.json", "w") as f:
        json.dump({"frames": frames, "meta": meta}, f, indent=1)
    print(f"{VARIANTS} small flowers in {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
