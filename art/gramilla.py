"""Brian's hand-drawn grass tuft (Gramilla.aseprite), whole and shrunk by
SHRINK, recoloured with the square's grass greens so it blends into the meadow.

Usage: python3 gramilla.py <Gramilla.aseprite> <out_dir>
Writes gramilla.png, cropped to the drawing, and gramilla_chica.png, smaller.
"""
import struct
import sys
import zlib

from PIL import Image

# Gramilla's DawnBringer-32 greens -> the olive greens of the square's grass
# tufts (maze_tiles.py TUFT_COLORS), keeping the same order from dark to light.
RECOLOUR = {
    (75, 105, 47): (72, 118, 38),  # outline
    (143, 151, 74): (100, 150, 44),  # inner shade
    (106, 190, 48): (128, 176, 52),  # blades
    (153, 229, 80): (196, 230, 98),  # lit tips
}


SHRINK = 2
SHRINK_SMALL = 3  # gramilla_chica.png: small tufts, around tree roots
OUTLINE = RECOLOUR[(75, 105, 47)]


def shrink(img, k):
    """Each k x k block becomes one pixel. A block with any drawn pixel stays
    drawn, so 1 px blades never break; its colour is the most common one,
    preferring the blades over the outline so the tuft keeps its light."""
    w, h = -(-img.width // k), -(-img.height // k)
    out = Image.new("RGBA", (w, h))
    for by in range(h):
        for bx in range(w):
            colors = [
                img.getpixel((x, y))
                for y in range(by * k, min(img.height, (by + 1) * k))
                for x in range(bx * k, min(img.width, (bx + 1) * k))
                if img.getpixel((x, y))[3]
            ]
            if not colors:
                continue
            inner = [c for c in colors if c[:3] != OUTLINE]
            pool = inner if len(inner) * 2 >= len(colors) else colors
            out.putpixel((bx, by), max(set(pool), key=pool.count))
    return out


def read_aseprite(path):
    """Composites the cels of the first frame (indexed or RGBA files)."""
    data = open(path, "rb").read()
    _, _, _, width, height, depth = struct.unpack_from("<IHHHHH", data, 0)
    transparent = data[28]
    img = Image.new("RGBA", (width, height))
    palette = {}
    frame_size, _, old_count, _, _, new_count = struct.unpack_from("<IHHH2sI", data, 128)
    chunks = []
    pos = 144
    for _ in range(new_count or old_count):
        size, kind = struct.unpack_from("<IH", data, pos)
        chunks.append((kind, data[pos + 6 : pos + size]))
        pos += size
    for kind, body in chunks:
        if kind == 0x2019:  # new palette
            _, first, last = struct.unpack_from("<III", body, 0)
            q = 20
            for i in range(first, last + 1):
                flags, r, g, b, a = struct.unpack_from("<HBBBB", body, q)
                q += 6
                if flags & 1:
                    q += 2 + struct.unpack_from("<H", body, q)[0]
                palette[i] = (r, g, b, a)
        elif kind == 0x0004 and not palette:  # old palette
            q, index = 2, 0
            for _ in range(struct.unpack_from("<H", body, 0)[0]):
                index += body[q]
                count = body[q + 1] or 256
                q += 2
                for _ in range(count):
                    palette[index] = tuple(body[q : q + 3]) + (255,)
                    q += 3
                    index += 1
    for kind, body in chunks:
        if kind != 0x2005:
            continue
        _, x, y, _, cel_type = struct.unpack_from("<HhhBH", body, 0)
        if cel_type != 2:  # only compressed images
            continue
        w, h = struct.unpack_from("<HH", body, 16)
        raw = zlib.decompress(body[20:])
        bpp = depth // 8
        for j in range(h):
            for i in range(w):
                px = raw[(j * w + i) * bpp : (j * w + i + 1) * bpp]
                if bpp == 1:
                    if px[0] == transparent:
                        continue
                    color = palette[px[0]]
                else:
                    color = tuple(px)
                if color[3]:
                    img.putpixel((x + i, y + j), color)
    return img


def build(src, out_dir):
    img = read_aseprite(src)
    img = img.crop(img.getbbox())
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = img.getpixel((x, y))
            if a:
                img.putpixel((x, y), RECOLOUR.get((r, g, b), (r, g, b)) + (a,))
    shrink(img, SHRINK).save(f"{out_dir}/gramilla.png")
    shrink(img, SHRINK_SMALL).save(f"{out_dir}/gramilla_chica.png")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ".")
