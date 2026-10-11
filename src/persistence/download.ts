/**
 * Handing a save file to the browser — the one part of export that needs a DOM.
 *
 * **Split out of `exportFile.ts` so the serialiser has no browser code (#180).**
 * `serializeCampaign` and `campaignFileName` are pure; this function is not, and
 * while the three shared a module, anything that wanted the bytes of a save had
 * to pull in `document`, `Blob` and `URL.createObjectURL` to get them. A program
 * that type-checks without the DOM library — a headless test harness, a
 * command-line tool replaying a campaign — could not import the serialiser at
 * all. Now `exportFile.ts` decides *what* the file contains and this decides
 * only how it reaches the player's disk, and `eslint.config.js` keeps the first
 * of those free of browser globals.
 *
 * **Why here rather than next to its one caller.** The Export button in
 * `src/ui/CampaignOverview.tsx` is the only thing that calls this, but what it
 * does is the export half of save-file I/O, and the import half —
 * `readCampaignFile`, which takes the `Blob` a file picker hands over — already
 * lives in `src/persistence`. Keeping the two ends of the round trip in the
 * directory whose README says it owns "export and import" means someone
 * changing how a save leaves the browser finds how one comes back in beside it.
 * It also keeps this under Stryker's `src/persistence` glob, which is where the
 * disable comment below was written to sit.
 */

import type { Campaign } from '../engine/campaign';
import { campaignFileName, serializeCampaign } from './exportFile';

/**
 * Hands the file to the browser as a download.
 *
 * The one impure function in export, and deliberately the thinnest wrapper
 * possible: everything worth testing lives in `serializeCampaign` and
 * `campaignFileName`, which are pure and tested directly.
 *
 * The object URL is revoked on the next frame rather than immediately —
 * revoking synchronously after `click()` races the browser's read of the blob
 * in some engines, and leaking a URL for one frame is cheaper than a download
 * that silently produces an empty file.
 */
// Stryker disable all: the body below is platform glue, and its real check is
// the e2e export in `e2e/round-trip.spec.ts` — a genuine browser downloading a
// genuine file whose bytes are then re-imported. A jsdom assertion that
// `document.body.append` was called proves the code calls it, not that a
// download works, so mutants here would be killed by a test worth less than the
// mutant. Everything that decides *what* the file contains is in
// `serializeCampaign` and `campaignFileName`, which are pure, mutated, and at
// 100%.
export function downloadCampaign(campaign: Campaign, exportedAt: Date = new Date()): void {
  const url = URL.createObjectURL(
    new Blob([serializeCampaign(campaign)], { type: 'application/json' }),
  );
  const link = document.createElement('a');

  link.href = url;
  link.download = campaignFileName(campaign, exportedAt);
  document.body.append(link);
  link.click();
  link.remove();

  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });
}
// Stryker restore all
