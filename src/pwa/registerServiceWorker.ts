/**
 * Registers the build-time service worker (build/sw) for offline play.
 *
 * Registered only in production builds that actually ship `sw.js`: never on
 * the dev server (no worker is emitted there) and never in `VITE_E2E` builds,
 * whose bridge-driven specs must hit the network, not a cache. The offline
 * spec (tests/offline) runs against the plain production build instead.
 * A failure is logged and swallowed: the game works without a worker.
 */

export interface ServiceWorkerEnv {
  readonly PROD: boolean;
  readonly BASE_URL: string;
  readonly VITE_E2E?: string;
}

type ServiceWorkerHost = Pick<Navigator, "serviceWorker">;

export const shouldRegisterServiceWorker = (
  env: ServiceWorkerEnv,
  nav: Partial<ServiceWorkerHost> | undefined,
): nav is ServiceWorkerHost =>
  env.PROD && env.VITE_E2E !== "true" && !!nav && "serviceWorker" in nav;

export const registerServiceWorker = async (
  env: ServiceWorkerEnv = import.meta.env,
  nav: Partial<ServiceWorkerHost> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
  warn: (message: string, error: unknown) => void = console.warn,
): Promise<ServiceWorkerRegistration | null> => {
  if (!shouldRegisterServiceWorker(env, nav)) return null;
  // BASE_URL is the Vite `base` ("/jokarikara/"): the worker sits at its
  // root and controls exactly the app, nothing else on the origin.
  const scope = env.BASE_URL.endsWith("/") ? env.BASE_URL : `${env.BASE_URL}/`;
  try {
    return await nav.serviceWorker.register(`${scope}sw.js`, { scope });
  } catch (error) {
    // Private mode, disabled storage, insecure origin...: play online-only.
    warn("[service-worker] registration failed; offline play unavailable", error);
    return null;
  }
};
