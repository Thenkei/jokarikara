import type { Catalog } from "./catalog";

/**
 * French catalog. Typed as `Catalog`: a key missing here (or a plural written
 * as a plain string) fails `tsc`.
 *
 * Voice: tutoiement, short game-like sentences. Conventions (see the PR
 * glossary):
 * - PERFECT / GREAT / GOOD / OK, COMBO and STYLE stay in English: they are
 *   stylised labels drawn on the board, not words of the sentence.
 * - "tap" is "toucher" ("Touche quand ça rentre"); keyboard hints say
 *   "appuie sur Espace".
 * - Modes: CLASSIQUE, ZEN, CHRONO (Time Attack); Daily Challenge is "défi du
 *   jour"; a stack is "une forme" in prose.
 * - World names are translated: they describe the mechanic, so a French
 *   player should read them, not decode them.
 * - Typography: no-break space (U+00A0) before ":", narrow no-break space
 *   (U+202F) before "!" and "?", and between a number and its unit.
 */
export const fr: Catalog = {
  // ---------------------------------------------------------------- app
  "app.title": "SHAPE STACK",
  "app.gameBoard":
    "Plateau de jeu\u00a0: touche, clique ou appuie sur Espace pour empiler la forme qui grandit",

  // ---------------------------------------------------------------- start screen
  "start.subtitle": "Touche pour empiler. Sans déborder.",
  "start.settings": "Réglages",
  "start.modeGroup": "Mode de jeu",
  "start.best": "RECORD {score}",
  // Non-breaking hyphens: a narrow column wraps after RECORD, never inside "--".
  "start.bestNone": "RECORD \u2011\u2011",
  "start.bestMedal": ", {medal}",
  "start.play": "JOUER",
  "start.practiceGroup": "Monde de départ de l'entraînement",
  "start.practicePrev": "Monde de départ précédent",
  "start.practiceNext": "Monde de départ suivant",
  "start.practiceWorld": "DÉPART AU MONDE {world}",
  "start.practiceFull": "Partie complète",
  "start.practiceName": "Entraînement · {name}",
  "start.achievements": "SUCCÈS {unlocked}/{total}",
  "start.achievementsAria": "Succès\u00a0: {unlocked} sur {total} débloqués",
  "start.worlds": "MONDES {revealed}/{total}",
  "start.worldsAria": "Mondes\u00a0: {revealed} sur {total} découverts",
  "start.monoOn": "Style mono activé",
  "start.monoOff": "Style mono désactivé",

  // ---------------------------------------------------------------- modes
  "mode.CLASSIC.label": "CLASSIQUE",
  "mode.CLASSIC.aria": "Mode classique",
  "mode.CLASSIC.name": "Classique",
  "mode.CLASSIC.description": "Une erreur et c'est fini.",
  "mode.ZEN.label": "ZEN",
  "mode.ZEN.aria": "Mode zen",
  "mode.ZEN.name": "Zen",
  "mode.ZEN.description": "{lives} vies, annuler et relancer.",
  "mode.TIME_ATTACK.label": "CHRONO",
  "mode.TIME_ATTACK.aria": "Mode chrono",
  "mode.TIME_ATTACK.name": "Chrono",
  "mode.TIME_ATTACK.description":
    "60\u202fs. PERFECT +{perfect}\u202fs, GREAT +{great}\u202fs, raté −{penalty}\u202fs.",
  "mode.TIME_ATTACK.descriptionNoPenalty": "60\u202fs, chaque PERFECT ajoute +{perfect}\u202fs.",

  // ---------------------------------------------------------------- daily challenge
  "daily.button": "DÉFI DU JOUR",
  "daily.metaNotPlayed": "{date} · À JOUER",
  "daily.metaPlayed": "{date} · RECORD {best} · {tries}",
  "daily.tries": { one: "{count} ESSAI", other: "{count} ESSAIS" },
  "daily.triesSpoken": { one: "{count} essai", other: "{count} essais" },
  "daily.nextIn": "PROCHAIN DÉFI DANS {time}",
  "daily.nextInSpoken": "Prochain défi dans {time}.",
  "daily.nextReady": "LE PROCHAIN DÉFI EST PRÊT",
  "daily.aria.title": "Défi du jour du {date}.",
  "daily.aria.same": "Les mêmes formes pour tout le monde aujourd'hui.",
  "daily.aria.played": "Record {best}, {tries}.",
  "daily.aria.notPlayed": "Pas encore joué.",
  "daily.streak.kept": "SÉRIE DE {days} JOURS",
  "daily.streak.keptSpoken": "Série de {days} jours.",
  "daily.streak.atRisk": "GARDE TA SÉRIE DE {days} JOURS",
  "daily.streak.atRiskSpoken": "Série de {days} jours, joue aujourd'hui pour la garder.",
  "countdown.hoursMinutes": "{hours}\u202fh {minutes}\u202fmin",
  "countdown.minutes": "{minutes}\u202fmin",
  "countdown.lessThanMinute": "<1\u202fmin",
  "countdown.spoken.hours": { one: "{count} heure", other: "{count} heures" },
  "countdown.spoken.minutes": { one: "{count} minute", other: "{count} minutes" },
  "countdown.spoken.hoursMinutes": "{hours} et {minutes}",
  "countdown.spoken.lessThanMinute": "moins d'une minute",

  // ---------------------------------------------------------------- HUD
  "hud.pause": "PAUSE",
  "hud.pauseAria": "Mettre le jeu en pause",
  "hud.timer": "{seconds}\u202fs",
  "hud.timerAria": { one: "{count} seconde restante", other: "{count} secondes restantes" },
  "hud.lives": "VIES {lives}",
  "hud.best": "RECORD {score}",
  "hud.medalGoal": "{medal} {threshold}",
  "hud.world": "M {world}",
  "hud.level": "N {level}",
  "hud.daily": "DÉFI",
  "hud.style": "STYLE {score}",
  "hud.combo": "COMBO x{streak}",
  "hud.bestCombo": "MAX x{streak}",
  "hud.zenRestart": "RELANCER",
  "hud.zenRestartAria": "Relancer la forme en cours",
  "hud.zenUndo": "ANNULER",
  "hud.zenUndoAria": "Annuler la dernière forme",
  "hud.timeBonus": "+{seconds}\u202fs",
  "hud.timePenalty": "−{seconds}\u202fs",
  "hud.miss": "RATÉ",

  // ---------------------------------------------------------------- pause menu
  "pause.dialog": "Jeu en pause",
  "pause.title": "PAUSE",
  "pause.resume": "REPRENDRE",
  "pause.restart": "RECOMMENCER",
  "pause.finish": "FINIR LA PARTIE",
  // One line in the 17.5rem pause column at 320 px (the button must not grow).
  "pause.finishArmed": "CONFIRMER LA FIN",
  "pause.settings": "RÉGLAGES",
  "pause.mainMenu": "MENU PRINCIPAL",

  // ---------------------------------------------------------------- banners & overlays
  "banner.combo": "COMBO ×{streak}",
  "banner.newBest": "NOUVEAU RECORD",
  "banner.newDailyBest": "RECORD DU JOUR",
  "banner.pastBest": "AU-DELÀ DE {score}",
  "banner.nextMedal": "PUIS {medal} {threshold}",
  "banner.timeUp": "TEMPS ÉCOULÉ\u202f!",
  "banner.level": "NIVEAU {level}",
  "banner.newWorld": "NOUVEAU MONDE",
  "banner.world": "MONDE {world}",
  "banner.tapToPlay": "TOUCHE POUR JOUER",
  "firstRun.title": "TOUCHE QUAND ÇA RENTRE",
  "firstRun.body":
    "Laisse la forme grandir, puis touche l'écran (ou appuie sur Espace) juste avant qu'elle atteigne le bord. Plus tu t'en approches, mieux c'est\u00a0: {perfect}.",

  // ---------------------------------------------------------------- screen reader announcements
  "announce.paused": "En pause",
  "announce.resuming": "Reprise dans {seconds}",
  "announce.finishConfirm":
    "Finir la partie\u202f? Appuie encore pour la terminer et garder ton score",
  "announce.level": "Niveau {level}",
  "announce.world": "Monde {world}",
  "announce.worldIntro": "{howTo} Touche l'écran ou appuie sur Espace pour jouer.",
  "announce.combo": "Combo {streak}",
  "announce.gameOver": "Partie terminée",
  "announce.score": "Score {score}",
  "announce.miss": "Raté",
  "announce.missMargin": "Raté. {margin}",
  "announce.newBest": "Nouveau record personnel. Ancien record de {score} battu",
  "announce.newDailyBest": "Nouveau record du jour. Ancien record de {score} battu",
  "announce.medalTop": "{medal}. Médaille la plus haute obtenue",
  "announce.medalNext": "{medal}. Prochaine\u00a0: {next} à {threshold}",
  "announce.timeUp": "Temps écoulé\u202f! Score {score}",
  "announce.timeUpMedal": "Temps écoulé\u202f! Score {score}. {medal}",

  // ---------------------------------------------------------------- stack qualities (game terms)
  "quality.PERFECT": "PERFECT",
  "quality.GREAT": "GREAT",
  "quality.GOOD": "GOOD",
  "quality.OK": "OK",

  // ---------------------------------------------------------------- medals
  "medal.name.BRONZE": "Bronze",
  "medal.name.SILVER": "Argent",
  "medal.name.GOLD": "Or",
  "medal.title.BRONZE": "Médaille de bronze",
  "medal.title.SILVER": "Médaille d'argent",
  "medal.title.GOLD": "Médaille d'or",
  "medal.none": "AUCUNE MÉDAILLE",
  "medal.nextAt": "{medal} à {threshold}",
  "medal.toGo": "encore {points}",

  // ---------------------------------------------------------------- miss margins
  "margin.lateTime": "En retard de {seconds}",
  "margin.lateTimeLabel": "RETARD {seconds}",
  "margin.fracture": "Secteur libre {seconds} plus tard",
  "margin.fractureLabel": "ATTENDS {seconds}",
  "margin.lateHair": "Trop tard d'un cheveu",
  "margin.earlyHair": "Trop tôt d'un cheveu",
  "margin.late": "Trop tard de {percent}",
  "margin.early": "Trop tôt de {percent}",
  "margin.hairLabel": "D'UN CHEVEU",
  "margin.hintEdge": "Le PERFECT s'est ouvert {seconds} avant le bord.",
  "margin.hintRing": "Le PERFECT s'est ouvert {seconds} avant l'anneau.",
  "unit.seconds": "{value}\u202fs",
  "unit.percent": "{value}\u00a0%",

  // ---------------------------------------------------------------- game over
  "gameOver.summary": "Résumé de la partie",
  "gameOver.headline": "FIN DE PARTIE",
  "gameOver.headlineFinished": "SESSION TERMINÉE",
  "gameOver.headlineTimeUp": "TEMPS ÉCOULÉ\u202f!",
  "gameOver.practiceFrom": "ENTRAÎNEMENT · DÈS LE MONDE {world}",
  "gameOver.daily": "DÉFI · {date}",
  "gameOver.scoreLabel": "Score\u00a0: ",
  "gameOver.world": "MONDE {world}",
  "gameOver.level": "NIVEAU {level}",
  "gameOver.newBest": "NOUVEAU RECORD",
  "gameOver.runStats": "Statistiques de la partie",
  "gameOver.stacks": "FORMES",
  "gameOver.perfect": "PERFECT",
  "gameOver.bestCombo": "COMBO MAX",
  "gameOver.levels": "NIVEAUX",
  "gameOver.levelsHint": "Niveaux atteints, tous mondes confondus",
  "gameOver.breakdown": "Qualité des formes empilées",
  "gameOver.unlocked": "SUCCÈS DÉBLOQUÉS",
  "gameOver.showLess": "VOIR MOINS",
  "gameOver.showMore": "+{count} AUTRES",
  "gameOver.practiceTitle": "ENTRAÎNEMENT",
  "gameOver.practiceBody": "Les entraînements ne comptent ni pour les scores ni pour les succès.",
  "gameOver.today": "AUJOURD'HUI",
  "gameOver.dailyLine": "RECORD {best} · {tries}",
  "gameOver.topScores": "MEILLEURS SCORES - {mode}",
  "gameOver.noScores": "Pas encore de meilleur score\u202f!",
  "gameOver.retry": "REJOUER",
  "gameOver.share": "PARTAGER",
  "gameOver.mainMenu": "MENU PRINCIPAL",
  "share.copied": "Copié dans le presse-papiers",
  "share.shared": "Partagé\u202f!",
  "share.failed": "Partage indisponible",

  // ---------------------------------------------------------------- run insights
  "insight.overflow.title": "Trop tard\u00a0: la forme a dépassé le bord.",
  "insight.overflow.titleWithMargin": "La forme a dépassé le bord.",
  "insight.overflow.tip":
    "Touche un poil plus tôt. Un GREAT (92\u00a0%+) garde la partie en vie et le combo en cours.",
  "insight.overflowReverse.title": "Ta forme a franchi l'anneau.",
  "insight.overflowReverse.tip":
    "Touche dès qu'elle entoure complètement la précédente\u00a0: au plus serré, c'est PERFECT.",
  "insight.badTap.title": "Cette forme ne rentrait pas.",
  "insight.badTap.tip":
    "Au moment de toucher, chaque coin de ta forme doit être dans celle du dessous.",
  "insight.badTapReverse.title": "Trop tôt\u00a0: elle n'entourait pas la forme précédente.",
  "insight.badTapReverse.titleWithMargin": "Elle n'entourait pas la forme précédente.",
  "insight.badTapReverse.tip":
    "Dans la Pile inversée, attends que ta forme entoure complètement la précédente.",
  "insight.fracture.title": "Fracture\u202f! Un secteur rouge a croisé ta forme.",
  "insight.fracture.tip":
    "Près du bord, touche quand les arcs rouges sont loin des coins de ta forme.",
  "insight.timeout.title": "Temps écoulé.",
  "insight.timeout.tip":
    "La précision rapporte du temps\u00a0: PERFECT +{perfect}\u202fs, GREAT +{great}\u202fs.",
  "insight.lives.title": "Plus de vies.",
  "insight.lives.tip":
    "En Zen, toucher trop tôt ne coûte rien, et ANNULER / RELANCER ne coûtent jamais de vie.",
  "insight.finished.title": "Session terminée.",
  "insight.finished.empty":
    "Rien d'empilé cette fois. Le Zen est fait pour trouver ton timing, sans pression.",
  "insight.finished.onlyPerfect": "Ta seule forme était PERFECT. Timing impeccable.",
  "insight.finished.allPerfect": "Tes {stacks} étaient toutes PERFECT. Timing impeccable.",
  "insight.finished.dialledIn":
    "{rate}\u00a0% de PERFECT sur {stacks}\u00a0: ton timing est au point. Le mode Classique le met à l'épreuve.",
  "insight.finished.somePerfect":
    "{perfects} PERFECT sur {stacks} ({rate}\u00a0%). À la prochaine session, vise-en un de plus.",
  "insight.finished.great":
    "{great} sur {stacks} en GREAT. Le PERFECT, c'est 97\u00a0%\u00a0: attends un poil plus avant de toucher.",
  "insight.finished.safe":
    "Toutes tes formes ont tenu. Laisse-les grandir plus près du bord avant de toucher pour marquer plus.",
  "insight.stacks": { one: "{count} forme", other: "{count} formes" },

  // ---------------------------------------------------------------- share text
  "shareText.dailyTitle": "Shape Stack · Défi du jour {date}",
  "shareText.dailyStats": "{score} pts · {stacks} · M{world} N{level}",
  "shareText.title": "Shape Stack · {mode}",
  "shareText.titleMedal": "Shape Stack · {mode} · {medal}",
  "shareText.titlePractice": "Shape Stack · {mode}, entraînement dès M{world}",
  "shareText.score": "{score} pts",
  "shareText.stacks": { one: "{count} forme", other: "{count} formes" },
  "shareText.progress": "M{world} N{level}",
  "shareText.combo": "combo x{combo}",

  // ---------------------------------------------------------------- settings
  "settings.title": "RÉGLAGES",
  "settings.fx.title": "Effets visuels",
  "settings.fx.description": "Particules, flashs et tremblements de l'écran.",
  "settings.sound.title": "Son",
  "settings.sound.description": "Tous les sons du jeu et des menus.",
  "settings.music.title": "Musique",
  "settings.music.description": "Une bande-son qui s'étoffe à mesure que tu montes.",
  "settings.haptics.title": "Vibrations",
  "settings.haptics.description": "Vibre à chaque forme, raté et combo.",
  "settings.haptics.unsupported": "Indisponible sur cet appareil.",
  "settings.timingCue.title": "Repère de timing",
  "settings.timingCue.description": "Des tics qui accélèrent jusqu'au PERFECT.",
  "settings.language.title": "Langue",
  "settings.language.description": "Suit ton navigateur, sauf si tu en choisis une.",
  "settings.language.auto": "Auto",
  "settings.done": "OK",

  // ---------------------------------------------------------------- achievements
  "achievements.title": "SUCCÈS",
  "achievements.count": "{unlocked} / {total} DÉBLOQUÉS",
  "achievements.stats": "STATISTIQUES",
  "achievements.progressSpoken": "{current} sur {target}",
  "achievements.unlocked": "Débloqué",
  "achievements.locked": "Verrouillé",
  "achievements.back": "RETOUR",
  "achievements.toast": "SUCCÈS",
  "achievements.hidden.title": "???",
  "achievements.hidden.description": "Un succès caché.",
  "achievement.first-stack.title": "Première forme",
  "achievement.first-stack.description": "Pose ta première forme.",
  "achievement.perfect-alignment.title": "Alignement parfait",
  "achievement.perfect-alignment.description": "Enchaîne {count} PERFECT d'affilée.",
  "achievement.unbroken.title": "Inarrêtable",
  "achievement.unbroken.description": "Atteins un combo x{count}.",
  "achievement.world-2.title": "Nouveaux horizons",
  "achievement.world-2.description": "Atteins le monde {world}.",
  "achievement.world-3.title": "Lignes de faille",
  "achievement.world-3.description": "Atteins le monde {world}.",
  "achievement.world-5.title": "Prismatique",
  "achievement.world-5.description": "Atteins le monde {world}.",
  "achievement.speed-demon.title": "Bolide",
  "achievement.speed-demon.description":
    "Atteins le niveau {level} en moins de {seconds} secondes de jeu.",
  "achievement.giant-slayer.title": "Pourfendeur de géants",
  "achievement.giant-slayer.description": "Empile une forme boss sans la rater.",
  "achievement.zen-master.title": "Maître zen",
  "achievement.zen-master.description": "Empile {count} formes en une seule partie Zen.",
  "achievement.gold-rush.title": "Ruée vers l'or",
  "achievement.gold-rush.description":
    "Décroche la médaille d'or en mode Chrono ({score} points).",
  "achievement.time-lord.title": "Maître du temps",
  "achievement.time-lord.description": "Marque {score} points en mode Chrono.",
  "achievement.daily-devotee.title": "Fidèle au poste",
  "achievement.daily-devotee.description": "Joue le défi du jour {count} jours différents.",
  "achievement.architect.title": "Architecte",
  "achievement.architect.description": "Empile {count} formes au total.",
  "achievement.curious-mind.title": "Esprit curieux",
  "achievement.curious-mind.description": "Tu as trouvé un des secrets de l'écran d'accueil.",

  // ---------------------------------------------------------------- lifetime stats
  "stats.runs-played": "Parties jouées",
  "stats.total-stacks": "Formes empilées",
  "stats.perfect-rate": "Taux de PERFECT",
  "stats.best-combo": "Meilleur combo",
  "stats.best-perfect-run": "PERFECT d'affilée",
  "stats.best-world": "Meilleur monde",
  "stats.best-zen-stacks": "Record en Zen",
  "stats.best-time-attack": "Record en Chrono",
  "stats.daily-played": "Défis du jour joués",
  "stats.daily-streak": "Série de défis",

  // ---------------------------------------------------------------- world atlas
  "atlas.title": "MONDES",
  "atlas.count": "{revealed} / {total} DÉCOUVERTS",
  "atlas.intro": "Chaque monde ajoute une nouvelle difficulté aux précédents.",
  "atlas.world": "MONDE {world}",
  "atlas.lockedName": "???",
  "atlas.lockedSpoken": ", verrouillé",
  "atlas.lockedHint": "Atteins le monde {world} pour le découvrir",
  "atlas.practice": "S'ENTRAÎNER",
  "atlas.practiceAria": "S'entraîner sur le monde {world}, {name}",

  // ---------------------------------------------------------------- worlds
  "world.1.name": "Les bases",
  "world.1.tagline": "Touche quand la forme remplit l'espace.",
  "world.1.howTo":
    "Ta forme grandit dans la précédente\u00a0: touche juste avant qu'elle atteigne le bord, et plus elle est ajustée, plus elle rapporte.",
  "world.2.name": "Respiration",
  "world.2.tagline": "La pile respire. Fie-toi au contour.",
  "world.2.howTo":
    "Les formes empilées gonflent et dégonflent doucement, mais seulement à l'écran\u00a0: cale ta touche sur leur taille au repos.",
  "world.3.name": "Croissance accélérée",
  "world.3.tagline": "Ça grandit plus vite. Les secteurs rouges du bord bloquent.",
  "world.3.howTo":
    "Les formes grandissent plus vite à chaque niveau et, hors Zen, deux secteurs rouges balaient le bord\u00a0: toucher quand un coin y est, c'est raté.",
  "world.4.name": "Houle",
  "world.4.tagline": "La pile tangue, ta forme reste en place.",
  "world.4.howTo":
    "La pile oscille de gauche à droite mais ta forme reste centrée\u00a0; l'oscillation est visuelle, garde l'œil sur la taille.",
  "world.5.name": "Dérive chromatique",
  "world.5.tagline": "Les couleurs dérivent. Pas les formes.",
  "world.5.howTo":
    "Les formes empilées changent sans cesse de couleur, sans rien changer d'autre\u00a0: lis le contour, pas la couleur.",
  "world.6.name": "L'Éclipse",
  "world.6.tagline": "Obscurité. Suis le contour qui pulse.",
  "world.6.howTo":
    "La pile s'assombrit presque jusqu'au noir, et seul le contour pulsant de la dernière forme montre où t'arrêter.",
  "world.7.name": "Gravité",
  "world.7.tagline": "Ta forme descend en grandissant.",
  "world.7.howTo":
    "Ta forme descend en grandissant et touche donc plus tôt le bas de la précédente\u00a0: touche un peu plus tôt.",
  "world.8.name": "Rotation inversée",
  "world.8.tagline": "La rotation s'inverse un niveau sur deux.",
  "world.8.howTo":
    "La pile change de sens de rotation un niveau sur deux et sur les formes boss\u00a0: les coins s'alignent à de nouveaux moments.",
  "world.9.name": "Pile inversée",
  "world.9.tagline": "Grandis vers l'extérieur\u00a0: entoure la dernière forme, reste dans l'anneau.",
  "world.9.howTo":
    "Les formes grandissent vers l'extérieur\u00a0: touche dès que la tienne entoure la précédente, avant qu'elle atteigne l'anneau de l'arène.",
  "world.10.name": "Pulsation",
  "world.10.tagline": "La croissance bondit sur le temps. Touche en rythme.",
  "world.10.howTo":
    "La croissance s'emballe à chaque temps (90\u202fBPM) et ralentit entre deux\u00a0: vise le calme avant le temps suivant.",
};
