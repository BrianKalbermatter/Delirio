"""The three new enemies, each drawn once: the ghost (art/fantasma_original.png),
the spirit that throws (art/espiritu_original.png) and the skeleton that gets up
from the dead (art/esqueleto_original.png). This takes each picture back to its
real pixels, cuts it out and moves it. All three look left: the game mirrors them.

Usage: python3 art/espectros.py   (needs numpy and scipy)
Writes client/public/sprites/{fantasma,fantasma_tiro,espiritu,esqueleto,espiritu_tiro,
rueda,medusa,medusa_mini,flecha}.{png,json}.
Each stands on the bottom middle of its frame, on the shadow drawn there.
Tags: fantasma flota/ataca/aparece/muere, espiritu flota/lanza/aparece/muere,
esqueleto quieto/camina/prepara/salta/aterriza/levanta/muere, rueda quieto/camina/
prepara/manotazo/recupera/levanta/muere, espiritu_tiro and flecha vuela, fantasma_tiro
cae/estalla, medusa and medusa_mini quieto/camina/dispara/aparece/muere.
The attacks last what ATAQUE says in src/mecanicas/enemigos.c.
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
DROP_DARK = (14, 12, 20, 255)  # what the ghost throws
DROP_LIGHT = (214, 218, 232, 255)


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


def turned(rgba, degrees, pivot):
    """Turned around `pivot`, counterclockwise, on the same canvas."""
    img = Image.fromarray(np.ascontiguousarray(rgba), "RGBA")
    return np.asarray(img.rotate(degrees, resample=Image.NEAREST, center=pivot))


def cut_out(rgba, polygon):
    """Splits it in what is inside `polygon` ((x, y) px) and the rest."""
    mask = Image.new("1", (rgba.shape[1], rgba.shape[0]))
    ImageDraw.Draw(mask).polygon(polygon, fill=1)
    inside = np.asarray(mask)
    part, rest = rgba.copy(), rgba.copy()
    part[~inside] = 0
    rest[inside] = 0
    return part, rest


def stacked(layers):
    img = Image.fromarray(np.ascontiguousarray(layers[0]), "RGBA")
    for layer in layers[1:]:
        img.alpha_composite(Image.fromarray(np.ascontiguousarray(layer), "RGBA"))
    return np.asarray(img)


def squatting(rgba, hip, share):
    """The legs folded to `share` of their height, the rest coming down with them.
    Returns it and how many px the hip came down."""
    legs = rgba[hip:]
    folded = max(1, round(legs.shape[0] * share))
    out = np.zeros_like(rgba)
    down = legs.shape[0] - folded
    out[rgba.shape[0] - folded:] = np.asarray(Image.fromarray(legs, "RGBA").resize((legs.shape[1], folded), Image.NEAREST))
    out[down:hip + down] = rgba[:hip]
    return out, down


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
GHOST_ARM = [(42, 60), (58, 60), (58, 76), (42, 76)]  # on the padded drawing
GHOST_SHOULDER = (42, 62)
GHOST_HAND = (13, 7)  # from the shoulder, before raising it
# The throw, frame by frame: the arm goes up with something growing in the hand,
# lets it go up and out of sight, and comes down. It falls on the player later.
GHOST_RAISE = [15, 45, 75, 95, 100, 100, 55, 15]
GHOST_RISE = [0, 1, 3, 5, 6, 6, 3, 1]
GHOST_ORB = [1, 2, 3, 4, 4, 0, 0, 0]
GHOST_ORB_GONE = {5: 12, 6: 30}  # px over the hand at which it is seen leaving


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

    arm, armless = cut_out(body, GHOST_ARM)

    def throwing(step):
        phase = 2 * math.pi * step / GHOST_STEPS
        moved = shear(armless, lambda y: (1.6 * ((y - hem_from) / (height - hem_from)) * math.sin(phase + y * 0.3) if y > hem_from else 0)
                      + 3.0 * (GHOST_RAISE[step] / 100) * (1 - y / height))
        y = -GHOST_HOVER - GHOST_RISE[step]
        raised = turned(arm, GHOST_RAISE[step], GHOST_SHOULDER)
        flowing = np.roll(lines, -(step * 3) % height, axis=0)
        img = on_frame(GHOST_FRAME, [(flowing, 0, y), (raised, 0, y), (moved, 0, y)], 26, GHOST_RISE[step] // 2)
        # What it throws, in the hand and then on its way up
        t = math.radians(GHOST_RAISE[step])
        hand_x = GHOST_SHOULDER[0] + GHOST_HAND[0] * math.cos(t) + GHOST_HAND[1] * math.sin(t)
        hand_y = GHOST_SHOULDER[1] - GHOST_HAND[0] * math.sin(t) + GHOST_HAND[1] * math.cos(t)
        x = GHOST_FRAME[0] // 2 - body.shape[1] // 2 + hand_x
        top = GHOST_FRAME[1] - 3 - height + y + hand_y
        d = ImageDraw.Draw(img)
        radius = GHOST_ORB[step]
        if radius:
            d.ellipse((x - radius, top - radius - 2, x + radius, top + radius - 2), fill=DROP_DARK, outline=DROP_LIGHT)
        elif step in GHOST_ORB_GONE:
            up = top - GHOST_ORB_GONE[step]
            d.ellipse((x - 2, up - 3, x + 2, up + 3), fill=DROP_DARK, outline=DROP_LIGHT)
            d.line((x, up + 4, x, up + 12), fill=DROP_LIGHT)
        return img

    tags = {
        "flota": [drawn(s) for s in range(GHOST_STEPS)],
        "ataca": [throwing(s) for s in range(GHOST_STEPS)],
        "aparece": [drawn(s, 0, 1 - (s + 1) / GHOST_STEPS) for s in range(GHOST_STEPS)],
        "muere": [drawn(s, 0, (s + 1) / GHOST_STEPS) for s in range(GHOST_STEPS)],
    }
    write("fantasma", tags, GHOST_FRAME, {"flota": 120, "ataca": 80, "aparece": 90, "muere": 90})
    print("ghost", body.shape)


def dropped():
    """What the ghost lets fall on the player: a clot of the dark with a pale edge,
    and the splash on the floor. Both stand on the bottom middle of the frame."""
    size = (48, 36)
    cx, floor = size[0] // 2, size[1] - 4
    falling = []
    for step in range(4):
        img = Image.new("RGBA", size)
        d = ImageDraw.Draw(img)
        d.polygon([(cx, floor - 24), (cx - 5, floor - 8), (cx - 4, floor - 3), (cx + 4, floor - 3), (cx + 5, floor - 8)], fill=DROP_DARK)
        d.line((cx - 5, floor - 8, cx, floor - 24), fill=DROP_LIGHT)
        d.line((cx + 5, floor - 8, cx, floor - 24), fill=(120, 124, 140, 255))
        d.point((cx - 2 + step % 2, floor - 8), fill=DROP_LIGHT)
        d.point((cx + 1, floor - 6 - step % 2), fill=DROP_LIGHT)
        falling.append(img)
    splash = []
    for step in range(5):
        img = Image.new("RGBA", size)
        d = ImageDraw.Draw(img)
        wide, tall = 6 + step * 4, 2 + step
        fade = 255 - step * 45
        d.ellipse((cx - wide, floor - tall, cx + wide, floor + tall), fill=(16, 14, 22, fade), outline=(200, 205, 220, fade))
        rng = random.Random(step)
        for k in range(8):  # what flies off
            t = k * math.pi / 4 + rng.uniform(-0.3, 0.3)
            far = wide + 3
            x, y = cx + far * math.cos(t), floor - 3 - (step + 2) * abs(math.sin(t)) * 2 + (step * step) * 0.4
            d.point((round(x), round(y)), fill=DROP_LIGHT[:3] + (fade,))
        splash.append(img)
    write("fantasma_tiro", {"cae": falling, "estalla": splash}, size, {"cae": 70, "estalla": 60})


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
WHEEL_FRAME = (112, 92)
WHEEL_HIP = 0.7
WHEEL_OFFSET = (0, 0)
WHEEL_BOX = (10, 10, 160, 86)  # inside the picture's frame, in real pixels
WALK_STEPS = 8
ROOM = 28  # px around a body that turns, so it is not cut

# The skeleton's arms and shoulders, on the padded drawing.
BONES_ARMS = [
    ([(13, 23), (18, 23), (18, 38), (13, 38)], (17, 23)),
    ([(31, 23), (35, 23), (35, 38), (31, 38)], (31, 23)),
]
# The jump at the player: it folds with the arms back, flies head first with them
# ahead, and lands badly. Share of the legs, lean, arms, frame by frame.
CROUCH = [(0.85, 1, 20), (0.7, 2, 40), (0.58, 3, 55), (0.52, 3, 60)]
FLIGHT = [(38, 10), (56, 17), (66, 9)]  # how far it tips over and how high it goes
LANDING = [(0.5, -7, -35), (0.5, -7, -30), (0.62, -5, -20), (0.8, -3, -10), (0.95, -1, 0)]

# The wheel skeleton's free arm, in the picture, and its shoulder.
WHEEL_ARM = [(41, 12), (50, 15), (54, 20), (54, 39), (45, 39), (46, 30), (43, 22), (41, 18)]
WHEEL_SHOULDER = (43, 15)
# Its arm (0 hanging, turning forward and up) and lean (- forward), frame by frame.
WINDUP = [(-50, 1), (-95, 2), (-135, 3), (-160, 4)]
SLAPS = [(-125, 1), (-70, -5), (-35, -7), (-140, 0), (-75, -6), (-30, -8)]  # two: 150 and 420 ms in
WINDED = [(-20, -6), (-12, -4), (-5, -2), (0, -1)]


def skeleton():
    px = real_pixels("esqueleto_original.png", 4)
    r, g, b = (px[..., i].astype(int) for i in range(3))
    solid = (r + g + b < 300) | (r - b > 60)
    full = trimmed(np.dstack([px, solid * np.uint8(255)]))
    small = Image.fromarray(full, "RGBA")
    small = small.resize((round(small.width * BONES_SHRINK), round(small.height * BONES_SHRINK)), Image.NEAREST)
    walker("esqueleto", padded(np.asarray(small), 12), HIP, BONES_FRAME, 24, jump)


def roomy(rgba):
    return np.pad(rgba, ((ROOM, ROOM), (ROOM, ROOM), (0, 0)))


def jump(body, hip, size, shadow):
    """The skeleton's attack: `prepara`, `salta` and `aterriza`."""
    arms, torso = [], body
    for polygon, shoulder in BONES_ARMS:
        arm, torso = cut_out(torso, polygon)
        arms.append((roomy(arm), (shoulder[0] + ROOM, shoulder[1] + ROOM)))
    torso = roomy(torso)
    room_hip = hip + ROOM

    def folded(share, lean, arm_turn):
        low, down = squatting(torso[:-ROOM], room_hip, share)
        low = np.vstack([low, torso[-ROOM:]])
        low = shear(low, lambda y: lean * (1 - (y - ROOM) / hip) if y < room_hip + down else 0)
        layers = [low]
        for arm, shoulder in arms:
            at_shoulder = round(lean * (1 - (shoulder[1] - ROOM) / hip))
            moved = np.roll(np.roll(turned(arm, arm_turn, shoulder), down, axis=0), at_shoulder, axis=1)
            layers.append(moved)
        return on_frame(size, [(stacked(layers), 0, ROOM)], shadow)

    def flying(tip, lift):
        reaching = [turned(arm, -150, shoulder) for arm, shoulder in arms]
        legs = shear(torso, lambda y: 5 * max(0, y - room_hip) / (body.shape[0] - hip))
        whole = stacked([legs] + reaching)
        middle = (whole.shape[1] / 2, ROOM + body.shape[0] / 2)
        half = body.shape[0] // 2
        # Turned around its middle: what is drawn at the feet goes up by the turn
        return on_frame(size, [(turned(whole, tip, middle), 0, ROOM - lift - half // 3)], round(shadow * (1 - lift / 40)), lift // 3)

    tags = {
        "prepara": [folded(*pose) for pose in CROUCH],
        "salta": [flying(*pose) for pose in FLIGHT],
        "aterriza": [folded(*pose) for pose in LANDING],
    }
    return tags, {"prepara": 105, "salta": 100, "aterriza": 130}


def wheel():
    """The skeleton with a wheel of spikes on its back. Whatever is not as blue as
    the panel and its shadow is drawing."""
    px = real_pixels("rueda_original.png", 3, ox=WHEEL_OFFSET[0], oy=WHEEL_OFFSET[1])
    r, b = px[..., 0].astype(int), px[..., 2].astype(int)
    solid = r - b >= -6
    left, top, right, bottom = WHEEL_BOX
    box = np.zeros_like(solid)
    box[top:bottom, left:right] = True
    labels, n = ndimage.label(solid & box, structure=np.ones((3, 3)))
    biggest = 1 + int(np.argmax(ndimage.sum(solid & box, labels, range(1, n + 1))))
    drawing = trimmed(np.dstack([px, (labels == biggest) * np.uint8(255)]))
    arm, armless = cut_out(drawing, WHEEL_ARM)
    # In the picture the free arm is the far one: turned around, the wheel stays
    # on its back and the hand goes first
    body = padded(drawing[:, ::-1], 12)
    arm = roomy(padded(arm[:, ::-1], 12))
    armless = padded(armless[:, ::-1], 12)
    shoulder = (body.shape[1] - 1 - (WHEEL_SHOULDER[0] + 12) + ROOM, WHEEL_SHOULDER[1] + ROOM)
    walker("rueda", body, WHEEL_HIP, WHEEL_FRAME, 44, lambda *rest: slaps(armless, arm, shoulder, *rest))


def slaps(armless, arm, shoulder, body, hip, size, shadow):
    """The wheel skeleton's attack: stops, lifts the arm (`prepara`), gives two
    slaps (`manotazo`) and stands there out of breath (`recupera`)."""
    legs = armless.copy()
    legs[:hip] = 0
    top = armless.copy()
    top[hip:] = 0

    def posed(turn, lean):
        bent = shear(top, lambda y: lean * (1 - y / hip) if y < hip else 0)
        at_shoulder = round(lean * (1 - (shoulder[1] - ROOM) / hip))
        hand = np.roll(turned(arm, turn, shoulder), at_shoulder, axis=1)
        return on_frame(size, [(legs, 0, 0), (bent, 0, 0), (hand, 0, ROOM)], shadow)

    tags = {
        "prepara": [posed(*pose) for pose in WINDUP],
        "manotazo": [posed(*pose) for pose in SLAPS],
        "recupera": [posed(*pose) for pose in WINDED],
    }
    return tags, {"prepara": 95, "manotazo": 90, "recupera": 150}


def walker(name, body, hip_share, size, shadow, attack):
    """Quieto, camina, levanta, muere and `attack` for a body with two legs."""
    height, width = body.shape[:2]
    hip = int(height * hip_share)
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
        return on_frame(size, [(leg(left, swing), 0, 0), (leg(right, -swing), 0, 0), (lean, 0, bob)], shadow)

    def idle(step):
        sway = shear(top, lambda y: math.sin(step * math.pi / 2) * (1 - y / hip) if y < hip else 0)
        return on_frame(size, [(legs, 0, 0), (sway, 0, 0)], shadow)

    def rise(step, steps=10):
        up = (step + 1) / steps
        shown = round(height * up)
        part = np.zeros_like(body)
        part[height - shown:] = body[:shown]
        rng = random.Random(step)
        wobble = shear(part, lambda y: math.sin(step * 2.1) * 1.5 * (1 - up))
        img = on_frame(size, [(wobble, 0, 0)], round(shadow * up))
        d = ImageDraw.Draw(img)
        for _ in range(12):  # the dirt it pushes aside
            x = size[0] // 2 + rng.randint(-13, 13)
            y = size[1] - 3 + rng.randint(-2, 1)
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
        return on_frame(size, parts, shadow)

    tags = {
        "quieto": [idle(s) for s in range(4)],
        "camina": [walk(s) for s in range(WALK_STEPS)],
        "levanta": [rise(s) for s in range(10)],
        "muere": [fall(s) for s in range(9)],
    }
    strikes, strike_ms = attack(body, hip, size, shadow)
    tags.update(strikes)
    write(name, tags, size, {"quieto": 220, "camina": 110, "levanta": 110, "muere": 90, **strike_ms})
    print(name, body.shape, "bones", n)


# ---------------------------------------------------------------- Medusa

MEDUSA_STEPS = 8
# Where the arrow stands in the drawing, from the top, and the two sizes used:
# box in the picture (px), frame and name.
MEDUSAS = [
    ((78, 208, 231, 373), (72, 72), "medusa"),
    ((101, 83, 205, 195), (56, 52), "medusa_mini"),
]
ARROW_BACK = [0, 1, 2, 3, 3, -99, -99, -99]  # px it is pulled, -99: gone


def best_offset(image, grid):
    def spread(ox, oy):
        h, w = (image.shape[0] - oy) // grid, (image.shape[1] - ox) // grid
        cut = image[oy:oy + h * grid, ox:ox + w * grid].astype(float)
        return cut.reshape(h, grid, w, grid, 3).std(axis=(1, 3)).mean()

    return min(((ox, oy) for ox in range(grid) for oy in range(grid)), key=lambda o: spread(*o))


def medusa(box, size, name):
    image = np.asarray(Image.open(os.path.join(HERE, "medusa_original.png")).convert("RGB"))
    ox, oy = best_offset(image, 3)
    px = real_pixels("medusa_original.png", 3, ox=ox, oy=oy)
    left, top, right, bottom = ((v - o) // 3 for v, o in zip(box, (ox, oy, ox, oy)))
    part = px[top:bottom, left:right]
    solid = np.abs(part.astype(int) - background(px)).sum(2) > 30
    # She looks right in the picture: the game wants them all looking left
    rgba = trimmed(np.dstack([part, solid * np.uint8(255)]))[:, ::-1]
    height, width = rgba.shape[:2]
    r, g, b = (rgba[..., i].astype(int) for i in range(3))
    brown = (r > g) & (g > b) & (r < 150) & (rgba[..., 3] > 0)
    row = int(np.argmax(brown[:, :width * 3 // 4].sum(axis=1)))
    # The arrow: its row and the outline at each side, from the tip to the fletching
    arrow = np.zeros(rgba.shape[:2], bool)
    arrow[row - 1:row + 2] = rgba[row - 1:row + 2, :, 3] > 0
    cols = np.nonzero(brown[row])[0]
    arrow[:, :max(0, cols.min() - 3)] = False
    arrow[:, cols.max() + 4:] = False
    bare = rgba.copy()
    bare[arrow] = 0
    # What the arrow crossed goes on under it, where there is drawing at both sides
    for x in np.nonzero(arrow.any(axis=0))[0]:
        if rgba[row - 2, x, 3] and rgba[row + 2, x, 3]:
            bare[row - 1:row + 2, x] = rgba[row - 2, x]
    shaft = np.zeros_like(rgba)
    shaft[arrow] = rgba[arrow]
    body = padded(bare, 10)
    shaft = padded(shaft, 10)
    hair_to = height * 0.42
    tail_from = height * 0.68

    def pose(step, slither=1.0, back=0, lean=0.0):
        phase = 2 * math.pi * step / MEDUSA_STEPS

        def row_shift(y):
            hair = 1.2 * max(0.0, 1 - y / hair_to) * math.sin(phase + y * 0.4)
            tail = 2.0 * slither * max(0.0, (y - tail_from) / (height - tail_from)) * math.sin(phase * 2 + y * 0.5)
            return hair + tail + lean * (1 - y / height)

        moved = shear(body, row_shift)
        parts = [(moved, 0, 0)]
        if back > -50:
            parts.append((shear(shaft, row_shift), back, 0))  # pulled away from where it looks
        return parts

    def drawn(step, **kwargs):
        share = kwargs.pop("share", 0)
        parts = pose(step, **kwargs)
        if share:
            parts = [(dissolved(p, share, 21, round(share * 6)), x, y) for p, x, y in parts]
        return on_frame(size, parts, round(width * 0.6 * (1 - share)))

    tags = {
        "quieto": [drawn(s, slither=0.5) for s in range(MEDUSA_STEPS)],
        "camina": [drawn(s, slither=1.6) for s in range(MEDUSA_STEPS)],
        "dispara": [drawn(s, slither=0.3, back=ARROW_BACK[s], lean=-2.0 if ARROW_BACK[s] < 0 else 1.0) for s in range(MEDUSA_STEPS)],
        "aparece": [drawn(s, share=1 - (s + 1) / MEDUSA_STEPS) for s in range(MEDUSA_STEPS)],
        "muere": [drawn(s, share=(s + 1) / MEDUSA_STEPS) for s in range(MEDUSA_STEPS)],
    }
    write(name, tags, size, {"quieto": 130, "camina": 100, "dispara": 90, "aparece": 90, "muere": 110})
    print(name, rgba.shape, "arrow row", row)


def arrow():
    """What the Medusas shoot, flying right: the game turns it."""
    size = (20, 5)
    img = Image.new("RGBA", size)
    d = ImageDraw.Draw(img)
    d.line((3, 2, 16, 2), fill=(92, 58, 34, 255))
    d.line((3, 1, 15, 1), fill=(20, 14, 16, 255))
    d.line((3, 3, 15, 3), fill=(20, 14, 16, 255))
    d.polygon([(16, 0), (19, 2), (16, 4)], fill=(200, 208, 214, 255))
    d.line((0, 1, 3, 1), fill=(214, 96, 40, 255))
    d.line((0, 3, 3, 3), fill=(214, 96, 40, 255))
    write("flecha", {"vuela": [img]}, size, {"vuela": 100})


# ---------------------------------------------------------------- centaur

CENTAUR_GRID = 1080 / 186  # the picture is a little blurred
CENTAUR_BOX = (24, 26, 156, 154)  # left, top, right, bottom in real pixels, over the floor line
CENTAUR_FRAME = (272, 148)
CENTAUR_CANVAS = (256, 136)
SPEAR_FROM = 134  # real pixel: from this column on, the spear (and the hand on it)
BELLY = 0.72  # share of its height where the legs start
WAIST = 0.46  # and where the man starts
LEG_SPLITS = (0.32, 0.5, 0.67)  # share of its width between the four legs
LEG_PHASE = (0.0, 0.3, 0.5, 0.8)  # of the gallop, hind to fore
SPEAR_DOWN = [12, 38, 64, 90]  # degrees as it lowers it to charge


def centaur():
    px = real_pixels("centauro_original.png", CENTAUR_GRID, ox=2, oy=2)
    left, top, right, bottom = CENTAUR_BOX
    part = px[top:bottom, left:right]
    solid = np.abs(part.astype(int) - background(px)).sum(2) > 34
    r, b = part[..., 0].astype(int), part[..., 2].astype(int)
    rgba = np.dstack([part, solid * np.uint8(255)])
    cut_at = SPEAR_FROM - left
    spear = np.zeros_like(rgba)
    spear[:, cut_at:] = rgba[:, cut_at:]
    skin = r - b > 60
    spear[skin] = 0
    body = rgba.copy()
    body[:, cut_at:][~skin[:, cut_at:]] = 0
    height, width = body.shape[:2]
    waist, belly = int(height * WAIST), int(height * BELLY)
    hand = (cut_at + 7, int(height * 0.42))
    ox, oy = 30, CENTAUR_CANVAS[1] - height  # where the body goes on the canvas

    def placed(layer, dx=0):
        canvas = np.zeros((CENTAUR_CANVAS[1], CENTAUR_CANVAS[0], 4), np.uint8)
        canvas[oy:oy + height, ox + dx:ox + dx + width] = layer
        return canvas

    upper = body.copy()
    upper[belly + 2:] = 0
    splits = [0] + [int(width * s) for s in LEG_SPLITS] + [width]
    legs = []
    for i in range(4):
        leg = body.copy()
        leg[:belly] = 0
        leg[:, :splits[i]] = 0
        leg[:, splits[i + 1]:] = 0
        legs.append(leg)

    def spear_at(angle, lean):
        img = Image.fromarray(np.ascontiguousarray(placed(spear)), "RGBA")
        centre = (ox + hand[0], oy + hand[1])
        turned = img.rotate(-angle, resample=Image.NEAREST, center=centre)
        if angle >= 80:  # held by a third of its length: more of it ahead
            moved = Image.new("RGBA", img.size)
            moved.alpha_composite(turned.crop((0, 0, img.width - 26, img.height)), (26, 0))
            turned = moved
        return shear(np.asarray(turned), lambda y: lean)

    def pose(step, steps, stride, lean=0, bob=0, spear_angle=0):
        phase = 2 * math.pi * step / steps
        layers = [spear_at(spear_angle, lean)]
        for leg, offset in zip(legs, LEG_PHASE):
            swing = stride * math.sin(phase + offset * 2 * math.pi)
            moved = shear(leg, lambda y: swing * max(0, y - belly) / (height - belly))
            lift = round(max(0, -swing) * 0.3)
            layers.append(placed(np.roll(moved, -lift, axis=0)))
        torso = shear(upper, lambda y: lean * (1 - y / waist) if y < waist else 0)
        layers.append(np.roll(placed(torso), -bob, axis=0))
        img = Image.new("RGBA", (CENTAUR_CANVAS[0], CENTAUR_CANVAS[1]))
        for layer in layers:
            img.alpha_composite(Image.fromarray(np.ascontiguousarray(layer), "RGBA"))
        return np.asarray(img)[:, ::-1]  # it looks right in the picture

    def framed(canvas, share=0.0):
        canvas = dissolved(canvas, share, 31, 0) if share else canvas
        return on_frame(CENTAUR_FRAME, [(canvas, 0, 0)], round(100 * (1 - share)))

    tags = {
        "quieto": [framed(pose(s, 6, 0, bob=round(math.sin(s * math.pi / 3)))) for s in range(6)],
        "camina": [framed(pose(s, 8, 5, bob=abs(round(math.sin(s * math.pi / 4))))) for s in range(8)],
        "prepara": [framed(pose(0, 4, 0, lean=-3 + s, spear_angle=SPEAR_DOWN[s])) for s in range(4)],
        "embiste": [framed(pose(s, 6, 12, lean=7, bob=2 * (s % 2), spear_angle=90)) for s in range(6)],
        "muere": [framed(pose(0, 8, 0), (s + 1) / 8) for s in range(8)],
    }
    write("centauro", tags, CENTAUR_FRAME, {"quieto": 160, "camina": 110, "prepara": 140, "embiste": 70, "muere": 120})
    print("centauro", rgba.shape)


if __name__ == "__main__":
    ghost()
    dropped()
    spirit()
    thrown()
    skeleton()
    wheel()
    for box, size, name in MEDUSAS:
        medusa(box, size, name)
    arrow()
    centaur()
