# The Locker Room's packs: the Mystery Pack's wrapper, recoloured, with each pack's name
# set in the banner. The lettering is lifted out rather than painted over, so the foil's
# own shading stays, and the colour goes on as a gradient map over the whole wrapper.
import math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC, FONT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
base = Image.open(SRC).convert('RGBA')
W, H = base.size
gray = np.asarray(base.convert('L'), dtype=np.float32) / 255
alpha = np.asarray(base.getchannel('A'))

BAND = [(20, 569), (485, 417), (485, 578), (187, 668), (20, 668)]
poly = Image.new('L', (W, H), 0)
ImageDraw.Draw(poly).polygon(BAND, fill=255)
inside = np.asarray(poly.filter(ImageFilter.MinFilter(5))) > 128

# The lettering: anything dark in the band, grown a little to take its soft edge too.
ink = (gray < .5) & inside
ink[:, :88] = False
ink[:, 468:] = False
m = Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
hole = np.asarray(m, dtype=np.float32) / 255

def gauss(a, r):
    p = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(p.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255

keep = (1 - hole) * (np.asarray(poly, dtype=np.float32) / 255)
fill = gauss(gray * keep, 16) / np.maximum(gauss(keep, 16), 1e-3)
grain = np.random.default_rng(3).normal(0, .016, gray.shape).astype(np.float32)
clean = gray * (1 - hole) + np.clip(fill + grain, 0, 1) * hole

ANGLE = math.degrees(math.atan2(569 - 417, 485 - 20))
CENTER = (284, 561)

def banner(title, sub):
    """The pack's name on a layer, at the banner's slant."""
    S = 3
    layer = Image.new('L', (900 * S, 340 * S), 0)
    d = ImageDraw.Draw(layer)
    size = 150 * S
    while True:
        f = ImageFont.truetype(FONT, size)
        l, t, r, b = d.textbbox((0, 0), title, font=f)
        if r - l <= 372 * S and b - t <= 90 * S:
            break
        size -= 2 * S
    cx, top = 450 * S, 92 * S
    d.text((cx - (l + r) / 2, top - t + (90 * S - (b - t)) / 2), title, font=f, fill=255)
    sf = ImageFont.truetype(FONT, 27 * S)
    y = top + 100 * S
    spaced = '  '.join(sub)
    sl, st, sr, sb = d.textbbox((0, 0), spaced, font=sf)
    d.text((cx - (sl + sr) / 2, y - st), spaced, font=sf, fill=255)
    half = (sr - sl) / 2 + 22 * S
    mid = y + (sb - st) / 2
    d.rectangle((cx - half - 60 * S, mid - 2 * S, cx - half, mid + 2 * S), fill=255)
    d.rectangle((cx + half, mid - 2 * S, cx + half + 60 * S, mid + 2 * S), fill=255)
    r = layer.rotate(ANGLE, resample=Image.BICUBIC).resize((900, 340), Image.LANCZOS)
    out = Image.new('L', (W, H), 0)
    out.paste(r, (CENTER[0] - 450, CENTER[1] - 170))
    return np.asarray(out, dtype=np.float32) / 255 * (np.asarray(poly, dtype=np.float32) / 255)

def hex2(c):
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255

def gradient(g, stops):
    xs = [s[0] for s in stops]
    cs = np.stack([hex2(s[1]) for s in stops])
    return np.stack([np.interp(g, xs, cs[:, i]) for i in range(3)], axis=-1)

def lift(c, k):
    return (hex2(c) * (1 - k) + k)

def tohex(v):
    return '#%02x%02x%02x' % tuple(int(np.clip(x, 0, 1) * 255) for x in v)

def wrapper(c):
    # Black stays black, the mids take the colour, and the top of the foil stays bright.
    deep = hex2(c) * .32
    return [(0, '#050505'), (.16, tohex(deep * .55)), (.42, tohex(deep * 1.5)), (.68, c), (.86, tohex(lift(c, .5))), (1, '#ffffff')]

GOLD = [(0, '#2a1a04'), (.3, '#7a4f10'), (.55, '#c98f22'), (.78, '#f4cf6a'), (1, '#fff6d2')]

def make(slug, title, color, boosted=False, sub='PACK'):
    ink_layer = banner(title, 'BOOSTED' if boosted else sub)
    g = np.clip(clean * (1 - ink_layer), 0, 1)
    rgb = gradient(g, wrapper(color))
    band = (np.asarray(poly.filter(ImageFilter.GaussianBlur(.8)), dtype=np.float32) / 255)[..., None]
    if boosted:
        gold = gradient(np.clip(clean, 0, 1), GOLD) * (1 - ink_layer[..., None]) + hex2('#160d02') * ink_layer[..., None]
        rgb = rgb * (1 - band) + gold * band
    else:
        # The banner stays pale, so the name reads as print on foil.
        pale = gradient(np.clip(clean, 0, 1), [(0, '#050505'), (.4, tohex(hex2(color) * .6)), (.75, tohex(lift(color, .62))), (1, '#ffffff')])
        pale = pale * (1 - ink_layer[..., None]) + np.array([.03, .03, .035], dtype=np.float32) * ink_layer[..., None]
        rgb = rgb * (1 - band) + pale * band
    out = np.dstack([np.clip(rgb, 0, 1) * 255, alpha.astype(np.float32)]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(f'{OUT}/{slug}.webp', quality=82, method=6)

PACKS = [
    ('starter', 'STARTER', '#8fb8cf', False), ('daily', 'DAILY', '#e8a135', False), ('bonus', 'BONUS', '#27b86a', False),
    ('free-agent', 'FREE AGENT', '#1fb7a3', True),
    ('afc', 'AFC', '#d3302b', True), ('nfc', 'NFC', '#2c6ce0', True),
    ('afc-east', 'AFC EAST', '#d8333c', True), ('afc-north', 'AFC NORTH', '#e6752a', True), ('afc-south', 'AFC SOUTH', '#d29c17', True), ('afc-west', 'AFC WEST', '#c7338d', True),
    ('nfc-east', 'NFC EAST', '#2d63df', True), ('nfc-north', 'NFC NORTH', '#1b8db4', True), ('nfc-south', 'NFC SOUTH', '#27a64c', True), ('nfc-west', 'NFC WEST', '#7a4ee0', True),
    ('00s', '2000s', '#7c97d0', True), ('10s', '2010s', '#16c2d3', True), ('20s', '2020s', '#e63b97', True), ('legends', 'LEGENDS', '#b9843a', True),
]
for slug, title, color, boostable in PACKS:
    make(slug, title, color)
    if boostable:
        make(f'{slug}-boost', title, color, True)
print('made', len(PACKS))
