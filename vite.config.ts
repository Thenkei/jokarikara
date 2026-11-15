import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { serviceWorkerPlugin } from "./build/sw/plugin.ts";

// https://vite.dev/config/
export default defineConfig({
  base: "/jokarikara/",
  // serviceWorkerPlugin: emits dist/sw.js for offline play (build only).
  plugins: [react(), serviceWorkerPlugin()],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**"],
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "build/**/*.test.ts"],
  },
});
