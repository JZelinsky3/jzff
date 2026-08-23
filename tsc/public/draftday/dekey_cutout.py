"""Strip the baked-in transparency checkerboard out of an exported .jpg.

The two replacement portraits came back as JPEGs of what a transparent image
*looks like* in an editor: the subject over an opaque grey-and-white checker.
Keying it on colour alone would punch holes in the subject -- Mason's jersey
numbers are white and Joey's is cream -- so the checker is found by where it is
rather than by what colour it is: the flood of checker-coloured pixels that is
connected to the border of the frame. Interior whites are not connected to it
and survive.

    python3 dekey_cutout.py "new joey.jpg" joey.png

Writes an RGBA PNG trimmed to the subject. That is the shape the twelve
portraits are stored in (see ~/Desktop/pams 2026 power rankings/cutouts/trim);
the ones this board loads are those scaled to 620 tall and saved as webp into
cutouts/, which is where build_draft_data.py looks for them.
"""
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# Checker-like: grey (all three channels within a few points of each other) and
# either near-white or near the checker's light grey. Loose on both, because
# JPEG puts ringing on every square edge.
grey = (np.abs(r - g) < 26) & (np.abs(g - b) < 26) & (np.abs(r - b) < 26)
lum = a.mean(axis=2)
checkerish = grey & (lum > 178)

lbl, n = ndimage.label(checkerish)

# Most of it is the flood that reaches the frame edge.
edge = set(lbl[0].tolist()) | set(lbl[-1].tolist()) | \
       set(lbl[:, 0].tolist()) | set(lbl[:, -1].tolist())
edge.discard(0)
keep = set(edge)

# And then the enclosed pockets -- the gap between Mason's arm and his ribs is
# a hole you should see through, and it is not connected to the border. Those
# have to be told apart from the whites inside the subject, which is what the
# connectivity test was protecting in the first place. The checker gives itself
# away by being *two* exact neutral tones in quantity: about a third of it is
# 255,255,255 and about a third is 204,204,204. Painted whites in these
# portraits are cream, silver or shaded and are barely neutral at all -- the
# jersey numeral on Mason's chest scores 0.00 on both counts against the
# pocket's 0.30 and 0.30 -- so a fifth of each is a wide margin.
neutral = (a.max(axis=2) - a.min(axis=2)) <= 4
white = neutral & (lum >= 250)
light = neutral & (lum >= 194) & (lum <= 214)
for i in range(1, n + 1):
    if i in keep:
        continue
    m = lbl == i
    area = m.sum()
    if area < 200:
        continue
    if white[m].mean() >= .18 and light[m].mean() >= .18:
        keep.add(i)

bg = np.isin(lbl, list(keep))

# Close pinholes the ringing leaves inside the flood, then take a pixel off the
# subject side: the first ring of subject pixels carries the checker smeared
# into it by the compression, and left in it reads as a grey halo.
# Closing erodes with the outside of the frame counted as "not background",
# which eats a two-pixel ring off every edge of the image -- exactly the part
# that is definitely background. OR the flood back in afterwards.
bg = ndimage.binary_closing(bg, np.ones((3, 3)), iterations=2) | bg
bg = ndimage.binary_dilation(bg, np.ones((3, 3)), iterations=1)

alpha = np.where(bg, 0, 255).astype(np.uint8)
al = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6))

rgba = im.convert("RGBA")
rgba.putalpha(al)
bbox = Image.fromarray(alpha).getbbox()      # trim to the subject
rgba = rgba.crop(bbox)
rgba.save(out)
print(f"{out}  {rgba.size[0]}x{rgba.size[1]}  (was {im.size[0]}x{im.size[1]})")
