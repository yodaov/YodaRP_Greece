// 11_raiding_sieging_loot.js
// V17: Raiding, timed sieges, settlement conquest, and post-battle loot.

let sieges = [];
let raidLog = [];

function siegeById(id) {
  return sieges.find(s => s.id === id) || null;
}
function activeSiegeForSettlement(settlementId) {
  return sieges.find(s => s.settlementId === settlementId && s.state === 'active') || null;
}
function armyCanDoWarAction(army) {
  return army && !isShipGroup(army) && !army.route && !army.battleId && totalArmySoldiers(army) > 0;
}
function nearbyEnemySettlementsForArmy(army, km = 5) {
  if (!armyCanDoWarAction(army)) return [];
  const eId = armyEmpireId(army);
  return settlements.filter(s => {
    if (!s.empireId || s.empireId === eId) return false;
    const rel = relationBetween(eId, s.empireId);
    if (rel === 'allies') return false;
    return pointKmDistance(army.x, army.y, s.x, s.y) <= km;
  }).sort((a, b) => pointKmDistance(army.x, army.y, a.x, a.y) - pointKmDistance(army.x, army.y, b.x, b.y));
}
function siegeMaintained(siege) {
  if (!siege || siege.state !== 'active') return false;
  const settlement = settlementById(siege.settlementId);
  if (!settlement) return false;
  const attackers = (siege.attackerArmyIds || []).map(id => armyById(id)).filter(Boolean);
  if (!attackers.length) return false;
  return attackers.some(a => !a.route && !a.battleId && pointKmDistance(a.x, a.y, settlement.x, settlement.y) <= 5.5);
}
function transferSettlementToEmpire(settlement, newEmpireId) {
  if (!settlement || !newEmpireId) return;
  const oldEmpireId = settlement.empireId;
  empires.forEach(e => {
    ensureEmpireShape(e);
    e.settlementIds = e.settlementIds.filter(id => id !== settlement.id);
  });
  settlement.empireId = newEmpireId;
  const newEmpire = empireById(newEmpireId);
  if (newEmpire) {
    ensureEmpireShape(newEmpire);
    if (!newEmpire.settlementIds.includes(settlement.id)) newEmpire.settlementIds.push(settlement.id);
  }
  // Stationed armies of the old owner are forced into field position.
  armies.forEach(a => {
    if (a.stationedSettlementId === settlement.id && armyEmpireId(a) === oldEmpireId) {
      a.stationedSettlementId = null;
      a.encounterCooldownUntil = performance.now() + 20000;
    }
  });
}
function cancelSiege(siege, reason = 'Siege cancelled.') {
  if (!siege) return;
  siege.state = 'cancelled';
  siege.endedAt = performance.now();
  siege.result = reason;
  (siege.attackerArmyIds || []).map(id => armyById(id)).filter(Boolean).forEach(a => {
    delete a.siegeId;
    a.encounterCooldownUntil = performance.now() + 12000;
  });
  readout.textContent = reason;
  refreshWarPanel();
  refreshSelectionPanels();
  draw();
}
function completeSiege(siege) {
  if (!siege || siege.state !== 'active') return;
  const settlement = settlementById(siege.settlementId);
  const attackerEmpire = empireById(siege.attackerEmpireId);
  if (!settlement || !attackerEmpire) {
    cancelSiege(siege, 'Siege ended because its settlement or attacker empire disappeared.');
    return;
  }

  const defenderName = empireNameById(settlement.empireId);
  const foodLoot = Math.min(Math.floor(Number(settlement.economy?.supplies?.food) || 0), Math.max(80, Math.round((settlement.economy?.population?.count || 0) * 0.8)));
  const wealthLoot = Math.min(Math.floor(Number(empireById(settlement.empireId)?.wealth?.amount || 0)), Math.max(40, Math.round((settlement.economy?.population?.count || 0) * 0.18)));

  if (settlement.economy?.supplies) settlement.economy.supplies.food = Math.max(0, settlement.economy.supplies.food - foodLoot);
  const oldEmpire = empireById(settlement.empireId);
  if (oldEmpire) {
    ensureEmpireShape(oldEmpire);
    oldEmpire.wealth.amount = Math.max(0, oldEmpire.wealth.amount - wealthLoot);
  }
  ensureEmpireShape(attackerEmpire);
  attackerEmpire.wealth.amount += wealthLoot;

  const attackers = (siege.attackerArmyIds || []).map(id => armyById(id)).filter(Boolean);
  const perArmyFood = attackers.length ? Math.floor(foodLoot / attackers.length) : 0;
  attackers.forEach(a => {
    ensureArmyLogisticsIfAvailable(a);
    a.foodStorage = (Number(a.foodStorage) || 0) + perArmyFood;
    delete a.siegeId;
    a.stationedSettlementId = settlement.id;
    a.route = null;
  });

  transferSettlementToEmpire(settlement, siege.attackerEmpireId);
  siege.state = 'completed';
  siege.endedAt = performance.now();
  siege.result = `${settlement.name} conquered from ${defenderName} by ${attackerEmpire.name}.`;
  readout.textContent = `${siege.result} Loot: ${foodLoot} food and ${wealthLoot} wealth.`;
  refreshWarPanel();
  refreshEmpirePanels();
  refreshSelectionPanels();
  draw();
}
function ensureArmyLogisticsIfAvailable(army) {
  if (!army) return;
  if (typeof ensureArmyLogistics === 'function') ensureArmyLogistics(army);
  else if (army.foodStorage === undefined) army.foodStorage = 0;
}
function startSiegeWithSelectedArmy(settlementId) {
  const army = armyById(selectedArmyId);
  const settlement = settlementById(settlementId);
  if (!armyCanDoWarAction(army) || !settlement) return;
  if (activeSiegeForSettlement(settlement.id)) { alert('This settlement is already under siege.'); return; }
  const attackerEmpireId = armyEmpireId(army);
  if (!attackerEmpireId || attackerEmpireId === settlement.empireId) return;
  const minutes = Math.max(0.25, Number(prompt('Real-life siege duration in minutes:', '10')) || 10);
  const now = performance.now();

  const siege = {
    id: generateId('siege'),
    state: 'active',
    settlementId: settlement.id,
    attackerEmpireId,
    defenderEmpireId: settlement.empireId,
    attackerArmyIds: [army.id],
    startTime: now,
    endTime: now + minutes * 60 * 1000,
    durationMs: minutes * 60 * 1000,
    result: ''
  };
  sieges.push(siege);
  army.siegeId = siege.id;
  army.route = null;
  army.stationedSettlementId = null;
  readout.textContent = `${army.name} started a siege of ${settlement.name}. Defenders have ${minutes.toFixed(1)} real minutes.`;
  refreshWarPanel();
  refreshSelectionPanels();
  draw();
}
function raidSettlementWithSelectedArmy(settlementId) {
  const army = armyById(selectedArmyId);
  const settlement = settlementById(settlementId);
  if (!armyCanDoWarAction(army) || !settlement) return;
  const attackerEmpireId = armyEmpireId(army);
  if (!attackerEmpireId || attackerEmpireId === settlement.empireId) return;
  ensureSettlementEconomy(settlement);
  ensureArmyLogisticsIfAvailable(army);

  const soldiers = Math.max(1, totalArmySoldiers(army));
  const maxFoodLoot = Math.max(25, Math.round(soldiers * 0.22));
  const maxWealthLoot = Math.max(10, Math.round(soldiers * 0.07));

  const foodLoot = Math.min(Math.floor(settlement.economy.supplies.food || 0), maxFoodLoot);
  const defenderEmpire = empireById(settlement.empireId);
  const attackerEmpire = empireById(attackerEmpireId);
  const wealthLoot = Math.min(Math.floor(defenderEmpire?.wealth?.amount || 0), maxWealthLoot);

  settlement.economy.supplies.food = Math.max(0, settlement.economy.supplies.food - foodLoot);
  if (defenderEmpire) defenderEmpire.wealth.amount = Math.max(0, defenderEmpire.wealth.amount - wealthLoot);
  if (attackerEmpire) attackerEmpire.wealth.amount += wealthLoot;
  army.foodStorage = (Number(army.foodStorage) || 0) + foodLoot;

  const popLoss = Math.min(settlement.economy.population.count || 0, Math.max(1, Math.round((settlement.economy.population.count || 0) * 0.012)));
  settlement.economy.population.count = Math.max(0, settlement.economy.population.count - popLoss);
  settlement.economy.lastReport = `Raid damage: -${foodLoot} food, -${popLoss} population.`;

  raidLog.unshift({
    id: generateId('raid'),
    when: new Date().toLocaleString(),
    text: `${army.name} raided ${settlement.name}: stole ${foodLoot} food and ${wealthLoot} wealth.`
  });
  raidLog = raidLog.slice(0, 40);

  readout.textContent = `${army.name} raided ${settlement.name}, stole ${foodLoot} food and ${wealthLoot} wealth, then retreated.`;
  routeArmyHome(army);
  refreshWarPanel();
  refreshEmpirePanels();
  refreshSelectionPanels();
  draw();
}

function updateSieges(now) {
  let changed = false;
  sieges.forEach(siege => {
    if (siege.state !== 'active') return;
    const settlement = settlementById(siege.settlementId);
    if (!settlement) {
      siege.state = 'cancelled';
      siege.result = 'Settlement disappeared.';
      changed = true;
      return;
    }
    if (!siegeMaintained(siege)) {
      siege.state = 'broken';
      siege.endedAt = now;
      siege.result = `Siege of ${settlement.name} was broken.`;
      (siege.attackerArmyIds || []).map(id => armyById(id)).filter(Boolean).forEach(a => delete a.siegeId);
      changed = true;
      return;
    }
    if (now >= siege.endTime) {
      completeSiege(siege);
      changed = true;
    }
  });
  if (changed) refreshWarPanel();
  return changed;
}

const V17_ORIGINAL_UPDATE_ACTIVE_BATTLE = updateActiveBattle;
updateActiveBattle = function updateActiveBattleV17(now) {
  const battleChanged = V17_ORIGINAL_UPDATE_ACTIVE_BATTLE(now);
  const siegeChanged = updateSieges(now);
  return battleChanged || siegeChanged;
};

function splitLootAcrossArmies(armyIds, foodLoot) {
  const live = armyIds.map(id => armyById(id)).filter(Boolean).filter(a => !isShipGroup(a));
  if (!live.length || foodLoot <= 0) return;
  const per = Math.floor(foodLoot / live.length);
  live.forEach(a => {
    ensureArmyLogisticsIfAvailable(a);
    a.foodStorage = (Number(a.foodStorage) || 0) + per;
  });
}

function postBattleSettlementLoot(winnerIds) {
  const winners = winnerIds.map(id => armyById(id)).filter(Boolean).filter(a => !isShipGroup(a));
  if (!winners.length) return { food: 0, wealth: 0, settlementName: '' };
  const leader = winners[0];
  const eId = armyEmpireId(leader);
  const nearby = settlements
    .filter(s => s.empireId && s.empireId !== eId && relationBetween(eId, s.empireId) !== 'allies')
    .filter(s => pointKmDistance(leader.x, leader.y, s.x, s.y) <= 5)
    .sort((a, b) => pointKmDistance(leader.x, leader.y, a.x, a.y) - pointKmDistance(leader.x, leader.y, b.x, b.y))[0];
  if (!nearby) return { food: 0, wealth: 0, settlementName: '' };

  ensureSettlementEconomy(nearby);
  const defenderEmpire = empireById(nearby.empireId);
  const attackerEmpire = empireById(eId);
  const winnerSoldiers = winners.reduce((sum, a) => sum + totalArmySoldiers(a), 0);
  const foodLoot = Math.min(Math.floor(nearby.economy.supplies.food || 0), Math.max(10, Math.round(winnerSoldiers * 0.08)));
  const wealthLoot = Math.min(Math.floor(defenderEmpire?.wealth?.amount || 0), Math.max(5, Math.round(winnerSoldiers * 0.025)));

  nearby.economy.supplies.food = Math.max(0, nearby.economy.supplies.food - foodLoot);
  if (defenderEmpire) defenderEmpire.wealth.amount = Math.max(0, defenderEmpire.wealth.amount - wealthLoot);
  if (attackerEmpire) attackerEmpire.wealth.amount += wealthLoot;

  const per = winners.length ? Math.floor(foodLoot / winners.length) : 0;
  winners.forEach(a => {
    ensureArmyLogisticsIfAvailable(a);
    a.foodStorage = (Number(a.foodStorage) || 0) + per;
  });
  nearby.economy.lastReport = `Post-battle loot nearby: -${foodLoot} food, -${wealthLoot} wealth.`;
  return { food: foodLoot, wealth: wealthLoot, settlementName: nearby.name };
}


const V17_ORIGINAL_FINISH_BATTLE = finishBattle;
finishBattle = function finishBattleV17(winnerSide = null, reason = 'resolved') {
  if (!activeBattle) return V17_ORIGINAL_FINISH_BATTLE(winnerSide, reason);

  const battle = activeBattle;
  const c = battleCasualties(battle, true);
  const computedWinner = winnerSide || (c.dominanceA >= 0.5 ? 'A' : 'B');
  const winnerIds = computedWinner === 'A' ? [...battle.sideA.armyIds] : [...battle.sideB.armyIds];
  const loserIds = computedWinner === 'A' ? [...battle.sideB.armyIds] : [...battle.sideA.armyIds];

  let foodLoot = 0;
  loserIds.map(id => armyById(id)).filter(Boolean).forEach(a => {
    if (!isShipGroup(a)) {
      foodLoot += Math.floor(Number(a.foodStorage) || 0);
      a.foodStorage = 0;
    } else if (a.cargoUnits) {
      foodLoot += Math.round(cargoSoldierCount(a) * 0.04);
    }
  });

  V17_ORIGINAL_FINISH_BATTLE(winnerSide, reason);

  if (foodLoot > 0) {
    splitLootAcrossArmies(winnerIds, foodLoot);
    readout.textContent += ` Battle loot: winners captured ${foodLoot} food from defeated forces.`;
  }

  const settlementLoot = postBattleSettlementLoot(winnerIds);
  if (settlementLoot.food || settlementLoot.wealth) {
    readout.textContent += ` Nearby settlement loot from ${settlementLoot.settlementName}: ${settlementLoot.food} food, ${settlementLoot.wealth} wealth.`;
  }

  // If a battle removed the attackers around a siege, update it immediately.
  updateSieges(performance.now());
  refreshWarPanel();
  refreshSelectionPanels();
};

function siegeTimeLeftText(siege) {
  if (siege.state !== 'active') return siege.result || siege.state;
  const ms = Math.max(0, siege.endTime - performance.now());
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')} remaining`;
}
function renderWarPanelHTML() {
  const active = sieges.filter(s => s.state === 'active');
  const history = [...sieges.filter(s => s.state !== 'active').slice(-8).reverse(), ...raidLog.slice(0, 6).map(r => ({ state: 'raid', result: r.text, when: r.when }))];

  const activeHtml = active.length ? active.map(s => {
    const settlement = settlementById(s.settlementId);
    const attackers = (s.attackerArmyIds || []).map(id => armyById(id)?.name).filter(Boolean).join(', ');
    return `
      <div class="heroCard">
        <strong>Siege of ${settlement?.name || 'missing settlement'}</strong>
        <div class="subtleLine">${empireNameById(s.attackerEmpireId)} attacking ${empireNameById(s.defenderEmpireId)}</div>
        <div class="subtleLine">Attackers: ${attackers || 'none'} · ${siegeTimeLeftText(s)}</div>
        <button class="cancelSiegeBtn" data-siege-id="${s.id}">Cancel/break siege</button>
      </div>
    `;
  }).join('') : '<div class="subtleLine">No active sieges.</div>';

  const historyHtml = history.length ? history.map(h => `<li>${h.result || h.state}</li>`).join('') : '<li>No raids/siege history yet.</li>';

  return `
    <div class="empireSectionTitle">Active sieges</div>
    ${activeHtml}
    <div class="empireSectionTitle">Recent raids / siege history</div>
    <ul>${historyHtml}</ul>
  `;
}
function refreshWarPanel() {
  const panel = document.getElementById('warPanel');
  if (!panel) return;
  panel.innerHTML = renderWarPanelHTML();
  panel.querySelectorAll('.cancelSiegeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const siege = siegeById(btn.dataset.siegeId);
      if (siege) cancelSiege(siege, `Siege of ${settlementById(siege.settlementId)?.name || 'settlement'} was manually broken.`);
    });
  });
}

const V17_ORIGINAL_REFRESH_SELECTION_PANELS = refreshSelectionPanels;
refreshSelectionPanels = function refreshSelectionPanelsV17() {
  V17_ORIGINAL_REFRESH_SELECTION_PANELS();
  const army = armyById(selectedArmyId);
  if (!armyCanDoWarAction(army)) return;

  const targets = nearbyEnemySettlementsForArmy(army, 5);
  if (!targets.length) {
    selectedArmyInfo.insertAdjacentHTML('beforeend', `
      <div class="armyEditor">
        <strong>War actions</strong>
        <div class="subtleLine">No enemy settlement within 5 km for raiding or siege.</div>
      </div>
    `);
    return;
  }

  selectedArmyInfo.insertAdjacentHTML('beforeend', `
    <div class="armyEditor">
      <strong>War actions</strong>
      <div class="subtleLine">Choose a nearby enemy settlement to raid or siege.</div>
      <div class="row">
        <select id="warActionSettlementSelect">
          ${targets.map(s => `<option value="${s.id}">${settlementIcon(s.type)} ${s.name} — ${empireNameById(s.empireId)} · ${pointKmDistance(army.x, army.y, s.x, s.y).toFixed(1)} km</option>`).join('')}
        </select>
      </div>
      <div class="row">
        <button id="raidSettlementBtn">Raid settlement</button>
        <button id="startSiegeBtn">Start timed siege</button>
      </div>
      <div class="subtleLine">Raid steals food/wealth and retreats. Siege conquers if the real-life timer expires.</div>
    </div>
  `);

  selectedArmyInfo.querySelector('#raidSettlementBtn')?.addEventListener('click', () => {
    const target = selectedArmyInfo.querySelector('#warActionSettlementSelect')?.value;
    if (target && confirm('Raid this settlement? The army will steal supplies and retreat home.')) raidSettlementWithSelectedArmy(target);
  });
  selectedArmyInfo.querySelector('#startSiegeBtn')?.addEventListener('click', () => {
    const target = selectedArmyInfo.querySelector('#warActionSettlementSelect')?.value;
    if (target) startSiegeWithSelectedArmy(target);
  });
};

function drawSiegeMarkers() {
  if (!ready) return;
  ctx.save();
  sieges.filter(s => s.state === 'active').forEach(siege => {
    const settlement = settlementById(siege.settlementId);
    if (!settlement) return;
    const p = worldToScreen(settlement.x, settlement.y);
    const pulse = 0.5 + Math.sin(performance.now() / 450) * 0.5;
    ctx.strokeStyle = `rgba(210,40,35,${0.55 + pulse * 0.30})`;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22 * dpr + pulse * 6 * dpr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(14,19,25,0.86)';
    roundRect(ctx, p.x + 12 * dpr, p.y - 34 * dpr, 128 * dpr, 24 * dpr, 8 * dpr);
    ctx.fill();
    ctx.fillStyle = '#ffe2e2';
    ctx.font = `${12 * dpr}px Arial`;
    ctx.fillText(`Siege ${siegeTimeLeftText(siege)}`, p.x + 20 * dpr, p.y - 27 * dpr);
  });
  ctx.restore();
}

const V17_ORIGINAL_DRAW = draw;
draw = function drawV17Sieges() {
  V17_ORIGINAL_DRAW();
  drawSiegeMarkers();
};

const V17_ORIGINAL_BUILD_EXPORT_STATE = buildExportState;
buildExportState = function buildExportStateV17() {
  const state = V17_ORIGINAL_BUILD_EXPORT_STATE();
  const now = performance.now();
  state.sieges = sieges.map(s => s.state === 'active' ? { ...s, remainingMs: Math.max(0, s.endTime - now) } : { ...s });
  state.raidLog = raidLog;
  return state;
};

const V17_ORIGINAL_IMPORT_CAMPAIGN_STATE = importCampaignState;
importCampaignState = function importCampaignStateV17(state) {
  V17_ORIGINAL_IMPORT_CAMPAIGN_STATE(state);
  const now = performance.now();
  sieges = (state.sieges || []).map(s => {
    if (s.state === 'active' && typeof s.remainingMs === 'number') {
      return { ...s, startTime: now, endTime: now + s.remainingMs };
    }
    return s;
  });
  raidLog = state.raidLog || [];
  refreshWarPanel();
  draw();
};

function bindV17WarMenus() {
  document.getElementById('menuWarBtn')?.addEventListener('click', () => { setActiveMenu('war'); refreshWarPanel(); });
}
bindV17WarMenus();
refreshWarPanel();
