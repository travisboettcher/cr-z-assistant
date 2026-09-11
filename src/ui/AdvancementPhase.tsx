/**
 * The Advancement Phase's five steps (pp. 18–19).
 *
 * Character Advancement → Create New Survivors → Add Materials to Storage →
 * Heal Wounds → Add Facilities and Upgrades. Three of them were already built
 * and had nowhere to happen: Phase 1's XP spending, Phase 2's building, and
 * Phase 1's recruiting. This story does not move those screens — it gives each
 * one a step that points at it, and builds the two that did not exist.
 *
 * **The screens this phase points at stay where they are.** A roster is useful
 * on every step of the turn and a base map is the map; dragging either inside a
 * step would hide it for the other eighteen. What a step owes the player is the
 * *rule* — what happens here, in what order, and how much of it is left — and a
 * short way to the screen that does it.
 */

import { useState } from 'react';
import { MATERIALS, type Material } from '../data/materials';
import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  SUBSTITUTION_SKILLS,
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
import { checkXpAward, xpPools } from '../engine/experience';
import { useCampaign } from '../state/useCampaign';
import { MATERIAL_LABELS } from './baseLabels';
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

      {step === 'heal-wounds' && (
        <p className={HINT}>
          Health from a Medical Clinic is shared out here, and a resting survivor takes the point
          they generated. Not built yet — work it on paper and move on <PageRef pages={19} />
        </p>
      )}

      {step === 'add-facilities-and-upgrades' && (
        <p className={HINT}>
          This is the step projects finish in. Build, upgrade and clear on the base below — the app
          lets you do it on any step, and says so where it happens rather than refusing
          <PageRef pages={19} />
        </p>
      )}
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
          const left = pool.total - pool.awarded;

          return (
            <li key={pool.source}>
              <p className="text-sm font-medium">
                {XP_SOURCE_LABELS[pool.source]}{' '}
                <span className="font-normal text-stone-600 tabular-nums dark:text-stone-400">
                  — {left} of {pool.total} left
                </span>
              </p>

              {pool.total === 0 ? (
                <p className={`mt-1 ${HINT}`}>{XP_SOURCE_EMPTY[pool.source]}</p>
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
        <p className="mt-3 text-sm font-medium">
          This turn’s materials are already in storage. Stepping back through the walk will not add
          them twice.
        </p>
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
const XP_SOURCE_EMPTY: Record<XpSource, string> = {
  mission: 'Nobody is on a mission team, so there is no mission XP this turn.',
  discretionary: 'A Teacher on the mission takes this point and hands it out instead.',
  'mission-teaching': 'Nobody on the mission team has Teaching.',
  'training-room': 'No staffed Training Room, so nothing to teach with.',
};
