/**
 * What else a story's ending gives, inside its outcome form (pp. 90–102;
 * Z7-4): one field for each thing the ending asks for (`StoryAsk`), a weapon,
 * a roll, a survivor, a count. What each gives is said under the form with
 * the rest of the outcome's consequences.
 */

import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  EQUIPMENT,
  ITEM_IDS,
  RARE_ITEM_TABLE,
  rareItemFor,
  type Grade,
  type ItemId,
} from '../data/equipment';
import type { StoryAsk, StoryResult } from '../data/stories';
import type { Campaign, Survivor } from '../engine/campaign';
import type { StoryItemSource } from '../engine/log';
import {
  attachable,
  withoutExtra,
  type StoryExtras,
  type StoryItemChoice,
} from '../engine/storyRewards';
import { describeItem, ITEM_LABELS } from '../labels/equipmentLabels';
import { missionTitle } from '../labels/missionLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const FIELD = `${FOCUS_RING} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

/** Every item and grade on the Rare Item Table, once each, in the table's order (R127). */
const RARE_PICKS = [
  ...new Map(
    Object.values(RARE_ITEM_TABLE)
      .flat()
      .map((entry) => [`${entry.item}:${entry.grade}`, entry] as const),
  ).values(),
];

/** The weapons a survivor is skilled in, at a grade they come in (pg. 90). */
function skilledWeapons(holder: Survivor, grade: Grade): readonly ItemId[] {
  return ITEM_IDS.filter((id) => {
    const rules = EQUIPMENT[id];

    return (
      rules.kind === 'weapon' &&
      (rules.grades as readonly Grade[]).includes(grade) &&
      (rules.uses ?? []).some((skill) => holder.skills[skill] !== undefined)
    );
  });
}

export function StoryExtrasFields({
  campaign,
  members,
  holder,
  result,
  prefix,
  extras,
  onChange,
}: {
  readonly campaign: Campaign;
  readonly members: readonly Survivor[];
  readonly holder: Survivor;
  readonly result: StoryResult;
  /** Makes each control's id the team's own. */
  readonly prefix: string;
  readonly extras: StoryExtras;
  readonly onChange: (extras: StoryExtras) => void;
}) {
  const items = extras.items ?? [];
  // An id for each item the form may add, made as a hand-over's are (Z5-11).
  const idFor = (from: StoryItemSource, at = 0) =>
    `${campaign.id}-story-${String(campaign.log.length)}-${from}-${String(at + 1)}`;
  const withItems = (from: readonly StoryItemSource[], next: readonly StoryItemChoice[]) => {
    onChange({ ...extras, items: [...items.filter((item) => !from.includes(item.from)), ...next] });
  };
  const others = members.filter((member) => member.id !== holder.id);

  const field = (ask: StoryAsk) => {
    const id = `${prefix}-story-${ask.kind}`;

    switch (ask.kind) {
      case 'skilled-weapon': {
        const chosen = items.find((item) => item.from === 'skilled-weapon');
        const weapons = skilledWeapons(holder, ask.grade);

        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              The {ask.grade} weapon the loved one carried
            </label>
            <select
              id={id}
              className={SELECT}
              value={chosen?.item ?? ''}
              onChange={(changed) => {
                withItems(
                  ['skilled-weapon'],
                  changed.target.value === ''
                    ? []
                    : [
                        {
                          id: idFor('skilled-weapon'),
                          from: 'skilled-weapon',
                          item: changed.target.value as ItemId,
                          grade: ask.grade,
                          survivor: holder.id,
                        },
                      ],
                );
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              {weapons.map((weapon) => (
                <option key={weapon} value={weapon}>
                  {ITEM_LABELS[weapon]}
                </option>
              ))}
            </select>
            <PageRef pages={ask.pages} />
            {weapons.length === 0 && (
              <span className={HINT}>{holder.name} has no weapon skill to choose one for.</span>
            )}
          </div>
        );
      }

      case 'attaches': {
        const chosen = (extras.alsoAttached ?? []).find((one) => one.mission === ask.story);
        const open = attachable(campaign, ask.story);

        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              {ask.story === 'preppers-stash-1'
                ? 'Who used the Computer twice'
                : 'Who opened the safe on a roll of 1'}
            </label>
            <select
              id={id}
              className={SELECT}
              value={chosen?.survivor ?? ''}
              onChange={(changed) => {
                const rest = (extras.alsoAttached ?? []).filter((one) => one.mission !== ask.story);

                onChange({
                  ...extras,
                  alsoAttached:
                    changed.target.value === ''
                      ? rest
                      : [...rest, { mission: ask.story, survivor: changed.target.value }],
                });
              }}
            >
              <option value="">Nobody</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <PageRef pages={ask.pages} />
            {!open && (
              <span className={HINT}>
                {missionTitle(ask.story)} is attached to somebody or done, so nothing is attached.
              </span>
            )}
          </div>
        );
      }

      case 'found-item': {
        const chosen = items.find((item) => item.from === 'found-item');

        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              Who took the {describeItem(ask)}
            </label>
            <select
              id={id}
              className={SELECT}
              value={chosen?.survivor ?? ''}
              onChange={(changed) => {
                withItems(
                  ['found-item'],
                  changed.target.value === ''
                    ? []
                    : [
                        {
                          id: idFor('found-item'),
                          from: 'found-item',
                          item: ask.item,
                          grade: ask.grade,
                          survivor: changed.target.value,
                        },
                      ],
                );
              }}
            >
              <option value="">Nobody</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <PageRef pages={ask.pages} />
          </div>
        );
      }

      case 'vehicle': {
        const vehicle = extras.vehicle;

        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={FOCUS_RING}
                checked={vehicle !== undefined}
                onChange={(changed) => {
                  onChange(
                    changed.target.checked
                      ? {
                          ...extras,
                          vehicle: {
                            id: `${campaign.id}-story-${String(campaign.log.length)}-vehicle`,
                            label: 'Boat',
                          },
                        }
                      : withoutExtra(extras, 'vehicle'),
                  );
                }}
              />
              The team left in the boat, a Tier {ask.tier} vehicle
            </label>
            <PageRef pages={ask.pages} />
            {vehicle !== undefined && (
              <>
                <label className="sr-only" htmlFor={`${id}-label`}>
                  The boat’s name
                </label>
                <input
                  id={`${id}-label`}
                  className={FIELD}
                  value={vehicle.label}
                  onChange={(changed) => {
                    onChange({ ...extras, vehicle: { ...vehicle, label: changed.target.value } });
                  }}
                />
              </>
            )}
          </div>
        );
      }

      case 'jaded': {
        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              Who becomes Jaded, if {holder.name} fell while Berserk
            </label>
            <select
              id={id}
              className={SELECT}
              value={extras.jaded ?? ''}
              onChange={(changed) => {
                onChange(
                  changed.target.value === ''
                    ? withoutExtra(extras, 'jaded')
                    : { ...extras, jaded: changed.target.value },
                );
              }}
            >
              <option value="">Nobody</option>
              {others.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <PageRef pages={ask.pages} />
          </div>
        );
      }

      case 'quality-roll': {
        const rolled = items.find((item) => item.from === 'quality-roll');
        const entry = rolled?.entry;

        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              Quality Items roll
            </label>
            <select
              id={id}
              className={SELECT}
              value={entry ?? ''}
              onChange={(changed) => {
                withItems(
                  ['quality-roll'],
                  [
                    {
                      id: idFor('quality-roll'),
                      from: 'quality-roll',
                      entry: Number(changed.target.value) as D10Result,
                    },
                  ],
                );
              }}
            >
              <option value="" disabled>
                Rolled…
              </option>
              {D10_RESULTS.map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
            <PageRef pages={ask.pages} />
            {entry !== undefined && (
              <span className="text-sm font-medium">
                {describeItem(
                  RARE_ITEM_TABLE['quality-item'][entry - 1] as { item: ItemId; grade: Grade },
                )}
              </span>
            )}
          </div>
        );
      }

      case 'rare-rolls-or-picks': {
        const picking = items.some((item) => item.from === 'rare-pick');
        const rolls = Array.from(
          { length: ask.rolls },
          (_, at) =>
            items.filter((item) => item.from === 'rare-roll')[at] ?? {
              id: idFor('rare-roll', at),
              from: 'rare-roll' as const,
            },
        );
        const picks = Array.from(
          { length: ask.picks },
          (_, at) =>
            items.filter((item) => item.from === 'rare-pick')[at] ?? {
              id: idFor('rare-pick', at),
              from: 'rare-pick' as const,
            },
        );
        const setRoll = (at: number, next: StoryItemChoice) => {
          withItems(
            ['rare-roll', 'rare-pick'],
            rolls.map((one, other) => (other === at ? next : one)),
          );
        };
        const setPick = (at: number, next: StoryItemChoice) => {
          withItems(
            ['rare-roll', 'rare-pick'],
            picks.map((one, other) => (other === at ? next : one)),
          );
        };

        return (
          <fieldset key={id} className="flex flex-col gap-2">
            <legend className="text-sm">
              The trap door’s Rare Items <PageRef pages={ask.pages} />
            </legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-way`}
                  className={FOCUS_RING}
                  checked={!picking}
                  onChange={() => {
                    withItems(['rare-roll', 'rare-pick'], []);
                  }}
                />
                {ask.rolls} rolls on the table
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-way`}
                  className={FOCUS_RING}
                  checked={picking}
                  onChange={() => {
                    withItems(['rare-roll', 'rare-pick'], picks);
                  }}
                />
                {ask.picks} items picked from it
              </label>
            </div>

            {picking
              ? picks.map((pick, at) => (
                  <div key={pick.id} className="flex flex-wrap items-center gap-2">
                    <label className="text-sm" htmlFor={`${id}-pick-${String(at)}`}>
                      Item {at + 1}
                    </label>
                    <select
                      id={`${id}-pick-${String(at)}`}
                      className={SELECT}
                      value={pick.item === undefined ? '' : `${pick.item}:${String(pick.grade)}`}
                      onChange={(changed) => {
                        const [item, grade] = changed.target.value.split(':') as [ItemId, Grade];
                        setPick(at, { ...pick, item, grade });
                      }}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {RARE_PICKS.map((entry) => (
                        <option
                          key={`${entry.item}:${entry.grade}`}
                          value={`${entry.item}:${entry.grade}`}
                        >
                          {describeItem(entry)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              : rolls.map((roll, at) => (
                  <div key={roll.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>Roll {at + 1}</span>
                    {(['subtable', 'entry'] as const).map((die) => (
                      <select
                        key={die}
                        aria-label={`Roll ${String(at + 1)}, ${die === 'subtable' ? 'first' : 'second'} d10`}
                        className={SELECT}
                        value={roll[die] ?? ''}
                        onChange={(changed) => {
                          setRoll(at, {
                            ...roll,
                            [die]: Number(changed.target.value) as D10Result,
                          });
                        }}
                      >
                        <option value="" disabled>
                          {die === 'subtable' ? 'first d10' : 'second d10'}
                        </option>
                        {D10_RESULTS.map((one) => (
                          <option key={one} value={one}>
                            {one}
                          </option>
                        ))}
                      </select>
                    ))}
                    {roll.subtable !== undefined && roll.entry !== undefined && (
                      <span className="font-medium">
                        {describeItem(rareItemFor(roll.subtable, roll.entry))}
                      </span>
                    )}
                  </div>
                ))}
          </fieldset>
        );
      }

      case 'resources': {
        return (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              Resource and material tokens carried home
            </label>
            <input
              id={id}
              inputMode="numeric"
              className={`${FIELD} w-20 tabular-nums`}
              value={extras.resources === undefined ? '' : String(extras.resources)}
              onChange={(changed) => {
                const typed = changed.target.value.trim();

                onChange(
                  typed === ''
                    ? withoutExtra(extras, 'resources')
                    : { ...extras, resources: Number(typed) },
                );
              }}
            />
            <PageRef pages={ask.pages} />
            <span className={HINT}>More than {ask.over} makes Unrest 0 this turn.</span>
          </div>
        );
      }
    }
  };

  return <>{(result.asks ?? []).map(field)}</>;
}
