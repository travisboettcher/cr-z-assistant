# Phase 5 — Equipment: deliverable stories

Breakdown of Phase 5 from the campaign tracker plan, scoped from
[#177](https://github.com/travisboettcher/cr-z-assistant/issues/177) against the batch-16 rulings
extract (2026-10-13). Phase 5 gives the community **things**: the items in the book's equipment
chapter (pp. 37–53), the base's Inventory that holds them, and what each survivor carries in their
Inventory Slots.

It comes in three parts, each a set of stories that leaves the repo working:

- **Part 1 — Carrying** (Z5-1 to Z5-5): the catalogue, the base Inventory, a survivor's carried
  items, the Equip Mission Team step and the Skill Score's item term. This is #177's smallest
  change, and closes it.
- **Part 2 — Making and finding** (Z5-6 to Z5-8): building equipment in the Planning Phase, the
  Rare Item Table, and the equipment a base starts with or yields.
- **Part 3 — Trading and vehicles** (Z5-9 to Z5-13): trades, the Rare Items trade and the Rare Goods
  Trader, vehicles, and where items go when a survivor or a base is lost.

Parts 2 and 3 are outlined here so part 1's shapes are chosen knowing what will read them. Each is
scoped in full before it is built.

## Why this document exists

Every phase so far has left a hole the shape of an item:

- **Equip Mission Team (pg. 18) records nothing.** It is a step in the walk with no work in it.
- **A Skill Score is two terms of three.** The book's worked example adds an item term (pp. 8, 14);
  `skillScore` leaves it out and says so.
- **Four rules wait on items**: a material roll of 10 is recorded as Rare instead of a roll on the
  Rare Item Table (pp. 19, 43); the Regional Firehouse's Turnout Gear and the Outdoor Sports Shop's
  stock have nowhere to go (pp. 62, 66); the Workshop, Metal Shop and Gunsmith gate items that do not
  exist; and Rare Goods Trader's outcome (R22) and the vehicles two missions add have no Inventory
  to land in.

The failure mode this phase is most exposed to is **modelling the tactical game**. The book's items
mostly change what happens on the table during a mission — range, Noise, a jam, a shield's arc —
and the tracker does not play missions. The catalogue records what the **campaign** reads: what an
item is, what it costs, where it can be built, how many slots it takes, and what it adds to a Score
or a slot count. Combat numbers stay in the book, cited by page.

## Architecture rules these stories must not break

1. **Rules as data** — the catalogue is `src/data/equipment.ts`, with pages, costs and slot counts,
   and no prose. Display names are `equipmentLabels.ts`'s.
2. **Pure engine** — what a survivor can carry, what a Score comes to and what Equip Mission Team
   may move are pure functions in `src/engine`, composed as forms (`missionForms.ts`).
3. **Derived is never stored** — a Score, a slot count and "is this survivor over their slots" are
   read back. What is stored is which items exist and who holds them.
4. **The log only grows** — every item that arrives, moves or is used up is an entry, so the history
   says where each item came from.
5. **The main screen summarises; a modal edits** ([`ux-principles.md`](ux-principles.md)). The base
   Inventory is a fourth card beside the turn, with its own modal; a survivor's items are on their
   sheet in the roster's modal; Equip Mission Team is a step in the walk that opens both with
   `OpenPanel`.

## Scope boundary

Phase 5 is done when every item a campaign can hold is in the catalogue, and the tracker knows
where each one is — in the base Inventory, on a survivor, set aside with one, or gone — and adds
what it adds to the numbers it already computes.

Phase 5 explicitly does **not** include:

- **Anything that happens during a mission** beyond what its outcome records: range, Noise,
  attacks, a jam's action to clear (R37 below), a shield's facing.
- **The optional Apocalypse Toolkit** (pp. 169–176): weapon parts, ammunition, attachments' costs,
  and the Gunsmith producing Ammunition. A later module if ever.
- **The optional Road Trip chapter** (pp. 155–167), whose storage is its vehicles' slots.
- **Spells and the Veil** (pp. 44, 48, 128), which are the Magic origin's and Phase 7's. Magic and
  Cosmic items are in the catalogue, tagged by origin; what their effects do is Phase 7's.
- **Inoculation's** campaign-level effect (pp. 48, 142), which is Phase 7's Rot Resistant trait.

## What the book settles

From the batch-16 extract; printed page numbers.

- **Grades** are shoddy, standard and quality only: −1, 0 and +1 to the Score of the skill that uses
  the item (pp. 8, 14, 37). Some items exist in one or two grades.
- **Shoddy gear is free and unlimited** for any skill that uses an item — weapon skills, Tinker's
  tool belt, Traps' traps (pp. 9–11, 37). A starting community and every new survivor has shoddy
  gear only (pp. 13–14).
- **Slots**: one per weapon, whatever its hands (pg. 38); most equipment one, the breaching tool two
  (pg. 44); protective gear, the tool belt, traps and the resistance charm none (pp. 44–46);
  attachments none (pg. 50). A carried survivor takes two (pg. 31).
- **Survivors keep what they carry** between missions and turns (derived, pp. 23, 93, 124).
- **Equip Mission Team** moves items from the base Inventory to a mission team's survivors, each
  into an Inventory Slot; shoddy gear needs nothing from the base (pg. 18).
- **Carrying past one's slots** is simply not possible (derived, pp. 31–32).
- **The base Inventory has no cap on items**; Check Storage counts materials only (pp. 23, 54).
- **Building equipment** is a project-team activity at Planning Step 2 (pg. 20), paid in Labor
  and Hardware, finished the moment it is paid, any number per turn (pp. 20–21). An item needs its
  facility or upgrade to exist; staffing is not required (derived). **Trading** pays Food and Fuel in
  any mix instead, takes no Labor, and arrives at the next Advancement Step 5 (pp. 19, 21).
- **The Rare Item Table** is two d10s: a category, then a subtable (pg. 43). A material roll of 10
  is a roll on it **instead of** that material (derived, pg. 19).
- **Moving base** takes every vehicle, weapon and piece of equipment along (FAQ).

## Rulings the book leaves open

Part 1's seven, confirmed 2026-10-13 and recorded in [the registry](rulings.md):

- [R34](rulings.md#r34--quality-gear-is-built-from-the-tables) — quality weapons and gear
  are built at the costs the tables print (pp. 41–42), despite pg. 37's sentence that quality
  weapons are only traded.
- [R35](rulings.md#r35--a-carried-shoddy-item-takes-its-slot) — a shoddy item a survivor
  carries takes its slot like any other; it is chosen at Equip Mission Team, costs nothing, and
  never enters or leaves the base Inventory.
- [R36](rulings.md#r36--a-backpack-takes-no-slot) — a backpack takes no slot.
- [R37](rulings.md#r37--nothing-on-an-item-lasts-past-its-mission) — a jam, and every
  other per-mission state, ends with the mission; the tracker keeps no item state, only whether an
  item still exists.
- [R38](rulings.md#r38--who-moves-what-at-equip-mission-team) — at Equip Mission Team,
  items move between the base Inventory and the mission team's survivors, and between those
  survivors, within their slots; anybody not on a team keeps what they hold.
- [R39](rulings.md#r39--one-1-from-a-quality-only-item) — an item that exists only as
  quality adds one +1, not its grade's and its own.
- [R40](rulings.md#r40--bonuses-stack-protective-gear-one-of-each) — item bonuses to one
  Score stack; a survivor wears at most one of each kind of protective gear.

Parts 2 and 3 will need, at least: Blacksmithing Tools' rounding; which facility must hold a
Utility an item row requires; the Outdoor Sports Shop's four weapons; a rare upgrade's installation;
the two Rare Item prices that disagree with the equipment table (Heavy +1, Tool belt +1); R9's
forcing case; and where a survivor's items go when they die, depart, turn or are exiled. Those are
raised when those parts are scoped.

## Decisions recorded, rather than left to the implementation

**An item is an instance with an id.** Two standard pistols are two things: one may be in the base
Inventory and the other on a survivor, and the history follows each. An instance is
`{ id, item, grade }` — no state, because none lasts past a mission (R37). Shoddy items are not
instances anywhere but on a survivor (R35): the base never holds one.

**Where an item is, is stored on its holder.** `Campaign.inventory` is the base's; each `Survivor`
gains `items`. A survivor set aside keeps theirs (R31), which is what pg. 86 and pg. 124 ask. Schema
v16 adds both, empty.

**A Skill Score's item term is the best the survivor carries for that skill.** The book's term is
the item *used*; the sheet cannot know which that will be, so it shows the Score with the best
carried item and names it. Where a survivor carries nothing for a skill that needs an item, the
shoddy item's −1 applies (pp. 9–10, 14) — every survivor has one. Fixed bonuses (binoculars +1
Scout, and the like) add on top (R40).

**Origin items exist only in their origin's campaigns** (pg. 37), as origin facilities already do.

## Part 1 — Carrying

### Z5-1 — The equipment catalogue as rules data

**Why:** Every later story reads it. **Needs the rulebook open at pp. 37–53.**

**Scope**
- `src/data/equipment.ts`: every core item — the nine weapons and their origin variants, the
  equipment, protective and disposable items, the rare weapons and rare equipment, the rare
  upgrades and vehicle upgrades as items — each with its kind, the skill it uses or requires, the
  grades it exists in, its slots, its build cost per grade and Labor, what it requires (a facility,
  an upgrade, a Utility), its trade price per grade, its origin, and the Scores or slots it adds.
  Vehicles by Tier (pg. 53).
- The rules test pins the tables the extract gave, and every citation lands in pp. 37–53.

**Acceptance**
- The nine core weapons and every table row on pp. 41–43 are present, asserted by name.
- Nothing about a mission's own play is recorded but its page.

**What this story turned out to include.**

- **Seventy-two items, one shape.** Each records its kind, grades, slots, the skill it is used with
  (`uses`) or must have to be equipped (`needs`), its build cost per grade with one Labor (R34), its
  trade price per grade, its origin, what it adds between missions per grade, and how long it lasts
  (`kept`, `used-up`, `one-mission`; R37). A weapon's grade is read from `GRADE_MODIFIER`; anything
  else carries its grade's effect in `adds`, because its grades differ in more than ±1 (pg. 45).
- **Build requirements name facilities, Workshop upgrades and Utilities separately**, since the
  Metal Shop and Gunsmith are Workshop upgrades (pp. 71–72) and several rows need a Utility too.
- **Fifteen items have no slot count.** Five because the book gives none: the three origin
  ammunitions, warding stones and the quick quiver. The other ten are the rare and vehicle upgrades,
  which are installed rather than carried. All are `null` until the story that first carries them
  has to decide.
- **Rare items are standard grade.** They have one price and no grade on the table (pg. 43); the
  two the book describes as "a standard" weapon (pg. 50) set the reading for the rest.
- **The Rare Item Table and vehicle Tiers are here too**, as the data parts 2 and 3 read. The
  Quality Item subtable keeps its own prices, which differ from the equipment table's for the heavy
  weapon and the tool belt; which price a trade uses is part 3's to rule on.
- **Nothing here is read yet**: Z5-2 adds the Inventory and the carried items that refer to it.

### Z5-2 — The base Inventory, and what a survivor carries

**Why:** Somewhere for items to be.

**Scope**
- Schema v16: `Campaign.inventory` and `Survivor.items`, both lists of item instances, empty for
  every save before it.
- `src/engine/equipment.ts`: a survivor's slots in use, what they may still carry, and the
  Inventory Slot count gaining the backpack's, the ultralight backpack's and tactical armor's
  additions (pp. 44, 51; R36).
- The Inventory card beside the turn: how many items, by kind, and a modal listing them. Items can
  be added there by hand, with a reason, for a table bringing a campaign in part-way through — the
  same posture as the materials editor.
- A survivor's sheet lists what they carry and their slots in use.

**Acceptance**
- A save round-trips its items, the base's and each survivor's.
- A survivor set aside keeps their items, and brings them back.

**What this story turned out to include.**

- **Schema v16** gives the campaign `inventory` and every survivor `items`, both lists of
  `{ id, item, grade }`, and the v15 → v16 step fills both in empty, the set-aside list included.
  The save reader checks each item against the catalogue and its grades, refuses a shoddy item in
  the base (R35), and refuses one id held in two places. The v16 fixture carries items on a survivor
  and in the base, so the byte-for-byte round trip covers their key order.
- **Slots in use** count one per weapon, two for the breaching tool and nothing for worn gear,
  traps and attachments, with a tactical holster carrying one pistol or revolver free (pg. 51).
  `inventorySlots` adds what carried items give outright (the ultralight backpack's two, tactical
  armor's one); a backpack's +1 Carry reaches the slots through the Score, which is Z5-3's.
- **An item with no slot count** in the catalogue counts as none for now. Nothing can put one on a
  survivor yet, and Z5-4's guard will keep it that way until each is settled.
- **Adding by hand writes `item-added`, taking out writes `item-removed`**, so even a correction
  says where an item came from; the base's Inventory offers only this campaign's origin items, and
  never shoddy.
- **The Inventory card is quiet when empty**, not a call to act: a community needs no items to play
  a turn. The summary is now four cards — four across on a portrait tablet, two by two on a phone —
  and `docs/ux-principles.md` says so.
- **The survivor sheet and roster** show slots as "in use / total", and the sheet lists what the
  survivor carries.

### Z5-3 — The Skill Score's item term

**Why:** The third term of the book's Score (pp. 8, 14).

**Scope**
- `skillScore` adds the item term: the best grade among carried items that use the skill, or the
  shoddy −1 where the skill needs an item and none is carried; plus fixed bonuses from carried
  equipment (R39, R40). The tool belt's cap on Stealth (pg. 44).
- Every reader of `skillScore` is checked — the sheet, Labor, production, the Teaching pool, the
  Carry-based slot count — since a bonus to Carry changes slots and a weapon changes nothing outside
  a mission.

**Acceptance**
- Earl's worked example on pg. 14 comes out as printed, item term included.
- A quality weapon raises its skill's Score by one; a second carried weapon of the same skill does
  not add again.

**What this story turned out to include.**

- **The shoddy −1 is in every weapon and Tinker Score** for a survivor who carries nothing better,
  because the book's own worked Score has it (Earl's Heavy Weapon is 2, pg. 14). The skills are
  read off the catalogue: those an item that comes in shoddy is used with. Traps gives free traps
  but none is used with a Score, so Traps has no −1.
- **That reaches the Watchtower**, the one base reader of a weapon skill: an unarmed lookout takes
  one less off Siege Threat than before, and one with a quality rifle one more. R41, since settled
  by the text (pp. 8, 71); the code has no special case either way, since the Score is the Score.
- **Bonuses count one of each item**, the best grade of it: R40's "different items stack" read as
  different catalogue entries, so two pairs of binoculars add one, as two sets of reinforced
  clothing do.
- **The tool belt caps Stealth when one is carried** — the book's word is *equipping* (pg. 44) —
  so a Tinker's free shoddy belt caps it once it is recorded on them, not before.
- **Move and Defense show what is worn** on the sheet, with the Score bought beside them when the
  two differ, since experience is priced on the bought Score (pg. 9).
- **The sheet's Skills table gains the book's Item column** (pg. 8), naming what the term comes
  from: the item, "shoddy, held free", or the items whose bonuses it adds.
- **Other readers** — production's staffed Scores, Teaching, Utilities, Medicine for Rot, the
  Scavenge pool, Carry for slots — take the item term with the Score and need no change; a
  backpack's +1 now reaches Inventory Slots through Carry, and only for a survivor with Carry.

### Z5-4 — Equip Mission Team

**Why:** The step #177 is named for.

**Scope**
- Per mission team, after Select Mission: move items from the base Inventory to its survivors,
  back again, and between them, within their slots (R38); choose shoddy items freely (R35).
  An `items-moved` entry per move, naming the item, from and to.
- Refused past a survivor's slots, for an item a survivor lacks the skill to equip (pg. 44), and
  outside the step's phase. Warnings, not refusals, for anything the book leaves to the table.
- The step's screen lists each team with its slots, and opens the Inventory and the roster with
  `OpenPanel`.

**Acceptance**
- An item moved to a survivor leaves the base Inventory, and comes back when moved back.
- A survivor not on a team cannot be equipped, and keeps what they hold.

**What this story turned out to include.**

- **Who is equipped is `deployed`**: the survivors whose team is going out. A team that chose no
  mission while another did stays home, and an opt-out equips nobody. A siege turn equips the whole
  community, which is the team the Siege Defense takes (pg. 85).
- **One entry for every move**, `item-moved`, naming the item and both ends: the base's Inventory,
  a survivor by id and name, or the free supply of shoddy gear (R35). Shoddy gear taken up comes
  from that supply and goes back to it when set down; it never reaches the base.
- **Refused**: outside the Mission Phase; an item nobody going out holds; past a survivor's slots,
  counting the slots the item itself brings (an ultralight backpack) and the hunger penalty's effect
  on Carry; equipment whose skill the survivor lacks (pg. 44); a second of one piece of protective
  gear (R40); shoddy gear for a skill the survivor does not have; and an item the catalogue gives no
  slot count yet (ammunition, the rare upgrades, the quick quiver), until parts 2 and 3 settle each.
- **Warned, not refused**: a weapon or tool carried by somebody without the skill it is used with.
  The book needs the skill to use one (pg. 8), not to carry it, so a table handing a spare rifle to
  a porter can.
- **A survivor already over their slots** — the hunger penalty lowered Carry after they were
  equipped — is shown in amber on the step, not stripped of anything: what they put down is the
  table's choice.
- **The step's screen** is a block per team, a row per survivor: slots in use, each carried item
  with where it can go, and one picker for what they can take, from the base or shoddy and free.
  The Inventory and the roster open from it with `OpenPanel`. The "not built yet" note stays only
  on Play the Mission, which is played on the table.

### Z5-5 — What a mission used up

**Why:** Disposables, one-mission items and lost gear are the only item changes a mission makes
(R37).

**Scope**
- The Tactical Mission outcome form lists the team's carried items and records which were used up
  or lost; recording removes them. Disposables are offered as used by default when the table says
  they were thrown (pp. 46–48); one-mission items (pp. 40, 45, 47) are removed whatever happens.
- Items a survivor held when they left the roster go where Part 3's ruling says; until then, to
  the base Inventory, so nothing is lost silently.

**Acceptance**
- A grenade thrown is gone after the mission; a riot shield is not (pg. 51).

**What this story turned out to include.**

- **A record of its own beside the outcome**, not a field on every outcome event: each of the
  nine outcome kinds would have needed it, and a team carrying nothing needs no record at all.
  `items-spent` names the team and each item with who had it; recording takes them off their
  survivors. It is refused outside the Mission Phase, for a team carrying nothing, for an item the
  team does not carry, and when nothing at all is ticked.
- **One-mission gear goes in every record**, ticked or not. In the core catalogue that is the
  improvised shield; the incendiary shells and flaming arrows are one-mission too, but cannot be
  carried until a later part settles their slots. Until a team carrying such gear records, the
  turn owes it at Play the Mission, so the shield does not go out again next turn.
- **"Offered as used" means disposables only.** Improvised armor is used up too, but only when worn
  through (pg. 45), so it starts clear like the riot shield; ticking anything else says it was lost.
- **A survivor leaving the roster** — turned, bitten to death, departed or taken off by hand —
  leaves what they carried in the base's Inventory, an `item-moved` entry each after the entry
  that took them off, and shoddy gear back to the free supply. Part 3 rules whether that is where
  it belongs. A survivor set aside keeps theirs (R31).

Part 1 is complete, and with it #177.

## Part 2 — Making and finding

Scoped 2026-10-14 from the batch-16 extract, which already answers or proposes an answer to most of
what part 2 needs. Part 1 left items that exist only because a table added them by hand; part 2
makes them the way the book does — built by the project team, found on a material roll of 10, and
handed over by the bases that come with them.

### Rulings part 2 needs

Confirmed 2026-10-14 ([the registry](rulings.md)):

- **R43** — Blacksmithing Tools' halved Labor rounds up; it covers quality as well as standard, and
  the enchanted melee weapon, but not ammunition (pg. 63).
- **R44** — An equipment row's Power or Water must be supplied this turn to at least one facility
  the row names (pp. 41–42, 67).
- **R45** — The Outdoor Sports Shop's four weapons are the player's choice of any four standard core
  weapons, added when its Inventory slot is cleared (pg. 62).
- **R46** — Turnout Gear's six reinforced clothing arrive each time a community moves into a
  Regional Firehouse (pg. 66).
- **R47** — Installing a rare upgrade costs nothing and happens at Add Facilities and Upgrades, into
  a standing facility of its kind; it stays with that facility (pg. 49).
- **R48** — An item already built stays built when the turn's Labor falls short: the shortfall
  falls on the facility queue alone (pp. 20, 23).
- **R9**, decided — Utilities forces Food, Fuel or Hardware, never a 10, now that a 10 is an item.
  The Errata settled it the same day as Fuel only (#218).
- **R49** — Each Rare in storage becomes a Rare Item Table roll owed at the next Add Materials step,
  and Rare stops being a material (schema v17).

### Z5-6 — Building equipment

**Why:** The project team builds equipment, and it is ready the moment it is paid for (pp. 20–21).

**Scope**
- An equipment order at Assign Project Team (Planning Step 2): an item and a grade it is built in
  (never shoddy), paid in Hardware from the stores and Labor from this turn's project team, and in
  the base's Inventory at once. Any number a turn (pg. 21). An `item-built` entry names the item,
  its id and what it cost.
- Refused, from the item's row (pp. 41–42): a facility or Workshop upgrade it names that is not
  standing (one on order does not count); a Utility not supplied (R44); another origin's item; the
  Hardware or Labor not there. The enchanted melee weapon costs what its standard weapon does
  (pg. 40). Outside the Planning Phase, refused like any order (R14).
- Blacksmithing Tools at the Renaissance Festival halves the Labor of bladed, blunt, heavy and
  archery weapons (pg. 63; R43).
- **One Labor budget.** `laborCommitted` counts this turn's equipment as well as its queue, so every
  reader of it — the order checks, `laborShortfall`, `outstanding`, the Departures choice — sees
  the same number. A shortfall never unbuilds an item (R48).
- The order is placed from the Inventory's modal and from the step, opened with `OpenPanel`, not
  from a new section of the main screen.

**Acceptance**
- A community with a Workshop and no Metal Shop is refused a standard bladed weapon, and builds a
  standard blunt weapon for 1 Hardware and 1 Labor; it is in the Inventory and can be equipped the
  same turn (pp. 20, 41).
- At the Renaissance Festival a crossbow costs 2 Labor, and a pistol its full 2.

**What this story turned out to include.**

- **`src/engine/making.ts`** prices and checks an order: the row's Hardware for the grade, its
  Labor halved and rounded up by Blacksmithing Tools for a *weapon* used with bladed, blunt, heavy
  or archery (R43) — so not the throwing axe, a disposable — and the enchanted melee weapon priced
  as the blunt, bladed or heavy weapon it is built on, which the order names (pg. 40).
- **Standing means built.** Facilities and Workshop upgrades are read from the base's occupants,
  where an order in the queue is not yet; a Workshop upgrade's Utility is read from its Workshop,
  and a row naming two facilities needs the Utility at either (R44).
- **`item-built`** records the item, its id, and the Hardware and Labor it cost. Its Labor is read
  back by `laborCommitted`, which every Labor reader already asks, so the slot cards' orders, the
  Departures choice and the End-turn warning all see one budget. `laborShortfall` never asks for
  more than this turn's queue can give back (R48).
- **The Build form is in the Inventory's modal**, with the cost and the Labor left before the
  button, and refusals said in the engine's words. Assign Project Team links to it and to the base.
  "Add an item by hand" is demoted to a secondary button, so the Inventory has one amber action.

### Z5-7 — The Rare Item Table

**Why:** A material roll of 10 is a roll on the Rare Item Table, instead of that material (pp. 19,
43).

**Scope**
- At Add Materials to Storage, each 10 asks for the two d10s the table throws — the subtable, then
  the entry — and the item goes into the base's Inventory with the haul. An `item-found` entry names
  the item and both rolls. No skill forces a 10 (R9).
- The Rare already in storage becomes rolls owed at the next Add Materials step, and Rare stops
  being a material: schema v17 (R49).
- A Rare Item Table result can be added from the Inventory's modal with its two rolls and a reason,
  for the story and origin rewards that roll on the table or a subtable (pp. 94–118), which are
  Phase 7's missions and would otherwise have nowhere to put their item.
- Rare upgrades wait in the Inventory to be installed (Z5-8); vehicle upgrades wait for part 3's
  vehicles.

**Acceptance**
- A haul with a 10 adds no material and one item: rolls of 3 then 1 are a riot shield (pg. 43).

**What this story turned out to include.**

- **Schema v17 takes Rare out of the materials.** `MATERIALS` is Food, Fuel and Hardware; the
  v16 → v17 step turns a save's Rare into `rareRollsOwed` (R49). Old log entries keep the Rare
  they counted, typed as optional history, and the log still names it; a base move's stores keep it
  too, so an old file round-trips as it was written.
- **A 10 is `rare-item` in the roll table**, never a material, and no skill forces one (R9).
  `recovered` counts materials only; `rareItemRolls` counts the rest, and the two together are the
  number of rolls.
- **The haul asks for the dice.** Add Materials to Storage lists a Rare Item Table roll for each
  10 and each roll owed, with two d10 pickers that name the item before it is added. The haul is
  refused without every pair, so its button waits for them — the one place this step holds back,
  because the dice are in the table's hand. Each item is an `item-found` entry naming both dice,
  after the materials.
- **A scavenger with the Scavenge skill brings back three, not four**: one of each material, of
  which there are now three (pg. 17).
- **A roll by hand** from the Inventory's modal writes the same `item-found` entry, for the story and
  origin rewards that roll on the table; it settles nothing a haul owes.

### Z5-8 — What a base hands over, and rare upgrades installed

**Why:** Two bases come with equipment, and a rare upgrade belongs in a facility (pp. 49, 62, 66).

**Scope**
- Turnout Gear: six standard reinforced clothing into the Inventory when the community moves into a
  Regional Firehouse (R46), written on the move's own entries.
- The Outdoor Sports Shop's Inventory slot, when its clearing project finishes, asks for four
  standard core weapons (R45).
- Installing a rare upgrade (R47) at Add Facilities and Upgrades: it leaves the Inventory and stands
  on the facility as the upgrade it counts as (pg. 49), outside the facility's upgrade cap. The two
  that count as no upgrade — fertilizer and the video game console — enter the facility catalogue
  as rare upgrades of their own, so production, Unrest and Siege Threat read them like any other.

**Acceptance**
- Moving into the Regional Firehouse puts six standard reinforced clothing in the Inventory.
- A gas grill installed in a Kitchen is that Kitchen's Gas Range, and the Kitchen can still take
  three upgrades.

**What this story turned out to include.**

- **`src/engine/handover.ts`** makes the items a base hands over, with ids derived from the
  campaign and the log's length, so a claim, a move or a finished project needs nothing about items
  on its action. An `equipment-handed-over` entry names the base, the slot where there is one, and
  the items. Turnout Gear follows a first claim's stocking and a move's `base-moved`, on top of what
  the Inventory already held (R46).
- **The Sports Shop's clearing waits for its weapons.** `weaponsOwed` asks for them while the
  clearing is due; `completeProjects` finishes everything else and leaves that one due until four
  core weapons are chosen, repeats allowed (R45). Add Facilities and Upgrades shows four pickers,
  and its Finish button waits for them — the dice-shaped exception Z5-7 made, for a choice.
- **`src/engine/install.ts`** checks and installs: at Add Facilities and Upgrades, from the
  Inventory, into a standing facility of the kind the item names (R47). The item moves onto the
  slot's new `installed` list, still the same item, so `allItems` and the id checks keep seeing it.
  Schema v17 is unreleased, so the list joins it rather than a v18.
- **`occupants` reads an installed item as its upgrade**, marked rare and outside the cap of three;
  one in a facility of another kind, which only a hand-edited save could hold, stands as nothing.
  The battery spotlight drops the Power its Spotlight requires (pg. 49).
- **Fertilizer and the video game console are catalogue upgrades marked `rare`**, so production and
  Siege Threat read them like any other, and the upgrade orders never offer them. A facility's
  upgrades can now carry `unrest`: `unrest` adds what working facilities give, after Hunger and
  Exhaustion and never below zero, and Calculate Unrest shows the term when it is not zero.
- **Installing is in the Inventory's modal**, one button per rare upgrade with a facility picker
  when there is more than one; Add Facilities and Upgrades links to it while the Inventory holds
  one. The button names the facility when there is only one.
- **The Sports Shop's slot is the Shop Inventory on screen.** The book's name for it is the word
  the base's Inventory and a survivor's Inventory Slots already have, and "Clearing the Inventory"
  read as emptying the base's. The log counts what was handed over after each name ("standard bow
  ×2"), so no item name has to be made plural.

## Part 3 — Trading and vehicles

Scoped 2026-10-14 from the batch-17 extract. Parts 1 and 2 gave the community items it carries,
builds and finds; part 3 lets it buy and sell them, gives it vehicles, and says where both go when a
survivor or a base is lost. The outline had four stories; vehicles are two here, what the community
holds and what a mission does with them, so each story leaves the repo working.

**One schema step for the part, v18**: the orders waiting to arrive, a Rare Items trade under way,
and the vehicles. Like v17 in part 2, it is unreleased until the part's PR merges, so each story
adds to it rather than bumping again.

### Rulings part 3 needs

Confirmed 2026-10-14 ([the registry](rulings.md)), R70 and R78 decided the same day:

- **Trading**: R51 (the Planning trade buys ordinary equipment in its priced grades, never a rare
  item), R52 (it needs nobody, no Labor and no facility), R53 (an order arrives at the next
  Advancement Step 5 wherever the community is, with no cancelling), R54 (only rare items are sold,
  at their price less two, in Food and Fuel), R55 (the channel decides the price), R56 (a sale can
  overfill storage until Check Storage).
- **The Rare Items trade**: R57 (one trade, made in Planning and resolved by the Rare Goods Trader),
  R58 (the list is full Rare Item Table rolls), R59 (the materials are set aside until the mission
  ends), R60 (it binds the next turn's first mission, and a siege cancels it), R61 (R22 confirmed).
- **Vehicles**: R62 (Tier, label, land or water, Tier 4's split, upgrade; no Health), R63 (Retrieve
  New Vehicles' Tiers are rolled, then may be lowered), R64 (a won claim keeps its vehicles),
  R65 (Fuel at Equip Mission Team), R66 (Auto Shops protect vehicles the owner picks), R67 (a vehicle
  upgrade is fitted at Planning for nothing), R68 (no cap), R69 (empty between missions), R70 (a
  vehicle not driven off is lost).
- **When items change hands**: R71 (a mission death leaves items on the map unless taken), R72,
  R74 and R75 (bitten, turned and removed survivors leave theirs to the base, as Z5-5 does), R73 (a
  departing survivor takes theirs), R76 (a survivor set aside keeps theirs), R77 (a move takes
  everything; a Hero sent away takes their own), R78 (an overrun loses the base's Inventory), R79
  (starting over keeps only what survivors carry).
- **From part 1**: R41, which the text settles (R80 agrees), and R40's two identical items give one bonus (R81). The code
  already does both.

### Z5-9 — Trading

**Why:** The Planning Phase buys equipment for Food and Fuel, and sells rare items (pp. 19, 21, 37).

**Scope**
- At Planning Step 2, from the Inventory's modal beside the Build form: an item, a grade with a
  printed trade price (R51, R55), and how much of its price is Food and how much Fuel. Refused for a
  rare item, a quality weapon, an unpriced grade, or storage that cannot pay. Nobody is assigned and
  no Labor is spent (R52).
- The materials leave at once; the order waits on the campaign and arrives at the next Add
  Facilities and Upgrades, in whatever base the community holds then (R53). No cancelling. Starting
  over loses waiting orders.
- Selling a rare item from the Inventory in the Planning Phase: its price less two, paid at once in
  the player's mix of Food and Fuel (R54), over the cap if need be, with Check Storage's warning
  (R56).

**Acceptance**
- An item ordered on turn 3 costs its Food and Fuel on turn 3 and is in the Inventory at turn 4's Add
  Facilities and Upgrades, not before.
- A rare item priced 6 sells for 4.

### Z5-10 — The Rare Items trade and the Rare Goods Trader

**Why:** Rare items are bought from a trader the community sends a team to meet (pp. 21, 37, 43,
83–84).

**Scope**
- At Planning, a trade is made: the app shows how many Rare Item Table rolls the list has (every
  survivor's Scout Score plus Cooperation, R58), and the player enters the two dice of each roll they
  want to buy from. Each names its item and its subtable price (R55).
- The chosen items' prices are set aside in the player's mix of Food and Fuel, outside storage and
  outside Check Storage (R59). A `rare-trade-made` entry names the items, their dice and what was
  set aside.
- The next Mission Phase's first mission must be the Rare Goods Trader (R60). Choosing another loses
  the materials, as a siege called at Check the Horde does; both cancel the trade.
- The mission's outcome records which items were traded, in priority order. With a survivor out,
  they arrive at once and the rest of the materials return to storage; with none, the traded items
  and their materials are lost and the rest return (R22, R61).

**Acceptance**
- A trade for two items, one traded before nobody got out, loses that item and its materials and
  returns the other's.

### Z5-11 — Vehicles the community holds

**Why:** A community keeps vehicles, and two missions add them (pp. 49, 52–53, 79, 81–82).

**Scope**
- `Campaign.vehicles`: each with an id, its Tier, a label, land or water, Tier 4's split of its 20
  slots, and its upgrade if it has one (R62). No cap, and Check Storage ignores them (R68). They move
  with the community (R77).
- Retrieve New Vehicles' outcome counts the vehicles driven off; each then asks for its rolled Tier,
  which the player may lower, and a label (R63). A won Claim a New Base adds the vehicles on its
  mission area at their Tiers (R64).
- A vehicle upgrade in the Inventory is fitted to a vehicle with none, in the Planning Phase, for
  nothing (R67). It stays with that vehicle.
- A Vehicles card's modal lists them; the main screen gets no new section.

**Acceptance**
- Retrieve New Vehicles with two driven off, rolled 5 and 10, adds a Tier 2 and a Tier 4, or a lower
  Tier the player chose.

### Z5-12 — Vehicles on a mission

**Why:** A vehicle burns Fuel, breaks down past the base's Auto Shops, and is lost if nobody drives
it home (pp. 18, 32, 52, 71).

**Scope**
- At Equip Mission Team a team takes vehicles, paying each one's Tier in Fuel from storage (R65); a
  vehicle the community cannot fuel is refused, and an electric conversion needs a powered Auto Shop
  and burns none (pg. 49).
- The step says how many go protected by Auto Shops and that the rest arrive broken (R66); nothing is
  stored about which.
- The outcome records the vehicles not driven off, which are lost (R70), with what they held lost
  as `items-spent` records lost gear. A won claim's vehicles are kept (R64).
- Fuel is not refunded for a lost vehicle.

**Acceptance**
- A Tier 3 vehicle taken costs 3 Fuel; not driven off, it is gone from the community's vehicles and
  the log says so.

### Z5-13 — When items change hands

**Why:** Z5-5 left every leaver's items at the base until part 3 ruled where they go (FAQ; pp. 22–23,
31, 54, 85–86).

**Scope**
- A survivor who dies on a mission leaves with a cause of their own beside #201's three, and what
  they carried is lost unless the outcome records it taken (R71).
- A survivor who departs takes what they carry (R73). Bitten, turned and removed survivors leave
  theirs to the base as now (R72, R74, R75).
- A survivor set aside keeps what they carry (R76), and a Hero sent away by a move takes theirs
  (R77).
- An overrun loses the base's Inventory in every way on (R78); a same-type, same-map claim brings
  the vehicles back as repairable ones to drive off (R63, R64), and starting over loses them (R79).

**Acceptance**
- A survivor who departs carrying a rifle takes it; one bitten to death leaves theirs in the
  Inventory.
- After an overrun claimed on another base type, the Inventory is empty and every survivor still
  carries what they did.

## Phase 5 is done when

Every item and vehicle the community holds was built, found, traded, handed over or retrieved the
way the book has it, and goes where the rulings say when a survivor or a base is lost —
round-tripped through a save file, with CI green, the mutation score holding, and no rule prose in
the repo.

## Phase 5, part 1 is done when

The Equip Mission Team step moves real items, every survivor's Score includes what they carry, and
the base Inventory is on the screen — round-tripped through a save file, with CI green, the
mutation score holding, and no rule prose in the repo.
