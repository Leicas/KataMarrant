// KataMarrant — vanilla JS app.
//
// Tauri 2: __TAURI__.core.invoke / event.listen / opener.openUrl

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const opener = window.__TAURI__.opener;

const VALID_INTERVALS = [
  { v: 0,    en: "Off",   fr: "Désactivé" },
  { v: 5,    en: "5 min", fr: "5 min" },
  { v: 15,   en: "15 min", fr: "15 min" },
  { v: 30,   en: "30 min", fr: "30 min" },
  { v: 60,   en: "1 h",   fr: "1 h" },
  { v: 120,  en: "2 h",   fr: "2 h" },
  { v: 240,  en: "4 h",   fr: "4 h" },
  { v: 480,  en: "8 h",   fr: "8 h" },
];

const RAPID_LENGTH = 10;

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const I18N = {
  en: {
    "tab.home":     "Home",
    "tab.quiz":     "Quiz",
    "tab.rapid":    "Rapid",
    "tab.drill":    "Drill",
    "tab.browse":   "Browse",
    "tab.stats":    "Stats",
    "tab.settings": "⚙",

    "home.today":         "Today",
    "home.questions":     "Questions answered",
    "home.accuracy":      "All-time accuracy",
    "home.total":         "Total answered",
    "home.prompt":        "Quiz prompt",
    "home.practice":      "Practice",
    "home.single":        "Single quiz",
    "home.rapid":         "Rapid-fire ({n})",
    "home.drill":         "Drill (timed)",
    "home.browse":        "Browse all 40 techniques",

    "quiz.start":         "Start",
    "quiz.intro":         "Press start to draw a question.",
    "quiz.watch":         "▶ Watch video",
    "quiz.judohow":       "judo.how",
    "quiz.wiki":          "Wikipedia",
    "quiz.correct":       "Correct!",
    "quiz.wrong":         "Wrong",
    "quiz.answer":        "Answer",
    "quiz.next":          "Next →",

    "rapid.title":        "Rapid-fire — {n} questions",
    "rapid.intro":        "Burst session. Tap fast, no time penalty.",
    "rapid.progress":     "Question {i} / {n} • {c} correct",
    "rapid.accuracy":     "{p}% accuracy",
    "rapid.again":        "Run another",
    "rapid.done":         "Done",
    "rapid.breakdown":    "Breakdown",

    "drill.title":        "Drill — auto-reveal timer",
    "drill.intro":        "Each technique reveals automatically when the timer runs out. Train your speed.",
    "drill.start":        "Start drill",
    "drill.next":         "Next →",
    "drill.exit":         "Exit drill",
    "drill.timed_out":    "Time's up",
    "drill.timer_label":  "Timer: {n}s",
    "drill.audio_hint":   "Tap to replay the technique name",

    "browse.group":       "Group {g} — {name}",
    "browse.seen":        "seen {n}×",
    "browse.status.acquired":     "Acquired",
    "browse.status.needs_work":   "Needs work",
    "browse.status.not_acquired": "Not acquired",
    "browse.accuracy":            "{p}%",

    "stats.title":            "Stats",
    "stats.empty":            "No data yet — answer a few questions and come back.",
    "stats.weekly":           "Weekly accuracy (last 8 weeks)",
    "stats.weekly_label":     "Week of {d}",
    "stats.by_group":         "By gokyo group",
    "stats.by_category":      "By category",
    "stats.response_time":    "Response time distribution",
    "stats.avg_response":     "Average: {s}s",
    "stats.no_response_data": "No response-time data yet (older answers were not timed).",
    "stats.score":            "{c} / {t}",
    "stats.percent":          "{p}%",

    "settings.title":     "Settings",
    "settings.lang":      "Language",
    "settings.lang_en":   "English",
    "settings.lang_fr":   "Français",
    "settings.interval":  "Quiz prompt interval",
    "settings.interval_help": "Triggers a notification (Android) or in-app prompt (desktop). 0 disables.",
    "settings.distractor": "Distractor difficulty",
    "settings.dist_group":    "Same gokyo group (hardest)",
    "settings.dist_category": "Same category (te/koshi/ashi/sutemi)",
    "settings.dist_any":      "Any (easiest)",
    "settings.group_filter":  "Group filter",
    "settings.group_all":     "All groups",
    "settings.group_only":    "Group {g} only — {name} ({tr})",
    "settings.hint_mode":     "Hint mode",
    "settings.hint_show":     "Image + kanji hint overlay",
    "settings.hint_hide":     "Image only (default)",
    "settings.hint_help":     "Hint overlays the kanji as a small mark on the image during the question. The full romaji + kanji + French translation are always revealed after you answer.",
    "settings.prompt_mode":   "Quiz prompt",
    "settings.prompt_image":  "Image (default)",
    "settings.prompt_japanese": "Kanji + rōmaji (text)",
    "settings.prompt_kanji_only": "Kanji only (hard)",
    "settings.prompt_free_text":  "Free text (type rōmaji)",
    "settings.prompt_help":   "Image: choose from rōmaji. Kanji+rōmaji / kanji-only: choose from translations. Free text: type the rōmaji of the technique you see.",
    "quiz.type_answer":      "Type the rōmaji…",
    "quiz.submit":           "Submit",
    "quiz.your_answer":      "You typed: {a}",
    "settings.drill_section": "Drill mode",
    "settings.drill_duration": "Drill timer",
    "settings.drill_duration_help": "How long you have to identify the technique before the answer is auto-revealed.",
    "settings.drill_prompt":  "Drill prompt",
    "settings.drill_prompt_image":  "Image",
    "settings.drill_prompt_kanji":  "Kanji only",
    "settings.drill_prompt_romaji": "Rōmaji only",
    "settings.drill_prompt_audio":  "Audio (Japanese TTS)",
    "settings.test":          "Trigger a quiz prompt now (test)",
    "settings.credits":       "Credits",
    "settings.credits_videos": "Reference videos curated by judo.how — the ▶ button opens the YouTube clip from the matching technique page. Each video belongs to its uploader.",
    "settings.credits_images": "Technique drawings extracted from the Gokyo-no-waza poster on Wikimedia Commons by user Mtwist.",
    "settings.credits_open":  "Open judo.how",
    "settings.credits_open_wm": "Open Wikimedia Commons",

    "video.no_video":      "No video available yet for this technique.",
    "video.open_judohow":  "Open the judo.how page",
    "video.open_external": "Open in browser",
    "video.credit_yt":     "Video on YouTube",
    "video.curated_by":    "curated by",

    "group.1": "1st group",
    "group.2": "2nd group",
    "group.3": "3rd group",
    "group.4": "4th group",
    "group.5": "5th group",

    "cat.ashi-waza":   "Leg techniques",
    "cat.koshi-waza":  "Hip techniques",
    "cat.te-waza":     "Hand techniques",
    "cat.sutemi-waza": "Sacrifice throws",
  },
  fr: {
    "tab.home":     "Accueil",
    "tab.quiz":     "Quiz",
    "tab.rapid":    "Rafale",
    "tab.drill":    "Drill",
    "tab.browse":   "Liste",
    "tab.stats":    "Stats",
    "tab.settings": "⚙",

    "home.today":         "Aujourd'hui",
    "home.questions":     "Questions répondues",
    "home.accuracy":      "Précision globale",
    "home.total":         "Total répondu",
    "home.prompt":        "Rappel quiz",
    "home.practice":      "Entraînement",
    "home.single":        "Une question",
    "home.rapid":         "Rafale ({n})",
    "home.drill":         "Drill (chrono)",
    "home.browse":        "Parcourir les 40 techniques",

    "quiz.start":         "Commencer",
    "quiz.intro":         "Appuie sur Commencer pour tirer une question.",
    "quiz.watch":         "▶ Voir la vidéo",
    "quiz.judohow":       "judo.how",
    "quiz.wiki":          "Wikipédia",
    "quiz.correct":       "Bonne réponse !",
    "quiz.wrong":         "Faux",
    "quiz.answer":        "Réponse",
    "quiz.next":          "Suivant →",

    "rapid.title":        "Rafale — {n} questions",
    "rapid.intro":        "Session rafale. Réponds vite, pas de pénalité.",
    "rapid.progress":     "Question {i} / {n} • {c} bonnes",
    "rapid.accuracy":     "{p}% de réussite",
    "rapid.again":        "Rejouer",
    "rapid.done":         "Terminé",
    "rapid.breakdown":    "Détail",

    "drill.title":        "Drill — révélation auto",
    "drill.intro":        "Chaque prise se révèle automatiquement à la fin du chrono. Travaille la vitesse.",
    "drill.start":        "Démarrer le drill",
    "drill.next":         "Suivant →",
    "drill.exit":         "Quitter le drill",
    "drill.timed_out":    "Temps écoulé",
    "drill.timer_label":  "Chrono : {n}s",
    "drill.audio_hint":   "Tape pour réécouter le nom de la prise",

    "browse.group":       "Groupe {g} — {name}",
    "browse.seen":        "vue {n}×",
    "browse.status.acquired":     "Acquis",
    "browse.status.needs_work":   "À renforcer",
    "browse.status.not_acquired": "Non acquis",
    "browse.accuracy":            "{p} %",

    "stats.title":            "Stats",
    "stats.empty":            "Pas encore de données — réponds à quelques questions et reviens.",
    "stats.weekly":           "Précision hebdomadaire (8 dernières semaines)",
    "stats.weekly_label":     "Semaine du {d}",
    "stats.by_group":         "Par groupe gokyo",
    "stats.by_category":      "Par catégorie",
    "stats.response_time":    "Distribution du temps de réponse",
    "stats.avg_response":     "Moyenne : {s}s",
    "stats.no_response_data": "Pas encore de données de temps (les anciennes réponses n'étaient pas chronométrées).",
    "stats.score":            "{c} / {t}",
    "stats.percent":          "{p} %",

    "settings.title":     "Réglages",
    "settings.lang":      "Langue",
    "settings.lang_en":   "English",
    "settings.lang_fr":   "Français",
    "settings.interval":  "Intervalle du rappel quiz",
    "settings.interval_help": "Déclenche une notification (Android) ou un prompt (desktop). 0 désactive.",
    "settings.distractor": "Difficulté des distracteurs",
    "settings.dist_group":    "Même groupe gokyo (le + dur)",
    "settings.dist_category": "Même catégorie (te/koshi/ashi/sutemi)",
    "settings.dist_any":      "N'importe (le + facile)",
    "settings.group_filter":  "Filtre par groupe",
    "settings.group_all":     "Tous les groupes",
    "settings.group_only":    "Groupe {g} seulement — {name} ({tr})",
    "settings.hint_mode":     "Mode indice",
    "settings.hint_show":     "Image + kanji en indice",
    "settings.hint_hide":     "Image seulement (défaut)",
    "settings.hint_help":     "L'indice ajoute le kanji en petit sur l'image pendant la question. Le romaji, le kanji et la traduction française sont toujours révélés après ta réponse.",
    "settings.prompt_mode":   "Type de question",
    "settings.prompt_image":  "Image (défaut)",
    "settings.prompt_japanese": "Kanji + rōmaji (texte)",
    "settings.prompt_kanji_only": "Kanji seul (difficile)",
    "settings.prompt_free_text":  "Texte libre (taper le rōmaji)",
    "settings.prompt_help":   "Image : choisir parmi les rōmaji. Kanji+rōmaji / kanji seul : choisir parmi les traductions. Texte libre : taper le rōmaji de la prise.",
    "quiz.type_answer":      "Tape le rōmaji…",
    "quiz.submit":           "Valider",
    "quiz.your_answer":      "Tu as tapé : {a}",
    "settings.drill_section": "Mode drill",
    "settings.drill_duration": "Durée du drill",
    "settings.drill_duration_help": "Temps disponible pour identifier la prise avant que la réponse ne s'affiche.",
    "settings.drill_prompt":  "Question du drill",
    "settings.drill_prompt_image":  "Image",
    "settings.drill_prompt_kanji":  "Kanji seul",
    "settings.drill_prompt_romaji": "Rōmaji seul",
    "settings.drill_prompt_audio":  "Audio (TTS japonais)",
    "settings.test":          "Déclencher un rappel maintenant (test)",
    "settings.credits":       "Crédits",
    "settings.credits_videos": "Vidéos de référence sélectionnées par judo.how — le bouton ▶ ouvre la vidéo YouTube intégrée sur la page de la technique. Chaque vidéo appartient à son auteur.",
    "settings.credits_images": "Dessins des techniques extraits du poster Gokyo-no-waza sur Wikimedia Commons par l'utilisateur Mtwist.",
    "settings.credits_open":  "Ouvrir judo.how",
    "settings.credits_open_wm": "Ouvrir Wikimedia Commons",

    "video.no_video":      "Pas encore de vidéo disponible pour cette technique.",
    "video.open_judohow":  "Ouvrir la page judo.how",
    "video.open_external": "Ouvrir dans le navigateur",
    "video.credit_yt":     "Vidéo sur YouTube",
    "video.curated_by":    "sélectionnée par",

    "group.1": "Premier groupe",
    "group.2": "Deuxième groupe",
    "group.3": "Troisième groupe",
    "group.4": "Quatrième groupe",
    "group.5": "Cinquième groupe",

    "cat.ashi-waza":   "Techniques de jambe",
    "cat.koshi-waza":  "Techniques de hanche",
    "cat.te-waza":     "Techniques de bras",
    "cat.sutemi-waza": "Techniques de sacrifice",
  },
};

const GROUP_NAMES = ["", "Dai Ikkyō", "Dai Nikyō", "Dai Sankyō", "Dai Yonkyō", "Dai Gokyō"];

function t(key, vars = {}) {
  const dict = I18N[store.lang] || I18N.en;
  let s = dict[key] ?? I18N.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

const store = {
  view: "home",
  lang: "en",
  techniques: [],
  settings: {
    interval: 0,
    distractor_mode: "same-group",
    group_filter: 0,
    show_kanji_hint: false,   // image-first quiz; kanji always revealed after answer
    quiz_prompt_mode: "image", // "image" | "japanese" (kanji+romaji card, FR choices)
    drill: {
      duration_s: 10,
      prompt_mode: "image",   // "image" | "kanji" | "romaji"
    },
  },
  quiz: null,
  rapid: null,
  drill: null,
};

const STORE_KEYS = {
  lang:           "kata.lang",
  distractor:     "kata.distractor_mode",
  groupFilter:    "kata.group_filter",
  showKanjiHint:  "kata.show_kanji_hint",
  quizPromptMode: "kata.quiz_prompt_mode",
  drillDuration:  "kata.drill_duration_s",
  drillPromptMode:"kata.drill_prompt_mode",
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== false && v != null) {
      node.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function navigate(view) {
  // Drill timer must be cancelled when leaving the drill view; otherwise it
  // fires later and silently records a "wrong" answer for a question the
  // user is no longer looking at.
  if (store.view === "drill" && view !== "drill") {
    clearDrillTimer();
  }
  store.view = view;
  els(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  els(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  render();
}

function loadLocalSettings() {
  try {
    const savedLang = localStorage.getItem(STORE_KEYS.lang);
    if (savedLang === "fr" || savedLang === "en") {
      store.lang = savedLang;
    } else {
      store.lang = (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
    }
    store.settings.distractor_mode =
      localStorage.getItem(STORE_KEYS.distractor) || "same-group";
    store.settings.group_filter = parseInt(localStorage.getItem(STORE_KEYS.groupFilter) || "0", 10);
    store.settings.show_kanji_hint = localStorage.getItem(STORE_KEYS.showKanjiHint) === "true";
    const savedPromptMode = localStorage.getItem(STORE_KEYS.quizPromptMode);
    if (["image", "japanese", "kanji", "free_text"].includes(savedPromptMode)) {
      store.settings.quiz_prompt_mode = savedPromptMode;
    }
    const savedDrillDur = parseInt(localStorage.getItem(STORE_KEYS.drillDuration) || "", 10);
    if ([5, 10, 20].includes(savedDrillDur)) {
      store.settings.drill.duration_s = savedDrillDur;
    }
    const savedDrillMode = localStorage.getItem(STORE_KEYS.drillPromptMode);
    if (["image", "kanji", "romaji", "audio"].includes(savedDrillMode)) {
      store.settings.drill.prompt_mode = savedDrillMode;
    }
  } catch (_) {}
}

function saveLocalSettings() {
  try {
    localStorage.setItem(STORE_KEYS.lang, store.lang);
    localStorage.setItem(STORE_KEYS.distractor, store.settings.distractor_mode);
    localStorage.setItem(STORE_KEYS.groupFilter, String(store.settings.group_filter));
    localStorage.setItem(STORE_KEYS.showKanjiHint, String(store.settings.show_kanji_hint));
    localStorage.setItem(STORE_KEYS.quizPromptMode, store.settings.quiz_prompt_mode);
    localStorage.setItem(STORE_KEYS.drillDuration, String(store.settings.drill.duration_s));
    localStorage.setItem(STORE_KEYS.drillPromptMode, store.settings.drill.prompt_mode);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Image cascade: local asset → remote image_url → category silhouette
// ---------------------------------------------------------------------------

function imageCandidates(tech) {
  const local = `assets/illustrations/${tech.slug}`;
  const cands = [`${local}.gif`, `${local}.webp`, `${local}.png`, `${local}.jpg`];
  if (tech.image_url) cands.push(tech.image_url);
  cands.push(`assets/silhouettes/${tech.category}.svg`);
  return cands;
}

// ---------------------------------------------------------------------------
// Free-text answer normalization. Strips diacritics + non-letters + case so
// "Ōsoto-gari" / "osotogari" / "OSOTO GARI" all match `osotogari`.
// ---------------------------------------------------------------------------

function normalizeRomaji(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fuzzyMatchRomaji(input, target) {
  return normalizeRomaji(input) === normalizeRomaji(target);
}

// ---------------------------------------------------------------------------
// Text-to-speech for the audio drill mode.
// Web Speech API works in modern Chromium WebViews. On Android, both the
// availability and the quality of pronunciation depend on the installed
// system TTS engine (typically Google TTS with the Japanese voice pack).
// When no ja-* voice is present we fall back to the platform default and
// drop the explicit lang= so the default voice doesn't reject the
// utterance. Many Android engines ALSO require a user gesture before the
// first speak() — so the auto-play below is best-effort, and the visible
// 🔊 ▶ button (a real tap) is the reliable trigger.
// ---------------------------------------------------------------------------

let _lastSpokenSlug = null;

function ttsAvailable() {
  return typeof window !== "undefined"
    && !!window.speechSynthesis
    && typeof window.SpeechSynthesisUtterance === "function";
}

function ttsVoiceSummary() {
  if (!ttsAvailable()) return { available: false, count: 0, jp: 0 };
  const voices = window.speechSynthesis.getVoices?.() || [];
  const jp = voices.filter(v => (v.lang || "").toLowerCase().startsWith("ja")).length;
  return { available: true, count: voices.length, jp };
}

// Cache of clip availability per slug — populated lazily on first play
// attempt. Avoids hammering the WebView with 404-equivalent loads when
// clips haven't been generated yet.
const _clipKnown = new Map(); // slug → "ok" | "missing"
let _audioEl = null;

function clipUrl(tech) {
  return `assets/audio/${tech.slug}.mp3`;
}

function playAudioClip(tech) {
  // Reuse a single Audio element so cancel-and-play is instant — creating a
  // new one each call leaks listeners and races with the previous load.
  if (!_audioEl) _audioEl = new Audio();
  try {
    _audioEl.pause();
  } catch (_) { /* ignore */ }
  const url = clipUrl(tech);
  _audioEl.src = url;
  const onError = () => {
    _clipKnown.set(tech.slug, "missing");
    console.warn("[TTS] clip missing:", url);
    _audioEl.removeEventListener("error", onError);
  };
  const onLoaded = () => {
    _clipKnown.set(tech.slug, "ok");
    _audioEl.removeEventListener("loadeddata", onLoaded);
  };
  _audioEl.addEventListener("error", onError);
  _audioEl.addEventListener("loadeddata", onLoaded);
  const p = _audioEl.play();
  if (p && typeof p.catch === "function") {
    p.catch((e) => console.warn("[TTS] play() rejected:", e?.message || e));
  }
  return true;
}

function speakTechnique(tech) {
  if (ttsAvailable()) {
    try {
      // cancel() clears any utterance still pending from a previous question.
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(tech.name);
      const voices = window.speechSynthesis.getVoices?.() || [];
      const jp = voices.find(v => (v.lang || "").toLowerCase().startsWith("ja"));
      if (jp) {
        u.voice = jp;
        u.lang = jp.lang || "ja-JP";
      } else {
        u.lang = "";
      }
      u.rate = 0.85;
      u.onstart = () => console.log("[TTS] start:", tech.name, "voice:", u.voice?.name || "(default)");
      u.onerror = (ev) => console.warn("[TTS] error:", ev?.error || ev);
      u.onend = () => console.log("[TTS] end:", tech.name);
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      console.error("[TTS] Web Speech threw, trying clip:", e);
    }
  }
  // Fallback path: Android System WebView doesn't expose speechSynthesis,
  // so we play a pre-recorded MP3 clip from `src/assets/audio/<slug>.mp3`.
  // See scripts/generate_audio.py to regenerate the clip set.
  return playAudioClip(tech);
}

function maybeAutoSpeak(tech) {
  if (_lastSpokenSlug === tech.slug) return;
  _lastSpokenSlug = tech.slug;
  // Defer slightly so the WebView paints the prompt before speak() fires.
  // On Android WebView the first speak() of a session may be silently
  // blocked until a user gesture happens; the manual replay button covers
  // that case.
  setTimeout(() => speakTechnique(tech), 120);
}

// Some engines populate the voice list asynchronously. When voices arrive,
// re-render the active drill so the diagnostic line below the audio button
// reflects the now-available ja voice.
if (typeof window !== "undefined" && window.speechSynthesis) {
  try {
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      if (typeof render === "function" && store.view === "drill"
          && store.settings.drill.prompt_mode === "audio") {
        render();
      }
    });
  } catch (_) { /* older WebViews */ }
}

function makeImageEl(tech, alt) {
  const cands = imageCandidates(tech);
  const img = document.createElement("img");
  img.alt = alt || tech.name;
  img.className = "quiz-image";
  let i = 0;
  const tryNext = () => {
    if (i >= cands.length) {
      img.removeEventListener("error", tryNext);
      return;
    }
    img.src = cands[i++];
  };
  img.addEventListener("error", tryNext);
  tryNext();
  return img;
}

function applyTabLabels() {
  document.documentElement.lang = store.lang;
  for (const btn of els(".tab")) {
    btn.textContent = t(`tab.${btn.dataset.view}`);
  }
}

function localizedName(tech) {
  // Returns the localized readable label. Romaji is canonical (international),
  // French / English translation is shown as a subtitle elsewhere.
  return tech.name;
}

// Localized translation of the technique's name (literal meaning).
function localizedTranslation(tech) {
  return store.lang === "fr" ? tech.name_fr : tech.name_en;
}

// "1st group" / "1er groupe"
function groupTrans(g) {
  return t(`group.${g}`);
}

// "Leg techniques" / "Techniques de jambe"
function categoryTrans(cat) {
  return t(`cat.${cat}`);
}

// Stacked badge: Japanese on top, translation below.
function groupBadge(g, kind = "brand") {
  return h("span", { class: `badge stack ${kind}` },
    h("span", { class: "jp" }, `${g}. ${GROUP_NAMES[g] || ""}`),
    h("span", { class: "tr" }, groupTrans(g)),
  );
}

function categoryBadge(cat, kind = "") {
  return h("span", { class: `badge stack ${kind}` },
    h("span", { class: "jp" }, cat),
    h("span", { class: "tr" }, categoryTrans(cat)),
  );
}

async function openExternal(url) {
  try { await opener.openUrl(url); }
  catch (e) { console.error("openUrl failed", e); window.open(url, "_blank"); }
}

function videoUrl(tech) {
  return tech.youtube_id ? `https://youtu.be/${tech.youtube_id}` : tech.judo_how_url;
}

// ---------------------------------------------------------------------------
// Video modal: in-app YouTube playback via iframe
// ---------------------------------------------------------------------------

function openVideoModal(tech) {
  const modal = el("#video-modal");
  if (!modal) return;
  const header = el(".video-modal-header", modal);
  const wrap   = el(".video-modal-iframe-wrap", modal);
  const footer = el(".video-modal-footer", modal);

  header.innerHTML = "";
  header.appendChild(h("div", { class: "title" },
    h("span", {}, tech.name),
    h("span", { class: "kj" }, tech.kanji),
  ));
  header.appendChild(h("div", { class: "sub" }, localizedTranslation(tech)));

  wrap.innerHTML = "";
  if (tech.youtube_id) {
    // youtube-nocookie reduces tracking until interaction; playsinline=1 is
    // required so the Android WebView keeps the player inside the iframe
    // rather than handing off to the native YouTube app / fullscreen player.
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
      iv_load_policy: "3",
      playsinline: "1",
    });
    const src = `https://www.youtube-nocookie.com/embed/${tech.youtube_id}?${params}`;
    wrap.appendChild(h("iframe", {
      src,
      title: tech.name,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowfullscreen: "true",
      referrerpolicy: "strict-origin-when-cross-origin",
    }));
  } else {
    wrap.appendChild(h("div", { class: "placeholder" },
      h("div", { style: "font-size:32px" }, "🎬"),
      h("div", {}, t("video.no_video")),
      h("button", {
        class: "btn",
        onclick: () => { closeVideoModal(); openExternal(tech.judo_how_url); },
      }, t("video.open_judohow")),
    ));
  }

  footer.innerHTML = "";
  footer.appendChild(h("div", { class: "credit" },
    tech.youtube_id
      ? `${t("video.credit_yt")} • ${t("video.curated_by")} `
      : `${t("video.curated_by")} `,
    h("a", {
      href: "#",
      onclick: (e) => { e.preventDefault(); openExternal(tech.judo_how_url); },
    }, "judo.how"),
  ));
  footer.appendChild(h("button", {
    class: "btn ghost small",
    onclick: () => { closeVideoModal(); openExternal(videoUrl(tech)); },
  }, t("video.open_external")));

  modal.classList.remove("hidden");
}

function closeVideoModal() {
  const modal = el("#video-modal");
  if (!modal) return;
  // Empty the iframe so playback stops
  const wrap = el(".video-modal-iframe-wrap", modal);
  if (wrap) wrap.innerHTML = "";
  modal.classList.add("hidden");
}

function bindVideoModal() {
  const modal = el("#video-modal");
  if (!modal) return;
  el(".video-modal-close", modal)?.addEventListener("click", closeVideoModal);
  el(".video-modal-backdrop", modal)?.addEventListener("click", closeVideoModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeVideoModal();
  });
}

function intervalLabel(v) {
  const i = VALID_INTERVALS.find(i => i.v === v);
  return i ? i[store.lang] || i.en : String(v);
}

// ---------------------------------------------------------------------------
// Backend wrappers
// ---------------------------------------------------------------------------

async function fetchInterval() {
  try { store.settings.interval = await invoke("get_quiz_interval"); }
  catch (e) { console.error(e); }
}

async function setInterval_(minutes) {
  await invoke("set_quiz_interval", { minutes });
  store.settings.interval = minutes;
}

async function fetchTechniques() {
  store.techniques = await invoke("list_techniques");
}

async function fetchOverallStats() {
  return invoke("get_overall_stats");
}

async function fetchAllStats() {
  return invoke("get_all_technique_stats");
}

async function fetchAnalytics() {
  return invoke("get_analytics");
}

async function fetchNextQuestion() {
  return invoke("next_question", {
    distractorMode: store.settings.distractor_mode,
    groupFilter: store.settings.group_filter || null,
  });
}

async function recordAnswer(slug, correct, mode, responseMs) {
  return invoke("answer_question", { slug, correct, mode, responseMs: responseMs ?? null });
}

// Compute elapsed milliseconds since the question was first rendered. Returns
// null if the timestamp wasn't captured, so the backend stores NULL.
function elapsedMs(shownAt) {
  if (!shownAt) return null;
  const ms = Date.now() - shownAt;
  // Defensive bounds — clock skew or stale timestamps shouldn't poison stats.
  if (ms < 0 || ms > 24 * 3600 * 1000) return null;
  return ms;
}

// ---------------------------------------------------------------------------
// View renderers
// ---------------------------------------------------------------------------

async function renderHome() {
  const root = el("#view-home");
  root.innerHTML = "";

  let stats = { total_answered: 0, total_correct: 0, streak_today: 0 };
  try { stats = await fetchOverallStats(); } catch (_) {}

  const accuracy = stats.total_answered
    ? Math.round((stats.total_correct / stats.total_answered) * 100)
    : 0;

  root.appendChild(h("div", { class: "card" },
    h("h2", {}, t("home.today")),
    h("div", { class: "stat-row" },
      h("span", {}, t("home.questions")),
      h("span", { class: "num" }, String(stats.streak_today)),
    ),
    h("div", { class: "stat-row" },
      h("span", {}, t("home.accuracy")),
      h("span", { class: "num" }, `${accuracy}%`),
    ),
    h("div", { class: "stat-row" },
      h("span", {}, t("home.total")),
      h("span", { class: "num" }, String(stats.total_answered)),
    ),
    h("div", { class: "stat-row" },
      h("span", {}, t("home.prompt")),
      h("span", { class: "num" }, intervalLabel(store.settings.interval)),
    ),
  ));

  root.appendChild(h("div", { class: "card" },
    h("h2", {}, t("home.practice")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary full", onclick: () => startSingleQuiz() },
        t("home.single")),
    ),
    h("div", { class: "btn-row", style: "margin-top:8px" },
      h("button", { class: "btn full", onclick: () => startRapidFire() },
        t("home.rapid", { n: RAPID_LENGTH })),
    ),
    h("div", { class: "btn-row", style: "margin-top:8px" },
      h("button", { class: "btn full", onclick: () => startDrill() },
        t("home.drill")),
    ),
    h("div", { class: "btn-row", style: "margin-top:8px" },
      h("button", { class: "btn ghost full", onclick: () => navigate("browse") },
        t("home.browse")),
    ),
  ));
}

function renderQuizCard(q, mode, opts = {}) {
  const { answered = false, picked = null, onPick, onNext, footer } = opts;
  // Prompt mode controls what the user sees on the front of the card.
  // - "image"    → image cascade (default Gokyo quiz). Choices = romaji.
  // - "japanese" → big kanji + romaji subtitle. Choices = French translation.
  // - "kanji"    → big kanji only (drill harder option). Choices = French.
  // - "romaji"   → big romaji only (drill easier option). Choices = French.
  const promptMode = opts.promptMode || "image";

  const showKanjiHint = store.settings.show_kanji_hint;
  const tech = q.answer;

  // -- Prompt panel --------------------------------------------------------
  let promptEl;
  if (promptMode === "image" || answered) {
    // Image is always shown after the user answers, regardless of prompt
    // mode — the reveal panel below already covers the textual reveal.
    promptEl = h("div", { class: "quiz-image-wrap" + (answered ? " compact" : "") });
    promptEl.appendChild(makeImageEl(tech, "technique"));
    if (promptMode === "image" && showKanjiHint && !answered) {
      promptEl.appendChild(h("div", { class: "hint-kanji" }, tech.kanji));
    }
  } else if (promptMode === "japanese") {
    promptEl = h("div", { class: "quiz-text-prompt" },
      h("div", { class: "prompt-kanji" }, tech.kanji),
      h("div", { class: "prompt-romaji" }, tech.name),
    );
  } else if (promptMode === "kanji") {
    promptEl = h("div", { class: "quiz-text-prompt kanji-only" },
      h("div", { class: "prompt-kanji big" }, tech.kanji),
    );
  } else if (promptMode === "audio") {
    const tts = ttsVoiceSummary();
    let diag;
    if (!tts.available) {
      // Android WebView path. We fall back to pre-recorded MP3 clips.
      const known = _clipKnown.get(tech.slug);
      if (known === "missing") {
        diag = "⚠ no clip for this technique — run scripts/generate_audio.py";
      } else if (known === "ok") {
        diag = "♪ playing recorded clip";
      } else {
        diag = "♪ recorded clip (Web Speech unavailable in WebView)";
      }
    } else if (tts.count === 0) {
      diag = "voices loading…";
    } else if (tts.jp === 0) {
      diag = `⚠ no ja-JP voice (${tts.count} voices) — install Japanese in TTS settings`;
    } else {
      diag = `ja-JP ✓ · ${tts.jp}/${tts.count} voices`;
    }
    promptEl = h("div", { class: "quiz-text-prompt audio-mode" },
      h("button", {
        class: "btn primary audio-play-btn",
        onclick: () => speakTechnique(tech),
        "aria-label": "Replay audio",
      }, "🔊 ▶"),
      h("div", { class: "muted", style: "margin-top:10px" }, t("drill.audio_hint")),
      h("div", { class: "muted", style: "margin-top:6px; font-size:10px; opacity:.6" }, diag),
    );
    if (!answered) maybeAutoSpeak(tech);
  } else if (promptMode === "free_text") {
    // Free-text reuses the image prompt; the choices area below is replaced
    // by a text input in which the user types the rōmaji from memory.
    promptEl = h("div", { class: "quiz-image-wrap" + (answered ? " compact" : "") });
    promptEl.appendChild(makeImageEl(tech, "technique"));
  } else {
    // romaji
    promptEl = h("div", { class: "quiz-text-prompt" },
      h("div", { class: "prompt-romaji big" }, tech.name),
    );
  }

  // -- Interaction (choices or free-text input) --------------------------
  // For image prompt the answer is romaji (canonical); for any other text-
  // based prompt the choices show the French translation so the user is
  // matching meaning rather than reading the same script back twice. The
  // free-text mode skips choices entirely and asks for a typed romaji
  // answer (fuzzy-matched against the canonical name).
  const useFrenchChoices = promptMode !== "image" && promptMode !== "free_text";
  let interactionEl;
  if (promptMode === "free_text") {
    if (answered) {
      interactionEl = opts.typedAnswer
        ? h("div", { class: "free-text-recap muted" },
            t("quiz.your_answer", { a: opts.typedAnswer }))
        : h("div", {});
    } else {
      const input = h("input", {
        type: "text",
        class: "free-text-field",
        placeholder: t("quiz.type_answer"),
        autocomplete: "off",
        autocapitalize: "none",
        spellcheck: "false",
      });
      const submit = () => {
        if (!onPick) return;
        const guess = input.value.trim();
        if (!guess) return;
        const isCorrect = fuzzyMatchRomaji(guess, tech.name);
        onPick(isCorrect ? tech.slug : null, isCorrect, { typed: guess });
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      interactionEl = h("div", { class: "free-text-wrap" },
        input,
        h("button", { class: "btn primary full", onclick: submit }, t("quiz.submit")),
      );
      // Auto-focus the input shortly after mount; immediate focus() races
      // with the parent .innerHTML="" reset on Android WebView.
      setTimeout(() => input.focus?.(), 50);
    }
  } else {
    interactionEl = h("div", { class: "choices" });
    for (const c of q.choices) {
      const isCorrect = c.slug === tech.slug;
      const isPicked = c.slug === picked;
      let cls = "choice";
      if (answered) {
        if (isCorrect) cls += " correct";
        else if (isPicked) cls += " wrong";
      }
      const label = useFrenchChoices ? (localizedTranslation(c) || c.name) : c.name;
      const btn = h("button", {
        class: cls,
        disabled: answered,
        onclick: () => onPick && onPick(c.slug, isCorrect),
      }, label);
      interactionEl.appendChild(btn);
    }
  }

  // -- Card assembly -------------------------------------------------------
  // Pre-answer: show ONLY the gokyo group (e.g. "5. Dai Gokyō") — no group
  // translation and no category badge, both of which narrow the answer too
  // much. The full meta (group + category + translations) reappears in the
  // reveal panel after the user picks. Same logic for the
  // video/judo.how/wiki buttons — those would spoil the question.
  const card = h("div", { class: "card quiz-card" },
    h("div", { class: "quiz-meta" },
      h("span", { class: "badge brand" }, `${tech.group}. ${GROUP_NAMES[tech.group] || ""}`),
    ),
    promptEl,
    interactionEl,
  );

  // -- Reveal panel after answer ------------------------------------------
  if (answered) {
    const correct = picked === tech.slug;
    const revealChildren = [
      h("div", { class: "reveal-status" },
        correct ? `✓ ${t("quiz.correct")}` : `✗ ${t("quiz.wrong")}`),
      h("div", { class: "reveal-name" }, tech.name),
      h("div", { class: "reveal-kanji" }, tech.kanji),
      h("div", { class: "reveal-fr" }, localizedTranslation(tech)),
    ];
    if (promptMode === "free_text" && opts.typedAnswer && !correct) {
      revealChildren.push(h("div", { class: "reveal-typed" },
        t("quiz.your_answer", { a: opts.typedAnswer })));
    }
    revealChildren.push(h("div", { class: "reveal-meta" },
      groupBadge(tech.group, "gold"),
      categoryBadge(tech.category),
    ));
    const reveal = h("div", { class: `reveal ${correct ? "good" : "bad"}` },
      ...revealChildren,
      h("div", { class: "btn-row", style: "justify-content:center; margin-top:12px" },
        h("button", {
          class: "btn primary",
          onclick: () => openVideoModal(tech),
          title: tech.youtube_id ? "YouTube" : "judo.how",
        }, t("quiz.watch")),
        h("button", {
          class: "btn ghost small",
          onclick: () => openExternal(tech.judo_how_url),
        }, t("quiz.judohow")),
        h("button", {
          class: "btn ghost small",
          onclick: () => openExternal(tech.wikipedia_url),
        }, t("quiz.wiki")),
      ),
    );
    card.appendChild(reveal);

    if (onNext) {
      card.appendChild(h("div", { class: "btn-row", style: "margin-top:12px" },
        h("button", { class: "btn primary full", onclick: onNext }, t("quiz.next")),
      ));
    }
  }

  if (footer) card.appendChild(footer);
  return card;
}

async function renderQuiz() {
  const root = el("#view-quiz");
  root.innerHTML = "";

  if (!store.quiz) {
    root.appendChild(h("div", { class: "card" },
      h("h2", {}, t("tab.quiz")),
      h("p", { class: "muted" }, t("quiz.intro")),
      h("div", { class: "btn-row", style: "margin-top:10px" },
        h("button", { class: "btn primary full", onclick: () => startSingleQuiz() },
          t("quiz.start")),
      ),
    ));
    return;
  }

  const q = store.quiz.question;
  if (!q) return; // still loading
  root.appendChild(renderQuizCard(q, "single", {
    answered: store.quiz.answered,
    picked: store.quiz.picked,
    typedAnswer: store.quiz.typed_answer,
    promptMode: store.settings.quiz_prompt_mode,
    onPick: async (slug, isCorrect, extras = {}) => {
      store.quiz.answered = true;
      store.quiz.picked = slug;
      if (extras.typed != null) store.quiz.typed_answer = extras.typed;
      const ms = elapsedMs(store.quiz.shown_at);
      try { await recordAnswer(q.answer.slug, isCorrect, "single", ms); }
      catch (e) { console.error(e); }
      render();
    },
    onNext: () => { store.quiz = null; startSingleQuiz(); },
  }));
}

async function renderRapid() {
  const root = el("#view-rapid");
  root.innerHTML = "";

  if (!store.rapid) {
    root.appendChild(h("div", { class: "card" },
      h("h2", {}, t("rapid.title", { n: RAPID_LENGTH })),
      h("p", { class: "muted" }, t("rapid.intro")),
      h("div", { class: "btn-row", style: "margin-top:10px" },
        h("button", { class: "btn primary full", onclick: () => startRapidFire() },
          t("quiz.start")),
      ),
    ));
    return;
  }

  // End-of-run scoreboard.
  if (store.rapid.current >= store.rapid.total) {
    const r = store.rapid;
    const pct = Math.round((r.correct / r.total) * 100);
    root.appendChild(h("div", { class: "card" },
      h("div", { class: "score-big" }, `${r.correct} / ${r.total}`),
      h("div", { class: "score-sub" }, t("rapid.accuracy", { p: pct })),
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary full", onclick: () => startRapidFire() },
          t("rapid.again")),
      ),
      h("div", { class: "btn-row", style: "margin-top:8px" },
        h("button", { class: "btn ghost full", onclick: () => { store.rapid = null; navigate("home"); } },
          t("rapid.done")),
      ),
    ));

    const breakdown = h("div", { class: "card" }, h("h2", {}, t("rapid.breakdown")));
    for (const it of r.history) {
      const tech = store.techniques.find(t => t.slug === it.slug);
      if (!tech) continue;
      const tr = localizedTranslation(tech);
      breakdown.appendChild(h("div", { class: "stat-row" },
        h("span", {}, `${tech.kanji}  ${tech.name}${tr ? `  · ${tr}` : ""}`),
        h("span", { class: "num", style: it.correct ? "color:var(--good)" : "color:var(--bad)" },
          it.correct ? "✓" : "✗"),
      ));
    }
    root.appendChild(breakdown);
    return;
  }

  const r = store.rapid;
  const pct = (r.current / r.total) * 100;
  root.appendChild(h("div", { class: "muted", style: "margin-bottom:6px" },
    t("rapid.progress", { i: r.current + 1, n: r.total, c: r.correct })));
  root.appendChild(h("div", { class: "progress" }, h("div", { style: `width:${pct}%` })));

  const q = r.question;
  if (!q) return;
  root.appendChild(renderQuizCard(q, "rapid", {
    answered: r.answered,
    picked: r.picked,
    typedAnswer: r.typed_answer,
    promptMode: store.settings.quiz_prompt_mode,
    onPick: async (slug, isCorrect, extras = {}) => {
      r.answered = true;
      r.picked = slug;
      if (extras.typed != null) r.typed_answer = extras.typed;
      r.history.push({ slug: q.answer.slug, correct: isCorrect });
      if (isCorrect) r.correct++;
      const ms = elapsedMs(r.shown_at);
      try { await recordAnswer(q.answer.slug, isCorrect, "rapid", ms); }
      catch (e) { console.error(e); }
      render();
    },
    onNext: async () => {
      r.current++;
      r.answered = false;
      r.picked = null;
      r.typed_answer = null;
      r.question = null;
      r.shown_at = 0;
      if (r.current < r.total) {
        try {
          r.question = await fetchNextQuestion();
          r.shown_at = Date.now();
        } catch (e) { console.error(e); }
      }
      render();
    },
  }));
}

// ---------------------------------------------------------------------------
// Drill mode: continuous timed prompts with auto-reveal on timeout.
// ---------------------------------------------------------------------------

function clearDrillTimer() {
  if (store.drill && store.drill.timer_id != null) {
    clearTimeout(store.drill.timer_id);
    store.drill.timer_id = null;
  }
}

function armDrillTimer() {
  clearDrillTimer();
  if (!store.drill || !store.drill.question || store.drill.answered) return;
  const ms = store.settings.drill.duration_s * 1000;
  store.drill.deadline = Date.now() + ms;
  store.drill.timer_id = setTimeout(async () => {
    if (!store.drill || store.drill.answered) return;
    const slug = store.drill.question.answer.slug;
    const respMs = elapsedMs(store.drill.shown_at);
    store.drill.answered = true;
    store.drill.timed_out = true;
    store.drill.picked = null;
    store.drill.timer_id = null;
    try { await recordAnswer(slug, false, "drill", respMs); }
    catch (e) { console.error(e); }
    render();
  }, ms);
}

async function startDrill() {
  navigate("drill");
  store.drill = {
    question: null,
    answered: false,
    picked: null,
    timed_out: false,
    timer_id: null,
    deadline: 0,
    shown_at: 0,
  };
  render();
  try {
    store.drill.question = await fetchNextQuestion();
    store.drill.shown_at = Date.now();
    armDrillTimer();
  } catch (e) {
    console.error(e);
    store.drill = null;
  }
  render();
}

async function nextDrillQuestion() {
  clearDrillTimer();
  if (!store.drill) return;
  store.drill.answered = false;
  store.drill.picked = null;
  store.drill.timed_out = false;
  store.drill.question = null;
  store.drill.shown_at = 0;
  render();
  try {
    store.drill.question = await fetchNextQuestion();
    store.drill.shown_at = Date.now();
    armDrillTimer();
  } catch (e) {
    console.error(e);
  }
  render();
}

async function renderDrill() {
  const root = el("#view-drill");
  root.innerHTML = "";

  if (!store.drill) {
    root.appendChild(h("div", { class: "card" },
      h("h2", {}, t("drill.title")),
      h("p", { class: "muted" }, t("drill.intro")),
      h("div", { class: "btn-row", style: "margin-top:10px" },
        h("button", { class: "btn primary full", onclick: () => startDrill() },
          t("drill.start")),
      ),
    ));
    return;
  }

  const d = store.drill;
  const q = d.question;
  if (!q) return;

  const dur = store.settings.drill.duration_s;

  // Header: timer label + exit. The progress bar below is the visual timer;
  // it animates from full to empty over `duration_s`. When the user picks or
  // the deadline fires, we re-render with `answered=true` and the bar is
  // replaced by the reveal panel — natural stop point.
  root.appendChild(h("div", { class: "drill-header" },
    h("span", { class: "muted" }, t("drill.timer_label", { n: dur })),
    h("button", {
      class: "btn ghost small",
      onclick: () => { clearDrillTimer(); store.drill = null; navigate("home"); },
    }, t("drill.exit")),
  ));

  if (!d.answered) {
    // Inline animation-duration so changing the setting takes effect on the
    // next question without recompiling the stylesheet.
    root.appendChild(h("div", { class: "drill-progress" },
      h("div", {
        class: "drill-progress-fill",
        style: `animation-duration: ${dur}s`,
      }),
    ));
  }

  if (d.answered && d.timed_out) {
    root.appendChild(h("div", { class: "drill-timeout" }, `⏱ ${t("drill.timed_out")}`));
  }

  root.appendChild(renderQuizCard(q, "drill", {
    answered: d.answered,
    picked: d.picked,
    promptMode: store.settings.drill.prompt_mode,
    onPick: async (slug, isCorrect) => {
      if (d.answered) return;
      clearDrillTimer();
      d.answered = true;
      d.picked = slug;
      const ms = elapsedMs(d.shown_at);
      try { await recordAnswer(q.answer.slug, isCorrect, "drill", ms); }
      catch (e) { console.error(e); }
      render();
    },
    onNext: () => nextDrillQuestion(),
  }));
}

// ---------------------------------------------------------------------------
// Stats: weekly accuracy + by-group + by-category + response-time histogram.
// All bars are pure CSS (no chart library — keeps the no-bundler stack).
// ---------------------------------------------------------------------------

function statBar(percent, kind = "brand") {
  const w = Math.max(0, Math.min(100, percent));
  return h("div", { class: `stat-bar-track` },
    h("div", { class: `stat-bar-fill ${kind}`, style: `width:${w}%` }),
  );
}

function statRow(label, percent, score, barKind = "brand") {
  return h("div", { class: "stat-bar-row" },
    h("div", { class: "stat-bar-label" }, label),
    statBar(percent, barKind),
    h("div", { class: "stat-bar-value" },
      h("span", {}, t("stats.percent", { p: Math.round(percent) })),
      h("span", { class: "muted" }, score),
    ),
  );
}

function formatWeekStart(unixSec) {
  try {
    const d = new Date(unixSec * 1000);
    return d.toLocaleDateString(store.lang === "fr" ? "fr-FR" : "en-US", {
      month: "short",
      day: "numeric",
    });
  } catch (_) {
    return String(unixSec);
  }
}

async function renderStats() {
  const root = el("#view-stats");
  root.innerHTML = "";

  let report;
  try { report = await fetchAnalytics(); }
  catch (e) { console.error(e); }

  const totalAnswers = (report?.by_group ?? []).reduce((acc, g) => acc + g.total, 0);
  if (!report || totalAnswers === 0) {
    root.appendChild(h("div", { class: "card" },
      h("h2", {}, t("stats.title")),
      h("p", { class: "muted" }, t("stats.empty")),
    ));
    return;
  }

  // Weekly accuracy.
  const weeklyCard = h("div", { class: "card" }, h("h2", {}, t("stats.weekly")));
  if (report.weekly.length === 0) {
    weeklyCard.appendChild(h("p", { class: "muted" }, t("stats.empty")));
  } else {
    for (const w of report.weekly) {
      const pct = w.total ? (w.correct / w.total) * 100 : 0;
      const score = t("stats.score", { c: w.correct, t: w.total });
      weeklyCard.appendChild(statRow(
        t("stats.weekly_label", { d: formatWeekStart(w.week_start) }),
        pct,
        score,
        pct >= 80 ? "good" : pct >= 50 ? "brand" : "bad",
      ));
    }
  }
  root.appendChild(weeklyCard);

  // By group.
  const groupCard = h("div", { class: "card" }, h("h2", {}, t("stats.by_group")));
  for (const g of report.by_group) {
    const pct = g.total ? (g.correct / g.total) * 100 : 0;
    const label = `${g.group}. ${GROUP_NAMES[g.group] || ""}`;
    groupCard.appendChild(statRow(
      label,
      pct,
      t("stats.score", { c: g.correct, t: g.total }),
      pct >= 80 ? "good" : pct >= 50 ? "brand" : "bad",
    ));
  }
  root.appendChild(groupCard);

  // By category.
  const catCard = h("div", { class: "card" }, h("h2", {}, t("stats.by_category")));
  for (const c of report.by_category) {
    const pct = c.total ? (c.correct / c.total) * 100 : 0;
    catCard.appendChild(statRow(
      categoryTrans(c.category),
      pct,
      t("stats.score", { c: c.correct, t: c.total }),
      pct >= 80 ? "good" : pct >= 50 ? "brand" : "bad",
    ));
  }
  root.appendChild(catCard);

  // Response-time distribution.
  const respCard = h("div", { class: "card" }, h("h2", {}, t("stats.response_time")));
  if (!report.total_with_response_ms) {
    respCard.appendChild(h("p", { class: "muted" }, t("stats.no_response_data")));
  } else {
    const maxCount = report.response_buckets.reduce((m, b) => Math.max(m, b.count), 0);
    for (const b of report.response_buckets) {
      const pct = maxCount ? (b.count / maxCount) * 100 : 0;
      respCard.appendChild(statRow(
        b.label,
        pct,
        String(b.count),
        "gold",
      ));
    }
    if (report.avg_response_ms != null) {
      const avgS = (report.avg_response_ms / 1000).toFixed(1);
      respCard.appendChild(h("div", { class: "muted", style: "margin-top:8px; text-align:right" },
        t("stats.avg_response", { s: avgS })));
    }
  }
  root.appendChild(respCard);
}

async function renderBrowse() {
  const root = el("#view-browse");
  root.innerHTML = "";

  let allStats = [];
  try { allStats = await fetchAllStats(); } catch (_) {}
  const statBy = Object.fromEntries(allStats.map(s => [s.slug, s]));

  for (let g = 1; g <= 5; g++) {
    const card = h("div", { class: "card" },
      h("h2", {}, t("browse.group", { g, name: GROUP_NAMES[g] })),
      h("div", { class: "muted", style: "margin: -2px 0 8px; font-size: 11px" }, groupTrans(g)),
    );
    const list = h("div", { class: "tech-list" });

    for (const tech of store.techniques.filter(t => t.group === g)) {
      const s = statBy[tech.slug];
      const attempts = s ? s.attempts : 0;
      // Backend sends accuracy as a 0..1 float; pre-existing rows may still
      // come through if the DB pre-dates the new DTO, so guard with ?? 0.
      const accPct = attempts ? Math.round((s.accuracy ?? 0) * 100) : null;
      const status = attempts ? (s.status || "not_acquired") : "not_acquired";
      const thumb = makeImageEl(tech, tech.name);
      thumb.className = "tech-thumb";
      const counts = attempts
        ? `${s.correct_count}/${s.wrong_count}`
        : t("browse.seen", { n: 0 });
      const accStr = accPct !== null ? `  •  ${t("browse.accuracy", { p: accPct })}` : "";
      list.appendChild(h("div", {
        class: "tech-item",
        onclick: () => openVideoModal(tech),
      },
        thumb,
        h("div", { style: "flex:1; min-width:0" },
          h("div", { class: "name" },
            tech.name,
            h("span", { class: "name-kanji" }, tech.kanji),
          ),
          h("div", { class: "name-fr" }, localizedTranslation(tech)),
          h("div", { class: "meta" },
            `${tech.category} (${categoryTrans(tech.category)})  •  ${counts}${accStr}`),
        ),
        h("span", { class: `status-badge status-${status}` }, t(`browse.status.${status}`)),
      ));
    }

    card.appendChild(list);
    root.appendChild(card);
  }
}

async function renderSettings() {
  const root = el("#view-settings");
  root.innerHTML = "";

  const card = h("div", { class: "card" }, h("h2", {}, t("settings.title")));

  // Language picker (first so it's discoverable).
  const langSelect = h("select", {});
  for (const l of [["en", t("settings.lang_en")], ["fr", t("settings.lang_fr")]]) {
    const opt = h("option", { value: l[0] }, l[1]);
    if (l[0] === store.lang) opt.selected = true;
    langSelect.appendChild(opt);
  }
  langSelect.addEventListener("change", () => {
    store.lang = langSelect.value;
    saveLocalSettings();
    applyTabLabels();
    render();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.lang")),
    langSelect,
  ));

  // Interval picker.
  const intervalSelect = h("select", {});
  for (const i of VALID_INTERVALS) {
    const opt = h("option", { value: String(i.v) }, i[store.lang] || i.en);
    if (i.v === store.settings.interval) opt.selected = true;
    intervalSelect.appendChild(opt);
  }
  intervalSelect.addEventListener("change", async () => {
    const minutes = parseInt(intervalSelect.value, 10);
    try { await setInterval_(minutes); }
    catch (e) { console.error("setInterval failed", e); }
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.interval")),
    intervalSelect,
    h("div", { class: "muted", style: "margin-top:6px" }, t("settings.interval_help")),
  ));

  // Distractor mode.
  const distractorSelect = h("select", {});
  for (const m of [
    ["same-group",    t("settings.dist_group")],
    ["same-category", t("settings.dist_category")],
    ["any",           t("settings.dist_any")],
  ]) {
    const opt = h("option", { value: m[0] }, m[1]);
    if (m[0] === store.settings.distractor_mode) opt.selected = true;
    distractorSelect.appendChild(opt);
  }
  distractorSelect.addEventListener("change", () => {
    store.settings.distractor_mode = distractorSelect.value;
    saveLocalSettings();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.distractor")),
    distractorSelect,
  ));

  // Group filter.
  const groupSelect = h("select", {});
  groupSelect.appendChild(
    Object.assign(h("option", { value: "0" }, t("settings.group_all")),
      { selected: store.settings.group_filter === 0 }));
  for (let g = 1; g <= 5; g++) {
    const opt = h("option", { value: String(g) },
      t("settings.group_only", { g, name: GROUP_NAMES[g], tr: groupTrans(g) }));
    if (g === store.settings.group_filter) opt.selected = true;
    groupSelect.appendChild(opt);
  }
  groupSelect.addEventListener("change", () => {
    store.settings.group_filter = parseInt(groupSelect.value, 10);
    saveLocalSettings();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.group_filter")),
    groupSelect,
  ));

  // Quiz prompt mode (image vs kanji+romaji text).
  const promptSelect = h("select", {});
  for (const m of [
    ["image",     t("settings.prompt_image")],
    ["japanese",  t("settings.prompt_japanese")],
    ["kanji",     t("settings.prompt_kanji_only")],
    ["free_text", t("settings.prompt_free_text")],
  ]) {
    const opt = h("option", { value: m[0] }, m[1]);
    if (m[0] === store.settings.quiz_prompt_mode) opt.selected = true;
    promptSelect.appendChild(opt);
  }
  promptSelect.addEventListener("change", () => {
    store.settings.quiz_prompt_mode = promptSelect.value;
    saveLocalSettings();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.prompt_mode")),
    promptSelect,
    h("div", { class: "muted", style: "margin-top:6px" }, t("settings.prompt_help")),
  ));

  // Show kanji hint toggle.
  const kanjiSelect = h("select", {});
  for (const k of [["false", t("settings.hint_hide")], ["true", t("settings.hint_show")]]) {
    const opt = h("option", { value: k[0] }, k[1]);
    if ((k[0] === "true") === store.settings.show_kanji_hint) opt.selected = true;
    kanjiSelect.appendChild(opt);
  }
  kanjiSelect.addEventListener("change", () => {
    store.settings.show_kanji_hint = kanjiSelect.value === "true";
    saveLocalSettings();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.hint_mode")),
    kanjiSelect,
    h("div", { class: "muted", style: "margin-top:6px" }, t("settings.hint_help")),
  ));

  // Test prompt button.
  card.appendChild(h("div", { class: "field" },
    h("button", {
      class: "btn full",
      onclick: async () => {
        try { await invoke("trigger_quiz_now"); }
        catch (e) { console.error(e); }
      },
    }, t("settings.test")),
  ));

  root.appendChild(card);

  // Drill mode card (timer + prompt mode).
  const drillCard = h("div", { class: "card" }, h("h2", {}, t("settings.drill_section")));

  const drillDurSelect = h("select", {});
  for (const sec of [5, 10, 20]) {
    const opt = h("option", { value: String(sec) }, `${sec}s`);
    if (sec === store.settings.drill.duration_s) opt.selected = true;
    drillDurSelect.appendChild(opt);
  }
  drillDurSelect.addEventListener("change", () => {
    store.settings.drill.duration_s = parseInt(drillDurSelect.value, 10);
    saveLocalSettings();
  });
  drillCard.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.drill_duration")),
    drillDurSelect,
    h("div", { class: "muted", style: "margin-top:6px" }, t("settings.drill_duration_help")),
  ));

  const drillPromptSelect = h("select", {});
  for (const m of [
    ["image",  t("settings.drill_prompt_image")],
    ["kanji",  t("settings.drill_prompt_kanji")],
    ["romaji", t("settings.drill_prompt_romaji")],
    ["audio",  t("settings.drill_prompt_audio")],
  ]) {
    const opt = h("option", { value: m[0] }, m[1]);
    if (m[0] === store.settings.drill.prompt_mode) opt.selected = true;
    drillPromptSelect.appendChild(opt);
  }
  drillPromptSelect.addEventListener("change", () => {
    store.settings.drill.prompt_mode = drillPromptSelect.value;
    saveLocalSettings();
  });
  drillCard.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.drill_prompt")),
    drillPromptSelect,
  ));

  root.appendChild(drillCard);

  // Credits card.
  const credits = h("div", { class: "card" },
    h("h2", {}, t("settings.credits")),
    h("p", { class: "muted", style: "margin-bottom:8px; line-height:1.45" },
      t("settings.credits_videos")),
    h("div", { class: "btn-row", style: "margin-bottom:14px" },
      h("button", {
        class: "btn ghost small",
        onclick: () => openExternal("https://judo.how/"),
      }, t("settings.credits_open")),
    ),
    h("p", { class: "muted", style: "margin-bottom:8px; line-height:1.45" },
      t("settings.credits_images")),
    h("div", { class: "btn-row" },
      h("button", {
        class: "btn ghost small",
        onclick: () => openExternal("https://commons.wikimedia.org/wiki/File:Gokyo-no-waza.jpg"),
      }, t("settings.credits_open_wm")),
    ),
  );
  root.appendChild(credits);
}

// ---------------------------------------------------------------------------
// Quiz session lifecycle
// ---------------------------------------------------------------------------

async function startSingleQuiz() {
  navigate("quiz");
  store.quiz = {
    question: null,
    answered: false,
    picked: null,
    typed_answer: null,
    shown_at: 0,
  };
  render();
  try {
    store.quiz.question = await fetchNextQuestion();
    store.quiz.shown_at = Date.now();
  } catch (e) {
    console.error(e);
    store.quiz = null;
  }
  render();
}

async function startRapidFire() {
  navigate("rapid");
  store.rapid = {
    current: 0,
    total: RAPID_LENGTH,
    correct: 0,
    history: [],
    question: null,
    answered: false,
    picked: null,
    typed_answer: null,
    shown_at: 0,
  };
  render();
  try {
    store.rapid.question = await fetchNextQuestion();
    store.rapid.shown_at = Date.now();
  } catch (e) {
    console.error(e);
    store.rapid = null;
  }
  render();
}

// ---------------------------------------------------------------------------
// Master render + boot
// ---------------------------------------------------------------------------

function render() {
  switch (store.view) {
    case "home":     return renderHome();
    case "quiz":     return renderQuiz();
    case "rapid":    return renderRapid();
    case "drill":    return renderDrill();
    case "browse":   return renderBrowse();
    case "stats":    return renderStats();
    case "settings": return renderSettings();
  }
}

async function boot() {
  try {
    loadLocalSettings();
    applyTabLabels();

    els(".tab").forEach(btn => {
      btn.addEventListener("click", () => navigate(btn.dataset.view));
    });

    bindVideoModal();
  } catch (e) {
    console.error("boot: setup failed", e);
  }

  // Each fetch wrapped individually so a single failure (e.g. an Android
  // plugin not yet ready) doesn't block the whole boot. Rendering proceeds
  // with whatever data is available.
  try { await fetchTechniques(); } catch (e) { console.error("fetchTechniques", e); }
  try { await fetchInterval(); }   catch (e) { console.error("fetchInterval", e); }

  try {
    await listen("show_quiz_prompt", async (event) => {
      console.log("show_quiz_prompt", event.payload);
      if (store.rapid && store.rapid.current < store.rapid.total) return;
      startSingleQuiz();
    });
  } catch (e) {
    console.error("listen show_quiz_prompt failed", e);
  }

  navigate("home");
}

document.addEventListener("DOMContentLoaded", boot);
