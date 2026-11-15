import { describe, expect, it } from "vitest";
import { getTranslator } from "./translator";
import { getEndInsight, getFinishedInsight } from "../modes/runInsights";
import {
  getMissAnnouncement,
  getMissMarginHeadline,
  getMissMarginLabel,
} from "../modes/missMargin";
import { buildRunShareText } from "../modes/share";
import { buildDailyShareText } from "../modes/daily";
import {
  describeDailyButton,
  formatCountdown,
  formatCountdownSpoken,
  selectStreakLabel,
} from "../modes/dailyStreak";
import { getMedalAnnouncement } from "../modes/medals";
import { getGameOverHeadline, getTimeUpAnnouncement } from "../modes/endFeedback";
import { getPersonalBestAnnouncement } from "../modes/personalBest";
import { buildStatRows } from "../progression/stats";
import { EMPTY_LIFETIME_STATS, getAchievement, getAchievementText } from "../progression/achievements";
import { buildAtlasEntries } from "../gameplay/atlas";
import { getWorldName } from "../gameplay/worldText";

/**
 * The pure modules in French: each builds its strings from the translator it
 * is given (never a global), with French plurals, numbers and dates.
 */
const EN = getTranslator("en");
const FR = getTranslator("fr");
const NBSP = "\u00a0";
const NNBSP = "\u202f";
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

describe("French strings from pure modules", () => {
  it("explains a lost run, with the margin in French number format", () => {
    const insight = getEndInsight(FR, "overflow", 1, { kind: "lateTime", seconds: 0.4 });
    expect(insight).toEqual({
      margin: `En retard de 0,4${NNBSP}s`,
      marginHint: `Le PERFECT s'est ouvert 0,4${NNBSP}s avant le bord.`,
      title: "La forme a dépassé le bord.",
      tip: `Touche un poil plus tôt. Un GREAT (92${NBSP}%+) garde la partie en vie et le combo en cours.`,
    });
    // Without a margin the sentence says it was too late itself.
    expect(getEndInsight(FR, "overflow", 1)?.title).toBe(
      `Trop tard${NBSP}: la forme a dépassé le bord.`,
    );
    expect(getEndInsight(FR, "timeout", 3)).toMatchObject({
      title: "Temps écoulé.",
      tone: "calm",
    });
  });

  it("sums up a finished Zen session with French plurals", () => {
    expect(getFinishedInsight(FR, [140, 140]).tip).toBe(
      "Tes 2 formes étaient toutes PERFECT. Timing impeccable.",
    );
    expect(getFinishedInsight(FR, [140]).tip).toBe(
      "Ta seule forme était PERFECT. Timing impeccable.",
    );
    expect(getFinishedInsight(FR, [140, 25, 25]).tip).toBe(
      `1 PERFECT sur 3 formes (33${NBSP}%). À la prochaine session, vise-en un de plus.`,
    );
  });

  it("labels misses, cached per language", () => {
    const late = { kind: "late", fraction: 0.04 } as const;
    expect(getMissMarginHeadline(EN, late)).toBe(`Too late by 4${NBSP}%`);
    expect(getMissMarginHeadline(FR, late)).toBe(`Trop tard de 4${NBSP}%`);
    expect(getMissMarginLabel(FR, late)).toBe(`+4${NBSP}%`);
    expect(getMissMarginLabel(FR, { kind: "early", fraction: 0.001 })).toBe("D'UN CHEVEU");
    expect(getMissMarginLabel(FR, { kind: "lateTime", seconds: 1.25 })).toBe(
      `RETARD 1,3${NNBSP}s`,
    );
    expect(getMissAnnouncement(FR, null)).toBe("Raté");
  });

  it("shares a run in French, with the medal and singular/plural stacks", () => {
    const text = buildRunShareText(FR, {
      mode: "TIME_ATTACK",
      score: 2300,
      world: 3,
      level: 2,
      stackCount: 1,
      bestCombo: 4,
      breakdown: { PERFECT: 1, GREAT: 0, GOOD: 0, OK: 0 },
    });
    expect(text.split("\n")).toEqual([
      "Shape Stack · Chrono · Médaille d'or",
      "2300 pts · 1 forme · M3 N2 · combo x4",
      "🟨",
      "https://thenkei.github.io/jokarikara/",
    ]);
    expect(
      buildRunShareText(FR, {
        mode: "ZEN",
        score: 10,
        world: 4,
        level: 1,
        stackCount: 2,
        breakdown: { PERFECT: 0, GREAT: 0, GOOD: 0, OK: 2 },
        practiceWorld: 4,
      }).split("\n")[0],
    ).toBe("Shape Stack · Zen, entraînement dès M4");
    expect(
      buildDailyShareText(FR, {
        dateKey: "2026-11-15",
        score: 140,
        world: 1,
        level: 1,
        stackCount: 1,
        qualities: ["PERFECT"],
      }),
    ).toBe("Shape Stack · Défi du jour 2026-11-15\n140 pts · 1 forme · M1 N1\n🟨");
  });

  it("counts down to the next Daily in French", () => {
    expect(formatCountdown(FR, 7 * HOUR_MS + 12 * MINUTE_MS)).toBe(
      `7${NNBSP}h 12${NNBSP}min`,
    );
    expect(formatCountdown(FR, 30_000)).toBe(`<1${NNBSP}min`);
    expect(formatCountdownSpoken(FR, 7 * HOUR_MS + 12 * MINUTE_MS)).toBe(
      "7 heures et 12 minutes",
    );
    expect(formatCountdownSpoken(FR, HOUR_MS + MINUTE_MS)).toBe("1 heure et 1 minute");
    expect(formatCountdownSpoken(FR, 30_000)).toBe("moins d'une minute");
  });

  it("describes the Daily button with a French date", () => {
    const now = new Date(2026, 10, 15, 10, 0);
    const fresh = describeDailyButton({
      i18n: FR,
      now,
      record: { best: 0, attempts: 0 },
      dailyDates: [],
    });
    expect(fresh.meta).toBe("15 novembre · À JOUER");
    expect(fresh.ariaLabel).toBe(
      "Défi du jour du 15 novembre. Les mêmes formes pour tout le monde aujourd'hui. Pas encore joué.",
    );
    const played = describeDailyButton({
      i18n: FR,
      now,
      record: { best: 140, attempts: 1 },
      dailyDates: ["2026-11-14", "2026-11-15"],
    });
    expect(played.meta).toBe("15 novembre · RECORD 140 · 1 ESSAI");
    expect(played.streak?.text).toBe("SÉRIE DE 2 JOURS");
    expect(selectStreakLabel(FR, 3, false)?.text).toBe("GARDE TA SÉRIE DE 3 JOURS");
  });

  it("announces medals, the clock, records and headlines in French", () => {
    expect(getMedalAnnouncement(FR, "BRONZE")).toBe(
      `Médaille de bronze. Prochaine${NBSP}: Argent à 1500`,
    );
    expect(getMedalAnnouncement(FR, "GOLD")).toBe(
      "Médaille d'or. Médaille la plus haute obtenue",
    );
    expect(getTimeUpAnnouncement(FR, { score: 1240, medal: "SILVER" })).toBe(
      `Temps écoulé${NNBSP}! Score 1240. Médaille d'argent`,
    );
    expect(getPersonalBestAnnouncement(FR, 900, true)).toBe(
      "Nouveau record du jour. Ancien record de 900 battu",
    );
    expect(getGameOverHeadline(FR, "overflow")).toBe("FIN DE PARTIE");
    expect(getGameOverHeadline(FR, "finished")).toBe("SESSION TERMINÉE");
    expect(getGameOverHeadline(FR, "timeout")).toBe(`TEMPS ÉCOULÉ${NNBSP}!`);
  });

  it("formats lifetime stats and achievement thresholds for French", () => {
    const rows = buildStatRows(
      FR,
      { ...EMPTY_LIFETIME_STATS, totalStacks: 1234, totalPerfects: 617, runsPlayed: 3 },
      new Date(2026, 10, 15),
    );
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row("total-stacks")).toEqual({
      id: "total-stacks",
      label: "Formes empilées",
      value: `1${NNBSP}234`,
    });
    expect(row("perfect-rate")?.value).toBe(`50${NBSP}%`);
    expect(getAchievementText(FR, getAchievement("architect")).description).toBe(
      `Empile 1${NNBSP}000 formes au total.`,
    );
    expect(getAchievementText(FR, getAchievement("curious-mind"), false)).toEqual({
      title: "???",
      description: "Un succès caché.",
    });
  });

  it("names worlds in French, and later worlds reuse the last one", () => {
    expect(getWorldName(FR, 9)).toBe("Pile inversée");
    expect(getWorldName(FR, 14)).toBe(getWorldName(FR, 10));
    const entries = buildAtlasEntries(FR, 2);
    expect(entries[1]).toMatchObject({ kind: "revealed", name: "Respiration" });
    expect(entries[2]).toEqual({ kind: "locked", world: 3 });
  });
});
