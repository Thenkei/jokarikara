/**
 * True only in E2E builds (`VITE_E2E=true`, see playwright.config.ts).
 *
 * Written as a plain `import.meta.env.VITE_E2E` read on purpose: Vite inlines
 * it at build time, so in production the function returns a constant false
 * and the bundler drops every E2E-only branch (test bridge, audio call
 * recorder, deterministic seeds). Optional chaining or a `typeof
 * import.meta` guard would defeat that inlining and ship the bridge.
 * Evaluated per call, so unit tests can still `vi.stubEnv("VITE_E2E", ...)`.
 */
export const isE2eMode = (): boolean => import.meta.env.VITE_E2E === "true";
