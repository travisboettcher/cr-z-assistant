/**
 * Placeholder shell. The real tablet-first layout — header, empty state,
 * navigation — arrives in Z0-7 (#7). This exists so the scaffold has something
 * to render and something to test.
 */
export function App() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">County Road Z — Campaign Tracker</h1>
      <p className="text-sm opacity-70">Phase 0 scaffold. No campaign state yet.</p>
    </main>
  );
}
