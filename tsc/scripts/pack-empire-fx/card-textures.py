# The stock behind a card: real material, not a repeating pattern. Joey: grids,
# circles and spinning wheels look cheap; Common works because it reads as paper.
# Each is built from fractal noise lit like a surface, then darkened around the
# middle so the player and the hollow year stay on top. Output: public/games/
# pack-empire/fx/card-*.webp
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 640, 640
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'games', 'pack-empire', 'fx')


def fbm(beta, seed, sx=1.0, sy=1.0):
    """Noise with a 1/f^beta falloff, stretched by sx, sy. Soft at 3, busy at 1.5."""
    r = np.random.default_rng(seed)
    fy = np.fft.fftfreq(H)[:, None] * sy
    fx = np.fft.rfftfreq(W)[None, :] * sx
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = f ** (-beta / 2)
    amp[0, 0] = 0
    spec = amp * np.exp(2j * np.pi * r.random(amp.shape))
    n = np.fft.irfft2(spec, s=(H, W))
    return (n - n.mean()) / n.std()


def lit(h, strength, light=(-.5, -.7, .5), shine=30):
    """Light a height map: returns (soft, hot)."""
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    m = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / m, ny / m, nz / m
    l = np.array(light) / np.linalg.norm(light)
    d = np.clip(nx * l[0] + ny * l[1] + nz * l[2], 0, 1)
    v = np.array((0, 0, 1.0))
    hv = l + v
    hv = hv / np.linalg.norm(hv)
    s = np.clip(nx * hv[0] + ny * hv[1] + nz * hv[2], 0, 1) ** shine
    return d, s


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    xs = [a for a, _ in stops]
    return np.stack([np.interp(t, xs, [c[i] for _, c in stops]) for i in range(3)], -1)


def spot():
    """1 at the edges, low behind the player."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W * .62)) ** 2 + ((y - H * .46) / (H * .62)) ** 2)
    return np.clip(d, 0, 1) ** 1.6


def save(name, rgb):
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(f'{OUT}/card-{name}.webp', 'WEBP', quality=82, method=6)


def grain(seed, amount):
    return np.random.default_rng(seed).normal(0, amount, (H, W, 1))


def steel():
    # Cold polished steel: smooth sheet, wide soft reflections. No grit: any fine
    # detail here reads as rock.
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    sheet = fbm(4.2, 11, sx=.5, sy=1.4)
    p = (x * .74 + y * .67) / W
    band = np.exp(-((p - .36) / .15) ** 2) * .62 + np.exp(-((p - .88) / .1) ** 2) * .4 + np.exp(-((p - 1.26) / .07) ** 2) * .22
    t = .15 + .5 * band + .05 * sheet
    rgb = ramp(t, [(0, (6, 15, 26)), (.3, (14, 40, 66)), (.6, (34, 88, 132)), (.85, (82, 150, 198)), (1, (140, 200, 236))])
    rgb *= (.8 + .24 * spot())[..., None]
    return rgb + grain(3, 1.1)


def gold():
    # Polished gold: Rare's steel in a warmer metal, wide soft reflections on a
    # smooth sheet. Joey on the leaf version: not the wrinkly look.
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    sheet = fbm(4.4, 21, sx=.6, sy=1.3)
    p = (x * .68 + y * .73) / W
    band = np.exp(-((p - .3) / .16) ** 2) * .7 + np.exp(-((p - .84) / .11) ** 2) * .5 + np.exp(-((p - 1.24) / .08) ** 2) * .34
    t = .1 + .62 * band + .05 * sheet
    rgb = ramp(t, [(0, (17, 11, 2)), (.28, (58, 38, 6)), (.55, (132, 92, 16)), (.8, (212, 162, 50)), (1, (255, 226, 136))])
    rgb *= (.5 + .6 * spot())[..., None]
    return rgb + grain(4, .8)


def blur(a, r):
    """A soft gaussian, wrapping at the edges."""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.rfftfreq(a.shape[1])[None, :]
    return np.fft.irfft2(np.fft.rfft2(a) * np.exp(-2 * (np.pi * r) ** 2 * (fx * fx + fy * fy)), s=a.shape)


def glass():
    # Immortal: poured emerald glass, one still image, so the moving fire round the
    # border stays the only fire on the card. Joey: painted flames glowed round the
    # player's head, so nothing here is a flame, and the glass goes nearly black
    # behind him. Very smooth noise, folded once so it rolls, lit along the folds.
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    a, b = fbm(4.8, 411), fbm(4.8, 412)
    ix = ((x + a * 150).astype(int)) % W
    iy = ((y + b * 150).astype(int)) % H
    fold = np.sin(fbm(5, 413)[iy, ix] * 1.7 + 1.1)
    soft, hot = lit(blur(fold, 8) * 80, 1.0, light=(-.3, .7, .6), shine=12)
    low = np.clip((y / H - .2) / .45, 0, 1) ** 1.4
    t = .09 + .2 * (fold * .5 + .5) + .2 * soft ** 3 + .46 * hot + .16 * low
    rgb = ramp(t, [(0, (1, 9, 7)), (.22, (2, 26, 19)), (.45, (5, 66, 46)), (.68, (11, 134, 92)), (.86, (46, 206, 144)), (1, (170, 255, 220))])
    head = np.exp(-(((x - W / 2) / (W * .3)) ** 2 + ((y - H * .34) / (H * .27)) ** 2) * 1.1)
    rgb *= (1 - .7 * head)[..., None]
    return rgb + grain(9, .5)


def edge_fire(name, stops, seed, reach, frames=6):
    """Fire around a card, as a looping strip of frames: a real animation that only
    moves a strip behind a window. Each frame is 10.1em by 14.7em, the card plus
    .8em all round: Joey, the borders took up too much room. Noise runs around the
    edge and away from it, so the tongues climb off the card, and it wraps, so the
    loop has no seam."""
    FW, FH, m = 227, 331, 18
    r = 14
    y, x = np.mgrid[0:FH, 0:FW].astype(np.float32)
    cx, cy = FW / 2, FH / 2
    qx = np.abs(x - cx) - (FW / 2 - m - r)
    qy = np.abs(y - cy) - (FH / 2 - m - r)
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
    sweep = (np.arctan2(y - cy, x - cx) / (2 * np.pi)) % 1
    global W, H
    keep = W, H
    W, H = 512, 512
    n1, n2 = fbm(3.3, seed), fbm(2.9, seed + 1)
    length = fbm(3.0, seed + 2)
    W, H = keep
    n1, n2 = n1 / 2.4, n2 / 2.4
    L = reach * (.92 + .06 * length[0, (sweep * 512 * 5).astype(int) % 512].clip(-1.4, 1.4))
    sheet = np.zeros((FH * frames, FW, 4), 'uint8')
    # fine around the edge, so no side of the card gets a bigger lump of fire
    u = (sweep * 512 * 7).astype(int) % 512
    for f in range(frames):
        t = f / frames
        v1 = ((d * 7.3 - t * 512).astype(int)) % 512
        v2 = ((d * 11.3 - t * 1024).astype(int)) % 512
        wob = n1[v1, u] * .7 + n2[v2, (u * 2) % 512] * .3
        i = np.clip(.74 + wob * .9 - np.clip(d / L, 0, None) ** 1.2, 0, 1) * (d > -8)
        a = np.clip((i - .1) / .42, 0, 1) ** 1.4
        rgb = ramp(i, stops)
        sheet[f * FH:(f + 1) * FH, :, :3] = rgb.astype('uint8')
        sheet[f * FH:(f + 1) * FH, :, 3] = (a * 255).astype('uint8')
    Image.fromarray(sheet, 'RGBA').save(f'{OUT}/card-fire-{name}.webp', 'WEBP', quality=72, alpha_quality=80, method=6)


def outline(FW, FH, m, r, n=2400):
    """Points evenly along a rounded card's edge, each with its outward normal."""
    x0, y0, x1, y1 = m, m, FW - m, FH - m
    t = np.linspace(0, np.pi / 2, 24)
    px, py = [], []
    def arc(cx, cy, start):
        px.extend(cx + r * np.cos(start + t))
        py.extend(cy + r * np.sin(start + t))
    arc(x1 - r, y0 + r, -np.pi / 2)
    arc(x1 - r, y1 - r, 0)
    arc(x0 + r, y1 - r, np.pi / 2)
    arc(x0 + r, y0 + r, np.pi)
    px, py = np.array(px + px[:1]), np.array(py + py[:1])
    d = np.r_[0, np.cumsum(np.hypot(np.diff(px), np.diff(py)))]
    u = np.linspace(0, d[-1], n, endpoint=False)
    ox, oy = np.interp(u, d, px), np.interp(u, d, py)
    tx, ty = np.gradient(ox), np.gradient(oy)
    m_ = np.hypot(tx, ty) + 1e-6
    return ox, oy, ty / m_, -tx / m_


def tint(layers, FW, FH):
    """(mask, colour) pairs, added like light, as RGBA."""
    rgb, alpha = np.zeros((FH, FW, 3)), np.zeros((FH, FW))
    for mask, colour in layers:
        m = np.asarray(mask, dtype=np.float32) / 255
        rgb += m[..., None] * np.array(colour)
        alpha += m
    alpha = np.clip(alpha, 0, 1)
    out = rgb / np.maximum(alpha[..., None], .02)
    return np.dstack([np.clip(out, 0, 255), alpha * 255]).astype('uint8')


def strip(name, frames, quality=72):
    Image.fromarray(np.vstack(frames), 'RGBA').save(f'{OUT}/card-{name}.webp', 'WEBP', quality=quality, alpha_quality=82, method=6)


def edge_arcs(frames=6):
    # Transcendent: electricity, always live, held in close to the frame.
    FW, FH, m, r = 303, 441, 24, 19
    ox, oy, nx, ny = outline(FW, FH, m, r)
    n = len(ox)
    rng = np.random.default_rng(81)
    out = []
    for f in range(frames):
        core = Image.new('L', (FW, FH))
        draw = ImageDraw.Draw(core)
        # a current round the whole edge, new every frame
        steps = 150
        idx = (np.arange(steps + 1) * n // steps) % n
        off = rng.normal(2.5, 1.9, steps + 1).clip(-1, 8)
        off[-1] = off[0]
        draw.line([(ox[i] + nx[i] * o, oy[i] + ny[i] * o) for i, o in zip(idx, off)], fill=140, width=1)
        for _ in range(9):
            start = rng.integers(n)
            run = int(n * rng.uniform(.04, .11))
            pts = 12
            walk = np.cumsum(rng.normal(0, 1.5, pts + 1))
            walk -= np.linspace(walk[0], walk[-1], pts + 1)
            height = np.sin(np.linspace(0, np.pi, pts + 1)) * rng.uniform(5, 13)
            line = []
            for k in range(pts + 1):
                i = (start + run * k // pts) % n
                o = min(16, height[k] + walk[k] * 1.3)
                line.append((ox[i] + nx[i] * o, oy[i] + ny[i] * o))
            draw.line(line, fill=255, width=1)
        wide = core.filter(ImageFilter.GaussianBlur(3)).point(lambda v: min(255, v * 4.5))
        near = core.filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: min(255, v * 3))
        out.append(tint([(wide, (150, 70, 255)), (near, (255, 120, 240)), (core, (255, 255, 255))], FW, FH))
    strip('arcs', out)


def pave(frames=6):
    # Canton: the frame is a gold band set with diamonds, like a championship ring.
    # It needs no room outside the card. One still image of the stones, then a strip
    # of the same stones flaring a few at a time.
    FW, FH, S = 340, 524, 3
    ox, oy, nx, ny = outline(FW, FH, 5.4, 19)
    n = len(ox)
    rng = np.random.default_rng(131)
    gap = 10.4
    count = int(n * (2 * (FW + FH - 11) / n) / gap) if False else int((2 * (FW + FH - 10.8) - 8 * 19 + 2 * np.pi * 13.6) / gap)
    at = (np.arange(count) * n // count) % n
    big = Image.new('RGBA', (FW * S, FH * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    R = 4.5 * S
    centres = []
    for i in at:
        x, y = ox[i] * S, oy[i] * S
        centres.append((x / S, y / S))
        # the claw and the seat
        draw.ellipse([x - R - 3, y - R - 3, x + R + 3, y + R + 3], fill=(120, 84, 22, 255))
        draw.ellipse([x - R - 1, y - R - 1, x + R + 1, y + R + 1], fill=(250, 226, 150, 255))
        turn = rng.random() * np.pi
        for k in range(8):
            a0, a1 = turn + k * np.pi / 4, turn + (k + 1) * np.pi / 4
            v = rng.choice([150, 190, 225, 255])
            tone = (int(v * .92), int(v * .96), 255, 255) if rng.random() < .7 else (255, 255, 255, 255)
            draw.polygon([(x, y), (x + R * np.cos(a0), y + R * np.sin(a0)), (x + R * np.cos(a1), y + R * np.sin(a1))], fill=tone)
        draw.ellipse([x - R * .34, y - R * .34, x + R * .34, y + R * .34], fill=(255, 255, 255, 255))
    big.resize((FW, FH), Image.LANCZOS).save(f'{OUT}/card-pave.webp', 'WEBP', quality=86, alpha_quality=92, method=6)
    # flares: canvas is the card plus 16px all round
    M = 16
    W2, H2 = FW + 2 * M, FH + 2 * M
    out = []
    for f in range(frames):
        core = Image.new('L', (W2, H2))
        d = ImageDraw.Draw(core)
        for j in rng.integers(0, len(centres), 11):
            x, y = centres[j][0] + M, centres[j][1] + M
            arm = rng.uniform(7, 13)
            d.line([(x - arm, y), (x + arm, y)], fill=255, width=1)
            d.line([(x, y - arm), (x, y + arm)], fill=255, width=1)
            d.ellipse([x - 2.2, y - 2.2, x + 2.2, y + 2.2], fill=255)
        near = core.filter(ImageFilter.GaussianBlur(2)).point(lambda v: min(255, v * 3.4))
        out.append(tint([(near, (255, 226, 150)), (core, (255, 255, 255))], W2, H2))
    strip('glint', out, quality=70)


def around(FW, FH, m, r):
    """For each pixel of a canvas: how far out of the card's edge it is, and how far
    round the card its nearest point on the edge is, 0 to 1."""
    from scipy.spatial import cKDTree
    y, x = np.mgrid[0:FH, 0:FW].astype(np.float32)
    qx = np.abs(x - FW / 2) - (FW / 2 - m - r)
    qy = np.abs(y - FH / 2) - (FH / 2 - m - r)
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
    ox, oy, _, _ = outline(FW, FH, m, r, n=3000)
    _, near = cKDTree(np.c_[ox, oy]).query(np.c_[x.ravel(), y.ravel()])
    return d, (near / 3000).reshape(d.shape).astype(np.float32)


def corona(frames=6):
    # Canton: an eclipse. The card is the moon, and white light streams off the
    # diamonds all round it in fine rays. Nothing else in the game has it. Every
    # wave turns a whole number of times, so the loop has no seam.
    FW, FH, m, r = 315, 453, 30, 19
    d, s = around(FW, FH, m, r)
    out_ = np.clip(d, 0, None)
    rng = np.random.default_rng(161)
    def waves(low, high, count, tilt):
        fk = rng.integers(low, high, count)
        wk = rng.choice([-2, -1, 1, 2], count)
        ph = rng.uniform(0, 2 * np.pi, count)
        amp = 1 / fk ** tilt
        return fk, wk, ph, amp
    long_, fine = waves(16, 70, 12, .3), waves(120, 340, 20, .15)
    def wave(w, t):
        n = sum(a * np.cos(2 * np.pi * (f * s + k * t) + p) for f, k, p, a in zip(*w))
        return n / n.std()
    out = []
    for f in range(frames):
        t = f / frames
        # only the brightest rays reach far, so the outside edge never reads as a box
        bright = np.clip(.5 + .5 * wave(fine, t), 0, 1) ** 2.2
        reach = (4 + 13 * np.clip(.55 + .42 * wave(long_, t), 0, 1.3) ** 2) * (.3 + 1.05 * bright)
        tight = np.exp(-(out_ / 4) ** 2)
        edge = np.clip((27 - out_) / 17, 0, 1) ** 2
        i = np.clip(np.exp(-out_ / reach) * (.14 + .86 * bright) * 1.25 + tight * .8, 0, 1) * (d > -9) * edge
        rgb = ramp(i, [(0, (255, 186, 74)), (.34, (255, 214, 130)), (.62, (255, 238, 192)), (.85, (255, 252, 240)), (1, (255, 255, 255))])
        a = np.clip(i * 1.22, 0, 1) ** 1.25
        out.append(np.dstack([rgb, a * 255]).astype('uint8'))
    strip('corona', out, quality=76)


def halo():
    # The mask a band of colour shows through, just outside Canton's corona.
    FW, FH, m, r = 158, 227, 15, 10
    d, _ = around(FW, FH, m, r)
    a = np.exp(-(np.clip(d - 3, 0, None) / 5.6) ** 1.6) * np.clip((d + 2) / 3, 0, 1)
    v = (a * 255).astype('uint8')
    Image.fromarray(np.dstack([np.full(v.shape, 255, 'uint8')] * 3 + [v]), 'RGBA').save(f'{OUT}/card-halo.webp', 'WEBP', quality=70, alpha_quality=70, method=6)


def stock():
    # The back of every card: midnight lacquer with a football field pressed into it,
    # the wrapper's yard lines with no ink, so they only show where they catch the
    # light. Joey: simple, some art, nothing clipart. The stock carries no rarity:
    # the frame gives that away. Sized to the card, so nothing is cropped.
    from PIL import ImageFont
    SW, SH = 508, 800
    global W, H
    keep = W, H
    W, H = SH, SH
    sheet = fbm(4.6, 171, sx=.6, sy=1.3)[:SH, :SW]
    W, H = keep
    press = Image.new('L', (SW, SH), 0)
    draw = ImageDraw.Draw(press)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Impact.ttf', 58)
    # yard lines every 10, 5s between, hash marks either side of the middle
    for i, yard in enumerate(range(-3, 4)):
        y = int(SH / 2 + yard * 116)
        draw.rectangle([0, y - 2, SW, y + 2], fill=255)
        for x in (150, 358):
            for t in range(1, 5):
                dy = int(t * 23.2)
                draw.rectangle([x - 11, y + dy - 1, x + 11, y + dy + 1], fill=255)
        mark = str(50 - abs(yard) * 10)
        for x, turn in ((66, 90), (SW - 66, -90)):
            tile = Image.new('L', (90, 70), 0)
            ImageDraw.Draw(tile).text((45, 35), mark, font=font, fill=255, anchor='mm')
            tile = tile.rotate(turn, expand=True)
            press.paste(255, (x - tile.width // 2, y - tile.height // 2), tile)
    h = np.asarray(press, dtype=np.float32) / 255
    y, x = np.mgrid[0:SH, 0:SW].astype(np.float32)
    gy, gx = np.gradient(blur(h, 1.6) * 16)
    light = np.array((-.5, -.62, .6))
    light = light / np.linalg.norm(light)
    m = np.sqrt(gx ** 2 + gy ** 2 + 1)
    catch = (-gx * light[0] - gy * light[1] + light[2]) / m - light[2]
    p = (x * .62 + y * .78) / SH
    band = np.exp(-((p - .22) / .17) ** 2) * .85 + np.exp(-((p - .74) / .13) ** 2) * .5 + np.exp(-((p - 1.05) / .08) ** 2) * .3
    t = .16 + .5 * band + .05 * sheet + catch * .3
    rgb = ramp(t, [(0, (4, 7, 16)), (.3, (10, 17, 38)), (.6, (20, 34, 72)), (.85, (42, 62, 116)), (1, (96, 122, 184))])
    fall = np.exp(-(((x - SW / 2) / (SW * .7)) ** 2 + ((y - SH / 2) / (SH * .7)) ** 2))
    rgb *= (.6 + .48 * fall)[..., None]
    Image.fromarray(np.clip(rgb + np.random.default_rng(12).normal(0, .6, (SH, SW, 1)), 0, 255).astype('uint8')).save(f'{OUT}/card-stock.webp', 'WEBP', quality=84, method=6)


def door():
    # Canton's reveal: the doors of the Hall, cast bronze, lit low from the gap. One
    # door, the right one, with half the emblem on it: the left is this one mirrored,
    # so the emblem splits when they open. The seam is the left edge.
    DW, DH = 540, 1170
    global W, H
    keep = W, H
    W, H = DH, DH
    cast = fbm(3.4, 181)[:DH, :DW]
    wide = fbm(4.6, 182)[:DH, :DW]
    W, H = keep
    y, x = np.mgrid[0:DH, 0:DW].astype(np.float32)
    def panel(x0, y0, x1, y1, bevel):
        inside = np.minimum.reduce([x - x0, x1 - x, y - y0, y1 - y])
        return np.clip(inside / bevel, 0, 1)
    h = np.zeros((DH, DW), np.float32)
    # the frame of the door stands proud, the panels sink into it
    for box in [(70, 60, 470, 400), (70, 770, 470, 1110)]:
        h -= panel(*box, 16) * 15
        h += panel(box[0] + 44, box[1] + 44, box[2] - 44, box[3] - 44, 10) * 9
    # the great ring and the sparkle, half of each on this door
    ry = np.hypot(x, y - DH / 2)
    h += 22 * np.exp(-((ry - 214) / 16) ** 2) + 10 * np.exp(-((ry - 176) / 5) ** 2)
    ex, ey = np.abs(x) / 150, np.abs(y - DH / 2) / 150
    star = np.clip((1 - (ex ** .62 + ey ** .62)) * 2.4, 0, 1)
    h += star * 24
    # a seat of studs up the outer edge
    for sy in np.arange(50, DH, 74):
        h += 12 * np.exp(-(((x - 512) ** 2 + (y - sy) ** 2) / 90))
    gy, gx = np.gradient(blur(h, 1.4) + cast * .9 + wide * 7)
    nz = 1.0
    light = np.array((-.82, 0.08, .52))
    light = light / np.linalg.norm(light)
    m = np.sqrt(gx ** 2 + gy ** 2 + nz ** 2)
    diff = np.clip((-gx * light[0] - gy * light[1] + nz * light[2]) / m, 0, 1)
    fall = np.exp(-x / 330)
    t = .05 + diff ** 2.4 * (.38 + .62 * fall) + .03 * wide
    rgb = ramp(t, [(0, (5, 3, 1)), (.2, (22, 13, 5)), (.42, (58, 37, 14)), (.66, (126, 86, 32)), (.86, (206, 158, 76)), (1, (255, 226, 150))])
    Image.fromarray(np.clip(rgb + np.random.default_rng(13).normal(0, .9, (DH, DW, 1)), 0, 255).astype('uint8')).save(f'{OUT}/card-door.webp', 'WEBP', quality=74, method=6)


def god_rays():
    # Light pouring through the Hall doors, uneven like real shafts rather than a
    # wheel of spokes. An <img>, so a full-screen spin costs the file's size, not the
    # screen's. It wraps at the join because every wave is a whole number of turns.
    # Soft shafts, big and few: it's stretched to the whole screen, and fine detail
    # or hard edges go to blocks up there.
    S = 800
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = x - S / 2, y - S / 2
    angle, far = np.arctan2(dy, dx), np.hypot(dx, dy) / (S / 2)
    rng = np.random.default_rng(191)
    def shafts(low, high, count):
        n = sum(np.cos(k * angle + p) / k ** .3 for k, p in zip(rng.integers(low, high, count), rng.uniform(0, 2 * np.pi, count)))
        return n / n.std()
    wide, thin = shafts(4, 15, 9), shafts(16, 44, 12)
    i = np.clip(.46 + .34 * wide + .1 * thin, 0, 1) ** 2.4 * np.clip(1 - far, 0, 1) ** 1.3
    i = blur(np.clip(i * (.5 + .5 * np.exp(-far * 2.4)) * 1.5, 0, 1), 2.5)
    rgb = ramp(i, [(0, (255, 196, 96)), (.5, (255, 226, 160)), (1, (255, 252, 236))])
    Image.fromarray(np.dstack([rgb, i * 255]).astype('uint8'), 'RGBA').save(f'{OUT}/card-rays.webp', 'WEBP', quality=50, alpha_quality=84, method=6)


def portal():
    # The far end of the Hall: a wall with an arched entry cut through it, and a bronze
    # casing round the arch. The light sits behind it, so the card stands in a real
    # doorway rather than in front of a flat bright square.
    PW, PH = 1000, 920
    y, x = np.mgrid[0:PH, 0:PW].astype(np.float32)
    dx = np.abs(x - PW / 2)
    # no sill: the opening runs to the floor, so the runner carries on into the light
    half, spring, sill = 290, 372, PH + 80
    # distance into the opening: positive is inside, negative is out on the wall
    arch = half - np.hypot(dx, np.minimum(y - spring, 0))
    inside = np.minimum(arch, sill - y)
    glow = np.exp(-(np.clip(-inside, 0, None) / 150) ** 1.4)
    u, v = x / PW, y / PH
    t = .22 + .46 * glow + .12 * np.exp(-(1 - v) / .3)
    rgb = ramp(t, [(0, (16, 10, 6)), (.25, (54, 36, 18)), (.5, (126, 88, 42)), (.75, (206, 158, 86)), (1, (255, 226, 160))])
    # the casing: a bevelled bronze moulding, lit from the opening side
    band = np.clip(-inside / 46, 0, 1)
    case = (inside <= 0) & (inside > -46)
    tc = .34 + .5 * np.sin(band * np.pi * 3) ** 2 * (1 - band * .6) + .16 * (1 - band)
    rgb = np.where(case[..., None], ramp(tc, [(0, (42, 26, 10)), (.45, (134, 94, 36)), (.8, (232, 188, 104)), (1, (255, 240, 196))]), rgb)
    # pilasters and the cornice carry on from the side walls
    side = dx > 440
    flute = .5 + .5 * np.cos((dx - 440) / 60 * np.pi * 4)
    rgb = np.where(side[..., None], ramp(.2 + .42 * flute, [(0, (24, 14, 6)), (.5, (112, 78, 30)), (1, (226, 180, 96))]), rgb)
    rgb = np.where((v < .06)[..., None], np.array((94, 64, 26)) * np.ones((PH, PW, 1)), rgb)
    a = np.clip(-inside + 1.5, 0, 1)
    Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype('uint8'), 'RGBA').save(f'{OUT}/card-hall-portal.webp', 'WEBP', quality=72, alpha_quality=90, method=6)


def molten():
    # The back of a Canton: a slab of molten gold light, flowing slowly. Very smooth
    # warped noise, mostly bright, so the whole card glows and it still looks like a
    # surface. Two tiles stacked, each seamless, so it can slide forever. Joey on the
    # spinning beams: not sure about them.
    TW, TH = 340, 524
    global W, H
    keep = W, H
    W, H = TW, TH
    a, b, base = fbm(4.6, 221), fbm(4.6, 222), fbm(4.5, 223)
    W, H = keep
    y, x = np.mgrid[0:TH, 0:TW].astype(np.float32)
    ix = (x + a * 58).astype(int) % TW
    iy = (y + b * 58).astype(int) % TH
    fold = blur(np.sin(base[iy, ix] * 1.5 + a * .6), 7)
    soft, hot = lit(fold * 70, 1.0, light=(-.3, -.5, .8), shine=7)
    t = .52 + .14 * fold + .2 * hot
    rgb = ramp(t, [(0, (214, 134, 34)), (.32, (246, 188, 84)), (.58, (255, 222, 144)), (.8, (255, 243, 204)), (1, (255, 255, 248))])
    Image.fromarray(np.clip(np.vstack([rgb, rgb]), 0, 255).astype('uint8')).save(f'{OUT}/card-molten.webp', 'WEBP', quality=80, method=6)


def banner():
    # A hanging banner for the Hall, everything but the team's own colours and marks:
    # the bronze rod, the folds of the cloth, the stitched gold trim, the fringe. It
    # lies over a plain coloured panel, so one file does every team, and the logo
    # takes the folds as if it were printed on the cloth.
    BW, BH = 720, 1080
    x0, x1, top, bot = 28, BW - 28, 44, 1006
    rng = np.random.default_rng(231)
    y, x = np.mgrid[0:BH, 0:BW].astype(np.float32)
    cloth = (x >= x0) & (x <= x1) & (y >= top) & (y <= bot)
    # soft folds falling from the rod, widening a little as they fall
    fall = (y - top) / (bot - top)
    u = (x - BW / 2) / BW
    # barely there, and the same both sides: Joey saw three dark bands with the left
    # darkest. Cloth this flat reads as heavy, and the rod and fringe sell the rest.
    folds = np.cos(2 * np.pi * 2.5 * u / (1 + .1 * fall)) + .5 * np.cos(2 * np.pi * 1.5 * u / (1 + .1 * fall))
    folds = folds / folds.std()
    roll = np.gradient(folds, axis=1) * 62
    # light from the wall lamp above: bright high up, falling away down the cloth
    # gentle: Joey, the first pass left one side dark and hard to read
    shade = folds * .022 - .34 * np.exp(-(y - top) / 22) - .08 * fall ** 2 + .12 * np.exp(-(u / .5) ** 2) * np.exp(-((fall - .36) / .6) ** 2)
    edge = np.minimum(x - x0, x1 - x) / 12
    shade -= .16 * np.exp(-edge)
    a = np.zeros((BH, BW))
    rgb = np.zeros((BH, BW, 3))
    dark, light_ = np.clip(-shade, 0, .42), np.clip(shade, 0, .3)
    a = np.where(cloth, dark + light_, 0)
    rgb[...] = np.where((shade > 0)[..., None], (255, 240, 214), (6, 4, 8))
    # the stitched gold trim, two lines inset from the edge, taking the same folds
    inset = np.minimum.reduce([x - x0, x1 - x, y - top, bot - y])
    gold = ramp(.62 + .06 * folds, [(0, (92, 62, 18)), (.5, (196, 150, 66)), (1, (255, 232, 170))])
    wide = (inset > 26) & (inset < 40)
    thin = (inset > 48) & (inset < 51)
    trim = cloth & (wide | thin)
    rgb = np.where(trim[..., None], gold, rgb)
    a = np.where(trim, .96, a)
    # fringe: gold threads off the bottom edge, each a little different
    fringe = Image.new('L', (BW, BH))
    draw = ImageDraw.Draw(fringe)
    for fx in np.arange(x0, x1, 3.2):
        long_ = rng.uniform(44, 60)
        draw.line([(fx, bot - 2), (fx + rng.uniform(-1.6, 1.6), bot + long_)], fill=int(rng.uniform(170, 255)), width=2)
    f_a = np.asarray(fringe, dtype=np.float32) / 255
    f_rgb = ramp(.34 + .5 * f_a + .14 * np.sin(x * 1.9), [(0, (98, 66, 20)), (.55, (204, 158, 72)), (1, (255, 230, 164))])
    rgb = np.where((f_a > .02)[..., None], f_rgb, rgb)
    a = np.where(f_a > .02, f_a, a)
    # the rod, a bronze cylinder with a ball at each end, over everything
    ry = (y - 26) / 12
    rod = (np.abs(ry) < 1) & (x > 8) & (x < BW - 8)
    bronze = ramp(.55 - ry * .4 - .4 * ry ** 2, [(0, (28, 16, 6)), (.4, (112, 76, 28)), (.75, (214, 168, 88)), (1, (255, 240, 200))])
    rgb = np.where(rod[..., None], bronze, rgb)
    a = np.where(rod, 1, a)
    for cx_ in (12, BW - 12):
        d = np.hypot(x - cx_, y - 26) / 19
        ball = d < 1
        lamp = np.clip(1 - np.hypot(x - cx_ + 6, y - 20) / 22, 0, 1)
        rgb = np.where(ball[..., None], ramp(.12 + .86 * lamp, [(0, (40, 24, 8)), (.5, (150, 106, 44)), (1, (255, 240, 200))]), rgb)
        a = np.where(ball, 1, a)
    Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype('uint8'), 'RGBA').save(f'{OUT}/card-banner.webp', 'WEBP', quality=82, alpha_quality=88, method=6)


def hall(bays=6):
    # The Hall behind the doors, for Canton's walkout: you walk down it with his team
    # on one wall and the year on the other. Three images: wall, floor, ceiling. The
    # columns and floor inlays come round once a bay, which is what makes it read as
    # moving. Each is an <img> on its own layer, so the whole room costs the size of
    # these files, however much of the screen it fills.
    W_, H_ = 1500, 460
    y, x = np.mgrid[0:H_, 0:W_].astype(np.float32)
    bay = W_ / bays
    u, v = (x % bay) / bay, y / H_
    global W, H
    keep = W, H
    W, H = W_, W_
    stone = fbm(4.4, 211, sx=.5, sy=1.4)[:H_, :W_]
    W, H = keep
    # warm polished stone, with a scallop of light thrown up each bay from the floor
    # and down from the cornice, the way lit walls really fall off. Plain dark panels
    # read as a wireframe.
    rise = np.exp(-((u - .56) / (.05 + .46 * (1 - v))) ** 2) * np.exp(-(1 - v) * 1.55)
    fall = np.exp(-((u - .56) / (.05 + .46 * v)) ** 2) * np.exp(-v * 2.5)
    t = .2 + .07 * stone + .7 * rise + .42 * fall
    wall = ramp(t, [(0, (14, 9, 5)), (.2, (46, 30, 15)), (.42, (104, 70, 34)), (.66, (182, 132, 66)), (.86, (240, 196, 120)), (1, (255, 238, 196))])
    # a brass line round each panel
    inset = np.minimum.reduce([u - .15, .97 - u, v - .17, .86 - v])
    line = np.exp(-((inset - .012) / .0028) ** 2)
    wall = wall + line[..., None] * np.array((110, 80, 34))
    # bronze pilasters, fluted, catching the light down one side
    pil = u < .12
    flute = .5 + .5 * np.cos(u / .12 * np.pi * 8)
    side = np.clip(1 - u / .12, 0, 1)
    tp = .14 + .24 * flute + .34 * side ** 2 + .14 * (1 - v)
    bronze = ramp(tp, [(0, (22, 13, 5)), (.3, (66, 43, 16)), (.6, (150, 106, 44)), (.85, (226, 180, 90)), (1, (255, 236, 180))])
    rgb = np.where(pil[..., None], bronze, wall)
    # cornice and skirting run the length of the room
    band = (v < .075) | (v > .935)
    tb = .24 + .3 * np.exp(-((v - .06) / .012) ** 2) + .3 * np.exp(-((v - .945) / .012) ** 2)
    rgb = np.where(band[..., None], ramp(tb, [(0, (40, 26, 10)), (.5, (128, 90, 36)), (1, (240, 200, 116))]), rgb)
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(f'{OUT}/card-hall-wall.webp', 'WEBP', quality=72, method=6)

    # the floor runs away from you: y is depth, far at the top
    FW, FH = 460, 1500
    y, x = np.mgrid[0:FH, 0:FW].astype(np.float32)
    s, d = np.abs(x / FW - .5) * 2, (y % bay) / bay
    W, H = FH, FH
    marble = fbm(4.4, 212, sx=.5, sy=1.4)[:FH, :FW]
    W, H = keep
    # polished: the bright walls show in it down both sides
    sheen = np.exp(-((1 - s) / .34)) * (.35 + .65 * np.exp(-((d - .56) / .26) ** 2))
    tf = .15 + .05 * marble + .62 * sheen
    rgb = ramp(tf, [(0, (10, 7, 4)), (.2, (32, 21, 11)), (.45, (82, 56, 28)), (.75, (164, 120, 62)), (1, (246, 208, 140))])
    # brass inlaid across the floor, once a bay
    rgb = rgb + (np.exp(-((d - .5) / .012) ** 2) * (s > .4))[..., None] * np.array((120, 88, 36))
    # the gold runner down the aisle
    run = s < .4
    rgb = np.where(run[..., None], ramp(.5 + .14 * np.exp(-((s - .16) / .1) ** 2) + .02 * marble, [(0, (70, 46, 14)), (.5, (150, 108, 36)), (1, (236, 192, 96))]), rgb)
    edge = np.exp(-((s - .4) / .012) ** 2)
    rgb = rgb + edge[..., None] * np.array((190, 150, 76))
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(f'{OUT}/card-hall-floor.webp', 'WEBP', quality=72, method=6)

    # the ceiling: coffered, with a line of light down the middle
    beam = np.exp(-(((y % bay) / bay - .5) / .05) ** 2)
    tc = .14 + .2 * beam + .24 * np.exp(-((s - 1) / .2) ** 2)
    rgb = ramp(tc, [(0, (10, 7, 4)), (.3, (44, 30, 14)), (.6, (112, 80, 36)), (1, (220, 176, 96))])
    glow = (np.exp(-(s / .07) ** 2) * .55)[..., None]
    rgb = rgb * (1 - glow) + glow * np.array((255, 232, 176))
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(f'{OUT}/card-hall-ceiling.webp', 'WEBP', quality=66, method=6)


def pearl_logos():
    # The team logos are drawn for dark cards, so three of them are mostly or wholly
    # white, and vanish on Canton's pearl. These are the same shapes in team colours:
    # Rams blue with a gold horn, Jets green, Broncos navy with the orange mane kept.
    # The Chargers' bolt reads fine as it is: recolouring its edge only added speckle.
    from scipy import ndimage as ni
    base = os.path.join(OUT, '..', 'logos')
    dest = os.path.join(base, 'pearl')
    os.makedirs(dest, exist_ok=True)
    def load(team):
        return np.asarray(Image.open(os.path.join(base, f'{team}.webp')).convert('RGBA'), dtype=np.float32)
    def keep(team, rgb, alpha):
        Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).astype('uint8'), 'RGBA').save(os.path.join(dest, f'{team}.webp'), 'WEBP', quality=90, alpha_quality=95, method=6)
    # The Rams file is four shapes: the L, the A, and the two curves of the horn. Edge
    # pixels take the colour of the nearest shape, so nothing fringes.
    a = load('lar')
    parts, count = ni.label(a[..., 3] > 127)
    sizes = ni.sum(parts > 0, parts, range(1, count + 1))
    big = [i + 1 for i in np.argsort(sizes)[::-1][:4]]
    by_top = sorted(big, key=lambda i: np.nonzero(parts == i)[0].mean())
    horn = {by_top[0], by_top[-1]}
    near = ni.distance_transform_edt(~np.isin(parts, big), return_distances=False, return_indices=True)
    owner = parts[near[0], near[1]]
    rgb = np.where(np.isin(owner, list(horn))[..., None], np.array((240, 164, 0.)), np.array((0, 53, 148.)))
    keep('lar', rgb, a[..., 3])
    a = load('nyj')
    keep('nyj', np.ones_like(a[..., :3]) * np.array((18, 87, 64.)), a[..., 3])
    a = load('den')
    white = np.clip((a[..., :3].min(-1) - 150) / 90, 0, 1)[..., None]
    keep('den', a[..., :3] * (1 - white) + np.array((10, 35, 67.)) * white, a[..., 3])


def smoke():
    # Immortal: jade smoke, drifting slowly up behind the player. Joey wanted the
    # graphics limited, and this is one small tile on one layer. Seamless top to
    # bottom, so it can drift forever.
    S = 256
    global W, H
    keep = W, H
    W, H = S, S
    n = fbm(3.7, 141, sx=.8, sy=1.5)
    W, H = keep
    a = np.clip(n * .42 + .34, 0, 1) ** 1.7
    rgba = np.dstack([np.full((S, S), 44, 'uint8'), np.full((S, S), 232, 'uint8'), np.full((S, S), 150, 'uint8'), (a * 255).astype('uint8')])
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/card-smoke.webp', 'WEBP', quality=70, alpha_quality=70, method=6)


def nebula():
    # Transcendent: deep space behind the player, pink and blue gas over black.
    a, b = fbm(3.0, 111), fbm(3.0, 112)
    yy, xx = np.mgrid[0:H, 0:W]
    wx = ((xx + a * 44).astype(int)) % W
    wy = ((yy + b * 44).astype(int)) % H
    pink = np.clip(fbm(3.2, 113)[wy, wx] * .55 + .35, 0, 1) ** 1.6
    blue = np.clip(fbm(3.2, 114)[wy, wx] * .55 + .3, 0, 1) ** 1.7
    deep = np.clip(fbm(3.6, 115)[wy, wx] * .5 + .5, 0, 1)
    rgb = np.array((10, 5, 26)) * np.ones((H, W, 1))
    rgb = rgb + deep[..., None] * np.array((46, 18, 104)) + pink[..., None] * np.array((226, 52, 190)) + blue[..., None] * np.array((36, 128, 240))
    rgb *= (.76 + .4 * spot())[..., None]
    return rgb + grain(6, 1.2)


def star_tile():
    # A tile of far stars, seamless top to bottom, so it can drift forever.
    S = 340
    rng = np.random.default_rng(121)
    core = Image.new('L', (S, S))
    draw = ImageDraw.Draw(core)
    for _ in range(95):
        x, y = rng.uniform(0, S, 2)
        v = int(rng.uniform(70, 255))
        if rng.random() < .13:
            draw.ellipse([x - 1.1, y - 1.1, x + 1.1, y + 1.1], fill=v)
        else:
            draw.point((x, y), fill=v)
    glow = core.filter(ImageFilter.GaussianBlur(1.4)).point(lambda v: min(255, v * 3))
    Image.fromarray(tint([(glow, (170, 190, 255)), (core, (255, 255, 255))], S, S), 'RGBA').save(f'{OUT}/card-stars.webp', 'WEBP', quality=78, alpha_quality=85, method=6)


os.makedirs(OUT, exist_ok=True)
edge_fire('immortal', [(0, (6, 120, 76)), (.35, (22, 210, 130)), (.7, (120, 255, 200)), (1, (240, 255, 248))], 51, 11.5)
edge_arcs()
pave()
smoke()
star_tile()
save('nebula', nebula())
save('steel', steel())
save('gold', gold())
save('glass', glass())
stock()
corona()
halo()
door()
god_rays()
hall()
portal()
molten()
pearl_logos()
banner()
print('ok', sorted(os.listdir(OUT)))
