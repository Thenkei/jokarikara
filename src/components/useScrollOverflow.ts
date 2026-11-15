import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * True while the element's content overflows it vertically, so it scrolls.
 * Measured before paint after every render (content can change with props)
 * and again whenever the element or one of its children resizes (viewport,
 * rotation, late font loads). Without ResizeObserver (jsdom) it is only
 * measured on render.
 */
export function useScrollOverflow(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);

  // No deps on purpose: a re-render can add or drop a card. setState bails
  // out when the answer is unchanged, so this never loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(isOverflowing(el));
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setOverflows(isOverflowing(el)));
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [ref]);

  return overflows;
}

/** 1 px slack: subpixel layout can report scrollHeight one above clientHeight. */
const isOverflowing = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 1;
