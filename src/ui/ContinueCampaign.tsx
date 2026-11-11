/**
 * Starting to track a campaign already under way (#210;
 * `docs/continue-campaign.md`).
 *
 * The new-campaign forms ask, behind one tick, for what the log would
 * otherwise know from the turns before: the turn, the siege counter, last
 * turn's siege and Feed, the stories finished, and the origin's own history.
 * The campaign then opens at that turn's Select Mission. What it holds (the
 * survivors, the base and the stores) is entered as it stands, afterwards.
 */

import { useId } from 'react';
import { MISSIONS, PROMOTION_STORIES } from '../data/missions';
import { SPELLS, type CampaignOrigin } from '../data/origins';
import { CONTINUE_DRAFT, draftProblem, type ContinueDraft } from './continueDraft';
import { MISSION_LABELS } from '../labels/missionLabels';
import { SPELL_LABELS } from '../labels/spellLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';
const NUMBER = `${TOUCH_TARGET} ${FOCUS_RING} w-20 rounded-lg border border-stone-300 bg-stone-50 px-2 dark:border-stone-600 dark:bg-stone-800`;

/** A ticked box, with what it says. */
function Tick({
  checked,
  onChange,
  children,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className={`${FOCUS_RING} size-5`}
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {children}
    </label>
  );
}

/** A whole number typed in, with its label. */
function Count({
  label,
  value,
  onChange,
  min,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly min?: number;
  readonly children?: React.ReactNode;
}) {
  const id = useId();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        {...(min === undefined ? {} : { min })}
        className={NUMBER}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {children}
    </div>
  );
}

/** Each of these, ticked or not, kept in the given order. */
function toggled<T>(all: readonly T[], held: readonly T[], one: T, on: boolean): readonly T[] {
  return all.filter((each) => (each === one ? on : held.includes(each)));
}

/**
 * The tick that makes a new campaign one already under way, and its questions
 * once ticked (#210). `null` for a campaign starting at turn 1.
 */
export function ContinueChoices({
  origin,
  draft,
  onChange,
}: {
  readonly origin: CampaignOrigin | undefined;
  readonly draft: ContinueDraft | null;
  readonly onChange: (draft: ContinueDraft | null) => void;
}) {
  const set = (changes: Partial<ContinueDraft>) => {
    if (draft !== null) onChange({ ...draft, ...changes });
  };
  const problem = draft === null ? null : draftProblem(draft, origin);

  return (
    <div className="flex flex-col gap-3">
      <Tick
        checked={draft !== null}
        onChange={(on) => {
          onChange(on ? CONTINUE_DRAFT : null);
        }}
      >
        Continue a campaign already under way <PageRef pages={17} />
      </Tick>

      {draft !== null && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-700">
          <legend className="px-1 text-sm font-medium">Where the campaign is</legend>
          <p className={HINT}>
            Tracking starts at the turn’s Select Mission. Enter its survivors, base and stores
            afterwards, as they stand.
          </p>

          <Count
            label="Turn"
            value={draft.turn}
            min={2}
            onChange={(turn) => {
              set({ turn });
            }}
          />
          <Count
            label="Turns since the last siege"
            value={draft.turnsSinceSiege}
            min={0}
            onChange={(turnsSinceSiege) => {
              set({ turnsSinceSiege });
            }}
          >
            <PageRef pages={23} />
          </Count>

          <Tick
            checked={draft.siegeCalled}
            onChange={(siegeCalled) => {
              set({ siegeCalled });
            }}
          >
            Last turn’s horde check called a siege <PageRef pages={85} />
          </Tick>
          {draft.siegeCalled && (
            <Count
              label="Siege Threat it was called at"
              value={draft.siegeCalledAt}
              onChange={(siegeCalledAt) => {
                set({ siegeCalledAt });
              }}
            />
          )}
          <Tick
            checked={draft.hordeForced}
            onChange={(hordeForced) => {
              set({ hordeForced });
            }}
          >
            The next horde roll succeeds on its own <PageRef pages={81} />
          </Tick>
          <Tick
            checked={draft.siegeCleared}
            onChange={(siegeCleared) => {
              set({ siegeCleared });
            }}
          >
            Last turn’s Siege Defense left no zombies <PageRef pages={86} />
          </Tick>

          <Tick
            checked={draft.wentShort}
            onChange={(wentShort) => {
              set({ wentShort });
            }}
          >
            The community went short at last turn’s Feed <PageRef pages={22} />
          </Tick>
          {draft.wentShort && (
            <div className="flex flex-wrap gap-4">
              <Count
                label="Hunger"
                value={draft.hunger}
                min={1}
                onChange={(hunger) => {
                  set({ hunger });
                }}
              />
              <Count
                label="Head count then"
                value={draft.population}
                min={1}
                onChange={(population) => {
                  set({ population });
                }}
              />
            </div>
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm">
              Stories finished <PageRef pages={87} />
            </legend>
            {PROMOTION_STORIES.map((story) => (
              <Tick
                key={story}
                checked={draft.storiesDone.includes(story)}
                onChange={(on) => {
                  set({ storiesDone: toggled(PROMOTION_STORIES, draft.storiesDone, story, on) });
                }}
              >
                {MISSION_LABELS[story]}
              </Tick>
            ))}
          </fieldset>

          {origin === 'magic' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">
                Magic so far <PageRef pages="112–114, 127" />
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {SPELLS.map((spell) => (
                  <Tick
                    key={spell}
                    checked={draft.spellsSeen.includes(spell)}
                    onChange={(on) => {
                      set({ spellsSeen: toggled(SPELLS, draft.spellsSeen, spell, on) });
                    }}
                  >
                    {SPELL_LABELS[spell]} seen
                  </Tick>
                ))}
              </div>
              <Tick
                checked={draft.graveyardDone}
                onChange={(graveyardDone) => {
                  set({ graveyardDone });
                }}
              >
                {MISSION_LABELS['the-graveyard']} completed{' '}
                <PageRef pages={MISSIONS['the-graveyard'].pages} />
              </Tick>
              <Count
                label={`${MISSION_LABELS['the-necromancer']} won`}
                value={draft.necromancerWins}
                min={0}
                onChange={(necromancerWins) => {
                  set({ necromancerWins });
                }}
              >
                times
              </Count>
              <Tick
                checked={draft.necromancerKilled}
                onChange={(necromancerKilled) => {
                  set({ necromancerKilled });
                }}
              >
                The Necromancer was killed
              </Tick>
              <Count
                label="Spell discounts spent"
                value={draft.discountsUsed}
                min={0}
                onChange={(discountsUsed) => {
                  set({ discountsUsed });
                }}
              />
            </fieldset>
          )}

          {origin === 'viral' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">
                Containment <PageRef pages={MISSIONS['experimental-data'].pages} />
              </legend>
              <Tick
                checked={draft.containment}
                onChange={(containment) => {
                  set({ containment });
                }}
              >
                Unlocked by {MISSION_LABELS['experimental-data']}
              </Tick>
              {draft.containment && (
                <Count
                  label="Hardware it costs"
                  value={draft.containmentHardware}
                  min={0}
                  onChange={(containmentHardware) => {
                    set({ containmentHardware });
                  }}
                />
              )}
            </fieldset>
          )}

          {problem !== null && <p className={HINT}>{problem}</p>}
        </fieldset>
      )}
    </div>
  );
}
