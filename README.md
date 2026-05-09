# YodaRP System — modular stable build

This project was split from the last working stable single-file HTML. Behavior was intentionally preserved; the change is organizational.

## How to run

Open `index.html` in your browser. The scripts are plain browser scripts, so no build step is required.

## File map

- `index.html` — page structure and script order.
- `css/styles.css` — all styling extracted from the original `<style>` block.
- `js/00_data_config_state.js` — embedded DEM/biome image data, constants, DOM references, mutable state, unit/building tables.
- `js/01_terrain_generation.js` — progress helpers, math/noise helpers, DEM/land/biome sampling, terrain generation/rendering.
- `js/02_empire_economy_ui.js` — resize/view setup, empire/diplomacy/economy/supply/building panels, save/load, selection panels.
- `js/03_map_rendering.js` — map symbols, settlement rendering, army rendering.
- `js/04_battle_system.js` — encounter detection, battle joining, battlepower, casualties, retreat/routing, battle panel.
- `js/05_interactions_popups_routes.js` — main draw, click/selection handling, movement routes, context menu, frozen zoom popups, animation loop.
- `js/06_init_events.js` — asset loading, startup/init, mode switching, event listeners.
- `original/yodarp_system_v12_single_file_backup.html` — untouched backup of the uploaded stable file.

## Editing notes

This is a safe split, not a deep ES-module refactor. The JavaScript files are loaded as normal browser scripts and share the same global lexical scope. That keeps the old code working while making it easier to find sections.

For future patches, edit the relevant file and keep `index.html` script order unchanged.


## V13 modular update: Harbors, ships, and wind

This version adds naval systems in `js/07_naval_harbor_wind.js` and small UI/event changes in `index.html`, `js/00_data_config_state.js`, and `js/06_init_events.js`.

New systems:
- Harbor settlement type, placeable only on land within 3 km of sea.
- Harbor ship-building menu.
- Ship groups for Fishing Boats, Light Raider Ships, Viking Longboats, Long Sailboats, Biremes, Merchant Ships, Triremes, Quadriremes, Quinqueremes, and Custom ships.
- Ship groups move only on water.
- Ground armies stop at the shore if ordered across water.
- Ships can load ground armies within 5 km and release them to the nearest shore.
- Wind / sea map mode and Refresh wind button.
- Wind affects ship movement speed.
- Fishing/merchant ships can generate food/wealth during Pass time.


## V14 modular update: ship damage, events, heroes, and ranking

New file:
- `js/08_events_heroes_ranking_shipdamage.js`

New systems:
- Ship groups now have hidden HP per individual ship.
- Ship battles can damage and destroy ships.
- Damaged ships can be repaired within 3 km of their home harbor using harbor materials.
- Events tab applies random events to one or many settlements.
- Heroes tab creates random or manual heroes assignable to empires.
- Hero modifiers can affect empire wealth, settlement production/growth, army power, and navy power.
- Ranking tab compares empires by population, army, infrastructure, resources, or navy.


## V15 modular update: Trade routes and war logistics

New file:
- `js/09_trade_logistics_routes.js`

New systems:
- Routes tab.
- Land trade routes between 2+ market settlements from at least 2 non-enemy empires.
- Land trade routes use caravans; more caravans produce more income.
- Sea trade routes between 2+ harbors from at least 2 non-enemy empires.
- Sea trade routes use merchant boats; more merchant boats produce more income.
- Trade and logistics routes are drawn on the map and can be toggled on/off.
- Enemy stationary armies/fleets within 2 km of a route blockade it.
- Land armies away from friendly settlements now require army food storage or an active logistics route.
- Food can be loaded from a settlement into a land army.
- Logistics routes can supply stopped land armies from a friendly settlement.
- If an unsupplied army runs out of food, soldiers die during Pass time.
- Export/import now preserves trade routes, logistics routes, and route visibility toggles.


## V16 modular update: Reservists, horses, stables, and jungle troops

New file:
- `js/10_reservists_horses_stable_units.js`

New systems:
- Each settlement has reservists and horses.
- Reservists refill every Pass time based on settlement population and infrastructure.
- Hiring any troop consumes reservists.
- Cavalry units consume both reservists and horses.
- Stable building added; completed stables produce horses every Pass time.
- New troops:
  - Jungle Skirmisher
  - Blowgun Hunters
- Jungle/dense forest/forest terrain now gives very strong bonuses to these new specialist troops.
- Open terrain gives them penalties, so they are not universally strong.


## V17 modular update: Raiding and sieging

New file:
- `js/11_raiding_sieging_loot.js`

New systems:
- War tab.
- Selected land armies within 5 km of an enemy settlement can raid or siege.
- Raiding steals food and wealth, slightly damages population, then sends the army back home.
- Sieges use a manually defined real-life timer.
- If the siege timer expires while the siege is still maintained, the settlement is conquered.
- The defender can raise armies normally and attack the besieging army to break the siege.
- If the besieging army leaves, dies, or is pushed away, the siege breaks.
- Active sieges are drawn on the map with a countdown marker.
- Winners can loot food from defeated armies after battle.
- Winners can also loot a small amount from an enemy settlement if the battle ends near one.
- Siege completion grants food and wealth loot and transfers the settlement to the attacking empire.
- Export/import now preserves active sieges and raid history.


## V18 modular update: UI redesign, empire colors, settlement visuals, event management

New files:
- `css/ui_redesign.css`
- `js/12_ui_redesign_colors_visuals.js`

New systems and fixes:
- Redesigned the interface into a top command console instead of a large left-side rectangle.
- Menus now open as organized floating panels below the top bar.
- Improved spacing, cards, tabs, scroll behavior, and responsiveness.
- Selecting a settlement now also selects its owning empire.
- Adding an army after selecting a settlement now uses that settlement correctly.
- Empires now automatically receive distinct colors.
- Empire color can be edited from the selected empire panel.
- Army symbols and settlement symbols use their empire color.
- Zoomed-in settlements now show visual footprints/buildings.
- Settlement visual footprint size grows with population, infrastructure, and fortification level.
- Event log entries can be deleted.
- Event log entries can be disabled in the log.
- Future random events can be globally disabled/re-enabled from the Events tab.
- Export/import preserves empire colors and event-enabled state.
