"""Every animation of Personaje_3, posed on the model of personaje_3.py.

All of them are rendered in the 8 directions, never mirrored, so the weapon
is always in the RIGHT hand (the black sleeve).

Animations (tag_<direction>, frames x ms):
- idle 8x~112, walk 10x44, run 10x34
- jump 10: crouch, take off, tuck, reach down, land. The game lifts the
  sprite: frames 2-7 are in the air (JUMP_AIR in the client).
- jump_attack 6: a slash in the air, legs tucked; the jump goes on after it.
- attack 8: a chop on the ground (ATTACK_MS, the same as Personaje_2).
- slam 12: both fists up and down onto the floor. Dirt bursts out at the
  impact (frame SLAM_IMPACT), in the personaje_3_tierra overlays.
- pickup 7: bends down and takes the weapon from the floor.
- throw 11: an exaggerated spear throw (THROW_RELEASE: the frame it lets go).
  Winds up far back (torso turned away, leaning back, the free hand aiming
  ahead), explodes forward and lets go (from then on the hand is empty: the
  game draws the spear flying), follows through and recovers.
- death 33x80 (one direction, down_left like the drawing).

Output (client/public), every sheet packed (armas.write_packed_sheet: each
frame cut down to its pixels, repeated ones stored once):
- sprites/personaje_3: the body, bare hands (claws open).
- sprites/personaje_3_armado: the same frames gripping with the right hand,
  and the right arm in the carry pose in idle/walk/run/jump.
- sprites/personaje_3_tierra(_atras): 160x128 dirt overlays for slam, drawn
  in front of / behind the body; the body canvas sits at (48, 32).
- per weapon <id>: sprites/<id>_fx(_atras), 128x128 overlays (body at
  (32, 32)) with a frame for EVERY body frame: the weapon in the right hand,
  turned with the arm (carried low at the side while walking), the smear in
  the swings, lying on the floor at the start of pickup. Empty in slam and
  death. And assets/<id> (lying on the floor, and as carried).

Adding a weapon: draw it like Hacha.aseprite, add it to armas.WEAPONS and to
ITEMS in client/src/domain/items.ts, and run bash art/armas_build.sh.

Writes the frames for the .aseprite too: <frames_dir>/libre_<n>.png,
armado_<n>.png, tags.txt and durations.txt (p3_aseprite.lua builds it).

Usage: python3 personaje_3_build.py <weapon_pngs_dir> <client/public> <frames_dir>
"""
import copy
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image

import armas
import personaje_3 as p3
from personaje_3 import Pose, Model, render, screen, screen_dir, rot_y, rot_x, unit

DIRS = p3.DIRS
FX = 128
FX_OFFSET = (32, 32)
DIRT_W, DIRT_H = 160, 128
DIRT_OFFSET = (48, 32)
DOWN = (0.0, 0.0, -1.0)

# The swing smear in the drawing's colours: grey inside, white at the edge.
armas.SMEAR = [p3.MASK_SHADE, p3.MASK, p3.MASK]

# Carrying: the right arm down at the side, the weapon held low, head forward.
CARRY_ARM = (15.0, 26.0, 25.0)
CARRY_W = 55


def pose(**kw):
    return Pose(**kw)


# ---------------------------------------------------------------- loops

def idle(i, n=8):
    b = math.sin(2 * math.pi * i / n)
    return pose(hip_drop=0.4 + 0.4 * b, crest_sway=3 * b, head_pitch=2 * b,
                arm={"r": (2 * b, 24.0, 8 + 3 * b), "l": (-2 * b, 24.0, 8 + 3 * b)})


def gait(i, stride, lift, swing, bend, lean, drop, sway, n=10):
    """A step cycle. Each foot swings FORWARD while lifted and slides back
    while planted (the planted foot is what pushes the body ahead). The body
    is lowest when a foot lands and highest as the legs pass each other; each
    arm swings with the opposite leg."""
    ph = 2 * math.pi * i / n
    c, s = math.cos(ph), math.sin(ph)
    # Right foot: d(-cos)/dph = sin > 0 while it is up (s > 0), so it goes forward.
    return pose(
        foot={"r": (-stride * c, max(0.0, round(lift * s, 6))), "l": (stride * c, max(0.0, round(-lift * s, 6)))},
        foot_pitch={"r": -15 * max(0.0, s), "l": -15 * max(0.0, -s)},
        hip_drop=drop + 0.9 * (1 + math.cos(2 * ph)) / 2,
        lean=lean, twist=7 * c, crest_sway=sway + 3 * abs(s),
        arm={"r": (swing * c, 18.0, bend), "l": (-swing * c, 18.0, bend)},
        head_pitch=-lean * 0.4)


def walk(i):
    return gait(i, stride=8.5, lift=3.2, swing=26, bend=14, lean=6, drop=0.8, sway=6)


def run(i):
    return gait(i, stride=11.5, lift=6.0, swing=46, bend=60, lean=18, drop=1.8, sway=16)


# ---------------------------------------------------------------- jump

JUMP_MS = [70, 70, 60, 60, 70, 70, 60, 60, 70, 80]
JUMP_AIR = (2, 7)  # first and last frame in the air
JUMP = [
    dict(hip_drop=4, lean=16, arm=(-35, 16, 15), crest_sway=8),
    dict(hip_drop=6.5, lean=22, arm=(-55, 18, 10), crest_sway=10, head_pitch=-8),
    dict(lean=4, arm=(120, 30, 10), foot={"r": (-1, 1), "l": (-2, 0.5)}, crest_sway=24, head_pitch=-6),
    dict(lean=6, arm=(140, 36, 15), foot={"r": (-2, 4), "l": (1, 3)}, crest_sway=20),
    dict(lean=10, arm=(70, 55, 40), foot={"r": (1, 7), "l": (-2, 6)}, crest_sway=6),
    dict(lean=10, arm=(60, 60, 40), foot={"r": (1, 7), "l": (-2, 6)}, crest_sway=0),
    dict(lean=4, arm=(30, 70, 20), foot={"r": (2, 3), "l": (0, 2)}, crest_sway=-12),
    dict(lean=2, arm=(20, 60, 15), foot={"r": (2, 0.8), "l": (-0.5, 0.5)}, crest_sway=-16),
    dict(hip_drop=5.5, lean=18, arm=(30, 30, 20), crest_sway=6, head_pitch=6),
    dict(hip_drop=2, lean=6, arm=(10, 26, 12), crest_sway=2),
]


def jump(i):
    s = dict(JUMP[i])
    arm = s.pop("arm")
    foot = s.pop("foot", {"r": (0.0, 0.0), "l": (0.0, 0.0)})
    return pose(arm={"r": arm, "l": arm}, foot=foot, **s)


# ---------------------------------------------------------------- weapon swings
# Each step: right arm (swing, raise, bend), torso twist and lean, crouch,
# weapon angle w (degrees from straight down, positive forward, so 90 is
# straight ahead and 180 straight up), and whether the smear draws.

ATTACK_MS = armas.ATTACK_MS  # [60, 70, 40, 40, 60, 70, 50, 60]
ATTACK = [
    dict(arm=(100, 20, 40), twist=-20, lean=-4, hip_drop=0.5, w=230),
    dict(arm=(150, 18, 30), twist=-28, lean=-8, hip_drop=0.0, w=250),
    dict(arm=(120, 15, 15), twist=-8, lean=4, hip_drop=0.5, w=190, smear=True),
    dict(arm=(70, 12, 5), twist=12, lean=14, hip_drop=1.5, w=130, smear=True),
    dict(arm=(30, 10, 0), twist=24, lean=20, hip_drop=2.5, w=80, smear=True),
    dict(arm=(15, 10, 0), twist=26, lean=20, hip_drop=2.5, w=60, smear="fade"),
    dict(arm=(20, 18, 30), twist=14, lean=10, hip_drop=1.5, w=100),
    dict(arm=CARRY_ARM, w=CARRY_W),
]
AIR_LEGS = {"r": (-1.0, 6.0), "l": (2.0, 5.0)}
JUMP_ATTACK_MS = [60, 40, 40, 60, 70, 80]
JUMP_ATTACK = [
    dict(arm=(150, 20, 30), twist=-25, lean=-6, w=240),
    dict(arm=(110, 15, 10), twist=-5, lean=6, w=180, smear=True),
    dict(arm=(50, 10, 0), twist=18, lean=18, w=100, smear=True),
    dict(arm=(10, 10, 0), twist=24, lean=22, w=50, smear="fade"),
    dict(arm=(30, 18, 30), twist=12, lean=10, w=100),
    dict(arm=CARRY_ARM, lean=4, w=CARRY_W),
]
# One continuous move: bends down, grabs at the lowest point (PICKUP_GRAB, the
# weapon lies right under that hand) and comes straight back up. w is relative
# to the torso, so w = 90 - lean keeps the weapon flat on the floor.
PICKUP_MS = [60, 70, 80, 70, 70, 90]
PICKUP_GRAB = 2
PICKUP = [
    dict(arm=(25, 20, 15), lean=16, hip_drop=2, floor=True),
    dict(arm=(45, 23, 8), lean=32, hip_drop=5, floor=True),
    dict(arm=(55, 25, 5), lean=42, hip_drop=7, w=90 - 42),
    dict(arm=(40, 24, 15), lean=26, hip_drop=4, w=62),
    dict(arm=(25, 25, 22), lean=10, hip_drop=1.5, w=57),
    dict(arm=CARRY_ARM, w=CARRY_W),
]


# The throw. Besides the swing keys: other = the free arm, foot = the feet,
# root = whole body shift (forward, left, up), crest/head = crest_sway and
# head_pitch. After the release the hand is open (open) and the spear gone.
THROW_MS = [90, 80, 220, 50, 40, 50, 60, 120, 90, 80, 90]
THROW_RELEASE = 4
_STANCE = {"r": (-7.0, 0.0), "l": (8.0, 0.0)}   # back foot behind, front foot ahead
THROW = [
    dict(arm=(120, 26, 60), twist=-12, lean=4, hip_drop=1.5, w=120, other=(20, 26, 20),
         foot={"r": (-3.0, 0.0), "l": (3.0, 1.5)}, crest=-4),
    dict(arm=(185, 26, 85), twist=-34, lean=-12, hip_drop=2.5, w=105, other=(70, 22, 10),
         foot=_STANCE, root=(-2.0, 0.0, 0.0), crest=-12, head=-6),
    dict(arm=(215, 30, 100), twist=-48, lean=-24, hip_drop=3.5, w=100, other=(95, 18, 0),
         foot=_STANCE, root=(-3.5, 0.0, 0.0), crest=-18, head=-10),
    dict(arm=(170, 20, 45), twist=-8, lean=0, hip_drop=2.5, w=96, other=(60, 22, 10),
         foot=_STANCE, root=(0.0, 0.0, 0.0), crest=6, smear=True),
    dict(arm=(105, 14, 5), twist=32, lean=24, hip_drop=3.0, w=92, other=(-30, 30, 20),
         foot=_STANCE, root=(4.0, 0.0, 0.0), crest=20, head=6, open=True, gone=True),
    dict(arm=(45, 12, 0), twist=48, lean=36, hip_drop=4.5, w=92, other=(-45, 34, 25),
         foot={"r": (-1.0, 3.0), "l": (8.0, 0.0)}, root=(6.0, 0.0, 0.0), crest=28, head=8, open=True, gone=True),
    dict(arm=(20, 14, 0), twist=50, lean=38, hip_drop=5.0, w=92, other=(-45, 34, 25),
         foot={"r": (4.0, 2.0), "l": (8.0, 0.0)}, root=(6.5, 0.0, 0.0), crest=22, head=8, open=True, gone=True),
    dict(arm=(18, 15, 2), twist=46, lean=36, hip_drop=4.8, w=92, other=(-40, 32, 22),
         foot={"r": (6.0, 0.0), "l": (8.0, 0.0)}, root=(6.5, 0.0, 0.0), crest=14, head=6, open=True, gone=True),
    dict(arm=(25, 20, 15), twist=24, lean=20, hip_drop=3.0, w=92, other=(-10, 26, 15),
         foot={"r": (4.0, 0.0), "l": (5.0, 0.0)}, root=(4.0, 0.0, 0.0), crest=6, open=True, gone=True),
    dict(arm=(8, 23, 10), twist=8, lean=6, hip_drop=1.2, w=92, other=(0, 24, 8),
         foot={"r": (1.0, 0.0), "l": (2.0, 0.0)}, root=(1.0, 0.0, 0.0), crest=2, open=True, gone=True),
    dict(arm=(0, 24, 8), w=92, open=True, gone=True),
]


def swing_pose(step, legs=None, other=(0.0, 24.0, 8.0)):
    kw = {k: step[k] for k in ("twist", "lean", "hip_drop") if k in step}
    p = pose(arm={"r": step["arm"], "l": step.get("other", other)},
             fist={"r": not step.get("open"), "l": False}, **kw)
    if legs:
        p.foot = dict(legs)
    if "foot" in step:
        p.foot = dict(step["foot"])
    if "root" in step:
        p.root = step["root"]
    p.crest_sway = step.get("crest", p.crest_sway)
    p.head_pitch = step.get("head", p.head_pitch)
    return p


# ---------------------------------------------------------------- slam

SLAM_MS = [80, 70, 60, 50, 60, 80, 80, 80, 80, 70, 70, 80]
SLAM_IMPACT = 4
SLAM = [
    dict(arm=(60, 20, 40), hip_drop=1.5, lean=6),
    dict(arm=(150, 16, 20), lean=-10, root=3.0, crest_sway=-8, head_pitch=-10),
    dict(arm=(172, 14, 10), lean=-14, root=5.0, crest_sway=-10, head_pitch=-12),
    dict(arm=(120, 14, 0), lean=12, root=2.5, crest_sway=10),
    dict(arm=(14, 10, 0), lean=40, hip_drop=8.5, crest_sway=26, head_pitch=-10),
    dict(arm=(12, 10, 0), lean=42, hip_drop=9, crest_sway=18, head_pitch=-8),
    dict(arm=(12, 11, 0), lean=41, hip_drop=8.5, crest_sway=10, head_pitch=-8),
    dict(arm=(12, 13, 2), lean=38, hip_drop=8, crest_sway=6, head_pitch=-6),
    dict(arm=(40, 18, 10), lean=26, hip_drop=5, crest_sway=4),
    dict(arm=(20, 22, 10), lean=12, hip_drop=3),
    dict(arm=(5, 24, 8), lean=4, hip_drop=1),
    dict(arm=(0, 24, 8)),
]


def slam(i):
    s = dict(SLAM[i])
    arm = s.pop("arm")
    root = s.pop("root", 0.0)
    fists = 1 <= i <= 9
    return pose(arm={"r": arm, "l": arm}, fist={"r": fists, "l": fists}, root=(0.0, 0.0, root),
                foot={"r": (-0.5, 0.0), "l": (1.5, 0.0)} if i >= SLAM_IMPACT else {"r": (0.0, 0.0), "l": (0.0, 0.0)}, **s)


# ---------------------------------------------------------------- death

DEATH_FRAMES = 33


def death(i):
    def ramp(a, b):
        return min(1.0, max(0.0, (i - a) / (b - a)))
    hit, knees, fall = ramp(0, 5), ramp(5, 12), ramp(12, 18)
    twitch = 1.0 if i in (22, 23) else 0.0
    return pose(
        lean=-16 * hit * (1 - knees) + 30 * knees + 52 * fall,
        hip_drop=9 * knees + 5 * fall,
        head_pitch=-22 * hit * (1 - knees) + 15 * knees + 10 * fall - 6 * twitch,
        head_roll=35 * fall,
        foot={"r": (-5 * knees - 2 * fall, 0.0), "l": (-7 * knees - 3 * fall, 0.0)},
        arm={"r": (-20 * hit + 30 * knees + 80 * fall, 40 * hit * (1 - knees) + 20, 10 + 20 * fall),
             "l": (-25 * hit + 25 * knees + 70 * fall, 45 * hit * (1 - knees) + 22, 10 + 20 * fall)},
        crest_sway=-6 * hit + 20 * knees - 30 * fall)


# ---------------------------------------------------------------- weapon drawing

def weapon_dir(model, w, side="r"):
    """World direction of the weapon head at angle w, in that arm's plane
    (tilted a little out to its own side)."""
    return model.wdir(model.torso_dir(rot_x(rot_y(DOWN, -w), 8 if side == "r" else -8)))


def screen_angle(d):
    sx, sy = screen_dir(d)
    return math.degrees(math.atan2(sx, -sy))


def edge_clockwise(model, w, side="r"):
    """The swings bring w down: the edge faces the way the head moves."""
    a, b = screen_dir(weapon_dir(model, w, side)), screen_dir(weapon_dir(model, w - 8, side))
    move = b - a
    cw = np.array([-a[1], a[0]])
    return float(move @ cw) >= 0


def fist(img, at, color=p3.BLACK):
    px = img.load()
    for dx, dy in ((0, 0), (-1, 0), (0, -1), (-1, -1), (1, 0)):
        x, y = int(at[0]) + dx, int(at[1]) + dy
        if 0 <= x < img.width and 0 <= y < img.height:
            px[x, y] = color + (255,)


def weapon_frames(weapon, models, plan, floor_at=None):
    """The fx overlays (front, behind): per frame its model and step (None: no
    weapon; floor: lying at floor_at; else the weapon at angle w in the hand)."""
    fronts, backs = [], []
    ox, oy = FX_OFFSET
    prev_w = None
    for model, step in zip(models, plan):
        front, back = Image.new("RGBA", (FX, FX)), Image.new("RGBA", (FX, FX))
        fronts.append(front)
        backs.append(back)
        if step is None or step.get("gone"):
            prev_w = None
            continue
        (hx, hy), hand_depth = screen(model.world(model.hand_r))
        (sx, sy), _ = screen(model.world(model.shoulder_r))
        _, body_depth = screen(model.world(model.torso((0.0, 0.0, 26.0))))
        hand = (int(hx) + ox, int(hy) + oy)
        if step.get("floor"):
            (fx, fy), angle, edge_ccw = floor_at
            weapon.paste(front, (int(fx) + ox, int(fy) + oy), angle, carry=edge_ccw)
            layer = None
        else:
            w = step["w"]
            if w == CARRY_W:
                w = weapon.carry_w  # a torch is carried upright, a weapon forward
            layer = back if hand_depth > body_depth + 0.5 else front
            if step.get("smear") and prev_w is not None:
                a0 = screen_angle(weapon_dir(model, prev_w))
                a1 = screen_angle(weapon_dir(model, w))
                while a1 - a0 > 180:
                    a1 -= 360
                while a0 - a1 > 180:
                    a1 += 360
                arm = math.hypot(hx - sx, hy - sy)
                armas.smear(layer, (int(sx) + ox, int(sy) + oy), min(a0, a1), max(a0, a1),
                            arm * 0.8, arm + weapon.reach * 0.9, step["smear"] == "fade")
            weapon.paste(layer, hand, screen_angle(weapon_dir(model, w)), carry=not edge_clockwise(model, w))
            fist(layer, hand)
        prev_w = step.get("w", prev_w)
    return fronts, backs


# ---------------------------------------------------------------- dirt

DIRT = [p3.WRAP, p3.SKIN_DARK, p3.BLACK, p3.WRAP]
DUST = [p3.MASK_SHADE, p3.SKIN]


def dirt_frames(impact_world, body_depth, seed):
    """Dirt clods thrown up from the impact, a ring of dust and cracks on the
    floor. Returns (front, behind) per slam frame."""
    rnd = random.Random(seed)
    clods = []
    for _ in range(80):
        a = rnd.uniform(0, 2 * math.pi)
        speed = rnd.uniform(25, 75)
        clods.append(dict(v=(math.cos(a) * speed, math.sin(a) * speed, rnd.uniform(40, 115)),
                          size=rnd.choice((1, 2, 2, 2, 3, 3)), color=rnd.choice(DIRT)))
    puffs = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.6, 1.0), rnd.uniform(2.5, 4.5)) for _ in range(12)]
    cracks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(7, 15)) for _ in range(7)]
    fronts, backs = [], []
    ox, oy = DIRT_OFFSET
    elapsed = 0
    for i, ms in enumerate(SLAM_MS):
        front, back = Image.new("RGBA", (DIRT_W, DIRT_H)), Image.new("RGBA", (DIRT_W, DIRT_H))
        if i >= SLAM_IMPACT:
            t = elapsed / 1000.0
            k = i - SLAM_IMPACT
            fade = max(0.0, 1.0 - k / 7.0)
            ix, iy, _ = impact_world
            # Cracks, growing then fading out with a dither.
            crack = back.load()
            for a, length in cracks:
                reach = length * min(1.0, 0.35 + k * 0.25)
                for r in np.arange(1.5, reach, 0.5):
                    jit = math.sin(r * 1.7 + a * 5) * 0.9
                    wx = ix + math.cos(a) * r - math.sin(a) * jit
                    wy = iy + math.sin(a) * r + math.cos(a) * jit
                    (x, y), _ = screen((wx, wy, 0.0))
                    x, y = int(x + ox), int(y + oy)
                    if 0 <= x < DIRT_W and 0 <= y < DIRT_H and ((x + y) % 4 != 0 or fade > 0.5) and fade > 0.15:
                        crack[x, y] = p3.BLACK + (255,)
            # Dust ring on the floor.
            ring = 5 + 7 * k
            for j in range(int(ring * 5)):
                a = 2 * math.pi * j / int(ring * 5)
                if (j + k) % 3 == 0 or rnd.random() > fade:
                    continue
                wpt = (ix + math.cos(a) * ring, iy + math.sin(a) * ring, 1.0 + 1.5 * abs(math.sin(a * 3 + k)))
                (x, y), depth = screen(wpt)
                layer = back if depth > body_depth else front
                x, y = int(x + ox), int(y + oy)
                if 0 <= x < DIRT_W and 0 <= y < DIRT_H:
                    layer.putpixel((x, y), DUST[j % 2] + (255,))
            # Dust puffs rolling out over the floor, thinning out (dithered).
            for a, far, size in puffs:
                r = (4 + 6 * k) * far
                cx_, cy_ = ix + math.cos(a) * r, iy + math.sin(a) * r
                rad = size * (1 + 0.25 * k)
                for py in np.arange(-rad, rad, 1.0):
                    for px_ in np.arange(-rad, rad, 1.0):
                        if px_ * px_ + py * py > rad * rad:
                            continue
                        wpt = (cx_ + px_, cy_, 1.5 + rad + py)
                        (x, y), depth = screen(wpt)
                        x, y = int(x + ox), int(y + oy)
                        keep = (x * 3 + y * 5 + k) % 7 < 7 * fade
                        if keep and 0 <= x < DIRT_W and 0 <= y < DIRT_H:
                            layer = back if depth > body_depth else front
                            light = py > rad * 0.2
                            layer.putpixel((x, y), (DUST[1] if light else DUST[0]) + (255,))
            # Flying clods: thrown up, fall, and stay on the floor a moment.
            for c in clods:
                vx, vy, vz = c["v"]
                z = vz * t - 300 * t * t / 2
                landed = z < 0
                tt = t if not landed else (vz / 150)
                wpt = (ix + vx * tt, iy + vy * tt, max(0.0, z))
                if landed and k > 5:
                    continue
                (x, y), depth = screen(wpt)
                layer = back if depth > body_depth else front
                x, y = int(x + ox), int(y + oy)
                for dx in range(c["size"]):
                    for dy in range(max(1, c["size"] - 1)):
                        if 0 <= x + dx < DIRT_W and 0 <= y + dy < DIRT_H:
                            layer.putpixel((x + dx, y + dy), c["color"] + (255,))
            elapsed += ms
        fronts.append(front)
        backs.append(back)
    return fronts, backs


def left_frames(weapon, models, steps):
    """The fx overlays (front, behind) of a weapon in the left hand: always
    carried, at the left hand of each frame's left-armed model."""
    fronts, backs = [], []
    ox, oy = FX_OFFSET
    for model, step in zip(models, steps):
        front, back = Image.new("RGBA", (FX, FX)), Image.new("RGBA", (FX, FX))
        fronts.append(front)
        backs.append(back)
        if step is None:
            continue
        (hx, hy), hand_depth = screen(model.world(model.hand_l))
        _, body_depth = screen(model.world(model.torso((0.0, 0.0, 26.0))))
        hand = (int(hx) + ox, int(hy) + oy)
        layer = back if hand_depth > body_depth + 0.5 else front
        w = weapon.carry_w
        weapon.paste(layer, hand, screen_angle(weapon_dir(model, w, "l")), carry=not edge_clockwise(model, w, "l"))
        fist(layer, hand)
    return fronts, backs


# ---------------------------------------------------------------- assembly

class Sheet:
    """The frames of every animation, with what the weapon does in each."""

    def __init__(self):
        self.free, self.armed, self.models, self.steps, self.ms, self.tags = [], [], [], [], [], []
        # The same with something in the left hand (and in both): the left
        # hand's body frames, its models and whether it carries (None: no).
        self.armed_l, self.armed_both, self.models_l, self.steps_l = [], [], [], []

    def add(self, tag, free, armed, models, steps, ms, left=None):
        start = len(self.free)
        self.free += free
        self.armed += armed
        self.models += models
        self.steps += steps
        self.ms += ms
        armed_l, armed_both, models_l, steps_l = left or (free, armed, [None] * len(free), [None] * len(free))
        self.armed_l += armed_l
        self.armed_both += armed_both
        self.models_l += models_l
        self.steps_l += steps_l
        self.tags.append((tag, start, len(self.free) - 1))


def armed_version(p):
    """Gripping with the right hand, the arm in the carry pose (it still swings
    a little with the gait)."""
    a = copy.deepcopy(p)
    a.fist = {"r": True, "l": a.fist["l"]}
    swing = a.arm["r"][0]
    a.arm["r"] = (CARRY_ARM[0] + swing * 0.2, CARRY_ARM[1], CARRY_ARM[2])
    return a


def left_armed(p):
    """Gripping with the left hand, that arm in the carry pose too."""
    a = copy.deepcopy(p)
    a.fist = {"r": a.fist["r"], "l": True}
    swing = a.arm["l"][0]
    a.arm["l"] = (CARRY_ARM[0] + swing * 0.2, CARRY_ARM[1], CARRY_ARM[2])
    return a


def left_versions(d, bare, armed):
    """Body frames with the left hand gripping (alone and with the right one)
    and the left-armed model."""
    img_l, model_l = p3.draw(d, left_armed(bare))
    img_both = p3.draw(d, left_armed(armed))[0]
    return img_l, img_both, model_l


def loop(sheet, name, poses, ms, carry=True):
    for d in DIRS:
        free, armed, models = [], [], []
        armed_l, armed_both, models_l = [], [], []
        for p in poses:
            free.append(p3.draw(d, p)[0])
            img, model = p3.draw(d, armed_version(p) if carry else p)
            armed.append(img)
            models.append(model)
            if carry:
                img_l, img_both, model_l = left_versions(d, p, armed_version(p))
                armed_l.append(img_l)
                armed_both.append(img_both)
                models_l.append(model_l)
        steps = [{"w": CARRY_W} if carry else None] * len(poses)
        left = (armed_l, armed_both, models_l, steps) if carry else None
        sheet.add(f"{name}_{d}", free, armed, models, steps, list(ms), left)


def weapon_animation(sheet, name, plan, ms, legs):
    for d in DIRS:
        free, armed, models = [], [], []
        armed_l, armed_both, models_l = [], [], []
        for step in plan:
            p = swing_pose(step, legs)
            img, model = p3.draw(d, p)
            armed.append(img)
            models.append(model)
            bare = copy.deepcopy(p)
            bare.fist = {"r": False, "l": False}
            free.append(p3.draw(d, bare)[0])
            img_l, img_both, model_l = left_versions(d, bare, p)
            armed_l.append(img_l)
            armed_both.append(img_both)
            models_l.append(model_l)
        carry = [{"w": CARRY_W}] * len(plan)
        sheet.add(f"{name}_{d}", free, armed, models, list(plan), list(ms), (armed_l, armed_both, models_l, carry))


def main(weapon_dir_path, public, frames_dir):
    sheet = Sheet()
    # The planted foot slides back 2 x stride in half a cycle, close to the
    # speed the body moves at: walk 17 px / 220 ms = 77 px/s (C: 110), run
    # 23 px / 170 ms = 135 px/s (C: 176). Matching exactly would need a
    # frantic cycle or legs longer than the model's.
    loop(sheet, "idle", [idle(i) for i in range(8)], [113, 112] * 4)
    loop(sheet, "walk", [walk(i) for i in range(10)], [44] * 10)
    loop(sheet, "run", [run(i) for i in range(10)], [34] * 10)
    loop(sheet, "jump", [jump(i) for i in range(len(JUMP))], JUMP_MS)
    loop(sheet, "slam", [slam(i) for i in range(len(SLAM))], SLAM_MS, carry=False)
    weapon_animation(sheet, "attack", ATTACK, ATTACK_MS, None)
    weapon_animation(sheet, "jump_attack", JUMP_ATTACK, JUMP_ATTACK_MS, AIR_LEGS)
    weapon_animation(sheet, "pickup", PICKUP, PICKUP_MS, None)
    weapon_animation(sheet, "throw", THROW, THROW_MS, None)
    death_imgs = []
    for i in range(DEATH_FRAMES):
        img, model = p3.draw("down_left", death(i))
        death_imgs.append(img)
    sheet.add("death", death_imgs, death_imgs, [None] * DEATH_FRAMES, [None] * DEATH_FRAMES, [80] * DEATH_FRAMES)

    # Where the weapon lies before the pickup: exactly as the hand takes it in
    # the grab frame, so it does not jump.
    floor = {}
    for tag, a, b in sheet.tags:
        if tag.startswith("pickup_"):
            grab = sheet.models[a + PICKUP_GRAB]
            w = PICKUP[PICKUP_GRAB]["w"]
            hand = screen(grab.world(grab.hand_r))[0]
            floor[tag] = ((int(hand[0]), int(hand[1])), screen_angle(weapon_dir(grab, w)), not edge_clockwise(grab, w))

    W, H = p3.W, p3.H
    armas.write_packed_sheet(f"{public}/sprites/personaje_3", sheet.free, sheet.ms, sheet.tags, "personaje_3")
    armas.write_packed_sheet(f"{public}/sprites/personaje_3_armado", sheet.armed, sheet.ms, sheet.tags,
                             "personaje_3_armado")
    for suffix, frames in (("armado_izq", sheet.armed_l), ("armado_ambas", sheet.armed_both)):
        armas.write_packed_sheet(f"{public}/sprites/personaje_3_{suffix}", frames, sheet.ms, sheet.tags,
                                 f"personaje_3_{suffix}")

    for spec in armas.WEAPONS:
        weapon = armas.Weapon(spec, f"{weapon_dir_path}/{spec['id']}.png")
        fronts, backs = [], []
        for tag, a, b in sheet.tags:
            f, bk = weapon_frames(weapon, sheet.models[a:b + 1], sheet.steps[a:b + 1], floor.get(tag))
            fronts += f
            backs += bk
        left_front, left_back = left_frames(weapon, sheet.models_l, sheet.steps_l)
        for suffix, frames in (("fx", fronts), ("fx_atras", backs), ("fx_izq", left_front),
                               ("fx_izq_atras", left_back)):
            armas.write_packed_sheet(f"{public}/sprites/{weapon.id}_{suffix}", frames, sheet.ms, sheet.tags,
                                     f"{weapon.id}_{suffix}")
        armas.item_sheet(weapon, f"{public}/assets/{weapon.id}", spec["angle"])

    # Slam dirt, per direction, from where the fists hit the floor.
    dirt_front, dirt_back, dirt_tags = [], [], []
    for d in DIRS:
        model = Model(p3.ANGLE[d], slam(SLAM_IMPACT))
        model.build()
        a, b = model.world(model.hand_r), model.world(model.hand_l)
        impact = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.0)
        _, body_depth = screen(model.world(model.torso((0.0, 0.0, 26.0))))
        f, bk = dirt_frames(impact, body_depth, seed=7)
        dirt_tags.append((f"slam_{d}", len(dirt_front), len(dirt_front) + len(f) - 1))
        dirt_front += f
        dirt_back += bk
    for suffix, frames in (("tierra", dirt_front), ("tierra_atras", dirt_back)):
        armas.write_packed_sheet(f"{public}/sprites/personaje_3_{suffix}", frames, SLAM_MS * len(DIRS), dirt_tags,
                                 f"personaje_3_{suffix}")

    os.makedirs(frames_dir, exist_ok=True)
    for i, (a, b) in enumerate(zip(sheet.free, sheet.armed)):
        a.save(f"{frames_dir}/libre_{i}.png")
        b.save(f"{frames_dir}/armado_{i}.png")
    with open(f"{frames_dir}/tags.txt", "w") as f:
        f.writelines(f"{n} {a} {b}\n" for n, a, b in sheet.tags)
    with open(f"{frames_dir}/durations.txt", "w") as f:
        f.writelines(f"{ms}\n" for ms in sheet.ms)
    print(f"frames {len(sheet.free)}, dirt {len(dirt_front)}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
