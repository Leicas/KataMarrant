"""Regenerate the shime-waza / kansetsu-waza quiz stills from the official
KODOKAN x IJF Academy demo videos (see src/assets/illustrations/ATTRIBUTION.md).

One JPEG per technique -> src/assets/illustrations/<slug>.jpg: a frame at FRACTION
of the clip (default 0.45, where the technique is usually fully applied; per-slug
overrides below for clips whose midpoint is still the standing entry or an
explanation shot), bottom 15% cropped away so the on-screen name caption does not
spoil the quiz, resized to 600px wide, JPEG q82. Also writes contact.jpg in the
work dir for a quick visual check.

    pip install yt-dlp pillow        # plus ffmpeg/ffprobe on PATH
    python scripts/kodokan_stills.py [fraction=0.45] [workdir=.kodokan-stills]

Video IDs are read from src-tauri/src/data.rs (groups 7 and 8), so adding a
technique there is enough. Downloads are cached in the work dir (gitignored).
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

from PIL import Image, ImageDraw

REPO = pathlib.Path(__file__).resolve().parents[1]
OUT = REPO / "src" / "assets" / "illustrations"
DATA_RS = REPO / "src-tauri" / "src" / "data.rs"
WORK = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else REPO / ".kodokan-stills")
VIDS = WORK / "vids"
FRAMES = WORK / "frames"
GROUPS = ("7", "8")  # shime-waza, kansetsu-waza
DEFAULT_FRACTION = float(sys.argv[1]) if len(sys.argv) > 1 else 0.45
CAPTION_CROP = 0.85   # keep the top 85% — the name caption sits bottom-left
WIDTH = 600

# Clips whose default frame shows the standing entry / a talking shot rather
# than the finished technique. Picked by eye from a contact sheet.
FRACTION_OVERRIDES: dict[str, float] = {
    "gyaku-juji-jime": 0.55,
    "ude-garami": 0.55,
    "ude-hishigi-hiza-gatame": 0.65,
    "ude-hishigi-waki-gatame": 0.55,
    "ude-hishigi-te-gatame": 0.55,
    "ude-hishigi-hara-gatame": 0.55,
}

_ROW = re.compile(r'slug:\s*"([^"]+)".*?group:\s*(\d+).*?youtube_id:\s*"([^"]*)"')


def technique_videos() -> dict[str, str]:
    text = DATA_RS.read_text(encoding="utf-8")
    return {m.group(1): m.group(3) for m in _ROW.finditer(text)
            if m.group(2) in GROUPS and m.group(3)}


def download(video_id: str) -> pathlib.Path:
    existing = next(VIDS.glob(f"{video_id}.*"), None)
    if existing:
        return existing
    subprocess.run([sys.executable, "-m", "yt_dlp", "-q", "--no-warnings",
                    "-f", "bv*[height<=480][ext=mp4]/bv*[height<=480]",
                    "-o", str(VIDS / "%(id)s.%(ext)s"),
                    f"https://youtu.be/{video_id}"], check=True)
    return next(VIDS.glob(f"{video_id}.*"))


def duration(path: pathlib.Path) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.decode().strip())


def grab(path: pathlib.Path, seconds: float, dst: pathlib.Path) -> Image.Image:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{seconds:.2f}",
                    "-i", str(path), "-frames:v", "1", str(dst)], check=True)
    im = Image.open(dst).convert("RGB")
    w, h = im.size
    im = im.crop((0, 0, w, int(h * CAPTION_CROP)))
    return im.resize((WIDTH, int(WIDTH * im.height / im.width)), Image.LANCZOS)


def main() -> None:
    VIDS.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(exist_ok=True)
    thumbs: list[Image.Image] = []
    for slug, video_id in technique_videos().items():
        mp4 = download(video_id)
        fraction = FRACTION_OVERRIDES.get(slug, DEFAULT_FRACTION)
        im = grab(mp4, duration(mp4) * fraction, FRAMES / f"{slug}.png")
        dst = OUT / f"{slug}.jpg"
        im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
        print(f"{slug:28s} {video_id}  @{fraction:.2f} -> {dst.name} {dst.stat().st_size // 1024} KB")
        thumb = im.resize((300, int(300 * im.height / im.width)))
        ImageDraw.Draw(thumb).text((6, 6), slug, fill=(255, 230, 120))
        thumbs.append(thumb)
    cols = 4
    rows = (len(thumbs) + cols - 1) // cols
    tw, th = thumbs[0].size
    sheet = Image.new("RGB", (cols * tw, rows * th), (20, 20, 30))
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((i % cols) * tw, (i // cols) * th))
    sheet.save(WORK / "contact.jpg", quality=80)
    print("contact sheet:", WORK / "contact.jpg")


if __name__ == "__main__":
    main()
