"""Espartano1: the level 1 enemy, a spartan from Brian's Espartano1.aseprite
(one frame, 32x43).

Usage: python3 espartano.py <out_dir> [--preview <file.png>]
Writes one PNG per layer (Sombra, Espartano) and frame: <out_dir>/<layer>_<n>.png,
plus tags.txt ("name from to" per line, 0-based) and durations.txt (ms per
frame). bicho_aseprite.lua (with --script-param body=Espartano) assembles them
into Espartano1_Anim.aseprite.

The tags of Enemigo1_Anim (enemigo1.LAYOUT: the layout of Personaje_2_Anim
plus the pinned ones), so the game drives it the same way: idle/walk/run in
8 directions, roll to the right and left, and pinned to a wall by a spear
(pinned_hit_* then the pinned_* loop, front, left and right) with the blood
of enemigo1.py. Instead of the one death, three dramatic ones by where it
faces, as long as Enemigo1's (33 x 80 ms, C's MUERTE_MS), each with two
spurts of blood and a pool growing under the body: death_front (knocked
back, staggers and topples over sideways), death_right and death_left
(clutches the wound, spins down to its knees and slumps over ahead) and
death_back (arches, stumbles ahead and collapses sideways). They all end
lying across the screen: lying toward or away from the camera, a body reads
as standing in this view.

The model is built on personaje_3.py (ellipsoids ray cast in the game's view,
the same skeleton and poses) and scaled down to SIZE: about Personaje_2's
size and a little taller, some 51 px to the top of the crest. From the
drawing:
- a bronze Corinthian helmet with a dark red rim, the face a dark T, and a
  blue crest from the brow to the nape;
- red pauldrons on the shoulders and a blue cape down the back;
- a bronze cuirass, a black belt, a red skirt of strips;
- bare arms and legs, brown greaves and sandals.
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image

import enemigo1 as e1
import personaje_3 as p3
import personaje_3_build as b
from personaje_3 import Model, Pose, add, pick, rot_x, rot_y, scale, two_bone, unit

W, H, FLOOR = p3.W, p3.H, p3.FLOOR

# The palette of the drawing.
BLACK = (0, 0, 0)
SKIN = (238, 195, 154)
SKIN_DARK = (217, 160, 102)
BRONZE = (143, 86, 59)
BRONZE_DARK = (102, 57, 49)
RED = (172, 50, 50)
RED_DARK = (97, 32, 32)
BLUE = (80, 80, 145)
BLUE_DARK = (63, 63, 116)
SHADOW = (0, 0, 0, 80)

HEAD_C = (0.5, 0.0, 42.5)
HELMET_R = (6.8, 6.0, 7.4)
CREST_BLADES = [(3, 8), (4, 12), (5, 16), (5, 20), (5, 24), (5, 30), (4, 36), (4, 44), (3, 52)]
BELLY_U = 24.0  # where the spear goes through
# The parts the body rests on when it lies on the floor.
RESTS_ON = {"cuirass", "skirt", "belt", "helmet", "cape", "thigh_r", "thigh_l", "shin_r", "shin_l"}
# The whole model, scaled from the feet: personaje_3's skeleton would stand
# 58 px; Personaje_2 stands 46.
SIZE = 0.88


# ---------------------------------------------------------------- materials

def shaded(light, dark, cut=0.12):
    return lambda p, lam, n: pick(lam < cut, dark, light)


skin = shaded(SKIN, SKIN_DARK)
bronze = shaded(BRONZE, BRONZE_DARK)


def greave(p, lam, n):
    """Shin: the greave over the front, skin at the back."""
    front = p[:, 2] > -0.2
    out = pick(lam < 0.12, BRONZE_DARK, BRONZE)
    return np.where(front[:, None], out, np.array(SKIN_DARK))


def forearm(p, lam, n):
    """Bare forearm with a brown bracer at the wrist end."""
    bracer = p[:, 0] > 0.25
    return np.where(bracer[:, None], np.array(BRONZE_DARK), pick(lam < 0.12, SKIN_DARK, SKIN))


def cuirass(p, lam, n):
    """Bronze, with the line down the middle and the dark rim at the bottom."""
    line = (np.abs(p[:, 1]) < 0.08) & (p[:, 0] > 0.3)
    rim = p[:, 2] < -0.82
    out = pick(lam < 0.1, BRONZE_DARK, BRONZE)
    return np.where((line | rim)[:, None], np.array(BRONZE_DARK), out)


def skirt(p, lam, n):
    """Red strips with dark gaps between them."""
    around = np.arctan2(p[:, 1], p[:, 0])
    gap = np.mod(around * 2.6, 1.0) < 0.18
    out = pick(lam < 0.05, RED_DARK, RED)
    return np.where(gap[:, None], np.array(RED_DARK), out)


def cloak(p, lam, n):
    return pick(lam < 0.2, RED_DARK, RED)


def cape(p, lam, n):
    """Blue folds hanging down."""
    fold = np.mod(p[:, 1] * 2.2, 1.0) < 0.3
    return pick(fold | (lam < 0.0), BLUE_DARK, BLUE)


def helmet(p, lam, n):
    """Bronze Corinthian helmet: the face a dark T (eyes across, nose and
    mouth down the middle) and the dark red rim at the bottom of the cheek
    guards."""
    front = p[:, 0] > 0.5
    eyes = front & (np.abs(p[:, 2] - 0.05) < 0.14) & (np.abs(p[:, 1]) < 0.62)
    mouth = front & (np.abs(p[:, 1]) < 0.18) & (p[:, 2] < 0.05) & (p[:, 2] > -0.8)
    rim = p[:, 2] < -0.62
    out = pick(lam < 0.1, BRONZE_DARK, BRONZE)
    out = np.where(rim[:, None], np.array(RED_DARK), out)
    return np.where((eyes | mouth)[:, None], np.array(BLACK), out)


def crest(p, lam, n):
    return pick(lam < 0.15, BLUE_DARK, BLUE)


# ---------------------------------------------------------------- the model

class Spartan(Model):
    """personaje_3's skeleton dressed as the spartan. The pose may also have
    `spin`: the whole body tumbles forward that many radians around the
    belly (the roll), or sideways (toward its left) with `spin_side`; and
    `ground`: how far down to the floor a tumbled body rests (1: on it)."""

    def build(self):
        pose = self.pose
        I = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
        T = [self.torso_dir(v) for v in I]
        # Legs: right is -left.
        for side, s in (("r", -1), ("l", 1)):
            hip = self.torso((0.0, s * p3.HIP_L, p3.HIP_U))
            hip = (hip[0], hip[1], p3.HIP_U - pose.hip_drop)
            ff, fu = pose.foot[side]
            ankle = (0.5 + ff, s * (p3.HIP_L + 0.6), 2.6 + fu)
            knee = two_bone(hip, ankle, p3.THIGH, p3.SHIN)
            self.segment(hip, knee, 3.8, 3.8, skin, f"thigh_{side}")
            self.segment(knee, ankle, 3.3, 3.3, greave, f"shin_{side}")
            toe = add(ankle, rot_y((3.2, 0.0, -0.6), pose.foot_pitch[side]))
            self.segment(ankle, toe, 2.5, 1.7, shaded(BRONZE, BRONZE_DARK), f"foot_{side}", extra=1.2)

        # The cape hangs down the back; speed (crest_sway) blows it back.
        sway = pose.crest_sway
        self.ellipsoid(self.torso((-5.4 - sway * 0.06, 0.0, 19.5 + sway * 0.04)), T, (1.2, 6.6, 14.5), cape, "cape")
        self.ellipsoid(self.torso((0.0, 0.0, 19.0)), T, (5.4, 7.6, 4.6), skirt, "skirt")
        self.ellipsoid(self.torso((0.2, 0.0, 22.6)), T, (5.2, 7.4, 1.3), shaded(BLACK, BLACK), "belt")
        self.ellipsoid(self.torso((0.4, 0.0, 28.0)), T, (5.0, 8.2, 7.4), cuirass, "cuirass")
        self.ellipsoid(self.torso((0.3, 0.0, 34.5)), T, (2.6, 2.6, 2.4), skin, "neck")

        # Arms.
        for side, s in (("r", -1), ("l", 1)):
            swing, raise_, bend = pose.arm[side]
            sh = self.torso((0.0, s * p3.SHOULDER_L, p3.SHOULDER_U))
            down = (0.0, 0.0, -1.0)
            upper = self.torso_dir(rot_y(rot_x(down, -s * raise_), -swing))
            elbow = add(sh, scale(upper, p3.UPPER_ARM))
            fore = self.torso_dir(rot_y(rot_x(down, -s * raise_ * 0.6), -(swing + bend)))
            wrist = add(elbow, scale(fore, p3.FOREARM))
            hand = add(wrist, scale(fore, 1.6))
            self.ellipsoid(sh, T, (3.8, 3.6, 3.2), cloak, f"shoulder_{side}")
            self.segment(sh, elbow, 2.6, 2.6, skin, f"upper_{side}")
            self.segment(elbow, wrist, 2.4, 2.4, forearm, f"fore_{side}")
            self.ellipsoid(hand, [fore, (0, 1, 0) if abs(fore[1]) < 0.9 else (1, 0, 0),
                                  np.cross(fore, (0, 1, 0)) if abs(fore[1]) < 0.9 else (0, 0, 1)],
                           (2.2, 2.0, 1.8), skin, f"hand_{side}")
            setattr(self, f"hand_{side}", hand)
            setattr(self, f"shoulder_{side}", sh)

        # Head: the helmet and its crest, from the brow over to the nape.
        def head(p):
            rel = np.subtract(p, (0.0, 0.0, p3.NECK_U))
            rel = rot_x(rot_y(tuple(rel), pose.head_pitch), pose.head_roll)
            return self.torso(add((0.0, 0.0, p3.NECK_U), rel))

        def head_dir(v):
            return self.torso_dir(rot_x(rot_y(v, pose.head_pitch), pose.head_roll))

        self.ellipsoid(head(HEAD_C), [head_dir(v) for v in I], HELMET_R, helmet, "helmet")
        for i, (h, lean) in enumerate(CREST_BLADES):
            phi = math.radians(70 + i * 9)
            base = (HEAD_C[0] + math.cos(phi) * 6.0, 0.0, HEAD_C[2] + math.sin(phi) * 6.8)
            out = unit(rot_y((math.cos(phi) * 0.4, 0.0, 1.0), -(lean + pose.crest_sway)))
            tip = add(base, scale(tuple(out), h))
            pa, pb = head(base), head(tip)
            d = unit(np.subtract(pb, pa))
            fwd = head_dir((1, 0, 0))
            self.ellipsoid(tuple((np.asarray(pa) + np.asarray(pb)) / 2),
                           [unit(fwd - d * (fwd @ d)), head_dir((0, 1, 0)), d],
                           (1.4, 1.2, h / 2 + 0.6), crest, f"crest_{i}")

        spin = getattr(pose, "spin", 0.0)
        if spin:
            self.tumble(spin, self.F if getattr(pose, "spin_side", False) else self.L)
        ground = getattr(pose, "ground", 0.0)
        if ground or spin:
            # Never under the floor; with `ground` 1 the body rests on it (the
            # trunk, head and legs: toes and hands pointing down would hold it
            # up in the air).
            low = min(part.c[2] - math.sqrt(((part.axes[:, 2] * part.r) ** 2).sum())
                      for part in self.parts if part.name in RESTS_ON)
            dz = -low if low < 0 else -low * ground
            for part in self.parts:
                part.c = part.c + np.array([0.0, 0.0, dz])
        for part in self.parts:
            part.c = part.c * SIZE
            part.r = part.r * SIZE
        return self.parts

    def tumble(self, angle, k):
        """Turns every part `angle` radians around the axis `k` (the left
        one: forward goes down; the forward one: it falls to its left)
        through the belly."""
        pivot = self.world((0.0, 0.0, 14.0))
        c, s = math.cos(angle), math.sin(angle)
        K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
        R = np.eye(3) + s * K + (1 - c) * (K @ K)
        for part in self.parts:
            part.c = R @ (part.c - pivot) + pivot
            part.axes = part.axes @ R.T


def draw(facing, pose):
    model = Spartan(p3.ANGLE[facing], pose)
    img, _, _ = p3.render(model.build())
    img = img.copy()  # rendered from a numpy array, read-only
    e1.outline(img)
    return img, model


def shadow(size=1.0):
    img = Image.new("RGBA", (W, H))
    px = img.load()
    rx, ry = 12 * size, 3.5 * size
    for y in range(H):
        for x in range(W):
            if ((x - p3.CX) / rx) ** 2 + ((y - FLOOR + 0.5) / ry) ** 2 <= 1:
                px[x, y] = SHADOW
    return img


def footprint(model, near=5.0):
    """The shadow of a body lying on the floor: under every part that comes
    within `near` px of the floor, the outline of that part seen from above,
    on the floor plane, grown a pixel and dropped two so it shows under the
    body's lower edge. Without it a fallen body seems to float."""
    xs = np.arange(W) + 0.5 - p3.CX
    ys = (FLOOR - (np.arange(H) + 0.5)) / p3.K  # floor y of each row
    X, Y = np.meshgrid(xs, ys)
    covered = np.zeros((H, W), dtype=bool)
    for part in model.parts:
        if part.c[2] - math.sqrt(((part.axes[:, 2] * part.r) ** 2).sum()) > near:
            continue
        # The vertical line over (X, Y) meets the ellipsoid if the quadratic
        # in its height has a root.
        a = (part.axes[:, 2] / part.r)  # d/dz of the local coordinates
        rel_x, rel_y = X - part.c[0], Y - part.c[1]
        q0 = [(part.axes[k, 0] * rel_x + part.axes[k, 1] * rel_y - part.axes[k, 2] * part.c[2]) / part.r[k]
              for k in range(3)]
        A = (a ** 2).sum()
        B = 2 * sum(q0[k] * a[k] for k in range(3))
        C = sum(q0[k] ** 2 for k in range(3)) - 1
        covered |= B * B - 4 * A * C >= 0
    grown = covered.copy()
    grown[1:] |= covered[:-1]
    grown[:, 1:] |= covered[:, :-1]
    grown[:, :-1] |= covered[:, 1:]
    covered = np.zeros_like(grown)
    covered[2:] = grown[:-2]
    img = Image.new("RGBA", (W, H))
    px = img.load()
    for y, x in zip(*np.nonzero(covered)):
        px[int(x), int(y)] = SHADOW
    return img


# ---------------------------------------------------------------- animations

def idle(i, n):
    return b.idle(i, n)


def walk(i, n):
    return b.gait(i, stride=8.5, lift=3.2, swing=26, bend=14, lean=6, drop=0.8, sway=6, n=n)


def run(i, n):
    return b.gait(i, stride=11.5, lift=6.0, swing=46, bend=60, lean=18, drop=1.8, sway=16, n=n)


TUCK = dict(hip_drop=7.0, lean=38, arm={"r": (70, 20, 110), "l": (70, 20, 110)},
            foot={"r": (4.0, 6.0), "l": (4.0, 6.0)}, crest_sway=20)


def tucked(curl, spin, rise=0.0):
    """Between standing (0) and tucked into a ball (1), tumbling `spin`."""
    t = e1.ease(curl)
    return Pose(hip_drop=TUCK["hip_drop"] * t, lean=TUCK["lean"] * t, spin=spin, root=(0.0, 0.0, rise),
                arm={k: tuple(a * t + r * (1 - t) for a, r in zip(TUCK["arm"][k], (0.0, 24.0, 8.0))) for k in "rl"},
                foot={k: tuple(v * t for v in TUCK["foot"][k]) for k in "rl"}, crest_sway=TUCK["crest_sway"] * t)


def roll_start(i, n):
    if i < 3:  # crouch to push off
        return tucked(0.25 * i, 0.0)
    u = (i - 2) / (n - 3)
    return tucked(min(1.0, u * 2), math.pi * u * u, rise=3 * math.sin(u * math.pi))


def roll(i, n):
    return tucked(1.0, math.pi + i / n * 2 * math.pi, rise=2.0)


def roll_end(i, n):
    u = (i + 1) / n
    last = i == n - 1
    return tucked(1 - u, 0.0 if last else math.pi + math.pi * (1 - (1 - u) ** 2), rise=2.0 * (1 - u))


POSES = {"idle": idle, "walk": walk, "run": run, "roll_start": roll_start, "roll": roll,
         "roll_end": roll_end}


# ---------------------------------------------------------------- deaths

# Each death: 0-4 the hit, 5-12 what it does on its feet, 13-20 the fall,
# 21-32 lying still (a twitch at 24-25) while the pool grows.
DEATH_FRAMES, DEATH_MS = 33, 80
DEATHS = {"front": "front", "right": "side", "left": "side", "back": "back"}


def ramp(i, a, z):
    return e1.ease((i - a) / (z - a)) if z > a else float(i >= a)


def death_pose(kind, i):
    # The lean on its feet gives way to the fall (lying, it is flat).
    hit, feet, fall = ramp(i, 0, 3), ramp(i, 5, 12), ramp(i, 13, 20)
    up = 1 - fall
    jolt = math.exp(-i / 3) * math.sin(i * 1.6)  # the shock, dying out
    twitch = 1.0 if i in (24, 25) else 0.0
    if kind == "front":
        # Knocked back, arms flung out; staggers back, knees go; on its back.
        return Pose(
            root=(-3.0 * hit - 3.0 * feet, 0.0, 0.0), lean=(-28 * hit * (1 - feet) - 8 * feet) * up,
            hip_drop=7 * feet * (1 - fall), spin=math.pi / 2 * fall, spin_side=True, ground=fall,
            head_pitch=-30 * hit + 20 * feet + 6 * twitch, head_roll=10 * jolt + 25 * fall,
            arm={"r": (-40 * hit + 50 * feet + 60 * fall, 70 * hit * (1 - feet) + 25, 20 + 20 * fall),
                 "l": (-30 * hit + 40 * feet + 70 * fall, 75 * hit * (1 - feet) + 25 + 6 * twitch, 15 + 30 * fall)},
            foot={"r": (-6 * hit * (1 - feet), 3 * hit * (1 - hit)), "l": (4 * feet, 0.0)}, crest_sway=-20 * hit + 10 * feet)
    if kind == "side":
        # Clutches the wound and spins round, drops to its knees, slumps over.
        return Pose(
            twist=(40 * hit - 10 * feet) * up, lean=(15 * hit + 22 * feet) * up, hip_drop=9 * feet * up,
            spin=math.pi / 2 * fall, ground=fall, head_pitch=15 * hit + 20 * feet - 10 * fall,
            head_roll=20 * hit + 25 * fall + 8 * twitch,
            arm={"r": (70, 10, 120 - 40 * fall), "l": (20 * hit + 40 * feet, 40 * hit + 20, 30 + 6 * twitch)},
            foot={"r": (-7 * feet, 0.0), "l": (-5 * feet, 0.0)}, crest_sway=15 * hit + 20 * fall)
    # back: arches from the hit, arms thrown up, stumbles ahead, face down.
    return Pose(
        root=(3.0 * feet, 0.0, 0.0), lean=(-22 * hit * (1 - feet) + 28 * feet) * up, hip_drop=4 * feet * up,
        spin=math.pi / 2 * fall, spin_side=True, ground=fall, head_pitch=-30 * hit + 25 * feet + 4 * twitch,
        head_roll=8 * jolt + 25 * fall,
        arm={"r": (150 * hit * (1 - feet) + 70 * feet + 100 * fall, 30, 10 + 6 * twitch),
             "l": (140 * hit * (1 - feet) + 60 * feet + 110 * fall, 30, 10)},
        foot={"r": (5 * feet, 2 * feet * (1 - feet) * 4), "l": (-2 * feet, 0.0)}, crest_sway=-15 * hit + 25 * fall)


def death_frame(kind, facing, i):
    """The body dying, with its blood: a spurt from the wound at the hit and
    another at the fall, blood on the body and a pool under it once it lies.
    Returns it and its shadow: the one under the feet giving way to the shape
    of the body on the floor as it falls."""
    img, model = draw(facing, death_pose(kind, i))
    fall = ramp(i, 13, 20)
    sh = shadow(1.0 - fall) if fall < 1 else Image.new("RGBA", (W, H))
    if fall > 0:
        sh.alpha_composite(footprint(model))
    chest = next(part.c for part in model.parts if part.name == "cuirass")
    (cx, cy), _ = p3.screen(chest)
    (gx, gy), _ = p3.screen((chest[0], chest[1], 0.0))
    seed = {"front": 11, "side": 12, "back": 13}[kind]
    cv = Image.new("RGBA", (W, H))
    pool = ramp(i, 18, 32)
    if pool > 0:
        e1.pool(cv, gx, pool * 1.25, random.Random(seed), gy + 3)
    cv.alpha_composite(img)
    bleed = 0.3 + 0.7 * ramp(i, 0, 16)
    fx = e1.Pose(bleed=bleed, spray=(i + 1) / 7 if i < 6 else 0.0, drip=None)
    e1.wound(cv, (cx, cy), fx, seed, gy + 3)
    if 14 <= i < 20:  # the second spurt, at the fall
        e1.wound(cv, (cx, cy), e1.Pose(bleed=0.0, spray=(i - 13) / 7, drip=None), seed + 100, gy + 3)
    return cv, sh


# ---------------------------------------------------------------- pinned

# Per facing, where the spearhead enters the wall (forward, left, up; it
# stays put while the body is pushed) and how far the spear sticks out past
# the belly. From the front it goes in above the head, like Enemigo1.
SPEAR = {"front": ((-8.0, 0.0, 54.0), 26.0), "left": ((-8.5, -1.3, 22.0), 28.0),
         "right": ((-8.5, -1.3, 22.0), 28.0)}
PIN_RISE = 3.0


def pinned_body(kind, i, n):
    """The body on the spear. The hit throws it back against the wall, it
    bounces and is left hanging, head down; then it hangs there, twitching."""
    if kind == "pinned_hit":
        t = i / (n - 1)
        push = [8.0, 3.0, 0.0][i] if i < 3 else 0.0
        shake = math.exp(-t * 3.5)
        flail = 50 * shake
        return Pose(root=(push, 0.0, PIN_RISE * e1.ease(i / 3)), lean=-16 if i == 2 else -4 - 8 * shake * math.cos(i * 1.9),
                    head_pitch=-20 * shake + 24 * e1.ease(t), head_roll=12 * shake * math.sin(i * 1.7),
                    arm={"r": (20 + flail, 30 + flail * 0.6, 30), "l": (10 + flail * 0.8, 35 + flail * 0.5, 40)},
                    foot={"r": (2 * shake, 1 + 2 * shake), "l": (-1 * shake, 2 + 2 * shake)},
                    crest_sway=-10 * shake)
    twitch = 1.0 if i in (2, 3) else 0.0
    return Pose(root=(0.0, 0.0, PIN_RISE), lean=-4, head_pitch=24 + 2 * twitch, head_roll=6,
                arm={"r": (5 + 6 * twitch, 18, 12), "l": (2, 16, 10)},
                foot={"r": (1.0, 0.5 + twitch), "l": (0.5, 0.5)})


def pinned_frame(kind, i, n, direction):
    """The body pinned to the wall with the spear and the blood (enemigo1's
    effects): pool, cracked and bloody wall, shaft behind, body, shaft in
    front, blood on the body, spray and drops."""
    fx = e1.PIN_POSES[kind](i, n, direction)  # what the blood does this frame
    pose = pinned_body(kind, i, n)
    img, model = draw(direction, pose)
    wall_local, out, seed = SPEAR[direction] + (("front", "left", "right").index(direction) + 1,)
    shift, _, rise = pose.root
    belly_local = (shift, 0.0, BELLY_U + rise)

    def world(p):
        return p[0] * model.F + p[1] * model.L + p[2] * model.U

    wall, belly = world(wall_local) * SIZE, world(belly_local) * SIZE
    d = unit(belly - wall)
    side = unit(np.cross((0.0, 0.0, 1.0), d))
    tail = belly + d * out * SIZE + side * fx.wobble
    sw, sb, st = (p3.screen(v)[0] for v in (wall, belly, tail))
    rng = random.Random(seed)
    cv = Image.new("RGBA", (W, H))
    if fx.pool > 0:
        e1.pool(cv, sb[0], fx.pool, rng, FLOOR)
    if fx.crack > 0:
        layer = Image.new("RGBA", (W, H))
        keep = None if direction == "front" else (1 if sw[0] > p3.CX else -1)
        e1.cracks(layer, sw, fx.crack, rng, keep)
        e1.wall_blood(layer, sw, fx.crack, fx.bleed, rng, keep)
        cv.alpha_composite(layer)
    back = Image.new("RGBA", (W, H))
    e1.shaft(back, sw, sb)
    e1.spearhead(back, sw, sb)
    e1.outline(back)
    cv.alpha_composite(back)
    cv.alpha_composite(img)
    front = Image.new("RGBA", (W, H))
    e1.shaft(front, sb, st)
    e1.outline(front)
    cv.alpha_composite(front)
    e1.wound(cv, sb, fx, seed * 7, FLOOR)
    return cv, pose


# ---------------------------------------------------------------- output

# e1.LAYOUT with its one death replaced by the three deaths.
LAYOUT = ([entry for entry in e1.LAYOUT if entry[0] != "death"]
          + [(f"death_{d}", DEATH_FRAMES, DEATH_MS) for d in DEATHS])


def frames():
    """Yields (body layer, shadow layer, ms) for every frame of LAYOUT."""
    for tag, n, ms in LAYOUT:
        if tag.startswith("death_"):
            facing = tag[len("death_"):]
            for i in range(n):
                img, sh = death_frame(DEATHS[facing], facing, i)
                yield img, sh, ms
            continue
        kind, direction = "idle", "front"
        for k in ("roll_start", "roll_end", "roll", "idle", "walk", "run", "pinned_hit", "pinned"):
            if tag.startswith(k + "_"):
                kind, direction = k, tag[len(k) + 1:]
                break
        for i in range(n):
            if kind.startswith("pinned"):
                img, pose = pinned_frame(kind, i, n, direction)
                yield img, shadow(0.85), ms
                continue
            img, _ = draw(direction, POSES[kind](i, n))
            yield img, shadow(0.8 if kind.startswith("roll") else 1.0), ms


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    sheet, durations = [], []
    for k, (img, sh, ms) in enumerate(frames()):
        img.save(os.path.join(out, f"Espartano_{k}.png"))
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
        prev = Image.new("RGBA", (W * cols, H * rows), (64, 74, 64, 255))
        for k, f in enumerate(sheet):
            prev.alpha_composite(f, ((k % cols) * W, (k // cols) * H))
        prev.save(path)


if __name__ == "__main__":
    main()
