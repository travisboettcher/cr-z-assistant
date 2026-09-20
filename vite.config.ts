import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    /*
     * Four times the default, and not because any test is slow.
     *
     * The `src/ui` suites drive the whole `App` through the real provider — a
     * deliberate choice, since a test that stubs the store cannot show that
     * something done on screen reaches it. Every screen the app grows makes
     * every one of those renders cost more, and by Z3-5 the suite ran hundreds
     * of them across parallel workers on one machine.
     *
     * What that produced was a *different* test timing out at exactly 5000ms on
     * each run while passing on its own: starvation, not slowness. A flake that
     * moves is worse than a slow suite, because it teaches people to re-run
     * rather than to look. If a single test ever genuinely approaches this, that
     * is a real finding rather than a reason to raise it again.
     */
    testTimeout: 20_000,
  },
});
