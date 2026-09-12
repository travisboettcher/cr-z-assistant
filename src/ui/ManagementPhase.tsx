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
import { D10_RESULTS, type D10Result } from '../data/dice';
import type { TurnStepId } from '../data/turn';
import type { Campaign } from '../engine/campaign';
import {
  exhaustion,
  foodRequired,
  hunger,
  hungerIfFedNow,
  penaltyFor,
  survivorsFed,
} from '../engine/feeding';
import { beds } from '../engine/base';
import { biteCandidates, mustCheck, rotOutcome, rotTarget } from '../engine/rot';
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

export function ManagementPhase({ campaign, step }: ManagementPhaseProps) {
  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      {step === 'check-for-rot' && <CheckForRot campaign={campaign} />}
      {step === 'feed-your-survivors' && <Feed campaign={campaign} />}
      {step === 'assign-beds' && <AssignBeds campaign={campaign} />}

      {step !== 'check-for-rot' && step !== 'feed-your-survivors' && step !== 'assign-beds' && (
        <p className={HINT}>
          Unrest, Storage, the Horde and Departures are not built yet — work them on paper and end
          the turn when the table has <PageRef pages={23} />
        </p>
      )}
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

  return (
    <>
      <p className={HINT}>
        Every survivor at 0 Health checks against <span className="tabular-nums">{target}</span> —
        twelve, less the Medical Clinic’s combined Medicine. Roll a d10 and add their Tier; a
        natural 1 always fails and a natural 10 always holds <PageRef pages={22} />
      </p>

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

  // Shown before the press, so a player can see what the roll they are about to
  // enter would cost before it costs it.
  const outcome = rotOutcome(campaign, survivorId, roll, bitten === '' ? null : bitten);

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

        {candidates.length > 0 && (
          <>
            <label className="text-sm" htmlFor={`rot-bite-${survivorId}`}>
              Bites
            </label>
            <select
              id={`rot-bite-${survivorId}`}
              value={bitten}
              className={FIELD}
              onChange={(changed) => {
                setBitten(changed.target.value);
              }}
            >
              <option value="">nobody</option>
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
            bitten: bitten === '' ? null : bitten,
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
  const required = foodRequired(campaign);
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
 * Step 3: the only one of the three that changes nothing.
 *
 * Exhaustion is population against beds, both readable at any moment, so there
 * is nothing to apply and nothing to guard — it returns to zero the instant a
 * Bunk Room goes up.
 */
function AssignBeds({ campaign }: { readonly campaign: Campaign }) {
  const base = campaign.base;
  const sleeping = base === null ? 0 : beds(base);
  const short = exhaustion(campaign);

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
        Nothing to apply: this is counted again from scratch every turn, and never added to what it
        was <PageRef pages={23} />
      </p>
    </>
  );
}
