import { useCallback, useEffect, useRef, useState } from "react";

/** How long a reveal keeps the secondary HUD row (STYLE/COMBO, Zen controls) up. */
const HUD_REVEAL_DURATION_MS = 2000;

export interface SecondaryHud {
  /** Row 3 of the HUD is revealed. */
  readonly visible: boolean;
  /** Shows the row and (re)starts its hide timer. Stable identity. */
  readonly reveal: () => void;
  /** Hides the row at once and cancels the timer. Stable identity. */
  readonly hide: () => void;
}

/**
 * Auto-revealed secondary HUD row: every reveal shows it for
 * HUD_REVEAL_DURATION_MS (one timer at a time), cleared on unmount.
 */
export const useSecondaryHud = (): SecondaryHud => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    setVisible(true);
    clearHideTimeout();
    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      timeoutRef.current = null;
    }, HUD_REVEAL_DURATION_MS);
  }, [clearHideTimeout]);

  const hide = useCallback(() => {
    clearHideTimeout();
    setVisible(false);
  }, [clearHideTimeout]);

  useEffect(() => clearHideTimeout, [clearHideTimeout]);

  return { visible, reveal, hide };
};
