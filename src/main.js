// KataMarrant — vanilla JS app.
//
// Tauri 2: __TAURI__.core.invoke / event.listen / opener.openUrl

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const opener = window.__TAURI__.opener;

const RAPID_LENGTH = 10;

// Default schedule mirrors the backend default — Daily 19:00, every day.
// Used as a fallback when the backend hasn't returned yet.
//
// The `weekdays` field is a 7-bit mask (bit0=Mon … bit6=Sun) — the Rust
// side uses a tuple-newtype `WeekdayMask(u8)` which serde serializes as
// just the integer.
const DEFAULT_SCHEDULE = {
  kind: "daily",
  time: { hour: 19, minute: 0 },
  weekdays: 0x7f,
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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
    "nav.home":     "Home",
    "nav.quiz":     "Quiz",
    "nav.rapid":    "Rapid",
    "nav.drill":    "Drill",
    "nav.browse":   "Browse",
    "nav.stats":    "Stats",
    "nav.settings": "Settings",

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
    "settings.schedule":      "Quiz reminder",
    "settings.schedule.disabled": "Off",
    "settings.schedule.daily":    "Daily at fixed time",
    "settings.schedule.twice":    "Twice daily",
    "settings.schedule.smart":    "Smart (only if I haven't done enough)",
    "settings.schedule.every":    "Every N minutes",
    "settings.schedule.time":     "Time",
    "settings.schedule.time_a":   "First time",
    "settings.schedule.time_b":   "Second time",
    "settings.schedule.weekdays": "Days of week",
    "settings.schedule.min_count": "Skip if I've already done…",
    "settings.schedule.minutes":  "Every (minutes)",
    "settings.schedule.quiet_hours": "Quiet hours",
    "settings.schedule.quiet_start": "Quiet start",
    "settings.schedule.quiet_end":   "Quiet end",
    "settings.schedule.quiet_off":   "No quiet hours",
    "settings.schedule.weekday.mon": "Mon",
    "settings.schedule.weekday.tue": "Tue",
    "settings.schedule.weekday.wed": "Wed",
    "settings.schedule.weekday.thu": "Thu",
    "settings.schedule.weekday.fri": "Fri",
    "settings.schedule.weekday.sat": "Sat",
    "settings.schedule.weekday.sun": "Sun",
    "settings.schedule.summary.disabled": "Off",
    "settings.schedule.summary.daily":    "Daily at {t}",
    "settings.schedule.summary.twice":    "Twice daily {a} / {b}",
    "settings.schedule.summary.smart":    "At {t} if fewer than {n} done",
    "settings.schedule.summary.every":    "Every {n} min",
    "settings.schedule.help": "Schedules a notification (Android/iOS) or in-app prompt (desktop).",
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

    "profile.title":         "Your dōjō progress",
    "profile.level":         "Level {n}",
    "profile.xp":            "{cur} / {next} XP",
    "profile.streak":        "Streak",
    "profile.streak_days":   "{n} days",
    "profile.longest":       "Best: {n}",
    "profile.daily_goal":    "Daily goal",
    "profile.goal_progress": "{cur} / {goal}",
    "profile.combo":         "Best combo: {n}",
    "profile.mastery":       "Mastery by group",
    "profile.achievements":  "Achievements",
    "profile.unlocked":      "{n} / {total} unlocked",
    "profile.locked":        "Locked",
    "profile.unlocked_at":   "Unlocked {d}",
    "settings.daily_goal":   "Daily goal (questions/day)",
    "settings.daily_goal_help": "Hit this many questions in one day to earn the +25 XP bonus.",

    "settings.sync.title":        "Cross-device sync",
    "settings.sync.help":         "Optional: sign in to sync your stats and progress between devices. The app keeps working fully offline if the server can't be reached.",
    "settings.sync.signin_cta":   "Sign in to sync",
    "settings.sync.email_label":  "Email",
    "settings.sync.send_magic":   "Send magic link",
    "settings.sync.magic_sent":   "Check your email and click the link to sign in.",
    "settings.sync.fallback_code_help": "If the link doesn't work, copy the code from your email and paste it here:",
    "settings.sync.waiting":      "Waiting for you to click the link in your email…",
    "settings.sync.token_label":  "Code from email",
    "settings.sync.verify":       "Verify",
    "settings.sync.cancel":       "Cancel",
    "settings.sync.signed_in_as": "Signed in as {email}",
    "settings.sync.last_synced":  "Last synced: {when}",
    "settings.sync.never_synced": "never",
    "settings.sync.sync_now":     "Sync now",
    "settings.sync.signout":      "Sign out",
    "settings.sync.force_resync": "Force full resync",
    "settings.sync.force_resync_confirm": "This will mark every local stat as new and pull everything from the server. Continue?",
    "settings.sync.force_resync_done":    "Full resync complete.",
    "settings.sync.auto_sync":    "Auto-sync changes in the background",
    "settings.sync.error.network":       "Server unreachable — your data stays local.",
    "settings.sync.error.invalid_token": "Code invalid or expired — try sending a new link.",
    "settings.sync.error.expired":       "Sign-in expired — please try again.",
    "settings.sync.error.unreachable":   "Server unreachable.",
    "settings.sync.status.ok":           "All synced.",
    "settings.sync.status.pending":      "Pending changes — will push automatically.",
    "settings.sync.relative.justnow":    "just now",
    "settings.sync.relative.minutes":    "{n} min ago",
    "settings.sync.relative.hours":      "{n} h ago",
    "settings.sync.relative.days":       "{n} d ago",

    "toast.xp":              "+{n} XP",
    "toast.combo":           "🔥 ×{n}",
    "toast.streak":          "🔥 {n}-day streak",
    "toast.level_up":        "Level up! → {n}",
    "toast.goal_met":        "Daily goal hit!",
    "toast.achievement":     "Achievement unlocked",
    "updater.pill.available":    "Update available",
    "updater.pill.downloading":  "Downloading… {p}%",
    "updater.pill.ready":        "Restart to install",
    "updater.modal.title":       "Update available",
    "updater.modal.version":     "Version {from} → {to}",
    "updater.modal.install":     "Install & restart",
    "updater.modal.later":       "Later",
    "updater.modal.downloading": "Downloading… {p}%",
    "updater.modal.installing":  "Installing — the app will restart shortly.",
    "updater.modal.no_notes":    "No release notes available.",
    "updater.error":             "Update error: {msg}",
    "updater.section.title":     "App updates",
    "updater.section.mobile_help": "Updates on this platform ship through your app store. KataMarrant cannot self-update on Android or iOS.",
    "updater.auto_label":        "Auto-check for updates",
    "updater.auto_on":           "On (recommended)",
    "updater.auto_off":          "Off",
    "updater.auto_help":         "Checks GitHub for a new release ~3 seconds after launch. We never auto-install — you always confirm.",
    "updater.check_now":         "Check for updates now",
    "updater.status.idle":              "",
    "updater.status.checking":          "Checking…",
    "updater.status.up_to_date":        "You're on the latest version.",
    "updater.status.available":         "Update {v} available.",
    "updater.status.downloading":       "Downloading…",
    "updater.status.ready":             "Ready — click the pill to restart.",
    "updater.status.installing":        "Installing…",
    "updater.whats_new.title":          "What's new in v{v}",
    "updater.changelog.button":         "View full changelog",
    "updater.changelog.title":          "Changelog",
    "updater.changelog.loading":        "Loading…",
    "updater.changelog.empty":          "No changelog available.",
    "diag.title":                       "Diagnostic — answers logged",
    "diag.loading":                     "Loading…",
    "diag.total":                       "{n} total entries in your local quiz log.",
    "diag.range":                       "(from {from} to {to})",
    "diag.mode_single":                 "Single-question quizzes",
    "diag.mode_rapid":                  "Rapid bursts (10 per round)",
    "diag.mode_drill":                  "Drill (timed)",
    "diag.note":                        "The local count includes every individual answer across single, rapid, and drill modes — so 50 rapid rounds = 500 entries, not 50. The server's leaderboard only reflects the synced subset.",
  },
  fr: {
    "tab.home":     "Accueil",
    "tab.quiz":     "Quiz",
    "tab.rapid":    "Rafale",
    "tab.drill":    "Drill",
    "tab.browse":   "Liste",
    "tab.stats":    "Stats",
    "tab.settings": "⚙",
    "nav.home":     "Accueil",
    "nav.quiz":     "Quiz",
    "nav.rapid":    "Rafale",
    "nav.drill":    "Drill",
    "nav.browse":   "Liste",
    "nav.stats":    "Stats",
    "nav.settings": "Réglages",

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
    "settings.schedule":      "Rappel quiz",
    "settings.schedule.disabled": "Désactivé",
    "settings.schedule.daily":    "Quotidien à heure fixe",
    "settings.schedule.twice":    "Deux fois par jour",
    "settings.schedule.smart":    "Smart (seulement si pas assez fait)",
    "settings.schedule.every":    "Toutes les N minutes",
    "settings.schedule.time":     "Heure",
    "settings.schedule.time_a":   "Première heure",
    "settings.schedule.time_b":   "Deuxième heure",
    "settings.schedule.weekdays": "Jours de la semaine",
    "settings.schedule.min_count": "Ignorer si déjà fait…",
    "settings.schedule.minutes":  "Toutes les (minutes)",
    "settings.schedule.quiet_hours": "Heures silencieuses",
    "settings.schedule.quiet_start": "Début du silence",
    "settings.schedule.quiet_end":   "Fin du silence",
    "settings.schedule.quiet_off":   "Pas d'heures silencieuses",
    "settings.schedule.weekday.mon": "Lun",
    "settings.schedule.weekday.tue": "Mar",
    "settings.schedule.weekday.wed": "Mer",
    "settings.schedule.weekday.thu": "Jeu",
    "settings.schedule.weekday.fri": "Ven",
    "settings.schedule.weekday.sat": "Sam",
    "settings.schedule.weekday.sun": "Dim",
    "settings.schedule.summary.disabled": "Désactivé",
    "settings.schedule.summary.daily":    "Tous les jours à {t}",
    "settings.schedule.summary.twice":    "Deux fois par jour {a} / {b}",
    "settings.schedule.summary.smart":    "À {t} si moins de {n} fait",
    "settings.schedule.summary.every":    "Toutes les {n} min",
    "settings.schedule.help": "Déclenche une notification (Android/iOS) ou un prompt (desktop).",
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

    "profile.title":         "Ta progression au dōjō",
    "profile.level":         "Niveau {n}",
    "profile.xp":            "{cur} / {next} XP",
    "profile.streak":        "Série",
    "profile.streak_days":   "{n} jours",
    "profile.longest":       "Record : {n}",
    "profile.daily_goal":    "Objectif quotidien",
    "profile.goal_progress": "{cur} / {goal}",
    "profile.combo":         "Meilleur combo : {n}",
    "profile.mastery":       "Maîtrise par groupe",
    "profile.achievements":  "Succès",
    "profile.unlocked":      "{n} / {total} débloqués",
    "profile.locked":        "Verrouillé",
    "profile.unlocked_at":   "Débloqué le {d}",
    "settings.daily_goal":   "Objectif quotidien (questions/jour)",
    "settings.daily_goal_help": "Atteins ce nombre dans la journée pour gagner les +25 XP bonus.",

    "settings.sync.title":        "Synchro multi-appareils",
    "settings.sync.help":         "Optionnel : connecte-toi pour synchroniser tes stats entre appareils. L'app reste 100 % utilisable hors ligne.",
    "settings.sync.signin_cta":   "Se connecter pour synchroniser",
    "settings.sync.email_label":  "Email",
    "settings.sync.send_magic":   "Envoyer le lien magique",
    "settings.sync.magic_sent":   "Vérifie ta boîte mail et clique sur le lien pour te connecter.",
    "settings.sync.fallback_code_help": "Si le lien ne fonctionne pas, copie le code depuis ton email et colle-le ici :",
    "settings.sync.waiting":      "En attente du clic sur le lien reçu par email…",
    "settings.sync.token_label":  "Code reçu par email",
    "settings.sync.verify":       "Valider",
    "settings.sync.cancel":       "Annuler",
    "settings.sync.signed_in_as": "Connecté en tant que {email}",
    "settings.sync.last_synced":  "Dernière synchro : {when}",
    "settings.sync.never_synced": "jamais",
    "settings.sync.sync_now":     "Synchroniser",
    "settings.sync.signout":      "Se déconnecter",
    "settings.sync.force_resync": "Resynchro complète",
    "settings.sync.force_resync_confirm": "Toutes les stats locales seront marquées comme nouvelles et tout sera récupéré depuis le serveur. Continuer ?",
    "settings.sync.force_resync_done":    "Resynchro complète terminée.",
    "settings.sync.auto_sync":    "Synchronisation automatique en arrière-plan",
    "settings.sync.error.network":       "Serveur injoignable — tes données restent locales.",
    "settings.sync.error.invalid_token": "Code invalide ou expiré — redemande un nouveau lien.",
    "settings.sync.error.expired":       "Connexion expirée — réessaie.",
    "settings.sync.error.unreachable":   "Serveur injoignable.",
    "settings.sync.status.ok":           "Tout est synchronisé.",
    "settings.sync.status.pending":      "Changements en attente — pousse automatiquement.",
    "settings.sync.relative.justnow":    "à l'instant",
    "settings.sync.relative.minutes":    "il y a {n} min",
    "settings.sync.relative.hours":      "il y a {n} h",
    "settings.sync.relative.days":       "il y a {n} j",

    "toast.xp":              "+{n} XP",
    "toast.combo":           "🔥 ×{n}",
    "toast.streak":          "🔥 {n} jours d'affilée",
    "toast.level_up":        "Niveau supérieur ! → {n}",
    "toast.goal_met":        "Objectif atteint !",
    "toast.achievement":     "Succès débloqué",
    "updater.pill.available":    "Mise à jour disponible",
    "updater.pill.downloading":  "Téléchargement… {p}%",
    "updater.pill.ready":        "Redémarrer pour installer",
    "updater.modal.title":       "Mise à jour disponible",
    "updater.modal.version":     "Version {from} → {to}",
    "updater.modal.install":     "Installer et redémarrer",
    "updater.modal.later":       "Plus tard",
    "updater.modal.downloading": "Téléchargement… {p}%",
    "updater.modal.installing":  "Installation — l'app va redémarrer.",
    "updater.modal.no_notes":    "Aucune note de version disponible.",
    "updater.error":             "Erreur mise à jour : {msg}",
    "updater.section.title":     "Mises à jour",
    "updater.section.mobile_help": "Sur cette plateforme les mises à jour passent par le store. KataMarrant ne peut pas se mettre à jour seul sur Android ou iOS.",
    "updater.auto_label":        "Vérifier auto. les mises à jour",
    "updater.auto_on":           "Activé (recommandé)",
    "updater.auto_off":          "Désactivé",
    "updater.auto_help":         "Vérifie GitHub ~3 s après le lancement. Pas d'install automatique — vous confirmez toujours.",
    "updater.check_now":         "Vérifier maintenant",
    "updater.status.idle":              "",
    "updater.status.checking":          "Vérification…",
    "updater.status.up_to_date":        "Vous êtes à jour.",
    "updater.status.available":         "Mise à jour {v} disponible.",
    "updater.status.downloading":       "Téléchargement…",
    "updater.status.ready":             "Prêt — cliquez la pastille pour redémarrer.",
    "updater.status.installing":        "Installation…",
    "updater.whats_new.title":          "Nouveautés en v{v}",
    "updater.changelog.button":         "Voir le changelog complet",
    "updater.changelog.title":          "Journal des modifications",
    "updater.changelog.loading":        "Chargement…",
    "updater.changelog.empty":          "Aucun changelog disponible.",
    "diag.title":                       "Diagnostic — réponses enregistrées",
    "diag.loading":                     "Chargement…",
    "diag.total":                       "{n} entrées dans le journal local.",
    "diag.range":                       "(du {from} au {to})",
    "diag.mode_single":                 "Quiz simples",
    "diag.mode_rapid":                  "Rafales (10 par tour)",
    "diag.mode_drill":                  "Drill (chrono)",
    "diag.note":                        "Le compteur local inclut chaque réponse individuelle, donc 50 rafales = 500 entrées, pas 50. Le classement serveur ne reflète que ce qui a été synchronisé.",
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
    // Schedule mirrors the backend `ScheduleConfig` (serde tag = "kind").
    // Initialized from the backend on boot via fetchSchedule().
    schedule: { ...DEFAULT_SCHEDULE },
    distractor_mode: "same-group",
    group_filter: 0,
    show_kanji_hint: false,   // image-first quiz; kanji always revealed after answer
    quiz_prompt_mode: "image", // "image" | "japanese" (kanji+romaji card, FR choices)
    drill: {
      duration_s: 10,
      // Audio is the canary default — the most pedagogically valuable
      // drill for Japanese pronunciation. loadLocalSettings preserves any
      // saved value in ["image","kanji","romaji","audio"] so existing
      // users keep their preference.
      prompt_mode: "audio",
    },
  },
  quiz: null,
  rapid: null,
  drill: null,
  // Gamification snapshot (level, xp, streak, daily_goal, today). Refreshed
  // from the backend on boot and after each answer via the augmented
  // answer_question response. Used to seed UI defaults (daily-goal stepper,
  // profile card before the live fetch resolves).
  gamification: null,
  // Auto-updater state (desktop only — supported is false on Android/iOS).
  // The full state machine + UI live in the "Auto-updater" section near the
  // bottom of this file. detectUpdaterPlatform() is called on boot.
  updater: {
    platform: null,
    supported: false,
    state: "idle",
    available_update: null,
    progress: { downloaded: 0, total: 0 },
    error_msg: null,
    auto_check: true,
    last_applied: null,
  },
};

const STORE_KEYS = {
  lang:           "kata.lang",
  distractor:     "kata.distractor_mode",
  groupFilter:    "kata.group_filter",
  showKanjiHint:  "kata.show_kanji_hint",
  quizPromptMode: "kata.quiz_prompt_mode",
  drillDuration:  "kata.drill_duration_s",
  drillPromptMode:"kata.drill_prompt_mode",
  updaterAutoCheck:    "kata.updater_auto_check",
  updaterLastNotes:    "kata.updater_last_notes",
  updaterLastDismiss:  "kata.updater_last_dismiss",
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const el = (sel, root = document) => root.querySelector(sel);
const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Parse a "k1: v1; k2: v2" CSS-string into an object. Used to keep
// inline-style call sites readable while applying styles via the DOM API
// (so no `style="…"` attribute is emitted — the CSP omits 'unsafe-inline'
// for style-src, and we don't want runtime violations).
function parseStyleString(s) {
  const out = {};
  if (!s) return out;
  for (const decl of String(s).split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const k = decl.slice(0, colon).trim();
    const v = decl.slice(colon + 1).trim();
    if (!k) continue;
    // node.style uses camelCase property names (e.g. "fontSize"). Convert
    // kebab-case CSS keys; if the key is already camelCase or a custom
    // property (--var) it round-trips unchanged.
    let prop = k;
    if (k.startsWith("--")) {
      // Custom properties — set via setProperty later by returning a
      // sentinel. Keep flat object for simplicity: keys starting with "--"
      // are detected by the caller.
      out[k] = v;
    } else {
      prop = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[prop] = v;
    }
  }
  return out;
}

function applyStyle(node, value) {
  const obj = typeof value === "string" ? parseStyleString(value) : value || {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (k.startsWith("--")) {
      node.style.setProperty(k, v);
    } else {
      // Direct assignment — node.style[prop] = v.
      node.style[k] = v;
    }
  }
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "style") applyStyle(node, v);
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
  // Invalidate cached sync status when entering settings, so the next
  // buildSyncSection() pulls fresh state. Within a settings session the
  // status_loaded flag prevents the per-keystroke fetch loop.
  if (view === "settings" && store.sync) {
    store.sync.ui.status_loaded = false;
  }
  // Cancel the magic-link poll when leaving settings — without this it
  // would keep ticking in the background and could surface a "signed in"
  // toast on a screen the user isn't looking at.
  if (store.view === "settings" && view !== "settings") {
    if (typeof stopSyncPoll === "function") stopSyncPoll();
  }
  store.view = view;
  // Desktop sidebar nav (.navitem) and mobile bottom-tab-bar (.tab) both
  // carry data-view; toggle .active on every match in either set.
  els(".tab, .navitem").forEach(t => t.classList.toggle("active", t.dataset.view === view));
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
// Audio for the drill mode.
// We *only* play pre-rendered MP3 clips from `src/assets/audio/<slug>.mp3`.
// The Web Speech API path was removed because system TTS quality varies
// wildly (Windows SAPI "Haruka Desktop" / Android default engines often
// spell out romaji or use a robotic voice), and the live fallback to romaji
// produced the bad pronunciations the user reported. The clips are
// generated up-front by `scripts/generate_audio.py`, which can use OpenAI
// gpt-4o-mini-tts (premium), Microsoft Edge Neural (free, default), or
// gTTS (last-resort fallback). Same clip plays everywhere — desktop and
// Android — so what you hear in dev is what users hear on a phone.
// ---------------------------------------------------------------------------

let _lastSpokenSlug = null;

// Cache of clip availability per slug — populated lazily on first play
// attempt. Avoids hammering the WebView with 404-equivalent loads when
// clips haven't been generated yet.
const _clipKnown = new Map(); // slug → "ok" | "missing"
let _audioEl = null;

function clipUrl(tech) {
  return `assets/audio/${tech.slug}.mp3`;
}

function clipStatusSummary(tech) {
  return { known: _clipKnown.get(tech.slug) || null };
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
    console.warn("[audio] clip missing:", url);
    _audioEl.removeEventListener("error", onError);
    if (typeof render === "function" && store.view === "drill"
        && store.settings.drill.prompt_mode === "audio") {
      render();
    }
  };
  const onLoaded = () => {
    _clipKnown.set(tech.slug, "ok");
    _audioEl.removeEventListener("loadeddata", onLoaded);
  };
  _audioEl.addEventListener("error", onError);
  _audioEl.addEventListener("loadeddata", onLoaded);
  const p = _audioEl.play();
  if (p && typeof p.catch === "function") {
    p.catch((e) => console.warn("[audio] play() rejected:", e?.message || e));
  }
  return true;
}

function speakTechnique(tech) {
  return playAudioClip(tech);
}

function maybeAutoSpeak(tech) {
  if (_lastSpokenSlug === tech.slug) return;
  _lastSpokenSlug = tech.slug;
  // Defer slightly so the WebView paints the prompt before play() fires.
  // On Android WebView the first audio element may be silently blocked
  // until a user gesture happens; the manual replay button covers that.
  setTimeout(() => speakTechnique(tech), 120);
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
  // Mobile tab buttons hold a single text label.
  for (const btn of els(".tab")) {
    btn.textContent = t(`tab.${btn.dataset.view}`);
  }
  // Desktop sidebar items have an icon + label structure; only the .lbl
  // span gets retranslated so the icon character stays put. Use the nav.*
  // namespace (not tab.*) so the settings sidebar entry shows "Settings"
  // / "Réglages" and not the cog glyph (which is already in .ico).
  const dict = I18N[store.lang] || I18N.en;
  for (const btn of els(".navitem")) {
    const lbl = btn.querySelector(".lbl");
    if (!lbl) continue;
    const v = btn.dataset.view;
    const navKey = `nav.${v}`;
    lbl.textContent = (dict[navKey] || I18N.en[navKey]) || t(`tab.${v}`);
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

function fmtTime(t) {
  if (!t) return "??:??";
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Human label for the current schedule, used in the Home card and
// settings UI.
function scheduleSummary(cfg) {
  if (!cfg) return t("settings.schedule.summary.disabled");
  switch (cfg.kind) {
    case "disabled":
      return t("settings.schedule.summary.disabled");
    case "daily":
      return t("settings.schedule.summary.daily", { t: fmtTime(cfg.time) });
    case "twice_daily":
      return t("settings.schedule.summary.twice", {
        a: fmtTime(cfg.time_a), b: fmtTime(cfg.time_b) });
    case "daily_min_count":
      return t("settings.schedule.summary.smart", {
        t: fmtTime(cfg.time), n: cfg.min_count });
    case "every_minutes":
      return t("settings.schedule.summary.every", { n: cfg.minutes });
    default:
      return cfg.kind;
  }
}

// ---------------------------------------------------------------------------
// Backend wrappers
// ---------------------------------------------------------------------------

async function fetchSchedule() {
  try {
    const cfg = await invoke("get_quiz_schedule");
    if (cfg && cfg.kind) store.settings.schedule = cfg;
  } catch (e) { console.error(e); }
}

async function setSchedule(config) {
  await invoke("set_quiz_schedule", { config });
  store.settings.schedule = config;
  try { queueSyncFlush(); } catch (_) {}
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
  const outcome = await invoke("answer_question", {
    slug, correct, mode, responseMs: responseMs ?? null,
  });
  if (outcome) handleGamificationOutcome(outcome);
  // Sync glue: every answered question marks pending changes server-side.
  // Schedule a debounced push so a flurry of answers collapses to one
  // network call. The function itself silently noops if the user is logged
  // out or auto-sync is off.
  try { queueSyncFlush(); } catch (_) {}
  return outcome;
}

async function fetchGamificationState() {
  try { return await invoke("get_gamification_state"); }
  catch (e) { console.error("get_gamification_state", e); return null; }
}

async function fetchAchievements() {
  try { return await invoke("list_achievements"); }
  catch (e) { console.error("list_achievements", e); return []; }
}

async function setDailyGoal(goal) {
  try { await invoke("set_daily_goal", { goal }); }
  catch (e) { console.error("set_daily_goal", e); }
  try { queueSyncFlush(); } catch (_) {}
}

async function completeRapid(correctCount, total) {
  try {
    const newly = await invoke("complete_rapid", { correctCount, total });
    if (Array.isArray(newly)) {
      for (const a of newly) showAchievementOverlay(a);
    }
  } catch (e) { console.error("complete_rapid", e); }
}

async function completeDrillRun(consecutiveCorrect, promptMode) {
  try {
    const newly = await invoke("complete_drill_run", {
      consecutiveCorrect, promptMode,
    });
    if (Array.isArray(newly)) {
      for (const a of newly) showAchievementOverlay(a);
    }
  } catch (e) { console.error("complete_drill_run", e); }
}

// ---------------------------------------------------------------------------
// Toast / micro-feedback layer for gamification events.
// ---------------------------------------------------------------------------

function ensureToastLayer() {
  let layer = el("#micro-feedback");
  if (layer) return layer;
  layer = h("div", { id: "micro-feedback", class: "micro-feedback" });
  document.body.appendChild(layer);
  return layer;
}

function showToast(text, kind = "xp", durationMs = 1200) {
  const layer = ensureToastLayer();
  const pill = h("div", { class: `mf-pill mf-${kind}` }, text);
  layer.appendChild(pill);
  setTimeout(() => {
    pill.classList.add("mf-out");
    setTimeout(() => { try { pill.remove(); } catch (_) {} }, 250);
  }, durationMs);
}

function showAchievementOverlay(ach) {
  if (!ach) return;
  const name = store.lang === "fr" ? ach.name_fr : ach.name_en;
  const desc = store.lang === "fr" ? ach.description_fr : ach.description_en;
  const layer = ensureToastLayer();
  const card = h("div", { class: "mf-achievement" },
    h("div", { class: "mf-ach-tag" }, t("toast.achievement")),
    h("div", { class: "mf-ach-name" }, name),
    h("div", { class: "mf-ach-desc" }, desc || ""),
  );
  card.addEventListener("click", () => {
    card.classList.add("mf-out");
    setTimeout(() => { try { card.remove(); } catch (_) {} }, 250);
  });
  layer.appendChild(card);
  setTimeout(() => {
    card.classList.add("mf-out");
    setTimeout(() => { try { card.remove(); } catch (_) {} }, 250);
  }, 3000);
}

// Process the augmented `answer_question` response and dispatch the right
// micro-feedback. Called once per recorded answer.
function handleGamificationOutcome(o) {
  if (!o) return;
  if (o.xp_gained > 0) {
    showToast(t("toast.xp", { n: o.xp_gained }), "xp", 1000);
  }
  if (o.current_combo >= 2) {
    showToast(t("toast.combo", { n: o.current_combo }), "combo", 1200);
  }
  if (o.streak_changed && o.current_streak > 1) {
    showToast(t("toast.streak", { n: o.current_streak }), "streak", 1500);
  }
  if (o.level_up) {
    showToast(t("toast.level_up", { n: o.level }), "level", 1800);
  }
  if (o.today && o.today.goal_met && o.today.questions === o.today.goal) {
    // Fire only the first time we cross the threshold (questions == goal).
    showToast(t("toast.goal_met"), "goal", 1800);
  }
  if (Array.isArray(o.unlocked)) {
    for (const a of o.unlocked) showAchievementOverlay(a);
  }
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

// ---------------------------------------------------------------------------
// Profile hero card — XP / level, streak, daily goal, mastery, achievements.
// Rendered into a slot inside renderHome so it appears at the top of the home
// page without a tab of its own.
// ---------------------------------------------------------------------------

// renderProfile renders the home hero + home 2-col grid into two distinct
// slots so renderHome can interleave the action-button row and today-strip
// between them. Pass `gridSlot` to keep the legacy "everything appended
// in one slot" behavior (the second arg defaults to slot itself).
async function renderProfile(slot, gridSlot) {
  if (!slot) return;
  slot.innerHTML = "";
  if (gridSlot && gridSlot !== slot) gridSlot.innerHTML = "";
  const heroParent = slot;
  const gridParent = gridSlot || slot;

  const [g, achievements, allTech] = await Promise.all([
    fetchGamificationState(),
    fetchAchievements(),
    fetchAllStats().catch(() => []),
  ]);
  if (!g) return;

  // ----- Compact hero strip (level + XP + streak + goal in one row) -----
  const hero = h("div", { class: "card profile-hero" });
  const xpInLevel = g.xp_total - g.xp_for_current_level;
  const xpSpan = Math.max(1, g.xp_for_next_level - g.xp_for_current_level);
  const xpPct = Math.max(0, Math.min(100, (xpInLevel / xpSpan) * 100));
  const goal = Math.max(1, g.daily_goal);
  const today = g.today || { questions: 0, correct: 0, goal_met: false };
  const goalPct = Math.max(0, Math.min(100, (today.questions / goal) * 100));

  hero.appendChild(h("div", { class: "profile-hero-row" },
    h("div", { class: "profile-level" },
      h("span", { class: "lvl-num" }, String(g.level)),
      h("span", { class: "lvl-label" }, t("profile.level", { n: g.level })),
    ),
    h("div", { class: "profile-xp" },
      h("div", { class: "xp-track" },
        h("div", { class: "xp-fill", style: `width:${xpPct}%` }),
      ),
      h("div", { class: "xp-text muted" },
        t("profile.xp", { cur: xpInLevel, next: xpSpan })),
    ),
    h("div", { class: "profile-streak" },
      h("div", { class: "streak-num" }, `🔥 ${g.current_streak}`),
      h("div", { class: "muted small" },
        t("profile.streak_days", { n: g.current_streak })),
      h("div", { class: "muted small" },
        t("profile.longest", { n: g.longest_streak })),
    ),
    h("div", { class: "profile-goal" },
      h("div", { class: "goal-text" },
        h("span", { class: "num" },
          t("profile.goal_progress", { cur: today.questions, goal })),
        h("span", { class: "small muted" }, t("profile.daily_goal")),
      ),
      h("div", { class: "goal-ring" },
        h("div", { class: "goal-ring-bar" },
          h("div", { class: "goal-ring-fill", style: `width:${goalPct}%` }),
        ),
      ),
    ),
  ));
  heroParent.appendChild(hero);

  // ----- Two-column body: mastery (left) + achievements (right) -----
  const grid2col = h("div", { class: "home-grid" });

  // Left: mastery card.
  const masteryCard = h("div", { class: "card mastery-card" });
  masteryCard.appendChild(h("h2", {}, t("profile.mastery")));
  const statBy = {};
  for (const s of allTech) statBy[s.slug] = s;
  const techByGroup = {};
  for (const tech of store.techniques) {
    if (!techByGroup[tech.group]) techByGroup[tech.group] = [];
    techByGroup[tech.group].push(tech);
  }
  for (let gi = 1; gi <= 5; gi++) {
    const list = techByGroup[gi] || [];
    let mastered = 0;
    for (const tech of list) {
      const s = statBy[tech.slug];
      if (s && s.correct_count >= 3 && s.last_correct === true) mastered++;
    }
    const total = list.length || 8;
    const pct = total ? (mastered / total) * 100 : 0;
    masteryCard.appendChild(h("div", { class: "stat-bar-row mastery-row" },
      h("div", { class: "stat-bar-label" }, `${gi}. ${GROUP_NAMES[gi] || ""}`),
      h("div", { class: "stat-bar-track" },
        h("div", {
          class: `stat-bar-fill ${pct >= 100 ? "good" : "gold"}`,
          style: `width:${pct}%`,
        }),
      ),
      h("div", { class: "stat-bar-value" }, `${mastered} / ${total}`),
    ));
  }
  grid2col.appendChild(masteryCard);

  // Right: achievements card.
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const achCard = h("div", { class: "card ach-card" });
  achCard.appendChild(h("h2", {},
    t("profile.achievements"),
    h("span", { class: "muted small", style: "margin-left:8px; font-weight:500" },
      t("profile.unlocked", { n: unlockedCount, total: achievements.length })),
  ));
  const achGrid = h("div", { class: "achievement-grid" });
  for (const a of achievements) {
    const name = store.lang === "fr" ? a.name_fr : a.name_en;
    const desc = store.lang === "fr" ? a.description_fr : a.description_en;
    const cls = `ach ${a.unlocked ? "unlocked" : "locked"}`;
    let dateStr = "";
    if (a.unlocked && a.unlocked_at) {
      try {
        const d = new Date(a.unlocked_at * 1000);
        dateStr = d.toLocaleDateString(store.lang === "fr" ? "fr-FR" : "en-US", {
          month: "short", day: "numeric",
        });
      } catch (_) {}
    }
    achGrid.appendChild(h("div", { class: cls, title: desc },
      h("div", { class: "ach-icon" }, a.unlocked ? "🥋" : "🔒"),
      h("div", { class: "ach-name" }, name),
      a.unlocked && dateStr
        ? h("div", { class: "ach-date muted small" }, dateStr)
        : h("div", { class: "ach-date muted small" }, t("profile.locked")),
    ));
  }
  achCard.appendChild(achGrid);
  grid2col.appendChild(achCard);

  gridParent.appendChild(grid2col);
}

async function renderHome() {
  const root = el("#view-home");
  root.innerHTML = "";

  let stats = { total_answered: 0, total_correct: 0, questions_today: 0 };
  try { stats = await fetchOverallStats(); } catch (_) {}

  const accuracy = stats.total_answered
    ? Math.round((stats.total_correct / stats.total_answered) * 100)
    : 0;

  // Layout (top to bottom):
  //   1. Profile hero strip          (level + XP + streak + goal, ~96px)
  //   2. Action buttons row          (single / rapid / drill / browse, ~56px)
  //   3. Today summary strip         (4 horizontal stat cells, ~80px)
  //   4. Two-column grid             (mastery left, achievements right)
  //
  // Action buttons sit right under the hero so they're always visible
  // above the fold at default window size. renderProfile fills two slots
  // separately — the hero into heroSlot, the 2-col grid into gridSlot —
  // so action+today can interleave between them.
  const heroSlot = h("div", { class: "profile-slot" });
  root.appendChild(heroSlot);

  // Practice action row — horizontal flex of 4 buttons.
  root.appendChild(h("div", { class: "home-actions" },
    h("button", {
      class: "btn primary action-btn", type: "button",
      onclick: () => startSingleQuiz(),
    }, h("span", { class: "act-ico" }, "◆"),
       h("span", {}, t("home.single"))),
    h("button", {
      class: "btn action-btn", type: "button",
      onclick: () => startRapidFire(),
    }, h("span", { class: "act-ico" }, "»"),
       h("span", {}, t("home.rapid", { n: RAPID_LENGTH }))),
    h("button", {
      class: "btn action-btn", type: "button",
      onclick: () => startDrill(),
    }, h("span", { class: "act-ico" }, "⏱"),
       h("span", {}, t("home.drill"))),
    h("button", {
      class: "btn ghost action-btn", type: "button",
      onclick: () => navigate("browse"),
    }, h("span", { class: "act-ico" }, "≡"),
       h("span", {}, t("home.browse"))),
  ));

  // Today summary strip — 4 stat cells in a horizontal flex row.
  root.appendChild(h("div", { class: "card today-strip" },
    h("h2", {}, t("home.today")),
    h("div", { class: "today-cells" },
      h("div", { class: "today-cell" },
        h("div", { class: "today-num" }, String(stats.questions_today)),
        h("div", { class: "today-lbl" }, t("home.questions")),
      ),
      h("div", { class: "today-cell" },
        h("div", { class: "today-num" }, `${accuracy}%`),
        h("div", { class: "today-lbl" }, t("home.accuracy")),
      ),
      h("div", { class: "today-cell" },
        h("div", { class: "today-num" }, String(stats.total_answered)),
        h("div", { class: "today-lbl" }, t("home.total")),
      ),
      h("div", { class: "today-cell" },
        h("div", { class: "today-num small" }, scheduleSummary(store.settings.schedule)),
        h("div", { class: "today-lbl" }, t("home.prompt")),
      ),
    ),
  ));

  // The home-grid (mastery + achievements) goes at the bottom — it's the
  // overflow-it's-OK browsing portion. renderProfile injects content
  // into both slots once the async fetches resolve.
  const gridSlot = h("div", { class: "profile-grid-slot" });
  root.appendChild(gridSlot);

  renderProfile(heroSlot, gridSlot).catch(e => console.error("renderProfile", e));
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
    // Pre-rendered MP3 clips are the only audio source — see speakTechnique
    // and scripts/generate_audio.py.
    const { known } = clipStatusSummary(tech);
    let diag;
    if (known === "missing") {
      diag = "⚠ no clip for this technique — run scripts/generate_audio.py";
    } else if (known === "ok") {
      diag = "♪ recorded clip";
    } else {
      diag = "♪ recorded clip";
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
    // 2-col grid on desktop: prompt left, choices right; collapses to a
    // single column at narrow widths (mobile or narrow desktop). Same DOM
    // shape on every platform, CSS does the layout.
    h("div", { class: "qc-grid" }, promptEl, interactionEl),
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
    // Fire the perfect-burst achievement check exactly once per run.
    if (!r._completed) {
      r._completed = true;
      completeRapid(r.correct, r.total);
    }
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
    // Timeout = wrong → resets the silent-sensei consecutive counter.
    store.drill.consecutive_correct = 0;
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
    // Number of consecutive correct answers in the current run, without
    // exiting. Reset by clearDrillTimer() when the user leaves the view.
    consecutive_correct: 0,
    sensei_fired: false,
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
      if (isCorrect) {
        d.consecutive_correct = (d.consecutive_correct || 0) + 1;
        // Silent-sensei: 10 consecutive correct answers without exiting,
        // in audio prompt mode. Fire backend check once per achievement.
        if (!d.sensei_fired
            && d.consecutive_correct >= 10
            && store.settings.drill.prompt_mode === "audio") {
          d.sensei_fired = true;
          completeDrillRun(d.consecutive_correct, "audio");
        }
      } else {
        d.consecutive_correct = 0;
      }
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

// ---------------------------------------------------------------------------
// Schedule editor — kind picker + conditional sub-fields. Each change
// debounces a single backend save; intermediate edits don't hit the disk.
// ---------------------------------------------------------------------------

let _scheduleSaveTimer = null;

function debounceSaveSchedule(cfg) {
  store.settings.schedule = cfg;
  if (_scheduleSaveTimer) clearTimeout(_scheduleSaveTimer);
  _scheduleSaveTimer = setTimeout(async () => {
    _scheduleSaveTimer = null;
    try { await setSchedule(cfg); }
    catch (e) { console.error("setSchedule failed", e); }
  }, 220);
}

function buildScheduleEditor() {
  const wrap = h("div", { class: "field" },
    h("label", {}, t("settings.schedule")),
  );

  const cfg = store.settings.schedule || { ...DEFAULT_SCHEDULE };
  const kind = cfg.kind || "disabled";

  const kindSelect = h("select", {});
  for (const [k, label] of [
    ["disabled",        t("settings.schedule.disabled")],
    ["daily",           t("settings.schedule.daily")],
    ["twice_daily",     t("settings.schedule.twice")],
    ["daily_min_count", t("settings.schedule.smart")],
    ["every_minutes",   t("settings.schedule.every")],
  ]) {
    const opt = h("option", { value: k }, label);
    if (k === kind) opt.selected = true;
    kindSelect.appendChild(opt);
  }
  kindSelect.addEventListener("change", () => {
    const next = defaultsForKind(kindSelect.value);
    debounceSaveSchedule(next);
    render();
  });
  wrap.appendChild(kindSelect);

  // Conditional sub-fields per kind.
  const sub = h("div", { class: "schedule-sub", style: "margin-top:8px" });
  const onUpdate = (mut) => {
    const updated = { ...store.settings.schedule };
    mut(updated);
    debounceSaveSchedule(updated);
  };

  if (kind === "daily" || kind === "daily_min_count") {
    sub.appendChild(timeField("settings.schedule.time", cfg.time, (v) => onUpdate(c => { c.time = v; })));
    sub.appendChild(weekdaysField(cfg.weekdays, (v) => onUpdate(c => { c.weekdays = v; })));
    if (kind === "daily_min_count") {
      sub.appendChild(numberField(
        "settings.schedule.min_count",
        cfg.min_count ?? 10, 1, 200,
        (v) => onUpdate(c => { c.min_count = v; }),
      ));
    }
  } else if (kind === "twice_daily") {
    sub.appendChild(timeField("settings.schedule.time_a", cfg.time_a, (v) => onUpdate(c => { c.time_a = v; })));
    sub.appendChild(timeField("settings.schedule.time_b", cfg.time_b, (v) => onUpdate(c => { c.time_b = v; })));
    sub.appendChild(weekdaysField(cfg.weekdays, (v) => onUpdate(c => { c.weekdays = v; })));
  } else if (kind === "every_minutes") {
    sub.appendChild(numberField(
      "settings.schedule.minutes",
      cfg.minutes ?? 30, 1, 24 * 60,
      (v) => onUpdate(c => { c.minutes = v; }),
    ));
    sub.appendChild(quietHoursField(cfg.quiet_hours, (v) => onUpdate(c => { c.quiet_hours = v; })));
  }
  wrap.appendChild(sub);

  wrap.appendChild(h("div", { class: "muted", style: "margin-top:6px" },
    t("settings.schedule.help")));
  wrap.appendChild(h("div", { class: "muted", style: "margin-top:4px; font-size:11px" },
    scheduleSummary(cfg)));

  return wrap;
}

function defaultsForKind(kind) {
  switch (kind) {
    case "disabled":
      return { kind: "disabled" };
    case "daily":
      return { kind: "daily", time: { hour: 19, minute: 0 }, weekdays: 0x7f };
    case "twice_daily":
      return {
        kind: "twice_daily",
        time_a: { hour: 8, minute: 30 },
        time_b: { hour: 19, minute: 0 },
        weekdays: 0x7f,
      };
    case "daily_min_count":
      return {
        kind: "daily_min_count",
        time: { hour: 19, minute: 0 },
        min_count: 10,
        weekdays: 0x7f,
      };
    case "every_minutes":
      return { kind: "every_minutes", minutes: 30, quiet_hours: null };
    default:
      return { kind: "disabled" };
  }
}

function timeField(labelKey, time, onChange) {
  const v = time || { hour: 19, minute: 0 };
  const input = h("input", {
    type: "time",
    value: `${String(v.hour).padStart(2, "0")}:${String(v.minute).padStart(2, "0")}`,
  });
  input.addEventListener("change", () => {
    const [h_, m_] = input.value.split(":").map((x) => parseInt(x, 10));
    if (Number.isFinite(h_) && Number.isFinite(m_)) {
      onChange({ hour: h_, minute: m_ });
    }
  });
  return h("div", { class: "field-inline" },
    h("label", {}, t(labelKey)),
    input,
  );
}

function numberField(labelKey, value, min, max, onChange) {
  const input = h("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    step: "1",
  });
  input.addEventListener("change", () => {
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
  });
  return h("div", { class: "field-inline" },
    h("label", {}, t(labelKey)),
    input,
  );
}

function weekdaysField(maskValue, onChange) {
  // Mask is the WeekdayMask u8 — bit0=Mon … bit6=Sun.
  let mask = typeof maskValue === "number" ? maskValue : 0x7f;
  const wrap = h("div", { class: "weekday-row", style: "display:flex; gap:6px; flex-wrap:wrap; margin-top:6px" });
  for (let i = 0; i < 7; i++) {
    const bit = 1 << i;
    const on = (mask & bit) !== 0;
    const btn = h("button", {
      type: "button",
      class: `chip ${on ? "on" : "off"}`,
      onclick: () => {
        const nextOn = !((mask & bit) !== 0);
        mask = nextOn ? (mask | bit) : (mask & ~bit);
        if (mask === 0) mask = bit; // never let the mask hit 0 — backend rejects
        onChange(mask);
        render();
      },
    }, t(`settings.schedule.weekday.${WEEKDAY_KEYS[i]}`));
    wrap.appendChild(btn);
  }
  return h("div", { class: "field-inline column" },
    h("label", {}, t("settings.schedule.weekdays")),
    wrap,
  );
}

function quietHoursField(qh, onChange) {
  const enabled = !!qh;
  const wrap = h("div", { class: "field-inline column", style: "margin-top:6px" });
  wrap.appendChild(h("label", {}, t("settings.schedule.quiet_hours")));
  const toggle = h("select", {});
  for (const [k, label] of [
    ["off", t("settings.schedule.quiet_off")],
    ["on", t("settings.schedule.quiet_hours")],
  ]) {
    const opt = h("option", { value: k }, label);
    if ((k === "on") === enabled) opt.selected = true;
    toggle.appendChild(opt);
  }
  toggle.addEventListener("change", () => {
    if (toggle.value === "off") onChange(null);
    else onChange({ start: { hour: 22, minute: 0 }, end: { hour: 7, minute: 0 } });
    render();
  });
  wrap.appendChild(toggle);
  if (enabled) {
    wrap.appendChild(timeField(
      "settings.schedule.quiet_start", qh.start,
      (v) => onChange({ start: v, end: qh.end }),
    ));
    wrap.appendChild(timeField(
      "settings.schedule.quiet_end", qh.end,
      (v) => onChange({ start: qh.start, end: v }),
    ));
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Sync (Track 4) — magic-link login + push/pull glue.
// ---------------------------------------------------------------------------
//
// Local-first: every Tauri command in this section is wrapped so a network
// or auth failure renders an inline error and never poisons the rest of the
// app. The flush debouncer reuses one pending timer; settings changes and
// answer events both call queueSyncFlush() which schedules a single push
// 30s later if auto-sync is on.
//
// State kept in `store.sync.ui`:
//   - phase: "login" | "verify" | "signed_in"
//   - email_input, token_input  (transient form values)
//   - status        (most recent fetched SyncStatusDto)
//   - busy          (boolean — disables buttons during a request)
//   - error_msg     (already-translated error to display)
const SYNC_AUTO_KEY = "kata.sync_auto";
const SYNC_FLUSH_DELAY_MS = 30 * 1000;
let _syncFlushTimer = null;

function readAutoSync() {
  const raw = localStorage.getItem(SYNC_AUTO_KEY);
  if (raw === "0" || raw === "false") return false;
  return true; // default on
}

function writeAutoSync(on) {
  localStorage.setItem(SYNC_AUTO_KEY, on ? "1" : "0");
}

function ensureSyncStore() {
  if (!store.sync) {
    store.sync = {
      ui: {
        // "login"     — email-entry screen
        // "verify"    — link sent, polling + fallback code visible
        // "signed_in" — JWT in hand
        phase: "login",
        email_input: "",
        // Paste-fallback code the user types in if the link doesn't work.
        token_input: "",
        // Whether the paste-fallback box is visible (collapsed by default
        // since the click flow is the happy path).
        show_fallback_input: false,
        // Active poll session metadata. `expires_at_ms` is wall-clock so we
        // can stop polling once the server-side attempt is gone.
        poll: null, // { session_id, expires_at_ms }
        status: null,
        // Set true on the first refreshSyncStatus(); the build path uses it
        // to skip re-fetching on every re-render (which would otherwise
        // call render() in a .then() and steal focus from any input the
        // user is typing into — settings, sync, daily goal, all of them).
        status_loaded: false,
        busy: false,
        error_msg: null,
        info_msg: null,
      },
    };
  }
  return store.sync;
}

// Magic-link polling: a single global handle so we can cancel cleanly when
// the user navigates away, the attempt expires, or verification succeeds.
let _syncPollTimer = null;
let _syncPollBackoffMs = 2000;

function stopSyncPoll() {
  if (_syncPollTimer) {
    clearTimeout(_syncPollTimer);
    _syncPollTimer = null;
  }
  _syncPollBackoffMs = 2000;
}

function startSyncPoll() {
  stopSyncPoll();
  _syncPollBackoffMs = 2000;
  scheduleNextPoll();
}

function scheduleNextPoll() {
  _syncPollTimer = setTimeout(() => {
    _syncPollTimer = null;
    runSyncPollOnce();
  }, _syncPollBackoffMs);
}

async function runSyncPollOnce() {
  const s = ensureSyncStore();
  const poll = s.ui.poll;
  if (!poll || s.ui.phase !== "verify") {
    // Nothing to do — user navigated away or already signed in.
    return;
  }
  if (Date.now() >= poll.expires_at_ms) {
    s.ui.poll = null;
    s.ui.phase = "login";
    s.ui.error_msg = t("settings.sync.error.expired");
    s.ui.info_msg = null;
    if (store.view === "settings") render();
    return;
  }
  try {
    const resp = await invoke("auth_poll", { sessionId: poll.session_id });
    // null  → still pending
    // {...} → success — JWT already persisted by the Rust side
    if (resp) {
      s.ui.phase = "signed_in";
      s.ui.poll = null;
      s.ui.token_input = "";
      s.ui.error_msg = null;
      s.ui.info_msg = null;
      stopSyncPoll();
      await refreshSyncStatus();
      // Pull immediately so the new device hydrates before the user
      // wonders why nothing changed.
      try { await invoke("sync_pull"); } catch (_) {}
      await refreshSyncStatus();
      if (store.view === "settings") render();
      return;
    }
    // Still pending — reset backoff and re-arm at 2s cadence.
    _syncPollBackoffMs = 2000;
  } catch (e) {
    const msg = (e && (e.message || e.toString())) || "";
    if (msg.includes("expired")) {
      s.ui.poll = null;
      s.ui.phase = "login";
      s.ui.error_msg = t("settings.sync.error.expired");
      s.ui.info_msg = null;
      stopSyncPoll();
      if (store.view === "settings") render();
      return;
    }
    if (msg.includes("unknown_session")) {
      s.ui.poll = null;
      s.ui.phase = "login";
      s.ui.error_msg = t("settings.sync.error.expired");
      stopSyncPoll();
      if (store.view === "settings") render();
      return;
    }
    // Network/other transient errors → exponential backoff capped at 10s.
    console.warn("auth_poll transient", e);
    _syncPollBackoffMs = Math.min(10000, Math.max(2000, _syncPollBackoffMs * 2));
  }
  // Re-arm if still in verify phase after handling this tick.
  if (s.ui.phase === "verify" && s.ui.poll) {
    scheduleNextPoll();
  }
}

async function refreshSyncStatus() {
  const s = ensureSyncStore();
  try {
    const status = await invoke("sync_status");
    s.ui.status = status;
    s.ui.status_loaded = true;
    if (status?.logged_in) s.ui.phase = "signed_in";
  } catch (e) {
    console.warn("sync_status failed", e);
    s.ui.status_loaded = true; // even on failure, don't loop the fetch
  }
  return s.ui.status;
}

function relativeTime(unixSec) {
  if (!unixSec) return t("settings.sync.never_synced");
  const now = Date.now() / 1000;
  const delta = Math.max(0, now - unixSec);
  if (delta < 60) return t("settings.sync.relative.justnow");
  if (delta < 3600) return t("settings.sync.relative.minutes", { n: Math.round(delta / 60) });
  if (delta < 86400) return t("settings.sync.relative.hours", { n: Math.round(delta / 3600) });
  return t("settings.sync.relative.days", { n: Math.round(delta / 86400) });
}

/// Schedule a debounced push 30s from now. Multiple calls collapse to a
/// single flush — typical user flow (answer a flurry then settle) results
/// in one network call.
function queueSyncFlush() {
  if (!readAutoSync()) return;
  if (_syncFlushTimer) clearTimeout(_syncFlushTimer);
  _syncFlushTimer = setTimeout(async () => {
    _syncFlushTimer = null;
    try {
      const r = await invoke("sync_push");
      if (r && !r.ok && r.error && r.error !== "not_logged_in") {
        console.warn("sync_push reported", r.error);
      }
    } catch (e) {
      console.warn("sync_push threw", e);
    }
  }, SYNC_FLUSH_DELAY_MS);
}

function buildSyncSection() {
  const s = ensureSyncStore();
  const wrap = h("div", { class: "field sync-pane" });
  wrap.appendChild(h("label", {}, t("settings.sync.title")));
  wrap.appendChild(h("div", { class: "muted", style: "margin-top:6px; line-height:1.45" },
    t("settings.sync.help")));

  // Fetch status ONCE per settings-tab visit. Without the guard, every
  // keystroke triggers a re-render, which calls buildSyncSection again,
  // which kicks off another refreshSyncStatus(), whose .then() calls
  // render() — destroying every <input> on the settings card and stealing
  // focus mid-keystroke. Explicit user actions (login, sync_now, logout)
  // still call refreshSyncStatus directly without the guard.
  if (!s.ui.status_loaded) {
    refreshSyncStatus().then(() => {
      if (store.view === "settings") render();
    });
  }

  if (s.ui.status?.logged_in || s.ui.phase === "signed_in") {
    const status = s.ui.status || {};
    const email = status.email || "";
    const lastSynced = Math.max(status.last_pulled_at || 0, status.last_pushed_at || 0);
    const stateLine = status.pending_changes
      ? t("settings.sync.status.pending")
      : t("settings.sync.status.ok");

    wrap.appendChild(h("div", { class: "muted", style: "margin-top:10px" },
      t("settings.sync.signed_in_as", { email })));
    wrap.appendChild(h("div", { class: "muted", style: "margin-top:4px" },
      t("settings.sync.last_synced", { when: relativeTime(lastSynced) })));
    wrap.appendChild(h("div", { class: "muted", style: "margin-top:4px" }, stateLine));

    // Auto-sync toggle.
    const autoSel = h("select", {});
    for (const o of [["true", t("on") || "On"], ["false", t("off") || "Off"]]) {
      const opt = h("option", { value: o[0] }, o[1]);
      if ((o[0] === "true") === readAutoSync()) opt.selected = true;
      autoSel.appendChild(opt);
    }
    autoSel.addEventListener("change", () => {
      writeAutoSync(autoSel.value === "true");
    });
    wrap.appendChild(h("div", { class: "field", style: "margin-top:10px" },
      h("label", {}, t("settings.sync.auto_sync")),
      autoSel,
    ));

    const buttons = h("div", { class: "btn-row", style: "margin-top:10px; gap:8px; display:flex; flex-wrap:wrap" });
    const syncBtn = h("button", {
      class: "btn",
      onclick: async () => {
        if (s.ui.busy) return;
        s.ui.busy = true; s.ui.error_msg = null;
        render();
        let pushOk = true, pullOk = true;
        let pushErr = null, pullErr = null;
        try {
          const p = await invoke("sync_push");
          console.info("sync_push result", p);
          if (p && p.ok === false && p.error !== "not_logged_in") {
            pushOk = false; pushErr = p.error || "unknown";
          }
        } catch (e) { pushOk = false; pushErr = String(e); console.warn("sync_push", e); }
        try {
          const q = await invoke("sync_pull");
          console.info("sync_pull result", q);
          if (q && q.ok === false && q.error !== "not_logged_in") {
            pullOk = false; pullErr = q.error || "unknown";
          }
        } catch (e) { pullOk = false; pullErr = String(e); console.warn("sync_pull", e); }
        if (!pushOk || !pullOk) {
          // Surface the underlying error tag (http: 401, network: …, decode: …)
          // so the user can tell connection-refused apart from auth/protocol
          // problems. Falls back to the generic message if both are null.
          const reason = pushErr || pullErr;
          s.ui.error_msg = reason
            ? `${t("settings.sync.error.unreachable")} (${reason})`
            : t("settings.sync.error.unreachable");
        }
        await refreshSyncStatus();
        s.ui.busy = false;
        render();
      },
    }, s.ui.busy ? "…" : t("settings.sync.sync_now"));
    const outBtn = h("button", {
      class: "btn ghost",
      onclick: async () => {
        try { await invoke("sync_logout"); } catch (e) { console.warn(e); }
        stopSyncPoll();
        s.ui.phase = "login";
        s.ui.email_input = "";
        s.ui.token_input = "";
        s.ui.poll = null;
        s.ui.show_fallback_input = false;
        s.ui.status = null;
        s.ui.error_msg = null;
        s.ui.info_msg = null;
        render();
      },
    }, t("settings.sync.signout"));
    const resyncBtn = h("button", {
      class: "btn ghost",
      onclick: async () => {
        if (s.ui.busy) return;
        if (!confirm(t("settings.sync.force_resync_confirm"))) return;
        s.ui.busy = true; s.ui.error_msg = null; s.ui.info_msg = null;
        render();
        try {
          await invoke("sync_force_resync");
          // Push first so server gets all of our local rows; then pull.
          // Either step's network failure is non-fatal — the next periodic
          // tick will retry.
          let firstErr = null;
          try {
            const p = await invoke("sync_push");
            if (p && p.ok === false && p.error !== "not_logged_in") firstErr = p.error;
          } catch (e) { firstErr = String(e); }
          try {
            const q = await invoke("sync_pull");
            if (q && q.ok === false && q.error !== "not_logged_in" && !firstErr) firstErr = q.error;
          } catch (e) { if (!firstErr) firstErr = String(e); }
          if (firstErr) {
            s.ui.error_msg = `${t("settings.sync.error.unreachable")} (${firstErr})`;
          } else {
            s.ui.info_msg = t("settings.sync.force_resync_done");
          }
        } catch (e) {
          console.warn("sync_force_resync", e);
          s.ui.error_msg = `${t("settings.sync.error.unreachable")} (${String(e)})`;
        }
        await refreshSyncStatus();
        s.ui.busy = false;
        render();
      },
    }, t("settings.sync.force_resync"));
    buttons.appendChild(syncBtn);
    buttons.appendChild(resyncBtn);
    buttons.appendChild(outBtn);
    wrap.appendChild(buttons);

    if (s.ui.error_msg) {
      wrap.appendChild(h("div", { class: "muted", style: "margin-top:8px; color:var(--accent, #c87a7a)" },
        s.ui.error_msg));
    }
    return wrap;
  }

  // Logged-out: email-entry phase OR verify-waiting phase.
  if (s.ui.phase === "verify" && s.ui.poll) {
    // Poll-waiting screen: tells the user to click the link in their
    // email; a paste-fallback input below lets them type the code from
    // the email if they're on a different device.
    wrap.appendChild(h("div", { class: "muted", style: "margin-top:10px; line-height:1.45" },
      t("settings.sync.waiting")));

    wrap.appendChild(h("div", { class: "muted", style: "margin-top:12px; line-height:1.45" },
      t("settings.sync.fallback_code_help")));

    const tokenInput = h("input", {
      type: "text",
      value: s.ui.token_input,
      placeholder: "ABCD-EFGH-JK",
      autocomplete: "one-time-code",
      inputmode: "text",
      autocapitalize: "characters",
      spellcheck: "false",
    });
    tokenInput.addEventListener("input", () => { s.ui.token_input = tokenInput.value; });
    wrap.appendChild(h("div", { class: "field", style: "margin-top:10px" },
      h("label", {}, t("settings.sync.token_label")),
      tokenInput,
    ));

    const verifyBtn = h("button", {
      class: "btn full",
      onclick: async () => {
        const code = (s.ui.token_input || "").trim();
        if (!code) return;
        s.ui.busy = true; s.ui.error_msg = null;
        render();
        try {
          await invoke("auth_verify_code", { code });
          s.ui.phase = "signed_in";
          s.ui.poll = null;
          s.ui.token_input = "";
          stopSyncPoll();
          await refreshSyncStatus();
          // Pull immediately so the new device hydrates before the user
          // wonders why nothing changed.
          try { await invoke("sync_pull"); } catch (_) {}
          await refreshSyncStatus();
        } catch (e) {
          console.warn("auth_verify_code", e);
          s.ui.error_msg = t("settings.sync.error.invalid_token");
        }
        s.ui.busy = false;
        render();
      },
    }, s.ui.busy ? "…" : t("settings.sync.verify"));
    wrap.appendChild(h("div", { class: "field" }, verifyBtn));

    const cancelBtn = h("button", {
      class: "btn ghost",
      onclick: () => {
        stopSyncPoll();
        s.ui.phase = "login";
        s.ui.poll = null;
        s.ui.token_input = "";
        s.ui.error_msg = null;
        s.ui.info_msg = null;
        render();
      },
    }, t("settings.sync.cancel"));
    wrap.appendChild(h("div", { class: "field" }, cancelBtn));

    if (s.ui.error_msg) {
      wrap.appendChild(h("div", { class: "muted", style: "margin-top:8px; color:var(--accent, #c87a7a)" },
        s.ui.error_msg));
    }
    return wrap;
  }

  // Default (and reset) state: email entry.
  const emailInput = h("input", {
    type: "email",
    value: s.ui.email_input,
    placeholder: "you@example.com",
    autocomplete: "email",
    inputmode: "email",
  });
  emailInput.addEventListener("input", () => { s.ui.email_input = emailInput.value; });
  wrap.appendChild(h("div", { class: "field", style: "margin-top:10px" },
    h("label", {}, t("settings.sync.email_label")),
    emailInput,
  ));

  const sendBtn = h("button", {
    class: "btn full",
    onclick: async () => {
      const email = (s.ui.email_input || "").trim();
      if (!email) return;
      s.ui.busy = true; s.ui.error_msg = null;
      render();
      try {
        // Stash the email locally so verify can attribute the session to it.
        await invoke("sync_set_pending_email", { email });
        const r = await invoke("auth_start", { email });
        // r = { session_id, expires_in }; short code is only in the email.
        s.ui.poll = {
          session_id: r.session_id,
          expires_at_ms: Date.now() + (Number(r.expires_in) || 900) * 1000,
        };
        s.ui.phase = "verify";
        s.ui.token_input = "";
        s.ui.info_msg = t("settings.sync.magic_sent");
        startSyncPoll();
      } catch (e) {
        console.warn("auth_start", e);
        s.ui.error_msg = t("settings.sync.error.unreachable");
      }
      s.ui.busy = false;
      render();
    },
  }, s.ui.busy ? "…" : t("settings.sync.send_magic"));
  wrap.appendChild(h("div", { class: "field" }, sendBtn));

  if (s.ui.error_msg) {
    wrap.appendChild(h("div", { class: "muted", style: "margin-top:8px; color:var(--accent, #c87a7a)" },
      s.ui.error_msg));
  }
  return wrap;
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

  // Schedule editor — multi-control: kind picker + conditional sub-fields.
  card.appendChild(buildScheduleEditor());

  // Sync (Track 4) — magic-link login + manual sync.
  card.appendChild(buildSyncSection());

  // Daily goal stepper (gamification).
  const dailyGoalInput = h("input", {
    type: "number",
    min: "1",
    max: "100",
    step: "1",
    value: String(store.gamification?.daily_goal ?? 10),
  });
  let _goalSaveTimer = null;
  dailyGoalInput.addEventListener("change", () => {
    const n = parseInt(dailyGoalInput.value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) return;
    if (_goalSaveTimer) clearTimeout(_goalSaveTimer);
    _goalSaveTimer = setTimeout(() => {
      _goalSaveTimer = null;
      setDailyGoal(n).then(() => {
        if (store.gamification) store.gamification.daily_goal = n;
      });
    }, 220);
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("settings.daily_goal")),
    dailyGoalInput,
    h("div", { class: "muted", style: "margin-top:6px" },
      t("settings.daily_goal_help")),
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

  // App updates — desktop only; on mobile the card just explains store updates.
  root.appendChild(await buildUpdaterSection());

  // Diagnostic — explains the local quiz_log row count by breaking it
  // down per mode + showing the earliest/latest answer timestamps. Helps
  // users reconcile a high-looking "Total répondu" with what they think
  // they've answered (rapid mode logs 10 rows per round, drill logs
  // every prompt — the count compounds quickly).
  root.appendChild(buildDiagnosticSection());

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

// ---------------------------------------------------------------------------
// Auto-updater (desktop only)
//
// State machine on store.updater.state:
//   idle → checking → up_to_date           (no update or error)
//                  → available             (update.body shown in modal)
//                  → downloading           (progress events)
//                  → ready_to_install
//                  → installing            (relaunch imminent on Linux)
//
// Mobile is short-circuited three ways: (1) Cargo.toml target-gates the
// updater plugin off Android/iOS, (2) lib.rs registers it under
// #[cfg(desktop)], and (3) detectUpdaterPlatform() flips
// store.updater.supported to false here so the UI hides the pill and modal.
// Even if a curious user pokes __TAURI__.updater on a mobile build, the
// permission is missing from mobile.json/ios.json so the IPC layer rejects.
// ---------------------------------------------------------------------------

async function detectUpdaterPlatform() {
  // The tauri-plugin-updater crate is target-gated to desktop in Cargo.toml,
  // so window.__TAURI__.updater simply doesn't exist on Android/iOS — making
  // feature-presence the most reliable signal (and removing the need for
  // tauri-plugin-os, which we don't ship). Earlier code expected
  // window.__TAURI__.os.platform() to exist, but the os plugin isn't
  // registered, so the fallback path was returning "unknown" and treating
  // desktop as mobile — that's why the screenshots showed the mobile
  // "platform updates via the store" copy on Windows.
  store.updater.supported = !!window.__TAURI__?.updater;
  store.updater.platform = store.updater.supported ? "desktop" : "mobile";
}

function loadUpdaterPrefs() {
  try {
    const v = localStorage.getItem(STORE_KEYS.updaterAutoCheck);
    store.updater.auto_check = v === null ? true : v === "true";
    const last = localStorage.getItem(STORE_KEYS.updaterLastNotes);
    if (last) {
      try { store.updater.last_applied = JSON.parse(last); } catch (_) {}
    }
  } catch (_) {}
}

function saveUpdaterAutoCheck() {
  try {
    localStorage.setItem(STORE_KEYS.updaterAutoCheck, String(store.updater.auto_check));
  } catch (_) {}
}

async function updaterCheck({ silent = false } = {}) {
  if (!store.updater.supported) return null;
  store.updater.error_msg = null;
  store.updater.state = "checking";
  if (!silent) renderUpdaterPill();
  try {
    const update = await window.__TAURI__.updater.check();
    if (update && update.version && update.version !== update.currentVersion) {
      const dismissed = localStorage.getItem(STORE_KEYS.updaterLastDismiss);
      // Only suppress for "later" dismissals on this exact version. A newer
      // version drops → pill resurfaces.
      const suppressed = dismissed === update.version;
      store.updater.available_update = {
        version: update.version,
        currentVersion: update.currentVersion,
        body: update.body || "",
        date: update.date || null,
        _handle: update,
      };
      store.updater.state = suppressed ? "idle" : "available";
    } else {
      store.updater.state = "up_to_date";
      store.updater.available_update = null;
    }
  } catch (e) {
    console.error("[updater] check failed", e);
    store.updater.state = "idle";
    store.updater.error_msg = String(e?.message ?? e);
  }
  renderUpdaterPill();
  if (store.view === "settings") render();
  return store.updater.available_update;
}

async function updaterDownloadAndInstall() {
  const u = store.updater.available_update;
  if (!u || !u._handle) return;
  store.updater.state = "downloading";
  store.updater.progress = { downloaded: 0, total: 0 };
  renderUpdaterModal();
  try {
    await u._handle.downloadAndInstall((event) => {
      if (event.event === "Started") {
        store.updater.progress.total = Number(event.data?.contentLength || 0);
      } else if (event.event === "Progress") {
        store.updater.progress.downloaded += Number(event.data?.chunkLength || 0);
      } else if (event.event === "Finished") {
        store.updater.state = "ready_to_install";
      }
      renderUpdaterModal();
    });
    // Cache the notes so the "What's new in v<x>" Settings card has content
    // on the next launch (a freshly installed user has nothing cached, which
    // is fine — the card is hidden in that case).
    try {
      const payload = {
        version: u.version,
        body: u.body,
        applied_at: new Date().toISOString(),
      };
      localStorage.setItem(STORE_KEYS.updaterLastNotes, JSON.stringify(payload));
    } catch (_) {}
    store.updater.state = "installing";
    renderUpdaterModal();
    // Linux AppImage: the bundler doesn't auto-restart, we have to call it.
    // Windows/macOS bundlers self-relaunch — calling here is harmless because
    // the running process is already exiting.
    if (window.__TAURI__?.process?.relaunch) {
      await window.__TAURI__.process.relaunch();
    }
  } catch (e) {
    console.error("[updater] install failed", e);
    store.updater.error_msg = String(e?.message ?? e);
    store.updater.state = "available";
    renderUpdaterModal();
  }
}

function dismissUpdate() {
  const u = store.updater.available_update;
  if (u) {
    try { localStorage.setItem(STORE_KEYS.updaterLastDismiss, u.version); } catch (_) {}
  }
  store.updater.state = "idle";
  renderUpdaterPill();
  closeUpdaterModal();
}

// Minimal markdown → safe HTML for release-notes rendering. Notes come from
// our own GitHub Release body (semantic-release writes them) but we treat as
// untrusted: escape everything, then opt-in to a few tags. Supports headings
// (#…###), **bold**, `code`, bullet lists, and bare URL linkification (routed
// through opener so the click doesn't navigate the webview).
function renderUpdaterMarkdown(src) {
  if (!src) return "";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                       .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let inList = false;
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  function inlineMd(s) {
    let r = esc(s);
    r = r.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    r = r.replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);
    r = r.replace(/(https?:\/\/[^\s<]+)/g, (u) => {
      return `<a href="#" data-href="${u}" class="md-link">${u}</a>`;
    });
    return r;
  }
  for (const raw of lines) {
    const line = raw;
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) { flushList(); out.push(`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`); continue; }
    const li = line.match(/^[\*\-]\s+(.*)$/);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineMd(li[1])}</li>`);
      continue;
    }
    if (line.trim() === "") { flushList(); out.push(""); continue; }
    flushList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}

function renderUpdaterPill() {
  let pill = el("#updater-pill");
  if (!store.updater.supported) {
    if (pill) pill.remove();
    return;
  }
  const state = store.updater.state;
  const visible = state === "available" || state === "downloading" ||
                  state === "ready_to_install" || state === "installing";
  if (!visible) { if (pill) pill.remove(); return; }
  // Anchor: the desktop titlebar (preferred — pill becomes a chrome element
  // alongside the window controls), with fallback to the mobile topbar.
  const anchor = el(".titlebar-right") || el(".topbar-mobile");
  if (!anchor) return;
  if (!pill) {
    pill = h("button", {
      id: "updater-pill", class: "updater-pill", type: "button",
      style: "-webkit-app-region: no-drag",
      onclick: () => openUpdaterModal(),
    });
    if (anchor.classList.contains("titlebar-right")) {
      // Insert before .window-controls so the controls stay flush right.
      const controls = anchor.querySelector(".window-controls");
      if (controls) anchor.insertBefore(pill, controls);
      else anchor.appendChild(pill);
    } else {
      anchor.appendChild(pill);
    }
  }
  pill.innerHTML = "";
  pill.appendChild(h("span", { class: "updater-pill-dot" }));
  let label;
  if (state === "downloading") {
    const p = store.updater.progress;
    const pct = p.total > 0 ? Math.floor(p.downloaded * 100 / p.total) : 0;
    label = t("updater.pill.downloading", { p: pct });
  } else if (state === "ready_to_install" || state === "installing") {
    label = t("updater.pill.ready");
  } else {
    label = t("updater.pill.available");
  }
  pill.appendChild(h("span", {}, label));
}

function openUpdaterModal() { renderUpdaterModal(true); }
function closeUpdaterModal() {
  const m = el("#updater-modal");
  if (m) m.classList.add("hidden");
}
function renderUpdaterModal(forceOpen = false) {
  let modal = el("#updater-modal");
  if (!modal) {
    modal = h("div", {
      id: "updater-modal", class: "updater-modal hidden",
      role: "dialog", "aria-modal": "true",
    });
    document.body.appendChild(modal);
  }
  if (forceOpen) modal.classList.remove("hidden");
  if (modal.classList.contains("hidden")) return;
  const u = store.updater.available_update;
  if (!u) { closeUpdaterModal(); return; }
  modal.innerHTML = "";
  const card = h("div", { class: "updater-modal-card" });
  card.appendChild(h("button", {
    class: "updater-modal-close", type: "button", "aria-label": "Close",
    onclick: () => closeUpdaterModal(),
  }, "×"));
  card.appendChild(h("h2", {}, t("updater.modal.title")));
  card.appendChild(h("p", { class: "muted" },
    t("updater.modal.version", { from: u.currentVersion, to: u.version })));

  const notesBox = h("div", { class: "updater-notes" });
  notesBox.innerHTML = renderUpdaterMarkdown(u.body || t("updater.modal.no_notes"));
  notesBox.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.md-link");
    if (!a) return;
    ev.preventDefault();
    if (a.dataset.href) openExternal(a.dataset.href);
  });
  card.appendChild(notesBox);

  const state = store.updater.state;
  if (state === "downloading") {
    const p = store.updater.progress;
    const pct = p.total > 0 ? Math.floor(p.downloaded * 100 / p.total) : 0;
    card.appendChild(h("div", { class: "updater-progress" },
      h("div", {
        class: "updater-progress-fill",
        style: `width: ${pct}%`,
      })));
    card.appendChild(h("p", { class: "muted" },
      t("updater.modal.downloading", { p: pct })));
  } else if (state === "ready_to_install" || state === "installing") {
    card.appendChild(h("p", {}, t("updater.modal.installing")));
  } else {
    const row = h("div", { class: "updater-modal-actions" });
    row.appendChild(h("button", {
      class: "btn ghost", type: "button",
      onclick: () => dismissUpdate(),
    }, t("updater.modal.later")));
    row.appendChild(h("button", {
      class: "btn primary", type: "button",
      onclick: () => updaterDownloadAndInstall(),
    }, t("updater.modal.install")));
    card.appendChild(row);
  }
  if (store.updater.error_msg) {
    card.appendChild(h("div", { class: "updater-error" },
      t("updater.error", { msg: store.updater.error_msg })));
  }
  modal.appendChild(card);
}

// Lazy single-fetch cache for CHANGELOG.md. The file is bundled into
// frontendDist by tauri.conf.json's beforeBuildCommand (and beforeDevCommand
// for `npm run dev`), copied from the repo-root CHANGELOG.md that
// semantic-release regenerates on every release. Treated as same-origin under
// the existing CSP `default-src 'self'`.
let _changelogCache = null;
async function loadChangelog() {
  if (_changelogCache !== null) return _changelogCache;
  try {
    const res = await fetch("CHANGELOG.md");
    if (!res.ok) { _changelogCache = ""; return ""; }
    _changelogCache = await res.text();
  } catch (_) {
    _changelogCache = "";
  }
  return _changelogCache;
}

// Pull out the section for one version from a semantic-release-generated
// CHANGELOG.md. Headings look like `## [1.4.0-beta.1](url) (date)`. The
// section runs until the next `## ` heading or end-of-file.
function extractChangelogSection(full, version) {
  if (!full || !version) return "";
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\n)## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = full.match(re);
  return m ? m[2].trim() : "";
}

// First version heading in CHANGELOG.md == the current build's version,
// because semantic-release commits the new section + bumps the version files
// in one atomic chore(release) commit. Avoids needing __TAURI__.app.getVersion
// (which would require an extra capability permission).
function extractCurrentVersionFromChangelog(full) {
  if (!full) return null;
  const m = full.match(/^## \[([^\]]+)\]/m);
  return m ? m[1] : null;
}

function openChangelogModal() {
  let modal = el("#changelog-modal");
  if (!modal) {
    modal = h("div", {
      id: "changelog-modal", class: "updater-modal hidden",
      role: "dialog", "aria-modal": "true",
    });
    document.body.appendChild(modal);
  }
  modal.classList.remove("hidden");
  modal.innerHTML = "";
  const card = h("div", { class: "updater-modal-card" });
  card.appendChild(h("button", {
    class: "updater-modal-close", type: "button", "aria-label": "Close",
    onclick: () => modal.classList.add("hidden"),
  }, "×"));
  card.appendChild(h("h2", {}, t("updater.changelog.title")));
  const body = h("div", { class: "updater-notes" });
  body.innerHTML = `<p class="muted">${t("updater.changelog.loading")}</p>`;
  card.appendChild(body);
  modal.appendChild(card);
  loadChangelog().then((md) => {
    if (!md) {
      body.innerHTML = `<p class="muted">${t("updater.changelog.empty")}</p>`;
      return;
    }
    body.innerHTML = renderUpdaterMarkdown(md);
    body.addEventListener("click", (ev) => {
      const a = ev.target.closest("a.md-link");
      if (!a) return;
      ev.preventDefault();
      if (a.dataset.href) openExternal(a.dataset.href);
    });
  });
}

function buildDiagnosticSection() {
  const card = h("div", { class: "card" },
    h("h2", {}, t("diag.title")));
  const body = h("div", { class: "muted", style: "font-size:13px; line-height:1.5" },
    t("diag.loading"));
  card.appendChild(body);
  invoke("get_quiz_log_breakdown")
    .then((d) => {
      body.innerHTML = "";
      const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleDateString(
        store.lang === "fr" ? "fr-FR" : "en-US",
        { year: "numeric", month: "short", day: "numeric" }) : "—";
      body.appendChild(h("div", { style: "margin-bottom:8px" },
        h("strong", {}, t("diag.total", { n: d.total })),
        " ",
        h("span", { class: "muted small" },
          d.earliest ? t("diag.range", { from: fmt(d.earliest), to: fmt(d.latest) }) : ""),
      ));
      const list = h("ul", { style: "list-style:none; padding-left:0; margin:0; display:grid; gap:4px;" });
      const modeLabel = (m) => ({
        single: t("diag.mode_single"),
        rapid:  t("diag.mode_rapid"),
        drill:  t("diag.mode_drill"),
      }[m] || m);
      for (const [m, n] of d.by_mode) {
        const pct = d.total > 0 ? Math.round((n / d.total) * 100) : 0;
        list.appendChild(h("li", {
          style: "display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--stroke-soft);",
        },
          h("span", {}, modeLabel(m)),
          h("span", { class: "num" }, `${n}  (${pct}%)`),
        ));
      }
      body.appendChild(list);
      body.appendChild(h("p", { class: "muted small", style: "margin-top:10px" },
        t("diag.note")));
    })
    .catch((e) => {
      body.textContent = String(e?.message ?? e);
    });
  return card;
}

async function buildUpdaterSection() {
  const card = h("div", { class: "card" }, h("h2", {}, t("updater.section.title")));
  if (!store.updater.supported) {
    card.appendChild(h("p", { class: "muted" }, t("updater.section.mobile_help")));
    return card;
  }
  // Auto-check toggle.
  const autoSelect = h("select", {});
  for (const [v, lbl] of [["true", t("updater.auto_on")], ["false", t("updater.auto_off")]]) {
    const opt = h("option", { value: v }, lbl);
    if ((v === "true") === store.updater.auto_check) opt.selected = true;
    autoSelect.appendChild(opt);
  }
  autoSelect.addEventListener("change", () => {
    store.updater.auto_check = autoSelect.value === "true";
    saveUpdaterAutoCheck();
  });
  card.appendChild(h("div", { class: "field" },
    h("label", {}, t("updater.auto_label")),
    autoSelect,
    h("div", { class: "muted", style: "margin-top:6px" }, t("updater.auto_help")),
  ));

  // Manual check + status line.
  const stateMsg = {
    idle:             t("updater.status.idle"),
    checking:         t("updater.status.checking"),
    up_to_date:       t("updater.status.up_to_date"),
    available:        t("updater.status.available", {
                        v: store.updater.available_update?.version || "?" }),
    downloading:      t("updater.status.downloading"),
    ready_to_install: t("updater.status.ready"),
    installing:       t("updater.status.installing"),
  }[store.updater.state];
  const status = h("div", { class: "muted", style: "margin-top:8px" }, stateMsg || "");
  card.appendChild(h("div", { class: "field" },
    h("button", {
      class: "btn full", type: "button",
      onclick: () => updaterCheck({ silent: false }),
    }, t("updater.check_now")),
    status,
  ));

  // What's new — first preference is the cache written by a previous
  // successful auto-update (because that body came from the GH release
  // notes via the manifest, which is the most accurate source). Fresh
  // installs hit the second branch: parse the bundled CHANGELOG.md,
  // extract the current version's section. Either way the user sees
  // *something* relevant the moment they open Settings.
  const cached = store.updater.last_applied;
  let wnVersion = null, wnBody = "";
  if (cached && cached.version && cached.body) {
    wnVersion = cached.version;
    wnBody = cached.body;
  } else {
    const cl = await loadChangelog();
    if (cl) {
      const v = extractCurrentVersionFromChangelog(cl);
      if (v) {
        const section = extractChangelogSection(cl, v);
        if (section) { wnVersion = v; wnBody = section; }
      }
    }
  }
  if (wnVersion && wnBody) {
    const wn = h("div", { class: "whats-new" });
    wn.appendChild(h("h3", {}, t("updater.whats_new.title", { v: wnVersion })));
    const md = h("div", { class: "updater-notes" });
    md.innerHTML = renderUpdaterMarkdown(wnBody);
    md.addEventListener("click", (ev) => {
      const a = ev.target.closest("a.md-link");
      if (!a) return;
      ev.preventDefault();
      if (a.dataset.href) openExternal(a.dataset.href);
    });
    wn.appendChild(md);
    card.appendChild(wn);
  }

  // Always-available "View full changelog" button — same source as the
  // What's new card above (CHANGELOG.md), but opens a modal that renders
  // the full file (every version). Useful for users who installed via the
  // store / sideload and want to scroll back.
  card.appendChild(h("div", { class: "field" },
    h("button", {
      class: "btn ghost full", type: "button",
      onclick: () => openChangelogModal(),
    }, t("updater.changelog.button")),
  ));
  return card;
}

// Detect the OS so CSS can branch (e.g. macOS hides our window controls in
// favor of the OS-drawn traffic lights, and insets the titlebar 78px to
// avoid colliding with them). Falls back to navigator.userAgent when the
// Tauri os plugin isn't registered (we don't ship it; this is a pure-CSS
// hint, not a load-bearing capability).
async function detectPlatformBodyClass() {
  let p = "unknown";
  try {
    if (window.__TAURI__?.os?.platform) p = await window.__TAURI__.os.platform();
  } catch (_) {}
  if (p === "unknown") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac"))                                    p = "macos";
    else if (ua.includes("win"))                               p = "windows";
    else if (ua.includes("android"))                           p = "android";
    else if (ua.includes("iphone") || ua.includes("ipad"))     p = "ios";
    else if (ua.includes("linux"))                             p = "linux";
  }
  document.body.dataset.platform = p;
}

// Wire the custom titlebar's window controls. Tauri 2 exposes window ops
// via window:default permissions, which core:default already grants — no
// capability change needed. Silent no-op on mobile (where the OS handles
// chrome and our .window-controls is hidden by CSS).
//
// withGlobalTauri exposure of the window class shifted between Tauri
// 2.x minor versions: 2.0–2.6 used window.__TAURI__.window.getCurrent(),
// 2.7+ added getCurrentWindow() and may or may not still expose getCurrent.
// Some builds also expose .Window.getCurrent. We try every path and fall
// back to a raw `core.invoke('plugin:window|<cmd>')` IPC call which is
// always available as long as core:default is granted (it is).
// Custom-titlebar buttons. We call dedicated Rust commands rather than
// the window.__TAURI__.window.* JS API because the latter's exact export
// path shifted across Tauri 2.x minor versions and was unreliable. The
// Rust side is in src-tauri/src/lib.rs (window_minimize, etc.).
function bindWindowControls() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;
  const fire = (cmd) => async () => {
    try {
      await invoke(cmd);
    } catch (e) {
      console.error("[window-controls]", cmd, e);
    }
  };
  el(".wc-min")?.addEventListener("click", fire("window_minimize"));
  el(".wc-max")?.addEventListener("click", fire("window_toggle_maximize"));
  el(".wc-close")?.addEventListener("click", fire("window_close"));
}

async function boot() {
  try {
    loadLocalSettings();
    loadUpdaterPrefs();
    await detectUpdaterPlatform();
    await detectPlatformBodyClass();
    applyTabLabels();

    // Wire both the mobile bottom-tab-bar (.tab) and the desktop sidebar
    // (.navitem). `navigate()` toggles .active on both sets so they stay
    // in sync across the responsive breakpoints.
    els(".tab, .navitem").forEach(btn => {
      btn.addEventListener("click", () => navigate(btn.dataset.view));
    });

    bindVideoModal();
    bindWindowControls();
  } catch (e) {
    console.error("boot: setup failed", e);
  }

  // Each fetch wrapped individually so a single failure (e.g. an Android
  // plugin not yet ready) doesn't block the whole boot. Rendering proceeds
  // with whatever data is available.
  try { await fetchTechniques(); } catch (e) { console.error("fetchTechniques", e); }
  try { await fetchSchedule(); }   catch (e) { console.error("fetchSchedule", e); }
  try { store.gamification = await fetchGamificationState(); }
  catch (e) { console.error("fetchGamificationState", e); }

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

  // Auto-update boot check (desktop only). Delayed so the first paint isn't
  // blocked and the app is fully responsive when the pill appears.
  if (store.updater.supported && store.updater.auto_check) {
    setTimeout(() => { updaterCheck({ silent: true }).catch(() => {}); }, 3000);
  }
}

document.addEventListener("DOMContentLoaded", boot);
