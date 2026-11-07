"""The teaser's backdrop: a night stadium seen from the field, out of focus.

The same picture the key art sets (public/games/pack-empire/key-art-wide.webp):
light banks over the far stands, haze, a dark field, everything soft because
the camera is focused on the cards in front of it. Points of light go through
a disc kernel so they open into real bokeh rather than a gaussian smear.

    python3 scripts/pack-empire-teaser/backdrop.py

Writes public/games/pack-empire/teaser/stadium-wide.webp (16:9) and
stadium-tall.webp (9:16). Seeded, so a rerun gives the same image.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.signal import fftconvolve

OUT = Path(__file__).resolve().parents[2] / 'public/games/pack-empire/teaser'

LIGHT = np.array([1.0, 0.9, 0.74])
AMBER = np.array([1.0, 0.66, 0.3])
TURF = np.array([0.010, 0.016, 0.009])


def disc(r: float) -> np.ndarray:
    """A lens's bokeh: a flat disc with a slightly bright rim."""
    n = int(np.ceil(r)) + 1
    y, x = np.mgrid[-n : n + 1, -n : n + 1]
    d = np.hypot(x, y)
    k = np.clip(r + 0.5 - d, 0, 1) * (0.85 + 0.25 * np.clip(d / r, 0, 1) ** 4)
    return k / k.sum()


def blur(img: np.ndarray, sigma: float) -> np.ndarray:
    return np.stack([gaussian_filter(img[..., c], sigma) for c in range(3)], -1)


def lens(img: np.ndarray, r: float) -> np.ndarray:
    k = disc(r)
    return np.stack([fftconvolve(img[..., c], k, mode='same') for c in range(3)], -1)


def render(w: int, h: int, banks: list[tuple[float, float, float]], horizon: float, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    s = max(w, h) / 1920
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xx / w, yy / h
    hz = horizon

    # Everything below is in display values: the base is dark enough to pass
    # through the film curve almost unchanged, only the lights get rolled off.
    base = np.zeros((h, w, 3), np.float32)
    sky = np.clip(v / hz, 0, 1)[..., None]
    base += np.array([0.04, 0.034, 0.028]) * (1 - sky) + np.array([0.1, 0.08, 0.058]) * sky
    # The far stands: a dark bowl rising toward both sides, its lip catching light.
    rim = hz - (0.06 + 0.5 * np.abs(u - 0.5) ** 1.8) * (w / h if h > w else 1) * 0.55
    stands = (v > rim) & (v < hz)
    base[stands] = np.array([0.055, 0.047, 0.038])
    base += np.exp(-(((v - rim) * h / (9 * s)) ** 2))[..., None] * np.array([0.05, 0.037, 0.024])
    # The field, in perspective from a camera low on it: turf lit from the far
    # side and falling off toward us, mowing bands and yard lines running away
    # to a vanishing point above the far stands.
    field = v >= hz
    depth = np.clip((v - hz) / (1 - hz), 0, 1)
    vp = hz - 0.22
    across = (u - 0.5) * (w / h) / np.maximum(v - vp, 1e-3)
    stripe = across / 0.42
    band = 0.84 + 0.16 * (np.floor(stripe) % 2)
    turf = np.array([0.075, 0.122, 0.07]) * (1 - 0.62 * depth[..., None]) * band[..., None]
    # A yard line on every other band edge, thinner on the far side.
    edge = np.abs(stripe / 2 - np.round(stripe / 2)) * 2 * 0.42 * np.maximum(v - vp, 1e-3) * h
    line = np.exp(-((edge / (2 * s + 12 * s * depth)) ** 2)) / (1 + 1.6 * depth)
    turf += line[..., None] * np.array([0.1, 0.11, 0.095])
    # The banks' light pooling on the far half of the field.
    pool = np.exp(-(((u - 0.5) / 0.55) ** 2) - ((depth / 0.45) ** 2))
    turf *= (1 + 0.8 * pool)[..., None]
    base[field] = turf[field].astype(np.float32)
    base += np.exp(-(((v - hz) * h / (30 * s)) ** 2))[..., None] * np.array([0.08, 0.064, 0.045])

    # Points of light: the banks, then phones and exit signs dotted round the stands.
    pts = np.zeros((h, w, 3), np.float32)
    for bx, by, size in banks:
        rows, cols = 3, max(3, int(round(8 * size)))
        gap = 13 * s * size
        for r_ in range(rows):
            for c_ in range(cols):
                x = int(bx * w + (c_ - (cols - 1) / 2) * gap)
                y = int(by * h + (r_ - (rows - 1) / 2) * gap * 0.85)
                if 0 <= x < w and 0 <= y < h:
                    pts[y, x] += LIGHT * rng.uniform(140, 230) * size * s * s
    for _ in range(int(320 * w * h / (1920 * 1080))):
        x, y = rng.uniform(0, 1), rng.uniform(0, 1)
        iy, ix = min(h - 1, int(y * h)), min(w - 1, int(x * w))
        if not (rim[iy, ix] + 0.01 < y < hz - 0.005):
            continue
        tone = LIGHT if rng.random() < 0.75 else np.array([0.7, 0.82, 1.0])
        pts[iy, ix] += tone * rng.uniform(4, 26) * s * s

    # Haze: soft shafts falling from each bank toward midfield.
    haze = np.zeros((h, w), np.float32)
    for bx, by, size in banks:
        dx, dy = 0.5 - bx, hz + 0.08 - by
        L = np.hypot(dx, dy)
        t = ((u - bx) * dx + (v - by) * dy) / (L * L)
        off = np.abs((u - bx) * dy - (v - by) * dx) / L
        width = 0.015 + 0.08 * np.clip(t, 0, 1)
        haze += np.where(t > 0, np.exp(-((off / width) ** 2)) * np.exp(-2.6 * t) * 0.034 * size, 0)

    lights = lens(pts, 17 * s)
    lights += blur(pts, 70 * s) * AMBER * 3.2
    lights += blur(pts, 22 * s) * LIGHT * 0.8
    out = blur(base, 7 * s) + haze[..., None] * AMBER * 1.5
    out += 1 - np.exp(-lights * 1.4)

    # Vignette, darkest at the bottom corners where nothing is lit.
    vig = 1 - 0.42 * (((u - 0.5) * 1.25) ** 2 + ((v - 0.42) * 1.35) ** 2)
    out *= np.clip(vig, 0.45, 1)[..., None]
    out = np.clip(out, 0, 1)
    return Image.fromarray((out * 255 + rng.uniform(0, 1, out.shape)).clip(0, 255).astype(np.uint8))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    wide = render(1920, 1080, [(0.05, 0.13, 1.0), (0.25, 0.07, 1.15), (0.75, 0.07, 1.15), (0.95, 0.13, 1.0)], 0.6, 7)
    wide.save(OUT / 'stadium-wide.webp', quality=84, method=6)
    tall = render(1080, 1920, [(0.12, 0.08, 1.0), (0.88, 0.08, 1.0)], 0.42, 11)
    tall.save(OUT / 'stadium-tall.webp', quality=84, method=6)
    for p in OUT.glob('stadium-*.webp'):
        print(p.name, p.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
