# Illustrations

This directory ships with 40 still PNGs cropped from the canonical
`Gokyo-no-waza.jpg` Wikimedia Commons poster — see [ATTRIBUTION.md](ATTRIBUTION.md).
You can replace any of them with an animated GIF (or any other static image) by
dropping a file with the matching slug. The frontend tries these in order:

```
assets/illustrations/<slug>.gif
assets/illustrations/<slug>.webp
assets/illustrations/<slug>.svg
assets/illustrations/<slug>.png
assets/illustrations/<slug>.jpg
<remote image_url from data.rs>     ← if you set it
assets/silhouettes/<category>.svg   ← final fallback
```

## Slugs

```
de-ashi-harai          hiza-guruma            sasae-tsurikomi-ashi  uki-goshi
o-soto-gari            o-goshi                o-uchi-gari           seoi-nage
ko-soto-gari           ko-uchi-gari           koshi-guruma          tsurikomi-goshi
okuri-ashi-harai       tai-otoshi             harai-goshi           uchi-mata
ko-soto-gake           tsuri-goshi            yoko-otoshi           ashi-guruma
hane-goshi             harai-tsurikomi-ashi   tomoe-nage            kata-guruma
sumi-gaeshi            tani-otoshi            hane-makikomi         sukui-nage
utsuri-goshi           o-guruma               soto-makikomi         uki-otoshi
o-soto-guruma          uki-waza               yoko-wakare           yoko-guruma
ushiro-goshi           ura-nage               sumi-otoshi           yoko-gake
```

The 7 osaekomi pins (`kesa-gatame` … `tate-shiho-gatame`) have individually
sourced illustrations listed in [ATTRIBUTION.md](ATTRIBUTION.md).

### Shime-waza / kansetsu-waza — posterized silhouettes

Groups 7 and 8 use one PNG per technique (`<slug>.png`, 600px wide): a
frame from the official KODOKAN × IJF Academy demo video (~45% into the clip,
bottom caption strip cropped), the two judoka segmented out with rembg and
re-rendered as a 3-tone amber/gold posterization with a light outline on the
app's dark gradient — same palette as the category silhouettes. Regenerate
with `scripts/kodokan_stills.py` (needs `yt-dlp`, `ffmpeg`, Pillow,
numpy, `rembg[cpu]`). See [ATTRIBUTION.md](ATTRIBUTION.md). If a
group is ever added without art, raise `ILLUSTRATED_GROUPS_MAX` in
`src/main.js` only once its files exist — below that bound the quiz falls
back to the kanji + romaji card. Slugs:

```
nami-juji-jime         gyaku-juji-jime        kata-juji-jime         hadaka-jime
okuri-eri-jime         kataha-jime            katate-jime            ryote-jime
sode-guruma-jime       tsukkomi-jime          sankaku-jime           do-jime
ude-garami             ude-hishigi-juji-gatame ude-hishigi-ude-gatame ude-hishigi-hiza-gatame
ude-hishigi-waki-gatame ude-hishigi-hara-gatame ude-hishigi-ashi-gatame ude-hishigi-te-gatame
ude-hishigi-sankaku-gatame ashi-garami
```

## Sources to consider

- [Wikimedia Commons — Judo throws](https://commons.wikimedia.org/wiki/Category:Judo_throws)
  has CC-licensed animated GIFs for several gokyo techniques.
- Record your own loops from [judo.how](https://judo.how/en/techniques/) if you
  want an exact match — keep it short (2-3 s, no audio) and respect the source.

Aim for ~480x320, animated, < 500 KB each. The frontend renders them at ~280px
height.
