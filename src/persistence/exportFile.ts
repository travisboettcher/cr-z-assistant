/**
 * Writing a save file — the export half of the round trip.
 *
 * The exported `.json` is the **durable** save. `localStorage` (Z0-10) is a
 * convenience layer on top of it; a cleared browser must not cost a campaign.
 * So this module has two jobs beyond calling `JSON.stringify`: produce
 * something a person can read and diff, and hand it to the browser.
 */

import { MATERIALS, type Campaign } from '../engine/campaign';

/** Material counts in the fixed order from the engine, not insertion order. */
function orderedMaterials(campaign: Campaign): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const material of MATERIALS) {
    ordered[material] = campaign.materials[material];
  }
  return ordered;
}

/**
 * The campaign rewritten with its keys in a fixed order.
 *
 * `JSON.stringify` follows insertion order, so a campaign that came through
 * `migrate` — where a step appends a field — would serialise its keys in a
 * different order than a freshly created one, and two saves of the same
 * campaign would diff as though everything had changed.
 *
 * The return type is `Record<keyof Campaign, unknown>`, which is what makes
 * this safe rather than merely tidy: adding a field to `Campaign` without
 * deciding where it belongs in the file fails the typecheck here, so a new
 * field cannot be silently dropped from every export.
 */
function inFileOrder(campaign: Campaign): Record<keyof Campaign, unknown> {
  return {
    schemaVersion: campaign.schemaVersion,
    id: campaign.id,
    name: campaign.name,
    createdAt: campaign.createdAt,
    turn: campaign.turn,
    phase: campaign.phase,
    materials: orderedMaterials(campaign),
    survivors: campaign.survivors,
    base: campaign.base,
    log: campaign.log,
  };
}

/**
 * The exact text written to disk.
 *
 * Pretty-printed and newline-terminated, because the file is meant to be
 * openable in a text editor by someone who wants to check what the app is
 * claiming about their campaign, and to diff cleanly if they keep saves in
 * version control.
 */
export function serializeCampaign(campaign: Campaign): string {
  return `${JSON.stringify(inFileOrder(campaign), null, 2)}\n`;
}

/**
 * Trims a campaign name to something safe on every filesystem.
 *
 * A name is free text and may hold slashes, colons or quotes, which Windows,
 * macOS and a shell would each object to differently.
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  // A name made only of punctuation would otherwise slug away to nothing.
  return slug === '' ? 'campaign' : slug;
}

/**
 * `<slug>-turn-<n>-<yyyy-mm-dd>.json`.
 *
 * Both turn and date appear because someone scrolling a folder of saves asks
 * two questions — "how far along is this one?" and "which is newest?" — and a
 * turn number alone cannot answer the second when a campaign is re-exported
 * without advancing.
 *
 * The date is the caller's rather than `new Date()` read in here, so this stays
 * a pure function and its tests do not have to freeze the clock.
 */
export function campaignFileName(campaign: Campaign, exportedAt: Date): string {
  const day = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, '0'),
    String(exportedAt.getDate()).padStart(2, '0'),
  ].join('-');

  return `${slugify(campaign.name)}-turn-${campaign.turn}-${day}.json`;
}

/**
 * Hands the file to the browser as a download.
 *
 * The one impure function here, and deliberately the thinnest wrapper possible:
 * everything worth testing lives in `serializeCampaign` and `campaignFileName`,
 * which are pure and tested directly.
 *
 * The object URL is revoked on the next frame rather than immediately —
 * revoking synchronously after `click()` races the browser's read of the blob
 * in some engines, and leaking a URL for one frame is cheaper than a download
 * that silently produces an empty file.
 */
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
