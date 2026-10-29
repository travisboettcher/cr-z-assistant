/**
 * The Advancement Phase's forms (pp. 18–19), each guard, change and entry in
 * one place (#179).
 *
 * Experience first — XP handed out from the four sources, then spent on the
 * three purchases or a new skill taken into an open slot — and then the base's
 * turn: the haul into storage, a conversion run, and Heal Wounds. The projects
 * the last Planning Phase ordered also finish in this phase, and are still the
 * reducer's; see the note in `campaignStore.ts`.
 *
 * Moved out of `campaignStore.ts` without changing what any of them accepts or
 * refuses. The shape of what they return is `forms.ts`'s.
 *
 * Pure, like the rest of `src/engine`: rolls are the table's, the clock is the
 * caller's.
 */

import type { StoryMissionId } from '../data/missions';
import { becomesVeteran, storiesOnOffer } from './traits';
import type { Material } from '../data/materials';
import type { SpellId } from '../data/origins';
import { MIN_SKILL_LEVEL, type CommonSkill, type Skill, type Stat } from '../data/skills';
import { XP_AWARD, type XpSource } from '../data/turn';
import {
  commonSkillPurchase,
  skillLevelPurchase,
  tierPurchase,
  withCommonSkillBought,
  withSkillLevelBought,
  withTierBought,
  type PurchaseBlock,
} from './advancement';
import type { Campaign, Item, Survivor } from './campaign';
import { claimedBase } from './claim';
import { checkConversion, conversions, withConversion } from './conversions';
import { checkXpAward, withXpAwarded } from './experience';
import { accepted, blockedBy, refused, type FormResult, type Refused } from './forms';
import { healedFromZero, withHumanityGained } from './humanity';
import { madnessAwards, madnessRecovered, withMadnessTaken } from './lounge';
import { spellLearningProblem, withSpellLearned } from './spells';
import { phaseOf } from './turn';
import {
  containmentDraws,
  healthAwards,
  withInfectionContained,
  withInfectionSpent,
  withWoundsHealed,
  woundsHealed,
} from './healing';
import { logged, type CampaignEvent } from './log';
import {
  baseProduction,
  combined,
  foraged,
  materialsAdded,
  recovered,
  scavenged,
  scavenger,
  withMaterialsAdded,
  gathered,
  gatheredSubstitutionProblem,
  madeTens,
  type GatheredSubstitution,
  type MaterialRoll,
} from './materials';
import { convoyTensDue } from './storyRewards';
import { rareRollsProblem, withItemsFound, type RareItemRoll } from './finding';
import {
  inoculateProblem,
  rotResistanceProblem,
  withInoculated,
  withRotResisted,
} from './inoculation';
import { installProblem, withRareUpgradeInstalled } from './install';
import { turnoutGear, withEquipmentHandedOver } from './handover';
import {
  lostInOverrun,
  moveProblem,
  rebuildAfterMove,
  storesAfterMove,
  withBaseMoved,
} from './move';

/** This turn's haul, as the table rolled it (pp. 17–19). */
export interface HaulForm {
  /**
   * The mission's rolls rather than their total, so the arithmetic that turns a
   * die into a material stays in `materials.ts` where the substitution rule
   * lives.
   */
  readonly rolls: readonly MaterialRoll[];

  /**
   * Substitutions spent on what Gather Materials teams brought back without a
   * roll, each replacing one of a team's one of each (pp. 12, 80; FAQ "Gather
   * Materials and Coop Skills"; #221). Absent is none.
   */
  readonly gatheredSubstitutions?: readonly GatheredSubstitution[];

  /**
   * The one thing about the haul the campaign cannot work out: a scavenger
   * without the Scavenge skill brings back one material of a type the *player*
   * picks (pg. 17). Ignored with the skill, and with nobody scavenging.
   */
  readonly scavenged?: Material | undefined;

  /**
   * The Rare Item Table's dice, two for each unforced 10 among the rolls and
   * for each roll a save from before v17 owes (pp. 19, 43; R49; Z5-7), with
   * the ids their items will have. Absent is none.
   */
  readonly rareItems?: readonly RareItemRoll[];
}

/**
 * Put this turn's haul in storage — the mission's rolls, what a Gather
 * Materials team brought back without one (pg. 80; Z4-6) with any
 * substitutions on its one of each (#221), what the base made,
 * and a scavenger's find (pp. 17–19). Once a turn: the step is destructive and
 * the walk can go back over it.
 *
 * Two entries where somebody scavenged, the haul first, so the history reads in
 * the order the step happened: what went into storage, and then what one
 * survivor's turn away from the mission was worth. Then an `item-found` for
 * each Rare Item Table roll, which every 10 and every roll a save from before
 * v17 owes must bring (Z5-7).
 */
export function submitHaul(campaign: Campaign, form: HaulForm, at: string): FormResult {
  if (materialsAdded(campaign)) return refused('This turn’s haul is already in storage.');

  // Crashed Convoy's 10s, no more than it gives and never on a forced roll (R126).
  if (madeTens(form.rolls) > convoyTensDue(campaign)) {
    return refused(
      convoyTensDue(campaign) === 0
        ? 'No story makes a roll a 10 this turn.'
        : `Crashed Convoy makes ${String(convoyTensDue(campaign))} rolls 10s, and no more.`,
    );
  }
  if (form.rolls.some((entry) => entry.madeTen === true && entry.forced !== undefined)) {
    return refused('A roll made a 10 is not forced as well.');
  }

  const rareItems = form.rareItems ?? [];
  const rare = rareRollsProblem(campaign, form.rolls, rareItems);
  if (rare !== null) return refused(rare);

  // Only a team's one of each, and once each (FAQ "Gather Materials and Coop
  // Skills"; #221). Spending more uses than a Score is `checkMaterials`'s
  // warning, as it is for the rolls.
  const substitutions = form.gatheredSubstitutions ?? [];
  const substituting = gatheredSubstitutionProblem(campaign, substitutions);
  if (substituting !== null) return refused(substituting);

  const found = scavenged(campaign, form.scavenged);
  // Forager's Food with the haul (R164; Z7-10).
  const adding = combined(
    combined(
      combined(
        combined(recovered(form.rolls), gathered(campaign, substitutions)),
        baseProduction(campaign),
      ),
      found,
    ),
    foraged(campaign),
  );
  const stored = logged(withMaterialsAdded(campaign, adding), at, {
    kind: 'materials-added',
    ...adding,
  });

  const survivor = scavenger(campaign);
  const withFind =
    survivor === undefined
      ? stored
      : logged(stored, at, {
          kind: 'materials-scavenged',
          survivor: survivor.id,
          name: survivor.name,
          ...found,
        });

  // What the Rare Item Table found, after the materials, as the step reads.
  return accepted(withItemsFound(withFind, rareItems, at));
}

/**
 * Which conversion to run (pp. 19, 72–73): named by where it lives rather than
 * by what it trades, because a base can hold two Kitchens and "2 Fuel for 1
 * Food" does not say which one was used.
 */
export interface ConversionForm {
  readonly slot: string;

  /** The facility or upgrade in that slot doing the converting. */
  readonly source: string;
}

/**
 * Run one facility or upgrade's conversion (pp. 19, 72–73).
 *
 * Refused when the base has no such conversion, and when `checkConversion`
 * blocks it — the materials are not there, or the book's cap for this turn is
 * spent. Both are blockers rather than warnings: a store cannot go negative,
 * and a stated cap is a rule rather than advice.
 */
export function submitConversion(campaign: Campaign, form: ConversionForm, at: string): FormResult {
  const conversion = conversions(campaign).find(
    (candidate) => candidate.slot === form.slot && candidate.source.id === form.source,
  );
  if (conversion === undefined) return refused('Nothing in that slot converts that way.');

  const problem = blockedBy(checkConversion(campaign, conversion));
  if (problem !== null) return refused(problem);

  return accepted(
    logged(withConversion(campaign, conversion), at, {
      kind: 'materials-converted',
      slot: conversion.slot,
      source: conversion.source.id,
      spent: conversion.exchange.spend,
      gained: conversion.exchange.gain as Partial<Record<Material, number>>,
    }),
  );
}

/**
 * Share out a turn's Health, in the Heal Wounds step (pg. 19). Once a turn: the
 * step raises Health and the walk can go back over it.
 *
 * `infection` is the player's one decision here under the Viral origin — how
 * many of an award's points remove Infection instead of closing a wound
 * (pp. 19, 123) — keyed by `awardKey`. Empty means Health first, which is every
 * campaign that is not Viral. Each number is held to `infectionRange` by
 * `withInfectionSpent` rather than trusted.
 *
 * One entry per survivor, so the history says who recovered rather than what
 * the Clinic made. Folded rather than pushed, because `logged` stamps each
 * entry against the campaign it is appending to. The Infection count only where
 * a point went on it, so every entry a campaign that is not Viral writes is the
 * entry it always wrote.
 */
export function submitHealing(
  campaign: Campaign,
  infection: Readonly<Record<string, number>>,
  at: string,
): FormResult {
  if (woundsHealed(campaign)) return refused('This turn’s Health has already been shared out.');

  const awards = withInfectionSpent(healthAwards(campaign), infection);
  const healed = awards.reduce(
    (healing, award) =>
      logged(healing, at, {
        kind: 'health-restored',
        survivor: award.survivor.id,
        name: award.survivor.name,
        health: award.health,
        source: award.source,
        ...(award.infection > 0 ? { infection: award.infection } : {}),
      }),
    withWoundsHealed(campaign, awards),
  );
  // Then Containment, on what the points left (R103).
  const draws = containmentDraws(campaign, awards);

  const contained = draws.reduce(
    (drawn, draw) =>
      logged(drawn, at, {
        kind: 'infection-contained',
        survivor: draw.survivor.id,
        name: draw.survivor.name,
        infection: draw.infection,
      }),
    withInfectionContained(healed, draws),
  );

  // Healed from 0 Health, 1 Humanity each (R114; Z7-9).
  return accepted(
    withHumanityGained(contained, healedFromZero(campaign, contained), 'healed-from-0', at),
  );
}

/** One point of XP for one survivor, from one of the four sources (pg. 18). */
export interface XpAwardForm {
  readonly survivor: string;
  readonly source: XpSource;
}

/**
 * Give a survivor one XP (pg. 18).
 *
 * One survivor and one point at a time, because that is how the book hands it
 * out and because both 2-XP caps count per survivor per source. Asked of
 * `checkXpAward` rather than trusted from the screen — a pool that has run out
 * is a blocker, and awarding past it would invent XP.
 */
export function submitXpAward(campaign: Campaign, form: XpAwardForm, at: string): FormResult {
  return withSurvivorEdited(campaign, form.survivor, at, (survivor) => {
    const problem = blockedBy(checkXpAward(campaign, form.survivor, form.source));
    if (problem !== null) return refused(problem);

    const awarded = withXpAwarded(survivor, XP_AWARD);
    // What went to their experience debt instead (R94), so the history says why
    // the XP didn't move.
    const toDebt = survivor.xpDebt - awarded.xpDebt;

    return {
      survivor: awarded,
      event: {
        kind: 'xp-awarded',
        survivor: survivor.id,
        name: survivor.name,
        amount: XP_AWARD,
        source: form.source,
        ...(toDebt > 0 ? { toDebt } : {}),
      },
    };
  });
}

/** The next level of a skill the survivor already has (pg. 18). */
export interface SkillLevelForm {
  readonly survivor: string;
  readonly skill: Skill;
}

/**
 * Spend XP on the next level of a skill (pg. 18).
 *
 * The three purchases carry no price: the cost is a rule, and each
 * `with*Bought` in `advancement.ts` re-runs its own purchase check. The refusal
 * is read off that same check, so the two cannot disagree about whether a
 * purchase went through.
 */
export function submitSkillLevel(campaign: Campaign, form: SkillLevelForm, at: string): FormResult {
  return withSurvivorEdited(campaign, form.survivor, at, (survivor) => {
    const { blocked } = skillLevelPurchase(survivor, form.skill);
    if (blocked !== null) return refused(PURCHASE_BLOCKED[blocked]);

    const bought = withSkillLevelBought(survivor, form.skill);

    return {
      survivor: bought,
      event: {
        kind: 'skill-level-bought',
        survivor: survivor.id,
        name: survivor.name,
        skill: form.skill,
        // The level reached, read off the result rather than worked out here:
        // what a purchase buys is `advancement.ts`'s to say.
        level: bought.skills[form.skill] ?? 0,
      },
    };
  });
}

/** One more point of Move or Defense (pg. 18). */
export interface CommonSkillForm {
  readonly survivor: string;
  readonly skill: CommonSkill;
}

/** Spend XP on one more point of Move or Defense (pg. 18). */
export function submitCommonSkill(
  campaign: Campaign,
  form: CommonSkillForm,
  at: string,
): FormResult {
  return withSurvivorEdited(campaign, form.survivor, at, (survivor) => {
    const { blocked } = commonSkillPurchase(survivor, form.skill);
    if (blocked !== null) return refused(PURCHASE_BLOCKED[blocked]);

    const bought = withCommonSkillBought(survivor, form.skill);

    return {
      survivor: bought,
      event: {
        kind: 'common-skill-bought',
        survivor: survivor.id,
        name: survivor.name,
        skill: form.skill,
        score: bought[form.skill],
      },
    };
  });
}

/** A promotion one Tier up (pg. 18). */
export interface PromotionForm {
  readonly survivor: string;

  /**
   * The stat the player chose to lift off 0, or `null` where there was nothing
   * to choose — which `tierPurchase` re-checks, and blocks if there was.
   */
  readonly raise: Stat | null;

  /**
   * The story this promotion attaches, from `storiesOnOffer` (pg. 87; R117).
   * Needed whenever one is on offer, as the stat choice is: a block, not a
   * default.
   */
  readonly story?: StoryMissionId;
}

/** Spend XP on promoting a survivor one Tier, rebuilding their stats (pg. 18). */
export function submitPromotion(campaign: Campaign, form: PromotionForm, at: string): FormResult {
  return withSurvivorEdited(campaign, form.survivor, at, (survivor) => {
    const { blocked } = tierPurchase(survivor, form.raise);
    if (blocked !== null) return refused(PURCHASE_BLOCKED[blocked]);

    // A Tier 1 or 2 takes a story on (R117), one nobody else holds (R136); a
    // Tier 3 becomes a Veteran (pg. 87).
    const offered = storiesOnOffer(campaign, survivor);
    const story = form.story;
    if (offered.length > 0 && !offered.some((one) => one === story)) {
      return refused('Choose the story this promotion attaches.');
    }
    if (offered.length === 0 && story !== undefined) {
      return refused('This promotion attaches no story.');
    }

    const veteran = becomesVeteran(survivor);
    const bought = withTierBought(survivor, form.raise);
    const promoted = {
      ...bought,
      ...(veteran ? { veteran: true } : {}),
      stories:
        story === undefined
          ? bought.stories
          : [...bought.stories, { mission: story, attachedOnTurn: campaign.turn }],
    };

    return {
      survivor: promoted,
      event: {
        kind: 'survivor-promoted',
        survivor: survivor.id,
        name: survivor.name,
        tier: promoted.tier,
        ...(story === undefined ? {} : { story }),
        ...(veteran ? { veteran: true as const } : {}),
      },
    };
  });
}

/** A skill taken into a slot, at level 0 (pg. 8). */
export interface NewSkillForm {
  readonly survivor: string;
  readonly skill: Skill;
}

/**
 * Take a skill, at level 0 — skills all start there (pg. 8).
 *
 * **Writes no entry.** Taking a skill is a slot decision that costs nothing,
 * and the sheet uses the same control to repair a survivor typed in wrong; the
 * purchase that follows it is what the log records. Refused only for somebody
 * who is not on the roster — what fits in a survivor's slots is
 * `skillSlotsAreFull`'s to warn about, as it always has been, rather than this
 * form's to refuse.
 */
export function submitNewSkill(campaign: Campaign, form: NewSkillForm): FormResult {
  if (!campaign.survivors.some((survivor) => survivor.id === form.survivor)) {
    return refused(NOT_ON_THE_ROSTER);
  }

  return accepted({
    ...campaign,
    survivors: campaign.survivors.map((survivor) =>
      survivor.id === form.survivor
        ? { ...survivor, skills: { ...survivor.skills, [form.skill]: MIN_SKILL_LEVEL } }
        : survivor,
    ),
  });
}

/**
 * Why each purchase block stops a purchase, as a sentence.
 *
 * Its own wording rather than the sheet's, which is a fragment written to sit
 * under a greyed-out button; the engine cannot import the UI's, and the sheet
 * does not show these.
 */
const PURCHASE_BLOCKED: Record<PurchaseBlock, string> = {
  'in-debt': 'Their experience debt is paid off before any XP is spent.',
  'not-enough-xp': 'They don’t have the experience for this yet.',
  'at-tier-maximum': 'That skill is already at the highest level their Tier allows.',
  'at-score-maximum': 'That Score is already at its maximum.',
  'skill-not-taken': 'They haven’t taken that skill.',
  'already-a-hero': 'A Hero has no higher Tier to reach.',
  'stat-choice-required': 'Choose which stat the promotion lifts off zero.',
};

const NOT_ON_THE_ROSTER = 'Only somebody in the community can be changed.';

/**
 * One survivor changed and the change recorded, or neither.
 *
 * The edit returns the event alongside the new survivor rather than this
 * working one out afterwards, because the interesting fields (the level
 * reached, the Tier reached) are on the *result*, and the name is on the
 * survivor as they were before. By id rather than by index: removals reorder
 * the roster, and an index captured a render ago edits whoever moved into it.
 */
function withSurvivorEdited(
  campaign: Campaign,
  id: string,
  at: string,
  edit: (survivor: Survivor) => { survivor: Survivor; event: CampaignEvent } | Refused,
): FormResult {
  const found = campaign.survivors.find((survivor) => survivor.id === id);
  if (found === undefined) return refused(NOT_ON_THE_ROSTER);

  const done = edit(found);
  // A refusal is the only thing the edit can return that carries `ok`.
  if ('ok' in done) return done;

  return accepted(
    logged(
      {
        ...campaign,
        survivors: campaign.survivors.map((survivor) =>
          survivor.id === id ? done.survivor : survivor,
        ),
      },
      at,
      done.event,
    ),
  );
}

/**
 * Move into the base this turn's Claim a New Base won, sending these Heroes
 * away (pp. 19, 54, 79; R25, R31, R32; Z4-8).
 *
 * Refused for whatever `moveProblem` says. One entry, naming the base left and
 * the base moved into, and every Hero set aside as the roster had them.
 */
export function submitBaseMove(
  campaign: Campaign,
  leaving: readonly string[],
  at: string,
): FormResult {
  const problem = moveProblem(campaign, leaving);
  if (problem !== null) return refused(problem);

  // Both present by now: `moveProblem` refuses a turn with no claim won and a
  // community with no base to leave.
  const from = (campaign.base as NonNullable<Campaign['base']>).id;
  const to = claimedBase(campaign) as NonNullable<ReturnType<typeof claimedBase>>;

  const stores = storesAfterMove(campaign);
  const rebuild = rebuildAfterMove(campaign);
  const lost = lostInOverrun(campaign);

  const moved = logged(withBaseMoved(campaign, leaving), at, {
    kind: 'base-moved',
    from,
    to,
    setAside: campaign.survivors
      .filter((survivor) => leaving.includes(survivor.id))
      .map((survivor) => ({ survivor: survivor.id, name: survivor.name })),
    ...(stores === null ? {} : { stores }),
    ...(rebuild === null ? {} : { rebuild }),
  });

  // What stayed in the overrun base, an entry of its own when there was any
  // (R53, R78, R79).
  const left =
    lost === null ||
    (lost.items.length === 0 && lost.vehicles.length === 0 && lost.trades.length === 0)
      ? moved
      : logged(moved, at, { kind: 'overrun-lost', ...lost });

  // Moving into a Regional Firehouse hands over its Turnout Gear (R46; Z5-8).
  return accepted(withEquipmentHandedOver(left, to, turnoutGear(left, to), at));
}

/**
 * Install a rare upgrade from the base's Inventory in a standing facility of
 * its kind, at Add Facilities and Upgrades (pg. 49; R47; Z5-8). Refused for
 * whatever `installProblem` says.
 */
export function submitRareUpgradeInstalled(
  campaign: Campaign,
  id: string,
  slot: string,
  at: string,
): FormResult {
  const problem = installProblem(campaign, id, slot);
  if (problem !== null) return refused(problem);

  // Present: `installProblem` found it in the Inventory.
  const item = campaign.inventory.find((held) => held.id === id) as Item;

  return accepted(
    logged(withRareUpgradeInstalled(campaign, id, slot), at, {
      kind: 'rare-upgrade-installed',
      id,
      item: item.item,
      grade: item.grade,
      slot,
    }),
  );
}

/**
 * Give a survivor the Inoculation chosen for them, at Heal Wounds in place of
 * their healing (pg. 48; R97; Z7-5): the item used up, and the survivor Rot
 * Resistant. Refused for whatever `inoculateProblem` refuses.
 */
export function submitInoculated(campaign: Campaign, survivor: string, at: string): FormResult {
  const problem = inoculateProblem(campaign, survivor);
  if (problem !== null) return refused(problem);

  return accepted(withInoculated(campaign, survivor, at));
}

/**
 * Rot Resistant takes 1 Infection off everybody who has it, at the start of
 * the Advancement Phase (pg. 140; R96; Z7-5), once a turn. Refused for
 * whatever `rotResistanceProblem` refuses.
 */
export function submitRotResisted(campaign: Campaign, at: string): FormResult {
  const problem = rotResistanceProblem(campaign);
  if (problem !== null) return refused(problem);

  return accepted(withRotResisted(campaign, at));
}

/**
 * Hand out this turn's Madness Recovery at Heal Wounds (pp. 21, 68; R110;
 * Z7-7): each award's Madness off, an entry each. Once a turn, in the
 * Advancement Phase, and only with something to hand out.
 */
export function submitMadnessRecovered(campaign: Campaign, at: string): FormResult {
  if (phaseOf(campaign.step) !== 'advancement') {
    return refused('Madness Recovery is handed out in the Advancement Phase.');
  }
  if (madnessRecovered(campaign)) return refused('This turn’s Madness Recovery is done.');

  const awards = madnessAwards(campaign);
  if (awards.length === 0) return refused('Nobody has Madness the Lounge can take off this turn.');

  return accepted(
    awards.reduce(
      (recovered, award) =>
        logged(recovered, at, {
          kind: 'madness-recovered',
          survivor: award.survivor.id,
          name: award.survivor.name,
          madness: award.madness,
        }),
      withMadnessTaken(campaign, awards),
    ),
  );
}

/** A spell learned at the Mystic Library (pg. 70; R113; Z7-9). */
export interface SpellForm {
  readonly survivor: string;
  readonly spell: SpellId;
}

/**
 * Learn a spell at Character Advancement (pg. 70; R113; Z7-9): refused for
 * whatever `spellLearningProblem` says, and otherwise paid for, known and
 * logged.
 */
export function submitSpellLearned(campaign: Campaign, form: SpellForm, at: string): FormResult {
  const problem = spellLearningProblem(campaign, form.survivor, form.spell);
  if (problem !== null) return refused(problem);

  return accepted(withSpellLearned(campaign, form.survivor, form.spell, at));
}
