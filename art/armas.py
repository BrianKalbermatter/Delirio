"""Weapons for Personaje_2: carrying one, picking it up from the floor and
swinging it with a speed smear. Every weapon in WEAPONS follows one pattern.

THE HAND RULE. The left views (left, down_left, up_left, and the rolls to the
left) are mirrors of the right ones, so a mirror swaps the hands: the hand that
holds the sword on the right is the shield hand on the left. To keep the
weapon in the SAME hand of the character when it turns, the weapon goes in:
- right, down_right, front, back, up_right: the sword hand (layer
  mano_espada_agarre, yellow anchor)
- left, down_left, up_left: the shield hand (layer mano_escudo_agarre, green
  anchor)
That hand is on the far side of the body in left, up_left, up_right and back,
so there the weapon is drawn behind the body. And the weapon stays on the same
side of the screen as the turn goes on: its head to the viewer's right in
right, down_right, front, down_left and left, to the left in back, up_left and
up_right (where that hand is on the viewer's left).

OUTPUT (client/public):
- sprites/personaje_2: the body without weapon, every animation plus the
  weapon ones (attack_<view>, pickup_<side>). Weapon-agnostic.
- sprites/personaje_2_armado: the same frames with the holding hand gripping
  (by the hand rule).
- sprites/personaje_2_arma.json: per frame, where the hand holds the weapon:
  [x, y, mirrored, behind] or null. mirrored = draw the weapon flipped (its
  head to the viewer's right).
- per weapon <id>: sprites/<id>_fx (drawn in front of the body) and
  sprites/<id>_fx_atras (behind it), 128x128 overlays with the weapon, the
  hand and the smear for the weapon animations (same tags and frames as the
  body; the body canvas sits at (32, 32)). And assets/<id>: frame 0 lying on
  the floor (also the inventory icon), frame 1 as drawn, to carry.
The overlays are apart from the body so the eye glow never lights the weapon.

ADDING A WEAPON: draw it in Aseprite like Hacha.aseprite (head up, held by the
handle), add it to WEAPONS with its grip, the direction of its head and the
side its edge faces, add it to ITEMS in client/src/domain/items.ts with the
same `weapon` grip, and run bash art/armas_build.sh.

Usage: python3 armas.py <exports_dir> <client/public>
"""
import json
import math
import sys

from PIL import Image

# grip: pixel the hand holds. angle: direction grip -> head, degrees clockwise
# from straight up. edge: side of the head the edge faces, as drawn ("ccw" or
# "cw"). scale: drawn size (1 = as in Aseprite). The swings go clockwise, so
# they draw the weapon with its edge on the clockwise side (mirroring it when needed): the edge leads, not the back.
WEAPONS = [
    {"id": "hacha", "aseprite": "Hacha.aseprite", "grip": (30, 40), "angle": -45, "edge": "ccw", "scale": 0.6},
    # Brian's torch (sprites/Objetos/Antorcha.aseprite): straight handle, flame on top.
    {"id": "antorcha", "aseprite": "..\\Objetos\\Antorcha.aseprite", "grip": (23, 40), "angle": 0, "edge": "ccw",
     "scale": 0.9, "carry_w": 150},
]

CELL_W, CELL_H = 64, 96
FX = 128  # overlay frame size
FX_OFFSET = (32, 32)  # body canvas inside the overlay frame
COLUMNS = 16

HAND = (205, 104, 61)  # #cd683d, the tentacle colour of the body
HAND_DARK = (122, 48, 69)  # #7a3045
SMEAR = [(205, 104, 61), (251, 185, 84), (242, 236, 139)]  # inner -> outer edge

MIRRORED_VIEWS = ("left", "down_left", "up_left")
FAR_HAND_VIEWS = ("left", "up_left", "up_right", "back")
HEAD_RIGHT_VIEWS = ("right", "down_right", "front", "down_left", "left")

TORSO_SPLIT = 64  # rows above this are the torso, which leans and crouches
IDLE_RIGHT, IDLE_FRONT, IDLE_BACK = 6, 0, 18  # first frame of each idle
# Where the arms leave the torso, facing right: the sword hand in front, the
# shield hand behind.
SHOULDER_NEAR = (30, 51)
SHOULDER_FAR = (22, 51)
SHOULDER_FRONT = (33, 48)  # facing the camera the sword hand is on the viewer's right
# Facing away the sword hand is on the viewer's left: the back swing is built on
# the mirrored body (hand on the right, like the front) and mirrored back.
SHOULDER_BACK = (63 - 19, 48)

# The swings, facing right. torso = (dx, dy) of the torso; hand = grip point;
# angle = weapon head direction; smear = (from, to) angles swept this frame;
# behind = weapon and arm behind the body this frame. Every attack has the same
# timing, so one playback speed fits all of them.
ATTACK_MS = [60, 70, 40, 40, 60, 70, 50, 60]


def steps(ms, rows):
    keys = ("torso", "hand", "angle", "smear", "behind")
    return [{"ms": m, **dict(zip(keys, r))} for m, r in zip(ms, rows)]


# With the near hand (attack_right; mirrored, the near hand of the shield side
# would be the wrong hand, so attack_left uses ATTACK_FAR).
ATTACK_NEAR = steps(ATTACK_MS, [
    ((-1, 0), (27, 50), -30, None, False),
    ((-2, -1), (25, 47), -75, None, False),
    ((1, 0), (33, 48), 20, (-70, 20), False),
    ((2, 1), (38, 53), 85, (-40, 85), False),
    ((3, 2), (40, 59), 130, (10, 130), False),
    ((2, 1), (39, 60), 140, (80, 140, "fade"), False),
    ((1, 0), (37, 59), 70, None, False),
    ((0, 0), (36, 58), 45, None, False),  # the carry pose of idle_right
])
# With the far hand: it winds up behind the back, the swing comes round to the
# front and follows through, back behind the body to the carry pose (head up
# and back, which mirrored is up and to the viewer's right). Built facing right
# and mirrored into attack_left.
ATTACK_FAR = steps(ATTACK_MS, [
    ((-1, 0), (19, 50), -30, None, True),
    ((-2, -1), (16, 47), -75, None, True),
    ((1, 0), (28, 47), 20, (-70, 20), False),
    ((2, 1), (36, 52), 85, (-40, 85), False),
    ((3, 2), (40, 58), 130, (10, 130), False),
    ((2, 1), (38, 60), 140, (80, 140, "fade"), False),
    ((1, 0), (30, 61), 230, None, True),
    ((0, 0), (26, 60), 315, None, True),  # idle_left's carry pose, mirrored
])
# Facing the camera: a diagonal chop from over the head down to the left foot.
ATTACK_FRONT = steps(ATTACK_MS, [
    ((0, -1), (37, 45), 15, None, False),
    ((0, -2), (36, 39), -25, None, False),
    ((0, 0), (37, 45), 60, (-25, 60), False),
    ((0, 1), (33, 53), 140, (0, 140), False),
    ((0, 2), (28, 59), 200, (40, 200), False),
    ((0, 1), (27, 60), 210, (130, 210, "fade"), False),
    ((0, 0), (36, 57), 90, None, False),
    ((0, 0), (39, 58), 50, None, False),  # back to the carry pose
])
# Facing away: the same chop on the mirrored body, moved to its shoulder, all
# of it behind the body: it hits away from the camera.
BACK_SHIFT = SHOULDER_BACK[0] - SHOULDER_FRONT[0]
ATTACK_BACK = [{**s, "hand": (s["hand"][0] + BACK_SHIFT, s["hand"][1]), "behind": True} for s in ATTACK_FRONT]

ATTACK_FAR[-1]["carry"] = True

FLOOR_GRIP = (40, 78)  # grip of the weapon lying in front of the feet
PICKUP_MS = [110, 110, 130, 110, 90, 90, 160]
PICKUP_NEAR = steps(PICKUP_MS, [
    ((1, 0), None, 90, None, False),
    ((2, 3), None, 90, None, False),
    ((3, 5), FLOOR_GRIP, 90, None, False),
    ((3, 5), FLOOR_GRIP, 95, None, False),
    ((2, 3), (40, 66), 80, None, False),
    ((1, 1), (38, 60), 60, None, False),
    ((0, -1), (36, 57), 40, None, False),
])
PICKUP_FAR = steps(PICKUP_MS, [
    ((1, 0), None, 90, None, False),
    ((2, 3), None, 90, None, False),
    ((3, 5), FLOOR_GRIP, 90, None, False),
    ((3, 5), FLOOR_GRIP, 95, None, False),
    ((2, 3), (36, 66), 80, None, False),
    ((1, 1), (30, 61), 10, None, True),
    ((0, -1), (26, 59), -45, None, True),  # idle_left's carry pose, mirrored
])
PICKUP_FAR[-1]["carry"] = True


def scale2x(img):
    """EPX: doubles the size keeping hard pixel edges (the base of RotSprite)."""
    w, h = img.size
    src = img.load()
    out = Image.new("RGBA", (w * 2, h * 2))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            a = src[x, y - 1] if y > 0 else p
            b = src[x + 1, y] if x < w - 1 else p
            c = src[x - 1, y] if x > 0 else p
            d = src[x, y + 1] if y < h - 1 else p
            dst[2 * x, 2 * y] = a if c == a and c != d and a != b else p
            dst[2 * x + 1, 2 * y] = b if a == b and a != c and b != d else p
            dst[2 * x, 2 * y + 1] = c if d == c and d != b and c != a else p
            dst[2 * x + 1, 2 * y + 1] = d if b == d and b != a and d != c else p
    return out


class Weapon:
    def __init__(self, spec, path):
        self.id = spec["id"]
        self.grip = spec["grip"]
        self.scale = spec.get("scale", 1.0)
        # Angle of the arm's plane it is carried at (personaje_3_build.CARRY_W
        # when not given): 0 points the head down, 180 up.
        self.carry_w = spec.get("carry_w", 55)
        self.img = Image.open(path).convert("RGBA")
        w = self.img.width
        mirrored = self.img.transpose(Image.FLIP_LEFT_RIGHT)
        as_drawn = (self.upscale(self.img), self.grip, spec["angle"])
        flipped = (self.upscale(mirrored), (w - 1 - self.grip[0], self.grip[1]), -spec["angle"])
        # The variant with the edge on the clockwise side, for the swings.
        self.swing = flipped if spec["edge"] == "ccw" else as_drawn
        # The one the far-hand animations end on: mirrored into the left view it
        # is the carried weapon exactly, so the edge does not jump sides.
        self.carry = as_drawn if spec["edge"] == "ccw" else flipped
        h = self.img.height
        far = max(math.hypot(x - self.grip[0], y - self.grip[1]) for x in (0, w) for y in (0, h))
        self.radius = int(far * self.scale) + 2
        self.reach = self.scale * max(
            math.hypot(x - self.grip[0], y - self.grip[1])
            for y in range(h)
            for x in range(w)
            if self.img.getpixel((x, y))[3]
        )

    @staticmethod
    def upscale(img):
        for _ in range(3):
            img = scale2x(img)
        return img

    def paste(self, dst, at, angle, carry=False):
        """Draws the weapon on `dst` with its grip on `at` and its head pointing
        `angle` degrees clockwise from up, at its scale. Sampled from the 8x
        upscale."""
        big_img, grip, base = self.carry if carry else self.swing
        big = big_img.load()
        theta = math.radians(angle - base)
        cos, sin = math.cos(theta), math.sin(theta)
        px = dst.load()
        bw, bh = big_img.size
        for y in range(at[1] - self.radius, at[1] + self.radius):
            for x in range(at[0] - self.radius, at[0] + self.radius):
                if not (0 <= x < dst.width and 0 <= y < dst.height):
                    continue
                dx, dy = (x + 0.5 - at[0]) / self.scale, (y + 0.5 - at[1]) / self.scale
                sx = grip[0] + 0.5 + dx * cos + dy * sin
                sy = grip[1] + 0.5 - dx * sin + dy * cos
                bx, by = int(sx * 8), int(sy * 8)
                if 0 <= bx < bw and 0 <= by < bh and big[bx, by][3]:
                    px[x, y] = big[bx, by]


def line(img, a, b, color, shade=None):
    """Bresenham line; `shade` goes one pixel under it (a 2 px tentacle)."""
    px = img.load()
    (x0, y0), (x1, y1) = a, b
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        if shade and 0 <= x0 < img.width and 0 <= y0 + 1 < img.height and not px[x0, y0 + 1][3]:
            px[x0, y0 + 1] = shade + (255,)
        if 0 <= x0 < img.width and 0 <= y0 < img.height:
            px[x0, y0] = color + (255,)
        if (x0, y0) == (x1, y1):
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def hand(img, at):
    px = img.load()
    x, y = at
    for hx, hy, color in ((0, 0, HAND), (-1, 0, HAND), (0, -1, HAND), (-1, 1, HAND_DARK), (0, 1, HAND_DARK)):
        if 0 <= x + hx < img.width and 0 <= y + hy < img.height:
            px[x + hx, y + hy] = color + (255,)


def smear(img, pivot, start, end, r_in, r_out, fade):
    """A crescent swept from angle `start` to `end` around `pivot`: thin and
    broken at the trailing end, full and bright at the leading one."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            dx, dy = x + 0.5 - pivot[0], y + 0.5 - pivot[1]
            rho = math.hypot(dx, dy)
            if rho > r_out or rho < r_in:
                continue
            phi = math.degrees(math.atan2(dx, -dy))
            while phi < start - 180:
                phi += 360
            while phi > start + 180:
                phi -= 360
            if not start <= phi <= end:
                continue
            t = (phi - start) / (end - start)  # 0 trailing, 1 leading
            if fade:
                t *= 0.55
            inner = r_out - (r_out - r_in) * t**0.8
            if rho < inner:
                continue
            depth = (r_out - rho) / max(1.0, r_out - inner)  # 0 outer edge, 1 inner edge
            if t < 0.35 and (x + y) % 2 == 0:
                continue  # dithered tail
            if fade and (x * 3 + y) % 3 == 0:
                continue
            band = 2 if depth < 0.2 else 1 if depth < 0.6 else 0
            px[x, y] = SMEAR[band] + (255,)


def cell(sheet, frames, i):
    r = frames[i]["frame"]
    return sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))


def body_frame(base, torso):
    """The idle body with its torso moved by `torso` (lean, crouch)."""
    out = Image.new("RGBA", (CELL_W, CELL_H))
    out.alpha_composite(base.crop((0, TORSO_SPLIT, CELL_W, CELL_H)), (0, TORSO_SPLIT))
    out.alpha_composite(base.crop((0, 0, CELL_W, TORSO_SPLIT)), torso)
    return out


def body_animation(plan, base, shoulder_at):
    """Body frames: the torso pose and the arm when it is in front."""
    bodies = []
    for step in plan:
        body = body_frame(base, step["torso"])
        shoulder = (shoulder_at[0] + step["torso"][0], shoulder_at[1] + step["torso"][1])
        if not step["behind"]:
            line(body, shoulder, arm_end(step, shoulder), HAND, HAND_DARK)
        bodies.append(body)
    return bodies


def arm_end(step, shoulder):
    if step["hand"] is None:  # still reaching for the weapon on the floor
        return (shoulder[0] + 4, shoulder[1] + 9 + step["torso"][1])
    return step["hand"]


def weapon_animation(plan, weapon, shoulder_at):
    """Overlay frames (front, behind): the weapon, the hand, the smear, and the
    arm when it is behind the body."""
    fronts, backs = [], []
    ox, oy = FX_OFFSET
    for step in plan:
        front = Image.new("RGBA", (FX, FX))
        back = Image.new("RGBA", (FX, FX))
        layer = back if step["behind"] else front
        shoulder = (shoulder_at[0] + step["torso"][0] + ox, shoulder_at[1] + step["torso"][1] + oy)
        end = arm_end(step, (shoulder[0] - ox, shoulder[1] - oy))
        end = (end[0] + ox, end[1] + oy)
        if step["behind"]:
            line(back, shoulder, end, HAND, HAND_DARK)
        if step["hand"] is None:
            weapon.paste(front, (FLOOR_GRIP[0] + ox, FLOOR_GRIP[1] + oy), step["angle"])
        else:
            if step["smear"]:
                start, stop, *fade = step["smear"]
                smear(layer, shoulder, start, stop, weapon.reach * 0.45, weapon.reach + 1, bool(fade))
            weapon.paste(layer, end, step["angle"], step.get("carry", False))
        hand(layer, end)
        fronts.append(front)
        backs.append(back)
    return fronts, backs


def mirror(images):
    return [img.transpose(Image.FLIP_LEFT_RIGHT) for img in images]


# Every weapon animation: tag, plan, idle frame of the body, shoulder, mirrored
# (built facing right and flipped).
ANIMATIONS = [
    ("attack_right", ATTACK_NEAR, IDLE_RIGHT, SHOULDER_NEAR, False),
    ("attack_left", ATTACK_FAR, IDLE_RIGHT, SHOULDER_FAR, True),
    ("pickup_right", PICKUP_NEAR, IDLE_RIGHT, SHOULDER_NEAR, False),
    ("pickup_left", PICKUP_FAR, IDLE_RIGHT, SHOULDER_FAR, True),
    ("attack_front", ATTACK_FRONT, IDLE_FRONT, SHOULDER_FRONT, False),
    ("attack_back", ATTACK_BACK, IDLE_BACK, SHOULDER_BACK, "built_mirrored"),
]


def base_for(images, frames, idle, mirrored):
    base = cell(images, frames, idle)
    return base.transpose(Image.FLIP_LEFT_RIGHT) if mirrored == "built_mirrored" else base


def write_sheet(path, cells, cell_w, cell_h, columns, durations, tags, name):
    rows = -(-len(cells) // columns)
    sheet = Image.new("RGBA", (columns * cell_w, rows * cell_h))
    frames = []
    for i, img in enumerate(cells):
        x, y = (i % columns) * cell_w, (i // columns) * cell_h
        sheet.paste(img, (x, y))
        frames.append(
            {
                "filename": f"{name} {i}",
                "frame": {"x": x, "y": y, "w": cell_w, "h": cell_h},
                "rotated": False,
                "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": cell_w, "h": cell_h},
                "sourceSize": {"w": cell_w, "h": cell_h},
                "duration": durations[i],
            }
        )
    sheet.save(f"{path}.png")
    meta = {
        "app": "art/armas.py",
        "image": f"{path.rsplit('/', 1)[-1]}.png",
        "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height},
        "scale": "1",
        "frameTags": [{"name": n, "from": a, "to": b, "direction": "forward"} for n, a, b in tags],
    }
    with open(f"{path}.json", "w") as f:
        json.dump({"frames": frames, "meta": meta}, f, indent=1)


def inventory_icon(weapon, angle_deg, spec_angle):
    """The weapon at full size, its head pointing `angle_deg` (clockwise from
    up), cropped to its pixels: the inventory shows it big and on a diagonal.
    Rotated at 8x and sampled back down, so the pixels stay clean."""
    big = Weapon.upscale(weapon.img)
    turned = big.rotate(spec_angle - angle_deg, resample=Image.NEAREST, expand=True)
    small = turned.resize((turned.width // 8, turned.height // 8), Image.NEAREST)
    return small.crop(small.getchannel("A").getbbox())


ICON_ANGLE = 45  # head up and to the right


def item_sheet(weapon, path, spec_angle):
    """Frame 0: lying on the floor. Frame 1: as drawn, to carry. Frame 2: the
    inventory icon, big and on a diagonal."""
    size = 96
    lying = Image.new("RGBA", (size, size))
    weapon.paste(lying, (size // 2 + 12, size // 2), -90)
    lying = lying.crop(lying.getchannel("A").getbbox())
    held = weapon.img
    diagonal = inventory_icon(weapon, ICON_ANGLE, spec_angle)
    w = max(lying.width, held.width, diagonal.width)
    h = max(lying.height, held.height, diagonal.height)
    floor = Image.new("RGBA", (w, h))
    floor.alpha_composite(lying, ((w - lying.width) // 2, h - lying.height))  # rests on the floor
    carried = Image.new("RGBA", (w, h))
    carried.alpha_composite(held, (0, 0))  # as drawn: the grip stays where it was drawn
    icon = Image.new("RGBA", (w, h))
    icon.alpha_composite(diagonal, ((w - diagonal.width) // 2, (h - diagonal.height) // 2))
    write_sheet(path, [floor, carried, icon], w, h, 3, [100, 100, 100], [], weapon.id)


def view_of(tag):
    for view in ("down_right", "down_left", "up_right", "up_left", "right", "left", "front", "back"):
        if tag.endswith(f"_{view}"):
            return view
    return "front"  # death


def hold_points(free, anchors):
    """Per frame of the existing animations: the grip by the hand rule
    (x, y, mirrored, behind), and whether that hand's layer is the shield one."""
    view_by_frame = {}
    # Widest tags first, so a narrower tag over the same frames wins (in the
    # source roll_end_left also spans the death frames).
    for t in sorted(free["meta"]["frameTags"], key=lambda t: t["from"] - t["to"]):
        for i in range(t["from"], t["to"] + 1):
            view_by_frame[i] = view_of(t["name"])
    points, shield = [], []
    for i, (sx, sy, gx, gy) in enumerate(anchors):
        view = view_by_frame.get(i, "front")
        use_shield = view in MIRRORED_VIEWS
        x, y = (gx, gy) if use_shield else (sx, sy)
        shield.append(use_shield)
        points.append(None if x < 0 else (x, y, view in HEAD_RIGHT_VIEWS, view in FAR_HAND_VIEWS))
    return points, shield


def main(exports, public):
    free = json.load(open(f"{exports}/p2_free.json"))
    free_img = Image.open(f"{exports}/p2_free.png").convert("RGBA")
    sword_img = Image.open(f"{exports}/p2_armed.png").convert("RGBA")
    shield_img = Image.open(f"{exports}/p2_armed_shield.png").convert("RGBA")
    body_near = Image.open(f"{exports}/L_cuerpo.png").convert("RGBA")
    body_far = body_near.copy()
    # The hand that does not swing stays as it is: the free one of the other side.
    body_near.alpha_composite(Image.open(f"{exports}/L_mano_escudo_libre.png").convert("RGBA"))
    body_far.alpha_composite(Image.open(f"{exports}/L_mano_espada_libre.png").convert("RGBA"))
    frames = free["frames"]
    first = len(frames)

    points, shield = hold_points(free, json.load(open(f"{exports}/p2_anchors.json")))

    new_bodies, new_ms, new_tags = [], [], []
    for tag, plan, idle, shoulder, mirrored in ANIMATIONS:
        base = base_for(body_far if shoulder == SHOULDER_FAR else body_near, frames, idle, mirrored)
        bodies = body_animation(plan, base, shoulder)
        if mirrored:
            bodies = mirror(bodies)
        new_tags.append((tag, first + len(new_bodies), first + len(new_bodies) + len(bodies) - 1))
        new_bodies += bodies
        new_ms += [s["ms"] for s in plan]

    old_tags = [(t["name"], t["from"], t["to"]) for t in free["meta"]["frameTags"]]
    tags = old_tags + new_tags
    durations = [f["duration"] for f in frames] + new_ms
    write_sheet(f"{public}/sprites/personaje_2", [cell(free_img, frames, i) for i in range(first)] + new_bodies,
                CELL_W, CELL_H, COLUMNS, durations, tags, "personaje_2")
    armed = [cell(shield_img if shield[i] else sword_img, frames, i) for i in range(first)]
    write_sheet(f"{public}/sprites/personaje_2_armado", armed + new_bodies,
                CELL_W, CELL_H, COLUMNS, durations, tags, "personaje_2_armado")

    holds = [None if p is None else list(p) for p in points] + [None] * len(new_bodies)
    with open(f"{public}/sprites/personaje_2_arma.json", "w") as f:
        json.dump({"note": "per frame of personaje_2: [x, y, mirrored, behind] of the weapon grip, or null (see art/armas.py)",
                   "hold": holds}, f)

    fx_tags = [(n, a - first, b - first) for n, a, b in new_tags]
    for spec in WEAPONS:
        weapon = Weapon(spec, f"{exports}/{spec['id']}.png")
        fronts, backs = [], []
        for tag, plan, idle, shoulder, mirrored in ANIMATIONS:
            f, b = weapon_animation(plan, weapon, shoulder)
            if mirrored:
                f, b = mirror(f), mirror(b)
            fronts += f
            backs += b
        write_sheet(f"{public}/sprites/{weapon.id}_fx", fronts, FX, FX, 8, new_ms, fx_tags, f"{weapon.id}_fx")
        write_sheet(f"{public}/sprites/{weapon.id}_fx_atras", backs, FX, FX, 8, new_ms, fx_tags, f"{weapon.id}_fx_atras")
        item_sheet(weapon, f"{public}/assets/{weapon.id}", spec["angle"])
        print(f"{weapon.id}: reach {weapon.reach:.1f}")
    print(f"frames {first} + {len(new_bodies)}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
