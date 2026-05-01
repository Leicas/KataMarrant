#!/usr/bin/env python3
"""Generate per-technique audio clips for KataMarrant.

Reads the canonical romaji name list from ``src-tauri/src/data.rs`` and writes
one MP3 per technique to ``src/assets/audio/<slug>.mp3`` using Google's free
translate-TTS via the gTTS library.

Why this exists:
    Android System WebView (the WebView Tauri uses on Android) does NOT
    expose ``window.speechSynthesis`` — it's a documented Chromium-on-WebView
    limitation. The frontend tries Web Speech first and falls back to these
    pre-recorded clips when the API is missing. Desktop builds use Web
    Speech directly when available and don't strictly need the clips.

Requirements:
    pip install gtts

Usage (run from repo root):
    python scripts/generate_audio.py

Re-running is idempotent: existing clips are skipped unless --force is given.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA_RS = REPO / "src-tauri" / "src" / "data.rs"
OUT = REPO / "src" / "assets" / "audio"

# Match slug + name (rōmaji) + kanji inside the same Technique block.
# We feed kanji to gTTS (lang=ja) because that produces a native Japanese
# reading. Romaji fed to lang=ja makes gTTS spell each letter ("g aa kke
# eee" instead of "gake"). Romaji is kept around for log output.
_TECH_RE = re.compile(
    r'slug:\s*"(?P<slug>[^"]+)"'
    r'[^}]*?name:\s*"(?P<name>[^"]+)"'
    r'[^}]*?kanji:\s*"(?P<kanji>[^"]+)"',
    re.DOTALL,
)


def parse_techniques() -> list[tuple[str, str, str]]:
    if not DATA_RS.exists():
        sys.exit(f"error: {DATA_RS} not found - wrong cwd?")
    text = DATA_RS.read_text(encoding="utf-8")
    return _TECH_RE.findall(text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate KataMarrant audio clips")
    parser.add_argument("--force", action="store_true",
                        help="Re-render clips even if they already exist")
    parser.add_argument("--lang", default="ja",
                        help="gTTS language code (default: ja)")
    parser.add_argument("--slow", action="store_true",
                        help="Slower delivery (gTTS slow=True)")
    args = parser.parse_args()

    try:
        from gtts import gTTS
    except ImportError:
        sys.exit("error: gtts not installed - run `pip install gtts`")

    OUT.mkdir(parents=True, exist_ok=True)
    techniques = parse_techniques()
    if not techniques:
        sys.exit("error: no techniques parsed from data.rs")

    print(f"Generating {len(techniques)} clips -> {OUT}")
    for slug, name, kanji in techniques:
        out = OUT / f"{slug}.mp3"
        if out.exists() and not args.force:
            print(f"  skip  {slug:<24}  ({out.stat().st_size:>5} B)")
            continue
        try:
            tts = gTTS(text=kanji, lang=args.lang, slow=args.slow)
            tts.save(str(out))
        except Exception as exc:
            print(f"  FAIL  {slug:<24}  {exc}")
            continue
        size = out.stat().st_size
        print(f"  wrote {slug:<24}  ({size:>5} B)  <-  {kanji}  [{name}]")
        # gTTS hits translate.google.com — be polite, don't burst 40 reqs/s.
        time.sleep(0.15)

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
