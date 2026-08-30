import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * The engine must stay pure: derived values and phase transitions are plain
 * functions over a Campaign, unit-testable with zero DOM. Data files hold rules
 * as data and nothing else. Both are enforced here rather than by convention,
 * so breaking the boundary fails `npm run lint` instead of rotting quietly.
 */
const PURE_LAYERS = ['src/engine/**/*.ts', 'src/data/**/*.ts'];

const ENGINE_IS_PURE =
  'src/engine and src/data must not depend on React or the UI layer — they are pure functions over a Campaign. Move the rendering concern into src/ui instead.';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  {
    files: PURE_LAYERS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: ENGINE_IS_PURE },
            { group: ['**/ui/**', '**/ui'], message: ENGINE_IS_PURE },
          ],
        },
      ],
    },
  },

  {
    files: ['vite.config.ts', 'eslint.config.js', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
