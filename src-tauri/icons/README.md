# Icônes de KataMarrant

Ce dossier contient les icônes de l'application **KataMarrant** (entraînement de
kata de judo) — toutes générées à partir de `catmarrant.jpg`, le mascot maison
(jeu de mot : **kata** + **cat**).

## Source

`catmarrant.jpg` (512×512) — chat karatéka avec ceinture rouge, fond blanc.

## Régénération

```bash
cd src-tauri/icons
python generate_icons.py
```

Prérequis : Python 3 + Pillow (`pip install Pillow`).

Le script régénère :

- **Desktop** : `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`,
  `icon.png` (512), `icon.ico` (multi-tailles), `source-icon.png` (1024).
- **Windows Store / MSIX** : `Square*Logo.png` et `StoreLogo.png`.
- **Android** (`src-tauri/gen/android/app/src/main/res/`) :
  - `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` — launcher carré legacy.
  - `mipmap-*/ic_launcher_round.png` — launcher rond.
  - `mipmap-*/ic_launcher_foreground.png` — couche avant de l'icône adaptive
    (Android 8+), contenu cadré dans la safe zone 72dp / 108dp.
  - `drawable-*/splash_logo.png` — logo affiché sur le splash screen.

`icon.icns` (macOS) est généré automatiquement par Tauri lors du `tauri build`
à partir des PNG ci-dessus.

## Splash Android

Le splash est un layer-list `drawable/splash.xml` (fond blanc + logo centré),
appliqué via `android:windowBackground` dans `values/themes.xml` et
`values-night/themes.xml`. Il s'affiche pendant le chargement de la WebView Tauri
puis se dissout dès que le frontend prend la main.

## Configuration Tauri

Référencées dans `src-tauri/tauri.conf.json` :

```json
"bundle": {
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```
