import type { RefObject } from "react";
import { useI18n } from "../i18n/context";
import { GearIcon } from "./SettingsSheet";

/** Where the paused run stands, shown under the title (the HUD is dimmed). */
export interface PausedRunStatus {
  score: number;
  world: number;
  level: number;
  /** Time Attack seconds left; null in other modes. */
  timeRemaining: number | null;
  /** Zen lives left; null in other modes. */
  zenLives: number | null;
}

interface PauseMenuProps {
  status: PausedRunStatus;
  /** Zen only: the run can be ended on purpose (FINISH RUN). */
  canFinish: boolean;
  /** FINISH RUN was pressed once and waits for the confirming press. */
  finishArmed: boolean;
  onResume: () => void;
  onRestart: () => void;
  onFinishPress: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
  /** The SETTINGS button, so the settings sheet can return focus to it. */
  settingsTriggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Pause menu dialog: the run's status line, RESUME (focused on open), RESTART, Zen FINISH RUN with
 * its armed state, SETTINGS and MAIN MENU. Presentational: App owns pausing,
 * the finish confirm and the Escape/P keys (window listener).
 */
export function PauseMenu({
  status,
  canFinish,
  finishArmed,
  onResume,
  onRestart,
  onFinishPress,
  onOpenSettings,
  onMainMenu,
  settingsTriggerRef,
}: PauseMenuProps) {
  const { t } = useI18n();
  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-label={t("pause.dialog")}>
      <h2 className="pause-title">{t("pause.title")}</h2>
      {/* Score, place and the mode's vital: enough to choose RESUME or RESTART. */}
      <p className="pause-status" data-testid="pause-status">
        <span className="pause-status-score">{t("pause.score", { score: status.score })}</span>
        <span>{t("hud.world", { world: status.world })}</span>
        <span>{t("hud.level", { level: status.level })}</span>
        {status.timeRemaining !== null && (
          <span>{t("hud.timer", { seconds: Math.max(0, Math.ceil(status.timeRemaining)) })}</span>
        )}
        {status.zenLives !== null && <span>{t("hud.lives", { lives: status.zenLives })}</span>}
      </p>
      <button className="pause-resume-btn" data-ui-sound="confirm" onClick={onResume} autoFocus>
        {t("pause.resume")}
      </button>
      <button className="pause-restart-btn menu-btn" data-ui-sound="confirm" onClick={onRestart}>
        {t("pause.restart")}
      </button>
      {canFinish && (
        <button
          className={`pause-finish-btn menu-btn${finishArmed ? " armed" : ""}`}
          // Armed: the finish cue replaces the generic click.
          data-ui-sound={finishArmed ? "none" : "select"}
          onClick={onFinishPress}
          onKeyDown={(event) => {
            // A held Enter repeats clicks: it must not arm and confirm.
            if (event.repeat && event.key === "Enter") event.preventDefault();
          }}
        >
          {t(finishArmed ? "pause.finishArmed" : "pause.finish")}
        </button>
      )}
      <button
        ref={settingsTriggerRef}
        className="pause-settings-btn menu-btn"
        onClick={onOpenSettings}
        aria-haspopup="dialog"
      >
        <GearIcon />
        {t("pause.settings")}
      </button>
      <button className="pause-menu-btn menu-btn" data-ui-sound="back" onClick={onMainMenu}>
        {t("pause.mainMenu")}
      </button>
    </div>
  );
}
