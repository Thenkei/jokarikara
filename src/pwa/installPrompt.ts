import { useSyncExternalStore } from "react";

/**
 * "Install the app" offer, for browsers that announce installability with
 * `beforeinstallprompt` (Chrome, Edge, Samsung Internet; desktop and
 * Android). Safari has no such event: nothing is shown there.
 *
 * The event can fire before React mounts, so `captureInstallPrompt` runs
 * from main.tsx and keeps the deferred event in this module; components read
 * it through `useInstallPrompt` (useSyncExternalStore). An event can prompt
 * once: after the choice, or once the app is installed, the offer is gone.
 */

/** The non-standard event Chromium fires when the page is installable. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const setDeferred = (event: BeforeInstallPromptEvent | null) => {
  deferred = event;
  notify();
};

/** Already running as an installed app: never offer to install it again. */
export const isStandalone = (win: Window = window): boolean =>
  win.matchMedia?.("(display-mode: standalone)").matches === true ||
  (win.navigator as Navigator & { standalone?: boolean }).standalone === true;

let captured = false;

/**
 * Starts listening (idempotent). Keeps the event instead of letting the
 * browser show its own mini-infobar, so the offer appears where the game
 * puts it.
 */
export const captureInstallPrompt = (win: Window = window): void => {
  if (captured) return;
  captured = true;
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isStandalone(win)) return;
    setDeferred(event as BeforeInstallPromptEvent);
  });
  win.addEventListener("appinstalled", () => setDeferred(null));
};

/** Shows the browser's install dialog; the offer is spent either way. */
export const promptInstall = async (): Promise<InstallOutcome> => {
  const event = deferred;
  if (!event) return "unavailable";
  setDeferred(null);
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => deferred !== null;
const getServerSnapshot = () => false;

/** Whether the browser currently offers installation. */
export const useCanInstall = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/** Test-only: forget the captured state between unit tests. */
export const resetInstallPromptForTests = (): void => {
  deferred = null;
  captured = false;
  listeners.clear();
};
