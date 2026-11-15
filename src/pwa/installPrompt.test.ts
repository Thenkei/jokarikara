import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  promptInstall,
  resetInstallPromptForTests,
  useCanInstall,
  type BeforeInstallPromptEvent,
} from "./installPrompt";

/** A window stand-in: real events, a display-mode answer we control. */
const fakeWindow = (standalone = false) => {
  const target = new EventTarget();
  return Object.assign(target, {
    matchMedia: () => ({ matches: standalone }),
    navigator: {},
  }) as unknown as Window;
};

const installEvent = (outcome: "accepted" | "dismissed" = "accepted") => {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
};

describe("install prompt", () => {
  afterEach(() => resetInstallPromptForTests());

  it("keeps the browser's offer and shows it once, on demand", async () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    const { result } = renderHook(() => useCanInstall());
    expect(result.current).toBe(false);

    const { event, prompt } = installEvent("accepted");
    act(() => {
      win.dispatchEvent(event);
    });
    // Kept for the game's own button: the browser's mini-infobar is suppressed.
    expect(event.defaultPrevented).toBe(true);
    expect(result.current).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await promptInstall();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("accepted");
    // An event prompts once: the offer is spent.
    expect(result.current).toBe(false);
    expect(await promptInstall()).toBe("unavailable");
  });

  it("drops the offer once the app is installed", () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    const { result } = renderHook(() => useCanInstall());
    act(() => {
      win.dispatchEvent(installEvent().event);
    });
    expect(result.current).toBe(true);
    act(() => {
      win.dispatchEvent(new Event("appinstalled"));
    });
    expect(result.current).toBe(false);
  });

  it("never offers to install the installed app itself", () => {
    const win = fakeWindow(true);
    captureInstallPrompt(win);
    const { result } = renderHook(() => useCanInstall());
    act(() => {
      win.dispatchEvent(installEvent().event);
    });
    expect(result.current).toBe(false);
  });

  it("reports a failed prompt as unavailable", async () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    const { event, prompt } = installEvent();
    prompt.mockRejectedValueOnce(new Error("not allowed"));
    win.dispatchEvent(event);
    expect(await promptInstall()).toBe("unavailable");
  });
});
