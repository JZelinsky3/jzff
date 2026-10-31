# The light that comes out of a torn pack, rendered once and used as a mask, so
# the browser only ever fades and scales it: public/games/pack-empire/fx/.
#
#   python3 scripts/pack-empire-fx/rays.py
#
# Alpha only: the colour is the CSS behind the mask, which is what lets one file
# serve every rarity. Each streak is a real ray, cast from a point under the tear
# so the fan splays out of a wide opening instead of spinning like a wheel, and
# narrowing toward its tip. No gaussian blur over any of it, which is what made
# the old glow a smudge: the softness here is in the rays, so the edges stay.
import os
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'games', 'pack-empire', 'fx')
W, H = 900, 560
# The tear spans the middle half of the texture (the CSS makes the mask twice the
# pack's width), so a ray crossing the bottom edge outside that would start in
# mid air beside the pack. SINK and SPREAD keep every one inside the opening.
SLIT = W / 4
SINK = 250        # how far under the tear the rays are cast from, in pixels
SPREAD = np.arctan2(SLIT, SINK)


def field():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = x - W / 2
    up = (H + SINK) - y
    theta = np.arctan2(dx, up)
    # Distance along the ray, from where it crosses the tear.
    along = np.maximum(np.hypot(dx, up) - SINK / np.maximum(np.cos(theta), 0.2), 0)
    # A low dome: the middle reaches furthest and the edges lie back toward the
    # tear, so it stays a spread of light out of the opening and never a beam.
    dome = 0.5 + 0.5 * np.cos(np.clip(theta / SPREAD, -1, 1) * np.pi / 2) ** 2
    return theta, along, dome


def streaks(light, rng, theta, along, dome, n, width, reach, peak, taper, sharp):
    # Evenly spaced then jittered: random alone clumps into a bald patch.
    slots = (np.arange(n) + rng.random(n)) / n * 2 - 1
    for s in slots:
        at = s * SPREAD
        long = reach * rng.uniform(0.5, 1.0)
        fat = rng.uniform(*width)
        t = np.clip(along / (long * dome), 0, 1)
        # Narrows toward its tip: this taper is most of why it reads as light.
        w = fat * (1 - taper * t) + 1e-4
        light += rng.uniform(*peak) * np.exp(-0.5 * np.abs((theta - at) / w) ** sharp) * (1 - t) ** 1.6


def fan(seed, shafts, fine, body):
    rng = np.random.default_rng(seed)
    theta, along, dome = field()
    light = np.zeros((H, W), np.float32)

    # The sheet of light itself, which is what stops the streaks reading as
    # needles: bright at the slit and gone within a third of the reach, lumpy
    # across the opening so it's never a clean gradient.
    lumps = sum(rng.uniform(0.3, 1) * np.cos(theta * f + rng.uniform(0, 6.3)) for f in (7, 13, 23))
    light += body * (0.62 + 0.13 * lumps) * np.exp(-along / (150 * dome))

    streaks(light, rng, theta, along, dome, shafts, (0.03, 0.075), 470, (0.22, 0.5), 0.45, 2)
    streaks(light, rng, theta, along, dome, fine, (0.0035, 0.009), 530, (0.5, 1.15), 0.8, 1.4)

    # Soft clip, so crossing streaks burn to white instead of banding.
    a = 1 - np.exp(-1.45 * light)
    # Nothing past the edge of the opening, and nothing at all at the top of the
    # texture: the fade has to end before the mask does.
    a *= np.clip((SPREAD + 0.05 - np.abs(theta)) / 0.2, 0, 1)
    # The faintest values go to true zero: over a dark room any alpha left down
    # there shows up as blocks around the fan.
    return np.clip((a - 0.02) / 0.98, 0, 1)


def save(a, name):
    px = (a * 255 + 0.5).astype(np.uint8)
    im = np.dstack([np.full((H, W), 255, np.uint8)] * 3 + [px])
    path = os.path.join(OUT, name)
    # Alpha is the whole picture here, so it's kept exact.
    Image.fromarray(im, 'RGBA').save(path, 'WEBP', quality=50, alpha_quality=100, method=6)
    print(name, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    # Two fans that drift against each other, one mostly shafts, one mostly
    # filaments. Where they cross is the shimmer.
    save(fan(7, 15, 17, 1.0), 'rays.webp')
    save(fan(23, 7, 30, 0.45), 'rays-fine.webp')
