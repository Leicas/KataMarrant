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
    "tab.browse":   "Browse",
    "tab.settings": "⚙",

    "home.today":         "Today",
    "home.questions":     "Questions answered",
    "home.accuracy":      "All-time accuracy",
    "home.total":         "Total answered",
    "home.prompt":        "Quiz prompt",
    "home.practice":      "Practice",
    "home.single":        "Single quiz",
    "home.rapid":         "Rapid-fire ({n})",
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

    "browse.group":       "Group {g} — {name}",
    "browse.seen":        "seen {n}×",

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
    "tab.browse":   "Liste",
    "tab.settings": "⚙",

    "home.today":         "Aujourd'hui",
    "home.questions":     "Questions répondues",
    "home.accuracy":      "Précision globale",
    "home.total":         "Total répondu",
    "home.prompt":        "Rappel quiz",
    "home.practice":      "Entraînement",
    "home.single":        "Une question",
    "home.rapid":         "Rafale ({n})",
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

    "browse.group":       "Groupe {g} — {name}",
    "browse.seen":        "vue {n}×",

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
  },
  quiz: null,
  rapid: null,
};

const STORE_KEYS = {
  lang:           "kata.lang",
  distractor:     "kata.distractor_mode",
  groupFilter:    "kata.group_filter",
  showKanjiHint:  "kata.show_kanji_hint",
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
  } catch (_) {}
}

function saveLocalSettings() {
  try {
    localStorage.setItem(STORE_KEYS.lang, store.lang);
    localStorage.setItem(STORE_KEYS.distractor, store.settings.distractor_mode);
    localStorage.setItem(STORE_KEYS.groupFilter, String(store.settings.group_filter));
    localStorage.setItem(STORE_KEYS.showKanjiHint, String(store.settings.show_kanji_hint));
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

async function fetchNextQuestion() {
  return invoke("next_question", {
    distractorMode: store.settings.distractor_mode,
    groupFilter: store.settings.group_filter || null,
  });
}

async function recordAnswer(slug, correct, mode) {
  return invoke("answer_question", { slug, correct, mode });
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
      h("button", { class: "btn ghost full", onclick: () => navigate("browse") },
        t("home.browse")),
    ),
  ));
}

function renderQuizCard(q, mode, opts = {}) {
  const { answered = false, picked = null, onPick, onNext, footer } = opts;

  const showKanjiHint = store.settings.show_kanji_hint;
  const tech = q.answer;

  // -- Image (always present, cascade-resolved) ----------------------------
  const imageWrap = h("div", { class: "quiz-image-wrap" + (answered ? " compact" : "") });
  imageWrap.appendChild(makeImageEl(tech, "technique"));
  if (showKanjiHint && !answered) {
    imageWrap.appendChild(h("div", { class: "hint-kanji" }, tech.kanji));
  }

  // -- Choice buttons ------------------------------------------------------
  const choicesEl = h("div", { class: "choices" });
  for (const c of q.choices) {
    const isCorrect = c.slug === tech.slug;
    const isPicked = c.slug === picked;
    let cls = "choice";
    if (answered) {
      if (isCorrect) cls += " correct";
      else if (isPicked) cls += " wrong";
    }
    const btn = h("button", {
      class: cls,
      disabled: answered,
      onclick: () => onPick && onPick(c.slug, isCorrect),
    }, c.name);
    choicesEl.appendChild(btn);
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
    imageWrap,
    choicesEl,
  );

  // -- Reveal panel after answer ------------------------------------------
  if (answered) {
    const correct = picked === tech.slug;
    const reveal = h("div", { class: `reveal ${correct ? "good" : "bad"}` },
      h("div", { class: "reveal-status" },
        correct ? `✓ ${t("quiz.correct")}` : `✗ ${t("quiz.wrong")}`),
      h("div", { class: "reveal-name" }, tech.name),
      h("div", { class: "reveal-kanji" }, tech.kanji),
      h("div", { class: "reveal-fr" }, localizedTranslation(tech)),
      h("div", { class: "reveal-meta" },
        groupBadge(tech.group, "gold"),
        categoryBadge(tech.category),
      ),
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
    onPick: async (slug, isCorrect) => {
      store.quiz.answered = true;
      store.quiz.picked = slug;
      try { await recordAnswer(q.answer.slug, isCorrect, "single"); }
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
    onPick: async (slug, isCorrect) => {
      r.answered = true;
      r.picked = slug;
      r.history.push({ slug: q.answer.slug, correct: isCorrect });
      if (isCorrect) r.correct++;
      try { await recordAnswer(q.answer.slug, isCorrect, "rapid"); }
      catch (e) { console.error(e); }
      render();
    },
    onNext: async () => {
      r.current++;
      r.answered = false;
      r.picked = null;
      r.question = null;
      if (r.current < r.total) {
        try { r.question = await fetchNextQuestion(); }
        catch (e) { console.error(e); }
      }
      render();
    },
  }));
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
      const total = s ? (s.correct_count + s.wrong_count) : 0;
      const acc = total ? Math.round((s.correct_count / total) * 100) : null;
      const accStr = acc !== null ? `  •  ${acc}%` : "";
      const thumb = makeImageEl(tech, tech.name);
      thumb.className = "tech-thumb";
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
            `${tech.category} (${categoryTrans(tech.category)})  •  ${t("browse.seen", { n: total })}${accStr}`),
        ),
        h("span", { class: "muted" }, "▶"),
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
  store.quiz = { question: null, answered: false, picked: null };
  render();
  try {
    store.quiz.question = await fetchNextQuestion();
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
  };
  render();
  try {
    store.rapid.question = await fetchNextQuestion();
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
    case "browse":   return renderBrowse();
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
