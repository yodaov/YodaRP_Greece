// 08_events_heroes_ranking_shipdamage.js
// V14: ship damage/repair, random events, heroes, and global ranking.
// Loaded after naval systems and before init events.

const EVENT_NAMES = [
  'Light rain', 'Heavy rains', 'Drought', 'Harsh winter', 'Storm damage', 'Minor flooding',
  'Wildfire', 'Crop disease', 'Locust swarm', 'Poor harvest', 'Bumper harvest',
  'Livestock illness', 'Livestock boom', 'Caravan arrival', 'Trade boom', 'Trade shortage',
  'Bandit raid', 'Refugee influx', 'Migration outflow', 'Mine/resource discovery',
  'Civil unrest', 'Festival/feast', 'Famine', 'Plague outbreak'
];

const HERO_MODIFIER_TYPES = {
  empireWealth: 'Empire wealth / pass',
  settlementFood: 'Settlement food production / pass',
  settlementMaterials: 'Settlement material production / pass',
  settlementPopulation: 'Settlement population growth / pass',
  armyScorePercent: 'Army battle score %',
  navyScorePercent: 'Navy battle score %',
  infrastructure: 'Settlement infrastructure flat bonus'
};

function ensureHeroShape(hero) {
  if (!hero.id) hero.id = generateId('hero');
  if (!hero.name) hero.name = 'Unnamed Hero';
  if (!Array.isArray(hero.modifiers)) hero.modifiers = [];
  if (hero.empireId === undefined) hero.empireId = null;
}

function heroModifierSum(type, context = {}) {
  let total = 0;
  heroes.forEach(h => {
    ensureHeroShape(h);
    if (context.empireId && h.empireId && h.empireId !== context.empireId) return;
    h.modifiers.forEach(m => {
      if (!m || m.type !== type) return;
      if (m.targetKind === 'settlement' && context.settlementId && m.targetId !== context.settlementId) return;
      if (m.targetKind === 'army' && context.armyId && m.targetId !== context.armyId) return;
      total += Number(m.value) || 0;
    });
  });
  return total;
}

function empireHeroWealthBonus(empireId) {
  return heroModifierSum('empireWealth', { empireId });
}
function settlementHeroContext(s) {
  return { empireId: s?.empireId || null, settlementId: s?.id || null };
}
function armyHeroContext(a) {
  const s = settlementById(a?.homeSettlementId || a?.stationedSettlementId);
  return { empireId: s?.empireId || armyEmpireId?.(a), armyId: a?.id || null };
}

/* Ship HP and repairs */

function shipMaxHp(army) {
  const d = shipTypeData(army);
  return Math.max(20, Math.round((Number(d.battleScore) || 0) * 1.8 + (Number(d.materialCost) || 0) * 0.35 + (Number(d.capacity) || 0) * 0.12 + 18));
}

function ensureShipHp(army) {
  if (!isShipGroup(army)) return [];
  const max = shipMaxHp(army);
  if (!Array.isArray(army.shipHp)) army.shipHp = [];
  const count = shipCount(army);
  while (army.shipHp.length < count) army.shipHp.push(max);
  if (army.shipHp.length > count) army.shipHp.length = count;
  army.shipHp = army.shipHp.map(h => clamp(Number(h) || 0, 0, max));
  return army.shipHp;
}

function shipHpStats(army) {
  const hp = ensureShipHp(army);
  const max = shipMaxHp(army);
  const aliveHp = hp.filter(h => h > 0);
  const alive = aliveHp.length;
  const totalHp = aliveHp.reduce((a, b) => a + b, 0);
  const maxTotal = Math.max(1, alive * max);
  const missing = alive * max - totalHp;
  return { max, alive, destroyed: hp.length - alive, totalHp, maxTotal, missing, fraction: alive ? totalHp / maxTotal : 0 };
}

function cleanupDestroyedShips(army) {
  if (!isShipGroup(army)) return;
  ensureShipHp(army);
  army.shipHp = army.shipHp.filter(h => h > 0);
  army.shipCount = army.shipHp.length;
  if (army.shipCount <= 0) {
    armies = armies.filter(a => a.id !== army.id);
    if (selectedArmyId === army.id) selectedArmyId = null;
  }
}

const V14_ORIGINAL_SHIP_BATTLE_POWER = typeof shipBattlePower === 'function' ? shipBattlePower : null;
shipBattlePower = function shipBattlePowerV14(army) {
  if (!isShipGroup(army)) return 0;
  const d = shipTypeData(army);
  const hp = shipHpStats(army);
  const heroBonus = heroModifierSum('navyScorePercent', armyHeroContext(army)) / 100;
  const shipPart = hp.alive * (Number(d.battleScore) || 0) * Math.max(0.15, hp.fraction);
  return shipPart * (1 + heroBonus) + cargoSoldierCount(army) * 0.08;
};

const V14_ORIGINAL_SHIP_LABEL = typeof shipLabel === 'function' ? shipLabel : null;
shipLabel = function shipLabelV14(army) {
  if (!isShipGroup(army)) return army?.name || '';
  const d = shipTypeData(army);
  const hp = shipHpStats(army);
  const dmg = hp.missing > 0 ? ` · damaged ${Math.round(hp.fraction * 100)}%` : '';
  const destroyed = hp.destroyed ? ` · ${hp.destroyed} destroyed` : '';
  return `${army.name} · ${hp.alive}/${shipCount(army)} ${d.label}${destroyed}${dmg} · cargo ${cargoSoldierCount(army)}/${shipCapacity(army)}`;
};

function applyShipDamageToSide(armyIds, deadCount) {
  const sideShips = armyIds.map(id => armyById(id)).filter(isShipGroup);
  if (!sideShips.length) return;
  const sidePeople = Math.max(1, armyIds.map(id => armyById(id)).filter(Boolean).reduce((sum, a) => sum + Math.max(1, totalArmySoldiers(a)), 0));
  const severity = clamp(deadCount / sidePeople, 0.04, 0.92);

  sideShips.forEach(ship => {
    const hp = ensureShipHp(ship);
    const max = shipMaxHp(ship);
    if (!hp.length) return;

    let damagePool = severity * max * hp.length * 1.35;
    // Big single ships should not be instantly erased by one bad casualty roll.
    if (hp.length === 1) damagePool *= 0.68;

    // Random-ish deterministic spread based on current battle time/position.
    for (let safety = 0; safety < 300 && damagePool > 0 && hp.some(h => h > 0); safety++) {
      const aliveIdx = hp.map((h, i) => h > 0 ? i : -1).filter(i => i >= 0);
      const i = aliveIdx[Math.floor(Math.random() * aliveIdx.length)];
      const hit = Math.min(hp[i], Math.max(max * 0.10, Math.random() * max * 0.32));
      hp[i] -= hit;
      damagePool -= hit;
    }
    cleanupDestroyedShips(ship);
  });
}

const V14_ORIGINAL_DISTRIBUTE_DEATHS = distributeDeaths;
distributeDeaths = function distributeDeathsV14(armyIds, deadCount) {
  V14_ORIGINAL_DISTRIBUTE_DEATHS(armyIds, deadCount);
  applyShipDamageToSide(armyIds, deadCount);
};

function repairSelectedShipGroup() {
  const ship = armyById(selectedArmyId);
  if (!isShipGroup(ship)) return;
  const home = settlementById(ship.homeSettlementId);
  if (!home || home.type !== 'harbor') { alert('This ship group has no home harbor.'); return; }
  if (pointKmDistance(ship.x, ship.y, home.x, home.y) > 3) { alert('Ships must be within 3 km of their home harbor to repair.'); return; }
  ensureSettlementEconomy(home);
  const hp = ensureShipHp(ship);
  const max = shipMaxHp(ship);
  const missing = hp.reduce((sum, h) => sum + (max - h), 0);
  if (missing <= 0) { alert('Ships are already fully repaired.'); return; }
  const materialNeed = Math.ceil(missing * 0.10);
  const available = Math.max(0, Number(home.economy.supplies.materials) || 0);
  const spend = Math.min(materialNeed, available);
  if (spend <= 0) { alert('The harbor has no materials for repairs.'); return; }
  const repairHp = spend / 0.10;
  let pool = repairHp;
  for (let i = 0; i < hp.length && pool > 0; i++) {
    const add = Math.min(max - hp[i], pool);
    hp[i] += add;
    pool -= add;
  }
  home.economy.supplies.materials -= spend;
  readout.textContent = `${ship.name} repaired using ${spend} harbor materials.`;
  refreshSelectionPanels();
  refreshEmpirePanels();
  draw();
}

/* Hero modifiers applied to existing systems */

const V14_ORIGINAL_SETTLEMENT_BUILDING_STATS = settlementBuildingStats;
settlementBuildingStats = function settlementBuildingStatsV14(s) {
  const stats = V14_ORIGINAL_SETTLEMENT_BUILDING_STATS(s);
  if (s) {
    const ctx = settlementHeroContext(s);
    stats.foodProd += heroModifierSum('settlementFood', ctx);
    stats.materialProd += heroModifierSum('settlementMaterials', ctx);
    stats.populationGrowthBonus += heroModifierSum('settlementPopulation', ctx);
  }
  return stats;
};

const V14_ORIGINAL_ARMY_SCORE = armyScore;
armyScore = function armyScoreV14(army) {
  const base = V14_ORIGINAL_ARMY_SCORE(army);
  if (!army) return base;
  const pct = heroModifierSum(isShipGroup(army) ? 'navyScorePercent' : 'armyScorePercent', armyHeroContext(army));
  return base * (1 + pct / 100);
};

const V14_ORIGINAL_ARMY_POWER_VS = armyPowerVs;
armyPowerVs = function armyPowerVsV14(army, enemyCompData) {
  const base = V14_ORIGINAL_ARMY_POWER_VS(army, enemyCompData);
  if (!army) return base;
  const pct = heroModifierSum(isShipGroup(army) ? 'navyScorePercent' : 'armyScorePercent', armyHeroContext(army));
  return base * (1 + pct / 100);
};

const V14_ORIGINAL_PASS_TIME = passTime;
passTime = function passTimeV14() {
  V14_ORIGINAL_PASS_TIME();
  let heroWealth = 0;
  empires.forEach(e => {
    const bonus = empireHeroWealthBonus(e.id);
    if (bonus) {
      ensureEmpireShape(e);
      e.wealth.amount += bonus;
      heroWealth += bonus;
    }
  });
  if (heroWealth) readout.textContent += ` Hero effects: ${formatSigned(heroWealth)} wealth.`;
  refreshEmpirePanels();
};

/* Event system */

function applySettlementEvent(s, name) {
  ensureSettlementEconomy(s);
  const e = s.empireId ? empireById(s.empireId) : null;
  let note = '';
  const food = v => { s.economy.supplies.food = Math.max(0, s.economy.supplies.food + v); };
  const mat = v => { s.economy.supplies.materials = Math.max(0, s.economy.supplies.materials + v); };
  const pop = v => { s.economy.population.count = Math.max(0, s.economy.population.count + v); };
  const wealth = v => { if (e) { ensureEmpireShape(e); e.wealth.amount = Math.max(0, e.wealth.amount + v); } };

  switch (name) {
    case 'Light rain': food(45); note = '+food'; break;
    case 'Heavy rains': food(25); mat(-10); note = '+food, -materials'; break;
    case 'Drought': food(-90); s.economy.population.lastGrowth -= 2; note = 'food loss and growth pressure'; break;
    case 'Harsh winter': food(-75); wealth(-20); note = 'food/wealth loss'; break;
    case 'Storm damage': mat(-55); wealth(-25); note = 'material/wealth damage'; break;
    case 'Minor flooding': food(-35); mat(-25); note = 'supply damage'; break;
    case 'Wildfire': food(-55); mat(-45); pop(-Math.max(2, Math.round(s.economy.population.count * 0.03))); note = 'food/material/population loss'; break;
    case 'Crop disease': food(-100); note = 'major food loss'; break;
    case 'Locust swarm': food(-135); note = 'severe food loss'; break;
    case 'Poor harvest': food(-70); note = 'food loss'; break;
    case 'Bumper harvest': food(150); wealth(15); note = 'large food gain'; break;
    case 'Livestock illness': food(-55); wealth(-15); note = 'food/wealth loss'; break;
    case 'Livestock boom': food(70); wealth(20); note = 'food/wealth gain'; break;
    case 'Caravan arrival': wealth(65); mat(20); note = 'wealth/material gain'; break;
    case 'Trade boom': wealth(110); note = 'major wealth gain'; break;
    case 'Trade shortage': wealth(-60); note = 'wealth loss'; break;
    case 'Bandit raid': wealth(-45); food(-35); mat(-25); note = 'raid losses'; break;
    case 'Refugee influx': pop(Math.max(8, Math.round(s.economy.population.count * 0.12))); food(-30); note = 'population gain, food pressure'; break;
    case 'Migration outflow': pop(-Math.max(6, Math.round(s.economy.population.count * 0.10))); note = 'population loss'; break;
    case 'Mine/resource discovery': mat(170); wealth(55); note = 'material/wealth discovery'; break;
    case 'Civil unrest': wealth(-55); s.economy.infrastructure = Math.max(0, s.economy.infrastructure - 1); note = 'wealth and infrastructure loss'; break;
    case 'Festival/feast': wealth(-25); food(-35); s.economy.population.baseGrowth += 0.5; note = 'costly morale/growth boost'; break;
    case 'Famine': food(-180); pop(-Math.max(10, Math.round(s.economy.population.count * 0.08))); note = 'severe food/population loss'; break;
    case 'Plague outbreak': pop(-Math.max(12, Math.round(s.economy.population.count * 0.18))); wealth(-40); note = 'major population loss'; break;
  }
  s.economy.lastReport = `Event: ${name} (${note}).`;
  return note;
}

function eventTargets() {
  const scope = eventScopeSelect?.value || 'globalRandom';
  const empireId = eventEmpireSelect?.value || '';
  let pool = settlements.slice();
  if (scope === 'random' || scope === 'all') pool = settlements.filter(s => s.empireId === empireId);
  if (!pool.length) return [];
  if (scope === 'all' || scope === 'globalAll') return pool;
  return [pool[Math.floor(Math.random() * pool.length)]];
}

function triggerRandomEvent() {
  const targets = eventTargets();
  if (!targets.length) { alert('No settlements available for this event scope.'); return; }
  const eventName = EVENT_NAMES[Math.floor(Math.random() * EVENT_NAMES.length)];
  const entries = targets.map(s => {
    const note = applySettlementEvent(s, eventName);
    return `${s.name}: ${note}`;
  });
  eventLog.unshift({ id: generateId('event'), eventName, when: new Date().toLocaleString(), entries });
  eventLog = eventLog.slice(0, 40);
  readout.textContent = `Event triggered: ${eventName} (${targets.length} settlement${targets.length === 1 ? '' : 's'}).`;
  refreshEventPanel();
  refreshEmpirePanels();
  draw();
}

function refreshEventPanel() {
  if (!eventEmpireSelect || !eventLogPanel) return;
  eventEmpireSelect.innerHTML = empires.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">No empires</option>';
  eventLogPanel.innerHTML = eventLog.length
    ? eventLog.map(ev => `<div class="heroCard"><strong>${ev.eventName}</strong><div class="subtleLine">${ev.when}</div><ul>${ev.entries.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')
    : 'No events triggered yet.';
}

/* Heroes */

function heroModifierOptions(selected = 'empireWealth') {
  return Object.entries(HERO_MODIFIER_TYPES).map(([k, v]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${v}</option>`).join('');
}

function randomHeroName() {
  const first = ['Leon', 'Aster', 'Damon', 'Kyra', 'Thales', 'Rhea', 'Myrto', 'Orion', 'Cassia', 'Brennos', 'Arius', 'Nika'];
  const title = ['the Builder', 'the Navigator', 'the Hawk', 'the Quartermaster', 'the Ironhand', 'the Wise', 'the Stormborn', 'of the Passes', 'of the Harbor'];
  return `${first[Math.floor(Math.random() * first.length)]} ${title[Math.floor(Math.random() * title.length)]}`;
}

function createHero(randomized = false) {
  const name = randomized ? randomHeroName() : prompt('Hero name:', 'New Hero');
  if (name === null) return;
  const empireId = empires[0]?.id || null;
  const modifiers = [];
  if (randomized) {
    const keys = Object.keys(HERO_MODIFIER_TYPES);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const type = keys[Math.floor(Math.random() * keys.length)];
      let value = 0;
      if (type.includes('Percent')) value = 5 + Math.floor(Math.random() * 16);
      else if (type === 'infrastructure') value = 1;
      else value = 5 + Math.floor(Math.random() * 31);
      modifiers.push({ type, value });
    }
  } else {
    for (let i = 1; i <= 3; i++) {
      const type = prompt(`Modifier ${i} type: empireWealth, settlementFood, settlementMaterials, settlementPopulation, armyScorePercent, navyScorePercent, infrastructure. Leave blank to stop.`, i === 1 ? 'empireWealth' : '');
      if (!type) break;
      const value = Number(prompt(`Value for ${type}:`, type.includes('Percent') ? '10' : '10')) || 0;
      modifiers.push({ type, value });
    }
  }
  heroes.push({ id: generateId('hero'), name: String(name).trim() || 'New Hero', empireId, modifiers });
  refreshHeroPanel();
}

function refreshHeroPanel() {
  if (!heroPanel) return;
  heroes.forEach(ensureHeroShape);
  const empireOptions = (selected) => `<option value="">No empire</option>` + empires.map(e => `<option value="${e.id}" ${selected === e.id ? 'selected' : ''}>${e.name}</option>`).join('');
  heroPanel.innerHTML = heroes.length ? heroes.map(h => `
    <div class="heroCard">
      <strong>${h.name}</strong>
      <div class="row">
        <select class="heroEmpireSelect" data-hero-id="${h.id}">${empireOptions(h.empireId || '')}</select>
        <button class="deleteHeroBtn" data-hero-id="${h.id}">Delete</button>
      </div>
      <ul>${h.modifiers.map(m => `<li>${HERO_MODIFIER_TYPES[m.type] || m.type}: ${formatSigned(m.value)}</li>`).join('') || '<li>No modifiers</li>'}</ul>
    </div>
  `).join('') : 'No heroes yet.';

  heroPanel.querySelectorAll('.heroEmpireSelect').forEach(sel => {
    sel.addEventListener('change', () => {
      const h = heroes.find(x => x.id === sel.dataset.heroId);
      if (h) h.empireId = sel.value || null;
      refreshHeroPanel();
      refreshEmpirePanels();
    });
  });
  heroPanel.querySelectorAll('.deleteHeroBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      heroes = heroes.filter(h => h.id !== btn.dataset.heroId);
      refreshHeroPanel();
      refreshEmpirePanels();
    });
  });
}

/* Ranking */

function empireActiveArmySize(e) {
  return armies.filter(a => !isShipGroup(a)).filter(a => armyEmpireId(a) === e.id).reduce((s, a) => s + totalArmySoldiers(a), 0);
}
function empireInfrastructure(e) {
  return e.settlementIds.map(id => settlementById(id)).filter(Boolean).reduce((s, st) => {
    ensureSettlementEconomy(st);
    return s + (Number(st.economy.infrastructure) || 0);
  }, 0);
}
function empireResources(e) {
  const supplies = e.settlementIds.map(id => settlementById(id)).filter(Boolean).reduce((s, st) => {
    ensureSettlementEconomy(st);
    return s + (Number(st.economy.supplies.food) || 0) + (Number(st.economy.supplies.materials) || 0);
  }, 0);
  return supplies + (Number(e.wealth?.amount) || 0);
}
function empireNavy(e) {
  return armies.filter(isShipGroup).filter(a => armyEmpireId(a) === e.id).reduce((s, a) => s + shipBattlePower(a), 0);
}
function rankingValue(e, type) {
  if (type === 'population') return totalEmpirePopulation(e);
  if (type === 'army') return empireActiveArmySize(e);
  if (type === 'infrastructure') return empireInfrastructure(e);
  if (type === 'resources') return empireResources(e);
  if (type === 'navy') return empireNavy(e);
  return 0;
}
function refreshRankingPanel() {
  if (!rankingPanel || !rankingTypeSelect) return;
  const type = rankingTypeSelect.value || 'population';
  const rows = empires.slice().map(e => ({ e, v: rankingValue(e, type) })).sort((a, b) => b.v - a.v);
  rankingPanel.innerHTML = rows.length ? `
    <table class="rankingTable">
      <tr><th>#</th><th>Empire</th><th>Value</th></tr>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.e.name}</td><td>${Math.round(r.v).toLocaleString()}</td></tr>`).join('')}
    </table>
  ` : 'No empires created yet.';
}


const V14_ORIGINAL_JOIN_ENCOUNTER_ARMIES = typeof joinEncounterArmies === 'function' ? joinEncounterArmies : null;
joinEncounterArmies = function joinEncounterArmiesV14(enc) {
  const live = enc.armyIds.map(id => armyById(id)).filter(Boolean);
  if (live.length >= 2 && live.every(isShipGroup)) {
    const base = live[0];
    const name = prompt('Name the joined ship group:', `${base.name} Fleet`);
    if (name === null) return;
    ensureShipHp(base);
    cargoUnits(base);

    for (let i = 1; i < live.length; i++) {
      const other = live[i];
      ensureShipHp(other);
      const beforeCount = shipCount(base);
      const totalShips = beforeCount + shipCount(other);
      const bData = shipTypeData(base), oData = shipTypeData(other);
      if (other.shipType !== base.shipType || JSON.stringify(other.shipData) !== JSON.stringify(base.shipData)) {
        base.shipData = {
          ...bData,
          label: 'Mixed Fleet',
          battleScore: ((bData.battleScore || 0) * beforeCount + (oData.battleScore || 0) * shipCount(other)) / Math.max(1, totalShips),
          speed: ((bData.speed || 0) * beforeCount + (oData.speed || 0) * shipCount(other)) / Math.max(1, totalShips),
          income: ((bData.income || 0) * beforeCount + (oData.income || 0) * shipCount(other)) / Math.max(1, totalShips),
          foodIncome: ((bData.foodIncome || 0) * beforeCount + (oData.foodIncome || 0) * shipCount(other)) / Math.max(1, totalShips),
          capacity: ((bData.capacity || 0) * beforeCount + (oData.capacity || 0) * shipCount(other)) / Math.max(1, totalShips),
          crew: ((bData.crew || 0) * beforeCount + (oData.crew || 0) * shipCount(other)) / Math.max(1, totalShips),
          windSensitivity: ((bData.windSensitivity || 1) * beforeCount + (oData.windSensitivity || 1) * shipCount(other)) / Math.max(1, totalShips)
        };
        base.shipType = 'custom';
      }
      base.shipHp = [...ensureShipHp(base), ...ensureShipHp(other)];
      base.shipCount = base.shipHp.length;
      const bu = cargoUnits(base), ou = cargoUnits(other);
      UNIT_TYPES.forEach(unit => { bu[unit.key] = (Number(bu[unit.key]) || 0) + (Number(ou[unit.key]) || 0); });
      base.cargoNames = [...(base.cargoNames || []), ...(other.cargoNames || [])];
      armies = armies.filter(a => a.id !== other.id);
    }

    base.name = name.trim() || `${base.name} Fleet`;
    base.x = live.reduce((s, a) => s + a.x, 0) / live.length;
    base.y = live.reduce((s, a) => s + a.y, 0) / live.length;
    selectedArmyId = base.id;
    encounters = encounters.filter(e => e.id !== enc.id);
    selectedEncounterId = null;
    refreshSelectionPanels();
    refreshBattlePanel(true);
    draw();
    return;
  }

  if (V14_ORIGINAL_JOIN_ENCOUNTER_ARMIES) return V14_ORIGINAL_JOIN_ENCOUNTER_ARMIES(enc);
};


/* UI hooks and appendages */

const V14_ORIGINAL_REFRESH_SELECTION_PANELS = refreshSelectionPanels;
refreshSelectionPanels = function refreshSelectionPanelsV14() {
  V14_ORIGINAL_REFRESH_SELECTION_PANELS();
  const a = armyById(selectedArmyId);
  if (isShipGroup(a)) {
    const hp = shipHpStats(a);
    const home = settlementById(a.homeSettlementId);
    const nearHome = home && pointKmDistance(a.x, a.y, home.x, home.y) <= 3;
    selectedArmyInfo.insertAdjacentHTML('beforeend', `
      <div class="armyEditor">
        <strong>Ship integrity</strong>
        <div class="subtleLine">Alive ships: ${hp.alive} · Destroyed: ${hp.destroyed} · Average HP: ${Math.round(hp.fraction * 100)}% · Max HP/ship: ${hp.max}</div>
        <div class="row"><button id="repairShipGroupBtn" ${nearHome && hp.missing > 0 ? '' : 'disabled'}>Repair at harbor</button></div>
        <div class="subtleLine">${nearHome ? 'Within repair range of home harbor.' : 'Repairs require being within 3 km of home harbor.'}</div>
      </div>
    `);
    selectedArmyInfo.querySelector('#repairShipGroupBtn')?.addEventListener('click', repairSelectedShipGroup);
  }
};

function bindV14Menus() {
  menuHeroesBtn?.addEventListener('click', () => { setActiveMenu('heroes'); refreshHeroPanel(); });
  menuEventsBtn?.addEventListener('click', () => { setActiveMenu('events'); refreshEventPanel(); });
  menuRankingBtn?.addEventListener('click', () => { setActiveMenu('ranking'); refreshRankingPanel(); });
  createRandomHeroBtn?.addEventListener('click', () => createHero(true));
  createManualHeroBtn?.addEventListener('click', () => createHero(false));
  triggerRandomEventBtn?.addEventListener('click', triggerRandomEvent);
  refreshRankingBtn?.addEventListener('click', refreshRankingPanel);
  rankingTypeSelect?.addEventListener('change', refreshRankingPanel);
}
bindV14Menus();
