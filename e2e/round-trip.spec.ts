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

async function addSurvivor(page: Page, name: string, tier: string) {
  await page.getByLabel(/survivor name/i).fill(name);
  await page.getByLabel(/^tier$/i).selectOption(tier);
  await page.getByRole('button', { name: /add survivor/i }).click();
  await expect(page.getByRole('region', { name: /community/i })).toContainText(name);
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

/**
 * Z1-5's acceptance: the Phase 0 round trip, now carrying real game state.
 *
 * The earlier test proves an empty campaign survives; this one proves the
 * roster does. It is the same journey with something in it worth losing.
 */
test('a roster survives export, a reload, and import', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await addSurvivor(page, 'Earl Rhodes', '4');
  await addSurvivor(page, 'Carla Proust', '3');

  const community = page.getByRole('region', { name: /community/i });
  await expect(community).toContainText('2 survivors · 7 tier levels');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text).survivors).toMatchObject([
    { name: 'Earl Rhodes', tier: 4, currentHp: 4 },
    { name: 'Carla Proust', tier: 3, currentHp: 3 },
  ]);

  await waitForAutosave(page, 'Earl Rhodes');
  await page.reload();
  await expect(community).toContainText('Earl Rhodes');

  // Imported over a different campaign, so the import path is exercised rather
  // than the autosave restore.
  await startFreshCampaign(page, 'Millbrook');
  await expect(community).toContainText('No survivors yet');

  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(community).toContainText('Earl Rhodes');
  await expect(community).toContainText('Carla Proust');
  await expect(community).toContainText('2 survivors · 7 tier levels');

  // Byte-identical, so the roster made the trip intact rather than merely
  // recognisably.
  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

test('a survivor can be renamed and removed', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');
  await addSurvivor(page, 'Earl Rhodes', '4');
  await addSurvivor(page, 'Carla Proust', '3');

  const community = page.getByRole('region', { name: /community/i });

  await community
    .getByRole('button', { name: /rename/i })
    .first()
    .click();
  await page.getByLabel(/rename earl rhodes/i).fill('Earl Rhodes Jr');
  await page.getByRole('button', { name: /^save$/i }).click();
  await expect(community).toContainText('Earl Rhodes Jr');

  await community
    .getByRole('button', { name: /^remove$/i })
    .first()
    .click();
  await page.getByRole('button', { name: /remove them/i }).click();

  await expect(community).not.toContainText('Earl Rhodes Jr');
  await expect(community).toContainText('1 survivor · 3 tier levels');
});

/**
 * The character sheet in a real browser. The unit tests check the same numbers,
 * but the em dash is the sort of thing a jsdom snapshot can agree with while
 * the built page renders something else entirely.
 */
test('the character sheet shows computed scores and a dash for unlearned skills', async ({
  page,
}) => {
  await startCampaign(page, 'Cedar Hollow');
  await addSurvivor(page, 'Earl Rhodes', '4');

  await page.getByRole('button', { name: /^sheet$/i }).click();
  const sheet = page.getByRole('region', { name: 'Earl Rhodes' });

  await expect(sheet).toContainText('Tier 4 · Hero');
  await expect(sheet).toContainText('4 / 4');

  // Strength 3 with no Bladed Weapon skill: a dash, never a 3.
  const blade = sheet.getByRole('row', { name: /^Bladed Weapon/ });
  await expect(blade).toContainText('—');
  await expect(blade).not.toContainText(/\d/);

  // A wound typed in here survives the round trip.
  await sheet.getByRole('button', { name: /^set health$/i }).click();
  await page.getByLabel(/current health for earl rhodes/i).fill('1');
  await page.getByRole('button', { name: /save health/i }).click();
  await expect(sheet).toContainText('1 / 4');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text).survivors[0]).toMatchObject({ currentHp: 1 });

  await startFreshCampaign(page, 'Millbrook');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('region', { name: /community/i })).toContainText('1 / 4');
});

/**
 * Building a survivor, and the one action the sheet refuses.
 *
 * The override is the interesting half: it lets the rule through once, and the
 * violation is still there afterwards. Nothing about the override is stored, so
 * there is nothing that could go stale — the sheet simply reports what is true.
 */
test('a build that breaks a rule is refused, overridden, and still reported', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');
  await addSurvivor(page, 'Ruby Vance', '2');

  await page.getByRole('button', { name: /^sheet$/i }).click();
  const sheet = page.getByRole('region', { name: 'Ruby Vance' });

  await expect(sheet).toContainText('Still choosing skills: 0 of 2');

  const take = (skill: string) =>
    sheet
      .getByRole('row', { name: new RegExp(`^${skill}\\b`) })
      .getByRole('button', { name: /^take\b/i });

  await take('Archery').click();
  await take('Stealth').click();
  await expect(sheet).not.toContainText('Still choosing skills');

  // A third skill is one more than a Citizen gets.
  await take('Enter').click();
  await expect(page.getByRole('button', { name: /take it anyway/i })).toBeVisible();
  await page.getByRole('button', { name: /leave it/i }).click();
  // Case-insensitive on purpose: `toContainText` with a plain string is
  // case-sensitive, so a lowercase "has 3 skills" here would never match and
  // this negative assertion would pass whether the violation showed or not.
  await expect(sheet).not.toContainText(/has 3 skills/i);

  await take('Enter').click();
  await page.getByRole('button', { name: /take it anyway/i }).click();
  await expect(sheet).toContainText(/has 3 skills/i);

  // And it survives the round trip, because an overridden survivor is just a
  // survivor — there is no flag riding along with them.
  const exported = await exportCampaign(page);
  expect(Object.keys(JSON.parse(exported.text).survivors[0].skills)).toHaveLength(3);
});

/**
 * A recruit found on a mission, with the skill their die gave them.
 *
 * The roll travels on the action rather than being made inside the store, so a
 * fixed result here is the real code path, not a stub.
 */
test('a field recruit arrives with the skill their roll gives them', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  const community = page.getByRole('region', { name: /community/i });
  await community.getByText(/recruit from the field/i).click();

  await page.getByLabel(/recruit name/i).fill('Carla Proust');
  await page.getByLabel(/recruit tier/i).selectOption('3');
  await page.getByLabel(/skill roll/i).selectOption('6');
  await page.getByRole('button', { name: /^recruit$/i }).click();

  await expect(community).toContainText('Carla Proust');

  await page.getByRole('button', { name: /^sheet$/i }).click();
  const sheet = page.getByRole('region', { name: 'Carla Proust' });

  // A six is Archery (pg. 15): Dexterity 2 at tier 3, skill at level 0.
  await expect(sheet.getByRole('row', { name: /^Archery/ })).toContainText('Drop');
  await expect(sheet).toContainText('Still choosing skills: 1 of 3');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text).survivors[0].skills).toEqual({ archery: 0 });
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

/**
 * Spending experience in a real browser.
 *
 * The prices are asserted off the buttons themselves, because that is where a
 * player reads them — and the two of them are the point: one sentence of pg. 18
 * charges a skill its new *level* and Move its new *Score*, and a build that
 * quoted "+1 · 1 XP" for Move would look entirely reasonable.
 */
test('experience buys a level and a promotion, and both survive the round trip', async ({
  page,
}) => {
  await startCampaign(page, 'Cedar Hollow');
  await addSurvivor(page, 'Marcus Webb', '2');

  await page.getByRole('button', { name: /^sheet$/i }).click();
  const sheet = page.getByRole('region', { name: 'Marcus Webb' });

  await sheet.getByRole('button', { name: /^set experience$/i }).click();
  await page.getByLabel(/experience for marcus webb/i).fill('20');
  await page.getByRole('button', { name: /save experience/i }).click();

  await sheet
    .getByRole('row', { name: /^Scavenge\b/ })
    .getByRole('button', { name: /^take\b/i })
    .click();

  await expect(sheet.getByRole('button', { name: /raise scavenge to level 1/i })).toContainText(
    '+1 · 1 XP',
  );
  await expect(sheet.getByRole('button', { name: /raise move to 7/i })).toContainText('+1 · 7 XP');

  await sheet.getByRole('button', { name: /raise scavenge to level 1/i }).click();
  await expect(sheet.getByRole('button', { name: /raise scavenge to level 2/i })).toBeVisible();

  // Promotion: six XP for tier 3, a rebuilt stat array, and a slot rather than
  // a skill — so the sheet immediately says one is still to choose. A Citizen
  // has two stats at zero and the player picks which one rises (pg. 18), so the
  // button stays refused until the sheet is told.
  await expect(sheet.getByRole('button', { name: /raise their tier/i })).toBeDisabled();
  await sheet.getByLabel(/raise from zero/i).selectOption('cooperation');
  await sheet.getByRole('button', { name: /raise their tier/i }).click();
  await expect(sheet).toContainText('Tier 3 · Leader');
  await expect(sheet).toContainText('Still choosing skills: 1 of 3');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text).survivors[0]).toMatchObject({
    tier: 3,
    skills: { scavenge: 1 },
    // Twenty, less one for the level and six for the tier.
    xp: 13,
    // The zero the player raised, and the one they left alone.
    stats: { strength: 3, dexterity: 2, cooperation: 1, intelligence: 0 },
  });

  await startFreshCampaign(page, 'Millbrook');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('region', { name: /community/i })).toContainText('Tier 3 · Leader');
});
