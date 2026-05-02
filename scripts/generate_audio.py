#!/usr/bin/env python3
"""Generate per-technique audio clips for KataMarrant.

Reads the canonical romaji + kanji list from ``src-tauri/src/data.rs`` and
writes one MP3 per technique to ``src/assets/audio/<slug>.mp3``. These clips
are the *only* audio source the app uses (no live Web Speech) — what you
hear in dev is what users hear on a phone, so quality matters here.

Engines (in order of preference):
    1. openai      — gpt-4o-mini-tts. Highest quality, multilingual, accepts
                     a free-form ``instructions`` prompt to shape delivery
                     (calm, instructional, slow, native Japanese accent).
                     Requires OPENAI_API_KEY. Paid (~$0.015/1K chars).
    2. edge        — Microsoft Edge Neural voices (ja-JP-NanamiNeural by
                     default). Free, very natural Japanese. Recommended
                     default when no API key is set.
    3. gtts        — Google translate-TTS. Free, mediocre quality.
                     Last-resort fallback.

Why this exists:
    The frontend always plays pre-rendered MP3s for the audio drill mode.
    System TTS (Web Speech / Android system engines) varies wildly in
    quality and frequently mispronounces romaji as English letters. We
    pre-render once with the best engine available and ship the clips.

Requirements (install at least one):
    pip install openai          # premium
    pip install edge-tts        # free default
    pip install gtts            # last-resort fallback

Usage (run from repo root):
    # Auto-pick best engine that's available + configured:
    python scripts/generate_audio.py
    python scripts/generate_audio.py --force

    # Force a specific engine:
    python scripts/generate_audio.py --engine openai
    python scripts/generate_audio.py --engine edge --voice ja-JP-KeitaNeural
    python scripts/generate_audio.py --engine gtts

    # OpenAI options (only when --engine openai):
    python scripts/generate_audio.py --engine openai \
        --openai-voice nova --openai-model gpt-4o-mini-tts

Re-running is idempotent: existing clips are skipped unless --force is given.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA_RS = REPO / "src-tauri" / "src" / "data.rs"
OUT = REPO / "src" / "assets" / "audio"

# Match slug + name (rōmaji) + kanji inside the same Technique block.
# We feed kanji to the TTS engine (lang=ja) because that produces a native
# Japanese reading. Romaji fed to a Japanese engine makes it spell each
# letter ("g aa kke eee" instead of "gake"). Romaji is kept for log output.
_TECH_RE = re.compile(
    r'slug:\s*"(?P<slug>[^"]+)"'
    r'[^}]*?name:\s*"(?P<name>[^"]+)"'
    r'[^}]*?kanji:\s*"(?P<kanji>[^"]+)"',
    re.DOTALL,
)

# Default voice instructions for OpenAI gpt-4o-mini-tts. The model honors
# free-form delivery cues, which is the lever that gives us native-sounding
# Japanese rather than English-flavored Japanese.
_OPENAI_INSTRUCTIONS = (
    "Speak in clear, natural Japanese with a calm, instructional tone, "
    "as a judo sensei would announce a kata technique to a student. "
    "Use authentic Japanese pronunciation, not English-accented Japanese. "
    "Speak slightly slowly so each syllable is distinct."
)

# Canonical hiragana readings — these are what we actually feed to the TTS.
# Kanji alone is ambiguous: e.g. 跳 can be read hane / chō / tobu, and the
# model has no judo-domain prior to know which one applies (real bug
# observed: gpt-4o-mini-tts read 跳巻込 as something close to "tako-..."
# instead of "hane-makikomi"). Hiragana is unambiguous syllabic script, one
# reading only — the model says exactly what's written. Keys are slugs from
# data.rs. Add new entries here when adding techniques to data.rs.
_READINGS: dict[str, str] = {
    "de-ashi-harai":          "であしはらい",
    "hiza-guruma":            "ひざぐるま",
    "sasae-tsurikomi-ashi":   "ささえつりこみあし",
    "uki-goshi":              "うきごし",
    "o-soto-gari":            "おおそとがり",
    "o-goshi":                "おおごし",
    "o-uchi-gari":            "おおうちがり",
    "seoi-nage":              "せおいなげ",
    "ko-soto-gari":           "こそとがり",
    "ko-uchi-gari":           "こうちがり",
    "koshi-guruma":           "こしぐるま",
    "tsurikomi-goshi":        "つりこみごし",
    "okuri-ashi-harai":       "おくりあしはらい",
    "tai-otoshi":             "たいおとし",
    "harai-goshi":            "はらいごし",
    "uchi-mata":              "うちまた",
    "ko-soto-gake":           "こそとがけ",
    "tsuri-goshi":            "つりごし",
    "yoko-otoshi":            "よこおとし",
    "ashi-guruma":            "あしぐるま",
    "hane-goshi":             "はねごし",
    "harai-tsurikomi-ashi":   "はらいつりこみあし",
    "tomoe-nage":             "ともえなげ",
    "kata-guruma":            "かたぐるま",
    "sumi-gaeshi":            "すみがえし",
    "tani-otoshi":            "たにおとし",
    "hane-makikomi":          "はねまきこみ",
    "sukui-nage":             "すくいなげ",
    "utsuri-goshi":           "うつりごし",
    "o-guruma":               "おおぐるま",
    "soto-makikomi":          "そとまきこみ",
    "uki-otoshi":             "うきおとし",
    "o-soto-guruma":          "おおそとぐるま",
    "uki-waza":               "うきわざ",
    "yoko-wakare":            "よこわかれ",
    "yoko-guruma":            "よこぐるま",
    "ushiro-goshi":           "うしろ・ごし",
    "ura-nage":               "うらなげ",
    "sumi-otoshi":            "すみおとし",
    "yoko-gake":              "よこがけ",
}


def parse_techniques() -> list[tuple[str, str, str]]:
    if not DATA_RS.exists():
        sys.exit(f"error: {DATA_RS} not found - wrong cwd?")
    text = DATA_RS.read_text(encoding="utf-8")
    return _TECH_RE.findall(text)


# --------------------------------------------------------------------------
# Engine renderers
# --------------------------------------------------------------------------

def render_openai(text: str, voice: str, model: str,
                  instructions: str, out_path: Path) -> None:
    from openai import OpenAI
    client = OpenAI()  # picks up OPENAI_API_KEY from env
    # gpt-4o-mini-tts supports `instructions`; tts-1 / tts-1-hd ignore it.
    kwargs = dict(model=model, voice=voice, input=text, response_format="mp3")
    if "gpt-4o" in model:
        kwargs["instructions"] = instructions
    with client.audio.speech.with_streaming_response.create(**kwargs) as resp:
        resp.stream_to_file(str(out_path))


async def _edge_render(text: str, voice: str, rate: str, out_path: Path) -> None:
    import edge_tts
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(out_path))


def render_edge(text: str, voice: str, rate: str, out_path: Path) -> None:
    asyncio.run(_edge_render(text, voice, rate, out_path))


def render_gtts(text: str, lang: str, slow: bool, out_path: Path) -> None:
    from gtts import gTTS
    gTTS(text=text, lang=lang, slow=slow).save(str(out_path))


# --------------------------------------------------------------------------
# Engine selection
# --------------------------------------------------------------------------

def _import_ok(modname: str) -> bool:
    try:
        __import__(modname)
        return True
    except ImportError:
        return False


def auto_pick_engine() -> str:
    if os.environ.get("OPENAI_API_KEY") and _import_ok("openai"):
        return "openai"
    if _import_ok("edge_tts"):
        return "edge"
    if _import_ok("gtts"):
        return "gtts"
    sys.exit(
        "error: no TTS engine available. Install one of:\n"
        "  pip install openai      (premium, needs OPENAI_API_KEY)\n"
        "  pip install edge-tts    (free, recommended default)\n"
        "  pip install gtts        (last-resort fallback)"
    )


def ensure_engine_ready(engine: str) -> None:
    if engine == "openai":
        if not _import_ok("openai"):
            sys.exit("error: openai package not installed - run `pip install openai`")
        if not os.environ.get("OPENAI_API_KEY"):
            sys.exit("error: OPENAI_API_KEY not set in environment")
    elif engine == "edge":
        if not _import_ok("edge_tts"):
            sys.exit("error: edge-tts not installed - run `pip install edge-tts`")
    elif engine == "gtts":
        if not _import_ok("gtts"):
            sys.exit("error: gtts not installed - run `pip install gtts`")


def main() -> int:
    # Windows console default is cp1252 which can't encode kanji we log below.
    # Force UTF-8 on stdout/stderr — no-op on platforms that already use it.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="Generate KataMarrant audio clips")
    parser.add_argument("--force", action="store_true",
                        help="Re-render clips even if they already exist")
    parser.add_argument("--engine", choices=["openai", "edge", "gtts", "auto"],
                        default="auto",
                        help="TTS engine (default: auto — openai if key set, "
                             "else edge-tts, else gtts)")
    # OpenAI options
    parser.add_argument("--openai-voice", default="nova",
                        help="OpenAI voice (alloy, echo, fable, onyx, nova, "
                             "shimmer, ash, coral, sage, ballad, verse). "
                             "Default: nova")
    parser.add_argument("--openai-model", default="gpt-4o-mini-tts",
                        help="OpenAI TTS model (default: gpt-4o-mini-tts; "
                             "alternatives: tts-1, tts-1-hd)")
    parser.add_argument("--openai-instructions", default=_OPENAI_INSTRUCTIONS,
                        help="Delivery instructions passed to gpt-4o-mini-tts")
    # edge-tts options
    parser.add_argument("--voice", default="ja-JP-NanamiNeural",
                        help="edge-tts voice name (default: ja-JP-NanamiNeural; "
                             "try ja-JP-KeitaNeural for a male voice)")
    parser.add_argument("--rate", default="-10%",
                        help="edge-tts rate adjustment, e.g. '-10%%', '+0%%' "
                             "(default: -10%%)")
    # gTTS options
    parser.add_argument("--lang", default="ja",
                        help="gTTS language code (default: ja)")
    parser.add_argument("--slow", action="store_true",
                        help="gTTS slow delivery")
    parser.add_argument("--use-kanji", action="store_true",
                        help="Feed kanji to the engine instead of the canonical "
                             "hiragana reading. Useful for A/B testing — kanji "
                             "is ambiguous and the model often picks wrong "
                             "readings (e.g. 跳 as 'tobi' instead of 'hane'). "
                             "Default is hiragana.")
    args = parser.parse_args()

    engine = args.engine if args.engine != "auto" else auto_pick_engine()
    ensure_engine_ready(engine)

    OUT.mkdir(parents=True, exist_ok=True)
    techniques = parse_techniques()
    if not techniques:
        sys.exit("error: no techniques parsed from data.rs")

    badge = {
        "openai": f"openai {args.openai_model} / voice {args.openai_voice}",
        "edge":   f"edge-tts / voice {args.voice}",
        "gtts":   "gtts",
    }[engine]
    print(f"Generating {len(techniques)} clips -> {OUT}  ({badge})")

    missing_readings = [s for s, _, _ in techniques
                        if s not in _READINGS and not args.use_kanji]
    if missing_readings:
        print(f"  warn: {len(missing_readings)} slug(s) without a hiragana "
              f"reading, falling back to kanji for: {', '.join(missing_readings)}")

    for slug, name, kanji in techniques:
        out = OUT / f"{slug}.mp3"
        if out.exists() and not args.force:
            print(f"  skip  {slug:<24}  ({out.stat().st_size:>5} B)")
            continue
        # Hiragana > kanji for unambiguous TTS reading. Kanji is the fallback
        # when a slug isn't in _READINGS yet (or via --use-kanji for A/B).
        text = kanji if args.use_kanji else _READINGS.get(slug, kanji)
        try:
            if engine == "openai":
                render_openai(text, args.openai_voice, args.openai_model,
                              args.openai_instructions, out)
            elif engine == "edge":
                render_edge(text, args.voice, args.rate, out)
            else:
                render_gtts(text, args.lang, args.slow, out)
        except Exception as exc:
            print(f"  FAIL  {slug:<24}  {exc}")
            continue
        size = out.stat().st_size
        print(f"  wrote {slug:<24}  ({size:>5} B)  <-  {text}  [{name}]")
        # Network-bound APIs — be polite, don't burst.
        time.sleep(0.15)

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
