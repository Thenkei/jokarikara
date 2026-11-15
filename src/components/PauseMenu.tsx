import type { RefObject } from "react";
import { useI18n } from "../i18n/context";
import { GearIcon } from "./SettingsSheet";

interface PauseMenuProps {
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
 * Pause menu dialog: RESUME (focused on open), RESTART, Zen FINISH RUN with
 * its armed state, SETTINGS and MAIN MENU. Presentational: App owns pausing,
 * the finish confirm and the Escape/P keys (window listener).
 */
export function PauseMenu({
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
