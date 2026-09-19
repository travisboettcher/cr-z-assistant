/**
 * The Management Phase's first three steps (pp. 22–23).
 *
 * Check for Rot → Feed your Survivors → Assign Beds, then four more that are
 * Z3-10's. These are the first steps in the app with *consequences*: one
 * removes survivors, one empties the stores and lowers every Skill Score in the
 * community, and the third names a number that will cost somebody their place
 * two steps later.
 *
 * **Nothing here happens on arrival.** Each destructive step shows what it is
 * about to do and waits for a press, because the walk can be stepped through by
 * accident and none of these can be stepped back.
 */

import { useState } from 'react';
import { suppliedOccupants } from '../engine/utilities';
import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  DEPARTURE_THRESHOLD,
  SIEGE_THREAT_TERMS,
  SIEGE_TRIGGER,
  type SiegeThreatTerm,
  type TurnStepId,
} from '../data/turn';
import type { Campaign } from '../engine/campaign';
import {
  exhaustion,
  foodRequiredAsFed,
  hunger,
  hungerIfFedNow,
  penaltyFor,
  survivorsFed,
  unrest,
} from '../engine/feeding';
import { beds } from '../engine/base';
import { missionTeam, missionTeamReduced } from '../engine/assignments';
import {
  hordeCame,
  hordeChecked,
  siegeThreat,
  siegeThreatTerms,
  siegeTriggered,
} from '../engine/siege';
import { anythingOverCap, overCap, storageChecked } from '../engine/storage';
import {
  departureCandidates,
  departurePressure,
  someoneDeparted,
  someoneIsLeaving,
} from '../engine/departures';
import { MATERIAL_LABELS } from './baseLabels';
import { STORED_MATERIALS } from '../data/materials';
import { biteCandidates, mustCheck, restraintsFree, rotOutcome, rotTarget } from '../engine/rot';
import { laborShortfall, orderedThisTurn, queuedCost } from '../engine/projects';
import { describeProject } from './projectLabels';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface ManagementPhaseProps {
  readonly campaign: Campaign;
  readonly step: TurnStepId;
}

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

const FIELD = `${FOCUS_RING} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const SMALL_BUTTON = `${FOCUS_RING} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium dark:border-stone-600`;

export function ManagementPhase({ campaign, step }: ManagementPhaseProps) {
  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      {step === 'check-for-rot' && <CheckForRot campaign={campaign} />}
      {step === 'feed-your-survivors' && <Feed campaign={campaign} />}
      {step === 'assign-beds' && <AssignBeds campaign={campaign} />}

      {step === 'calculate-unrest' && <CalculateUnrest campaign={campaign} />}
      {step === 'check-storage' && <CheckStorage campaign={campaign} />}
      {step === 'check-the-horde' && <CheckTheHorde campaign={campaign} />}
      {step === 'departures' && <Departures campaign={campaign} />}
    </div>
  );
}

/**
 * Step 1: a check per survivor at 0 Health, rolled at the table.
 *
 * One form per survivor rather than one for the step, because each check has
 * its own roll and its own bite, and a failure removes somebody — collapsing
 * them into a single "roll for everybody" control would make one press stand
 * for several irreversible things.
 */
function CheckForRot({ campaign }: { readonly campaign: Campaign }) {
  const dying = mustCheck(campaign);
  const target = rotTarget(campaign);
  const held = restraintsFree(campaign);

  return (
    <>
      <p className={HINT}>
        Every survivor at 0 Health checks against <span className="tabular-nums">{target}</span> —
        twelve, less the Medical Clinic’s combined Medicine. Roll a d10 and add their Tier; a
        natural 1 always fails and a natural 10 always holds <PageRef pages={22} />
      </p>

      {/*
       * Said at the step rather than on a card, because what it explains is a
       * control that is *missing* from the cards: with a set free there is no
       * bite to choose, and a player who cannot see why would go looking for
       * the picker they had last turn.
       */}
      {held > 0 && (
        <p className={`mt-2 ${HINT}`}>
          The Medical Clinic&rsquo;s Restraints hold <span className="tabular-nums">{held}</span>{' '}
          more turned survivor{held === 1 ? '' : 's'} this turn, and a survivor they hold bites
          nobody <PageRef pages="72–73" />
        </p>
      )}

      {dying.length === 0 ? (
        <p className={`mt-3 ${HINT}`}>Nobody is at 0 Health. Nothing to check.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {dying.map((survivor) => (
            <li key={survivor.id}>
              <RotCheck campaign={campaign} survivorId={survivor.id} name={survivor.name} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RotCheck({
  campaign,
  survivorId,
  name,
}: {
  readonly campaign: Campaign;
  readonly survivorId: string;
  readonly name: string;
}) {
  const { dispatch } = useCampaign();
  const [roll, setRoll] = useState<D10Result>(1);

  const candidates = biteCandidates(campaign, survivorId);
  const [bitten, setBitten] = useState<string>('');

  /*
   * **The bite is not optional.** pg. 22: the survivor "turns in the night and
   * bites another survivor before being destroyed" — so where a candidate
   * exists, one of them is bitten. The control used to default to nobody and
   * offer it as a choice, which let a failed check skip the 1 Damage entirely.
   *
   * Who is bitten is still the player's, which is why this is a picker at all.
   * Falling back to the first candidate rather than holding the choice in state
   * also survives the list changing underneath it: a candidate who leaves the
   * healing assignment stops being selectable, and the answer stays valid.
   */
  const chosen =
    candidates.find((candidate) => candidate.id === bitten)?.id ?? candidates[0]?.id ?? null;

  // A set of Restraints holds one turned survivor and the bite does not happen
  // (pp. 72–73), so there is nothing to choose between — and the engine decides it
  // either way, which is why this only takes the picker away.
  const held = restraintsFree(campaign) > 0;

  // Shown before the press, so a player can see what the roll they are about to
  // enter would cost before it costs it.
  const outcome = rotOutcome(campaign, survivorId, roll, chosen);

  return (
    <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <p className="text-sm font-medium">{name}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor={`rot-roll-${survivorId}`}>
          Rolled
        </label>
        <select
          id={`rot-roll-${survivorId}`}
          value={roll}
          className={FIELD}
          onChange={(changed) => {
            setRoll(Number(changed.target.value) as D10Result);
          }}
        >
          {D10_RESULTS.map((result) => (
            <option key={result} value={result}>
              {result}
            </option>
          ))}
        </select>

        {candidates.length > 0 && !held && (
          <>
            <label className="text-sm" htmlFor={`rot-bite-${survivorId}`}>
              Bites
            </label>
            <select
              id={`rot-bite-${survivorId}`}
              value={chosen ?? ''}
              className={FIELD}
              onChange={(changed) => {
                setBitten(changed.target.value);
              }}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <p className={`mt-2 ${HINT}`}>
        {outcome.turned === null
          ? `${name} holds on.`
          : `${name} turns and is removed.` +
            (outcome.restrained ? ' The Restraints hold them, and nobody is bitten.' : '') +
            (outcome.bitten === null
              ? ''
              : ` ${outcome.bitten.survivor.name} is bitten${outcome.bitten.dies ? ' and removed too' : ''}.`)}
      </p>

      <button
        type="button"
        className={PRIMARY}
        onClick={() => {
          dispatch({
            type: 'management/rotChecked',
            survivor: survivorId,
            roll,
            bitten: chosen,
            at: new Date().toISOString(),
          });
        }}
      >
        Resolve {name}’s check
      </button>
    </div>
  );
}

/**
 * Step 2: the community eats, and a shortfall costs everybody.
 *
 * Both numbers are shown before the press, because the penalty is the one
 * consequence in the app that reaches every screen at once and a player should
 * not meet it by noticing their Skill Scores have changed.
 */
function Feed({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const done = survivorsFed(campaign);
  // Both halves off the same source: live beside live before the step has run,
  // recorded beside recorded after — never one of each, which is how this
  // printed "eats 6 Food… 8 Hunger".
  const required = foodRequiredAsFed(campaign);
  const short = done ? hunger(campaign) : hungerIfFedNow(campaign);
  const penalty = penaltyFor(short, campaign.survivors.length);

  return (
    <>
      <p className={HINT}>
        This community eats <span className="tabular-nums">{required}</span> Food a turn — one each
        for Tiers 1 and 2, two each for Tiers 3 and 4. It has{' '}
        <span className="tabular-nums">{campaign.materials.food}</span> <PageRef pages={22} />
      </p>

      <p className="mt-3 text-sm">
        {short === 0 ? (
          <span className="font-medium">Everybody eats. No Hunger this turn.</span>
        ) : (
          <span className="font-medium">
            <span className="tabular-nums">{short}</span> Hunger
          </span>
        )}
      </p>

      {short > 0 && (
        <p className={`mt-1 ${HINT}`}>
          Hunger is one of the two terms of Unrest <PageRef pages={23} />
          {penalty === 0 ? (
            <>
              {' '}
              — and this community is large enough to absorb it, so no stat is reduced. The penalty
              starts once the shortfall passes the head count of{' '}
              <span className="tabular-nums">{campaign.survivors.length}</span>{' '}
              <PageRef pages={22} />
            </>
          ) : (
            <>
              {' '}
              — and this shortfall is past the head count of{' '}
              <span className="tabular-nums">{campaign.survivors.length}</span>, so{' '}
              <strong>
                every survivor’s stats drop by <span className="tabular-nums">{penalty}</span>
              </strong>{' '}
              until the next Management Phase. Every Skill Score in the community goes with them{' '}
              <PageRef pages={22} />
            </>
          )}
        </p>
      )}

      {done ? (
        <p className="mt-3 text-sm font-medium">
          This turn’s Food is eaten. Stepping back through the walk will not eat it twice.
        </p>
      ) : (
        <button
          type="button"
          className={PRIMARY}
          onClick={() => {
            dispatch({ type: 'management/survivorsFed', at: new Date().toISOString() });
          }}
        >
          Feed the community
        </button>
      )}
    </>
  );
}

/**
 * Step 3: Exhaustion, and the one consequence the book prints under it.
 *
 * The Exhaustion *number* changes nothing and is counted from scratch every
 * turn — population against beds, both readable at any moment, back to zero the
 * instant a Bunk Room goes up. The **penalty** is a real edit, and it belongs
 * here rather than on Calculate Unrest where it used to sit: pg. 23 prints it
 * under Assign Beds, beside the number it follows from.
 */
function AssignBeds({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const base = campaign.base;
  const sleeping = base === null ? 0 : beds(base, suppliedOccupants(campaign));
  const short = exhaustion(campaign);
  const team = missionTeam(campaign);

  // Exhaustion above the mission team's size takes one survivor off it
  // (pg. 23). Offered rather than done, because *which* one is a decision and
  // because taking somebody off a team without being asked is the kind of
  // silent edit this app does not make.
  //
  // Once, though. Taking somebody off does not lower the Exhaustion that called
  // for it — beds and population are unchanged — so the condition stays true
  // and the step went on offering the next name until the team was empty.
  const overworked = short > team.length && team.length > 0;
  const reduced = missionTeamReduced(campaign);

  return (
    <>
      <p className={HINT}>
        <span className="tabular-nums">{campaign.survivors.length}</span> survivors and{' '}
        <span className="tabular-nums">{sleeping}</span> beds. Whoever is left over is Exhaustion,
        the other term of Unrest <PageRef pages={23} />
      </p>

      <p className="mt-3 text-sm font-medium">
        {short === 0 ? (
          'Everybody has a bed. No Exhaustion this turn.'
        ) : (
          <>
            <span className="tabular-nums">{short}</span> Exhaustion
          </>
        )}
      </p>

      <p className={`mt-1 ${HINT}`}>
        The number itself is counted again from scratch every turn, and never added to what it was{' '}
        <PageRef pages={23} />
      </p>

      {reduced ? (
        <p className="mt-3 text-sm font-medium">
          Somebody has already come off the mission team this turn. The rule takes one.
        </p>
      ) : (
        overworked && (
          <>
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              Exhaustion is above the mission team’s{' '}
              <span className="tabular-nums">{team.length}</span>, so one survivor comes off it and
              is idle for the turn <PageRef pages={23} />
            </p>

            <ul className="mt-2 flex flex-col gap-1">
              {team.map((survivor) => (
                <li key={survivor.id} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => {
                      dispatch({
                        type: 'management/teamReduced',
                        survivor: survivor.id,
                        at: new Date().toISOString(),
                      });
                    }}
                  >
                    Take off
                  </button>
                  <span>{survivor.name}</span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </>
  );
}

/**
 * Step 4: the two numbers added up, and nothing to apply.
 *
 * Unrest is read by the two steps that follow and by nothing else, so this is a
 * screen that explains rather than acts. The exhaustion penalty used to sit
 * here and has moved to Assign Beds, which is the step the rule is printed
 * under and the step that computes the Exhaustion it follows from (pg. 23).
 */
function CalculateUnrest({ campaign }: { readonly campaign: Campaign }) {
  const short = hunger(campaign);
  const tired = exhaustion(campaign);

  return (
    <>
      <p className={HINT}>
        Unrest is Hunger plus Exhaustion, both counted again from scratch this turn{' '}
        <PageRef pages={23} />
      </p>

      <p className="mt-3 text-sm font-medium tabular-nums">
        {short} Hunger + {tired} Exhaustion = {unrest(campaign)} Unrest
      </p>
    </>
  );
}

/**
 * Step 5: the caps Phase 2 computed and deliberately refused to enforce.
 *
 * Rare is not here and has no row, because the book gives it no cap (pg. 54) —
 * a community's Rare Items are safe however many it has.
 */
function CheckStorage({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const done = storageChecked(campaign);
  const spilled = overCap(campaign);
  const anything = anythingOverCap(campaign);

  return (
    <>
      <p className={HINT}>
        Anything above the base’s cap is lost down to it. Rare has no cap and is never trimmed{' '}
        <PageRef pages={23} />
      </p>

      {done ? (
        <p className="mt-3 text-sm font-medium">
          Storage is checked for this turn. Stepping back will not spill it twice.
        </p>
      ) : anything ? (
        <>
          <p className="mt-3 text-sm font-medium">About to be lost</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {STORED_MATERIALS.filter((material) => spilled[material] > 0).map((material) => (
              <li key={material} className={`${HINT} tabular-nums`}>
                −{spilled[material]} {MATERIAL_LABELS[material]}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className={PRIMARY}
            onClick={() => {
              dispatch({ type: 'management/storageChecked', at: new Date().toISOString() });
            }}
          >
            Lose the surplus
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm font-medium">Nothing is over the cap. Nothing to lose.</p>
      )}
    </>
  );
}

/**
 * Step 6: Siege Threat totalled at last, and the roll it feeds.
 *
 * The four terms are shown rather than the sum alone, because a player about to
 * roll wants to know which of their own decisions put the number there — and
 * three of the four are decisions they made in the Planning Phase.
 */
function CheckTheHorde({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [roll, setRoll] = useState<D10Result>(1);

  const done = hordeChecked(campaign);
  const terms = siegeThreatTerms(campaign);
  const threat = siegeThreat(campaign);

  return (
    <>
      <p className={HINT}>
        Roll a d10 and add the Siege Threat. At{' '}
        <span className="tabular-nums">{SIEGE_TRIGGER}</span> or over, next turn’s mission is a
        Siege Defense <PageRef pages={23} />
      </p>

      <ul className="mt-3 flex flex-col gap-0.5">
        {SIEGE_THREAT_TERMS.map((term) => (
          <li key={term} className={`${HINT} tabular-nums`}>
            {terms[term] >= 0 ? '+' : ''}
            {terms[term]} {SIEGE_TERM_LABELS[term]}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm font-medium tabular-nums">Siege Threat {threat}</p>

      {done ? (
        <p className="mt-3 text-sm font-medium">
          {hordeCame(campaign)
            ? 'The horde came. Next turn’s mission is a Siege Defense.'
            : 'The horde stayed away this turn.'}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor="horde-roll">
              Rolled
            </label>
            <select
              id="horde-roll"
              value={roll}
              className={FIELD}
              onChange={(changed) => {
                setRoll(Number(changed.target.value) as D10Result);
              }}
            >
              {D10_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </div>

          <p className={`mt-2 ${HINT}`}>
            {siegeTriggered(roll, threat)
              ? `${roll} + ${threat} is ${roll + threat}. The horde comes.`
              : `${roll} + ${threat} is ${roll + threat}. Not this turn.`}
          </p>

          <button
            type="button"
            className={PRIMARY}
            onClick={() => {
              dispatch({ type: 'management/hordeChecked', roll, at: new Date().toISOString() });
            }}
          >
            Check the horde
          </button>
        </>
      )}
    </>
  );
}

/**
 * Step 7: somebody walks, and the player says who.
 *
 * **One departure, and then the step reports what it did.** The rule sends the
 * lowest-Tier survivor away (pg. 23), singular — and a departure lowers the
 * very pressure that called for it, by unstaffing whatever they were working
 * and shrinking the project team. So a screen that re-derived afterwards would
 * offer a second name against a number the first departure had already moved,
 * and then, once the pressure fell under the threshold, announce that the
 * community holds together one line below the log entry saying somebody left.
 * It did both, until the step started reading its own record.
 */
function Departures({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const pressure = departurePressure(campaign);
  const candidates = departureCandidates(campaign);
  const departed = someoneDeparted(campaign);

  return (
    <>
      <p className={HINT}>
        Unrest plus Siege Threat is <span className="tabular-nums">{pressure}</span>. At{' '}
        <span className="tabular-nums">{DEPARTURE_THRESHOLD}</span> or over, the lowest-Tier
        survivor leaves — and a tie is yours to break <PageRef pages={23} />
      </p>

      {departed ? (
        <p className="mt-3 text-sm font-medium">
          Somebody has already left this turn. The rules send one survivor away, however far over
          the threshold the pressure is.
        </p>
      ) : !someoneIsLeaving(campaign) ? (
        <p className="mt-3 text-sm font-medium">Nobody is leaving. The community holds together.</p>
      ) : candidates.length === 0 ? (
        <p className="mt-3 text-sm font-medium">
          Somebody would leave, but everybody left is at 0 Health and in no state to walk anywhere.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium">
            {candidates.length === 1 ? 'Leaving' : 'The lowest Tier, and yours to choose between'}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {candidates.map((survivor) => (
              <li key={survivor.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => {
                    dispatch({
                      type: 'management/departed',
                      survivor: survivor.id,
                      at: new Date().toISOString(),
                    });
                  }}
                >
                  Send away
                </button>
                <span>{survivor.name}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Tier {survivor.tier}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <UnpaidProjects campaign={campaign} />
    </>
  );
}

/**
 * The other half of a departure: the work their Labor was paying for (pg. 23).
 *
 * A survivor's Tier comes off the turn's **unused** Labor, and where there is
 * not enough unused Labor to take it from, a project goes unfinished. Nothing
 * here computes that as a second subtraction — the pool is the project team's
 * summed Tiers and the leaver is no longer on it, so `laborAvailable` has
 * already fallen by exactly their Tier. What is left is the consequence, and
 * the consequence is a choice.
 *
 * **Offered, never done**, like the exhaustion penalty beside it. The rule says
 * a project goes unfinished; it does not say which, and picking one for the
 * player — the newest order, the dearest, the first in the queue — would be
 * this app making up a rule at the moment it takes something away.
 *
 * It keeps asking while the queue is still short. One project is the ordinary
 * case, because a Tier is at most 4 and most projects cost 2 or 3 — but a
 * Veteran walking out of a turn with nothing unused can outrun a single order,
 * and the rule that a turn cannot spend more Labor than it has does not stop
 * applying because the book's sentence was written for the common case.
 *
 * It says what the state is rather than who caused it, because a departure is
 * not the only way to reach it: a player who steps back to Assign Project Team
 * and takes somebody off after ordering has done the same arithmetic to
 * themselves. They have Cancel for that, and this says nothing they would have
 * to disagree with.
 */
function UnpaidProjects({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  const short = laborShortfall(campaign);
  if (short === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-300 p-4 dark:border-amber-700">
      <p className="text-sm font-medium">
        This turn is <span className="tabular-nums">{short}</span> Labor short of what it ordered —
        the project team can no longer pay for all of it. A project goes unfinished, and which one
        is yours to say <PageRef pages={23} />
      </p>

      <ul className="mt-2 flex flex-col gap-1">
        {orderedThisTurn(campaign).map(({ at, project }) => (
          // Keyed by position, and named by what it is: three buttons all
          // reading "Leave unfinished" would be the same finding the XP
          // buttons earned in the playtest, where the only thing telling them
          // apart was the text beside them.
          <li key={at} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => {
                dispatch({
                  type: 'management/projectUnfinished',
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

const SIEGE_TERM_LABELS: Record<SiegeThreatTerm, string> = {
  'staffed-facilities': 'staffed facilities',
  'project-team': 'on the project team',
  'base-features': 'from the base itself',
  'turns-since-last-siege': 'turns since the last siege',
  'watched-from-above': 'watched from a staffed Watchtower',
};
