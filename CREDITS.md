# Credits & attribution

KataMarrant is built around content curated and produced by others. The app
itself is original code; the following sources make it useful.

## Reference videos — curated by judo.how

For each of the 40 Gokyo techniques, a "Watch video" button opens the
corresponding YouTube video that [judo.how](https://judo.how) embeds on its
technique pages. We don't host the videos — clicks go straight to YouTube —
and the original judo.how page is one click away via the `judo.how` button on
the same card.

- Curation: [judo.how](https://judo.how/) — full reference site for judo
  techniques, kata, and rules. Videos are embedded via the WordPress
  presto-player plugin; we extract the YouTube ID and link out.
- Each underlying YouTube video belongs to its respective uploader. Refer to
  the YouTube page itself for the upload's attribution and licence.

If you maintain a video that's linked here and would prefer a different
attribution, please open an issue.

## Technique illustrations — Wikimedia Commons

The 40 still PNGs in `src/assets/illustrations/` were extracted from a single
composite poster on Wikimedia Commons:

- [Gokyo-no-waza.jpg](https://commons.wikimedia.org/wiki/File:Gokyo-no-waza.jpg)
  by Wikimedia user **Mtwist** (signatures M2012 / M2013 in the drawings)
- See [`src/assets/illustrations/ATTRIBUTION.md`](src/assets/illustrations/ATTRIBUTION.md)
  for the cropping notes and the source's licence.

If you replace any illustration with your own image (animated GIF, etc.), update
or remove that attribution as appropriate.

## Wikipedia

Each technique card also links to the matching French Wikipedia article. Those
articles are licensed CC-BY-SA — see Wikipedia's
[reusing terms](https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia)
for the exact conditions.

## Names, kanji, French translations

The kanji and conventional French translations follow the FFJDA (Fédération
Française de Judo) and Kodokan reference materials. They are factual data and
not under copyright; if you spot a mistake, edit `src-tauri/src/data.rs`.
