import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the **built** bundle, not the dev server.
 *
 * The artifact that ships is what should be proven to work: `vite preview`
 * serves exactly what a container or a static host would. A dev-server pass
 * would leave the build itself untested, which is where base paths, asset URLs
 * and minification actually go wrong.
 *
 * `E2E_BASE_URL` lets the same specs run against something already serving the
 * app — the Docker image in Z0-11 (#11) — instead of starting a preview here.
 */
const externalBaseUrl = process.env.E2E_BASE_URL;

/**
 * Some sandboxes ship a Chromium that does not match the build this Playwright
 * version would download. `E2E_CHROMIUM_PATH` points at that existing binary so
 * the suite runs without a download; CI leaves it unset and uses
 * `playwright install chromium` as normal.
 */
const chromiumPath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'list' : 'line',

  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      /*
       * A portrait tablet, because that is the device this app is for — used
       * standing next to a table with miniatures on it. Testing at desktop
       * width would miss exactly the layout and touch-target problems worth
       * catching.
       *
       * Chromium at tablet dimensions rather than Playwright's `iPad` preset:
       * that preset runs WebKit, which would add a second browser download to
       * every CI run. The trade-off is real and worth naming — an iPad runs
       * WebKit, so Safari-specific behaviour in `<dialog>`, downloads and file
       * inputs is not covered here. Adding a `webkit` project is a one-line
       * change if that becomes worth the CI minutes.
       */
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        ...(chromiumPath === undefined ? {} : { launchOptions: { executablePath: chromiumPath } }),
      },
    },
  ],

  ...(externalBaseUrl === undefined
    ? {
        webServer: {
          command: 'npm run build && npm run preview -- --port 4173 --strictPort',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
