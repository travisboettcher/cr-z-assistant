import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewCampaign } from '../engine/campaign';
import { AUTOSAVE_KEY, clearAutosave, readAutosave, writeAutosave } from './autosave';
import { serializeCampaign } from './exportFile';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

afterEach(() => {
  // Order matters: the stub replaces `localStorage` wholesale, so it has to go
  // before anything reaches for the real one.
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('writeAutosave', () => {
  /**
   * The property that keeps autosaved data inside everything the migration
   * chain covers: the stored text is the export format, byte for byte. A
   * bespoke shape here would be a second save format Z0-4's guard knows
   * nothing about.
   */
  it('stores exactly what an export would write', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(writeAutosave(campaign).ok).toBe(true);
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBe(serializeCampaign(campaign));
  });

  it('reports a full or refusing store rather than throwing', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      getItem: () => null,
      removeItem: () => undefined,
    });

    const written = writeAutosave(createNewCampaign('Cedar Hollow', FIXED));

    expect(written.ok).toBe(false);
    if (!written.ok) expect(written.reason).toMatch(/export/i);
  });
});

describe('readAutosave', () => {
  it('is null on a first run, which is not a failure', () => {
    expect(readAutosave()).toBeNull();
  });

  it('brings back a campaign written by writeAutosave', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    writeAutosave(campaign);

    const found = readAutosave();

    expect(found?.ok).toBe(true);
    if (found?.ok) expect(found.campaign).toEqual(campaign);
  });

  /**
   * Reading through `parseCampaignFile` is what makes this true, and it is why
   * the round trip goes through the export format rather than a private one.
   */
  it('reports a corrupted entry instead of returning half a campaign', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{"schemaVersion": 1, "name": "Ced');

    const found = readAutosave();

    expect(found?.ok).toBe(false);
    if (found && !found.ok) expect(found.error.message.length).toBeGreaterThan(0);
  });

  it('refuses an entry written by a newer version', () => {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ ...createNewCampaign('Cedar Hollow', FIXED), schemaVersion: 99 }),
    );

    const found = readAutosave();

    expect(found?.ok).toBe(false);
    if (found && !found.ok) expect(found.error.reason).toBe('future-version');
  });
});

describe('clearAutosave', () => {
  it('removes the entry', () => {
    writeAutosave(createNewCampaign('Cedar Hollow', FIXED));
    clearAutosave();

    expect(readAutosave()).toBeNull();
  });
});
