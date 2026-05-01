#!/usr/bin/env python3
"""Generate Play Store assets for KataMarrant.

Outputs to ``assets/store/``:
- play-icon-512.png   : 512x512 RGB (no alpha) — Play rejects RGBA here.
- feature-graphic.png : 1024x500 RGB — required for the store listing.

Requirements:
    pip install Pillow

Usage (run from repo root):
    python scripts/generate_store_assets.py
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parents[1]
SRC_ICON = REPO / "src-tauri" / "icons" / "source-icon.png"
OUT = REPO / "assets" / "store"

# Brand palette (matches src/styles.css :root).
BRAND = (239, 68, 68)         # judo red
BRAND_DEEP = (185, 28, 28)
KANJI = (253, 230, 138)       # belt gold
BG_DARK = (15, 18, 25)
TEXT = (241, 244, 252)
WHITE = (255, 255, 255)


def make_play_icon():
    """512x512 RGB. Flatten the RGBA source onto a brand-red gradient bg."""
    src = Image.open(SRC_ICON).convert("RGBA")
    # Resize to 512.
    src = src.resize((512, 512), Image.LANCZOS)
    # Flat brand-red bg (matches the in-app theme).
    bg = Image.new("RGB", (512, 512), BRAND)
    bg.paste(src, (0, 0), src)
    out = OUT / "play-icon-512.png"
    bg.save(out, "PNG", optimize=True)
    print(f"  wrote {out.name:<24}  {bg.size}  RGB")


def make_feature_graphic():
    """1024x500 RGB. Catmarrant centered + brand-red gradient + title."""
    w, h = 1024, 500
    canvas = Image.new("RGB", (w, h), BRAND_DEEP)

    # Soft radial gradient using a blurred ellipse — more interesting than flat.
    glow = Image.new("RGB", (w, h), BRAND_DEEP)
    draw = ImageDraw.Draw(glow)
    # Lighter brand red blob upper-right
    draw.ellipse((w * 0.55, -h * 0.4, w * 1.4, h * 1.0), fill=BRAND)
    # Subtle gold blob lower-left for depth
    draw.ellipse((-w * 0.2, h * 0.4, w * 0.5, h * 1.4),
                 fill=(int(BRAND[0] * 0.7), int(BRAND[1] * 0.4), int(BRAND[2] * 0.4)))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=120))
    canvas.paste(glow, (0, 0))

    # Catmarrant on the left, scaled so it fits with breathing room.
    cat_size = 380
    src = Image.open(SRC_ICON).convert("RGBA")
    src = src.resize((cat_size, cat_size), Image.LANCZOS)
    canvas.paste(src, (60, (h - cat_size) // 2), src)

    # Title text on the right.
    draw = ImageDraw.Draw(canvas)
    title_font = _load_font(86, bold=True)
    sub_font = _load_font(32)
    tag_font = _load_font(26)

    title_x = 510
    draw.text((title_x, 145), "KataMarrant", fill=WHITE, font=title_font)
    draw.text((title_x, 240), "Gokyo no Waza", fill=KANJI, font=sub_font)
    draw.text((title_x, 285), "Mémorise les 40 prises", fill=(255, 255, 255, 200),
              font=tag_font)
    draw.text((title_x, 320), "Memorise the 40 throws", fill=(255, 255, 255, 200),
              font=tag_font)

    out = OUT / "feature-graphic.png"
    canvas.save(out, "PNG", optimize=True)
    print(f"  wrote {out.name:<24}  {canvas.size}  RGB")


def _load_font(size: int, bold: bool = False):
    """Best-effort font loader. Falls back to PIL default if nothing found."""
    candidates = []
    if bold:
        candidates += [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
    candidates += [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Generating Play Store assets -> {OUT}")
    make_play_icon()
    make_feature_graphic()
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
