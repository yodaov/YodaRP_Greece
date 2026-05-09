// 10_reservists_horses_stable_units.js
// V16: reservists, horses, stable building, cavalry hiring requirements,
// and jungle/dense-forest specialist troops.

function registerV16Units() {
  if (!UNIT_TYPES.some(t => t.key === 'jungleSkirmisher')) {
    UNIT_TYPES.push({
      key: 'jungleSkirmisher',
      label: 'Jungle Skirmisher',
      base: 1.35,
      hireCost: 13,
      wage: 0.055,
      food: 0.045,
      speed: 26,
      tags: ['light', 'skirmish', 'jungle', 'forest', 'missile', 'rough']
    });
  }
  if (!UNIT_TYPES.some(t => t.key === 'blowgunHunters')) {
    UNIT_TYPES.push({
      key: 'blowgunHunters',
      label: 'Blowgun Hunters',
      base: 1.25,
      hireCost: 12,
      wage: 0.045,
      food: 0.038,
      speed: 24,
      tags: ['light', 'skirmish', 'jungle', 'forest', 'poison', 'missile', 'rough']
    });
  }

  UNIT_COUNTERS.jungleSkirmisher = ['archers', 'lightFootmen', 'cavalry', 'numidianCavalry', 'blowgunHunters'];
  UNIT_COUNTERS.blowgunHunters = ['heavyInfantry', 'hoplites', 'huscarls', 'varangianGuards', 'jungleSkirmisher'];

  // Existing units that counter the new specialists, especially outside jungle/dense forest.
  UNIT_COUNTERS.archers = [...new Set([...(UNIT_COUNTERS.archers || []), 'blowgunHunters'])];
  UNIT_COUNTERS.cavalry = [...new Set([...(UNIT_COUNTERS.cavalry || []), 'blowgunHunters'])];
  UNIT_COUNTERS.heavyInfantry = [...new Set([...(UNIT_COUNTERS.heavyInfantry || []), 'jungleSkirmisher'])];
  UNIT_COUNTERS.huscarls = [...new Set([...(UNIT_COUNTERS.huscarls || []), 'jungleSkirmisher', 'blowgunHunters'])];
  UNIT_COUNTERS.vikingBerserker = [...new Set([...(UNIT_COUNTERS.vikingBerserker || []), 'jungleSkirmisher'])];

  UNIT_WAGES.jungleSkirmisher = 0.055;
  UNIT_WAGES.blowgunHunters = 0.045;
  UNIT_HIRE_COSTS.jungleSkirmisher = 13;
  UNIT_HIRE_COSTS.blowgunHunters = 12;
  UNIT_FOOD.jungleSkirmisher = 0.045;
  UNIT_FOOD.blowgunHunters = 0.038;
  UNIT_SPEEDS.jungleSkirmisher = 26;
  UNIT_SPEEDS.blowgunHunters = 24;
}
registerV16Units();

BUILDING_PREFABS.stable = {
  type: 'stable',
  label: 'Stable',
  moneyCost: 110,
  materialCost: 55,
  buildPasses: 2,
  foodProd: 0,
  materialProd: 0,
  wealthProd: 0,
  foodUpkeep: 6,
  materialUpkeep: 3,
  wealthUpkeep: 5,
  horsesProd: 8
};

function maxReservistsForSettlement(s) {
  ensureSettlementEconomy(s);
  return Math.max(0, Math.floor((Number(s.economy.population.count) || 0) * 0.12));
}
function reservistRefillForSettlement(s) {
  ensureSettlementEconomy(s);
  return Math.max(1, Math.round((Number(s.economy.population.count) || 0) * 0.012 + (Number(s.economy.infrastructure) || 0)));
}
function isCavalryUnitKey(unitKey) {
  const u = unitByKey(unitKey);
  return !!(u && u.tags && u.tags.includes('cavalry'));
}
function hiringSettlementForArmy(army) {
  if (!army) return null;
  return settlementById(army.homeSettlementId || army.stationedSettlementId || selectedSettlementId);
}
function ensureReservistsAndHorses(s) {
  if (!s) return;
  ensureSettlementEconomy(s);
  if (s.economy.reservists === undefined) s.economy.reservists = Math.floor(maxReservistsForSettlement(s) * 0.55);
  if (s.economy.lastReservistsNet === undefined) s.economy.lastReservistsNet = 0;
  if (s.economy.horses === undefined) s.economy.horses = 0;
  if (s.economy.lastHorsesNet === undefined) s.economy.lastHorsesNet = 0;
  s.economy.reservists = clamp(Math.floor(Number(s.economy.reservists) || 0), 0, maxReservistsForSettlement(s));
  s.economy.horses = Math.max(0, Math.floor(Number(s.economy.horses) || 0));
}

const V16_ORIGINAL_ENSURE_SETTLEMENT_ECONOMY = ensureSettlementEconomy;
ensureSettlementEconomy = function ensureSettlementEconomyV16(s) {
  V16_ORIGINAL_ENSURE_SETTLEMENT_ECONOMY(s);
  if (!s) return;
  if (s.economy.reservists === undefined) s.economy.reservists = Math.floor(Math.max(0, (Number(s.economy.population?.count) || 0) * 0.06));
  if (s.economy.lastReservistsNet === undefined) s.economy.lastReservistsNet = 0;
  if (s.economy.horses === undefined) s.economy.horses = 0;
  if (s.economy.lastHorsesNet === undefined) s.economy.lastHorsesNet = 0;
  s.economy.reservists = clamp(Math.floor(Number(s.economy.reservists) || 0), 0, maxReservistsForSettlement(s));
  s.economy.horses = Math.max(0, Math.floor(Number(s.economy.horses) || 0));
};

const V16_ORIGINAL_SET_ARMY_UNIT_COUNT = setArmyUnitCount;
setArmyUnitCount = function setArmyUnitCountV16(army, unitKey, requestedCount) {
  normalizeArmyUnits(army);
  const unit = unitByKey(unitKey);
  if (!unit) return;

  const oldCount = Math.max(0, Number(army.units[unitKey]) || 0);
  let newCount = Math.max(0, Math.floor(Number(requestedCount) || 0));
  let delta = newCount - oldCount;

  // Firing soldiers gives no refund. Dead or dismissed soldiers do not return to the reserve pool.
  if (delta <= 0) {
    army.units[unitKey] = newCount;
    return;
  }

  const settlement = hiringSettlementForArmy(army);
  if (!settlement) {
    alert('This army has no home/selected settlement to recruit from. Assign it to a settlement first.');
    army.units[unitKey] = oldCount;
    return;
  }
  ensureReservistsAndHorses(settlement);

  const empire = paymentEmpireForArmy(army);
  const costPer = unit.hireCost || 0;
  let affordableByWealth = delta;
  if (empire && costPer > 0) {
    ensureEmpireShape(empire);
    affordableByWealth = Math.floor((Number(empire.wealth.amount) || 0) / costPer);
  }

  const availableReservists = Math.floor(Number(settlement.economy.reservists) || 0);
  const availableHorses = Math.floor(Number(settlement.economy.horses) || 0);
  const horseCap = isCavalryUnitKey(unitKey) ? availableHorses : Infinity;

  const actualDelta = Math.max(0, Math.min(delta, affordableByWealth, availableReservists, horseCap));
  if (actualDelta <= 0) {
    const reasons = [];
    if (affordableByWealth <= 0 && empire) reasons.push('wealth');
    if (availableReservists <= 0) reasons.push('reservists');
    if (isCavalryUnitKey(unitKey) && availableHorses <= 0) reasons.push('horses');
    alert(`Cannot recruit ${unit.label}: not enough ${reasons.join(', ') || 'resources'}.`);
    army.units[unitKey] = oldCount;
    return;
  }

  if (empire && costPer > 0) empire.wealth.amount -= actualDelta * costPer;
  settlement.economy.reservists -= actualDelta;
  if (isCavalryUnitKey(unitKey)) settlement.economy.horses -= actualDelta;

  army.units[unitKey] = oldCount + actualDelta;

  if (actualDelta < delta) {
    const missing = [];
    if (actualDelta >= affordableByWealth && empire) missing.push('wealth');
    if (actualDelta >= availableReservists) missing.push('reservists');
    if (isCavalryUnitKey(unitKey) && actualDelta >= availableHorses) missing.push('horses');
    alert(`Only recruited ${actualDelta.toLocaleString()} ${unit.label} due to limited ${missing.join(', ') || 'resources'}.`);
  }
};

const V16_ORIGINAL_BIOME_MULTIPLIER_FOR = biomeMultiplierFor;
biomeMultiplierFor = function biomeMultiplierForV16(typeKey, biomeName) {
  let m = V16_ORIGINAL_BIOME_MULTIPLIER_FOR(typeKey, biomeName);
  const b = (biomeName || '').toLowerCase();
  const jungleLike = b.includes('jungle') || b.includes('dense forest') || b.includes('humid forest');
  const forestLike = jungleLike || b.includes('forest') || b.includes('woodland');
  const openLike = b.includes('plain') || b.includes('lowland') || b.includes('agricultural') || b.includes('olive');

  if (typeKey === 'jungleSkirmisher') {
    if (jungleLike) m *= 2.05;
    else if (forestLike) m *= 1.58;
    else if (b.includes('scrub') || b.includes('maquis')) m *= 1.18;
    else if (openLike) m *= 0.78;
    else m *= 0.90;
  }
  if (typeKey === 'blowgunHunters') {
    if (jungleLike) m *= 2.20;
    else if (forestLike) m *= 1.68;
    else if (b.includes('scrub') || b.includes('maquis')) m *= 1.08;
    else if (openLike) m *= 0.68;
    else m *= 0.82;
  }
  return clamp(m, 0.25, 2.45);
};

const V16_ORIGINAL_TERRAIN_MULTIPLIER_FOR = terrainMultiplierFor;
terrainMultiplierFor = function terrainMultiplierForV16(typeKey, terrainName) {
  let m = V16_ORIGINAL_TERRAIN_MULTIPLIER_FOR(typeKey, terrainName);
  const t = (terrainName || '').toLowerCase();
  const denseCover = t.includes('forest') || t.includes('jungle') || t.includes('scrub');
  const broken = denseCover || t.includes('rocky') || t.includes('mountain pass');
  const open = t.includes('open') || t.includes('rolling');

  if (typeKey === 'jungleSkirmisher') {
    if (denseCover) m *= 1.65;
    else if (broken) m *= 1.22;
    else if (open) m *= 0.82;
  }
  if (typeKey === 'blowgunHunters') {
    if (denseCover) m *= 1.78;
    else if (broken) m *= 1.12;
    else if (open) m *= 0.70;
  }
  return clamp(m, 0.22, 2.55);
};

const V16_ORIGINAL_PASS_TIME = passTime;
passTime = function passTimeV16() {
  V16_ORIGINAL_PASS_TIME();

  const reports = [];
  settlements.forEach(s => {
    ensureReservistsAndHorses(s);
    const maxRes = maxReservistsForSettlement(s);
    const refill = Math.min(maxRes - s.economy.reservists, reservistRefillForSettlement(s));
    s.economy.reservists += Math.max(0, refill);
    s.economy.lastReservistsNet = Math.max(0, refill);

    const stableCount = completedBuildings(s, 'stable');
    const horses = stableCount * (BUILDING_PREFABS.stable.horsesProd || 0);
    s.economy.horses += horses;
    s.economy.lastHorsesNet = horses;

    if (refill || horses) {
      reports.push(`${s.name}: +${Math.round(refill)} reservists${horses ? `, +${horses} horses` : ''}`);
    }
  });

  if (reports.length) readout.textContent += ` Recruitment: ${reports.join(' · ')}.`;
  refreshEmpirePanels();
  refreshSelectionPanels();
};

const V16_ORIGINAL_RENDER_UNIT_INPUTS_FOR_ARMY = renderUnitInputsForArmy;
renderUnitInputsForArmy = function renderUnitInputsForArmyV16(a, prefix) {
  normalizeArmyUnits(a);
  const rows = UNIT_TYPES.map(t => {
    const req = t.tags?.includes('cavalry') ? ' · needs reservist + horse' : ' · needs reservist';
    return `
      <label>${t.label}</label>
      <input class="${prefix}UnitInput" data-unit="${t.key}" type="number" min="0" step="1" value="${a.units?.[t.key] || 0}" title="Hire ${t.label}: cost ${t.hireCost} wealth, wage ${t.wage}/pass, food ${t.food}/pass, speed ${t.speed} km/day${req}">
    `;
  }).join('');

  return `
    <div class="armyGrid">${rows}</div>
    <div class="subtleLine">Hiring uses wealth plus settlement reservists. Cavalry units also require horses. Firing gives no refund.</div>
  `;
};

function buildStableForSelectedSettlement() {
  const s = settlementById(selectedSettlementId);
  if (!s) return;
  createBuildingForSettlement(s, 'stable');
}

function renderV16RecruitmentPanel(s) {
  if (!s) return '';
  ensureReservistsAndHorses(s);
  const maxRes = maxReservistsForSettlement(s);
  const stables = completedBuildings(s, 'stable');
  return `
    <div class="empireSectionTitle">Reservists & horses</div>
    <div class="empireMiniGrid">
      <label>Reservists</label><input data-v16-settlement-field="reservists" type="number" step="1" value="${Math.round(s.economy.reservists)}">
      <label>Horses</label><input data-v16-settlement-field="horses" type="number" step="1" value="${Math.round(s.economy.horses)}">
    </div>
    <div class="subtleLine">Reservist max: ${maxRes.toLocaleString()} · last refill +${Math.round(s.economy.lastReservistsNet || 0)} · refill next pass about ${reservistRefillForSettlement(s)}.</div>
    <div class="subtleLine">Completed stables: ${stables} · last horse production +${Math.round(s.economy.lastHorsesNet || 0)} · each stable produces ${BUILDING_PREFABS.stable.horsesProd} horses/pass.</div>
    <div class="row">
      <button id="buildStableBtn">Build stable (${BUILDING_PREFABS.stable.moneyCost} wealth / ${BUILDING_PREFABS.stable.materialCost} materials / ${BUILDING_PREFABS.stable.buildPasses} passes)</button>
    </div>
  `;
}

const V16_ORIGINAL_REFRESH_SELECTED_EMPIRE_PANEL = refreshSelectedEmpirePanel;
refreshSelectedEmpirePanel = function refreshSelectedEmpirePanelV16() {
  V16_ORIGINAL_REFRESH_SELECTED_EMPIRE_PANEL();
  const s = settlementById(selectedSettlementId);
  const e = empireById(selectedEmpireId);
  if (!s || !e || !e.settlementIds.includes(s.id)) return;

  selectedEmpirePanel.insertAdjacentHTML('beforeend', renderV16RecruitmentPanel(s));
  selectedEmpirePanel.querySelector('#buildStableBtn')?.addEventListener('click', buildStableForSelectedSettlement);
  selectedEmpirePanel.querySelectorAll('[data-v16-settlement-field]').forEach(input => {
    input.addEventListener('change', () => {
      const current = settlementById(selectedSettlementId);
      if (!current) return;
      ensureReservistsAndHorses(current);
      current.economy[input.dataset.v16SettlementField] = Math.max(0, Math.floor(Number(input.value) || 0));
      ensureReservistsAndHorses(current);
      refreshEmpirePanels();
    });
  });
};

// Refresh unit inputs after adding the new unit types.
armies.forEach(normalizeArmyUnits);
settlements.forEach(ensureReservistsAndHorses);
