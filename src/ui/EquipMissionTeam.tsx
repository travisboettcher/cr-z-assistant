/**
 * Equip Mission Team: what each survivor going out carries (pg. 18; Z5-4).
 *
 * **A board, one level down from the Planning Phase's** (`docs/assignment-board.md`,
 * B3; #237): items are cards and the places they can be are lanes. Each
 * survivor going out is a lane, grouped by mission team, with their Inventory
 * Slots in use of their total; the base's Inventory is one; and shoddy gear
 * taken free (R35) is one more, holding a card for each shoddy item a skill of
 * somebody going out allows. Taking one of those makes a new item, and setting
 * one down sends it back there, never to the base.
 *
 * **Press an item, then the lane it goes to.** Each move is one
 * `mission/itemMoved` with the `EquipMove` the pickers it replaces dispatched,
 * so the log's `item-moved` entries, R38's who-moves-what and the refusals are
 * `equip.ts`'s, unchanged. A lane that would refuse the item says why instead
 * of offering a Move button; a lane that would only warn shows the warning and
 * asks once before it moves (the override is never stored, as before).
 *
 * The vehicles each team takes are a second, smaller board after it
 * (`VehicleBoard`, B4; R65; Z5-12). The Inventory and the roster stay in their modals, opened from
 * here with `OpenPanel`.
 */

import { useState } from 'react';
import type { ItemId } from '../data/equipment';
import type { Campaign, Item, Survivor } from '../engine/campaign';
import { equipCheck, equippable, shoddyOffers, type EquipMove } from '../engine/equip';
import { slotsInUse } from '../engine/equipment';
import { hungerPenalty } from '../engine/feeding';
import { missionTeams } from '../engine/missions';
import { inventorySlots } from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { LaneFrame } from './AssignmentBoard';
import { describeItem, ITEM_LABELS } from './equipmentLabels';
import { AutoShopNote, VehicleBoard } from './MissionVehicles';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { BOARD_MOVE, boardCard, FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const WARNING = 'text-sm text-amber-800 dark:text-amber-300';

const QUIET = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800`;

/** What is picked up: an item that exists, or a shoddy one not taken yet. */
type Picked =
  | { readonly kind: 'item'; readonly item: Item }
  | { readonly kind: 'shoddy'; readonly item: ItemId };

/** Where a lane sends what is dropped on it. */
type Place = { readonly survivor: Survivor } | 'base' | 'free';

const pickedName = (picked: Picked): string =>
  picked.kind === 'item'
    ? describeItem(picked.item)
    : `shoddy ${ITEM_LABELS[picked.item].toLowerCase()}`;

/** The move dropping the picked card on this lane makes, or `null` where it makes none. */
function moveTo(campaign: Campaign, picked: Picked, place: Place, fresh: string): EquipMove | null {
  if (picked.kind === 'shoddy') {
    // A shoddy item not taken yet can only be taken, by somebody going out.
    return typeof place === 'object'
      ? { kind: 'take-shoddy', id: fresh, item: picked.item, survivor: place.survivor.id }
      : null;
  }

  const { item } = picked;
  const shoddy = item.grade === 'shoddy';

  if (typeof place === 'object') {
    return place.survivor.items.some((held) => held.id === item.id)
      ? null
      : { kind: 'move', id: item.id, to: { survivor: place.survivor.id } };
  }

  // Shoddy gear set down goes back to the free supply, the rest to the base,
  // and neither lane takes what is already in it.
  const held = !campaign.inventory.some((one) => one.id === item.id);
  return held && (place === 'free') === shoddy ? { kind: 'move', id: item.id, to: 'base' } : null;
}

export function EquipMissionTeam({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [fresh, setFresh] = useState(() => crypto.randomUUID());

  const going = equippable(campaign);
  const ids = new Set(going.map((survivor) => survivor.id));
  const teams = missionTeams(campaign)
    .map((team) => ({ ...team, members: team.members.filter((one) => ids.has(one.id)) }))
    .filter((team) => team.members.length > 0);
  const free = [...new Set(going.flatMap((survivor) => shoddyOffers(survivor)))];

  // An item picked up that has since gone (used, or moved elsewhere) is nothing to move.
  const holding =
    picked?.kind === 'item'
      ? [...campaign.inventory, ...going.flatMap((survivor) => survivor.items)].find(
          (item) => item.id === picked.item.id,
        )
      : undefined;
  const current: Picked | null =
    picked?.kind === 'item'
      ? holding === undefined
        ? null
        : { kind: 'item', item: holding }
      : picked;

  function pick(next: Picked) {
    const same =
      current !== null &&
      current.kind === next.kind &&
      (next.kind === 'item'
        ? current.kind === 'item' && current.item.id === next.item.id
        : current.item === next.item);
    setPicked(same ? null : next);
    setAsking(null);
  }

  function commit(move: EquipMove) {
    dispatch({ type: 'mission/itemMoved', move, at: new Date().toISOString() });
    setPicked(null);
    setAsking(null);
    setFresh(crypto.randomUUID());
  }

  const card = (key: string, label: string, next: Picked, isPicked: boolean) => (
    <li key={key}>
      <button
        type="button"
        aria-pressed={isPicked}
        className={boardCard(isPicked)}
        onClick={() => {
          pick(next);
        }}
      >
        <span className="font-medium">{label}</span>
      </button>
    </li>
  );

  const itemCard = (item: Item) =>
    card(
      item.id,
      describeItem(item),
      { kind: 'item', item },
      current?.kind === 'item' && current.item.id === item.id,
    );

  /** What a lane offers the picked card: a Move button, the reason it can't, or a question. */
  const target = (key: string, place: Place, verb: string) => {
    if (current === null) return null;
    const move = moveTo(campaign, current, place, fresh);
    if (move === null) return null;

    const check = equipCheck(campaign, move);
    const name = pickedName(current);

    if (check.blockers.length > 0) {
      return (
        <ul className="mt-2 flex flex-col gap-1">
          {check.blockers.map((blocker) => (
            <li key={blocker.code} className={WARNING}>
              {blocker.message} <PageRef pages={blocker.pages} />
            </li>
          ))}
        </ul>
      );
    }

    const warned = check.warnings.length > 0;

    return (
      <div className="mt-2 flex flex-col items-start gap-1">
        {check.warnings.map((warning) => (
          <p key={warning.code} className={WARNING}>
            {warning.message} <PageRef pages={warning.pages} />
          </p>
        ))}
        {asking === key ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BOARD_MOVE}
              onClick={() => {
                commit(move);
              }}
            >
              {verb} it anyway
            </button>
            <button
              type="button"
              className={QUIET}
              onClick={() => {
                setAsking(null);
              }}
            >
              Leave it
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={BOARD_MOVE}
            onClick={() => {
              if (warned) setAsking(key);
              else commit(move);
            }}
          >
            {verb} {name} here
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className={HINT}>
        Press an item, then where it goes: to somebody going out, back to the{' '}
        <OpenPanel panel="inventory">base’s Inventory</OpenPanel>, or set down if it was shoddy and
        free. Anybody staying home keeps what they hold <PageRef pages={18} />
      </p>

      {teams.length === 0 ? (
        <p className={HINT}>Nobody is going out this turn, so nobody is equipped.</p>
      ) : (
        <>
          {current !== null && (
            <p role="status" className="text-sm font-medium">
              Choose where the {pickedName(current)} goes, or press it again to cancel.
            </p>
          )}

          {teams.map((team) => (
            <fieldset
              key={team.team}
              className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700"
            >
              <legend className="px-1 text-sm font-semibold">Mission team {team.team}</legend>
              {team.members.map((survivor) => (
                <LaneFrame key={survivor.id} name={survivor.name}>
                  <Slots campaign={campaign} survivor={survivor} />
                  {survivor.items.length === 0 ? (
                    <p className={`mt-1 ${HINT}`}>Carrying nothing</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">{survivor.items.map(itemCard)}</ul>
                  )}
                  {target(survivor.id, { survivor }, 'Move')}
                </LaneFrame>
              ))}
            </fieldset>
          ))}

          <LaneFrame name="The base’s Inventory" pages={18}>
            {campaign.inventory.length === 0 ? (
              <p className={`mt-1 ${HINT}`}>Empty.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">{campaign.inventory.map(itemCard)}</ul>
            )}
            {target('base', 'base', 'Move')}
          </LaneFrame>

          <LaneFrame name="Shoddy, free" pages="18, 37">
            {free.length === 0 ? (
              <p className={`mt-1 ${HINT}`}>No skill of anybody going out uses free shoddy gear.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {free.map((item) =>
                  card(
                    item,
                    `Shoddy ${ITEM_LABELS[item].toLowerCase()}`,
                    { kind: 'shoddy', item },
                    current?.kind === 'shoddy' && current.item === item,
                  ),
                )}
              </ul>
            )}
            {target('free', 'free', 'Set')}
          </LaneFrame>

          <VehicleBoard campaign={campaign} teams={teams.map((team) => team.team)} />
        </>
      )}

      <AutoShopNote campaign={campaign} />

      <p className={HINT}>
        Skills and Scores are on each survivor’s sheet, in the{' '}
        <OpenPanel panel="survivors">roster</OpenPanel>.
      </p>
    </div>
  );
}

/** A survivor's Inventory Slots in use of their total, in amber when over (pg. 14). */
function Slots({
  campaign,
  survivor,
}: {
  readonly campaign: Campaign;
  readonly survivor: Survivor;
}) {
  const used = slotsInUse(survivor);
  const slots = inventorySlots(survivor, hungerPenalty(campaign));

  return (
    <p className={used > slots ? 'text-sm font-medium text-amber-800 dark:text-amber-300' : HINT}>
      Inventory Slots{' '}
      <span className="tabular-nums">
        {used} / {slots}
      </span>
      {used > slots && ' — more than they can carry'} <PageRef pages={14} />
    </p>
  );
}
