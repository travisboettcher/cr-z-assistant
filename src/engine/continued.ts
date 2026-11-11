/**
 * A campaign picked up partway (#210; `docs/continue-campaign.md`).
 *
 * Such a campaign starts at the beginning of a turn with one
 * `campaign-continued` entry holding what the log would otherwise know from
 * the turns before it. The readers that look back across turns (the siege
 * counter, last turn's Feed, the stories finished, the Magic and Viral
 * unlocks) each read it here beside the entries they read already, so the
 * answer comes from one function whether the history was played here or
 * entered.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { CampaignOrigin } from '../data/origins';
import { PROMOTION_STORIES } from '../data/missions';
import { SPELLS } from '../data/origins';
import {
  COMMON_SKILL_MAX_SCORE,
  COMMON_SKILL_START_SCORE,
  type CommonSkill,
  type Skill,
} from '../data/skills';
import type { Campaign, Survivor } from './campaign';
import { skillLevelMaximum } from './injuries';
import { accepted, refused, type FormResult } from './forms';
import { logged, type ContinuedHistory, type LogEntry } from './log';

/** The `campaign-continued` entry and the turn it was picked up at, or `undefined`. */
export function continuedFrom(
  campaign: Campaign,
): { readonly turn: number; readonly history: ContinuedHistory } | undefined {
  const entry = campaign.log.find(
    (one): one is LogEntry & { readonly event: { readonly kind: 'campaign-continued' } } =>
      one.event.kind === 'campaign-continued',
  );

  return entry === undefined
    ? undefined
    : { turn: entry.turn, history: entry.event as ContinuedHistory };
}

/** The turn a campaign is picked up at, and what it brings from before (#210). */
export interface ContinuedStart {
  readonly turn: number;
  readonly history: ContinuedHistory;
}

/** A whole number, at least this. */
function wholeFrom(value: number | undefined, least: number): boolean {
  return value === undefined || (Number.isInteger(value) && value >= least);
}

/**
 * Why a campaign can't be picked up with these answers, or `null`: from turn
 * 2, with a siege counter no longer than the turns played, whole numbers
 * throughout, each story and spell once, and an origin's history only under
 * that origin (#210).
 */
export function continuedProblem(
  start: ContinuedStart,
  origin: CampaignOrigin | undefined,
): string | null {
  const { turn, history } = start;

  if (!Number.isInteger(turn) || turn < 2) return 'A campaign is picked up at turn 2 or later.';
  if (!wholeFrom(history.turnsSinceSiege, 0) || history.turnsSinceSiege > turn - 1) {
    return `The turns since the last siege are a whole number from 0 to ${String(turn - 1)}.`;
  }
  if (!wholeFrom(history.siegeCalledAt, -Infinity)) return 'The Siege Threat is a whole number.';
  if (
    history.fed !== undefined &&
    !(wholeFrom(history.fed.hunger, 1) && wholeFrom(history.fed.population, 1))
  ) {
    return 'Last turn’s shortfall and head count are whole numbers, 1 or more.';
  }

  const stories = history.storiesDone ?? [];
  if (
    stories.some(
      (story, at) =>
        !(PROMOTION_STORIES as readonly string[]).includes(story) || stories.indexOf(story) !== at,
    )
  ) {
    return 'Each story is finished once.';
  }

  const magic =
    history.spellsSeen !== undefined ||
    history.graveyardDone !== undefined ||
    history.necromancerWins !== undefined ||
    history.necromancerKilled !== undefined ||
    history.discountsUsed !== undefined;
  if (magic && origin !== 'magic') return 'Only a Magic campaign has spells and The Necromancer.';

  const spells = history.spellsSeen ?? [];
  if (spells.some((spell, at) => !SPELLS.includes(spell) || spells.indexOf(spell) !== at)) {
    return 'Each spell is seen once.';
  }
  if (!wholeFrom(history.necromancerWins, 0) || !wholeFrom(history.discountsUsed, 0)) {
    return 'The Necromancer’s wins and discounts are whole numbers, 0 or more.';
  }
  if ((history.discountsUsed ?? 0) > (history.necromancerWins ?? 0)) {
    return 'No more discounts are spent than The Necromancer was won.';
  }

  if (history.containmentHardware !== undefined && origin !== 'viral') {
    return 'Only a Viral campaign has Containment.';
  }
  if (!wholeFrom(history.containmentHardware, 0)) {
    return 'Containment’s Hardware is a whole number, 0 or more.';
  }

  return null;
}

/**
 * A new campaign moved to the start of the turn it is picked up at, with the
 * entry that says so (#210). Its starting community is entered as it stands,
 * so it is not checked against the ten Tier levels. Assumes
 * `continuedProblem` passed.
 */
export function withContinued(campaign: Campaign, start: ContinuedStart, at: string): Campaign {
  return logged(
    { ...campaign, turn: start.turn, step: 'select-mission', startingCommunityBuilt: true },
    at,
    { kind: 'campaign-continued', ...start.history },
  );
}

/**
 * Whether a campaign picked up partway is still being set up (#210): from its
 * `campaign-continued` entry until `setting-up-finished`. While it is, the
 * survivors' skill levels, the base and last turn's orders are placed free,
 * and the turn owes the setting up before anything else. Never for a campaign
 * started at turn 1.
 */
export function settingUp(campaign: Campaign): boolean {
  return (
    continuedFrom(campaign) !== undefined &&
    !campaign.log.some(({ event }) => event.kind === 'setting-up-finished')
  );
}

/** Finish setting up a campaign picked up partway (#210). */
export function submitSettingUpFinished(campaign: Campaign, at: string): FormResult {
  if (!settingUp(campaign)) return refused('Only a campaign picked up partway is set up.');

  return accepted(logged(campaign, at, { kind: 'setting-up-finished' }));
}

/** The campaign with one survivor changed, or the reason they can't be set up. */
function setUp(
  campaign: Campaign,
  id: string,
  change: (survivor: Survivor) => Survivor | string,
): FormResult {
  if (!settingUp(campaign)) {
    return refused('Levels are set like this only while a campaign picked up partway is set up.');
  }

  const survivor = campaign.survivors.find((one) => one.id === id);
  if (survivor === undefined) return refused('Only somebody in the community is set up.');

  const changed = change(survivor);
  if (typeof changed === 'string') return refused(changed);

  return accepted({
    ...campaign,
    survivors: campaign.survivors.map((one) => (one.id === id ? changed : one)),
  });
}

/**
 * Set a skill a survivor has to a level while setting up, without its XP
 * (#210): from 0 to the most their Tier and injuries allow (pg. 8). No entry,
 * as no edit on the sheet has one.
 */
export function submitSkillLevelSet(
  campaign: Campaign,
  id: string,
  skill: Skill,
  level: number,
): FormResult {
  return setUp(campaign, id, (survivor) => {
    if (survivor.skills[skill] === undefined) return `${survivor.name} doesn’t have that skill.`;

    const most = skillLevelMaximum(survivor, skill);
    if (!Number.isInteger(level) || level < 0 || level > most) {
      return `${survivor.name}’s level is a whole number from 0 to ${String(most)}.`;
    }

    return { ...survivor, skills: { ...survivor.skills, [skill]: level } };
  });
}

/**
 * Set a common skill's Score while setting up, without its XP (#210): from
 * where it starts to its most (pg. 9).
 */
export function submitCommonSkillSet(
  campaign: Campaign,
  id: string,
  skill: CommonSkill,
  score: number,
): FormResult {
  return setUp(campaign, id, (survivor) =>
    Number.isInteger(score) && score >= COMMON_SKILL_START_SCORE && score <= COMMON_SKILL_MAX_SCORE
      ? { ...survivor, [skill]: score }
      : `${survivor.name}’s Score is a whole number from ${String(COMMON_SKILL_START_SCORE)} to ${String(COMMON_SKILL_MAX_SCORE)}.`,
  );
}
