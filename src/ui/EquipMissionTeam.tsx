/**
 * Equip Mission Team: what each survivor going out carries, and the vehicles
 * each team takes (pg. 18; Z5-4, Z5-12).
 *
 * **A board, one level down from the Planning Phase's** (`docs/assignment-board.md`,
 * B3 and B4; #237): items and vehicles are cards, and the places they can be
 * are lanes, drawn in `Board.tsx`'s two columns. On the left is what is to
 * hand: the base's Inventory; shoddy gear taken free (R35), a card for each
 * shoddy item a skill of somebody going out allows; and the vehicles at the
 * base. On the right, by mission team, each survivor going out with their
 * Inventory Slots in use of their total, and the vehicles the team takes.
 *
 * **Press a card, then the lane it goes to.** An item moves between the
 * Inventory and survivors, a shoddy one is taken from or set down on the free
 * supply (never the base), and a vehicle goes between the base and a team.
 * Each move is the `mission/itemMoved`, `mission/vehicleTaken` or
 * `mission/vehicleLeftHome` the pickers before it dispatched, so the log, R38's
 * who-moves-what and every refusal are `equip.ts`'s and `missionVehicles.ts`'s,
 * unchanged. A lane that would refuse the card is grey and says why; a lane
 * that would only warn shows the warning and asks once before it moves (the
 * override is never stored, as before).
 *
 * The Inventory and the roster stay in their modals, opened from here with
 * `OpenPanel`.
 */

import { useState } from 'react';
import { EQUIPMENT, type ItemId, type ItemRules } from '../data/equipment';
import type { Campaign, Item, Survivor, Vehicle } from '../engine/campaign';
import { equipCheck, equippable, shoddyOffers, type EquipMove } from '../engine/equip';
import { rulesOf, slotsInUse } from '../engine/equipment';
import { hungerPenalty } from '../engine/feeding';
import { fuelFor, leaveProblem, takeProblem, vehiclesTaken } from '../engine/missionVehicles';
import { missionTeams } from '../engine/missions';
import { inventorySlots } from '../engine/survivor';
import { vehicleSlots } from '../engine/vehicles';
import { useCampaign } from '../state/useCampaign';
import {
  BoardCard,
  BoardColumns,
  CardRow,
  DropZone,
  LaneFrame,
  RefusedZone,
  type ZoneNote,
} from './Board';
import { describeItem, ITEM_LABELS } from './equipmentLabels';
import { AutoShopNote } from './MissionVehicles';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { SKILL_LABELS } from './skillLabels';
import { BOARD_DROP, BOARD_QUIET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

/** What is picked up: an item that exists, a shoddy one not taken yet, or a vehicle. */
type Picked =
  | { readonly kind: 'item'; readonly item: Item }
  | { readonly kind: 'shoddy'; readonly item: ItemId }
  | { readonly kind: 'vehicle'; readonly vehicle: Vehicle };

/** Where an item lane sends what is dropped on it. */
type Place = { readonly survivor: Survivor } | 'base' | 'free';

const pickedName = (picked: Picked): string =>
  picked.kind === 'item'
    ? describeItem(picked.item)
    : picked.kind === 'shoddy'
      ? `shoddy ${ITEM_LABELS[picked.item].toLowerCase()}`
      : picked.vehicle.label;

const samePick = (one: Picked, other: Picked): boolean =>
  one.kind === 'item' && other.kind === 'item'
    ? one.item.id === other.item.id
    : one.kind === 'shoddy' && other.kind === 'shoddy'
      ? one.item === other.item
      : one.kind === 'vehicle' && other.kind === 'vehicle' && one.vehicle.id === other.vehicle.id;

/** The move dropping the picked item on this lane makes, or `null` where it makes none. */
function moveTo(campaign: Campaign, picked: Picked, place: Place, fresh: string): EquipMove | null {
  if (picked.kind === 'vehicle') return null;

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

/** "1 slot", "2 slots", or nothing for an item the catalogue has no count for yet. */
function slotLine(rules: ItemRules): readonly string[] {
  return rules.slots === null ? [] : [`${String(rules.slots)} slot${rules.slots === 1 ? '' : 's'}`];
}

/** What a vehicle card says: its Tier and Fuel, its slots, and its upgrade. */
function vehicleLines(vehicle: Vehicle): readonly string[] {
  const slots = vehicleSlots(vehicle);
  const fuel = fuelFor(vehicle);

  return [
    `Tier ${String(vehicle.tier)}${vehicle.water ? ' boat' : ''} · ${fuel === 0 ? 'no Fuel' : `${String(fuel)} Fuel`}`,
    `${String(slots.inventory)} Inventory, ${String(slots.passengers)} Passenger Slots`,
    ...(vehicle.upgrade === undefined ? [] : [ITEM_LABELS[vehicle.upgrade.item]]),
  ];
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
  const taken = vehiclesTaken(campaign);
  const teamOf = (vehicle: Vehicle) => taken.find((one) => one.vehicle === vehicle.id)?.team;

  // A card picked up that has since gone (used, moved, lost) is nothing to move.
  const current: Picked | null = (() => {
    if (picked?.kind === 'item') {
      const item = [...campaign.inventory, ...going.flatMap((survivor) => survivor.items)].find(
        (one) => one.id === picked.item.id,
      );
      return item === undefined ? null : { kind: 'item', item };
    }
    if (picked?.kind === 'vehicle') {
      const vehicle = campaign.vehicles.find((one) => one.id === picked.vehicle.id);
      return vehicle === undefined ? null : { kind: 'vehicle', vehicle };
    }
    return picked;
  })();

  function pick(next: Picked) {
    setPicked(current !== null && samePick(current, next) ? null : next);
    setAsking(null);
  }

  function done() {
    setPicked(null);
    setAsking(null);
    setFresh(crypto.randomUUID());
  }

  const isPicked = (next: Picked) => current !== null && samePick(current, next);

  const itemCard = (item: Item) => {
    const next: Picked = { kind: 'item', item };
    return (
      <BoardCard
        key={item.id}
        title={describeItem(item)}
        lines={slotLine(rulesOf(item))}
        picked={isPicked(next)}
        onPress={() => {
          pick(next);
        }}
      />
    );
  };

  const vehicleCard = (vehicle: Vehicle) => {
    const next: Picked = { kind: 'vehicle', vehicle };
    return (
      <BoardCard
        key={vehicle.id}
        title={vehicle.label}
        lines={vehicleLines(vehicle)}
        picked={isPicked(next)}
        onPress={() => {
          pick(next);
        }}
      />
    );
  };

  /** What an item lane offers the picked card: a press, a question, or why not. */
  const itemTarget = (key: string, place: Place, verb: string) => {
    if (current === null) return null;
    const move = moveTo(campaign, current, place, fresh);
    if (move === null) return null;

    const check = equipCheck(campaign, move);
    const notes = (violations: typeof check.blockers): readonly ZoneNote[] =>
      violations.map((one) => ({ key: one.code, message: one.message, pages: one.pages }));

    if (check.blockers.length > 0) return <RefusedZone reasons={notes(check.blockers)} />;

    const commit = () => {
      dispatch({ type: 'mission/itemMoved', move, at: new Date().toISOString() });
      done();
    };

    return (
      <DropZone warnings={notes(check.warnings)}>
        {asking === key ? (
          <>
            <button type="button" className={`${BOARD_DROP} w-auto`} onClick={commit}>
              {verb} it anyway
            </button>
            <button
              type="button"
              className={BOARD_QUIET}
              onClick={() => {
                setAsking(null);
              }}
            >
              Leave it
            </button>
          </>
        ) : (
          <button
            type="button"
            className={BOARD_DROP}
            onClick={() => {
              if (check.warnings.length > 0) setAsking(key);
              else commit();
            }}
          >
            {verb} {pickedName(current)} here
          </button>
        )}
      </DropZone>
    );
  };

  /** What a vehicle lane offers the picked vehicle: a press, or why not. */
  const vehicleTarget = (team: number | null) => {
    if (current?.kind !== 'vehicle') return null;
    const { vehicle } = current;
    if ((teamOf(vehicle) ?? null) === team) return null;

    const problem =
      team === null ? leaveProblem(campaign, vehicle.id) : takeProblem(campaign, team, vehicle.id);
    if (problem !== null) return <RefusedZone reasons={[{ key: 'problem', message: problem }]} />;

    return (
      <DropZone>
        <button
          type="button"
          className={BOARD_DROP}
          onClick={() => {
            dispatch(
              team === null
                ? {
                    type: 'mission/vehicleLeftHome',
                    vehicle: vehicle.id,
                    at: new Date().toISOString(),
                  }
                : {
                    type: 'mission/vehicleTaken',
                    team,
                    vehicle: vehicle.id,
                    at: new Date().toISOString(),
                  },
            );
            done();
          }}
        >
          {team === null
            ? `Leave ${vehicle.label} home`
            : `Take ${vehicle.label} for team ${String(team)}`}
        </button>
      </DropZone>
    );
  };

  const hasVehicles = campaign.vehicles.length > 0;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className={HINT}>
        Press an item or a vehicle, then where it goes: to somebody going out, back to the{' '}
        <OpenPanel panel="inventory">base’s Inventory</OpenPanel>, or set down if it was shoddy and
        free. Anybody staying home keeps what they hold <PageRef pages={18} />
      </p>

      {teams.length === 0 ? (
        <p className={HINT}>Nobody is going out this turn, so nobody is equipped.</p>
      ) : (
        <>
          {current !== null && (
            <p role="status" className="text-sm font-medium">
              Choose where {current.kind === 'vehicle' ? '' : 'the '}
              {pickedName(current)} goes, or press it again to cancel.
            </p>
          )}

          <BoardColumns
            sourceTitle="To hand"
            targetTitle="Going out"
            sources={
              <>
                <LaneFrame name="The base’s Inventory" pages={18}>
                  <CardRow empty="Empty.">{campaign.inventory.map(itemCard)}</CardRow>
                  {itemTarget('base', 'base', 'Move')}
                </LaneFrame>

                <LaneFrame name="Shoddy, free" pages="18, 37">
                  <CardRow empty="No skill of anybody going out uses free shoddy gear.">
                    {free.map((item) => {
                      const next: Picked = { kind: 'shoddy', item };
                      const rules: ItemRules = EQUIPMENT[item];
                      const skills = rules.uses ?? (rules.needs === undefined ? [] : [rules.needs]);
                      const freeWith = skills.filter((skill) =>
                        going.some((survivor) => skill in survivor.skills),
                      );
                      return (
                        <BoardCard
                          key={item}
                          title={`Shoddy ${ITEM_LABELS[item].toLowerCase()}`}
                          lines={[
                            ...slotLine(rules),
                            freeWith.map((skill) => SKILL_LABELS[skill]).join(', '),
                          ]}
                          picked={isPicked(next)}
                          onPress={() => {
                            pick(next);
                          }}
                        />
                      );
                    })}
                  </CardRow>
                  {itemTarget('free', 'free', 'Set')}
                </LaneFrame>

                {hasVehicles && (
                  <LaneFrame name="Vehicles at the base" pages={52}>
                    <CardRow empty="Every vehicle is going out.">
                      {campaign.vehicles
                        .filter((vehicle) => teamOf(vehicle) === undefined)
                        .map(vehicleCard)}
                    </CardRow>
                    {vehicleTarget(null)}
                  </LaneFrame>
                )}
              </>
            }
            targets={teams.map((team) => (
              <fieldset key={team.team} className="flex flex-col gap-3">
                <legend className="px-1 pb-2 text-sm font-semibold">
                  Mission team {team.team}
                </legend>
                {team.members.map((survivor) => (
                  <LaneFrame
                    key={survivor.id}
                    name={survivor.name}
                    detail={<Slots campaign={campaign} survivor={survivor} />}
                  >
                    <CardRow empty="Carrying nothing">{survivor.items.map(itemCard)}</CardRow>
                    {itemTarget(survivor.id, { survivor }, 'Move')}
                  </LaneFrame>
                ))}
                {hasVehicles && (
                  <LaneFrame name={`Mission team ${String(team.team)}’s vehicles`}>
                    <CardRow empty="Going on foot">
                      {campaign.vehicles
                        .filter((vehicle) => teamOf(vehicle) === team.team)
                        .map(vehicleCard)}
                    </CardRow>
                    {vehicleTarget(team.team)}
                  </LaneFrame>
                )}
              </fieldset>
            ))}
          />
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
    <p
      className={
        used > slots
          ? 'text-xs font-medium text-amber-800 dark:text-amber-300'
          : 'text-xs text-stone-600 dark:text-stone-400'
      }
    >
      Inventory Slots{' '}
      <span className="tabular-nums">
        {used} / {slots}
      </span>
      {used > slots && ' — more than they can carry'} <PageRef pages={14} />
    </p>
  );
}
