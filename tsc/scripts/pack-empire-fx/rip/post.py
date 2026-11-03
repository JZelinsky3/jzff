import sys
import numpy as np
from PIL import Image, ImageFilter
src, out, cx, cy = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
strength = float(sys.argv[5]) if len(sys.argv) > 5 else 1
tint = np.array([int(sys.argv[6][i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32) if len(sys.argv) > 6 else np.array([1.0, .74, .42], dtype=np.float32)
shade = float(sys.argv[7]) if len(sys.argv) > 7 else 0
rng = np.random.default_rng(7)
im = Image.open(src).convert('RGB')
W, H = im.size
a = (np.asarray(im, dtype=np.float32) / 255) ** 2.2

def blur(arr, r):
    p = Image.fromarray((np.clip(arr, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return (np.asarray(p, dtype=np.float32) / 255) ** 2.2

lum = a @ np.array([.2126, .7152, .0722], dtype=np.float32)
hot = a * np.clip((lum - .32) / .5, 0, 1)[..., None]
# Only the locker's warm light throws rays: a white Canton card shouldn't look like a lamp.
warm = np.ones_like(a[..., :1]) * .8
hot_warm = hot * warm
# Only what's near the pack throws rays: the stadium lights stay soft bokeh.
gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
near = np.clip(1 - np.sqrt(((gx - W * cx) / (W * .24)) ** 2 + ((gy - H * cy) / (H * .5)) ** 2), 0, 1)[..., None] ** .8
hot_warm = hot_warm * near
s = W / 1920
bloom = blur(hot * (.35 + warm * .65), 10 * s) * .5 + blur(hot_warm, 34 * s) * .5 + blur(hot_warm, 90 * s) * .4

# Light rays: the bright part of the frame smeared out from the locker.
small = Image.fromarray((np.clip(hot_warm, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BILINEAR)
sw, sh = small.size
scx, scy = cx * sw, cy * sh
acc = np.zeros((sh, sw, 3), dtype=np.float32)
base = np.asarray(small, dtype=np.float32) / 255
yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
steps = 44
for i in range(steps):
    k = 1 - i / steps * .62
    px = np.clip(scx + (xx - scx) * k, 0, sw - 1).astype(np.int32)
    py = np.clip(scy + (yy - scy) * k, 0, sh - 1).astype(np.int32)
    acc += base[py, px] * (.965 ** i)
acc /= steps * .5
rays = np.asarray(Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3 * s)), dtype=np.float32) / 255
rays = rays ** 1.6 * tint

x = a + (bloom * .9 + rays * 1.15) * strength

# Dust in the light.
dust = Image.new('L', (W, H), 0)
px = dust.load()
glow = np.asarray(Image.fromarray((np.clip(rays.mean(axis=2) * 3, 0, 1) * 255).astype(np.uint8)), dtype=np.float32) / 255
for _ in range(int(1500 * s * s)):
    u, v = int(rng.random() * W), int(rng.random() * H)
    if rng.random() < glow[v, u] * 1.6:
        px[u, v] = int(120 + rng.random() * 135)
d = (np.asarray(dust.filter(ImageFilter.GaussianBlur(1.2 * s)), dtype=np.float32) / 255) * 2.2 + (np.asarray(dust.filter(ImageFilter.GaussianBlur(3.2 * s)), dtype=np.float32) / 255) * 1.6
x = x + d[..., None] * np.array([1, .86, .62], dtype=np.float32) * .6

# Grade: teal in the shadows, warmth up top, and the corners falling away.
lum = np.clip(x @ np.array([.2126, .7152, .0722], dtype=np.float32), 0, 1)[..., None]
x = x * (1 - (1 - lum) ** 3 * np.array([.02, -.01, -.02], dtype=np.float32))
x = x * (1 + lum ** 1.5 * np.array([.05, .0, -.06], dtype=np.float32))
vy, vx = np.mgrid[0:H, 0:W].astype(np.float32)
r = np.sqrt(((vx - W * cx) / (W * .78)) ** 2 + ((vy - H * .5) / (H * .86)) ** 2)
x = x * np.clip(1.08 - r ** 2.4 * .75, .2, 1.1)[..., None]
x = np.clip(x, 0, None)
if shade:
    ramp = np.clip((vx / W - .18) / .42, 0, 1) ** 1.4
    x = x * (1 - shade + shade * ramp)[..., None]
x = x / (1 + x * .06)
out8 = np.clip(x, 0, 1) ** (1 / 2.2)
out8 = out8 + (rng.random((H, W, 1)) - .5) * .012
Image.fromarray((np.clip(out8, 0, 1) * 255).astype(np.uint8)).save(out, quality=84, method=6)
print('saved', out, W, H)
