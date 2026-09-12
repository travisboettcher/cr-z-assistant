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

const PHASE_ORDER = ['Mission', 'Advancement', 'Planning', 'Management'] as const;

/**
 * Walks the turn forward, a phase at a time, from the top of a turn.
 *
 * Every caller starts a turn — a fresh campaign or the one after an End turn —
 * so the walk is counted from the Mission Phase rather than read off the
 * screen. The last skip of a turn asks before it ends one, and none of these
 * journeys wants that, so `Management` is as far as this goes.
 */
async function skipToPhase(page: Page, phase: (typeof PHASE_ORDER)[number]) {
  for (const next of PHASE_ORDER.slice(1, PHASE_ORDER.indexOf(phase) + 1)) {
    await page.getByRole('button', { name: `Skip to ${next}` }).click();
  }
}

/**
 * Adds a Hero and puts them on the project team, which is five Labor.
 *
 * Since Z3-5 the Labor pool is the summed Tier levels of the project team
 * (pg. 20) rather than a number typed above the slot map, so a journey that
 * builds anything has to hire somebody first. A Tier 4 is four Labor and a
 * Tier 1 is one, which is enough for every project these tests order.
 *
 * Since Z3-6 the team is assigned where the book assigns it — Planning Step 2
 * (pg. 20) — so hiring means walking there. The walk leaves the campaign in the
 * Planning Phase, which is where a player who had just assigned a team would
 * be; the base screen below it stays open the whole time.
 */
async function hireProjectTeam(page: Page) {
  for (const [name, tier] of [
    ['Earl Rhodes', '4'],
    ['Ruby Vance', '1'],
  ] as const) {
    await page.getByLabel(/survivor name/i).fill(name);
    await page.getByLabel(/^tier$/i).selectOption(tier);
    await page.getByRole('button', { name: /add survivor/i }).click();
  }

  await skipToPhase(page, 'Planning');
  await page.getByRole('button', { name: 'Next: Assign Project Team' }).click();

  const team = page.getByRole('group', { name: /on the project team/i });
  for (const box of await team.getByRole('checkbox').all()) {
    await box.check();
  }
}

/**
 * Builds a Utility Station into the front yard and puts a Utilities worker in
 * it, which is what a utility pool is made of since Z3-5.
 *
 * The staffed half of the pool is the combined Utilities Score of whoever is
 * working a Station (pg. 20, 72), and it was a number typed above the slot map
 * until this story. So a journey that assigns a point of Power now has to
 * build the thing that generates it and staff it — which is the real journey,
 * and worth having end to end once.
 *
 * The worker is a Hero, and has to be: a Skill Score is the governing stat plus
 * the level (pg. 8), Utilities is governed by Cooperation, and the Tier stat
 * arrays only put anything in Cooperation at Tier 4. A Rookie who has learnt
 * Utilities still has a Score of zero — which is a real state the app models,
 * and a useless one to build a pool out of.
 *
 * `hireProjectTeam` must have run first: the Station costs 3 Hardware and 3
 * Labor.
 */
async function staffAUtilityStation(page: Page, slot = 'front yard') {
  const worker = 'Sam Reyes';

  await page.getByLabel(/survivor name/i).fill(worker);
  await page.getByLabel(/^tier$/i).selectOption('4');
  await page.getByRole('button', { name: /add survivor/i }).click();

  await page.getByRole('button', { name: new RegExp(`build in ${slot}`, 'i') }).click();
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Utility Station' });
  await page.getByRole('button', { name: /build here/i }).click();

  await page
    .getByRole('region', { name: /community/i })
    .getByRole('listitem')
    .filter({ hasText: worker })
    .getByRole('button', { name: /^sheet$/i })
    .click();
  const sheet = page.getByRole('region', { name: worker });
  await sheet
    .getByRole('row', { name: /^Utilities\b/ })
    .getByRole('button', { name: /^take\b/i })
    .click();
  await sheet.getByRole('button', { name: /^close sheet$/i }).click();

  await page.getByRole('button', { name: new RegExp(`upgrade ${slot}`, 'i') }).click();
  await page
    .getByRole('group', { name: /working here/i })
    .getByRole('checkbox', { name: new RegExp(worker, 'i') })
    .check();
  await page.getByRole('button', { name: /^cancel$/i }).click();
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
    step: 'select-mission',
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
        step: 'select-mission',
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

/**
 * Z2-4's acceptance: a claimed base survives an export, a reload and an import.
 *
 * The same journey as the roster test, one layer down. What makes it worth its
 * own run is that the base stores almost nothing — an id and an empty slot
 * record — and everything on the screen is read back out of the rules data. A
 * round trip that lost the id would show a base that is not the one claimed,
 * and every number on the slot map would be quietly wrong rather than missing.
 */
test('a claimed base survives export, a reload, and import', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Hobby Farm — Tier 2' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  const map = page.getByRole('region', { name: 'Hobby Farm' });
  await expect(map).toContainText('Tier 2 base');
  // A built-in facility, a locked upgrade, and the rubble that needs clearing:
  // three slot states off one layout, none of them stored in the save.
  await expect(map).toContainText('Shelving — 1 of 3, no room for more');
  await expect(map).toContainText('Blocked — 2 Labor to clear');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({ base: { id: 'hobby-farm', slots: {} } });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Hobby Farm' })).toBeVisible();

  await startFreshCampaign(page, 'Millbrook');
  // A fresh campaign has no base, so the chooser is back.
  await expect(page.getByLabel(/choose a base/i)).toBeVisible();

  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('region', { name: 'Hobby Farm' })).toBeVisible();

  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

/**
 * Z3-2's acceptance, end to end: the history is written by doing things rather
 * than by anything typing into it, and it comes back out of a save file whole.
 *
 * The material count is the interesting half. Something visibly changes on
 * screen and the history does not grow, because a hand-entered count is the
 * player correcting the record rather than something that happened to the
 * community — and when the Advancement Phase produces materials for real, that
 * is what will earn the entry.
 */
test('the campaign log records what happened, and survives the round trip', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  const history = page.getByRole('region', { name: 'History' });
  await expect(history).toContainText('Started the campaign “Cedar Hollow”');
  await expect(history.getByRole('listitem')).toHaveCount(1);

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Hobby Farm — Tier 2' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  // Newest first, so the claim is above the start it was claimed for.
  await expect(history.getByRole('listitem').first()).toContainText('Claimed the Hobby Farm');
  await expect(history.getByRole('listitem')).toHaveCount(2);

  await page.getByLabel(/^hardware$/i).fill('6');
  await expect(page.getByLabel(/^hardware$/i)).toHaveValue('6');
  await expect(history.getByRole('listitem')).toHaveCount(2);

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text).log).toHaveLength(2);

  await startFreshCampaign(page, 'Elsewhere');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'Claimed the Hobby Farm',
  );

  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

/**
 * Z2-5's acceptance, and the first time the base screen does something.
 *
 * Materials are typed in because nothing in the app produces them until the
 * Advancement Phase (Phase 3), the same way Phase 1 typed in XP. That is what
 * makes a build possible at all, so it is part of the journey rather than
 * setup: a Build button that can never be pressed would not be worth shipping.
 */
test('a facility is built into a slot, and the build survives the round trip', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Small Town Home — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  await page.getByLabel(/^hardware$/i).fill('9');
  await hireProjectTeam(page);

  await page.getByRole('button', { name: /build in garage/i }).click();
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Workshop' });
  await expect(page.getByText(/3 Hardware · 2 Labor/i)).toBeVisible();
  await page.getByRole('button', { name: /build here/i }).click();

  const map = page.getByRole('region', { name: 'Small Town Home' });
  await expect(map).toContainText('Workshop');
  // Spent, not merely recorded.
  await expect(page.getByLabel(/^hardware$/i)).toHaveValue('6');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    materials: { hardware: 6 },
    base: { id: 'small-town-home', slots: { garage: { built: { facility: 'workshop' } } } },
  });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Small Town Home' })).toContainText('Workshop');

  await startFreshCampaign(page, 'Millbrook');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  await expect(page.getByRole('region', { name: 'Small Town Home' })).toContainText('Workshop');

  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

/**
 * Z2-6's acceptance, and the one rule in Phase 2 that needs two turns to show.
 *
 * A facility built this turn refuses an upgrade until the next one, which is
 * the whole reason `builtOnTurn` is stored: without it the rule cannot survive
 * a reload, and this is the journey that would notice.
 */
test('an upgrade waits for the turn after its facility went up', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Small Town Home — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  await page.getByLabel(/^hardware$/i).fill('12');
  await hireProjectTeam(page);

  await page.getByRole('button', { name: /build in garage/i }).click();
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Workshop' });
  await page.getByRole('button', { name: /build here/i }).click();

  // Same turn: held, with an override rather than a flat refusal.
  await page.getByRole('button', { name: /upgrade garage/i }).click();
  await expect(page.getByText(/went up this turn/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /add upgrade/i })).toBeDisabled();

  // A built-in was never built, so the same rule never touches it.
  await page.getByRole('button', { name: /upgrade kitchen/i }).click();
  await expect(page.getByText(/went up this turn/i)).not.toBeVisible();
  await page.getByLabel(/^upgrade$/i).selectOption({ label: 'Gas Range' });
  await page.getByRole('button', { name: /add upgrade/i }).click();

  const map = page.getByRole('region', { name: 'Small Town Home' });
  await expect(map).toContainText('Gas Range — 1 of 3, room for 2 more');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    base: {
      slots: {
        garage: { built: { facility: 'workshop', builtOnTurn: 1 } },
        kitchen: { upgrades: ['gas-range'] },
      },
    },
  });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();

  // The turn the Workshop went up survived the reload, so the rule still holds.
  await page.getByRole('button', { name: /upgrade garage/i }).click();
  await expect(page.getByText(/went up this turn/i)).toBeVisible();

  /*
   * Z3-3's acceptance, and the reason it is here rather than in a test of its
   * own: Phase 2 shipped this rule with no way to satisfy it. The turn walk is
   * what finally lets a player get to the turn after.
   *
   * Hiring the team left the campaign in the Planning Phase, so one skip
   * reaches the last phase of the turn — and the skip off *that* asks first,
   * because ending a turn is the one move that cannot be walked back.
   */
  await page.getByRole('button', { name: 'Skip to Management' }).click();
  await page.getByRole('button', { name: 'End turn 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End turn 1' }).click();

  await expect(page.getByRole('region', { name: 'Turn 2' })).toBeVisible();

  // The garage's upgrade form is still open from before the turn ended, and it
  // now reads differently: a new turn, so the Workshop is no longer the thing
  // that just went up.
  await hireProjectTeam(page);
  await expect(page.getByText(/went up this turn/i)).not.toBeVisible();
  await page.getByLabel(/^upgrade$/i).selectOption({ label: 'Metal Shop' });
  await page.getByRole('button', { name: /add upgrade/i }).click();

  await expect(map).toContainText('Metal Shop');
});

/**
 * Z2-7's acceptance: clearing changes what a slot is *available* for, and never
 * what kind of slot it is.
 *
 * The Hobby Farm's ruined chicken coop is Outdoor. Cleared, it takes a Garden
 * without complaint and still reports a Bunk Room as wanting an Indoor slot —
 * which is the distinction a clearing project could most easily lose.
 */
test('a cleared slot builds like an empty one of its own kind', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Hobby Farm — Tier 2' });
  await page.getByRole('button', { name: /claim this base/i }).click();
  await hireProjectTeam(page);

  const map = page.getByRole('region', { name: 'Hobby Farm' });
  await expect(map).toContainText('Blocked — 2 Labor to clear, and yields 2 hardware');

  await page.getByRole('button', { name: /clear ruined chicken coop/i }).click();
  await page.getByRole('button', { name: /clear it/i }).click();

  // The yield arrives in storage, which is the only way Phase 2 gains Hardware
  // other than typing it in.
  await expect(page.getByLabel(/^hardware$/i)).toHaveValue('2');
  await expect(map).toContainText('Cleared — ready to build in');

  await page.getByRole('button', { name: /build in ruined chicken coop/i }).click();

  // Still an Outdoor slot: an Indoor facility is questioned, an Outdoor one is
  // not. Clearing changed availability, not kind.
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Bunk Room' });
  await expect(page.getByText(/needs an indoor slot, and this one is outdoor/i)).toBeVisible();

  await page.getByLabel(/^facility$/i).selectOption({ label: 'Garden' });
  await expect(page.getByText(/needs an indoor slot/i)).not.toBeVisible();
  await page.getByRole('button', { name: /build here/i }).click();

  await expect(map).toContainText('Garden');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    base: {
      slots: {
        'ruined-chicken-coop': { cleared: true, built: { facility: 'garden' } },
      },
    },
  });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Hobby Farm' })).toContainText('Garden');
});

/**
 * Z2-8's acceptance: one point covers a facility and everything on it, and what
 * it switches on is visible rather than notional.
 *
 * The Storage Area's Refrigeration needs Power to raise the Food cap, which is
 * the roster's own 6/6(8)/6 — the parenthetical the book prints. Assigning one
 * point to the slot is what moves it, and taking the point back moves it down.
 */
test('a point of Power covers a facility and its upgrades, and survives the round trip', async ({
  page,
}) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Small Town Home — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  await page.getByLabel(/^hardware$/i).fill('20');
  await hireProjectTeam(page);
  await staffAUtilityStation(page);

  // A Storage Area with two upgrades on it: three things, one point of Power.
  await page.getByRole('button', { name: /build in garage/i }).click();
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Storage Area' });
  await page.getByRole('button', { name: /build here/i }).click();

  /*
   * Both upgrades go on through the override, and they have to: an upgrade may
   * not be built the same turn as its facility (pg. 54), and **Phase 2 has no
   * way to advance the turn** — the turn engine is Phase 3. So until then the
   * only facilities that can be upgraded without waving the rule through are
   * the ones the base came with, which is a consequence of the phase boundary
   * rather than of this story.
   */
  for (const upgrade of ['Refrigeration', 'Shelving']) {
    await page.getByRole('button', { name: /upgrade garage/i }).click();
    await page.getByLabel(/^upgrade$/i).selectOption({ label: upgrade });
    await expect(page.getByText(/went up this turn/i)).toBeVisible();
    await page.getByLabel(/add it anyway/i).check();
    await page.getByRole('button', { name: /add upgrade/i }).click();
  }

  await page.getByRole('button', { name: /upgrade garage/i }).click();
  await page.getByRole('checkbox', { name: 'Power' }).check();

  // One point for all three, not one each.
  await expect(page.getByLabel(/power assigned/i)).toHaveText('1 / 0 flat');
  await expect(page.getByLabel(/score spent/i)).toHaveText('1 / 1');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    base: {
      slots: {
        garage: {
          built: { facility: 'storage-area' },
          upgrades: ['refrigeration', 'shelving'],
          power: true,
        },
      },
    },
  });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();

  // The assignment persists; the pool it is spending from does not, so the
  // Score is back to zero and the point is now over-assigned — and must still
  // be removable, or the base is stranded.
  await page.getByRole('button', { name: /upgrade garage/i }).click();
  const power = page.getByRole('checkbox', { name: 'Power' });
  await expect(power).toBeChecked();
  await expect(power).toBeEnabled();
  await power.uncheck();
  await expect(page.getByRole('checkbox', { name: 'Power' })).not.toBeChecked();
});

/**
 * Z2-9's acceptance, with Z3-5's flip in the middle of it.
 *
 * The base sheet still reads the way the paper worksheet does. What changed is
 * the last third: staffing a facility used to be a preview that was never
 * saved, because assigning a survivor was Planning Phase work the app could not
 * do. It is an assignment now, and the point of the closing assertion is
 * exactly reversed — the export *must* change.
 */
test('the base sheet totals the base, and staffing it is written down', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Greasy Spoon — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  // The roster's own figures, on screen: three beds, a Tier 1 base with a
  // built-in Storage Area storing 6, and one Hero allowed.
  await expect(page.getByLabel(/^beds$/i)).toHaveText('3');
  await expect(page.getByLabel(/food stored/i)).toHaveText('0 / 6');
  await expect(page.getByLabel(/^heroes$/i)).toHaveText('0 / 1');

  await page.getByLabel(/^hardware$/i).fill('20');
  await hireProjectTeam(page);
  await expect(page.getByLabel(/^heroes$/i)).toHaveText('1 / 1');

  // Power turns the built-in Refrigeration on, which is the parenthetical the
  // book prints for this base: 6/6(8)/6. The point comes out of a Station
  // somebody is working, rather than a number typed in.
  // Adds a second Hero, which takes the community over the base's cap of one.
  // That is a violation the roster reports rather than one this test is about.
  await staffAUtilityStation(page, 'parking lot 1');
  await page.getByRole('button', { name: /upgrade storage area/i }).click();
  await page.getByRole('checkbox', { name: 'Power' }).check();
  await expect(page.getByLabel(/food stored/i)).toHaveText('0 / 8');
  await page.getByRole('button', { name: /^cancel$/i }).click();

  const beforeStaffing = await exportCampaign(page);

  // Put Earl in the Kitchen. The number moves, and so does the campaign.
  await page.getByRole('button', { name: /upgrade kitchen/i }).click();
  await expect(page.getByText(/needs someone assigned/i)).toBeVisible();

  await page
    .getByRole('group', { name: /working here/i })
    .getByRole('checkbox', { name: /earl/i })
    .check();
  await expect(page.getByText(/needs someone assigned/i)).not.toBeVisible();

  const afterStaffing = await exportCampaign(page);
  expect(afterStaffing.text).not.toBe(beforeStaffing.text);
  expect(JSON.parse(afterStaffing.text).assignments).toMatchObject({
    [Object.keys(JSON.parse(afterStaffing.text).assignments).find(
      (id) => JSON.parse(afterStaffing.text).assignments[id].slot === 'kitchen',
    ) as string]: { task: 'staff', slot: 'kitchen' },
  });
});

/**
 * Z3-7's acceptance, executed: a turn's XP and a turn's materials, handed out
 * in the steps the book puts them in, surviving the round trip.
 *
 * This is the first journey that uses the mission team for anything. The
 * Planning Phase of a turn assigns *next* turn's team (pg. 21), and the reset
 * that clears assignments runs at the top of the Planning Phase — so the team
 * assigned here is still there when the next turn's Advancement Phase asks who
 * went. Proving that end to end is worth a journey, because it is the one
 * ordering mistake that would make every XP and substitution number wrong
 * without any test failing.
 */
test('a turn’s XP and materials are taken in the steps that award them', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Small Town Home — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  for (const [name, tier] of [
    ['Earl Rhodes', '4'],
    ['Ruby Vance', '1'],
  ] as const) {
    await page.getByLabel(/survivor name/i).fill(name);
    await page.getByLabel(/^tier$/i).selectOption(tier);
    await page.getByRole('button', { name: /add survivor/i }).click();
  }

  // Turn 1's Planning Phase: Earl goes out next turn, Ruby stays behind.
  await skipToPhase(page, 'Planning');
  await page.getByRole('button', { name: 'Next: Assign Project Team' }).click();
  await page.getByRole('button', { name: 'Next: Assign Rest and Healing' }).click();
  await page.getByRole('button', { name: 'Next: Assign Mission Team' }).click();
  await page
    .getByRole('group', { name: /on the mission team/i })
    .getByRole('checkbox', { name: /earl/i })
    .check();

  // The last step of Planning, so the next step is already the next phase and
  // the walk offers one button rather than two that do the same thing.
  await page.getByRole('button', { name: 'Next: Check for Rot' }).click();
  await page.getByRole('button', { name: 'End turn 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End turn 1' }).click();

  // Turn 2's Advancement Phase, where the team that just went is read back.
  await page.getByRole('button', { name: 'Skip to Advancement' }).click();

  const walk = page.getByRole('region', { name: 'Turn 2' });

  // Earl went, so Earl earns the mission's point; Ruby did not, so she is not
  // offered it at all.
  await expect(walk.getByText(/for going on the mission/i)).toContainText('1 of 1');
  await walk
    .getByRole('button', { name: /\+1 xp/i })
    .first()
    .click();
  await expect(walk.getByText(/for going on the mission/i)).toContainText('0 of 1');

  await page.getByRole('button', { name: 'Next: Create New Survivors' }).click();
  await page.getByRole('button', { name: 'Next: Add Materials to Storage' }).click();

  // Two materials recovered: a 4 is Food and a 10 is Rare.
  const rolled = walk.getByLabel(/^rolled$/i);
  await rolled.selectOption('4');
  await rolled.selectOption('10');
  await expect(walk.getByText(/\+1 Food/)).toBeVisible();
  await expect(walk.getByText(/\+1 Rare/)).toBeVisible();

  await walk.getByRole('button', { name: /add to storage/i }).click();
  await expect(walk.getByText(/already in storage/i)).toBeVisible();
  await expect(page.getByLabel(/^food$/i)).toHaveValue('1');
  await expect(page.getByLabel(/^rare$/i)).toHaveValue('1');

  const exported = await exportCampaign(page);
  expect(JSON.parse(exported.text)).toMatchObject({
    materials: { food: 1, rare: 1 },
    survivors: [{ name: 'Earl Rhodes', xp: 1 }, { name: 'Ruby Vance' }],
  });

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();

  // The step is not repeatable across a reload either, because what makes it
  // so is an entry in the log rather than a flag in this component.
  await expect(
    page.getByRole('region', { name: 'Turn 2' }).getByText(/already in storage/i),
  ).toBeVisible();

  await startFreshCampaign(page, 'Millbrook');
  await page.setInputFiles('input[type="file"]', exported.path);
  await page.getByRole('button', { name: /replace it/i }).click();

  const reExported = await exportCampaign(page);
  expect(reExported.text).toBe(exported.text);
});

/**
 * Z3-8's acceptance, executed: a pool shared equally, and the rule that makes
 * it an algorithm rather than a division.
 *
 * Two wounded survivors and a two-point Clinic. A division would give each of
 * them one; the rules give the one who needs more the second point, because the
 * one who fills up drops out of the distribution. Worth a journey because the
 * numbers come off three things a player sets up on three different screens —
 * who is staffing the Clinic, who is assigned to healing, and how hurt they
 * each are — where a unit test arranges all three in one object.
 */
test('a Clinic’s Health is shared out unequally, because equally means this', async ({ page }) => {
  await startCampaign(page, 'Cedar Hollow');

  await page.getByLabel(/choose a base/i).selectOption({ label: 'Small Town Home — Tier 1' });
  await page.getByRole('button', { name: /claim this base/i }).click();

  // Three Heroes: one to run the Clinic, two to be healed in it. Only Tier 4
  // has any Cooperation, and Medicine is governed by it (pg. 8).
  for (const name of ['Nell Haig', 'Tomas Ford', 'Ada Poole']) {
    await page.getByLabel(/survivor name/i).fill(name);
    await page.getByLabel(/^tier$/i).selectOption('4');
    await page.getByRole('button', { name: /add survivor/i }).click();
  }

  await page.getByLabel(/^hardware$/i).fill('9');
  // Adds two more survivors of its own and leaves the walk in the Planning
  // Phase, at the project team's step.
  await hireProjectTeam(page);

  await page.getByRole('button', { name: /build in garage/i }).click();
  await page.getByLabel(/^facility$/i).selectOption({ label: 'Medical Clinic' });
  await page.getByRole('button', { name: /build here/i }).click();

  /*
   * Nell learns Medicine and trains it to level 4, which is what the Clinic's
   * output is made of. A Skill Score is the governing stat plus the level
   * (pg. 8) and a Tier 4's Cooperation is 1, so a Score worth sharing has to be
   * bought — and a Clinic without Water halves whatever it makes (pg. 72), so
   * 1 + 4 becomes the three points this journey is about.
   */
  const roster = page.getByRole('region', { name: /community/i });
  await roster
    .getByRole('listitem')
    .filter({ hasText: 'Nell Haig' })
    .getByRole('button', { name: /^sheet$/i })
    .click();
  const nell = page.getByRole('region', { name: 'Nell Haig' });
  await nell.getByRole('button', { name: /^set experience$/i }).click();
  await page.getByLabel(/experience for nell haig/i).fill('20');
  await page.getByRole('button', { name: /save experience/i }).click();
  await nell
    .getByRole('row', { name: /^Medicine\b/ })
    .getByRole('button', { name: /^take\b/i })
    .click();
  for (const level of [1, 2, 3, 4]) {
    await nell
      .getByRole('button', { name: new RegExp(`raise medicine to level ${String(level)}`, 'i') })
      .click();
  }
  await nell.getByRole('button', { name: /^close sheet$/i }).click();

  // Wound the two: Tomas badly, Ada lightly. Four is a Hero's maximum (pg. 7).
  for (const [name, hp] of [
    ['Tomas Ford', '1'],
    ['Ada Poole', '3'],
  ] as const) {
    await roster
      .getByRole('listitem')
      .filter({ hasText: name })
      .getByRole('button', { name: /^sheet$/i })
      .click();
    const hurt = page.getByRole('region', { name });
    await hurt.getByRole('button', { name: /^set health$/i }).click();
    await page.getByLabel(new RegExp(`current health for ${name}`, 'i')).fill(hp);
    await page.getByRole('button', { name: /save health/i }).click();
    await hurt.getByRole('button', { name: /^close sheet$/i }).click();
  }

  // Back one step to staff the Clinic, which is Planning Step 1 (pg. 20).
  await page.getByRole('button', { name: 'Back to Assign Facility Staff' }).click();
  await page
    .getByRole('group', { name: /medical clinic/i })
    .getByRole('checkbox', { name: /nell/i })
    .check();

  await page.getByRole('button', { name: 'Next: Assign Project Team' }).click();
  await page.getByRole('button', { name: 'Next: Assign Rest and Healing' }).click();
  const healing = page.getByRole('group', { name: /being healed/i });
  await healing.getByRole('checkbox', { name: /tomas/i }).check();
  await healing.getByRole('checkbox', { name: /ada/i }).check();

  await page.getByRole('button', { name: 'Next: Assign Mission Team' }).click();
  await page.getByRole('button', { name: 'Next: Check for Rot' }).click();
  await page.getByRole('button', { name: 'End turn 1' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End turn 1' }).click();

  await page.getByRole('button', { name: 'Skip to Advancement' }).click();
  for (const step of ['Create New Survivors', 'Add Materials to Storage', 'Heal Wounds']) {
    await page.getByRole('button', { name: `Next: ${step}` }).click();
  }

  const walk = page.getByRole('region', { name: 'Turn 2' });

  // Three points. Ada needs one and takes one, then fills up and drops out;
  // Tomas needs three and takes the other two. A division would have given them
  // one and a half each, overhealing Ada and leaving Tomas short.
  await expect(walk.getByText(/Tomas Ford \+2 Health/)).toBeVisible();
  await expect(walk.getByText(/Ada Poole \+1 Health/)).toBeVisible();

  await walk.getByRole('button', { name: /heal wounds/i }).click();
  await expect(walk.getByText(/wounds are healed/i)).toBeVisible();

  const exported = await exportCampaign(page);
  const healed = (JSON.parse(exported.text).survivors as { name: string; currentHp: number }[]).map(
    ({ name, currentHp }) => [name, currentHp],
  );

  // The project team `hireProjectTeam` brought along is in here too, untouched
  // at full Health — which is the other half of the claim.
  expect(healed).toEqual([
    ['Nell Haig', 4],
    ['Tomas Ford', 3],
    ['Ada Poole', 4],
    ['Earl Rhodes', 4],
    ['Ruby Vance', 1],
  ]);

  await waitForAutosave(page, 'Cedar Hollow');
  await page.reload();

  // Not repeatable across a reload: what makes it so is the log, not this
  // component.
  await expect(
    page.getByRole('region', { name: 'Turn 2' }).getByText(/wounds are healed/i),
  ).toBeVisible();
});
