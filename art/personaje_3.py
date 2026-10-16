"""Personaje_3: the masked goblin with the red crest, from Brian's
Personaje_P_3.aseprite (one frame, three-quarter view facing left).

The character is a small 3D model built from that drawing, rendered in the
game's three-quarter view in all 8 directions. Nothing is mirrored: the
costume is asymmetric, like the drawing:
- left arm bare (green skin with brown wraps), right arm in a black sleeve;
- right leg bare and wrapped, left leg in black;
- a white bird-skull mask with a long beak, a black tunic and a brown collar;
- a red crest with pink streaks along the top of the head.
Since the left views are rendered and not mirrored, a weapon always stays in
the right hand.

Each part is an ellipsoid, ray cast with an orthographic camera that looks
down at the game's angle (K). It is shaded with the 8 colours of the drawing.

personaje_3_build.py poses this model into every animation.

Usage (preview of the rest pose): python3 personaje_3.py <out.png> [drawing.png]
"""
import math
import sys

import numpy as np
from PIL import Image

W, H = 64, 96
FLOOR = 82            # feet line, same as Personaje_2
CX = 32
K = 0.35              # ground foreshortening: sy = FLOOR - (z + K * y)

# The palette of the drawing.
BLACK = (0, 0, 0)
SKIN = (0x8F, 0x97, 0x4A)
SKIN_DARK = (0x52, 0x4B, 0x24)
WRAP = (0x66, 0x39, 0x31)
MASK = (255, 255, 255)
MASK_SHADE = (0x6F, 0x6A, 0x72)
CREST = (0xAC, 0x32, 0x32)
CREST_LIGHT = (0xD9, 0x57, 0x63)

# Facing angle in the world plane (x right, y away from the camera).
ANGLE = {"right": 0, "up_right": 45, "back": 90, "up_left": 135, "left": 180,
         "down_left": 225, "front": 270, "down_right": 315}
DIRS = ["front", "right", "left", "back", "down_right", "down_left", "up_right", "up_left"]

VIEW = np.array([0.0, 1.0, -K]) / math.hypot(1.0, K)
LIGHT = np.array([-0.45, -0.55, 0.7])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

# Pixel centres -> ray origins on the y = 0 plane.
_xs = np.arange(W) + 0.5 - CX
_ys = np.arange(H) + 0.5
_X, _Y = np.meshgrid(_xs, _ys)
ORIGINS = np.stack([_X, np.zeros_like(_X), FLOOR - _Y], axis=-1).reshape(-1, 3)


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / (np.linalg.norm(v) or 1.0)


class Part:
    """An ellipsoid: centre, three orthonormal axes (rows) and radii, in world
    space, plus the material that colours it."""

    def __init__(self, center, axes, radii, material, name=""):
        self.c = np.asarray(center, dtype=float)
        self.axes = np.asarray(axes, dtype=float)
        self.r = np.asarray(radii, dtype=float)
        self.material = material
        self.name = name


def render(parts):
    """Ray casts the parts. Returns an RGBA image and the depth per pixel."""
    n = ORIGINS.shape[0]
    depth = np.full(n, np.inf)
    hit_part = np.full(n, -1)
    hit_local = np.zeros((n, 3))
    for i, part in enumerate(parts):
        rel = ORIGINS - part.c
        q = (rel @ part.axes.T) / part.r
        d = (part.axes @ VIEW) / part.r
        a = d @ d
        b = 2 * (q @ d)
        cc = np.einsum("ij,ij->i", q, q) - 1
        disc = b * b - 4 * a * cc
        ok = disc >= 0
        t = np.full(n, np.inf)
        t[ok] = (-b[ok] - np.sqrt(disc[ok])) / (2 * a)
        closer = t < depth
        depth[closer] = t[closer]
        hit_part[closer] = i
        hit_local[closer] = q[closer] + t[closer, None] * d
    rgba = np.zeros((n, 4), dtype=np.uint8)
    for i, part in enumerate(parts):
        sel = hit_part == i
        if not sel.any():
            continue
        p = hit_local[sel]
        normal = (p / part.r) @ part.axes
        normal /= np.linalg.norm(normal, axis=1, keepdims=True)
        lam = normal @ LIGHT
        cols = part.material(p, lam, normal)
        rgba[sel, :3] = cols
        rgba[sel, 3] = 255
    img = Image.fromarray(rgba.reshape(H, W, 4), "RGBA")
    return img, depth.reshape(H, W), hit_part.reshape(H, W)


# ---------------------------------------------------------------- materials

def pick(mask, a, b):
    """Per-pixel colour: `a` where mask, else `b`."""
    return np.where(mask[:, None], np.array(a), np.array(b))


def flat(color):
    return lambda p, lam, n: np.tile(np.array(color), (len(p), 1))


def skin(p, lam, n):
    return pick(lam < 0.12, SKIN_DARK, SKIN)


def wrapped(p, lam, n):
    """Bare limb wrapped in bandages: diagonal brown bands along the long axis."""
    around = np.arctan2(p[:, 2], p[:, 1])
    band = np.mod(p[:, 0] * 1.5 + around * 0.3, 1.0) < 0.5
    out = pick(lam < 0.12, SKIN_DARK, SKIN)
    return np.where(band[:, None], np.array(WRAP), out)


def collar(p, lam, n):
    stripe = np.mod(np.arctan2(p[:, 1], p[:, 0]) * 2.2, 1.0) < 0.3
    return pick(stripe | (lam < 0.1), SKIN_DARK, WRAP)


def mask_plate(p, lam, n):
    # p: (forward, left, up) of the plate. Eye holes on both sides, the
    # shaded rim where it turns away from the light.
    eye = (np.abs(np.abs(p[:, 1]) - 0.55) < 0.24) & (p[:, 2] > 0.0) & (p[:, 2] < 0.45) & (p[:, 0] > 0.1)
    out = pick(lam < 0.05, MASK_SHADE, MASK)
    return np.where(eye[:, None], np.array(BLACK), out)


def beak(p, lam, n):
    return pick(lam < -0.15, MASK_SHADE, MASK)


def crest(p, lam, n):
    # One streak of light up the middle of each blade, on the lit side.
    streak = (np.abs(p[:, 0]) < 0.35) & (lam > 0.2) & (p[:, 2] > -0.6) & (p[:, 2] < 0.75)
    return pick(streak, CREST_LIGHT, CREST)


def head_skin(p, lam, n):
    # Dark creases at the back of the skull, like the drawing.
    crease = (np.mod(p[:, 2] * 2.2 - p[:, 0] * 0.8, 1.0) < 0.16) & (p[:, 0] < 0.1)
    return pick(crease | (lam < 0.12), SKIN_DARK, SKIN)


# ---------------------------------------------------------------- the model

class Pose:
    """Everything an animation changes, for one frame. Angles in degrees."""

    def __init__(self, **kw):
        self.root = (0.0, 0.0, 0.0)   # whole body offset (forward, left, up)
        self.hip_drop = 0.0           # pelvis lowered (crouch), legs bend
        self.lean = 0.0               # torso pitch forward
        self.twist = 0.0              # torso yaw (positive turns left)
        self.head_pitch = 0.0         # head nods forward
        self.head_roll = 0.0
        # Feet targets (forward, up), relative to the rest position of each foot.
        self.foot = {"r": (0.0, 0.0), "l": (0.0, 0.0)}
        self.foot_pitch = {"r": 0.0, "l": 0.0}
        # Arms: shoulder swing forward, raise outward, elbow bend.
        self.arm = {"r": (0.0, 24.0, 8.0), "l": (0.0, 24.0, 8.0)}
        self.fist = {"r": False, "l": False}
        self.crest_sway = 0.0         # crest blades bent back by speed
        self.__dict__.update(kw)


# Crest blades from the forehead to the back: (height, sweep back in degrees).
CREST_BLADES = [(6, 10), (10, 14), (8, 18), (13, 20), (11, 22), (16, 24), (12, 28),
         (15, 30), (10, 36), (12, 42), (7, 50)]
THIGH, SHIN = 9.0, 8.2
HIP_U, HIP_L = 19.0, 4.6
SHOULDER_U, SHOULDER_L = 31.0, 9.2
UPPER_ARM, FOREARM = 7.0, 6.5
NECK_U = 35.5
HEAD_C = (-1.5, 0.0, 43.0)


def rot_y(v, deg):
    """Pitch around the left axis: positive tips `up` toward `forward`."""
    a = math.radians(deg)
    f, l, u = v
    return (f * math.cos(a) + u * math.sin(a), l, -f * math.sin(a) + u * math.cos(a))


def rot_z(v, deg):
    a = math.radians(deg)
    f, l, u = v
    return (f * math.cos(a) - l * math.sin(a), f * math.sin(a) + l * math.cos(a), u)


def rot_x(v, deg):
    """Roll around the forward axis: positive tips `up` toward `left`."""
    a = math.radians(deg)
    f, l, u = v
    return (f, l * math.cos(a) + u * math.sin(a), -l * math.sin(a) + u * math.cos(a))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def scale(a, s):
    return tuple(x * s for x in a)


def two_bone(hip, foot, l1, l2, bend_forward=True):
    """Knee position for a leg from `hip` to `foot` (local coords)."""
    d = np.subtract(foot, hip)
    dist = min(np.linalg.norm(d), l1 + l2 - 1e-3)
    d = unit(d)
    a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    a = math.acos(max(-1.0, min(1.0, a)))
    # Bend in the plane of the leg and the forward axis.
    side = unit(np.cross(d, (0, 1, 0)))  # forward-ish, perpendicular to the leg
    if side[0] < 0:
        side = -side
    if not bend_forward:
        side = -side
    knee = np.asarray(hip) + l1 * (d * math.cos(a) + side * math.sin(a))
    return tuple(knee)


class Model:
    """Builds the parts of one frame: local (forward, left, up) -> world."""

    def __init__(self, facing_deg, pose):
        a = math.radians(facing_deg)
        self.F = np.array([math.cos(a), math.sin(a), 0.0])
        self.L = np.array([-math.sin(a), math.cos(a), 0.0])
        self.U = np.array([0.0, 0.0, 1.0])
        self.pose = pose
        self.parts = []

    def world(self, p):
        p = add(p, self.pose.root)
        return p[0] * self.F + p[1] * self.L + p[2] * self.U

    def wdir(self, v):
        return v[0] * self.F + v[1] * self.L + v[2] * self.U

    def ellipsoid(self, center, axes_local, radii, material, name=""):
        # Gram-Schmidt: a skewed basis makes a degenerate ellipsoid (a line
        # across the whole frame).
        x = unit(self.wdir(axes_local[0]))
        y = self.wdir(axes_local[1])
        y = y - x * (y @ x)
        if np.linalg.norm(y) < 1e-3:
            y = np.cross(x, (0.0, 0.0, 1.0)) if abs(x[2]) < 0.9 else np.cross(x, (1.0, 0.0, 0.0))
        y = unit(y)
        axes = [x, y, np.cross(x, y)]
        self.parts.append(Part(self.world(center), axes, radii, material, name))

    def segment(self, a, b, r_side, r_up, material, name="", extra=0.8):
        """An ellipsoid from point a to b (local), long axis along it."""
        d = np.subtract(b, a)
        length = np.linalg.norm(d)
        x = unit(d)
        ref = np.array([0.0, 1.0, 0.0]) if abs(x[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
        y = unit(np.cross(ref, x))
        y = unit(np.cross(x, y)) if False else unit(ref - x * (ref @ x))
        z = np.cross(x, y)
        center = tuple((np.asarray(a) + np.asarray(b)) / 2)
        self.ellipsoid(center, [x, y, z], (length / 2 + extra, r_side, r_up), material, name)

    # The torso frame: lean and twist around the hips.
    def torso(self, p):
        pose = self.pose
        hip = (0.0, 0.0, HIP_U - pose.hip_drop)
        rel = (p[0], p[1], p[2] - HIP_U)
        rel = rot_z(rel, pose.twist)
        rel = rot_y(rel, pose.lean)
        return add(hip, rel)

    def torso_dir(self, v):
        return rot_y(rot_z(v, self.pose.twist), self.pose.lean)

    def build(self):
        pose = self.pose
        # Legs: right is -left.
        legs = {}
        for side, s in (("r", -1), ("l", 1)):
            hip = self.torso((0.0, s * HIP_L, HIP_U))
            hip = (hip[0], hip[1], HIP_U - pose.hip_drop)
            ff, fu = pose.foot[side]
            ankle = (0.5 + ff, s * (HIP_L + 0.8), 2.6 + fu)
            knee = two_bone(hip, ankle, THIGH, SHIN)
            legs[side] = (hip, knee, ankle)
            mat = wrapped if side == "r" else flat(BLACK)
            self.segment(hip, knee, 4.2, 4.2, mat, f"thigh_{side}")
            self.segment(knee, ankle, 3.8, 3.8, mat, f"shin_{side}")
            toe = add(ankle, rot_y((3.2, 0.0, -0.6), pose.foot_pitch[side]))
            self.segment(ankle, toe, 2.6, 1.8, skin if side == "r" else flat(BLACK), f"foot_{side}", extra=1.2)
            # Black claws at the tip of the bare foot.
            if side == "r":
                tip = add(ankle, rot_y((5.0, 0.0, -0.9), pose.foot_pitch[side]))
                self.ellipsoid(tip, [(1, 0, 0), (0, 1, 0), (0, 0, 1)], (1.2, 2.4, 0.9), flat(BLACK), "claws_r")

        # Torso (black tunic) and a skirt over the hips.
        self.ellipsoid(self.torso((0.3, 0.0, 26.5)), [self.torso_dir(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))],
                       (5.4, 8.8, 9.4), flat(BLACK), "torso")
        self.ellipsoid(self.torso((0.0, 0.0, 19.5)), [self.torso_dir(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))],
                       (5.0, 7.6, 4.2), flat(BLACK), "skirt")
        self.ellipsoid(self.torso((0.6, 0.0, NECK_U)), [self.torso_dir(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))],
                       (5.2, 6.2, 2.6), collar, "collar")

        # Arms.
        for side, s in (("r", -1), ("l", 1)):
            swing, raise_, bend = pose.arm[side]
            sh = self.torso((0.0, s * SHOULDER_L, SHOULDER_U))
            down = (0.0, 0.0, -1.0)
            upper = rot_x(down, -s * raise_)      # out to its own side
            upper = rot_y(upper, -swing)          # swing forward: tip toward forward
            upper = self.torso_dir(upper)
            elbow = add(sh, scale(upper, UPPER_ARM))
            fore = rot_y(rot_x(down, -s * raise_ * 0.6), -(swing + bend))
            fore = self.torso_dir(fore)
            wrist = add(elbow, scale(fore, FOREARM))
            hand = add(wrist, scale(fore, 1.6))
            mat = wrapped if side == "l" else flat(BLACK)
            self.segment(sh, elbow, 2.8, 2.8, mat, f"upper_{side}")
            self.segment(elbow, wrist, 2.5, 2.5, mat, f"fore_{side}")
            hand_mat = flat(BLACK) if side == "r" else skin
            self.ellipsoid(hand, [fore, (0, 1, 0) if abs(fore[1]) < 0.9 else (1, 0, 0), np.cross(fore, (0, 1, 0)) if abs(fore[1]) < 0.9 else (0, 0, 1)],
                           (2.0, 2.2, 2.0) if pose.fist[side] else (2.4, 2.0, 1.7), hand_mat, f"hand_{side}")
            if side == "l" and not pose.fist[side]:
                claw = add(wrist, scale(fore, 3.6))
                self.ellipsoid(claw, [fore, (0, 1, 0), (1, 0, 0)], (1.0, 1.8, 1.4), flat(BLACK), "claws_l")
            setattr(self, f"hand_{side}", hand)
            setattr(self, f"shoulder_{side}", sh)

        # Head: green skull, the mask plate with its eye holes, the beak.
        def head(p):
            rel = np.subtract(p, (0.0, 0.0, NECK_U))
            rel = rot_x(rot_y(tuple(rel), pose.head_pitch), pose.head_roll)
            return self.torso(add((0.0, 0.0, NECK_U), rel))

        def head_dir(v):
            return self.torso_dir(rot_x(rot_y(v, pose.head_pitch), pose.head_roll))

        I = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
        self.ellipsoid(head(HEAD_C), [head_dir(v) for v in I], (8.2, 8.0, 8.8), head_skin, "head")
        self.ellipsoid(head((4.0, 0.0, 43.6)), [head_dir(v) for v in I], (5.2, 7.4, 7.0), mask_plate, "mask")
        for a, b, rs, ru, name, mat in (
            ((6.5, 0.0, 45.0), (22.0, 0.0, 41.5), 2.9, 2.4, "beak_up", beak),
            ((6.5, 0.0, 41.5), (19.0, 0.0, 39.2), 2.5, 1.5, "beak_low", beak),
            ((6.0, 0.0, 43.0), (19.5, 0.0, 40.6), 2.2, 1.7, "mouth", flat(BLACK)),
        ):
            pa, pb = head(a), head(b)
            d = unit(np.subtract(pb, pa))
            side = unit(np.cross((0, 0, 1), d)) if abs(d[2]) < 0.9 else np.array([0.0, 1.0, 0.0])
            up = np.cross(d, side)
            center = tuple((np.asarray(pa) + np.asarray(pb)) / 2)
            self.ellipsoid(center, [d, side, up], (np.linalg.norm(np.subtract(pb, pa)) / 2 + 1.0, rs, ru), mat, name)

        # Crest: blades along the top of the head, swept back.
        for i, (h, lean) in enumerate(CREST_BLADES):
            phi = math.radians(40 + i * 12)  # from the forehead over to the back
            base = (HEAD_C[0] + math.cos(phi) * 7.0, 0.0, HEAD_C[2] + math.sin(phi) * 7.6)
            out = rot_y((math.cos(phi) * 0.5, 0.0, 1.0), -(lean + pose.crest_sway))  # swept back
            out = unit(out)
            tip = add(base, scale(tuple(out), h))
            pa, pb = head(base), head(tip)
            d = unit(np.subtract(pb, pa))
            fwd = head_dir((1, 0, 0))
            self.ellipsoid(tuple((np.asarray(pa) + np.asarray(pb)) / 2),
                           [unit(fwd - d * (fwd @ d)), head_dir((0, 1, 0)), d],
                           (1.5, 1.6, h / 2 + 0.6), crest, f"crest_{i}")
        self.head_center = head(HEAD_C)
        return self.parts


def screen(world):
    """Pixel of a world point, and its depth along the view (larger = farther)."""
    world = np.asarray(world, dtype=float)
    return (CX + world[0], FLOOR - (world[2] + K * world[1])), float(world @ VIEW)


def screen_dir(world_dir):
    """Screen direction of a world vector (x right, y down)."""
    d = np.asarray(world_dir, dtype=float)
    return np.array([d[0], -(d[2] + K * d[1])])


def draw(facing, pose):
    model = Model(ANGLE[facing], pose)
    img, _, _ = render(model.build())
    return img, model


def preview(path, ref_path=None):
    """The rest pose in 8 directions, with the drawing at the end."""
    row = [draw(d, Pose())[0] for d in ["left", "down_left", "front", "down_right", "right", "up_right", "back", "up_left"]]
    sheet = Image.new("RGBA", (W * (len(row) + 1), H), (40, 40, 48, 255))
    for i, img in enumerate(row):
        sheet.alpha_composite(img, (W * i, 0))
    if ref_path:
        ref = Image.open(ref_path).convert("RGBA")
        sheet.alpha_composite(ref.crop((0, 0, 64, 96)), (W * len(row), FLOOR - 76))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(path)


if __name__ == "__main__":
    preview(*sys.argv[1:3])
