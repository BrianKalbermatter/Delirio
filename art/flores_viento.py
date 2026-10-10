"""Wind animation for Brian's hand-drawn flowers (Laberinto/Terreno/Flores and
Flores2). The drawing itself is untouched: each frame shifts its rows sideways,
more the higher they are above the ground, so the base stays put and the tips
sway with the wind.

Usage: python3 flores_viento.py <Terreno dir> <out_dir>
Writes <out_dir>/<name>/0.png, 1.png, ... plus durations.txt, for
frames_aseprite.lua (tag viento). Each frame is centred on the flower's foot.
"""
import os
import sys

from PIL import Image

from gramilla import read_aseprite

SOURCES = ["Flores", "Flores2"]
SWAY = 3  # px the tips lean at the strongest gust
STILL_ROWS = 4  # rows above the ground that never move (the base)
CURVE = 1.5  # >1: the stems bend more near the top than near the base
# Lean of the tips per frame (1 = SWAY px downwind): a gust and a small
# swing back past upright.
GUST = [0, 0.35, 0.7, 0.9, 1, 0.8, 0.5, 0.2, -0.1, -0.2]
FRAME_MS = 120
MARGIN = 2  # px of room above the drawing


def wind_frames(img):
    left, top, right, bottom = img.getbbox()
    foot_x, foot_y = (left + right) // 2, bottom - 1
    half = max(foot_x - left, right - foot_x) + SWAY + 1
    height = foot_y - top + 1
    frames = []
    for gust in GUST:
        frame = Image.new("RGBA", (2 * half, height + MARGIN))
        for y in range(top, bottom):
            rise = max(0, foot_y - y - STILL_ROWS) / max(1, height - STILL_ROWS)
            shift = int(SWAY * gust * rise**CURVE + 0.5 * (1 if gust >= 0 else -1))
            for x in range(left, right):
                c = img.getpixel((x, y))
                if c[3]:
                    frame.putpixel((x - foot_x + half + shift, y - top + MARGIN), c)
        frames.append(frame)
    return frames


def build(src_dir, out_dir):
    for name in SOURCES:
        img = read_aseprite(os.path.join(src_dir, f"{name}.aseprite"))
        frame_dir = os.path.join(out_dir, name)
        os.makedirs(frame_dir, exist_ok=True)
        for i, frame in enumerate(wind_frames(img)):
            frame.save(os.path.join(frame_dir, f"{i}.png"))
        with open(os.path.join(frame_dir, "durations.txt"), "w") as f:
            f.write(" ".join(str(FRAME_MS) for _ in GUST))


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
