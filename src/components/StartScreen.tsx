import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { useI18n } from "../i18n/context";
import { Rich } from "../i18n/Rich";
import type { Translator } from "../i18n";
import type { GameMode } from "../types";
import { GAME_MODES, type HighScoresByMode } from "../utils/storage";
import { audioManager } from "../utils/audioManager";
import {
  GREAT_STACK_TIME_BONUS,
  PERFECT_STACK_TIME_BONUS,
  TIME_ATTACK_MISS_PENALTY,
  ZEN_MAX_LIVES,
} from "../constants/game";
import type { DailyButtonView } from "../modes/dailyStreak";
import { getMedal, getMedalTitle } from "../modes/medals";
import { ACHIEVEMENT_COUNT } from "../progression/achievements";
import { ATLAS_WORLD_COUNT } from "../gameplay/atlas";
import { getWorldName } from "../gameplay/worldText";
import { GearIcon } from "./SettingsSheet";
import { MedalGlyph } from "./MedalGlyph";
import { StreakChip } from "./StreakChip";
import { ZEN_LIFE_REGEN_STACKS } from "../modes/zenLives";

/** Full-screen panels opened from the start screen menu. */
export type StartPanel = "achievements" | "worlds";

/** One line under the mode picker: the mode's rule, with the live numbers. */
const describeMode = ({ t }: Translator, mode: GameMode): string => {
  switch (mode) {
    case "CLASSIC":
      return t("mode.CLASSIC.description");
    case "ZEN":
      return t("mode.ZEN.description", { lives: ZEN_MAX_LIVES, regen: ZEN_LIFE_REGEN_STACKS });
    case "TIME_ATTACK":
      return TIME_ATTACK_MISS_PENALTY !== undefined
        ? t("mode.TIME_ATTACK.description", {
            perfect: PERFECT_STACK_TIME_BONUS,
            great: GREAT_STACK_TIME_BONUS,
            penalty: TIME_ATTACK_MISS_PENALTY,
          })
        : t("mode.TIME_ATTACK.descriptionNoPenalty", { perfect: PERFECT_STACK_TIME_BONUS });
  }
};

interface StartScreenProps {
  /** Selected mode (the radio group's value). */
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  /** Top scores per mode: the bests under each mode and the best medal. */
  allScores: HighScoresByMode;
  /** Highest world reached: Zen practice can start up to it. */
  bestWorldReached: number;
  /** Zen practice start world, already clamped to what is unlocked. */
  pickedWorld: number;
  onPracticeWorldChange: (world: number) => void;
  dailyButton: DailyButtonView;
  unlockedAchievementCount: number;
  revealedWorldCount: number;
  /** The settings sheet is open over this screen: the menu is inert. */
  settingsOpen: boolean;
  /** The gear, so the settings sheet can return focus to it. */
  settingsTriggerRef: RefObject<HTMLButtonElement | null>;
  /** Panel entries, so closing a panel can return focus to its entry. */
  registerPanelTrigger: (panel: StartPanel, node: HTMLButtonElement | null) => void;
  /** Title taps (the flourish secret; App owns its state). */
  onTitleClick: (event: ReactMouseEvent<HTMLHeadingElement>) => void;
  onStart: () => void;
  onStartDaily: () => void;
  onOpenPanel: (panel: StartPanel) => void;
  onOpenSettings: () => void;
  /** The browser offers installation (see pwa/installPrompt): show INSTALL. */
  canInstall: boolean;
  onInstall: () => void;
}

/**
 * Start screen menu: settings gear, title, mode radio group (bests, best
 * Time Attack medal, mode rule), Zen practice picker, START, the Daily button
 * (streak, next-day countdown), the ACHIEVEMENTS / WORLDS entries and, when
 * the browser offers it, INSTALL.
 * Presentational: App owns the selection, records and navigation; this only
 * keeps the radio buttons' refs for arrow-key focus.
 */
export function StartScreen({
  mode,
  onModeChange,
  allScores,
  bestWorldReached,
  pickedWorld,
  onPracticeWorldChange,
  dailyButton,
  unlockedAchievementCount,
  revealedWorldCount,
  settingsOpen,
  settingsTriggerRef,
  registerPanelTrigger,
  onTitleClick,
  onStart,
  onStartDaily,
  onOpenPanel,
  onOpenSettings,
  canInstall,
  onInstall,
}: StartScreenProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const modeButtonRefs = useRef<Partial<Record<GameMode, HTMLButtonElement | null>>>({});

  /** WAI-ARIA radio group keys: arrows move and select, Home/End jump. */
  const handleModeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = GAME_MODES.indexOf(mode);
    const last = GAME_MODES.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % GAME_MODES.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + GAME_MODES.length) % GAME_MODES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    audioManager.playUi("select");
    const next = GAME_MODES[target];
    onModeChange(next);
    modeButtonRefs.current[next]?.focus();
  };

  const bestFor = (m: GameMode): string => {
    const best = allScores[m][0]?.score;
    return best === undefined ? t("start.bestNone") : t("start.best", { score: best });
  };

  /** Best Time Attack medal, derived from the stored top score (no storage). */
  const bestMedal = getMedal(allScores.TIME_ATTACK[0]?.score ?? 0);

  return (
    <>
      <button
        ref={settingsTriggerRef}
        className="settings-gear-btn"
        onClick={onOpenSettings}
        aria-label={t("start.settings")}
        aria-haspopup="dialog"
        inert={settingsOpen}
      >
        <GearIcon />
      </button>

      <div className="screen start-screen" inert={settingsOpen}>
        {/* A plain heading for assistive tech: the tap secret is
            pointer-only (React delegates the listener to the root, so the
            heading is not exposed as clickable); keyboards get the arrow
            sequence instead. */}
        <h1 className="title" onClick={onTitleClick}>
          {t("app.title")}
        </h1>
        <p className="subtitle">{t("start.subtitle")}</p>

        <div
          className="mode-selection"
          role="radiogroup"
          aria-label={t("start.modeGroup")}
          onKeyDown={handleModeKeyDown}
        >
          {GAME_MODES.map((m) => (
            <div className="mode-option" key={m}>
              <button
                ref={(node) => {
                  modeButtonRefs.current[m] = node;
                }}
                className={`mode-btn ${mode === m ? "active" : ""}`}
                onClick={() => onModeChange(m)}
                aria-label={t(`mode.${m}.aria`)}
                role="radio"
                aria-checked={mode === m}
                // Roving tabindex: one tab stop for the group, arrows inside.
                tabIndex={mode === m ? 0 : -1}
              >
                {t(`mode.${m}.label`)}
              </button>
              <span className="mode-best" data-testid={`best-${m}`}>
                {bestMedal && m === "TIME_ATTACK" && <MedalGlyph medal={bestMedal} />}
                {bestFor(m)}
                {bestMedal && m === "TIME_ATTACK" && (
                  <span className="visually-hidden">
                    {t("start.bestMedal", { medal: getMedalTitle(i18n, bestMedal) })}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="mode-description" aria-live="polite">
          {describeMode(i18n, mode)}
        </p>

        {mode === "ZEN" && bestWorldReached > 1 && (
          <div className="practice-picker" role="group" aria-label={t("start.practiceGroup")}>
            <button
              className="practice-prev"
              onClick={() => onPracticeWorldChange(Math.max(1, pickedWorld - 1))}
              disabled={pickedWorld <= 1}
              aria-label={t("start.practicePrev")}
            >
              ‹
            </button>
            <span className="practice-label" aria-live="polite">
              <span className="practice-world">
                {t("start.practiceWorld", { world: pickedWorld })}
              </span>
              <span className="practice-name">
                {pickedWorld === 1
                  ? t("start.practiceFull")
                  : t("start.practiceName", { name: getWorldName(i18n, pickedWorld) })}
              </span>
            </span>
            <button
              className="practice-next"
              onClick={() => onPracticeWorldChange(Math.min(bestWorldReached, pickedWorld + 1))}
              disabled={pickedWorld >= bestWorldReached}
              aria-label={t("start.practiceNext")}
            >
              ›
            </button>
          </div>
        )}

        <button className="start-btn" data-ui-sound="confirm" onClick={onStart}>
          {t("start.play")}
        </button>

        <button
          className="daily-btn"
          data-ui-sound="confirm"
          onClick={onStartDaily}
          aria-label={dailyButton.ariaLabel}
        >
          <span className="daily-btn-title">{t("daily.button")}</span>
          <span className="daily-btn-meta">{dailyButton.meta}</span>
          {(dailyButton.streak || dailyButton.next) && (
            <span className="daily-btn-extra">
              {dailyButton.streak && <StreakChip label={dailyButton.streak} />}
              {dailyButton.next && (
                <span className="daily-next">
                  <Rich
                    template={i18n.template("daily.nextIn")}
                    slots={{ time: <strong>{dailyButton.next.text}</strong> }}
                  />
                </span>
              )}
            </span>
          )}
        </button>

        <div className="start-secondary">
          <button
            ref={(node) => {
              registerPanelTrigger("achievements", node);
            }}
            className="achievements-btn"
            onClick={() => onOpenPanel("achievements")}
            aria-label={t("start.achievementsAria", {
              unlocked: unlockedAchievementCount,
              total: ACHIEVEMENT_COUNT,
            })}
          >
            {t("start.achievements", {
              unlocked: unlockedAchievementCount,
              total: ACHIEVEMENT_COUNT,
            })}
          </button>
          <button
            ref={(node) => {
              registerPanelTrigger("worlds", node);
            }}
            className="worlds-btn"
            onClick={() => onOpenPanel("worlds")}
            aria-label={t("start.worldsAria", {
              revealed: revealedWorldCount,
              total: ATLAS_WORLD_COUNT,
            })}
          >
            {t("start.worlds", { revealed: revealedWorldCount, total: ATLAS_WORLD_COUNT })}
          </button>
          {canInstall && (
            <button
              className="install-btn"
              data-ui-sound="confirm"
              onClick={onInstall}
              aria-label={t("start.installAria")}
            >
              <InstallIcon />
              {t("start.install")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Down arrow into a tray: "install / download", drawn in currentColor. */
function InstallIcon() {
  return (
    <svg
      className="install-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 12.5h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
