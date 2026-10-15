/**
 * Vehicles on a mission (pp. 18, 32, 49, 52, 71; R64–R66, R70; Z5-12).
 *
 * Three parts, each where the walk reaches it: at Equip Mission Team a team
 * takes vehicles (`TeamVehicles`) and the step says how many go protected
 * (`AutoShopNote`); once the mission is played, each team with vehicles says
 * which it drove off (`MissionVehicles`). What may be taken, and what a record
 * loses, are `missionVehicles.ts`'s answers: this screen renders them.
 */

import { useState } from 'react';
import type { Campaign, Vehicle } from '../engine/campaign';
import {
  autoShops,
  broughtHomeOwed,
  broughtHomeProblem,
  fuelFor,
  leaveProblem,
  takeProblem,
  teamVehicles,
  vehiclesLost,
  vehiclesTaken,
} from '../engine/missionVehicles';
import { vehicleSlots } from '../engine/vehicles';
import { useCampaign } from '../state/useCampaign';
import { ITEM_LABELS } from './equipmentLabels';
import { describeEvent } from './logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

/** What a table needs to know of a vehicle going out: its Tier, slots, upgrade and Fuel. */
function summary(vehicle: Vehicle): string {
  const slots = vehicleSlots(vehicle);
  const fuel = fuelFor(vehicle);
  const upgrade =
    vehicle.upgrade === undefined ? '' : ` · ${ITEM_LABELS[vehicle.upgrade.item].toLowerCase()}`;

  return `Tier ${String(vehicle.tier)}${vehicle.water ? ' boat' : ''} · ${String(slots.inventory)} Inventory, ${String(slots.passengers)} Passenger Slots${upgrade} · ${fuel === 0 ? 'no Fuel' : `${String(fuel)} Fuel`}`;
}

/** The vehicles a team takes at Equip Mission Team, and the picker for another. */
export function TeamVehicles({
  campaign,
  team,
}: {
  readonly campaign: Campaign;
  readonly team: number;
}) {
  const { dispatch } = useCampaign();
  const taken = teamVehicles(campaign, team);
  const elsewhere = new Set(vehiclesTaken(campaign).map((one) => one.vehicle));
  const free = campaign.vehicles.filter((vehicle) => !elsewhere.has(vehicle.id));
  const [chosen, setChosen] = useState('');
  const id = `vehicle-${String(team)}`;

  if (campaign.vehicles.length === 0) return null;

  const pick = free.some((vehicle) => vehicle.id === chosen) ? chosen : free[0]?.id;
  const problem = pick === undefined ? null : takeProblem(campaign, team, pick);

  return (
    <section aria-label={`Mission team ${String(team)}’s vehicles`} className="flex flex-col gap-2">
      <h4 className="font-semibold">
        Vehicles <PageRef pages={52} />
      </h4>

      {taken.length === 0 ? (
        <p className={HINT}>Going on foot</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {taken.map((one) => {
            const vehicle = campaign.vehicles.find((held) => held.id === one.vehicle);

            return (
              <li key={one.vehicle} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="grow">
                  {one.label}{' '}
                  {vehicle !== undefined && <span className={HINT}>· {summary(vehicle)}</span>}
                </span>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={leaveProblem(campaign, one.vehicle) !== null}
                  onClick={() => {
                    dispatch({
                      type: 'mission/vehicleLeftHome',
                      vehicle: one.vehicle,
                      at: new Date().toISOString(),
                    });
                  }}
                >
                  Leave home <span className="sr-only">{one.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pick !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={id}>
              Take for team {team}
            </label>
            <select
              id={id}
              className={SELECT}
              value={pick}
              onChange={(changed) => {
                setChosen(changed.target.value);
              }}
            >
              {free.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.label} · {summary(vehicle)}
                </option>
              ))}
            </select>
          </div>
          {problem !== null && (
            <p className="text-sm text-amber-800 dark:text-amber-300">{problem}</p>
          )}
          <div>
            <button
              type="button"
              className={BUTTON}
              disabled={problem !== null}
              onClick={() => {
                dispatch({
                  type: 'mission/vehicleTaken',
                  team,
                  vehicle: pick,
                  at: new Date().toISOString(),
                });
              }}
            >
              Take <span className="sr-only">a vehicle for team {team}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** How many of the vehicles going out the base's Auto Shops protect (R66). */
export function AutoShopNote({ campaign }: { readonly campaign: Campaign }) {
  const taken = vehiclesTaken(campaign).length;
  if (taken === 0) return null;

  const shops = autoShops(campaign);
  const broken = Math.max(0, taken - shops);

  const says =
    broken === 0
      ? 'The base’s Auto Shops protect every vehicle going out.'
      : shops === 0
        ? taken === 1
          ? 'No Auto Shop protects it, so the vehicle going out arrives broken.'
          : `No Auto Shop protects them, so all ${String(taken)} vehicles going out arrive broken.`
        : `The base’s Auto Shops protect ${String(shops)} of the ${String(taken)} vehicles going out: the owner picks which, and the other ${broken === 1 ? 'one arrives' : `${String(broken)} arrive`} broken.`;

  return (
    <p className={HINT}>
      {says} <PageRef pages="32, 52, 71" />
    </p>
  );
}

/** Once its mission is played, which of a team's vehicles were driven off (R70). */
export function MissionVehicles({ campaign }: { readonly campaign: Campaign }) {
  const recorded = campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'vehicles-brought-home',
  );
  const owed = broughtHomeOwed(campaign);

  if (owed.length === 0 && recorded.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {owed.map((team) => (
        <TeamBroughtHome key={team} campaign={campaign} team={team} />
      ))}
    </div>
  );
}

function TeamBroughtHome({
  campaign,
  team,
}: {
  readonly campaign: Campaign;
  readonly team: number;
}) {
  const { dispatch } = useCampaign();
  const taken = teamVehicles(campaign, team);
  const [drivenOff, setDrivenOff] = useState<ReadonlySet<string>>(() => new Set());
  const chosen = taken.map((one) => one.vehicle).filter((id) => drivenOff.has(id));
  const problem = broughtHomeProblem(campaign, team, chosen);
  const lost = vehiclesLost(campaign, team, chosen);

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">Mission team {team}’s vehicles</legend>
      <p className={HINT}>
        Tick each one driven off the map; the rest are lost, with their upgrades{' '}
        <PageRef pages={32} />
      </p>

      <ul className="flex flex-col gap-1">
        {taken.map((one) => (
          <li key={one.vehicle}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={FOCUS_RING}
                checked={drivenOff.has(one.vehicle)}
                onChange={(changed) => {
                  const next = new Set(drivenOff);
                  if (changed.target.checked) next.add(one.vehicle);
                  else next.delete(one.vehicle);
                  setDrivenOff(next);
                }}
              />
              {one.label} driven off
            </label>
          </li>
        ))}
      </ul>

      {problem !== null && <p className={HINT}>{problem}</p>}
      {problem === null && lost.length > 0 && (
        <p className={HINT}>
          Lost: {lost.map((vehicle) => vehicle.label).join(', ')}. What a lost vehicle held is lost
          too, so tick it with what the team used; its Fuel isn’t refunded.
        </p>
      )}

      <div>
        <button
          type="button"
          className={BUTTON}
          disabled={problem !== null}
          onClick={() => {
            dispatch({
              type: 'mission/vehiclesBroughtHome',
              team,
              drivenOff: chosen,
              at: new Date().toISOString(),
            });
          }}
        >
          Record team {team}’s vehicles
        </button>
      </div>
    </fieldset>
  );
}
