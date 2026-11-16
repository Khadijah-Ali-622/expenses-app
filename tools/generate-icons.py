#!/usr/bin/env python3
"""Crop the wallet icon source and generate Android, PWA, and Play Store assets."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

NAVY = (10, 38, 75, 255)  # #0A264B
NAVY_RGB = (10, 38, 75)
SOURCE = Path("/workspace/icon/app-icon-source.jpg")
ROOT = Path("/workspace/expenses-app")
ANDROID_RES = ROOT / "native/android/app/src/main/res"

# Adaptive-icon safe zone is the inner 66% of the 108dp canvas.
SAFE = 0.66


def flood_background(im: Image.Image, threshold: int = 232) -> Image.Image:
    """Return an 'L' mask: 255 = page background (white margin), 0 = artwork."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    pix = rgb.load()
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    def is_bg(x, y):
        r, g, b = pix[x, y]
        return r >= threshold and g >= threshold and b >= threshold and abs(r - g) < 12 and abs(g - b) < 12
    seen = bytearray(w * h)
    stack = []
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        stack.append((x, y))
    # also seed along the edges
    for x in range(0, w, 8):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(0, h, 8):
        stack.append((0, y))
        stack.append((w - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(x, y):
            continue
        mp[x, y] = 255
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return mask


def crop_and_square(src: Image.Image) -> Image.Image:
    bg = flood_background(src)
    # Tight bbox of non-background pixels
    inverted = Image.eval(bg, lambda v: 255 - v)
    bbox = inverted.getbbox()
    if not bbox:
        raise SystemExit("Could not find artwork in source icon")
    # Small padding so we don't clip anti-aliased navy edge
    pad = 2
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(src.width, r + pad)
    b = min(src.height, b + pad)
    cropped = src.convert("RGBA").crop((l, t, r, b))
    bg_c = bg.crop((l, t, r, b))
    # Composite onto navy: background pixels become navy, fringe blends
    w, h = cropped.size
    out = Image.new("RGBA", (w, h), NAVY)
    cp = cropped.load()
    bp = bg_c.load()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if bp[x, y] == 255:
                op[x, y] = NAVY
            else:
                r, g, b, a = cp[x, y]
                # If a near-white fringe remains, blend toward navy
                if r > 220 and g > 220 and b > 220:
                    # leftover aa; treat as navy
                    op[x, y] = NAVY
                else:
                    op[x, y] = (r, g, b, 255)
    side = max(w, h)
    square = Image.new("RGBA", (side, side), NAVY)
    square.paste(out, ((side - w) // 2, (side - h) // 2))
    return square


def resize_rgba(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def circle_mask(size: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    return m


def make_round(im: Image.Image, size: int) -> Image.Image:
    sq = resize_rgba(im, size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(sq, (0, 0))
    out.putalpha(circle_mask(size))
    return out


def make_adaptive_foreground(master: Image.Image, size: int) -> Image.Image:
    """Artwork centered at 66% of the canvas so launcher masks do not clip it."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art_side = max(1, int(round(size * SAFE)))
    art = resize_rgba(master, art_side)
    x = (size - art_side) // 2
    canvas.paste(art, (x, x), art)
    return canvas


def make_maskable(master: Image.Image, size: int, fraction: float = 0.80) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), NAVY)
    art_side = max(1, int(round(size * fraction)))
    art = resize_rgba(master, art_side)
    x = (size - art_side) // 2
    canvas.paste(art, (x, x), art)
    return canvas


def make_splash(master: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), NAVY_RGB)
    # Artwork about 42% of the shorter side, centered
    side = max(1, int(round(min(width, height) * 0.42)))
    art = resize_rgba(master, side).convert("RGBA")
    x = (width - side) // 2
    y = (height - side) // 2
    canvas.paste(art, (x, y), art)
    return canvas


def save_png(im: Image.Image, path: Path, mode: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = im if mode is None else im.convert(mode)
    out.save(path, "PNG", optimize=True)
    print(f"  wrote {path.relative_to(ROOT)} {out.size} {out.mode}")


def make_feature_graphic(master: Image.Image) -> Image.Image:
    W, H = 1024, 500
    canvas = Image.new("RGB", (W, H), NAVY_RGB)
    # Soft darker vignette circle behind the icon
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse((40, 20, 500, 480), fill=(6, 24, 50, 255))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

    icon_side = 340
    art = resize_rgba(master, icon_side)
    # Slight rounded mask already in artwork; just place it
    canvas = canvas.convert("RGBA")
    canvas.paste(art, (80, (H - icon_side) // 2), art)

    font_path_bold = Path(
        "/usr/share/fonts/truetype/sand-box/custom/Open Sauce Sans/OpenSauceSans-Bold.ttf"
    )
    font_path_reg = Path(
        "/usr/share/fonts/truetype/sand-box/custom/Open Sauce Sans/OpenSauceSans-Regular.ttf"
    )
    title = ImageFont.truetype(str(font_path_bold), 86)
    sub = ImageFont.truetype(str(font_path_reg), 28)
    draw = ImageDraw.Draw(canvas)
    text_x = 460
    title_text = "Expenses"
    # Vertically centre the title+tagline block
    tag = "Track spending, stay on budget"
    # Measure
    tb = draw.textbbox((0, 0), title_text, font=title)
    sb = draw.textbbox((0, 0), tag, font=sub)
    block_h = (tb[3] - tb[1]) + 16 + (sb[3] - sb[1])
    y0 = (H - block_h) // 2 - 8
    draw.text((text_x, y0), title_text, font=title, fill=(255, 255, 255, 255))
    draw.text((text_x, y0 + (tb[3] - tb[1]) + 16), tag, font=sub, fill=(168, 196, 220, 255))
    return canvas.convert("RGB")


def make_favicon(master: Image.Image, dest: Path) -> None:
    sizes = [16, 32, 48]
    images = [resize_rgba(master, s) for s in sizes]
    images[0].save(dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
    print(f"  wrote {dest.relative_to(ROOT)} ico {sizes}")


def main() -> None:
    print("Loading", SOURCE)
    src = Image.open(SOURCE)
    master = crop_and_square(src)
    print("Master square", master.size, "navy #0A264B")
    # Keep a high-res master for reference (not required, but useful)
    ref = ROOT / "playstore/graphics/icon-master-1024.png"
    save_png(resize_rgba(master, 1024), ref)

    # PWA + favicon
    pwa = ROOT / "pwa"
    save_png(resize_rgba(master, 192), pwa / "icon-192.png")
    save_png(resize_rgba(master, 512), pwa / "icon-512.png")
    save_png(make_maskable(master, 192), pwa / "icon-192-maskable.png")
    save_png(make_maskable(master, 512), pwa / "icon-512-maskable.png")
    save_png(resize_rgba(master, 32), pwa / "favicon-32.png")
    save_png(resize_rgba(master, 180), pwa / "apple-touch-icon.png")
    make_favicon(master, ROOT / "favicon.ico")

    # Play Store
    gfx = ROOT / "playstore/graphics"
    save_png(resize_rgba(master, 512), gfx / "icon-512.png")
    save_png(make_feature_graphic(master), gfx / "feature-graphic.png")

    # Android legacy + round + adaptive foreground
    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    for name, side in densities.items():
        folder = ANDROID_RES / f"mipmap-{name}"
        save_png(resize_rgba(master, side), folder / "ic_launcher.png")
        save_png(make_round(master, side), folder / "ic_launcher_round.png")
        fg = make_adaptive_foreground(master, int(side * 108 / 48))
        save_png(fg, folder / "ic_launcher_foreground.png")

    # Splash screens — match existing Capacitor sizes
    splashes = {
        "drawable/splash.png": (480, 320),
        "drawable-land-mdpi/splash.png": (480, 320),
        "drawable-land-hdpi/splash.png": (800, 480),
        "drawable-land-xhdpi/splash.png": (1280, 720),
        "drawable-land-xxhdpi/splash.png": (1600, 960),
        "drawable-land-xxxhdpi/splash.png": (1920, 1280),
        "drawable-port-mdpi/splash.png": (320, 480),
        "drawable-port-hdpi/splash.png": (480, 800),
        "drawable-port-xhdpi/splash.png": (720, 1280),
        "drawable-port-xxhdpi/splash.png": (960, 1600),
        "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    }
    for rel, (w, h) in splashes.items():
        save_png(make_splash(master, w, h), ANDROID_RES / rel, mode="RGB")

    print("Done.")


if __name__ == "__main__":
    main()
