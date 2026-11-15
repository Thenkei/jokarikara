import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { useI18n } from "../i18n/context";
import { LANGUAGE_NAMES, LANGUAGE_SETTINGS, type LanguageSetting } from "../i18n/types";

export type SettingId = "fx" | "sound" | "music" | "haptics" | "timingCue";

/** Player-facing values: every switch reads "on = feature active". */
export interface SettingsValues {
  /** Full visual effects (the inverse of the stored `reducedFx`). */
  fx: boolean;
  /** Sound on (the inverse of the stored `muted`). */
  sound: boolean;
  music: boolean;
  haptics: boolean;
  timingCue: boolean;
}

interface SettingsSheetProps {
  values: SettingsValues;
  /** False when the device cannot vibrate: the row stays, disabled, with why. */
  hapticsSupported: boolean;
  onToggle: (id: SettingId) => void;
  /** Stored language preference ("auto" follows the browser). */
  language: LanguageSetting;
  onLanguageChange: (language: LanguageSetting) => void;
  onClose: () => void;
  /**
   * Where focus goes back on close (the gear that opened the sheet). Falls
   * back to whatever was focused when the sheet opened.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

interface SettingRow {
  id: SettingId;
  title: string;
  description: string;
  /**
   * Delegated menu sound (see App's handleUiClickCapture): "none" for the
   * switches that give their own feedback (sound coming back, cue preview).
   */
  uiSound?: "none";
  disabled?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Geometric gear (8 square teeth), drawn with currentColor. */
export function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19.76 10.07 L22.36 10.28 L22.36 13.72 L19.76 13.93 L18.85 16.13 L20.54 18.10 L18.10 20.54 L16.13 18.85 L13.93 19.76 L13.72 22.36 L10.28 22.36 L10.07 19.76 L7.87 18.85 L5.90 20.54 L3.46 18.10 L5.15 16.13 L4.24 13.93 L1.64 13.72 L1.64 10.28 L4.24 10.07 L5.15 7.87 L3.46 5.90 L5.90 3.46 L7.87 5.15 L10.07 4.24 L10.28 1.64 L13.72 1.64 L13.93 4.24 L16.13 5.15 L18.10 3.46 L20.54 5.90 L18.85 7.87 Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

/**
 * Modal settings sheet (bottom sheet on phones, centred dialog on larger
 * screens). Owns its keyboard contract so callers only decide when it is
 * mounted: focus moves to the first switch, Tab wraps inside, Escape closes
 * without reaching the game's own Escape (pause/resume) handler, and focus
 * returns to the opener on unmount. The caller makes the background `inert`.
 */
export function SettingsSheet({
  values,
  hapticsSupported,
  onToggle,
  language,
  onLanguageChange,
  onClose,
  returnFocusRef,
}: SettingsSheetProps) {
  const { t } = useI18n();
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const languageTitleId = `${idPrefix}-language-title`;
  const languageDescId = `${idPrefix}-language-desc`;
  const languageRefs = useRef<Partial<Record<LanguageSetting, HTMLButtonElement | null>>>({});

  /** WAI-ARIA radio group keys: arrows move and select, Home/End jump. */
  const handleLanguageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = LANGUAGE_SETTINGS.indexOf(language);
    const count = LANGUAGE_SETTINGS.length;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % count
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    const next = LANGUAGE_SETTINGS[target];
    onLanguageChange(next);
    languageRefs.current[next]?.focus();
  };
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const panel = panelRef.current;
    const opener =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    // preventScroll: on short phones the sheet scrolls; keep its title in view.
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });

    // Capture phase on document: runs before App's window-level key handler,
    // so stopping Escape here can never also resume/close the pause menu.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (event.shiftKey ? !inside || active === first : !inside || active === last) {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Passive cleanup runs after the commit that removed `inert` from the
      // background, so the opener is focusable again by now.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // A ref object is stable: this runs once per opening (mount/unmount).
  }, [returnFocusRef]);

  const rows: SettingRow[] = [
    {
      id: "fx",
      title: t("settings.fx.title"),
      description: t("settings.fx.description"),
    },
    {
      id: "sound",
      title: t("settings.sound.title"),
      description: t("settings.sound.description"),
      uiSound: "none",
    },
    {
      id: "music",
      title: t("settings.music.title"),
      description: t("settings.music.description"),
    },
    {
      id: "haptics",
      title: t("settings.haptics.title"),
      description: hapticsSupported
        ? t("settings.haptics.description")
        : t("settings.haptics.unsupported"),
      disabled: !hapticsSupported,
    },
    {
      id: "timingCue",
      title: t("settings.timingCue.title"),
      description: t("settings.timingCue.description"),
      uiSound: "none",
    },
  ];

  return (
    <div className="settings-layer">
      {/* Pointer-only dismissal; keyboard users have Escape and DONE. */}
      <div className="settings-scrim" aria-hidden="true" onClick={onClose} />
      <section
        ref={panelRef}
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <h2 id={headingId} className="settings-heading">
          {t("settings.title")}
        </h2>
        <ul className="settings-list">
          {rows.map((row) => {
            const checked = row.disabled ? false : values[row.id];
            const titleId = `${idPrefix}-${row.id}-title`;
            const descId = `${idPrefix}-${row.id}-desc`;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  role="switch"
                  className="settings-switch"
                  data-setting={row.id}
                  data-ui-sound={row.uiSound}
                  aria-checked={checked}
                  aria-labelledby={titleId}
                  aria-describedby={descId}
                  disabled={row.disabled}
                  onClick={() => onToggle(row.id)}
                >
                  <span className="settings-switch-text">
                    <span id={titleId} className="settings-switch-title">
                      {row.title}
                    </span>
                    <span id={descId} className="settings-switch-desc">
                      {row.description}
                    </span>
                  </span>
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                </button>
              </li>
            );
          })}
          <li className="settings-language">
            <span className="settings-switch-text">
              <span id={languageTitleId} className="settings-switch-title">
                {t("settings.language.title")}
              </span>
              <span id={languageDescId} className="settings-switch-desc">
                {t("settings.language.description")}
              </span>
            </span>
            <div
              className="settings-segmented"
              role="radiogroup"
              aria-labelledby={languageTitleId}
              aria-describedby={languageDescId}
              onKeyDown={handleLanguageKeyDown}
            >
              {LANGUAGE_SETTINGS.map((option) => {
                const checked = option === language;
                return (
                  <button
                    key={option}
                    ref={(node) => {
                      languageRefs.current[option] = node;
                    }}
                    type="button"
                    role="radio"
                    className="settings-segment"
                    data-language={option}
                    aria-checked={checked}
                    // Roving tabindex: one tab stop for the group, arrows inside.
                    tabIndex={checked ? 0 : -1}
                    // A language's own name is read in that language.
                    lang={option === "auto" ? undefined : option}
                    onClick={() => onLanguageChange(option)}
                  >
                    {option === "auto" ? t("settings.language.auto") : LANGUAGE_NAMES[option]}
                  </button>
                );
              })}
            </div>
          </li>
        </ul>
        <button className="settings-done-btn" data-ui-sound="back" onClick={onClose}>
          {t("settings.done")}
        </button>
      </section>
    </div>
  );
}
