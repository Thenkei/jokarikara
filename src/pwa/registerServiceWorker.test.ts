import { describe, expect, it, vi } from "vitest";
import {
  registerServiceWorker,
  shouldRegisterServiceWorker,
  type ServiceWorkerEnv,
} from "./registerServiceWorker";

const PROD: ServiceWorkerEnv = { PROD: true, BASE_URL: "/jokarikara/" };

const fakeNavigator = (register: ServiceWorkerContainer["register"]) => ({
  serviceWorker: { register } as unknown as ServiceWorkerContainer,
});

describe("shouldRegisterServiceWorker", () => {
  const nav = fakeNavigator(vi.fn());

  it("registers in a production build with service worker support", () => {
    expect(shouldRegisterServiceWorker(PROD, nav)).toBe(true);
  });

  it("skips the dev server", () => {
    expect(shouldRegisterServiceWorker({ ...PROD, PROD: false }, nav)).toBe(false);
  });

  it("skips VITE_E2E builds (bridge specs must not hit a cache)", () => {
    expect(shouldRegisterServiceWorker({ ...PROD, VITE_E2E: "true" }, nav)).toBe(false);
    expect(shouldRegisterServiceWorker({ ...PROD, VITE_E2E: "false" }, nav)).toBe(true);
  });

  it("skips browsers without service workers", () => {
    expect(shouldRegisterServiceWorker(PROD, {})).toBe(false);
    expect(shouldRegisterServiceWorker(PROD, undefined)).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  it("registers sw.js at the base root, scoped to the base", async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);

    await expect(registerServiceWorker(PROD, fakeNavigator(register))).resolves.toBe(
      registration,
    );
    expect(register).toHaveBeenCalledWith("/jokarikara/sw.js", { scope: "/jokarikara/" });
  });

  it("tolerates a base without a trailing slash", async () => {
    const register = vi.fn().mockResolvedValue({});
    await registerServiceWorker({ ...PROD, BASE_URL: "/jokarikara" }, fakeNavigator(register));
    expect(register).toHaveBeenCalledWith("/jokarikara/sw.js", { scope: "/jokarikara/" });
  });

  it("does nothing when the guard says no", async () => {
    const register = vi.fn();
    await expect(
      registerServiceWorker({ ...PROD, PROD: false }, fakeNavigator(register)),
    ).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("logs and swallows registration failures", async () => {
    const error = new DOMException("blocked", "SecurityError");
    const warn = vi.fn();

    await expect(
      registerServiceWorker(PROD, fakeNavigator(vi.fn().mockRejectedValue(error)), warn),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("registration failed"), error);
  });
});
