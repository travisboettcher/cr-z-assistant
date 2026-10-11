import { describe, expect, it, vi } from 'vitest';
import { createNewCampaign } from '../engine/campaign';
import { downloadCampaign } from './download';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const EXPORTED_AT = new Date(2026, 7, 30); // Local time: the filename uses local date parts.

/**
 * Moved here with the function it covers (#180). What the file *contains* and
 * what it is *called* are tested in `exportFile.test.ts`, against the pure
 * functions that decide them; this only checks that the browser glue offers
 * those bytes under that name and tidies up after itself.
 */
describe('downloadCampaign', () => {
  it('offers the serialized campaign under the generated filename', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const createObjectURL = vi.fn(() => 'blob:stub');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    downloadCampaign(campaign, EXPORTED_AT);

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('cedar-hollow-turn-1-2026-08-30.json');
    expect(createObjectURL).toHaveBeenCalledOnce();

    // The link must not be left behind in the document after the download.
    expect(document.querySelector('a[download]')).toBeNull();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
