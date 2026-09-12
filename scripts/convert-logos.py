"""Convert logo PNGs to WebP and archive originals."""
import os
import shutil
from PIL import Image

BASE = r"C:\MAURINEX\Maurinex Projects\New folder\MaurMaket\assets\Logo"

FILES = [
    "Maurmaket Logo Text Trans Solo.png",
    "Maurmaket Logo Text Trans.png",
    "MaurMaket Logo Trans.png",
    "maurmaket-logo-icon.png",
    "maurmaket-logo-text.png",
    "Logo Art.png",
    "MaurMaket Logo Solid.png",
    "Maurmaket Logo Text Solid.png",
]

PNGS_DIR = os.path.join(BASE, "pngs")
WEBP_DIR = os.path.join(BASE, "webp")

os.makedirs(PNGS_DIR, exist_ok=True)
os.makedirs(WEBP_DIR, exist_ok=True)

converted = 0
for fname in FILES:
    src = os.path.join(BASE, fname)
    if not os.path.exists(src):
        print(f"  SKIP (not found): {fname}")
        continue

    # Move original PNG into pngs/ archive
    dst_png = os.path.join(PNGS_DIR, fname)
    if not os.path.exists(dst_png):
        shutil.move(src, dst_png)
        print(f"  Moved: {fname} -> pngs/")

    # Convert to WebP
    out_name = os.path.splitext(fname)[0] + ".webp"
    out_path = os.path.join(WEBP_DIR, out_name)
    img = Image.open(dst_png).convert("RGBA")
    img.save(out_path, "WEBP", quality=95)
    converted += 1
    print(f"  Converted: {fname} -> webp/{out_name}")

print(f"\nDone. Converted {converted} files to WebP.")
print(f"  Original PNGs archived in: pngs/")
print(f"  WebP outputs in: webp/")
