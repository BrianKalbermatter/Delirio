"""The main character: the warrior of art/personaje_4_original.png, dressed on the
model of personaje_3.py, so he has the same 8 directions, tags and layers as
Personaje_3_Anim: skin the orange of the drawing with dark wraps at the joints, a
dark cape over the shoulders, a purple harness and a brown cloth, and a helmet
with the orange face and the row of studs of the picture.

personaje_3_build.py poses him into every animation.

Usage (preview of the rest pose): python3 art/personaje_4.py <out.png>
"""
import sys

import numpy as np
from PIL import Image

import personaje_3 as p3
from personaje_3 import NECK_U

# Colours of the picture: shadow, base, light.
ORANGE = ((0x9C, 0x4A, 0x38), (0xDC, 0x72, 0x38), (0xF0, 0x9C, 0x58))
RED_BROWN = ((0x4C, 0x20, 0x34), (0x7C, 0x30, 0x34), (0xA4, 0x48, 0x3C))
HELMET_FACE = ((0xA8, 0x52, 0x28), (0xD4, 0x7C, 0x30), (0xEC, 0xA0, 0x48))
PURPLE = ((0x22, 0x14, 0x48), (0x3C, 0x24, 0x64), (0x5C, 0x38, 0x7C))
NAVY = ((0x0C, 0x08, 0x2C), (0x18, 0x10, 0x48), (0x2C, 0x1C, 0x64))
WRAP = np.array((0x2C, 0x18, 0x3C))
SOLE = ((0x2C, 0x18, 0x3C), (0x5A, 0x2C, 0x34), (0x8C, 0x44, 0x38))
CREAM = np.array((0xF0, 0xC8, 0x80))
EYE = np.array((255, 255, 255))
HELMET_C = (-0.8, 0.0, 41.0)  # smaller and lower than the head of the model
HIP_LINE = -0.45  # share of the torso, down its height, where the cloth starts


def shaded(lam, tones):
    """The tone of each pixel by how much light it gets."""
    dark, base, light = (np.array(t) for t in tones)
    return np.where((lam > 0.55)[:, None], light, np.where((lam < 0.12)[:, None], dark, base))


def limb(tones, wraps):
    """Along the limb (-1..1 from one joint to the other): dark wraps at `wraps`."""
    def material(p, lam, n):
        colour = shaded(lam, tones)
        for start, stop in wraps:
            colour = np.where(((p[:, 0] >= start) & (p[:, 0] <= stop))[:, None], WRAP, colour)
        return colour
    return material


def torso(center, radii):
    """The bare chest crossed by the harness; the cape on his back and the cloth
    over the hips (the skirt part is all cloth)."""
    offset = (np.asarray(center) - p3.TORSO_C) / p3.TORSO_R
    stretch = np.asarray(radii) / p3.TORSO_R

    def material(p, lam, n):
        q = p * stretch + offset
        colour = shaded(lam, ORANGE)
        strap = np.abs(np.abs(q[:, 1]) - (0.55 - 0.45 * q[:, 2])) < 0.13
        colour = np.where(strap[:, None], shaded(lam, PURPLE), colour)
        colour = np.where((q[:, 0] < -0.25)[:, None], shaded(lam, NAVY), colour)
        cloth = q[:, 2] < HIP_LINE
        colour = np.where(cloth[:, None], shaded(lam, RED_BROWN), colour)
        belt = np.abs(q[:, 2] - HIP_LINE) < 0.09
        return np.where(belt[:, None], shaded(lam, PURPLE), colour)
    return material


def cape(p, lam, n):
    return shaded(lam, NAVY)


def helmet(p, lam, n):
    """(forward, left, up): the dark shell and the row of studs down its middle."""
    colour = shaded(lam, RED_BROWN)
    studs = (np.abs(p[:, 1]) < 0.17) & (p[:, 2] > 0.2) & (np.mod(p[:, 0] * 2.6, 1.0) < 0.5)
    return np.where(studs[:, None], CREAM, colour)


def face(p, lam, n):
    """The orange face of the helmet, the eye of the picture on each side."""
    colour = shaded(lam, HELMET_FACE)
    eye = (np.abs(np.abs(p[:, 1]) - 0.5) < 0.2) & (np.abs(p[:, 2] - 0.08) < 0.17) & (p[:, 0] > 0.2)
    return np.where(eye[:, None], EYE, colour)


class Warrior(p3.Model):
    leg_material = staticmethod(limb(ORANGE, ((0.62, 0.86),)))
    arm_material = staticmethod(limb(RED_BROWN, ((0.3, 0.62),)))
    foot_material = staticmethod(limb(SOLE, ()))
    torso_material = staticmethod(torso)
    collar_material = staticmethod(cape)

    def build_head(self, head, head_dir):
        axes = [head_dir(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
        self.ellipsoid(head(HELMET_C), axes, (6.8, 5.8, 7.0), helmet, "head")
        self.ellipsoid(head((2.0, 0.0, 39.8)), axes, (5.0, 5.4, 5.2), face, "face")
        # The cape, over both shoulders and down the back
        self.ellipsoid(self.torso((-2.6, 0.0, NECK_U - 2.5)), [self.torso_dir(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))],
                       (4.6, 10.4, 4.0), cape, "cape")


def preview(path):
    p3.MODEL = Warrior
    row = [p3.draw(d, p3.Pose())[0] for d in ["left", "down_left", "front", "down_right", "right", "up_right", "back", "up_left"]]
    sheet = Image.new("RGBA", (p3.W * len(row), p3.H), (60, 75, 55, 255))
    for i, img in enumerate(row):
        sheet.alpha_composite(img, (p3.W * i, 0))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(path)


if __name__ == "__main__":
    preview(sys.argv[1])
