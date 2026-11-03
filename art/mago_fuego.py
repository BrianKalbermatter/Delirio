"""MagodeFuego: Brian's sketch (sprites/Enemigos/MagodeFuego.gif), cleaned up
and animated. Everything is built on the drawing's own pixels and colors.

Usage: python3 mago_fuego.py <sketch.gif> <out_dir> [--preview <file.gif>]
Writes one PNG per frame (<out_dir>/<n>.png) and durations.txt (ms per frame);
frames_aseprite.lua (with --script-param tag=idle) assembles them into
MagodeFuego_Anim.aseprite.

- Fixed: the robe and the chest were only an outline and the right sleeve was
  full of holes; every closed gap is filled (the robe in its magenta, a small
  hole in the color around it).
- Subtle details on the robe: a shade on the lower and right edges, a few
  folds from the belt to the hem, and a darker hem.
- Older: a crease under the eyes and on the knuckles.
- The green fire of the staff, redrawn in its three greens, sways and
  flickers, with sparks rising.
- The flame in the hand becomes a fireball floating over the palm, bobbing,
  in the drawing's colors (yellow rim, orange inside, light green heart),
  with small flames on top.
- Ashes fall from the hand to the floor: yellow, orange, then dark red and
  grey, and go out where they land.
"""
import math
import os
import random
import sys

from PIL import Image

W, H = 96, 96
ORIGIN = (54, 52)    # where the canvas starts in the sketch
FRAMES = 24
FRAME_MS = 80

# The sketch's colors.
ROBE = (207, 11, 233)
YELLOW = (251, 242, 54)
ORANGE = (223, 113, 38)
GREEN = (106, 190, 48)
GREEN_MID = (153, 229, 80)
GREEN_LIGHT = (189, 237, 143)
CROOK = (102, 57, 49)
GREY = (89, 86, 82)
GREY_LIGHT = (105, 106, 106)
SKIN = (238, 195, 154)
SKIN_DARK = (217, 160, 102)
# Shades of them for the details.
ROBE_SHADE = (168, 9, 192)
ROBE_LIGHT = (224, 84, 241)
CREASE = (176, 118, 78)

STAFF_FIRE = (0, 0, 31, 37)      # box of the staff's fire in the canvas
HAND_FIRE = (74, 24, 87, 37)     # box of the flame over the hand
FLAME_BASE = (21.5, 34)          # base of the green fire, on the gem
BALL = (80.5, 30.5)              # centre of the fireball
ASH_FROM = (81, 42)              # under the fingers
GROUND = 87                      # the robe's bottom row
SLEEVE_X = 56                    # the right sleeve, from this column on


def load(path):
    src = Image.open(path).convert("RGBA")
    return src.crop((ORIGIN[0], ORIGIN[1], ORIGIN[0] + W, ORIGIN[1] + H))


def in_box(x, y, box):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def fill_gaps(img):
    """Fills every transparent area the drawing closes. Returns the pixels
    filled with the robe's magenta."""
    px = img.load()
    outside, stack = set(), [(0, 0)]
    while stack:
        x, y = stack.pop()
        if (x, y) in outside or not (0 <= x < W and 0 <= y < H) or px[x, y][3]:
            continue
        outside.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    holes = {(x, y) for y in range(H) for x in range(W)
             if not px[x, y][3] and (x, y) not in outside}
    # group them, the big area is the robe
    regions, seen = [], set()
    for p in sorted(holes):
        if p in seen:
            continue
        region, stack = [], [p]
        while stack:
            q = stack.pop()
            if q in seen or q not in holes:
                continue
            seen.add(q)
            region.append(q)
            x, y = q
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        regions.append(region)
    robe = set()
    for region in regions:
        if len(region) > 30:
            for (x, y) in region:
                px[x, y] = ROBE + (255,)
            robe.update(region)
        else:
            for (x, y) in region:
                around = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                          if px[x + dx, y + dy][3]]
                px[x, y] = max(set(around), key=around.count)
                if px[x, y][:3] == ROBE:
                    robe.add((x, y))
    return robe


def robe_details(img):
    px = img.load()
    robe = {(x, y) for y in range(H) for x in range(W) if px[x, y][:3] == ROBE and px[x, y][3]}
    # shade on the lower and right edges of the silhouette
    for (x, y) in robe:
        if not px[min(W - 1, x + 1), y][3] or not px[x, min(H - 1, y + 1)][3]:
            px[x, y] = ROBE_SHADE + (255,)
    # folds from the belt to the hem, with a light thread beside each
    for x0, x1, y0 in ((50, 47, 64), (58, 58, 74), (66, 69, 70), (75, 77, 72)):
        for y in range(y0, GROUND - 1):
            x = round(x0 + (x1 - x0) * (y - y0) / (GROUND - y0))
            if (x, y) in robe and (x - 1, y) in robe and (y + x0) % 13:
                px[x, y] = ROBE_SHADE + (255,)
                if y > (y0 + GROUND) // 2:
                    px[x - 1, y] = ROBE_LIGHT + (255,)
    # a darker hem
    for (x, y) in robe:
        if y >= GROUND - 2:
            px[x, y] = ROBE_SHADE + (255,)


def older(img):
    px = img.load()
    for p in ((48, 36), (52, 36)):         # under the eyes
        if px[p][3]:
            px[p] = CREASE + (255,)
    for p in ((79, 40), (81, 40)):         # knuckles of the open hand
        if px[p][:3] == SKIN:
            px[p] = SKIN_DARK + (255,)


def base(path):
    img = load(path)
    px = img.load()
    # take out the still fires, they are drawn per frame
    for y in range(H):
        for x in range(W):
            c = px[x, y][:3]
            if in_box(x, y, STAFF_FIRE) and c in (GREEN, GREEN_MID, GREEN_LIGHT):
                px[x, y] = (0, 0, 0, 0)
            if in_box(x, y, HAND_FIRE) and c in (YELLOW, ORANGE, GREEN_LIGHT):
                px[x, y] = (0, 0, 0, 0)
    drawn = {(x, y) for y in range(H) for x in range(W) if px[x, y][3]}
    filled = fill_gaps(img)
    robe_details(img)
    # the sleeve's lower edge, so it still hangs over the robe once filled
    for x in range(SLEEVE_X, W):
        ys = [y for (dx, y) in drawn if dx == x and y < 64]
        if ys and (x, max(ys) + 1) in filled:
            px[x, max(ys) + 1] = ROBE_SHADE + (255,)
    older(img)
    return img


def flame(layer, cx, base_y, height, width, phase, pal, seed, sparks, rng_seed):
    """A teardrop flame that sways and flickers, in pal from the rim to the core."""
    px = layer.load()
    height *= 1 + 0.12 * math.sin(phase * 2 + seed) + 0.08 * math.sin(phase + 1.3 + seed)
    width *= 1 + 0.1 * math.sin(phase * 2 + 0.7 + seed)

    def inside(x, y, shrink):
        up = base_y - y
        if up < -2.5 + shrink or up > height - shrink * 1.6:
            return False
        t = min(1.0, max(0.0, up) / height)
        sway = (1.5 * math.sin(phase + t * 3.0 + seed) + 0.7 * math.sin(phase * 3 + t * 6 + seed)) * t
        if up < 0:
            half = width * math.sqrt(max(0.0, 1 - (up / 2.5) ** 2))
        else:
            half = width * (1 - t) ** 0.8 * (1 + 0.18 * math.sin(phase * 2 + t * 9 + seed))
        return half - shrink >= 0.5 and abs(x + 0.5 - (cx + sway)) <= half - shrink

    levels = [(1.8, 2), (0.9, 1), (0.0, 0)]
    for y in range(max(0, int(base_y - height - 2)), min(H, int(base_y + 4))):
        for x in range(max(0, int(cx - width - 4)), min(W, int(cx + width + 5))):
            for shrink, k in levels:
                if inside(x, y, shrink):
                    px[x, y] = pal[k] + (255,)
                    break
    rng = random.Random(rng_seed)
    for k in range(sparks):
        start, drift = rng.random(), rng.uniform(-3, 3)
        life = (phase / (2 * math.pi) + start) % 1.0
        y = round(base_y - height * 0.6 - life * 10)
        x = round(cx + drift * life + 1.2 * math.sin(phase + k * 2))
        if 0 <= x < W and 0 <= y < H and not px[x, y][3]:
            px[x, y] = pal[1 if life < 0.5 else 0] + (255,)


def staff_fire(img, phase):
    # Behind the crook and the gem, as in the drawing.
    layer = Image.new("RGBA", (W, H))
    flame(layer, FLAME_BASE[0], FLAME_BASE[1], 21, 4.6, phase,
          [GREEN, GREEN_MID, GREEN_LIGHT], 0.0, 4, 3)
    layer.alpha_composite(img)
    return layer


def fireball(img, phase):
    px = img.load()
    bob = math.sin(phase)
    cx, cy = BALL[0], BALL[1] + bob
    top = Image.new("RGBA", (W, H))
    flame(top, cx, cy - 1.5, 8, 2.8, phase * 2, [YELLOW, ORANGE, ORANGE], 1.7, 3, 9)
    img.alpha_composite(top)
    r = 3.6 + 0.3 * math.sin(phase * 3)
    for y in range(int(cy - 5), int(cy + 6)):
        for x in range(int(cx - 5), int(cx + 6)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r:
                px[x, y] = (YELLOW if d > r - 1.2 else ORANGE) + (255,)
    heart = 1.2 + 0.4 * math.sin(phase * 2)
    for y in range(int(cy - 2), int(cy + 3)):
        for x in range(int(cx - 2), int(cx + 3)):
            if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= heart:
                px[x, y] = GREEN_LIGHT + (255,)


# Ashes: (start in the loop, drift, speed, wobble) for each one.
ASHES = [(i / 14 + random.Random(i).uniform(0, 0.04), random.Random(i + 50).uniform(-3, 5),
          random.Random(i + 90).uniform(0.85, 1.15), random.Random(i + 130).choice((-1, 1)))
         for i in range(14)]


def ashes(img, f):
    px = img.load()
    for start, drift, speed, side in ASHES:
        life = (f / FRAMES + start) % 1.0
        # falls for 80% of its life, speeding up, then lies there and goes out
        t = min(1.0, life / 0.8 * speed)
        y = round(ASH_FROM[1] + (GROUND - ASH_FROM[1]) * t ** 1.4)
        x = round(ASH_FROM[0] + drift * t + side * 1.2 * math.sin(life * 14 + start * 6) * (1 - t * 0.5))
        if not (0 <= x < W and 0 <= y < H):
            continue
        if t < 1:
            c = (YELLOW if t < 0.12 else ORANGE if t < 0.4 else CROOK if t < 0.7 else GREY_LIGHT)
            px[x, y] = c + (255,)
        else:
            rest = (life - 0.8 / speed) / max(0.01, 1 - 0.8 / speed)
            if rest < 0.6:
                px[x, y] = (GREY_LIGHT if rest < 0.3 else GREY) + (255,)


def main():
    sketch, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    still = base(sketch)
    frames = []
    for f in range(FRAMES):
        phase = 2 * math.pi * f / FRAMES
        img = staff_fire(still.copy(), phase)
        fireball(img, phase)
        ashes(img, f)
        frames.append(img)
        img.save(os.path.join(out, f"{f}.png"))
    with open(os.path.join(out, "durations.txt"), "w") as fh:
        fh.write(" ".join([str(FRAME_MS)] * FRAMES))
    if "--preview" in sys.argv:
        path = sys.argv[sys.argv.index("--preview") + 1]
        big = []
        for img in frames:
            bg = Image.new("RGBA", (W, H), (58, 52, 46, 255))
            bg.alpha_composite(img)
            big.append(bg.resize((W * 4, H * 4), Image.NEAREST).convert("RGB"))
        big[0].save(path, save_all=True, append_images=big[1:], duration=FRAME_MS, loop=0)
    print(f"MagodeFuego: {FRAMES} frames of {W}x{H}")


if __name__ == "__main__":
    main()
