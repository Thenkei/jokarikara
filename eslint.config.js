import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
