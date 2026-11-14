import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getAchievement, type AchievementId } from "../progression/achievements";

/** How long one toast stays on screen. */
export const ACHIEVEMENT_TOAST_MS = 2600;
/** Shorter display while more toasts are waiting, so a burst drains quickly. */
export const ACHIEVEMENT_TOAST_BUSY_MS = 1700;

export interface AchievementToasterHandle {
  enqueue: (ids: readonly AchievementId[]) => void;
}

interface AchievementToasterProps {
  /** Fired once per toast when it appears (sound cue). */
  onShow?: (id: AchievementId) => void;
}

interface QueuedToast {
  key: number;
  id: AchievementId;
}

/**
 * Bottom-of-screen, non-blocking unlock toasts, shown one at a time.
 *
 * Owns its queue so enqueueing re-renders only this component, never the
 * game HUD; the region is `pointer-events: none` so taps reach the canvas.
 */
export const AchievementToaster = forwardRef<
  AchievementToasterHandle,
  AchievementToasterProps
>(({ onShow }, ref) => {
  const [queue, setQueue] = useState<readonly QueuedToast[]>([]);
  const nextKeyRef = useRef(0);
  const lastShownKeyRef = useRef<number | null>(null);
  const onShowRef = useRef(onShow);

  useEffect(() => {
    onShowRef.current = onShow;
  });

  useImperativeHandle(
    ref,
    () => ({
      enqueue: (ids) => {
        if (ids.length === 0) return;
        const items = ids.map((id) => ({ key: nextKeyRef.current++, id }));
        setQueue((current) => [...current, ...items]);
      },
    }),
    [],
  );

  const current = queue[0];
  const hasBacklog = queue.length > 1;

  useEffect(() => {
    if (!current) return;
    // Guard so StrictMode's effect replay does not double the cue.
    if (lastShownKeyRef.current !== current.key) {
      lastShownKeyRef.current = current.key;
      onShowRef.current?.(current.id);
    }
    const timeout = window.setTimeout(
      () => setQueue((items) => items.slice(1)),
      hasBacklog ? ACHIEVEMENT_TOAST_BUSY_MS : ACHIEVEMENT_TOAST_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [current, hasBacklog]);

  return (
    <div className="achievement-toast-region" role="status" aria-live="polite">
      {current && (
        <div key={current.key} className="achievement-toast">
          <span className="achievement-toast-label">ACHIEVEMENT</span>
          <span className="achievement-toast-sep" aria-hidden="true">
            {" · "}
          </span>
          <span className="achievement-toast-title">
            {getAchievement(current.id).title}
          </span>
        </div>
      )}
    </div>
  );
});

AchievementToaster.displayName = "AchievementToaster";
