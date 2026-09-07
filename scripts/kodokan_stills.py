"""Regenerate the shime-waza / kansetsu-waza quiz illustrations from the official
KODOKAN x IJF Academy demo videos (see src/assets/illustrations/ATTRIBUTION.md).

One PNG per technique -> src/assets/illustrations/<slug>.png, in a posterized
"silhouette" style on the app's dark background:

1. grab a frame at FRACTION of the clip (default 0.45, where the technique is
   usually fully applied; per-slug overrides below for clips whose midpoint is
   still the standing entry or an explanation shot);
2. crop the bottom 15% so the on-screen name caption never leaks into the quiz;
3. segment the two judoka with rembg (u2net_human_seg) — the Kodokan set has a
   plain teal wall, a green mat and white gis, so the mask is clean;
4. fill the mask with a 3-tone amber/gold posterization of the frame's
   luminance plus a light outline, over a radial dark gradient (same palette as
   src/assets/silhouettes/*.svg); resize to 600px wide.

Also writes contact.jpg in the work dir for a quick visual check.

    pip install yt-dlp pillow numpy "rembg[cpu]"   # plus ffmpeg/ffprobe on PATH
    python scripts/kodokan_stills.py [fraction=0.45] [workdir=.kodokan-stills]

Video IDs are read from src-tauri/src/data.rs (groups 7 and 8), so adding a
technique there is enough. Downloads are cached in the work dir (gitignored);
the ~170 MB segmentation model is cached by rembg under ~/.rembg on first run.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import new_session, remove

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

# Palette shared with the category silhouettes (SVG): dark navy gradient,
# amber/gold figure tones, pale outline.
BG_INNER, BG_OUTER = (26, 31, 48), (15, 18, 25)
TONES = np.array([(120, 60, 20), (217, 119, 6), (253, 230, 138)], dtype=np.uint8)
TONE_CUTS = [90, 170]        # luminance thresholds → dark / mid / light tone
OUTLINE = (255, 245, 200)
MASK_THRESHOLD = 110

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


def grab_frame(path: pathlib.Path, seconds: float, dst: pathlib.Path) -> Image.Image:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{seconds:.2f}",
                    "-i", str(path), "-frames:v", "1", str(dst)], check=True)
    im = Image.open(dst).convert("RGB")
    w, h = im.size
    return im.crop((0, 0, w, int(h * CAPTION_CROP)))


def person_mask(im: Image.Image, session) -> Image.Image:
    cut = remove(im, session=session, only_mask=True, post_process_mask=True)
    soft = cut.convert("L").filter(ImageFilter.GaussianBlur(0.8))
    return soft.point(lambda v: 255 if v > MASK_THRESHOLD else 0)


def background(size: tuple[int, int]) -> Image.Image:
    w, h = size
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    r = np.clip(np.sqrt((x - 0.5) ** 2 + (y - 0.4) ** 2) / 0.75, 0, 1)[..., None]
    arr = np.array(BG_INNER) * (1 - r) + np.array(BG_OUTER) * r
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def posterize(im: Image.Image, mask: Image.Image) -> Image.Image:
    out = background(im.size)
    lum = np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(1.0)), dtype=np.int32)
    figure = Image.fromarray(TONES[np.digitize(lum, TONE_CUTS)], "RGB")
    out.paste(figure, (0, 0), mask)
    edge = mask.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    out.paste(Image.new("RGB", im.size, OUTLINE), (0, 0), edge.point(lambda v: int(v * 0.9)))
    return out


def main() -> None:
    VIDS.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(exist_ok=True)
    session = new_session("u2net_human_seg")
    thumbs: list[Image.Image] = []
    for slug, video_id in technique_videos().items():
        mp4 = download(video_id)
        fraction = FRACTION_OVERRIDES.get(slug, DEFAULT_FRACTION)
        frame = grab_frame(mp4, duration(mp4) * fraction, FRAMES / f"{slug}.png")
        mask = person_mask(frame, session)
        coverage = float(np.asarray(mask).mean() / 255)
        art = posterize(frame, mask)
        art = art.resize((WIDTH, int(WIDTH * art.height / art.width)), Image.LANCZOS)
        dst = OUT / f"{slug}.png"
        # 3 figure tones + outline + a smooth gradient fit comfortably in a
        # 96-colour palette; PNG-8 is ~3x smaller than truecolour here.
        art.quantize(colors=96, method=Image.Quantize.MEDIANCUT).save(dst, "PNG", optimize=True)
        print(f"{slug:28s} {video_id}  @{fraction:.2f}  mask {coverage:5.1%}  -> {dst.name} {dst.stat().st_size // 1024} KB")
        thumb = art.resize((300, int(300 * art.height / art.width)))
        ImageDraw.Draw(thumb).text((6, 6), slug, fill=(255, 255, 255))
        thumbs.append(thumb)
    cols = 4
    rows = (len(thumbs) + cols - 1) // cols
    tw, th = thumbs[0].size
    sheet = Image.new("RGB", (cols * tw, rows * th), (0, 0, 0))
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((i % cols) * tw, (i // cols) * th))
    sheet.save(WORK / "contact.jpg", quality=80)
    print("contact sheet:", WORK / "contact.jpg")


if __name__ == "__main__":
    main()
