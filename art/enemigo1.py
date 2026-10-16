"""Enemigo1: a round-headed imp with floating hands and feet that carries a torch.

Usage: python3 enemigo1.py <out_dir> [--preview <file.png>]
Writes one PNG per layer (Sombra, Enemigo) and frame: <out_dir>/<layer>_<n>.png,
plus tags.txt ("name from to" per line, 0-based) and durations.txt (ms per
frame). bicho_aseprite.lua (with --script-param body=Enemigo) assembles them into
Enemigo1_Anim.aseprite.

The frame layout copies Personaje_2_Anim (263 frames of 64x96, same tags and
durations) so the game can drive the enemy with the player's animator:
idle/walk/run in 8 directions, roll (the imp curls into a ball) to the right
and left, and death (the limbs drop, the torch falls and goes out).

The body comes from Brian's Enemigo1.aseprite (42x64, front view). Each part
is an ellipsoid in 3D (forward, left, up), ray cast in the game's
three-quarter view, shaded with the two skin tones of the original and
outlined in black on its own, so the floating parts stay separate.
"""
import math
import os
import sys

from PIL import Image

FW, FH = 64, 96
CX, BASE_Y = 32, 84          # feet line, same as the player sprite

# Palette of the original sprite, plus flame and smoke shades.
OUTLINE = (0, 0, 0)
SKIN = (238, 195, 154)
SKIN_DARK = (217, 160, 102)
EYE = (217, 87, 99)
FLAME = [(214, 92, 30), (246, 160, 44), (251, 242, 54), (255, 252, 200)]
SMOKE = [(92, 88, 96), (132, 128, 134), (176, 172, 176)]
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

# The camera looks along VIEW: a world point moving along it keeps its pixel.
VIEW_Y = 0.3
VIEW = (0.0, 1 / math.hypot(1, VIEW_Y), -VIEW_Y / math.hypot(1, VIEW_Y))
LIGHT = (0.35, -0.85, -0.1)  # world light: the top and far rims go dark, as drawn

# Rest layout, measured on the original: (forward, left, up) centres and radii.
HEAD_C, HEAD_R = (0.0, 0.0, 25.0), (8.5, 11.0, 8.0)
BODY_C, BODY_R = (0.0, 0.0, 10.5), (5.0, 7.8, 7.0)
BODY_HALF_H = 3.5            # the pants are cut flat above and below
FOOT_C, FOOT_R = (1.0, 5.5, 1.8), (3.5, 2.6, 1.8)
HAND_R = (2.4, 2.8, 1.9)
TORCH_HAND = (2.0, -15.5, 16.0)  # the right hand (screen left from the front)
FREE_HAND = (1.0, 11.5, 15.5)
STAFF_DOWN, STAFF_UP = 21.0, 18.0
STAFF_TILT = (-0.08, -0.14, 1.0)  # top leans back and out, like the drawing
ROLL_CENTER_U = 14.0
# Death: how far forward each part lands (by part index; the head rolls off).
DRIFT = {0: 9.0, 2: -5.0}


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def norm(v):
    m = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / m for c in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


LIGHT = norm(LIGHT)


class Pose:
    """Everything an animation changes, for one frame."""

    def __init__(self, **kw):
        self.bob = 0.0          # head and body height offset
        self.lean = 0.0         # pitch in radians, positive leans forward
        self.head_tilt = 0.0    # extra head roll in radians (sideways)
        self.feet = {1: (0.0, 0.0), -1: (0.0, 0.0)}   # side -> (slide, lift)
        self.hands = {1: (0.0, 0.0), -1: (0.0, 0.0)}  # side -> (swing, lift)
        self.curl = 0.0         # 0 standing, 1 tucked into a ball
        self.spin = 0.0         # whole-body tumble in radians (roll)
        self.blink = False
        self.eyes_open = 0.0    # 0 sleepy slits as drawn, 1 wide open
        self.flame = 1.0        # flame size 0..1
        self.flame_t = 0.0      # flame flicker phase
        self.flame_lag = 0.0    # flame tip pushed back by speed
        self.fall = 0.0         # death: 0 floating, 1 everything on the floor
        self.torch_fall = 0.0   # death: the torch tips over
        self.smoke = 0.0        # death: smoke puff 0..1 (rising)
        self.__dict__.update(kw)


class Imp:
    """Turns local (forward, left, up) points into world (x, y, z)."""

    def __init__(self, angle_deg, pose):
        a = math.radians(angle_deg)
        self.fx, self.fy = math.cos(a), math.sin(a)
        self.p = pose

    def pitch(self, f, l, u, ang, cu):
        c, s = math.cos(ang), math.sin(ang)
        u -= cu
        return f * c + u * s, l, -f * s + u * c + cu

    def local(self, f, l, u, spin=True):
        """Applies lean (around the feet) and the roll spin (around the belly)."""
        f, l, u = self.pitch(f, l, u, self.p.lean, 0.0)
        if spin and self.p.spin:
            f, l, u = self.pitch(f, l, u, self.p.spin, ROLL_CENTER_U)
        return f, l, u

    def world(self, f, l, u):
        return (f * self.fx - l * self.fy, f * self.fy + l * self.fx, u)

    def point(self, f, l, u, spin=True):
        return self.world(*self.local(f, l, u, spin))

    def axes(self, spin=True):
        """World directions of the local forward, left and up axes."""
        o = self.point(0, 0, 0, spin)
        out = []
        for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
            q = self.point(*v, spin)
            out.append(tuple(q[k] - o[k] for k in range(3)))
        return out


def screen(x, y, z):
    return CX + x, BASE_Y - z - y * VIEW_Y


class Part:
    """One ellipsoid, rendered into its own layer and outlined."""

    def __init__(self, center, radii, axes, tone=None, half_h=None):
        self.c, self.r, self.ax = center, radii, axes
        self.tone = tone          # callable(local point) -> colour or None
        self.half_h = half_h      # cut the ellipsoid flat at +-half_h (up axis)
        self.marks = []           # (local surface direction, painter)

    def to_local(self, p):
        d = tuple(p[k] - self.c[k] for k in range(3))
        return tuple(dot(d, a) for a in self.ax)

    def dir_local(self, v):
        return tuple(dot(v, a) for a in self.ax)

    def depth(self):
        return dot(self.c, VIEW)

    def hit(self, sx, sy):
        """Ray from pixel (sx, sy): returns (local point, local normal) or None."""
        o = (sx - CX, 0.0, BASE_Y - sy)
        lo, ld = self.to_local(o), self.dir_local(VIEW)
        a = sum((ld[k] / self.r[k]) ** 2 for k in range(3))
        b = 2 * sum(lo[k] * ld[k] / self.r[k] ** 2 for k in range(3))
        c = sum((lo[k] / self.r[k]) ** 2 for k in range(3)) - 1
        disc = b * b - 4 * a * c
        if disc < 0:
            return None
        sq = math.sqrt(disc)
        t0, t1 = (-b - sq) / (2 * a), (-b + sq) / (2 * a)
        enter, cap = t0, None
        if self.half_h is not None:
            # Intersect with the slab |up| <= half_h: the pants are cut flat.
            if abs(ld[2]) < 1e-9:
                if abs(lo[2]) > self.half_h:
                    return None
            else:
                s0 = (-self.half_h - lo[2]) / ld[2]
                s1 = (self.half_h - lo[2]) / ld[2]
                if s0 > s1:
                    s0, s1 = s1, s0
                if s0 > t0:
                    enter, cap = s0, (0.0, 0.0, 1.0 if ld[2] < 0 else -1.0)
                t1 = min(t1, s1)
            if enter > t1:
                return None
        q = tuple(lo[k] + ld[k] * enter for k in range(3))
        n = cap or norm(tuple(q[k] / self.r[k] ** 2 for k in range(3)))
        return q, n

    def world_normal(self, n):
        return norm(tuple(sum(n[i] * self.ax[i][k] / 1.0 for i in range(3)) for k in range(3)))

    def render(self):
        img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
        px = img.load()
        span = max(self.r) + 2
        sx0, sy0 = screen(*self.c)
        for yy in range(int(sy0 - span - 2), int(sy0 + span + 3)):
            for xx in range(int(sx0 - span - 1), int(sx0 + span + 2)):
                if not (0 <= xx < FW and 0 <= yy < FH):
                    continue
                h = self.hit(xx + 0.5, yy + 0.5)
                if not h:
                    continue
                q, n = h
                col = self.tone(q) if self.tone else None
                if col is None:
                    lit = dot(self.world_normal(n), LIGHT)
                    col = SKIN if lit > -0.2 else SKIN_DARK
                px[xx, yy] = col + (255,)
        for mark in self.marks:
            mark(self, img)
        outline(img)
        return img


def outline(img):
    px = img.load()
    solid = {(x, y) for y in range(FH) for x in range(FW) if px[x, y][3] > 0}
    for x, y in solid:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in solid and 0 <= q[0] < FW and 0 <= q[1] < FH:
                px[q] = OUTLINE + (255,)


def head_eyes(pose):
    """Sleepy slit eyes with a red glint under the outer corner, as drawn."""

    def paint(part, img):
        if pose.fall > 0.95 and pose.blink:
            return
        px = img.load()
        for side in (1, -1):
            # Direction from the head centre to the eye on the surface.
            d = norm((0.78, side * 0.42, 0.18))
            q = tuple(d[k] * part.r[k] for k in range(3))
            n = part.world_normal(norm(tuple(q[k] / part.r[k] ** 2 for k in range(3))))
            facing = -dot(n, VIEW)
            if facing < 0.15:
                continue
            wp = tuple(part.c[i] + sum(q[k] * part.ax[k][i] for k in range(3)) for i in range(3))
            ex, ey = screen(*wp)
            ex, ey = int(round(ex)), int(round(ey))
            # The slit slants down toward the nose, with a red glint at the
            # inner corner, as drawn. `out` points away from the nose on screen.
            out = 1 if part.ax[1][0] * side > 0 else -1
            wide = facing > 0.5
            if pose.blink:
                cells = [(ex + k, ey) for k in range(-1, 2 if wide else 1)]
                glint = None
            else:
                cells = [(ex - out, ey), (ex, ey), (ex + out, ey), (ex + out, ey - 1)]
                if wide:
                    cells.append((ex + 2 * out, ey - 1))
                if pose.eyes_open > 0.5:
                    cells += [(ex, ey - 1), (ex - out, ey - 1)]
                glint = (ex - 2 * out, ey)
            for c in cells:
                if 0 <= c[0] < FW and 0 <= c[1] < FH and px[c][3]:
                    px[c] = OUTLINE + (255,)
            if glint and wide and px[glint][3] and px[glint][:3] != OUTLINE:
                px[glint] = EYE + (255,)

    return paint


def pants_tone(q):
    """Waistband and cuffs in the dark tone, a black split between the legs."""
    if q[2] > BODY_HALF_H - 1.3:
        return SKIN_DARK
    if q[2] < -BODY_HALF_H + 1.6:
        if abs(q[1]) < 1.3:
            return OUTLINE
        return SKIN_DARK
    return None


def dark_tone(q):
    """Hands and feet are drawn mostly in the dark tone with a light top."""
    return SKIN if q[2] > 0.55 and q[0] > -0.5 else SKIN_DARK


# --- Assembling one frame -----------------------------------------------------

def fallen(imp, f, l, u, r_up, t, k, spin=True):
    """Death: a part drops from (f, l, u) to the floor with a small bounce."""
    if t <= 0:
        return imp.point(f, l, u, spin)
    tt = ease((t - (k % 5) * 0.07) / 0.6)
    top = imp.point(f, l, u, spin)
    drift = DRIFT.get(k, 0.0)
    rest = imp.world(f * 1.3 + drift, l * 1.6, r_up)
    bounce = abs(math.sin(tt * math.pi * 2)) * 3 * (1 - tt)
    return (lerp(top[0], rest[0], tt), lerp(top[1], rest[1], tt),
            lerp(top[2], rest[2], tt) + bounce)


def draw_imp(angle, pose):
    imp = Imp(angle, pose)
    p = pose
    axes = imp.axes()
    curl = ease(p.curl)
    layers = []           # (depth, image)

    head_u = lerp(HEAD_C[2], 20.0, curl) + p.bob
    body_u = lerp(BODY_C[2], 12.0, curl) + p.bob * 0.5
    hc = fallen(imp, 0, 0, head_u, HEAD_R[2] - 0.5, p.fall, 0)
    head_axes = axes
    if p.head_tilt:
        f, l, u = axes
        c, s = math.cos(p.head_tilt), math.sin(p.head_tilt)
        head_axes = [f, tuple(l[k] * c + u[k] * s for k in range(3)),
                     tuple(-l[k] * s + u[k] * c for k in range(3))]
    head = Part(hc, HEAD_R, head_axes)
    head.marks.append(head_eyes(p))
    layers.append(head)

    bc = fallen(imp, 0, 0, body_u, BODY_HALF_H, p.fall, 2)
    layers.append(Part(bc, BODY_R, axes, pants_tone, BODY_HALF_H))

    for side in (1, -1):
        slide, lift = p.feet[side]
        fu = lerp(FOOT_C[2] + lift, 8.0, curl)
        ff = lerp(FOOT_C[0] + slide, 2.0, curl)
        fl = lerp(side * FOOT_C[1], side * 4.0, curl)
        fc = fallen(imp, ff, fl, fu, FOOT_R[2], p.fall, 3 + side)
        layers.append(Part(fc, FOOT_R, axes, dark_tone))

    # Hands: the free one swings, the torch hand holds the staff.
    hand_pts = {}
    for side, rest in ((1, FREE_HAND), (-1, TORCH_HAND)):
        swing, lift = p.hands[side]
        hf = lerp(rest[0] + swing, 4.0, curl)
        hl = lerp(rest[1], side * 9.0, curl)
        hu = lerp(rest[2] + lift + p.bob * 0.7, 16.0, curl)
        hand_pts[side] = (hf, hl, hu)
        hc_ = fallen(imp, hf, hl, hu, HAND_R[2], p.fall, 6 + side)
        layers.append(Part(hc_, HAND_R, axes, dark_tone))

    images = [(part.depth(), part.render()) for part in layers]
    images += torch(imp, hand_pts[-1], layers[-1])

    cv = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    for _, img in sorted(images, key=lambda e: -e[0]):
        cv.alpha_composite(img)
    return cv


def torch(imp, grip_local, hand):
    """Staff through the torch hand, flame on top (or smoke once it is out)."""
    p = imp.p
    dirl = norm(STAFF_TILT)
    if p.curl > 0:
        # Tucked: the staff lies along the body, like a rolled-up umbrella.
        dirl = norm((lerp(dirl[0], 1.0, ease(p.curl)), dirl[1] * (1 - ease(p.curl)),
                     lerp(dirl[2], 0.35, ease(p.curl))))
    gf, gl, gu = grip_local
    down = tuple(g - d * STAFF_DOWN for g, d in zip((gf, gl, gu), dirl))
    up = tuple(g + d * STAFF_UP for g, d in zip((gf, gl, gu), dirl))
    grip = hand.c
    bottom, top = imp.point(*down), imp.point(*up)
    if p.fall > 0 or p.torch_fall > 0:
        # The torch tips over sideways and lands flat on the floor.
        t = ease(p.torch_fall)
        # Fixed screen-space landing so the whole staff stays in the frame.
        rest_b = (14.0, -3.0, 0.5)
        rest_t = (-20.0, 6.0, 0.5)
        bottom = tuple(lerp(bottom[k], rest_b[k], t) for k in range(3))
        top = tuple(lerp(top[k], rest_t[k], t) for k in range(3))
        grip = tuple(lerp(bottom[k], top[k], STAFF_DOWN / (STAFF_DOWN + STAFF_UP))
                     for k in range(3))
    staff = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    spx = staff.load()
    (x0, y0), (x1, y1) = screen(*bottom), screen(*top)
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(steps + 1):
        x = int(round(lerp(x0, x1, i / steps)))
        y = int(round(lerp(y0, y1, i / steps)))
        if 0 <= x < FW and 0 <= y < FH and y < BASE_Y + 6:
            spx[x, y] = OUTLINE + (255,)
    out = [(dot(grip, VIEW) + 0.4, staff)]
    tx, ty = screen(*top)
    fl = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    if p.flame > 0.02:
        flame(fl, tx, ty, p.flame, p.flame_t, p.flame_lag * imp.fx)
    if p.smoke > 0:
        smoke(fl, tx, ty, p.smoke)
    out.append((dot(top, VIEW) - 50, fl))
    return out


def flame(img, x, y, size, t, lag):
    """Teardrop flame: orange base, yellow body, pale core, wavy tip."""
    px = img.load()
    h = 11 * size
    w = 3.4 * size
    for k in range(int(h) + 1):
        v = k / max(h, 1)                     # 0 at the base, 1 at the tip
        half = w * math.sin(min(1.0, (1 - v) * 1.15) * math.pi * 0.62) * (1 - 0.25 * v)
        if v < 0.15:
            half = w * (0.6 + v * 2.5)
        sway = math.sin(t * 2 * math.pi + v * 4) * v * 1.4 - lag * v * v * 5
        cx = x + sway
        yy = int(round(y - k + 1))
        for xx in range(int(math.floor(cx - half)), int(math.ceil(cx + half)) + 1):
            dx = abs(xx + 0.5 - cx) / max(half, 0.5)
            if dx > 1 or not (0 <= xx < FW and 0 <= yy < FH):
                continue
            if v < 0.2 and dx > 0.4:
                col = FLAME[1]
            elif dx < 0.35 and 0.15 < v < 0.5:
                col = FLAME[3]
            elif v > 0.85:
                col = FLAME[1]
            else:
                col = FLAME[2]
            px[xx, yy] = col + (255,)
    # A spark that rises and blinks.
    sy = int(round(y - h - 2 - (t * 4 % 4)))
    sx = int(round(x + math.sin(t * 6.3) * 2 - lag * 4))
    if size > 0.5 and 0 <= sx < FW and 0 <= sy < FH and int(t * 8) % 3 != 2:
        px[sx, sy] = FLAME[2] + (255,)


def smoke(img, x, y, t):
    """Grey puffs that rise from the dead torch and thin out."""
    px = img.load()
    for i, (dx, r) in enumerate(((0, 2.2), (-2, 1.8), (1.5, 1.5), (-0.5, 1.2))):
        tt = t - i * 0.15
        if not 0 < tt < 1:
            continue
        cx = x + dx + math.sin(tt * 5 + i) * 1.5
        cy = y - 2 - tt * 14 - i * 2
        rr = r * (0.8 + tt)
        col = SMOKE[min(2, int(tt * 3))]
        for yy in range(int(cy - rr), int(cy + rr) + 1):
            for xx in range(int(cx - rr), int(cx + rr) + 1):
                if (xx - cx) ** 2 + (yy - cy) ** 2 <= rr * rr and 0 <= xx < FW and 0 <= yy < FH:
                    if (xx + yy) % 2 == 0 or tt < 0.6:
                        px[xx, yy] = col + (255,)


def shadow(scale=1.0):
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    px = img.load()
    rx, ry = 12 * scale, 3.5 * scale
    for y in range(FH):
        for x in range(FW):
            if ((x - CX) / rx) ** 2 + ((y - BASE_Y + 0.5) / ry) ** 2 <= 1:
                px[x, y] = SHADOW
    return img


# --- Animations --------------------------------------------------------------

def steps(t, stride, lift):
    """Floating feet step in turn; hands swing against them."""
    feet, hands = {}, {}
    for side, ph0 in ((1, 0.0), (-1, 0.5)):
        ph = (t + ph0) % 1.0
        if ph < 0.5:
            feet[side] = (lerp(stride, -stride, ph / 0.5), 0.0)
        else:
            s = (ph - 0.5) / 0.5
            feet[side] = (lerp(-stride, stride, s), math.sin(s * math.pi) * lift)
        swing = -math.cos((t + ph0) * 2 * math.pi) * stride * 0.8
        hands[side] = (swing * (1.0 if side == 1 else 0.45), abs(swing) * 0.2)
    return feet, hands


def pose_idle(i, n):
    t = i / n
    s = math.sin(t * 2 * math.pi)
    return Pose(bob=round(s), blink=(i == 4), flame_t=t,
                hands={1: (0.0, round(math.sin(t * 2 * math.pi + 1.2))),
                       -1: (0.0, round(s * 0.6))})


def pose_walk(i, n):
    t = i / n
    feet, hands = steps(t, 3.5, 3)
    return Pose(feet=feet, hands=hands, bob=round(abs(math.sin(t * 2 * math.pi))),
                lean=0.05, flame_t=t * 2, flame_lag=0.25)


def pose_run(i, n):
    t = i / n
    feet, hands = steps(t, 6.5, 5)
    return Pose(feet=feet, hands=hands, bob=1 + round(1.5 * abs(math.sin(t * 2 * math.pi))),
                lean=0.18, flame_t=t * 2, flame_lag=0.6, eyes_open=1.0)


# Roll: the imp tucks its hands and feet in and tumbles forward like a ball.
ROLL_BOB = 4


def pose_roll_start(i, n):
    if i < 3:                                  # crouch to push off
        return Pose(bob=-[1, 2, 3][i], curl=0.15 * i, flame_t=i / 8, eyes_open=1.0)
    u = (i - 2) / (n - 3)
    return Pose(curl=ease(u * 2), spin=math.pi * u * u, flame=0.7, flame_t=u,
                flame_lag=0.5, bob=lerp(-3, ROLL_BOB, ease(u * 1.5)))


def pose_roll(i, n):
    return Pose(curl=1.0, spin=math.pi + i / n * 2 * math.pi, bob=ROLL_BOB,
                flame=0.7, flame_t=i / n, flame_lag=0.6)


def pose_roll_end(i, n):
    u = (i + 1) / n
    spin = math.pi + math.pi * (1 - (1 - u) ** 2)
    last = i == n - 1
    return Pose(curl=1 - ease(u * 1.2), spin=0 if last else spin, flame=0.7 + 0.3 * u,
                flame_t=u, bob=lerp(ROLL_BOB, 0, ease(u * 1.3)) - (1 if i == n - 2 else 0),
                eyes_open=1.0 if u < 0.8 else 0.0)


def pose_death(i, n):
    # 0-9 hit and stagger, 10-21 the limbs lose their float and drop,
    # 22-32 the torch smokes out and everything lies still.
    if i < 10:
        t = i / 9
        return Pose(eyes_open=1.0, head_tilt=0.35 * math.sin(t * math.pi * 1.5),
                    lean=-0.15 * math.sin(t * math.pi * 2), bob=round(math.sin(t * math.pi * 3)),
                    flame=1 - 0.4 * t, flame_t=t * 3, torch_fall=0.0,
                    hands={1: (-2 * t, 3 * t), -1: (0.0, 0.0)})
    if i < 22:
        t = (i - 10) / 11
        return Pose(fall=t, torch_fall=ease(t * 1.4), flame=max(0.0, 0.6 - t),
                    flame_t=t * 3, smoke=max(0.0, (t - 0.55) / 0.8), blink=True)
    t = (i - 22) / 10
    return Pose(fall=1.0, torch_fall=1.0, flame=0.0, blink=True,
                smoke=0.25 + 0.75 * t if t < 1 else 0.0)


POSES = {"idle": pose_idle, "walk": pose_walk, "run": pose_run,
         "roll_start": pose_roll_start, "roll_end": pose_roll_end,
         "roll": pose_roll, "death": pose_death}


def frames():
    """Yields (enemy layer, shadow layer, ms) for the 263 frames in order."""
    for tag, n, ms in LAYOUT:
        kind, direction = "death", "down_right"
        for k in ("roll_start", "roll_end", "roll", "idle", "walk", "run"):
            if tag.startswith(k + "_"):
                kind, direction = k, tag[len(k) + 1:]
                break
        for i in range(n):
            pose = POSES[kind](i, n)
            img = draw_imp(ANGLE[direction], pose)
            yield img, shadow(lerp(1.0, 0.8, pose.curl)), ms


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    sheet = []
    durations = []
    for k, (img, sh, ms) in enumerate(frames()):
        img.save(os.path.join(out, f"Enemigo_{k}.png"))
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
