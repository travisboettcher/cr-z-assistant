import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

/**
 * The engine must stay pure: derived values and phase transitions are plain
 * functions over a Campaign, unit-testable with zero DOM. Data files hold rules
 * as data and nothing else, and sit *below* the engine — they may not import
 * from it. All three are enforced here rather than by convention, so breaking a
 * boundary fails `npm run lint` instead of rotting quietly.
 */
const PURE_LAYERS = ['src/engine/**/*.ts', 'src/data/**/*.ts'];

const ENGINE_IS_PURE =
  'src/engine and src/data must not depend on React or the UI layer — they are pure functions over a Campaign. Move the rendering concern into src/ui instead.';

/**
 * The contract `base.ts` states above `occupants` and nothing enforced until
 * round two found six callers breaking it (#138, #139).
 *
 * Two campaign-level rules — the Hydroelectric Dam's blanket supply and "a
 * point with no generator behind it does not count" — live only in
 * `suppliedOccupants`, because both need the roster and `base.ts` cannot ask
 * for it. A caller that reads the raw list gets neither, silently, while its
 * own tests go on passing. The exceptions are the four modules the resolution
 * is *built from*: `base.ts` defines it, `utilities.ts` resolves it,
 * `assignments.ts` computes the staffed Score it resolves against, and
 * `build.ts` asks the narrower layout question the contract allows.
 */
const OCCUPANTS_MUST_BE_RESOLVED =
  "Campaign-level callers take suppliedOccupants(campaign), not occupants(base) — see the contract above `occupants` in src/engine/base.ts and issue #138. occupants() reads a slot's stored Power and Water flags, which is what a point nobody is generating still looks like.";

/** Where the resolution is built, and so the only places that may read it raw. */
const RESOLUTION_BUILT_HERE = [
  'src/engine/base.ts',
  'src/engine/utilities.ts',
  'src/engine/assignments.ts',
  'src/engine/build.ts',
  // The two that ask `occupantAt` the narrower layout question `build.ts` is
  // here for: what is standing in this slot, and what does its facility offer.
  // A price and a catalogue lookup, neither of which a utility can change —
  // `projects.ts` asks what an upgrade replaces and `upgrade.ts` asks which
  // upgrades a facility has.
  'src/engine/projects.ts',
  'src/engine/upgrade.ts',
];

/** Tests name the raw list on purpose — `base.test.ts` is its own suite. */
const TESTS = ['**/*.test.ts', '**/*.test.tsx'];

/**
 * Both names, because `occupantAt` is a thin wrapper returning the same raw
 * `Occupant` and the rule that named only `occupants` covered about half the
 * surface it claimed (#166). A caller importing the wrapper could read `.power`
 * and `.water` and call `staffCapacity` with lint exiting 0 — no live violation
 * at the time, but the rule exists to make the class unrepresentable and it
 * did not.
 */
const RAW_OCCUPANTS = {
  group: ['**/base', '**/engine/base'],
  importNames: ['occupants', 'occupantAt'],
  message: OCCUPANTS_MUST_BE_RESOLVED,
};

/**
 * Every directory whose modules hold a whole campaign, which is every directory
 * where reading a slot's stored flags is the mistake this rule is about.
 *
 * The rule was attached to `src/engine` and `src/ui` only. `src/state` and
 * `src/persistence` were uncovered, and `campaignStore.ts` is campaign-level by
 * its own behaviour — it already calls `suppliedOccupants` where it resolves a
 * claim. A probe importing `occupants` there linted clean (#166).
 */
const CAMPAIGN_LEVEL = [
  'src/engine/**/*.ts',
  'src/ui/**/*.{ts,tsx}',
  'src/state/**/*.{ts,tsx}',
  'src/persistence/**/*.ts',
];

const NO_REACT_IN_ENGINE = [
  { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: ENGINE_IS_PURE },
  { group: ['**/ui/**', '**/ui'], message: ENGINE_IS_PURE },
];

const DATA_IS_THE_BOTTOM =
  'src/data must not import from src/engine — the engine is a set of functions over the rules, not where they live. If the engine holds something a rules file needs, move it down into src/data (materials, origins and the campaign phases all made that trip).';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // Stryker's sandbox is a whole second copy of `src`, so linting during a
      // mutation run otherwise reports every file twice and fails on the copy
      // for being outside the tsconfig root.
      '.stryker-tmp/**',
      'reports/**',
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
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react/*', 'react-dom/*'], message: ENGINE_IS_PURE },
            { group: ['**/ui/**', '**/ui'], message: ENGINE_IS_PURE },
            { group: ['**/engine/**', '**/engine'], message: DATA_IS_THE_BOTTOM },
          ],
        },
      ],
    },
  },

  /*
   * The two halves of the same contract, in two blocks because
   * `no-restricted-imports` replaces rather than merges: an engine module also
   * has React forbidden, and a UI one very much does not.
   */
  {
    files: ['src/engine/**/*.ts'],
    ignores: [...RESOLUTION_BUILT_HERE, ...TESTS],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...NO_REACT_IN_ENGINE, RAW_OCCUPANTS] }],
    },
  },

  {
    files: CAMPAIGN_LEVEL.filter((glob) => !glob.startsWith('src/engine/')),
    ignores: TESTS,
    rules: {
      'no-restricted-imports': ['error', { patterns: [RAW_OCCUPANTS] }],
    },
  },

  {
    files: ['vite.config.ts', 'eslint.config.js', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
