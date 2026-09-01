import { describe, expect, it, vi } from 'vitest';
import { createNewCampaign } from '../engine/campaign';
import { campaignFileName, downloadCampaign, serializeCampaign } from './exportFile';
import { parseCampaignFile } from './saveFile';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const EXPORTED_AT = new Date(2026, 7, 30); // Local time: the filename uses local date parts.

describe('serializeCampaign', () => {
  it('writes a campaign a person can read', () => {
    const text = serializeCampaign(createNewCampaign('Cedar Hollow', FIXED));

    expect(text).toContain('\n  "name": "Cedar Hollow"');
    expect(text.endsWith('\n')).toBe(true);
  });

  /**
   * The property the whole module exists for. `JSON.stringify` follows
   * insertion order, so a campaign rebuilt with its keys shuffled — which is
   * what a migration step appending a field produces — must still serialise
   * identically, or every save diffs as though it changed completely.
   */
  it('is stable when the campaign object was built in a different key order', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const shuffled = Object.fromEntries(
      Object.entries(campaign).reverse(),
    ) as unknown as typeof campaign;

    expect(Object.keys(shuffled)).not.toEqual(Object.keys(campaign));
    expect(serializeCampaign(shuffled)).toBe(serializeCampaign(campaign));
  });

  it('orders material counts too, not just top-level keys', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const shuffled = {
      ...campaign,
      materials: { rare: 0, hardware: 0, fuel: 0, food: 0 },
    };

    expect(serializeCampaign(shuffled)).toBe(serializeCampaign(campaign));
  });

  it('produces byte-identical output for the same campaign twice', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(serializeCampaign(campaign)).toBe(serializeCampaign(campaign));
  });

  /**
   * Export and import are two halves of one feature; a change to either that
   * breaks the pair should fail here rather than on someone's tablet. This is
   * the property Z0-9's acceptance rests on.
   */
  it('round-trips back through parseCampaignFile', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const result = parseCampaignFile(serializeCampaign(campaign));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.campaign).toEqual(campaign);
  });
});

describe('campaignFileName', () => {
  it('names the file for the campaign, its turn and the day', () => {
    const campaign = { ...createNewCampaign('Cedar Hollow', FIXED), turn: 7 };

    expect(campaignFileName(campaign, EXPORTED_AT)).toBe('cedar-hollow-turn-7-2026-08-30.json');
  });

  it('zero-pads month and day so names sort chronologically', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(campaignFileName(campaign, new Date(2026, 0, 5))).toContain('2026-01-05');
  });

  it.each([
    ['Cedar Hollow', 'cedar-hollow'],
    ['  Cedar   Hollow  ', 'cedar-hollow'],
    ['Cedar/Hollow: "Redux"', 'cedar-hollow-redux'],
    ['Cedar Hollow 2', 'cedar-hollow-2'],
    ['???', 'campaign'],
    ['', 'campaign'],
  ])('turns %o into a filesystem-safe %o', (name, expected) => {
    const campaign = createNewCampaign(name, FIXED);

    expect(campaignFileName(campaign, EXPORTED_AT)).toBe(`${expected}-turn-1-2026-08-30.json`);
  });

  it('caps a very long name rather than producing an unusable filename', () => {
    const campaign = createNewCampaign('a'.repeat(300), FIXED);
    const name = campaignFileName(campaign, EXPORTED_AT);

    expect(name.length).toBeLessThan(100);
  });
});

describe('downloadCampaign', () => {
  it('offers the serialized campaign under the generated filename', async () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:stub';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clicked: { anchor: HTMLAnchorElement; connected: boolean }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // Recorded at click time rather than after: a link the browser is asked
      // to follow has to be in the document *then*, and afterwards is exactly
      // when it stops being.
      clicked.push({ anchor: this, connected: this.isConnected });
    });

    downloadCampaign(campaign, EXPORTED_AT);

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.anchor.download).toBe('cedar-hollow-turn-1-2026-08-30.json');
    expect(createObjectURL).toHaveBeenCalledOnce();

    /**
     * What is actually inside the blob, not just that one was made. The file
     * the browser writes is the campaign or this module has done nothing —
     * and an empty blob under the right filename is the worst possible
     * failure, since it looks like a successful export until the save is
     * opened again.
     */
    expect(await blobs[0]?.text()).toBe(serializeCampaign(campaign));
    expect(blobs[0]?.type).toBe('application/json');

    // Firefox ignores a programmatic click on a detached anchor, so being in
    // the document at that moment is the behaviour, not an implementation
    // detail.
    expect(clicked[0]?.connected).toBe(true);

    // And the link must not be left behind in the document afterwards.
    expect(document.querySelector('a[download]')).toBeNull();

    /**
     * The object URL is revoked on the next frame rather than immediately, so
     * proving it is revoked at all means waiting one. A leaked URL pins the
     * whole serialized campaign in memory for as long as the tab lives.
     */
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stub');

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
