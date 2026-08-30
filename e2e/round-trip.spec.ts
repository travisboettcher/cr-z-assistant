import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Phase 0's headline acceptance, executed rather than asserted.
 *
 * "Export a campaign, reload the page, import the file, get the same campaign
 * back" is what the whole phase exists to deliver. Unit tests cover each half;
 * only this proves the two halves meet, in a real browser, against the built
 * bundle, with a file that actually went to disk.
 *
 * It also covers what jsdom cannot: `<dialog>` modality. The unit suite runs
 * against a stub that only toggles `open`, so real focus behaviour and the
 * backdrop are verified here or nowhere.
 */

async function startCampaign(page: Page, name: string) {
  await page.getByLabel(/campaign name/i).fill(name);
  await page.getByRole('button', { name: 'New campaign' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

/**
 * Waits for the debounced autosave to reach storage.
 *
 * The write is debounced, and Playwright acts far faster than a person, so a
 * reload issued immediately after an edit can beat it. Waiting for the stored
 * text is deterministic where a fixed delay is a guess.
 */
async function waitForAutosave(page: Page, contains: string) {
  await page.waitForFunction(
    (needle) => (localStorage.getItem('crz.campaign.autosave.v1') ?? '').includes(needle),
    contains,
  );
}

/**
 * Starts a new campaign from inside an open one, through the confirm dialog.
 * With autosave in place this is the only way to get back to a clean slate
 * without clearing storage.
 */
async function startFreshCampaign(page: Page, name: string) {
  await page.getByRole('button', { name: /start a new campaign/i }).click();
  await page.getByLabel(/new campaign name/i).fill(name);
  await page.getByRole('button', { name: /start it/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

/** Clicks Export and returns the file's contents and suggested name. */
async function exportCampaign(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export campaign/i }).click(),
  ]);

  const path = join(tmpdir(), `crz-e2e-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(path);

  return { path, name: download.suggestedFilename(), text: await readFile(path, 'utf8') };
}

async function writeTempFile(name: string, contents: string) {
  const path = join(tmpdir(), `crz-e2e-${Date.now()}-${name}`);
  await writeFile(path, contents, 'utf8');
  return path;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Autosave persists across tests in a reused context; each test states its
  // own starting point rather than inheriting the previous one's campaign.
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
});

test('a campaign survives export, a reload, and import', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  const exported = await exportCampaign(page);

  // The file is readable by a person, not just by the app.
  expect(exported.name).toMatch(/^cedar-hollow-turn-1-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(exported.text)).toMatchObject({
    name: 'Cedar Hollow',
    turn: 1,
    phase: 'mission',
    materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
  });

  // Autosave (Z0-10) means a reload keeps the campaign, so the file has to be
  // imported over a *different* one for the import path to be exercised at all.
  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cedar Hollow');

  await startFreshCampaign(page, 'Millbrook');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cedar Hollow');
  // Scoped to the header: "Turn" is also the label of a nav placeholder.
  await expect(page.getByRole('banner')).toContainText('Turn');

  // Re-exporting the restored campaign must produce the same bytes: proof the
  // round trip lost nothing, not merely that the name came back.
  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

test('importing over an open campaign asks first, and declining keeps it', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');
  const exported = await exportCampaign(page);

  await startFreshCampaign(page, 'Millbrook');

  await page.setInputFiles('input[type="file"]', exported.path);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Cedar Hollow');

  await page.getByRole('button', { name: /keep the open campaign/i }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Millbrook');
});

test('confirming the dialog replaces the open campaign', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');
  const exported = await exportCampaign(page);

  await startFreshCampaign(page, 'Millbrook');

  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cedar Hollow');
});

/** Escape closing a modal is real `<dialog>` behaviour that jsdom cannot show. */
test('the confirmation dialog closes on Escape without replacing anything', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');
  const exported = await exportCampaign(page);

  await startFreshCampaign(page, 'Millbrook');

  await page.setInputFiles('input[type="file"]', exported.path);
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Millbrook');
});

test.describe('a file that is not a usable save', () => {
  test('a truncated file explains itself instead of breaking', async ({ page }) => {
    const path = await writeTempFile('truncated.json', '{"schemaVersion": 1, "name": "Ced');

    await page.setInputFiles('input[type="file"]', path);

    await expect(page.getByRole('alert')).toContainText(/could not be read|cut short/i);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Campaign Tracker');
  });

  test('a save from a newer version says to update the app', async ({ page }) => {
    const path = await writeTempFile(
      'future.json',
      JSON.stringify({
        schemaVersion: 99,
        id: '11111111-2222-3333-4444-555555555555',
        name: 'From The Future',
        createdAt: '2026-08-30T00:00:00.000Z',
        turn: 1,
        phase: 'mission',
        materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
        survivors: [],
        base: null,
        log: [],
      }),
    );

    await page.setInputFiles('input[type="file"]', path);

    await expect(page.getByRole('alert')).toContainText(/newer version/i);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Campaign Tracker');
  });
});
