/**
 * Equip Mission Team: what each survivor going out carries (pg. 18; Z5-4).
 *
 * One block per mission team, a row per survivor on it: their slots, what
 * they carry and where each item can go, and what they can take — from the
 * base's Inventory, or shoddy gear free (R35) — and the vehicles it takes,
 * each burning its Fuel (R65; Z5-12). Who may be equipped, and why a
 * move is refused or warned about, are `equip.ts`'s answers: this screen
 * renders them. The Inventory and the roster stay in their modals, opened from
 * here with `OpenPanel`.
 */

import { useState, type ReactNode } from 'react';
import type { ItemId } from '../data/equipment';
import type { Campaign, Item, Survivor } from '../engine/campaign';
import { permitted, type Check } from '../engine/checks';
import {
  equipCheck,
  equippable,
  shoddyOffers,
  type EquipCode,
  type EquipMove,
} from '../engine/equip';
import { slotsInUse } from '../engine/equipment';
import { hungerPenalty } from '../engine/feeding';
import { missionTeams } from '../engine/missions';
import { inventorySlots } from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { describeItem, ITEM_LABELS } from './equipmentLabels';
import { AutoShopNote, TeamVehicles } from './MissionVehicles';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

export function EquipMissionTeam({ campaign }: { readonly campaign: Campaign }) {
  const going = equippable(campaign);
  const ids = new Set(going.map((survivor) => survivor.id));
  const teams = missionTeams(campaign)
    .map((team) => ({ ...team, members: team.members.filter((one) => ids.has(one.id)) }))
    .filter((team) => team.members.length > 0);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className={HINT}>
        Items move between the <OpenPanel panel="inventory">base’s Inventory</OpenPanel> and the
        survivors going out, and between them. Anybody staying home keeps what they hold{' '}
        <PageRef pages={18} />
      </p>

      {teams.length === 0 ? (
        <p className={HINT}>Nobody is going out this turn, so nobody is equipped.</p>
      ) : (
        teams.map((team) => (
          <fieldset
            key={team.team}
            className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700"
          >
            <legend className="px-1 text-sm font-semibold">Mission team {team.team}</legend>
            {team.members.map((survivor) => (
              <SurvivorEquipment
                key={survivor.id}
                campaign={campaign}
                survivor={survivor}
                going={going}
              />
            ))}
            <TeamVehicles campaign={campaign} team={team.team} />
          </fieldset>
        ))
      )}

      <AutoShopNote campaign={campaign} />

      <p className={HINT}>
        Skills and Scores are on each survivor’s sheet, in the{' '}
        <OpenPanel panel="survivors">roster</OpenPanel>.
      </p>
    </div>
  );
}

function SurvivorEquipment({
  campaign,
  survivor,
  going,
}: {
  readonly campaign: Campaign;
  readonly survivor: Survivor;
  readonly going: readonly Survivor[];
}) {
  const used = slotsInUse(survivor);
  const slots = inventorySlots(survivor, hungerPenalty(campaign));

  return (
    <section aria-label={survivor.name} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{survivor.name}</h4>
        <p
          className={used > slots ? 'text-sm font-medium text-amber-800 dark:text-amber-300' : HINT}
        >
          Inventory Slots{' '}
          <span className="tabular-nums">
            {used} / {slots}
          </span>
          {used > slots && ' — more than they can carry'} <PageRef pages={14} />
        </p>
      </div>

      {survivor.items.length === 0 ? (
        <p className={HINT}>Carrying nothing</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {survivor.items.map((item) => (
            <li key={item.id}>
              <MoveItem campaign={campaign} item={item} holder={survivor} going={going} />
            </li>
          ))}
        </ul>
      )}

      <TakeItem campaign={campaign} survivor={survivor} />
    </section>
  );
}

/** Where a carried item can go: back, set down if shoddy, or to somebody else going out. */
function MoveItem({
  campaign,
  item,
  holder,
  going,
}: {
  readonly campaign: Campaign;
  readonly item: Item;
  readonly holder: Survivor;
  readonly going: readonly Survivor[];
}) {
  const { dispatch } = useCampaign();
  const others = going.filter((survivor) => survivor.id !== holder.id);
  const [target, setTarget] = useState('base');
  const id = `move-${item.id}`;

  const move: EquipMove = {
    kind: 'move',
    id: item.id,
    to: target === 'base' ? 'base' : { survivor: target },
  };

  return (
    <EquipAction
      check={equipCheck(campaign, move)}
      label="Move"
      what={describeItem(item)}
      overrideLabel="Move it anyway"
      onCommit={() => {
        dispatch({ type: 'mission/itemMoved', move, at: new Date().toISOString() });
        setTarget('base');
      }}
    >
      <label className="text-sm" htmlFor={id}>
        <span className="font-medium">{describeItem(item)}</span> to
      </label>
      <select
        id={id}
        className={SELECT}
        value={target}
        onChange={(changed) => {
          setTarget(changed.target.value);
        }}
      >
        <option value="base">
          {item.grade === 'shoddy' ? 'Set it down' : 'The base’s Inventory'}
        </option>
        {others.map((survivor) => (
          <option key={survivor.id} value={survivor.id}>
            {survivor.name}
          </option>
        ))}
      </select>
    </EquipAction>
  );
}

/** What a survivor can take up: an item in the base's Inventory, or shoddy gear free. */
function TakeItem({
  campaign,
  survivor,
}: {
  readonly campaign: Campaign;
  readonly survivor: Survivor;
}) {
  const { dispatch } = useCampaign();
  const free = shoddyOffers(survivor);
  const options = [
    ...campaign.inventory.map((item) => `base:${item.id}`),
    ...free.map((item) => `shoddy:${item}`),
  ];
  const [chosen, setChosen] = useState('');
  const [fresh, setFresh] = useState(() => crypto.randomUUID());
  const id = `take-${survivor.id}`;

  if (options.length === 0) return null;

  const pick = options.includes(chosen) ? chosen : (options[0] as string);
  const [source, value] = pick.split(/:(.*)/s) as [string, string];
  const move: EquipMove =
    source === 'base'
      ? { kind: 'move', id: value, to: { survivor: survivor.id } }
      : { kind: 'take-shoddy', id: fresh, item: value as ItemId, survivor: survivor.id };

  return (
    <EquipAction
      check={equipCheck(campaign, move)}
      label="Take"
      what={`for ${survivor.name}`}
      overrideLabel="Take it anyway"
      onCommit={() => {
        dispatch({ type: 'mission/itemMoved', move, at: new Date().toISOString() });
        setFresh(crypto.randomUUID());
      }}
    >
      <label className="text-sm" htmlFor={id}>
        Take for {survivor.name}
      </label>
      <select
        id={id}
        className={SELECT}
        value={pick}
        onChange={(changed) => {
          setChosen(changed.target.value);
        }}
      >
        {campaign.inventory.length > 0 && (
          <optgroup label="From the base’s Inventory">
            {campaign.inventory.map((item) => (
              <option key={item.id} value={`base:${item.id}`}>
                {describeItem(item)}
              </option>
            ))}
          </optgroup>
        )}
        {free.length > 0 && (
          <optgroup label="Shoddy, free">
            {free.map((item) => (
              <option key={item} value={`shoddy:${item}`}>
                Shoddy {ITEM_LABELS[item].toLowerCase()}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </EquipAction>
  );
}

/**
 * A picker, then what is wrong with the choice, then the button and its
 * override — the order every verb on a slot card uses too (`SlotAction`).
 */
function EquipAction({
  children,
  check,
  label,
  what,
  overrideLabel,
  onCommit,
}: {
  readonly children: ReactNode;
  readonly check: Check<EquipCode>;
  readonly label: string;
  readonly what: string;
  readonly overrideLabel: string;
  readonly onCommit: () => void;
}) {
  const [overridden, setOverridden] = useState(false);
  const violations = [...check.blockers, ...check.warnings];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {/* Before the button, not after it, as on a slot card. */}
      {violations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {violations.map((violation) => (
            <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={!permitted(check, overridden)}
          onClick={() => {
            onCommit();
            setOverridden(false);
          }}
        >
          {label} <span className="sr-only">{what}</span>
        </button>
        {check.warnings.length > 0 && check.blockers.length === 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overridden}
              onChange={(event) => {
                setOverridden(event.target.checked);
              }}
              className={FOCUS_RING}
            />
            {overrideLabel}
          </label>
        )}
      </div>
    </div>
  );
}
