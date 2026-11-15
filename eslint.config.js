import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Service worker template (plain JS, runs in the worker global scope).
    files: ['build/sw/sw.template.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
  {
    // Build-time code (Vite plugins) runs in Node.
    files: ['build/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright E2E tests: not React code.
    // - Fixtures receive a `use` callback that the React hooks rule mistakes for React's `use()`.
    // - Playwright reads the first parameter's destructuring to resolve fixture deps,
    //   so fixtures with no deps must be written as `async ({}, use) => …`.
    files: ['tests/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },
])
