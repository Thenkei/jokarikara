import { useCallback, useEffect, useRef, useState } from "react";
import { FINISH_CONFIRM_WINDOW_MS, stepFinishConfirm } from "./finishRun";

interface FinishConfirmOptions {
  /** First press: the button is armed ("TAP AGAIN TO FINISH"). */
  onArm: () => void;
  /** Deliberate second press inside the window: end the run. */
  onConfirm: () => void;
}

export interface FinishConfirm {
  /** Armed after a first press, until the window expires or it is disarmed. */
  readonly armed: boolean;
  /** Back to plain FINISH RUN (menu closed, run over). Stable identity. */
  readonly disarm: () => void;
  /** FINISH RUN press handler. */
  readonly press: () => void;
}

/**
 * Zen FINISH RUN, two presses: the first arms the button for
 * FINISH_CONFIRM_WINDOW_MS, a deliberate second one (not a double click, see
 * stepFinishConfirm) confirms. The arming time (monotonic) lives in a ref for
 * the press handler; the disarm timer is cleared on unmount.
 */
export const useFinishConfirm = ({ onArm, onConfirm }: FinishConfirmOptions): FinishConfirm => {
  const [armed, setArmed] = useState(false);
  const armedAtRef = useRef<number | null>(null);
  const disarmTimeoutRef = useRef<number | null>(null);

  const disarm = useCallback(() => {
    armedAtRef.current = null;
    if (disarmTimeoutRef.current !== null) {
      window.clearTimeout(disarmTimeoutRef.current);
      disarmTimeoutRef.current = null;
    }
    setArmed(false);
  }, []);

  useEffect(
    () => () => {
      if (disarmTimeoutRef.current !== null) {
        window.clearTimeout(disarmTimeoutRef.current);
      }
    },
    [],
  );

  const press = () => {
    const now = performance.now();
    const step = stepFinishConfirm(armedAtRef.current, now);
    if (step === "wait") return;
    if (step === "arm") {
      armedAtRef.current = now;
      setArmed(true);
      if (disarmTimeoutRef.current !== null) {
        window.clearTimeout(disarmTimeoutRef.current);
      }
      disarmTimeoutRef.current = window.setTimeout(() => {
        disarmTimeoutRef.current = null;
        armedAtRef.current = null;
        setArmed(false);
      }, FINISH_CONFIRM_WINDOW_MS);
      onArm();
      return;
    }
    disarm();
    onConfirm();
  };

  return { armed, disarm, press };
};
