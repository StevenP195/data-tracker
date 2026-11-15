"""Draw the app icons (run once): uv run --with pillow python scripts/make_icons.py

A navy tile with a rising white line chart and a small red five-point star.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "icons"
TOP, BOTTOM = (11, 42, 74), (24, 72, 120)
RED = (191, 10, 48, 255)


def star(cx, cy, r):
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * .42
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def draw(size, maskable=False):
    s = size * 4  # supersample, then downscale for smooth edges
    img = Image.new("RGBA", (s, s))
    px = ImageDraw.Draw(img)
    for y in range(s):
        t = y / s
        px.line([(0, y), (s, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    if not maskable:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * .22), fill=255)
        img.putalpha(mask)

    pad = s * (.26 if maskable else .18)
    w = s - 2 * pad
    pts = [(0, .8), (.25, .6), (.45, .68), (.68, .4), (1, .22)]
    xy = [(pad + x * w, pad + y * w) for x, y in pts]
    px.line(xy, fill=(255, 255, 255, 255), width=int(s * .055), joint="curve")
    r = s * .036
    for x, y in xy[1:]:
        px.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 255))
    px.polygon(star(pad + w * .16, pad + w * .16, w * .15), fill=RED)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192).save(OUT / "icon-192.png")
    draw(512).save(OUT / "icon-512.png")
    draw(512, maskable=True).save(OUT / "maskable-512.png")
    print("icons written to", OUT)
