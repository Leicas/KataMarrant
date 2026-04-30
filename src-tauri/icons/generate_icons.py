#!/usr/bin/env python3
"""
Génère toutes les icônes de KataMarrant à partir de catmarrant.jpg.

Sortie :
- Icônes desktop Tauri (32, 64, 128, 128@2x, icon.png 512, icon.ico)
- Tuiles Windows Store (Square*Logo.png, StoreLogo.png)
- Icônes Android (legacy + round + adaptive foreground) à toutes les densités
- Image de splash Android (drawable-*/splash_logo.png)

Dépendances : Pillow (pip install Pillow)
"""

import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "catmarrant.jpg")
ANDROID_RES = os.path.normpath(
    os.path.join(HERE, "..", "gen", "android", "app", "src", "main", "res")
)


def load_source_rgba():
    img = Image.open(SRC).convert("RGBA")
    w, h = img.size
    if w != h:
        side = max(w, h)
        canvas = Image.new("RGBA", (side, side), (255, 255, 255, 255))
        canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
        img = canvas
    return img


def with_white_bg(img):
    # Tauri valide les icônes en mode RGBA — on garde l'alpha (opaque partout).
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.paste(img, (0, 0), img)
    return bg


def resize(img, size):
    return img.resize((size, size), Image.LANCZOS)


def round_mask(size):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    return mask


def make_round(img, size):
    sq = resize(img, size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(sq, (0, 0), round_mask(size))
    return out


def make_foreground(img, full):
    # Adaptive icon foreground: 108dp total, content kept inside 72dp safe zone (66.6%).
    out = Image.new("RGBA", (full, full), (0, 0, 0, 0))
    inner = int(full * 72 / 108)
    scaled = img.resize((inner, inner), Image.LANCZOS)
    offset = (full - inner) // 2
    out.paste(scaled, (offset, offset), scaled)
    return out


DESKTOP_PNG = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
}

# Windows Store / MSIX tiles that Tauri's bundler expects to find.
WINDOWS_TILES = {
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

# Android density buckets (legacy launcher / adaptive foreground / splash logo).
ANDROID_DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}
LEGACY_BASE = 48
FOREGROUND_BASE = 108
SPLASH_BASE = 192  # logo size in dp on the splash; Android scales to canvas


def main():
    src = load_source_rgba()

    print("Source :", SRC, src.size)

    # --- Desktop PNG ---
    print("\nIcônes desktop :")
    for name, size in DESKTOP_PNG.items():
        path = os.path.join(HERE, name)
        with_white_bg(resize(src, size)).save(path, "PNG")
        print(f"  {name:24s} {size}x{size}")

    # icon.png (512) — Tauri base.
    icon_png = os.path.join(HERE, "icon.png")
    with_white_bg(resize(src, 512)).save(icon_png, "PNG")
    print(f"  {'icon.png':24s} 512x512")

    # source-icon.png (1024) — utilisé par `tauri icon` si on veut re-générer.
    src_icon = os.path.join(HERE, "source-icon.png")
    with_white_bg(resize(src, 1024)).save(src_icon, "PNG")
    print(f"  {'source-icon.png':24s} 1024x1024")

    # icon.ico multi-tailles.
    ico_path = os.path.join(HERE, "icon.ico")
    base = with_white_bg(resize(src, 256))
    base.save(ico_path, format="ICO", sizes=[(s, s) for s in (16, 32, 48, 64, 128, 256)])
    print(f"  {'icon.ico':24s} 16/32/48/64/128/256")

    # --- Windows Store tiles ---
    print("\nTuiles Windows :")
    for name, size in WINDOWS_TILES.items():
        path = os.path.join(HERE, name)
        with_white_bg(resize(src, size)).save(path, "PNG")
        print(f"  {name:24s} {size}x{size}")

    # --- Android ---
    print("\nIcônes Android :")
    for bucket, factor in ANDROID_DENSITIES.items():
        out_dir = os.path.join(ANDROID_RES, f"mipmap-{bucket}")
        os.makedirs(out_dir, exist_ok=True)

        legacy = int(LEGACY_BASE * factor)
        fore = int(FOREGROUND_BASE * factor)

        # Legacy launcher (square, opaque).
        with_white_bg(resize(src, legacy)).save(
            os.path.join(out_dir, "ic_launcher.png"), "PNG"
        )
        # Round launcher.
        make_round(src, legacy).save(
            os.path.join(out_dir, "ic_launcher_round.png"), "PNG"
        )
        # Adaptive icon foreground (transparent edges, content centered in safe zone).
        make_foreground(src, fore).save(
            os.path.join(out_dir, "ic_launcher_foreground.png"), "PNG"
        )
        print(f"  mipmap-{bucket}: legacy={legacy} foreground={fore}")

    # --- Android splash logo ---
    print("\nLogo splash Android :")
    for bucket, factor in ANDROID_DENSITIES.items():
        out_dir = os.path.join(ANDROID_RES, f"drawable-{bucket}")
        os.makedirs(out_dir, exist_ok=True)
        size = int(SPLASH_BASE * factor)
        # Garder la transparence pour que le drawable de fond ressorte.
        resize(src, size).save(os.path.join(out_dir, "splash_logo.png"), "PNG")
        print(f"  drawable-{bucket}: splash_logo={size}")

    print("\nTerminé.")


if __name__ == "__main__":
    main()
