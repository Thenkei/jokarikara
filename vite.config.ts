import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  base: "/jokarikara/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**"],
    setupFiles: ["vitest-canvas-mock"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
