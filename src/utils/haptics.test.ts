import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, isHapticsSupported, setHapticsEnabled } from "./haptics";

describe("haptics", () => {
  afterEach(() => {
    setHapticsEnabled(true);
    vi.unstubAllGlobals();
  });

  it("vibrates when enabled and supported", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(isHapticsSupported()).toBe(true);
    haptic("tap");
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("stays still when the player turned haptics off", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    setHapticsEnabled(false);
    haptic("fail");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("reports unsupported devices and never throws", () => {
    vi.stubGlobal("navigator", {});
    expect(isHapticsSupported()).toBe(false);
    expect(() => haptic("perfect")).not.toThrow();
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(() => haptic("perfect")).not.toThrow();
  });
});
