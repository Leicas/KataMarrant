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

## Sources to consider

- [Wikimedia Commons — Judo throws](https://commons.wikimedia.org/wiki/Category:Judo_throws)
  has CC-licensed animated GIFs for several gokyo techniques.
- Record your own loops from [judo.how](https://judo.how/en/techniques/) if you
  want an exact match — keep it short (2-3 s, no audio) and respect the source.

Aim for ~480x320, animated, < 500 KB each. The frontend renders them at ~280px
height.
