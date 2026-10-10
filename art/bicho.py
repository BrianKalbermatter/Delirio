"""Skull-cluster crawler enemy ("bicho"): a mass of skulls on four bone legs.

Usage: python3 bicho.py <out_dir> [--preview <file.png>]
Writes one PNG per layer (Sombra, Bicho) and frame: <out_dir>/<layer>_<n>.png,
plus tags.txt ("name from to" per line, 0-based) and durations.txt (ms per
frame). bicho_aseprite.lua assembles them into Bicho_Anim.aseprite.

The frame layout copies Personaje_2_Anim (263 frames of 64x96, same tags and
durations) so the game can drive the enemy with the player's animator:
idle/walk/run in 8 directions, roll (the bug curls into a rolling ball) to the
right and left, and death (the skulls fall apart).

The creature is modelled in 3D (forward, left, up) and projected in the game's
three-quarter view, so every direction is drawn from the same body.
"""
import math
import os
import sys

from PIL import Image

FW, FH = 64, 96
CX, BASE_Y = 32, 84          # feet line, same as the player sprite

# Palette taken from the reference: warm bone, purple-black gaps, teal maw,
# acid green eyes.
OUTLINE = (34, 18, 28)
GAP = (64, 30, 44)
BONE = [(118, 72, 70), (166, 114, 98), (210, 164, 136), (236, 204, 172),
        (252, 234, 212)]
LEG = [(70, 38, 44), (106, 62, 60), (150, 100, 86), (196, 150, 124)]
MAW = [(22, 12, 24), (20, 66, 62), (34, 116, 100), (66, 172, 138),
       (132, 222, 178)]
EYE = [(36, 70, 30), (110, 210, 50), (196, 255, 96)]
BLOOD = [(92, 22, 32), (136, 36, 42)]
FLESH = [(64, 30, 44), (96, 46, 58), (122, 64, 72)]
SHADOW = (0, 0, 0, 80)

# Frame layout of Personaje_2_Anim: (tag, frames, ms per frame).
DIRS = ["front", "right", "left", "back",
        "down_right", "down_left", "up_right", "up_left"]
WALK_DIRS = ["right", "left", "back", "front",
             "down_right", "down_left", "up_right", "up_left"]
LAYOUT = ([(f"idle_{d}", 6, 150) for d in DIRS]
          + [(f"walk_{d}", 8, 110) for d in WALK_DIRS]
          + [(f"run_{d}", 8, 80) for d in WALK_DIRS]
          + [("roll_start_right", 11, 70), ("roll_right", 8, 60),
             ("roll_end_right", 8, 70), ("roll_start_left", 11, 70),
             ("roll_left", 8, 60), ("roll_end_left", 8, 70),
             ("death", 33, 80)])

# Facing angle in the world plane (x right, y away from the camera).
ANGLE = {"right": 0, "up_right": 45, "back": 90, "up_left": 135, "left": 180,
         "down_left": 225, "front": 270, "down_right": 315}

CORE_Z = 19
# Skulls around the core: (forward, left, up) offset from the core and radius.
SKULLS = [
    (0, 0, 9, 7), (-6, 0, 7, 6), (4, 6, 6, 6), (4, -6, 6, 6), (9, 0, 2, 5),
    (7, 8, -1, 5), (7, -8, -1, 5), (0, 9, 1, 6), (0, -9, 1, 6),
    (-7, 5, 0, 6), (-7, -5, 0, 6), (-9, 0, -4, 5),
]
# Flesh strands hanging under the body: (forward, left, length).
DRIPS = [(3, 4, 5), (-2, -3, 6), (5, -5, 3), (-4, 5, 4), (0, 0, 7), (-6, -1, 3)]
LEGS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]      # (front/back, left/right)
TROT = {(1, 1): 0.0, (-1, -1): 0.0, (1, -1): 0.5, (-1, 1): 0.5}


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def norm(v):
    m = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / m for c in v)


class Canvas:
    """Pixels with depth: nearer primitives (smaller depth) win."""

    def __init__(self):
        self.img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        self.px = self.img.load()
        self.depth = {}

    def put(self, x, y, color, depth):
        x, y = int(round(x)), int(round(y))
        if not (0 <= x < FW and 0 <= y < FH):
            return
        if depth <= self.depth.get((x, y), 1e9):
            self.depth[(x, y)] = depth
            self.px[x, y] = color + (255,) if len(color) == 3 else color


class Pose:
    """Everything an animation changes, for one frame."""

    def __init__(self, **kw):
        self.bob = 0.0          # body height offset
        self.lean = 0.0         # pitch in radians, positive leans forward
        self.feet = {l: (0.0, 0.0) for l in LEGS}   # (forward slide, lift)
        self.curl = 0.0         # 0 standing, 1 legs folded under the body
        self.spin = 0.0         # whole-body tumble in radians (roll)
        self.tumble = False     # legs turn with the body instead of standing
        self.eyes = 1.0         # eye glow 0..1
        self.blink = False
        self.maw = 0.5          # mouth opening 0..1
        self.scythe = 0.0       # scythe sway in radians
        self.claw = 0.0         # claw arm reach, -1 back .. 1 forward
        self.fall = 0.0         # death: 0 alive, 1 everything on the ground
        self.slump = 0.0        # death: legs buckle
        self.__dict__.update(kw)


class Bug:
    def __init__(self, angle_deg, pose):
        a = math.radians(angle_deg)
        self.fx, self.fy = math.cos(a), math.sin(a)
        self.p = pose
        cz = lerp(CORE_Z, 15, pose.curl) + pose.bob
        self.core = (0.0, 0.0, lerp(cz, 6, ease(pose.slump)))

    # local (forward, left, up) -> world (x, y, z), applying lean and roll.
    def rot_local(self, f, l, u):
        cf, cu = 0.0, self.core[2]
        u -= cu
        ang = self.p.lean + self.p.spin
        c, s = math.cos(ang), math.sin(ang)
        f, u = f * c + u * s, -f * s + u * c
        return f + cf, l, u + cu

    def world(self, f, l, u):
        x = f * self.fx - l * self.fy
        y = f * self.fy + l * self.fx
        return x, y, u

    def point(self, f, l, u):
        return self.world(*self.rot_local(f, l, u))

    def direction(self, f, l, u):
        ang = self.p.lean + self.p.spin
        c, s = math.cos(ang), math.sin(ang)
        f, u = f * c + u * s, -f * s + u * c
        return self.world(f, l, u)


def screen(x, y, z):
    return CX + x, BASE_Y - z * 0.85 - y * 0.35


def depth_of(y, z):
    return y - z * 0.05      # farther (bigger y) is drawn behind


def toward_viewer(n):
    return (-n[1] * 0.8 + n[2] * 0.6)


def shade(ramp, nx, ny, nz):
    light = norm((-0.55, -0.65, 0.55))
    i = nx * light[0] + ny * light[1] + nz * light[2]
    k = int(max(0, min(len(ramp) - 1, (i + 0.35) / 1.35 * len(ramp))))
    return ramp[k]


def disc(cv, sx, sy, r, ramp, depth, rim=True):
    for yy in range(int(sy - r - 1), int(sy + r + 2)):
        for xx in range(int(sx - r - 1), int(sx + r + 2)):
            dx, dy = xx - sx, yy - sy
            d = math.hypot(dx, dy)
            if d > r:
                continue
            nx, ny = dx / r, dy / r
            nz = math.sqrt(max(0.0, 1 - nx * nx - ny * ny))
            col = GAP if rim and d > r - 0.9 else shade(ramp, nx, ny, nz)
            cv.put(xx, yy, col, depth - nz * 0.01)


def skull(cv, bug, f, l, u, r, glow, blink):
    """Skull at offset (f, l, u) from the core, facing away from it."""
    x, y, z = bug.point(f, l, bug.core[2] + u)
    sx, sy = screen(x, y, z)
    d = depth_of(y, z)
    disc(cv, sx, sy, r, BONE, d)
    face(cv, sx, sy, r, norm(bug.direction(f, l, u)), d, glow, blink)


def face(cv, sx, sy, r, n, d, glow, blink):
    """Sockets with a green glow, nose hole, teeth and jaw, looking along n."""
    v = toward_viewer(n)
    if v < 0.05:
        return
    ox, oy = n[0], -(n[2] * 0.85 + n[1] * 0.35)
    fx = sx + ox * r * 0.4
    fy = sy + oy * r * 0.3 + 0.5
    side = abs(n[0]) > 0.75
    gap = r * 0.42 * (0.7 if v < 0.4 else 1.0)
    ey = round(fy - 1)
    for e in ([0] if side else [-1, 1]):
        ex = round(fx + e * gap - 0.5)
        for px in (0, 1):
            cv.put(ex + px, ey - 1, BONE[1], d - 0.4)        # brow shadow
            cv.put(ex + px, ey, OUTLINE, d - 0.5)
            cv.put(ex + px, ey + 1, OUTLINE, d - 0.5)
        if not blink and glow > 0.05:
            col = EYE[2] if glow > 0.7 else EYE[1] if glow > 0.35 else EYE[0]
            inner = ex + (1 if (e > 0 or (side and n[0] > 0)) else 0)
            cv.put(inner, ey, col, d - 0.6)
            if glow > 0.7 and r >= 6:
                cv.put(inner, ey + 1, EYE[1], d - 0.6)
    if not side:
        cv.put(round(fx), ey + 2, GAP, d - 0.5)                # nose hole
    ty = ey + 3
    half = max(1, round(r * 0.4))
    for i, tx in enumerate(range(round(fx) - half, round(fx) + half + 1)):
        cv.put(tx, ty, OUTLINE if i % 2 else BONE[4], d - 0.5)
        if abs(tx - fx) < half:
            cv.put(tx, ty + 1, BONE[1], d - 0.45)               # jaw


def thick_line(cv, a, b, ramp, depth, width=2):
    (x0, y0), (x1, y1) = a, b
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(steps + 1):
        t = i / steps
        x, y = lerp(x0, x1, t), lerp(y0, y1, t)
        for k in range(width):
            col = ramp[-1] if k == 0 else ramp[1]
            cv.put(x + (k if abs(y1 - y0) > abs(x1 - x0) else 0),
                   y + (0 if abs(y1 - y0) > abs(x1 - x0) else k), col, depth)


def leg(cv, bug, fb, side):
    p = bug.p
    slide, lift = p.feet[(fb, side)]
    hip = (fb * 5, side * 7, -3)
    hipw = bug.point(hip[0], hip[1], bug.core[2] + hip[2])
    curl = p.curl
    # Foot rest spot on the ground, pulled under the body when curled.
    foot_f = lerp(fb * 14 + slide, fb * 4, curl)
    foot_l = lerp(side * 19, side * 5, curl)
    foot_l = lerp(foot_l, side * 22, ease(p.slump))
    foot_z = lerp(lift, bug.core[2] - 6, curl)
    knee_up = lerp(10, 2, curl) * (1 - ease(p.slump) * 0.8)
    if p.tumble:
        # The whole bug turns like a wheel: build the leg in body space.
        lift_z = bug.core[2] - CORE_Z - p.bob
        foot_l = side * 17
        knee_l = side * 13
        foot = bug.point(foot_f, foot_l, foot_z + lift_z)
        knee = bug.point(foot_f * 0.6 + fb, knee_l,
                         bug.core[2] + hip[2] + knee_up)
        draw_leg(cv, bug, fb, side, hipw, knee, foot)
        return
    if curl > 0:
        foot = bug.point(foot_f, foot_l, foot_z)
    else:
        foot = bug.world(foot_f, foot_l, foot_z)
    # Spider knee: above and outside the hip.
    mx = lerp(hipw[0], foot[0], 0.45)
    my = lerp(hipw[1], foot[1], 0.45)
    ox, oy = bug.world(fb * 1, side * 3, 0)[:2]
    knee = (mx + ox, my + oy, hipw[2] + knee_up)
    draw_leg(cv, bug, fb, side, hipw, knee, foot)


def draw_leg(cv, bug, fb, side, hipw, knee, foot):
    near = toward_viewer(norm(bug.world(fb * 0.3, side, 0))) > 0
    ramp = LEG if near else LEG[:1] + LEG[:3]
    for a, b in ((hipw, knee), (knee, foot)):
        d = depth_of((a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
        thick_line(cv, screen(*a), screen(*b), ramp, d)
    # Bony knee with a smear of blood under it.
    kx, ky = screen(*knee)
    dk = depth_of(knee[1], knee[2]) - 0.2
    cv.put(kx, ky - 1, BONE[4] if near else BONE[2], dk)
    cv.put(kx + 1, ky - 1, BONE[3] if near else BONE[1], dk)
    lx, ly = lerp(kx, screen(*foot)[0], 0.3), lerp(ky, screen(*foot)[1], 0.3)
    cv.put(lx, ly, BLOOD[1] if near else BLOOD[0], dk)
    # Hooked toes.
    fx, fy = screen(*foot)
    d = depth_of(foot[1], foot[2]) - 0.1
    dx = bug.world(fb, 0, 0)[0]
    s = 1 if dx > 0 else -1
    for cx_, cy_, col in ((0, 1, BONE[2]), (s, 1, BONE[3]), (2 * s, 0, BONE[3]),
                          (-s, 1, BONE[2])):
        cv.put(fx + cx_, fy + cy_, col, d)


def maw(cv, bug):
    """The big wet mouth under the skull shell: fangs, ribs and teal slime."""
    p = bug.p
    x, y, z = bug.point(10, 0, bug.core[2] - 6)
    n = norm(bug.direction(1, 0, -0.2))
    v = toward_viewer(n)
    if v < -0.25:
        return
    sx, sy = screen(x, y, z)
    d = depth_of(y, z) - 1.5
    front = max(0.0, min(1.0, v / 0.8))
    w = lerp(4.5, 10.5, front)
    h = 5 + p.maw * 3
    cx = sx + n[0] * 3
    for yy in range(int(sy - h), int(sy + h) + 1):
        for xx in range(int(cx - w), int(cx + w) + 1):
            dx, dy = (xx - cx) / w, (yy - sy) / h
            r = dx * dx + dy * dy
            if r > 1:
                continue
            if r > 0.72:
                col = MAW[0]
            elif dy < -0.25 and r < 0.3:
                col = MAW[0]                                   # throat
            elif dy < -0.1:
                col = MAW[1]
            elif r < 0.18:
                col = MAW[4]
            else:
                col = MAW[3] if dy > 0.3 and r < 0.5 else MAW[2]
            cv.put(xx, yy, col, d)
    top, bottom = sy - h, sy + h
    # Long upper fangs, short lower ones.
    for i, xx in enumerate(range(round(cx - w + 2), round(cx + w - 1), 2)):
        length = 3 if i % 2 == 0 else 2
        for k in range(length):
            cv.put(xx, top + 1 + k, BONE[4] if k == 0 else BONE[3] if k < length - 1 else BONE[2], d - 0.1)
        if i % 2:
            cv.put(xx + 1, bottom - 1, BONE[3], d - 0.1)
            cv.put(xx + 1, bottom - 2, BONE[4], d - 0.1)
    # Rib bones framing the mouth.
    if front > 0.3:
        for e in (-1, 1):
            rx = round(cx + e * (w + 0.5))
            for yy in range(round(top + 1), round(bottom)):
                cv.put(rx, yy, BONE[2] if (yy - round(top)) % 3 else OUTLINE, d - 0.2)


def scythe(cv, bug):
    """Bone arm with an elbow rising from the back, ending in a hooked blade."""
    p = bug.p
    if p.fall > 0.4:
        return
    cz = bug.core[2]
    s = p.scythe
    arm = [(-5, 4, cz + 4), (-10, 5, cz + 12), (-7, 4, cz + 20)]
    cx_, cz_ = -1.0, cz + 21
    blade = []
    for i in range(13):
        ang = math.radians(170 - 165 * i / 12) + s
        blade.append((cx_ + math.cos(ang) * 8, 4, cz_ + math.sin(ang) * 9))
    for pts, ramp, widths in ((arm, LEG, (3, 2)),
                              ([arm[-1]] + blade, BONE, None)):
        w = [bug.point(*q) for q in pts]
        for i in range(len(w) - 1):
            a, b = w[i], w[i + 1]
            d = depth_of((a[1] + b[1]) / 2, (a[2] + b[2]) / 2) + 0.5
            width = widths[i] if widths else (2 if i < 9 else 1)
            thick_line(cv, screen(*a), screen(*b), ramp, d, min(width, 2))
    # Elbow knob.
    e = bug.point(*arm[1])
    ex, ey = screen(*e)
    de = depth_of(e[1], e[2])
    for px, py, col in ((0, 0, BONE[4]), (1, 0, BONE[3]), (0, 1, BONE[2])):
        cv.put(ex + px, ey + py, col, de)


def claw_arm(cv, bug):
    """Bony arm on the right side ending in three long hooked fingers."""
    p = bug.p
    if p.fall > 0.4 or p.curl > 0.5:
        return
    cz = bug.core[2]
    reach = p.claw
    shoulder = (6, -9, cz - 3)
    elbow = (11 + reach * 2, -16, cz + 1 + reach * 2)
    wrist = (16 + reach * 4, -15, cz - 6 + reach * 2)
    fingers = [((19, -18, -9), (21, -18, -13)), ((21, -15, -9), (23, -15, -13)),
               ((19, -12, -9), (20, -11, -13))]
    pts = [above_floor(bug.point(*q)) for q in (shoulder, elbow, wrist)]
    for a, b in zip(pts, pts[1:]):
        d = depth_of((a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
        thick_line(cv, screen(*a), screen(*b), LEG, d)
    ex, ey = screen(*pts[1])
    cv.put(ex, ey - 1, BONE[4], depth_of(pts[1][1], pts[1][2]) - 0.2)
    for knuckle, tip in fingers:
        k = above_floor(bug.point(knuckle[0] + reach * 4, knuckle[1], cz + knuckle[2] + reach * 2))
        t = above_floor(bug.point(tip[0] + reach * 4 + 1, tip[1], cz + tip[2] + reach * 2), 0)
        d = depth_of(k[1], k[2]) - 0.1
        thick_line(cv, screen(*pts[2]), screen(*k), BONE[1:4], d, 1)
        thick_line(cv, screen(*k), screen(*t), BONE[2:], d, 1)
        cv.put(*screen(*t), BONE[4], d - 0.1)


def above_floor(p, floor=2):
    """Keeps a world point from sinking under the floor (slumped body)."""
    return p[0], p[1], max(p[2], floor)


def drips(cv, bug):
    """Strands of flesh and blood hanging under the body, swinging a little."""
    p = bug.p
    if p.tumble or p.curl > 0.3 or p.fall > 0.3:
        return
    cz = bug.core[2]
    for i, (f, l, length) in enumerate(DRIPS):
        top = bug.point(f, l, cz - 8)
        sx, sy = screen(*top)
        d = depth_of(top[1], top[2]) + 1
        sway = math.sin(p.bob + i) * 0.6
        for k in range(length):
            col = FLESH[1] if k < length - 2 else BLOOD[1] if k == length - 1 else BLOOD[0]
            cv.put(sx + sway * k / length, sy + k, col, d)


def draw_bug(angle, pose):
    bug = Bug(angle, pose)
    cv = Canvas()
    cz = bug.core[2]
    # Dark flesh core fills the gaps between skulls.
    x, y, z = bug.point(0, 0, cz)
    sx, sy = screen(x, y, z)
    disc(cv, sx, sy, 10 * (1 - 0.4 * ease(pose.fall)),
         [GAP, GAP, FLESH[1], FLESH[2]], depth_of(y, z) + 6, False)
    if pose.curl < 0.9:
        for fb, side in LEGS:
            leg(cv, bug, fb, side)
    for i, (f, l, u, r) in enumerate(SKULLS):
        if pose.fall > 0:
            # Each skull drops to the floor with its own delay and bounce.
            t = ease((pose.fall - (i % 5) * 0.08) / 0.6)
            f2, l2 = f * (1 + 0.6 * t), l * (1 + 0.8 * t)
            ground = r * 0.85 + abs(math.sin(t * math.pi * 2)) * 3 * (1 - t)
            uw = lerp(cz + u, ground, t)
            pt = bug.world(f2, l2, uw)
            # Draw at its world spot without the body rotation.
            sxx, syy = screen(*pt)
            d = depth_of(pt[1], pt[2])
            disc(cv, sxx, syy, r, BONE, d)
            n = norm(bug.world(f * 0.6, l * 0.6 - 2 * t, u * (1 - t) + 4 * t))
            flicker = pose.eyes if (i * 7) % 3 == 0 or pose.eyes > 0.6 else 0
            face(cv, sxx, syy, r, n, d, flicker, False)
        else:
            skull(cv, bug, f, l, u, r, pose.eyes, pose.blink)
    if pose.curl < 0.6 and pose.fall < 0.3:
        maw(cv, bug)
    drips(cv, bug)
    claw_arm(cv, bug)
    scythe(cv, bug)
    outline(cv.img)
    return cv.img


def outline(img):
    px = img.load()
    solid = {(x, y) for y in range(FH) for x in range(FW) if px[x, y][3] > 0}
    for x, y in solid:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in solid and 0 <= q[0] < FW and 0 <= q[1] < FH:
                px[q] = OUTLINE + (255,)


def shadow(scale=1.0, dx=0):
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    px = img.load()
    rx, ry = 17 * scale, 4.5 * scale
    for y in range(FH):
        for x in range(FW):
            if ((x - CX - dx) / rx) ** 2 + ((y - BASE_Y) / ry) ** 2 <= 1:
                px[x, y] = SHADOW
    return img


# --- Animations --------------------------------------------------------------

def gait(t, stride, lift):
    feet = {}
    for l in LEGS:
        ph = (t + TROT[l]) % 1.0
        if ph < 0.5:               # stance: the foot pushes back on the floor
            feet[l] = (lerp(stride, -stride, ph / 0.5), 0.0)
        else:                      # swing: the foot lifts and goes forward
            s = (ph - 0.5) / 0.5
            feet[l] = (lerp(-stride, stride, s), math.sin(s * math.pi) * lift)
    return feet


def pose_idle(i, n):
    t = i / n
    return Pose(bob=round(math.sin(t * 2 * math.pi)), maw=0.4 + 0.3 * math.sin(t * 2 * math.pi),
                scythe=math.sin(t * 2 * math.pi) * 0.08, blink=(i == 4),
                claw=0.2 * math.sin(t * 2 * math.pi),
                eyes=0.75 + 0.25 * math.cos(t * 2 * math.pi))


def pose_walk(i, n):
    t = i / n
    return Pose(feet=gait(t, 3.5, 3), bob=round(abs(math.sin(t * 2 * math.pi))),
                lean=0.04, maw=0.4, scythe=math.sin(t * 4 * math.pi) * 0.1,
                claw=0.5 * math.sin(t * 2 * math.pi))


def pose_run(i, n):
    t = i / n
    return Pose(feet=gait(t, 6.5, 5), bob=1 + round(1.5 * abs(math.sin(t * 2 * math.pi))),
                lean=0.16, maw=0.9, scythe=-0.25 + math.sin(t * 4 * math.pi) * 0.15,
                claw=0.6 + 0.4 * math.sin(t * 2 * math.pi))


# Roll: the whole bug tumbles forward like a wheel, legs and all. The spin
# speeds up to 45 degrees per frame, keeps it for the loop and slows down.
ROLL_BOB = 5          # lifts the body so the turning legs clear the floor


def pose_roll_start(i, n):
    if i < 3:                                  # crouch to push off
        return Pose(bob=-[1, 2, 3][i], maw=0.6, scythe=0.2 * i)
    u = (i - 2) / (n - 3)
    return Pose(tumble=True, spin=math.pi * u * u, maw=0.3,
                bob=lerp(-3, ROLL_BOB, ease(u * 1.5)))


def pose_roll(i, n):
    return Pose(tumble=True, spin=math.pi + i / n * 2 * math.pi, maw=0.3,
                bob=ROLL_BOB)


def pose_roll_end(i, n):
    u = (i + 1) / n
    spin = math.pi + math.pi * (1 - (1 - u) ** 2)
    return Pose(tumble=i < n - 1, spin=spin if i < n - 1 else 0, maw=0.4,
                bob=lerp(ROLL_BOB, 0, ease(u * 1.3)) - (1 if i == n - 2 else 0))


def pose_death(i, n):
    # 0-9 stagger, 10-21 the body breaks apart, 22-32 a last flicker and dark.
    if i < 10:
        t = i / 9
        return Pose(slump=t * 0.6, lean=-0.2 * math.sin(t * math.pi * 2),
                    maw=1.0, eyes=1 - 0.3 * t, scythe=0.4 * t,
                    bob=round(math.sin(t * math.pi * 3)))
    if i < 22:
        t = (i - 10) / 11
        return Pose(slump=0.6 + 0.4 * t, fall=t, eyes=0.7 - 0.5 * t, maw=1.0)
    flicker = 0.5 if i in (25, 26, 29) else 0.0
    return Pose(slump=1.0, fall=1.0, eyes=flicker)


POSES = {"idle": pose_idle, "walk": pose_walk, "run": pose_run,
         "roll_start": pose_roll_start, "roll_end": pose_roll_end,
         "roll": pose_roll, "death": pose_death}


def frames():
    """Yields (bicho layer, shadow layer, ms) for the 263 frames in order."""
    for tag, n, ms in LAYOUT:
        if tag == "death":
            kind, direction = "death", "down_right"
        else:
            kind, direction = tag.rsplit("_", 1) if tag.count("_") == 1 else (None, None)
            for k in ("roll_start", "roll_end", "roll", "idle", "walk", "run"):
                if tag.startswith(k + "_"):
                    kind, direction = k, tag[len(k) + 1:]
                    break
        for i in range(n):
            pose = POSES[kind](i, n)
            img = draw_bug(ANGLE[direction], pose)
            sh = shadow(lerp(1.0, 0.75, pose.curl) * (1 - 0.3 * ease(pose.fall)))
            yield img, sh, ms


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    sheet = []
    durations = []
    for k, (img, sh, ms) in enumerate(frames()):
        img.save(os.path.join(out, f"Bicho_{k}.png"))
        sh.save(os.path.join(out, f"Sombra_{k}.png"))
        durations.append(ms)
        if "--preview" in sys.argv:
            full = sh.copy()
            full.alpha_composite(img)
            sheet.append(full)
    with open(os.path.join(out, "durations.txt"), "w") as fh:
        fh.write("\n".join(map(str, durations)) + "\n")
    with open(os.path.join(out, "tags.txt"), "w") as fh:
        start = 0
        for tag, n, _ in LAYOUT:
            fh.write(f"{tag} {start} {start + n - 1}\n")
            start += n
    if "--preview" in sys.argv:
        path = sys.argv[sys.argv.index("--preview") + 1]
        cols = 16
        rows = (len(sheet) + cols - 1) // cols
        prev = Image.new("RGBA", (FW * cols, FH * rows), (64, 74, 64, 255))
        for k, f in enumerate(sheet):
            prev.alpha_composite(f, ((k % cols) * FW, (k // cols) * FH))
        prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save(path)


if __name__ == "__main__":
    main()
