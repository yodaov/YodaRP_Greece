// 09_trade_logistics_routes.js
// V15: trade routes, logistics routes, blockades, army food storage.
// Loaded after V14 systems and before init events.

let tradeRoutes = [];
let logisticsRoutes = [];
let showTradeRoutes = true;
let showLogisticsRoutes = true;

const TRADE_CONFIG = {
  caravanCost: 20,
  caravanIncome: 8,
  merchantBoatCost: 90,
  merchantBoatIncome: 18,
  blockadeKm: 2
};

function routeSettlementIds(route) {
  return (route.settlementIds || []).filter(id => settlementById(id));
}
function routeSettlements(route) {
  return routeSettlementIds(route).map(id => settlementById(id)).filter(Boolean);
}
function uniqueEmpireIdsForSettlements(setts) {
  return [...new Set(setts.map(s => s.empireId).filter(Boolean))];
}
function empiresAreRouteCompatible(empireIds) {
  for (let i = 0; i < empireIds.length; i++) {
    for (let j = i + 1; j < empireIds.length; j++) {
      if (relationBetween(empireIds[i], empireIds[j]) === 'enemies') return false;
    }
  }
  return true;
}
function hasCompletedMarket(s) {
  return !!(typeof completedBuildings === 'function' && completedBuildings(s, 'market') > 0);
}
function foodNeedPerPass(army) {
  if (!army || isShipGroup(army)) return 0;
  if (typeof armyFoodDemand === 'function') return Math.max(0, armyFoodDemand(army));
  return Math.max(0, totalArmySoldiers(army) * 0.035);
}
function armyFriendlySettlementNearby(army, km = 5) {
  const empireId = armyEmpireId(army);
  return settlements.find(s => s.empireId === empireId && pointKmDistance(army.x, army.y, s.x, s.y) <= km) || null;
}
function armyNeedsFieldSupply(army) {
  if (!army || isShipGroup(army) || army.battleId) return false;
  if (totalArmySoldiers(army) <= 0) return false;
  if (army.stationedSettlementId) return false;
  if (armyFriendlySettlementNearby(army, 5)) return false;
  return true;
}
function ensureArmyLogistics(army) {
  if (!army) return;
  if (army.foodStorage === undefined) army.foodStorage = 0;
  if (army.lastSupplyReport === undefined) army.lastSupplyReport = '';
}

const V15_ORIGINAL_LOCAL_ARMY_FOOD_DEMAND = typeof localArmyFoodDemand === 'function' ? localArmyFoodDemand : null;
localArmyFoodDemand = function localArmyFoodDemandV15(s) {
  // Field armies now consume their own food storage/logistics instead of silently draining home settlement food.
  return armies.filter(a => !isShipGroup(a) && a.stationedSettlementId === s.id && !a.route)
    .reduce((sum, a) => sum + foodNeedPerPass(a), 0);
};

function selectedOptions(select) {
  return Array.from(select?.selectedOptions || []).map(o => o.value).filter(Boolean);
}

function routeSegmentPoints(route) {
  if (route.kind === 'logistics') {
    const s = settlementById(route.sourceSettlementId);
    const a = armyById(route.armyId);
    if (!s || !a) return [];
    return [[s.x, s.y, a.x, a.y]];
  }
  const pts = routeSettlements(route).map(s => [s.x, s.y]);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  return segs;
}

function distancePointToSegmentKm(px, py, ax, ay, bx, by) {
  const x = px * KM_PER_CELL_X, y = py * KM_PER_CELL_Y;
  const x1 = ax * KM_PER_CELL_X, y1 = ay * KM_PER_CELL_Y;
  const x2 = bx * KM_PER_CELL_X, y2 = by * KM_PER_CELL_Y;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - x1) * dx + (y - y1) * dy) / len2, 0, 1);
  const qx = x1 + dx * t, qy = y1 + dy * t;
  return Math.hypot(x - qx, y - qy);
}

function routeEmpireIds(route) {
  if (route.kind === 'logistics') {
    const s = settlementById(route.sourceSettlementId);
    return s?.empireId ? [s.empireId] : [];
  }
  return uniqueEmpireIdsForSettlements(routeSettlements(route));
}

function isEnemyToAnyRouteEmpire(army, route) {
  const armyE = armyEmpireId(army);
  if (!armyE) return false;
  return routeEmpireIds(route).some(e => e && e !== armyE && relationBetween(armyE, e) === 'enemies');
}

function routeBlockedByArmy(route, army) {
  if (!army || army.route || army.battleId) return false; // "stops on top of" route
  if (route.type === 'sea' && !isShipGroup(army)) return false;
  if ((route.type === 'land' || route.kind === 'logistics') && isShipGroup(army)) return false;
  if (!isEnemyToAnyRouteEmpire(army, route)) return false;

  return routeSegmentPoints(route).some(seg => {
    return distancePointToSegmentKm(army.x, army.y, seg[0], seg[1], seg[2], seg[3]) <= TRADE_CONFIG.blockadeKm;
  });
}

function updateRouteBlockades() {
  const allRoutes = [...tradeRoutes, ...logisticsRoutes];
  allRoutes.forEach(route => {
    route.blockedBy = null;
    const blocker = armies.find(a => routeBlockedByArmy(route, a));
    if (blocker) {
      route.blocked = true;
      route.blockedBy = blocker.name;
    } else {
      route.blocked = false;
    }
  });
}

function chargeRouteCost(empireIds, cost) {
  const split = cost / Math.max(1, empireIds.length);
  for (const id of empireIds) {
    const e = empireById(id);
    if (!e) return false;
    ensureEmpireShape(e);
    if ((Number(e.wealth.amount) || 0) < split) return false;
  }
  empireIds.forEach(id => {
    const e = empireById(id);
    e.wealth.amount -= split;
  });
  return true;
}

function createLandTradeRoute() {
  const ids = selectedOptions(document.getElementById('landTradeSettlementSelect'));
  const setts = ids.map(id => settlementById(id)).filter(Boolean);
  if (setts.length < 2) { alert('Select at least 2 settlements.'); return; }
  if (!setts.every(hasCompletedMarket)) { alert('Every land trade settlement needs a completed Market.'); return; }
  const empireIds = uniqueEmpireIdsForSettlements(setts);
  if (empireIds.length < 2) { alert('Trade routes need at least 2 different empires.'); return; }
  if (!empiresAreRouteCompatible(empireIds)) { alert('Enemy empires cannot share a trade route.'); return; }

  const caravans = Math.max(1, Math.floor(Number(document.getElementById('landTradeCaravansInput')?.value) || 1));
  const cost = caravans * TRADE_CONFIG.caravanCost;
  if (!chargeRouteCost(empireIds, cost)) { alert(`Not enough wealth. Caravans cost ${cost} total, split between participating empires.`); return; }

  tradeRoutes.push({
    id: generateId('trade'),
    type: 'land',
    kind: 'trade',
    name: `Land Trade ${tradeRoutes.length + 1}`,
    settlementIds: ids,
    caravans,
    merchantBoats: 0,
    blocked: false,
    blockedBy: null,
    lastIncome: 0
  });
  readout.textContent = `Created land trade route with ${caravans} caravan${caravans === 1 ? '' : 's'}.`;
  refreshRoutesPanel();
  refreshEmpirePanels();
  draw();
}

function createSeaTradeRoute() {
  const ids = selectedOptions(document.getElementById('seaTradeHarborSelect'));
  const setts = ids.map(id => settlementById(id)).filter(Boolean);
  if (setts.length < 2) { alert('Select at least 2 harbors.'); return; }
  if (!setts.every(s => s.type === 'harbor')) { alert('Sea trade routes can only use harbors.'); return; }
  const empireIds = uniqueEmpireIdsForSettlements(setts);
  if (empireIds.length < 2) { alert('Sea trade routes need at least 2 different empires.'); return; }
  if (!empiresAreRouteCompatible(empireIds)) { alert('Enemy empires cannot share a sea trade route.'); return; }

  const merchantBoats = Math.max(1, Math.floor(Number(document.getElementById('seaTradeMerchantShipsInput')?.value) || 1));
  const cost = merchantBoats * TRADE_CONFIG.merchantBoatCost;
  if (!chargeRouteCost(empireIds, cost)) { alert(`Not enough wealth. Merchant boats cost ${cost} total, split between participating empires.`); return; }

  tradeRoutes.push({
    id: generateId('trade'),
    type: 'sea',
    kind: 'trade',
    name: `Sea Trade ${tradeRoutes.length + 1}`,
    settlementIds: ids,
    caravans: 0,
    merchantBoats,
    blocked: false,
    blockedBy: null,
    lastIncome: 0
  });
  readout.textContent = `Created sea trade route with ${merchantBoats} merchant boat${merchantBoats === 1 ? '' : 's'}.`;
  refreshRoutesPanel();
  refreshEmpirePanels();
  draw();
}

function loadFoodIntoArmy() {
  const s = settlementById(document.getElementById('foodSourceSettlementSelect')?.value);
  const a = armyById(document.getElementById('foodTargetArmySelect')?.value);
  const amount = Math.max(0, Math.floor(Number(document.getElementById('armyFoodAmountInput')?.value) || 0));
  if (!s || !a || isShipGroup(a)) { alert('Choose a land army and a source settlement.'); return; }
  ensureSettlementEconomy(s);
  ensureArmyLogistics(a);
  const moved = Math.min(amount, Math.max(0, Math.floor(s.economy.supplies.food || 0)));
  if (moved <= 0) { alert('Source settlement has no food to load.'); return; }
  s.economy.supplies.food -= moved;
  a.foodStorage += moved;
  readout.textContent = `Loaded ${moved} food into ${a.name}. It needs about ${foodNeedPerPass(a).toFixed(1)} food per pass while unsupplied.`;
  refreshRoutesPanel();
  refreshSelectionPanels();
  refreshEmpirePanels();
}

function createLogisticsRoute() {
  const s = settlementById(document.getElementById('foodSourceSettlementSelect')?.value);
  const a = armyById(document.getElementById('foodTargetArmySelect')?.value);
  if (!s || !a || isShipGroup(a)) { alert('Choose a land army and a source settlement.'); return; }
  if (a.route) { alert('Logistics routes can only be assigned to stopped armies.'); return; }
  if (!s.empireId || armyEmpireId(a) !== s.empireId) { alert('Logistics source must belong to the army’s empire.'); return; }

  logisticsRoutes = logisticsRoutes.filter(r => r.armyId !== a.id);
  logisticsRoutes.push({
    id: generateId('logistics'),
    kind: 'logistics',
    type: 'land',
    name: `Supply ${s.name} → ${a.name}`,
    sourceSettlementId: s.id,
    armyId: a.id,
    blocked: false,
    blockedBy: null,
    lastSupplied: 0
  });
  readout.textContent = `Created logistics route from ${s.name} to ${a.name}.`;
  refreshRoutesPanel();
  draw();
}

function applyTradeRouteIncome() {
  updateRouteBlockades();
  const reports = [];

  tradeRoutes.forEach(route => {
    route.lastIncome = 0;
    if (route.blocked) return;
    const setts = routeSettlements(route);
    const empireIds = uniqueEmpireIdsForSettlements(setts);
    if (!empireIds.length) return;

    const totalIncome = route.type === 'sea'
      ? (Number(route.merchantBoats) || 0) * TRADE_CONFIG.merchantBoatIncome
      : (Number(route.caravans) || 0) * TRADE_CONFIG.caravanIncome;

    const perEmpire = totalIncome / empireIds.length;
    empireIds.forEach(id => {
      const e = empireById(id);
      if (!e) return;
      ensureEmpireShape(e);
      e.wealth.amount += perEmpire;
    });
    route.lastIncome = totalIncome;
    if (totalIncome) reports.push(`${route.name} +${Math.round(totalIncome)} wealth`);
  });

  if (reports.length) readout.textContent += ` Trade: ${reports.join(' · ')}.`;
}

function removeArmySoldiersForStarvation(army, deathCount) {
  if (!army || deathCount <= 0) return;
  const u = normalizeArmyUnits(army);
  let remaining = Math.min(deathCount, totalArmySoldiers(army));
  while (remaining > 0 && totalArmySoldiers(army) > 0) {
    const biggest = UNIT_TYPES.slice().sort((a, b) => (u[b.key] || 0) - (u[a.key] || 0))[0];
    if (!biggest || !u[biggest.key]) break;
    u[biggest.key]--;
    remaining--;
  }
}

function applyArmyLogistics() {
  updateRouteBlockades();
  const routeByArmy = new Map(logisticsRoutes.map(r => [r.armyId, r]));
  const reports = [];

  armies.filter(a => !isShipGroup(a)).forEach(army => {
    ensureArmyLogistics(army);
    army.lastSupplyReport = '';

    if (!armyNeedsFieldSupply(army)) return;
    const need = foodNeedPerPass(army);
    if (need <= 0) return;

    const route = routeByArmy.get(army.id);
    let supplied = 0;
    if (route && !route.blocked) {
      const s = settlementById(route.sourceSettlementId);
      if (s) {
        ensureSettlementEconomy(s);
        supplied = Math.min(need, Math.max(0, Number(s.economy.supplies.food) || 0));
        s.economy.supplies.food -= supplied;
        route.lastSupplied = supplied;
      }
    }

    let remainingNeed = Math.max(0, need - supplied);
    if (remainingNeed > 0) {
      const used = Math.min(remainingNeed, Math.max(0, Number(army.foodStorage) || 0));
      army.foodStorage -= used;
      remainingNeed -= used;
    }

    if (remainingNeed > 0.001) {
      const shortageRatio = clamp(remainingNeed / Math.max(1, need), 0, 1);
      const deaths = Math.max(1, Math.round(totalArmySoldiers(army) * (0.02 + shortageRatio * 0.07)));
      removeArmySoldiersForStarvation(army, deaths);
      army.lastSupplyReport = `Food shortage: ${Math.round(remainingNeed)} missing, ${deaths} soldiers died.`;
      reports.push(`${army.name}: ${deaths} died from shortage`);
    } else {
      army.lastSupplyReport = `Supplied ${Math.round(need)} food. Storage: ${Math.round(army.foodStorage || 0)}.`;
    }
  });

  if (reports.length) readout.textContent += ` Logistics: ${reports.join(' · ')}.`;
}

const V15_ORIGINAL_PASS_TIME = passTime;
passTime = function passTimeV15() {
  V15_ORIGINAL_PASS_TIME();
  applyTradeRouteIncome();
  applyArmyLogistics();
  refreshRoutesPanel();
  refreshSelectionPanels();
  refreshEmpirePanels();
  draw();
};

function drawRouteLine(targetCtx, points, opts) {
  if (points.length < 2) return;
  targetCtx.save();
  targetCtx.setLineDash(opts.dash || []);
  targetCtx.strokeStyle = opts.color;
  targetCtx.lineWidth = (opts.width || 3) * dpr;
  targetCtx.beginPath();
  const p0 = worldToScreen(points[0].x, points[0].y);
  targetCtx.moveTo(p0.x, p0.y);
  for (let i = 1; i < points.length; i++) {
    const p = worldToScreen(points[i].x, points[i].y);
    targetCtx.lineTo(p.x, p.y);
  }
  targetCtx.stroke();
  targetCtx.setLineDash([]);
  targetCtx.restore();
}

function drawTradeAndLogisticsRoutes() {
  if (!ready) return;
  if (showTradeRoutes) {
    tradeRoutes.forEach(route => {
      const points = routeSettlements(route).map(s => ({ x: s.x, y: s.y }));
      drawRouteLine(ctx, points, {
        color: route.blocked ? 'rgba(225,55,55,0.88)' : route.type === 'sea' ? 'rgba(47,178,212,0.82)' : 'rgba(230,156,42,0.82)',
        width: route.blocked ? 4 : 3,
        dash: route.type === 'sea' ? [10 * dpr, 7 * dpr] : []
      });
    });
  }
  if (showLogisticsRoutes) {
    logisticsRoutes.forEach(route => {
      const s = settlementById(route.sourceSettlementId);
      const a = armyById(route.armyId);
      if (!s || !a) return;
      drawRouteLine(ctx, [{ x: s.x, y: s.y }, { x: a.x, y: a.y }], {
        color: route.blocked ? 'rgba(225,55,55,0.92)' : 'rgba(68,214,98,0.86)',
        width: 3,
        dash: [5 * dpr, 7 * dpr]
      });
    });
  }
}

const V15_ORIGINAL_DRAW = draw;
draw = function drawV15Routes() {
  V15_ORIGINAL_DRAW();
  drawTradeAndLogisticsRoutes();
};

const V15_ORIGINAL_REFRESH_SELECTION_PANELS = refreshSelectionPanels;
refreshSelectionPanels = function refreshSelectionPanelsV15() {
  V15_ORIGINAL_REFRESH_SELECTION_PANELS();
  const a = armyById(selectedArmyId);
  if (a && !isShipGroup(a)) {
    ensureArmyLogistics(a);
    const need = foodNeedPerPass(a);
    const route = logisticsRoutes.find(r => r.armyId === a.id);
    selectedArmyInfo.insertAdjacentHTML('beforeend', `
      <div class="armyEditor">
        <strong>Food logistics</strong>
        <div class="subtleLine">Storage: ${Math.round(a.foodStorage || 0)} food · Need while unsupplied: ${need.toFixed(1)} / pass.</div>
        <div class="subtleLine">${route ? `Logistics route: ${route.blocked ? 'BLOCKED by ' + route.blockedBy : 'active'}` : 'No logistics route assigned.'}</div>
        <div class="subtleLine">${a.lastSupplyReport || ''}</div>
      </div>
    `);
  }
};

function refreshRoutesPanel() {
  const landSel = document.getElementById('landTradeSettlementSelect');
  const seaSel = document.getElementById('seaTradeHarborSelect');
  const sourceSel = document.getElementById('foodSourceSettlementSelect');
  const armySel = document.getElementById('foodTargetArmySelect');
  const list = document.getElementById('routesPanelList');
  if (!landSel || !seaSel || !sourceSel || !armySel || !list) return;

  const marketSetts = settlements.filter(s => s.empireId && hasCompletedMarket(s));
  landSel.innerHTML = marketSetts.map(s => `<option value="${s.id}">${s.name} — ${empireNameById(s.empireId)}</option>`).join('');

  const harbors = settlements.filter(s => s.empireId && s.type === 'harbor');
  seaSel.innerHTML = harbors.map(s => `<option value="${s.id}">${s.name} — ${empireNameById(s.empireId)}</option>`).join('');

  sourceSel.innerHTML = settlements.filter(s => s.empireId).map(s => `<option value="${s.id}">${settlementIcon(s.type)} ${s.name} — food ${Math.round(s.economy?.supplies?.food || 0)}</option>`).join('');
  armySel.innerHTML = armies.filter(a => !isShipGroup(a)).map(a => `<option value="${a.id}">${a.name} — need ${foodNeedPerPass(a).toFixed(1)}/pass · storage ${Math.round(a.foodStorage || 0)}</option>`).join('');

  updateRouteBlockades();
  const tradeHtml = tradeRoutes.map(r => {
    const places = routeSettlements(r).map(s => s.name).join(' → ');
    const asset = r.type === 'sea' ? `${r.merchantBoats} merchant boats` : `${r.caravans} caravans`;
    return `<div class="heroCard"><strong>${r.name}</strong><div class="subtleLine">${r.type} · ${asset} · ${places}</div><div class="subtleLine">${r.blocked ? 'BLOCKED by ' + r.blockedBy : 'Active'} · last income ${Math.round(r.lastIncome || 0)}</div><button class="deleteRouteBtn" data-route-id="${r.id}" data-route-kind="trade">Delete route</button></div>`;
  }).join('');
  const logHtml = logisticsRoutes.map(r => {
    const s = settlementById(r.sourceSettlementId);
    const a = armyById(r.armyId);
    return `<div class="heroCard"><strong>${r.name}</strong><div class="subtleLine">${s?.name || 'missing'} → ${a?.name || 'missing army'}</div><div class="subtleLine">${r.blocked ? 'BLOCKED by ' + r.blockedBy : 'Active'} · last supplied ${Math.round(r.lastSupplied || 0)}</div><button class="deleteRouteBtn" data-route-id="${r.id}" data-route-kind="logistics">Delete route</button></div>`;
  }).join('');

  list.innerHTML = (tradeHtml || '') + (logHtml || '') || 'No routes yet.';
  list.querySelectorAll('.deleteRouteBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.routeKind === 'trade') tradeRoutes = tradeRoutes.filter(r => r.id !== btn.dataset.routeId);
      else logisticsRoutes = logisticsRoutes.filter(r => r.id !== btn.dataset.routeId);
      refreshRoutesPanel();
      draw();
    });
  });
}

const V15_ORIGINAL_BUILD_EXPORT_STATE = buildExportState;
buildExportState = function buildExportStateV15() {
  const state = V15_ORIGINAL_BUILD_EXPORT_STATE();
  state.tradeRoutes = tradeRoutes;
  state.logisticsRoutes = logisticsRoutes;
  state.showTradeRoutes = showTradeRoutes;
  state.showLogisticsRoutes = showLogisticsRoutes;
  return state;
};

const V15_ORIGINAL_IMPORT_CAMPAIGN_STATE = importCampaignState;
importCampaignState = function importCampaignStateV15(state) {
  V15_ORIGINAL_IMPORT_CAMPAIGN_STATE(state);
  tradeRoutes = state.tradeRoutes || [];
  logisticsRoutes = state.logisticsRoutes || [];
  showTradeRoutes = state.showTradeRoutes !== undefined ? !!state.showTradeRoutes : true;
  showLogisticsRoutes = state.showLogisticsRoutes !== undefined ? !!state.showLogisticsRoutes : true;
  const tradeToggle = document.getElementById('showTradeRoutesToggle');
  const logToggle = document.getElementById('showLogisticsRoutesToggle');
  if (tradeToggle) tradeToggle.checked = showTradeRoutes;
  if (logToggle) logToggle.checked = showLogisticsRoutes;
  refreshRoutesPanel();
  draw();
};

function bindV15RouteMenus() {
  document.getElementById('menuRoutesBtn')?.addEventListener('click', () => { setActiveMenu('routes'); refreshRoutesPanel(); });
  document.getElementById('createLandTradeRouteBtn')?.addEventListener('click', createLandTradeRoute);
  document.getElementById('createSeaTradeRouteBtn')?.addEventListener('click', createSeaTradeRoute);
  document.getElementById('loadArmyFoodBtn')?.addEventListener('click', loadFoodIntoArmy);
  document.getElementById('createLogisticsRouteBtn')?.addEventListener('click', createLogisticsRoute);
  document.getElementById('showTradeRoutesToggle')?.addEventListener('change', e => {
    showTradeRoutes = !!e.target.checked;
    draw();
  });
  document.getElementById('showLogisticsRoutesToggle')?.addEventListener('change', e => {
    showLogisticsRoutes = !!e.target.checked;
    draw();
  });
}

bindV15RouteMenus();
