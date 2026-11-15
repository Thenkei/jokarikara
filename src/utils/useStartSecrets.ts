import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { audioManager } from "./audioManager";
import { MONO_SEQUENCE, registerTap, stepSequence } from "./secrets";

/** Start backdrop flourish length: the CSS burst plus its last layer's delay. */
const FLOURISH_MS = 1900;

interface StartSecretsOptions {
  /**
   * Changes whenever the player leaves the start menu (screen or panel):
   * secret inputs only count on the menu itself, a half-entered sequence or
   * tap run is forgotten.
   */
  resetKey: string;
  /** The Mono look was toggled by the arrow sequence (announce it). */
  onMonoChange: (mono: boolean) => void;
  /** Either secret was found (unlocks the hidden achievement). */
  onFound: () => void;
}

export interface StartSecrets {
  /** Session-only Mono look (never persisted: a reload brings colours back). */
  readonly mono: boolean;
  /** The title-tap backdrop flourish is playing. */
  readonly flourishing: boolean;
  /** Start screen title click handler (7 quick taps). */
  readonly handleTitleClick: (event: ReactMouseEvent<HTMLHeadingElement>) => void;
  /**
   * Feeds a start-menu keydown to the arrow sequence. Observes only (no
   * preventDefault): arrows keep driving the mode radio group.
   */
  readonly observeKey: (event: KeyboardEvent) => void;
}

/**
 * Start screen easter eggs (see utils/secrets): 7 quick title taps play the
 * backdrop flourish and a chime; the arrow sequence toggles the Mono look.
 */
export const useStartSecrets = ({
  resetKey,
  onMonoChange,
  onFound,
}: StartSecretsOptions): StartSecrets => {
  const [mono, setMono] = useState(false);
  const [flourishing, setFlourishing] = useState(false);
  const secretProgressRef = useRef(0);
  const titleTapsRef = useRef<readonly number[]>([]);
  const flourishTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    secretProgressRef.current = 0;
    titleTapsRef.current = [];
  }, [resetKey]);

  useEffect(
    () => () => {
      if (flourishTimeoutRef.current !== null) {
        window.clearTimeout(flourishTimeoutRef.current);
      }
    },
    [],
  );

  const handleTitleClick = (event: ReactMouseEvent<HTMLHeadingElement>) => {
    // A celebration already playing swallows extra taps (no restart mid-burst).
    if (flourishing) return;
    const step = registerTap(titleTapsRef.current, event.timeStamp);
    titleTapsRef.current = step.taps;
    if (!step.triggered) return;
    // Click (not pointerdown) so the 7th tap is a user activation on touch
    // devices too, and the audio context may start. Silent when muted.
    audioManager.playChime();
    audioManager.resume();
    setFlourishing(true);
    flourishTimeoutRef.current = window.setTimeout(() => {
      flourishTimeoutRef.current = null;
      setFlourishing(false);
    }, FLOURISH_MS);
    onFound();
  };

  /** Arrow sequence entered: toggle the Mono look (keyboard-reachable egg). */
  const toggleMono = () => {
    const next = !mono;
    setMono(next);
    audioManager.playUi(next ? "confirm" : "back");
    onMonoChange(next);
    onFound();
  };

  const observeKey = (event: KeyboardEvent) => {
    const step = stepSequence(MONO_SEQUENCE, secretProgressRef.current, event);
    secretProgressRef.current = step.progress;
    if (step.matched) toggleMono();
  };

  return { mono, flourishing, handleTitleClick, observeKey };
};
