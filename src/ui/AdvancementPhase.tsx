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

import { useId, useRef, useState } from 'react';
import { MATERIALS, type Material, type Materials } from '../data/materials';
import { D10_RESULTS, type D10Result } from '../data/dice';
import { MISSIONS } from '../data/missions';
import { rollsForSkill } from '../data/recruitTable';
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
  gathered,
  gatheredToRoll,
  madeTens,
  materialsAdded,
  recovered,
  scavengeNeedsAChoice,
  scavengerStoodDown,
  scavenged,
  scavenger,
  scavengesEverything,
  substitutionUses,
  substitutionsSpent,
  type MaterialRoll,
} from '../engine/materials';
import { baseMoved, claimedBase, heroesOverCap } from '../engine/claim';
import { deployed } from '../engine/missions';
import { lostInOverrun, moveProblem, storesAfterMove } from '../engine/move';
import {
  rescuedStrangers,
  strangerProblem,
  returnedWaiting,
  strangersWaiting,
  type RescuedStranger,
} from '../engine/strangers';
import {
  checkConversion,
  conversions,
  gainedBy,
  spentBy,
  timesConverted,
  type Conversion,
} from '../engine/conversions';
import { checkXpAward, xpPools, type XpPoolEmptiness } from '../engine/experience';
import {
  awardKey,
  checkHealing,
  healingPool,
  healthAwards,
  infectionRange,
  withInfectionSpent,
  woundsHealed,
  type HealthAward,
} from '../engine/healing';
import {
  dueProjects,
  isDue,
  weaponsOwed,
  orderedLastTurn,
  queuedCost,
  siegeLaborShortfall,
} from '../engine/projects';
import { fellInTheSiege } from '../engine/siegeWork';
import { rareItemFor, rareRollsDue } from '../engine/finding';
import { convoyTensDue } from '../engine/storyRewards';
import { describeItem, ITEM_LABELS } from './equipmentLabels';
import { dueTrades } from '../engine/trading';
import { CORE_WEAPONS, EQUIPMENT, type ItemId } from '../data/equipment';
import { SiegeWork } from './SiegeWork';
import { describeProject } from './projectLabels';
import {
  clearPendingRolls,
  readPendingRolls,
  writePendingRolls,
} from '../persistence/pendingRolls';
import { useCampaign } from '../state/useCampaign';
import { BASE_LABELS, MATERIAL_LABELS, builtThingLabel, slotLabel } from './baseLabels';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { SKILL_LABELS } from './skillLabels';
import { TIER_LABELS } from './tierLabels';
import { missionTitle } from './missionLabels';
import { describeBuild } from './storyLabels';
import { withArticle } from './articles';
import { FOCUS_RING, PRIMARY_FILL, SECONDARY_FILL, TOUCH_TARGET } from './styles';

export interface AdvancementPhaseProps {
  readonly campaign: Campaign;
  readonly step: TurnStepId;
}

const SMALL_BUTTON = `${FOCUS_RING} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600`;

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

export function AdvancementPhase({ campaign, step }: AdvancementPhaseProps) {
  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      {/*
       * Above every step rather than at one, because a siege's casualties
       * change three of them — what the base makes, what the Clinic heals and
       * which projects land — and each needs its reason on screen (#143, #183).
       * Only when somebody did fall: a clean bill of health is the Mission
       * Phase's to report, and five steps of it would be noise.
       */}
      {fellInTheSiege(campaign).length > 0 && <SiegeWork campaign={campaign} />}

      {step === 'character-advancement' && <CharacterAdvancement campaign={campaign} />}

      {step === 'create-new-survivors' && <CreateNewSurvivors campaign={campaign} />}

      {step === 'add-materials-to-storage' && (
        /*
         * Keyed by the pair the rolls are stamped with, which is the condition
         * the state inside is valid under. `AddMaterials` seeds itself from
         * `pendingRolls` once, reasoning that a reload is a remount — true, and
         * not the only way the campaign underneath it changes. **An import
         * replaces it without remounting**, so dice rolled for Cedar Hollow sat
         * in an open step while Millbrook was loaded under them, and Add to
         * storage credited Millbrook with the haul — one-shot, no undo, and a
         * later reload showing an empty list (#141).
         *
         * The same pair `readPendingRolls` matches on, so the seed can never be
         * read against a campaign or a turn it was not written for. React
         * enforces what the comment inside used to assume.
         */
        <AddMaterials key={`${campaign.id}:${String(campaign.turn)}`} campaign={campaign} />
      )}

      {step === 'heal-wounds' && <HealWounds campaign={campaign} />}

      {step === 'add-facilities-and-upgrades' && <FinishProjects campaign={campaign} />}

      {step === 'add-facilities-and-upgrades' && claimedBase(campaign) !== null && (
        <MoveIn campaign={campaign} />
      )}
    </div>
  );
}

/**
 * Step 2: the strangers this turn's missions rescued, each offered once
 * (pg. 19; Z4-5).
 *
 * The step itself rather than a pointer to the roster's forms, because what it
 * offers is read off the record: who was rescued, by which team and at what
 * Tier is the outcome's, so the only things left for the table are a name
 * and, where the Tier rolls for one, the die (pp. 7, 15). The roster's own
 * Add and Recruit stay where they are, for everybody who did not arrive this
 * way.
 */
function CreateNewSurvivors({ campaign }: { readonly campaign: Campaign }) {
  const rescued = rescuedStrangers(campaign);
  const waiting = strangersWaiting(campaign);

  return (
    <>
      <p className={HINT}>
        Strangers rescued on the missions join here, each at the Tier the mission counted. A Citizen
        or a Leader arrives with one skill rolled <PageRef pages="15, 18–19" />
      </p>

      {rescued.length === 0 ? (
        <p className={`mt-3 ${HINT}`}>Nobody was rescued on this turn’s missions.</p>
      ) : waiting.length === 0 ? (
        <p className="mt-3 text-sm font-medium">
          Every stranger rescued this turn has joined the community. Stepping back through the walk
          won’t add them twice.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {waiting.map((stranger) => (
            <StrangerJoining
              key={`${String(stranger.team)}:${String(stranger.stranger)}`}
              campaign={campaign}
              stranger={stranger}
            />
          ))}
        </ul>
      )}

      <ReturnedRejoining campaign={campaign} />
    </>
  );
}

/**
 * Survivors set aside whom a Rescue Strangers mission brought back this turn,
 * each rejoining as themselves (pp. 19, 86; R31; Z4-11). Nothing to name and
 * no die: they kept their sheet while they were away.
 */
function ReturnedRejoining({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const waiting = returnedWaiting(campaign);

  if (waiting.length === 0) return null;

  return (
    <ul aria-label="Brought back" className="mt-3 flex flex-col gap-3">
      {waiting.map((survivor) => (
        <li key={survivor.id} className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {survivor.name}, {TIER_LABELS[survivor.tier]}, was brought back <PageRef pages={86} />
          </span>
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium`}
            onClick={() => {
              dispatch({
                type: 'advancement/survivorReturned',
                survivor: survivor.id,
                at: new Date().toISOString(),
              });
            }}
          >
            Welcome {survivor.name} back
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One stranger's name, and their die where their Tier rolls one.
 *
 * The button asks `strangerProblem` with exactly what it will send, so it is
 * enabled when the form would accept the press and not otherwise.
 */
function StrangerJoining({
  campaign,
  stranger,
}: {
  readonly campaign: Campaign;
  readonly stranger: RescuedStranger;
}) {
  const { dispatch } = useCampaign();
  const ids = useId();
  const [name, setName] = useState('');
  const [roll, setRoll] = useState<D10Result | undefined>(undefined);

  const rolls = rollsForSkill(stranger.tier);
  const form = {
    team: stranger.team,
    stranger: stranger.stranger,
    name: name.trim(),
    ...(rolls && roll !== undefined ? { roll } : {}),
  };
  const problem = strangerProblem(campaign, form);
  // The position as well as the team, because two Citizens rescued by one
  // team are two strangers and each needs a name of its own on screen.
  // A survivor a story brought is named by the story, with what it gave them (Z7-3).
  const label =
    stranger.story === undefined
      ? `Mission team ${String(stranger.team)}, stranger ${String(stranger.stranger + 1)}: ${withArticle(TIER_LABELS[stranger.tier])}`
      : `Mission team ${String(stranger.team)}, from ${missionTitle(stranger.story)}: ${withArticle(TIER_LABELS[stranger.tier])}`;
  const given = [
    ...(stranger.bondGroup === undefined
      ? []
      : [`Bonded in bond group ${String(stranger.bondGroup)}`]),
    ...(stranger.xp === undefined ? [] : [`${String(stranger.xp)} XP`]),
  ];
  // What the story gives their build, said whole (pg. 99; R142).
  const build = stranger.build === undefined ? '' : ` ${describeBuild(stranger.build)}`;

  return (
    <li
      role="group"
      aria-label={label}
      className="rounded-lg border border-stone-200 p-3 dark:border-stone-700"
    >
      <p className="text-sm font-medium">
        {label} <span className="font-normal tabular-nums">(Tier {stranger.tier})</span>
      </p>
      {stranger.story !== undefined && (given.length > 0 || build !== '') && (
        <p className={HINT}>
          Joins{given.length === 0 ? '' : ` with ${given.join(' and ')}`}
          {build} <PageRef pages={MISSIONS[stranger.story].pages} />
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="grow basis-40">
          <label className="block text-sm" htmlFor={`${ids}-name`}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(changed) => {
              setName(changed.target.value);
            }}
            className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          />
        </div>

        {rolls && (
          <div>
            <label className="block text-sm" htmlFor={`${ids}-roll`}>
              Skill roll
            </label>
            <select
              id={`${ids}-roll`}
              value={roll ?? ''}
              onChange={(changed) => {
                setRoll(
                  changed.target.value === ''
                    ? undefined
                    : (Number(changed.target.value) as D10Result),
                );
              }}
              className={`${FOCUS_RING} ${TOUCH_TARGET} mt-1 rounded-lg border border-stone-300 px-3 tabular-nums dark:border-stone-600 dark:bg-stone-800`}
            >
              <option value="">—</option>
              {D10_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          disabled={problem !== null}
          className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40`}
          onClick={() => {
            dispatch({
              type: 'advancement/strangerJoined',
              ...form,
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
            });
          }}
        >
          Join the community
        </button>
      </div>

      {problem !== null && <p className={`mt-1 ${HINT}`}>{problem}</p>}
    </li>
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

  /*
   * Three pools can be on screen at once, and every award button read as
   * "+1 XP" to a screen reader — the pool and the survivor were in adjacent
   * text only. Rather than repeat both into a hidden label, each button points
   * at the two elements that already say them: the accessible name comes out
   * "+1 XP Earl Rhodes For going on the mission" with nothing duplicated in the
   * DOM to go stale or to catch a text query twice.
   */
  const ids = useId();

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
              <p className="text-sm font-medium" id={`${ids}-${pool.source}`}>
                {XP_SOURCE_LABELS[pool.source]}{' '}
                <span className="font-normal text-stone-600 tabular-nums dark:text-stone-400">
                  — {left} of {pool.total} left
                </span>
              </p>

              {pool.sentBy !== undefined && pool.total > 0 && (
                <p className={`mt-1 ${HINT}`}>
                  Left Behind Part 2a sends it to its survivor and each bondmate, 1 each, a Teacher
                  on the mission or not <PageRef pages={91} />
                </p>
              )}

              {pool.total === 0 ? (
                <p className={`mt-1 ${HINT}`}>
                  {pool.emptyBecause === undefined ? null : XP_POOL_EMPTY[pool.emptyBecause]}
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {pool.eligible.map((survivor) => {
                    const { blockers } = checkXpAward(campaign, survivor.id, pool.source);
                    const buttonId = `${ids}-${pool.source}-${survivor.id}`;
                    const nameId = `${buttonId}-who`;

                    return (
                      <li key={survivor.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          id={buttonId}
                          aria-labelledby={`${buttonId} ${nameId} ${ids}-${pool.source}`}
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
                        <span id={nameId}>{survivor.name}</span>
                        <span className="text-xs text-stone-500 tabular-nums dark:text-stone-400">
                          {survivor.xp} XP
                        </span>
                        {/*
                         * Why, beside the button that will not press. A greyed
                         * control with no reason is the thing `advancement.ts`
                         * argues against in as many words, and it was reachable
                         * here: edit a mission team after its XP has been handed
                         * out and the new member reads as eligible with a dead
                         * button (#145). The point stays where it was awarded —
                         * [R7](../../docs/rulings.md) — and this
                         * is the sentence that says so.
                         */}
                        {blockers[0] !== undefined && (
                          <span className="text-xs text-stone-500 dark:text-stone-400">
                            {blockers[0].message}
                          </span>
                        )}
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
 * The rolls are not part of the campaign. They are a die on a table — what the
 * campaign records is the haul, and once it is in storage the rolls are
 * history. Storing them on `Campaign` would put half-finished input in an
 * exported file.
 *
 * They are not *only* in this component either, which is what the old version
 * of this note got wrong. Component state does not survive a reload, and a
 * tablet discarding a background tab is ordinary here — so a whole mission's
 * haul went missing while the step stayed armed, and pressing Add to storage
 * then locked the turn on nothing (issue #96). `pendingRolls` keeps them
 * beside the autosave: same storage, same silence on failure, its own key,
 * and nothing added to the file that lasts.
 */
function AddMaterials({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const emptyId = useId();
  const emptyRef = useRef<HTMLDialogElement>(null);

  /*
   * Seeded from the store, never synced with it. The store is a backup of this
   * state rather than a second source of truth: the backup is wanted exactly
   * when this component is built again, and nothing else writes the key.
   *
   * What makes that safe is the `key` at the call site rather than anything
   * here — every change of campaign or turn builds a new one of these, so the
   * seed is always read against the campaign it belongs to.
   */
  const [rolls, setRolls] = useState<readonly MaterialRoll[]>(() =>
    readPendingRolls(campaign.id, campaign.turn),
  );

  /*
   * What an unskilled scavenger brought back, which is the player's to say
   * (pg. 17). Not kept beside the rolls in storage: the rolls are a record of
   * dice nobody can roll again, and this is a choice that costs nothing to make
   * a second time.
   */
  const [found, setFound] = useState<Material | undefined>(undefined);

  /*
   * The Rare Item Table's two dice for each roll it owes (Z5-7), by position:
   * the rolls that owe one can be removed or forced, so the list is cut to
   * what is due rather than kept in step with them.
   */
  const [rareDice, setRareDice] = useState<readonly RareDice[]>([]);
  const due = rareRollsDue(campaign, rolls);
  const tensDue = convoyTensDue(campaign);
  const rare = Array.from({ length: due }, (_, at) => rareDice[at] ?? {});
  const rareReady = rare.every((dice) => dice.subtable !== undefined && dice.entry !== undefined);

  function remember(next: readonly MaterialRoll[]) {
    setRolls(next);
    writePendingRolls(campaign.id, campaign.turn, next);
  }

  function commit() {
    dispatch({
      type: 'advancement/materialsAdded',
      rolls,
      ...(found === undefined ? {} : { scavenged: found }),
      rareItems: rare.map((dice) => ({
        id: crypto.randomUUID(),
        // Present: the button waits for every pair (`rareReady`).
        subtable: dice.subtable as D10Result,
        entry: dice.entry as D10Result,
      })),
      at: new Date().toISOString(),
    });
    // Cleared on commit rather than left to go stale on the turn stamp: the
    // rolls are spent, and a player who steps back should see the step's own
    // "already in storage" message and not a list offering to add them again.
    clearPendingRolls();
  }

  const done = materialsAdded(campaign);
  // Everybody, on a turn a siege deployed them (#167).
  const team = deployed(campaign);
  const fromMission = recovered(rolls);
  const fromBase = baseProduction(campaign);
  // What a Gather Materials team brought back without a roll, and how many of
  // a short haul's materials are rolled after all (pg. 80; Z4-6).
  const fromGathering = gathered(campaign);
  const gatheredCount = MATERIALS.reduce((sum, material) => sum + fromGathering[material], 0);
  const toRoll = gatheredToRoll(campaign);
  const scavenging = scavenger(campaign);
  const stoodDown = scavengerStoodDown(campaign);
  const fromScavenging = scavenged(campaign, found);
  const total = combined(combined(combined(fromMission, fromGathering), fromBase), fromScavenging);
  const unchosen = scavengeNeedsAChoice(campaign, found);
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
            This turn’s materials are already in storage. Stepping back through the walk won’t add
            them twice.
          </p>

          <Conversions campaign={campaign} />
        </>
      ) : (
        <>
          {/*
           * The d10's faces as buttons, a press for each roll (docs/step-records.md,
           * R4; #236). A `<select>` that appended a row and reset itself was a
           * draft control that wasn't one; ten buttons say what a press does.
           */}
          {tensDue > 0 && (
            <p className={`${HINT} mt-3`}>
              Crashed Convoy makes {tensDue} of this turn’s rolls 10s, each a roll on the Rare Item
              Table. Tick the ones it makes <PageRef pages="19, 101" />
            </p>
          )}

          <div role="group" aria-labelledby="material-roll" className="mt-3 flex flex-col gap-2">
            <p id="material-roll" className="text-sm font-medium">
              Add a roll
            </p>
            <div className="grid grid-cols-5 gap-2 sm:max-w-md">
              {D10_RESULTS.map((result) => (
                <button
                  key={result}
                  type="button"
                  aria-label={`Add a roll of ${String(result)}`}
                  className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 font-medium tabular-nums hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
                  onClick={() => {
                    remember([...rolls, { roll: result }]);
                  }}
                >
                  {result}
                </button>
              ))}
            </div>
          </div>

          {rolls.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {rolls.map((entry, index) => (
                // Index-keyed, because two rolls of the same number with the
                // same substitution are the same value and have no identity of
                // their own — the same reason production lines are.
                <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="tabular-nums">Rolled {entry.roll}</span>
                  {entry.madeTen !== true && (
                    <ForceResult
                      campaign={campaign}
                      entry={entry}
                      spent={spent}
                      onChange={(forced) => {
                        remember(
                          rolls.map((candidate, at) =>
                            at === index
                              ? forced === null
                                ? { roll: candidate.roll }
                                : { roll: candidate.roll, forced }
                              : candidate,
                          ),
                        );
                      }}
                    />
                  )}
                  {/* Crashed Convoy's 10s, on rolls nothing forced (R126). */}
                  {tensDue > 0 &&
                    entry.forced === undefined &&
                    (entry.madeTen === true || madeTens(rolls) < tensDue) && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className={FOCUS_RING}
                          checked={entry.madeTen === true}
                          onChange={(changed) => {
                            remember(
                              rolls.map((candidate, at) =>
                                at === index
                                  ? changed.target.checked
                                    ? { roll: candidate.roll, madeTen: true }
                                    : { roll: candidate.roll }
                                  : candidate,
                              ),
                            );
                          }}
                        />
                        Make it a 10
                      </label>
                    )}
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => {
                      remember(rolls.filter((_, at) => at !== index));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {due > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium">
                Rare Item Table <PageRef pages="19, 43" />
              </p>
              <p className={`${HINT} mt-1`}>
                A 10 is an item instead of a material: roll two more d10s for each, the first for
                the subtable and the second for the entry.
                {campaign.rareRollsOwed > 0 &&
                  ` ${String(campaign.rareRollsOwed)} more ${campaign.rareRollsOwed === 1 ? 'is' : 'are'} owed for the Rare this campaign held in storage.`}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {rare.map((dice, at) => (
                  <RareRoll
                    key={at}
                    index={at}
                    dice={dice}
                    onChange={(next) => {
                      setRareDice(
                        Array.from({ length: due }, (_, other) =>
                          other === at ? next : (rareDice[other] ?? {}),
                        ),
                      );
                    }}
                  />
                ))}
              </ul>
            </div>
          )}

          {(gatheredCount > 0 || toRoll > 0) && (
            <div className="mt-4">
              <p className="text-sm font-medium">
                Gather Materials <PageRef pages={80} />
              </p>
              {gatheredCount > 0 && (
                <p className={`${HINT} mt-1`}>
                  {gatheredCount} carried off come without a roll: one each of Food, Fuel and
                  Hardware, and the rest in the type chosen at Select Mission. They are in the total
                  below.
                </p>
              )}
              {toRoll > 0 && (
                <p className={`${HINT} mt-1`}>
                  {toRoll} carried off {toRoll === 1 ? 'is' : 'are'} fewer than one of each, so roll{' '}
                  {toRoll === 1 ? 'it' : 'them'} above with the rest.
                </p>
              )}
            </div>
          )}

          {/*
           * Assigned to scavenge, but the siege deployed everybody (R42): said
           * here, because a find that silently comes to nothing reads as a bug.
           */}
          {stoodDown !== undefined && (
            <p className={`${HINT} mt-4`}>
              {stoodDown.name} was assigned to scavenge, but the siege deployed the whole community,
              so they bring back nothing <PageRef pages="17, 85" />
            </p>
          )}

          {scavenging !== undefined && (
            <div className="mt-4">
              <p className="text-sm font-medium">
                {scavenging.name} scavenged instead of going on the mission <PageRef pages={17} />
              </p>

              {scavengesEverything(scavenging) ? (
                <p className={`${HINT} mt-1`}>
                  They have Scavenge, so they bring back one of every material type. It is in the
                  total below.
                </p>
              ) : (
                <>
                  <p className={`${HINT} mt-1`}>
                    Without the Scavenge skill they bring back one material of a single type, and
                    which one is yours to say.
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="scavenged-material">
                      Brought back
                    </label>
                    <select
                      id="scavenged-material"
                      value={found ?? ''}
                      className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-800`}
                      onChange={(changed) => {
                        setFound(
                          changed.target.value === ''
                            ? undefined
                            : (changed.target.value as Material),
                        );
                      }}
                    >
                      <option value="">Nothing yet</option>
                      {MATERIALS.map((material) => (
                        <option key={material} value={material}>
                          {MATERIAL_LABELS[material]}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {unchosen && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Nothing is chosen, so {scavenging.name}’s turn brings back nothing. This step
                  doesn’t run again this turn. <PageRef pages={17} />
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-sm font-medium">Going into storage</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {MATERIALS.map((material) => (
              <li key={material} className={`${HINT} tabular-nums`}>
                {total[material] >= 0 ? '+' : ''}
                {total[material]} {MATERIAL_LABELS[material]}
                <span className="text-xs">
                  {' '}
                  ({fromMission[material]} recovered
                  {gatheredCount === 0 ? '' : `, ${String(fromGathering[material])} gathered`},{' '}
                  {fromBase[material]} produced
                  {scavenging === undefined
                    ? ''
                    : `, ${String(fromScavenging[material])} scavenged`}
                  )
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

          {!rareReady && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Each Rare Item Table roll needs its two dice before the haul goes into storage{' '}
              <PageRef pages={43} />
            </p>
          )}

          <button
            type="button"
            disabled={!rareReady}
            className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => {
              // Zero rolls is legitimate — a turn with no mission still adds
              // the base's production — so the button is never disabled. It
              // is only worth a question when somebody went out and came back
              // with nothing entered, which is the shape of the lost-rolls
              // bug rather than a rule.
              if (rolls.length === 0 && team.length > 0) {
                emptyRef.current?.showModal();
                return;
              }

              commit();
            }}
          >
            Add to storage
          </button>

          <dialog
            ref={emptyRef}
            aria-labelledby={emptyId}
            className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
          >
            <h2 id={emptyId} className="text-xl font-semibold">
              Add nothing the mission recovered?
            </h2>
            <p className="mt-2 text-stone-600 dark:text-stone-400">
              {team.length} survivor{team.length === 1 ? '' : 's'} went out this turn and no rolls
              are entered. Only the base’s production goes into storage, and this step doesn’t run
              again this turn.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => emptyRef.current?.close()}
                className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
              >
                Enter the rolls
              </button>
              <button
                type="button"
                onClick={() => {
                  emptyRef.current?.close();
                  commit();
                }}
                className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg ${PRIMARY_FILL} px-5 font-semibold`}
              >
                Add production only
              </button>
            </div>
          </dialog>
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

  /*
   * How many of each award's points go on Infection, by `awardKey` — the one
   * decision this step leaves the table, and only under the Viral origin
   * (pg. 19, 123; #176). Held here until the press rather than stored: nothing
   * has happened until the wounds are healed, and the reducer holds every
   * number to its range again rather than trusting this one.
   */
  const viral = campaign.origin === 'viral';
  const [onInfection, setOnInfection] = useState<Record<string, number>>({});

  const done = woundsHealed(campaign);
  const awards = withInfectionSpent(healthAwards(campaign), onInfection);
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
      {viral && (
        <p className={`mt-1 ${HINT}`}>
          Any point may remove a point of Infection instead of closing a wound, and a survivor at
          full Health takes none <PageRef pages="19, 21, 123" />
        </p>
      )}

      {done ? (
        <p className="mt-3 text-sm font-medium">
          This turn’s wounds are healed. Stepping back through the walk won’t heal them again.
        </p>
      ) : (
        <>
          {awards.length === 0 ? (
            <p className={`mt-3 ${HINT}`}>Nobody has a wound this step can close.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {awards.map((award) => (
                <li
                  key={awardKey(award)}
                  className="text-sm tabular-nums text-stone-600 dark:text-stone-400"
                >
                  {award.survivor.name} +{award.health} Health
                  <span className="text-xs">
                    {' '}
                    ({HEALTH_SOURCE_LABELS[award.source]}, to{' '}
                    {award.survivor.currentHp + award.health - award.infection}
                    {viral && `, Infection ${String(award.survivor.infection - award.infection)}`})
                  </span>
                  {viral && (
                    <InfectionSpent
                      award={award}
                      onChange={(points) => {
                        setOnInfection({ ...onInfection, [awardKey(award)]: points });
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {warnings.map((warning) => (
            <p key={warning.code} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              {warning.message} <PageRef pages={warning.pages} />
            </p>
          ))}

          {/*
           * Still a press with nobody to heal, so the step records that it ran,
           * but not the primary one: the step owes nothing, so Next is (#231).
           */}
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg ${awards.length === 0 ? SECONDARY_FILL : PRIMARY_FILL} px-4 py-2 font-medium`}
            onClick={() => {
              dispatch({
                type: 'advancement/woundsHealed',
                at: new Date().toISOString(),
                // Every award's split as shown, defaults included, so what the
                // press does is what the list said it would.
                ...(viral
                  ? {
                      infection: Object.fromEntries(
                        awards.map((award) => [awardKey(award), award.infection]),
                      ),
                    }
                  : {}),
              });
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
 * How many of one award's points go on Infection (pg. 19, 123).
 *
 * Point by point, which is how the book puts it, and a choice of a number
 * rather than a toggle per point because the points are interchangeable — two
 * on Infection is two on Infection whichever two they were. Only the numbers
 * `infectionRange` allows are offered: where Health can take none of the
 * points past a wound they go on Infection, and one with no Infection has
 * nothing to choose, so the control says what happens rather than offering one
 * option.
 */
function InfectionSpent({
  award,
  onChange,
}: {
  readonly award: HealthAward;
  readonly onChange: (points: number) => void;
}) {
  const id = useId();
  const { least, most } = infectionRange(award);

  if (most === least) {
    return least === 0 ? null : (
      <span className="block text-xs">{least} against Infection — Health can take no more</span>
    );
  }

  return (
    <span className="mt-1 flex items-center gap-2 text-xs">
      <label htmlFor={id}>Points against Infection for {award.survivor.name}</label>
      <select
        id={id}
        value={award.infection}
        className={`${FOCUS_RING} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`}
        onChange={(changed) => {
          onChange(Number(changed.target.value));
        }}
      >
        {Array.from({ length: most - least + 1 }, (_, at) => least + at).map((points) => (
          <option key={points} value={points}>
            {points} of {award.health}
          </option>
        ))}
      </select>
    </span>
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
/** The two Rare Item Table dice entered for one roll, as far as they go. */
interface RareDice {
  readonly subtable?: D10Result;
  readonly entry?: D10Result;
}

/** One roll on the Rare Item Table: its two dice, and what they find (pg. 43). */
function RareRoll({
  index,
  dice,
  onChange,
}: {
  readonly index: number;
  readonly dice: RareDice;
  readonly onChange: (next: RareDice) => void;
}) {
  const name = `Rare Item Table roll ${String(index + 1)}`;
  const select = (die: 'subtable' | 'entry', label: string) => (
    <select
      aria-label={`${name}, ${label}`}
      className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-800`}
      value={dice[die] ?? ''}
      onChange={(changed) => {
        onChange({ ...dice, [die]: Number(changed.target.value) as D10Result });
      }}
    >
      <option value="" disabled>
        {label}
      </option>
      {D10_RESULTS.map((result) => (
        <option key={result} value={result}>
          {result}
        </option>
      ))}
    </select>
  );

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span>{name}</span>
      {select('subtable', 'first d10')}
      {select('entry', 'second d10')}
      {dice.subtable !== undefined && dice.entry !== undefined && (
        <span className="font-medium">{describeItem(rareItemFor(dice.subtable, dice.entry))}</span>
      )}
    </li>
  );
}

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
  'sent-to-the-gone':
    'Left Behind Part 2a sends this point to its survivor and their bondmates, and none of them is in the community now.',
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
/** The step's button, naming what it finishes: "Finish 2 projects and the trade". */
function finishLabel(projects: number, trades: number): string {
  const counted = (count: number, one: string, many: string) =>
    count === 1 ? `the ${one}` : `${String(count)} ${many}`;
  const parts = [
    ...(projects === 0 ? [] : [counted(projects, 'project', 'projects')]),
    ...(trades === 0 ? [] : [counted(trades, 'trade', 'trades')]),
  ];

  return `Finish ${parts.join(' and ')}`;
}

function FinishProjects({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const due = dueProjects(campaign);
  const waiting = campaign.projects.filter((project) => !isDue(campaign, project));
  const short = siegeLaborShortfall(campaign);
  // Last turn's trades land here too (pg. 19; R53; Z5-9).
  const arriving = dueTrades(campaign);
  const onTheWay = campaign.trades.length - arriving.length;

  // The Outdoor Sports Shop's weapons, the player's to choose (R45; Z5-8).
  const owed = weaponsOwed(campaign);
  const [weapons, setWeapons] = useState<readonly (ItemId | '')[]>([]);
  const chosen = Array.from({ length: owed?.count ?? 0 }, (_, at) => weapons[at] ?? '');
  const ready = chosen.every((weapon) => weapon !== '');

  return (
    <>
      <p className={HINT}>
        Projects ordered in a Planning Phase finish here, the turn after they were ordered{' '}
        <PageRef pages={19} />
      </p>

      {/* Rare upgrades are installed now, from the Inventory (R47; Z5-8). */}
      {campaign.inventory.some((item) => EQUIPMENT[item.item].kind === 'rare-upgrade') && (
        <p className={`mt-2 ${HINT}`}>
          The <OpenPanel panel="inventory">Inventory</OpenPanel> holds a rare upgrade, installed in
          a facility of its kind at this step <PageRef pages={49} />
        </p>
      )}

      {due.length === 0 && arriving.length === 0 ? (
        <p className={`mt-3 ${HINT}`}>
          {waiting.length === 0 && onTheWay === 0
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
            {arriving.map((trade) => (
              <li key={trade.id} className={HINT}>
                A {describeItem(trade)}, from a trade <PageRef pages={21} />
              </li>
            ))}
          </ul>

          {owed !== null && (
            <div className="mt-3">
              <p className="text-sm font-medium">
                Clearing the {slotLabel(owed.slot)} hands over {owed.count} standard weapons, yours
                to choose <PageRef pages={62} />
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {chosen.map((weapon, at) => (
                  <select
                    key={at}
                    aria-label={`Weapon ${String(at + 1)}`}
                    className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-800`}
                    value={weapon}
                    onChange={(changed) => {
                      setWeapons(
                        chosen.map((one, other) =>
                          other === at ? (changed.target.value as ItemId) : one,
                        ),
                      );
                    }}
                  >
                    <option value="" disabled>
                      Weapon {at + 1}
                    </option>
                    {CORE_WEAPONS.map((id) => (
                      <option key={id} value={id}>
                        {ITEM_LABELS[id]}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          )}

          {short > 0 ? (
            <SiegeUnpaid campaign={campaign} short={short} />
          ) : (
            <button
              type="button"
              disabled={!ready}
              className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                dispatch({
                  type: 'advancement/projectsCompleted',
                  ...(owed === null ? {} : { weapons: chosen as readonly ItemId[] }),
                  at: new Date().toISOString(),
                });
              }}
            >
              {finishLabel(due.length, arriving.length)}
            </button>
          )}
        </>
      )}
    </>
  );
}

/**
 * The siege's wake on the projects about to land (pg. 23, the FAQ's "Siege
 * Defense and Labor"; #183).
 *
 * Departures' `UnpaidProjects` one turn's orders earlier: a casualty of the
 * siege takes their Labor off the team that paid for these, and they have not
 * landed yet. **Offered, never done**, for the reason that one gives — the rule
 * says a project goes unfinished and not which, so the player picks.
 *
 * In place of the Finish button rather than beside it, because finishing them
 * all is exactly what the turn can no longer pay for — and the store refuses
 * it while this is showing, so a button would be a control that does nothing.
 */
function SiegeUnpaid({ campaign, short }: { readonly campaign: Campaign; readonly short: number }) {
  const { dispatch } = useCampaign();

  return (
    <div className="mt-3 rounded-lg border border-amber-300 p-4 dark:border-amber-700">
      <p className="text-sm font-medium">
        These are <span className="tabular-nums">{short}</span> Labor short: the siege took somebody
        off the project team that was paying for them. A project goes unfinished, and which one is
        yours to say <PageRef pages={23} />
      </p>

      <ul className="mt-2 flex flex-col gap-1">
        {orderedLastTurn(campaign).map(({ at, project }) => (
          <li key={at} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => {
                dispatch({
                  type: 'advancement/projectUnfinished',
                  at,
                  when: new Date().toISOString(),
                });
              }}
            >
              Leave {describeProject(project)} unfinished
            </button>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {queuedCost(campaign, at).labor} Labor
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The end of the phase after a claim was won: the community moves in (pp. 19,
 * 54, 79; R25; Z4-8).
 *
 * After the projects, which land in the old base and stay there; so until they
 * are finished this says why it waits rather than offering a button that would
 * be refused. When the new base holds fewer Heroes than the community has, the
 * player picks one for each over (R32) — the book leaves the choice to them —
 * and the button waits for exactly that many.
 */
function MoveIn({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [leaving, setLeaving] = useState<readonly string[]>([]);

  // Present: the step renders this only for a claim won this turn.
  const to = claimedBase(campaign) as NonNullable<ReturnType<typeof claimedBase>>;
  const label = BASE_LABELS[to];

  if (baseMoved(campaign)) {
    return (
      <p className="mt-4 text-sm font-medium">
        The community has moved into the {label} <PageRef pages={79} />
      </p>
    );
  }

  const over = heroesOverCap(campaign, to);
  const heroes = campaign.survivors.filter((survivor) => survivor.tier === 4);
  const problem = moveProblem(campaign, leaving);
  const from = campaign.base === null ? null : BASE_LABELS[campaign.base.id];
  const stores = storesAfterMove(campaign);
  const lost = lostInOverrun(campaign);
  const losing =
    lost === null
      ? []
      : [
          ...(lost.items.length === 0
            ? []
            : [
                lost.items.length === 1
                  ? 'the 1 item in the Inventory'
                  : `the ${String(lost.items.length)} items in the Inventory`,
              ]),
          ...lost.vehicles.map((vehicle) => vehicle.label),
          ...(lost.trades.length === 0
            ? []
            : [
                lost.trades.length === 1
                  ? '1 order on its way'
                  : `${String(lost.trades.length)} orders on their way`,
              ]),
        ];

  return (
    <section
      aria-label="Move into the new base"
      className="mt-4 rounded-lg border border-stone-200 p-4 dark:border-stone-700"
    >
      <p className="text-sm font-medium">
        Move into the {label} <PageRef pages="19, 79" />
      </p>
      <p className={`mt-1 ${HINT}`}>
        {from === null ? '' : `What was built in the ${from} stays there. `}
        {stores === null ? (
          <>
            The stores come along, and anything over the new caps spoils at Check Storage{' '}
            <PageRef pages="23, 54" />
          </>
        ) : (
          <>
            After the overrun, the stores will hold{' '}
            {MATERIALS.map(
              (material) => `${String(stores[material])} ${MATERIAL_LABELS[material]}`,
            ).join(', ')}{' '}
            <PageRef pages={86} />
          </>
        )}
      </p>
      {losing.length > 0 && (
        <p className={`mt-1 ${HINT}`}>
          Lost with the overrun base: {losing.join(', ')}. Survivors keep what they carry{' '}
          <PageRef pages="85–86" />
        </p>
      )}

      {over > 0 && (
        <fieldset className="mt-3">
          <legend className="text-sm">
            The {label} holds fewer Heroes than the community has. Choose{' '}
            {over === 1 ? 'the Hero' : `the ${String(over)} Heroes`} who leave to start their own
            community <PageRef pages={54} />
          </legend>
          <div className="mt-1 flex flex-col gap-1">
            {heroes.map((hero) => (
              <label key={hero.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={FOCUS_RING}
                  checked={leaving.includes(hero.id)}
                  onChange={(changed) => {
                    setLeaving(
                      changed.target.checked
                        ? [...leaving, hero.id]
                        : leaving.filter((id) => id !== hero.id),
                    );
                  }}
                />
                {hero.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {problem !== null && <p className={`mt-2 ${HINT}`}>{problem}</p>}

      <button
        type="button"
        disabled={problem !== null}
        className={`${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={() => {
          dispatch({ type: 'advancement/moved', leaving, at: new Date().toISOString() });
        }}
      >
        Move into the {label}
      </button>
    </section>
  );
}
