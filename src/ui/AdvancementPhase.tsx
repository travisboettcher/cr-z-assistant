/**
 * The Advancement Phase's five steps (pp. 18–19).
 *
 * Character Advancement → Create New Survivors → Add Materials to Storage →
 * Heal Wounds → Add Facilities and Upgrades. Two of them point at screens that
 * were already built and had nowhere in the turn to happen — Phase 1's
 * recruiting and Phase 2's building — and three do the work themselves.
 *
 * **The screens this phase points at stay where they are.** A roster is useful
 * on every step of the turn and a base map is the map; dragging either inside a
 * step would hide it for the other eighteen. What a step owes the player is the
 * *rule* — what happens here, in what order, and how much of it is left — and a
 * short way to the screen that does it.
 */

import { useState } from 'react';
import { MATERIALS, type Material, type Materials } from '../data/materials';
import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  SUBSTITUTION_SKILLS,
  type HealthSource,
  type SubstitutionSkill,
  type TurnStepId,
  type XpSource,
} from '../data/turn';
import type { Campaign } from '../engine/campaign';
import {
  baseProduction,
  canForce,
  checkMaterials,
  combined,
  materialsAdded,
  recovered,
  substitutionUses,
  substitutionsSpent,
  type MaterialRoll,
} from '../engine/materials';
import {
  checkConversion,
  conversions,
  gainedBy,
  spentBy,
  timesConverted,
  type Conversion,
} from '../engine/conversions';
import { checkXpAward, xpPools, type XpPoolEmptiness } from '../engine/experience';
import { checkHealing, healingPool, healthAwards, woundsHealed } from '../engine/healing';
import { dueProjects, isDue } from '../engine/projects';
import { describeProject } from './projectLabels';
import { useCampaign } from '../state/useCampaign';
import { MATERIAL_LABELS, builtThingLabel, slotLabel } from './baseLabels';
import { PageRef } from './PageRef';
import { SKILL_LABELS } from './skillLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface AdvancementPhaseProps {
  readonly campaign: Campaign;
  readonly step: TurnStepId;
}

const SMALL_BUTTON = `${FOCUS_RING} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600`;

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

export function AdvancementPhase({ campaign, step }: AdvancementPhaseProps) {
  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      {step === 'character-advancement' && <CharacterAdvancement campaign={campaign} />}

      {step === 'create-new-survivors' && (
        <p className={HINT}>
          Strangers rescued on the mission join here, and a field recruit rolls for the skill they
          arrive with. Add them on the roster below <PageRef pages="18–19" />
        </p>
      )}

      {step === 'add-materials-to-storage' && <AddMaterials campaign={campaign} />}

      {step === 'heal-wounds' && <HealWounds campaign={campaign} />}

      {step === 'add-facilities-and-upgrades' && <FinishProjects campaign={campaign} />}
    </div>
  );
}

/**
 * Step 1: four pools, handed out a point at a time.
 *
 * A row per pool rather than a row per survivor, because the pools are what the
 * book distinguishes and three of the four have their own eligibility. The
 * spending is elsewhere — that is the character sheet, and has been since
 * Phase 1.
 */
function CharacterAdvancement({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const pools = xpPools(campaign);

  return (
    <>
      <p className={HINT}>
        XP arrives in the order the book awards it, and every point is a press. Spending it is on
        each survivor’s sheet <PageRef pages={18} />
      </p>

      <ul className="mt-3 flex flex-col gap-4">
        {pools.map((pool) => {
          /*
           * Floored, and the floor is the belt rather than the braces. What
           * used to put it below zero was the Planning Phase clearing the
           * mission team out from under an award already given — "-2 of 0
           * left" beside "nobody is on a mission team", two statements
           * contradicting each other and one of them impossible (issue #95).
           * That is fixed at the root, in `beforePlanning`. A pool can still
           * shrink under an award by a route nothing can stop — taking a
           * survivor off the roster after their point was handed out — and a
           * negative count of things left to hand out is not a state a screen
           * can ask anybody to act on.
           */
          const left = Math.max(0, pool.total - pool.awarded);

          return (
            <li key={pool.source}>
              <p className="text-sm font-medium">
                {XP_SOURCE_LABELS[pool.source]}{' '}
                <span className="font-normal text-stone-600 tabular-nums dark:text-stone-400">
                  — {left} of {pool.total} left
                </span>
              </p>

              {pool.total === 0 ? (
                <p className={`mt-1 ${HINT}`}>
                  {pool.emptyBecause === undefined ? null : XP_POOL_EMPTY[pool.emptyBecause]}
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {pool.eligible.map((survivor) => {
                    const { blockers } = checkXpAward(campaign, survivor.id, pool.source);

                    return (
                      <li key={survivor.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          disabled={blockers.length > 0}
                          className={SMALL_BUTTON}
                          onClick={() => {
                            dispatch({
                              type: 'advancement/xpAwarded',
                              survivor: survivor.id,
                              source: pool.source,
                              at: new Date().toISOString(),
                            });
                          }}
                        >
                          +1 XP
                        </button>
                        <span>{survivor.name}</span>
                        <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                          {survivor.xp} XP
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Step 3: the mission's rolls plus what the base made, accepted once.
 *
 * The rolls live in this component and nowhere else. They are a die on a table
 * — what the campaign records is the haul, and once it is in storage the rolls
 * are history. Storing them would be storing something derived from an event
 * that has already happened.
 */
function AddMaterials({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [rolls, setRolls] = useState<readonly MaterialRoll[]>([]);

  const done = materialsAdded(campaign);
  const fromMission = recovered(rolls);
  const fromBase = baseProduction(campaign);
  const total = combined(fromMission, fromBase);
  const { warnings } = checkMaterials(campaign, rolls);
  const spent = substitutionsSpent(rolls);

  return (
    <>
      <p className={HINT}>
        One d10 per material the mission recovered, entered as rolled — no materials, no roll. The
        base’s own production is added with it <PageRef pages="18–19" />
      </p>

      {done ? (
        <>
          <p className="mt-3 text-sm font-medium">
            This turn’s materials are already in storage. Stepping back through the walk will not
            add them twice.
          </p>

          <Conversions campaign={campaign} />
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium" htmlFor="material-roll">
              Rolled
            </label>
            <select
              id="material-roll"
              defaultValue=""
              className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-800`}
              onChange={(changed) => {
                const roll = Number(changed.target.value) as D10Result;
                setRolls((before) => [...before, { roll }]);
                changed.target.value = '';
              }}
            >
              <option value="" disabled>
                Add a roll
              </option>
              {D10_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </div>

          {rolls.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {rolls.map((entry, index) => (
                // Index-keyed, because two rolls of the same number with the
                // same substitution are the same value and have no identity of
                // their own — the same reason production lines are.
                <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="tabular-nums">Rolled {entry.roll}</span>
                  <ForceResult
                    campaign={campaign}
                    entry={entry}
                    spent={spent}
                    onChange={(forced) => {
                      setRolls((before) =>
                        before.map((candidate, at) =>
                          at === index
                            ? forced === null
                              ? { roll: candidate.roll }
                              : { roll: candidate.roll, forced }
                            : candidate,
                        ),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => {
                      setRolls((before) => before.filter((_, at) => at !== index));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-sm font-medium">Going into storage</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {MATERIALS.map((material) => (
              <li key={material} className={`${HINT} tabular-nums`}>
                {total[material] >= 0 ? '+' : ''}
                {total[material]} {MATERIAL_LABELS[material]}
                <span className="text-xs">
                  {' '}
                  ({fromMission[material]} recovered, {fromBase[material]} produced)
                </span>
              </li>
            ))}
          </ul>

          {warnings.map((warning) => (
            <p
              key={`${warning.code}-${warning.message}`}
              className="mt-2 text-xs text-amber-700 dark:text-amber-300"
            >
              {warning.message} <PageRef pages={warning.pages} />
            </p>
          ))}

          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
            onClick={() => {
              dispatch({
                type: 'advancement/materialsAdded',
                rolls,
                at: new Date().toISOString(),
              });
            }}
          >
            Add to storage
          </button>
        </>
      )}
    </>
  );
}

/**
 * The same step's second half: materials traded for other materials (pg. 19).
 *
 * **Shown only once the haul is in**, which is the book's ordering rather than
 * a convenience: pg. 19 applies conversions in this step, after production has
 * been added. Offering them first would let a player spend Fuel the base is
 * about to make.
 *
 * Nothing is automatic. A trade is worth taking some turns and not others, and
 * a base with both a Gas Range and a Biofuel Lab can run either way in the same
 * turn — so each one is a button, and the ones pressed are the ones applied.
 *
 * The Generator and the Well Pump also carry a conversion and are deliberately
 * absent: they buy a point of Power or Water, and a point bought here would be
 * cleared by this same turn's Planning Phase one phase later. `conversions.ts`
 * has the whole of that reasoning.
 */
function Conversions({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const available = conversions(campaign);

  if (available.length === 0) return null;

  return (
    <>
      <p className="mt-5 text-sm font-medium">
        Conversions <PageRef pages={19} />
      </p>
      <p className={`mt-1 ${HINT}`}>
        Applied after the haul, and only if you want them. Each press is one trade.
      </p>

      <ul className="mt-2 flex flex-col gap-2">
        {available.map((conversion) => {
          const { blockers } = checkConversion(campaign, conversion);
          const cap = conversion.exchange.maxPerTurn;
          const run = timesConverted(campaign, conversion);

          return (
            <li
              key={`${conversion.slot}-${conversion.source.id}`}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <button
                type="button"
                disabled={blockers.length > 0}
                className={SMALL_BUTTON}
                onClick={() => {
                  dispatch({
                    type: 'advancement/materialsConverted',
                    slot: conversion.slot,
                    source: conversion.source.id,
                    at: new Date().toISOString(),
                  });
                }}
              >
                {describeTrade(conversion)}
              </button>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {converterName(conversion)}
                {cap === undefined ? '' : `, ${String(run)} of ${String(cap)} this turn`}
              </span>
              {blockers.map((blocker) => (
                <span key={blocker.code} className="text-xs text-amber-700 dark:text-amber-300">
                  {blocker.message}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** "2 Fuel → 1 Food", built from the same amounts the trade spends and gains. */
function describeTrade(conversion: Conversion): string {
  const list = (amounts: Materials) =>
    MATERIALS.filter((material) => amounts[material] !== 0)
      .map((material) => `${String(amounts[material])} ${MATERIAL_LABELS[material]}`)
      .join(', ');

  return `${list(spentBy(conversion))} → ${list(gainedBy(conversion))}`;
}

/** Which slot it is in, so two Kitchens with a Gas Range each can be told apart. */
function converterName(conversion: Conversion): string {
  return `${builtThingLabel(conversion.source.id)} in the ${slotLabel(conversion.slot)}`;
}

/**
 * Step 4: a pool shared equally, and the points nobody else can use.
 *
 * The distribution is shown before it is applied, per survivor, because
 * "equally" is a rule a player at a table will want to check — and the whole
 * reason it is an algorithm rather than a division is that it stops looking
 * like a division the moment somebody fills up.
 */
function HealWounds({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const done = woundsHealed(campaign);
  const awards = healthAwards(campaign);
  const pool = healingPool(campaign);
  const { warnings } = checkHealing(campaign);

  return (
    <>
      <p className={HINT}>
        The base makes <span className="tabular-nums">{pool}</span> Health, shared{' '}
        <strong>equally</strong> among everybody assigned to healing — nobody takes a second point
        until everyone has had a first. A resting survivor’s point is their own{' '}
        <PageRef pages={19} />
      </p>

      {done ? (
        <p className="mt-3 text-sm font-medium">
          This turn’s wounds are healed. Stepping back through the walk will not heal them again.
        </p>
      ) : (
        <>
          {awards.length === 0 ? (
            <p className={`mt-3 ${HINT}`}>Nobody has a wound this step can close.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {awards.map((award) => (
                <li
                  key={`${award.survivor.id}-${award.source}`}
                  className="text-sm tabular-nums text-stone-600 dark:text-stone-400"
                >
                  {award.survivor.name} +{award.health} Health
                  <span className="text-xs">
                    {' '}
                    ({HEALTH_SOURCE_LABELS[award.source]}, to{' '}
                    {award.survivor.currentHp + award.health})
                  </span>
                </li>
              ))}
            </ul>
          )}

          {warnings.map((warning) => (
            <p key={warning.code} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {warning.message} <PageRef pages={warning.pages} />
            </p>
          ))}

          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
            onClick={() => {
              dispatch({ type: 'advancement/woundsHealed', at: new Date().toISOString() });
            }}
          >
            Heal wounds
          </button>
        </>
      )}
    </>
  );
}

const HEALTH_SOURCE_LABELS: Record<HealthSource, string> = {
  facility: 'shared out',
  rest: 'from resting',
};

/**
 * The substitution control for one roll (pg. 12).
 *
 * Every legal pairing is an option and none of them is hidden when its pool is
 * spent — the over-spend is a warning `checkMaterials` reports, not a refusal,
 * for the same reason the Planning Phase never disables a row: a miscounted
 * Skill Score is the player's to correct, and a control that vanishes cannot
 * tell them what it was for.
 */
function ForceResult({
  campaign,
  entry,
  spent,
  onChange,
}: {
  readonly campaign: Campaign;
  readonly entry: MaterialRoll;
  readonly spent: Record<SubstitutionSkill, number>;
  readonly onChange: (forced: { skill: SubstitutionSkill; material: Material } | null) => void;
}) {
  const options = SUBSTITUTION_SKILLS.flatMap((skill) =>
    MATERIALS.filter((material) => canForce(skill, material)).map((material) => ({
      skill,
      material,
      value: `${skill}:${material}`,
    })),
  ).filter(({ skill }) => substitutionUses(campaign, skill) > 0 || spent[skill] > 0);

  if (options.length === 0) return null;

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Force the result of this roll</span>
      <select
        value={entry.forced === undefined ? '' : `${entry.forced.skill}:${entry.forced.material}`}
        className={`${FOCUS_RING} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`}
        onChange={(changed) => {
          const picked = options.find((option) => option.value === changed.target.value);
          onChange(
            picked === undefined ? null : { skill: picked.skill, material: picked.material },
          );
        }}
      >
        <option value="">as rolled</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {SKILL_LABELS[option.skill]} → {MATERIAL_LABELS[option.material]}
          </option>
        ))}
      </select>
    </label>
  );
}

const XP_SOURCE_LABELS: Record<XpSource, string> = {
  mission: 'For going on the mission',
  discretionary: 'The discretionary point',
  'mission-teaching': 'From a Teacher on the mission',
  'training-room': 'From the Training Room',
};

/**
 * Why a pool is empty, which is more useful than an empty list.
 *
 * "No Teacher went out" and "everyone is on the mission team" are different
 * turns, and a player deciding whether the app is wrong needs to know which
 * one they are in.
 */
const XP_POOL_EMPTY: Record<XpPoolEmptiness, string> = {
  'nobody-went': 'Nobody is on a mission team, so there is no mission XP this turn.',
  'replaced-by-teaching': 'A Teacher on the mission takes this point and hands it out instead.',
  'nobody-qualifies': 'Nobody on the mission team has Teaching.',
  'score-is-nothing':
    'Somebody on the mission team has Teaching, but their combined Score comes to nothing — so this replaces the discretionary point and hands out none.',
  'nowhere-to-teach': 'No staffed Training Room, so nothing to teach with.',
  'wrong-person': 'The Training Room is staffed by somebody without Teaching.',
};

/**
 * Step 5: the projects the last Planning Phase ordered actually happen.
 *
 * Named before they are applied, because this is the step where a base changes
 * shape and a player should be able to see what is about to change. Nothing is
 * pressed for them: the walk can be stepped through by accident.
 */
function FinishProjects({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const due = dueProjects(campaign);
  const waiting = campaign.projects.filter((project) => !isDue(campaign, project));

  return (
    <>
      <p className={HINT}>
        Projects ordered in a Planning Phase finish here, the turn after they were ordered{' '}
        <PageRef pages={19} />
      </p>

      {due.length === 0 ? (
        <p className={`mt-3 ${HINT}`}>
          {waiting.length === 0
            ? 'Nothing was ordered, so nothing finishes this turn.'
            : 'Everything in the queue was ordered this turn, and finishes next turn.'}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium">Finishing now</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {due.map((project, at) => (
              // Index-keyed: two identical orders for one slot are two orders
              // and have no identity of their own.
              <li key={at} className={HINT}>
                {describeProject(project)}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
            onClick={() => {
              dispatch({ type: 'advancement/projectsCompleted', at: new Date().toISOString() });
            }}
          >
            Finish {due.length === 1 ? 'the project' : `${String(due.length)} projects`}
          </button>
        </>
      )}
    </>
  );
}
