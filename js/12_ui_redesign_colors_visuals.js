// 12_ui_redesign_colors_visuals.js
// V18: UI redesign support, empire colors, better selection behavior, event management,
// and settlement visual footprints on zoom.

const V18_EMPIRE_COLORS = [
  '#4f8cff', '#e85d5d', '#5bc77a', '#e0b94f', '#b174ff',
  '#36c2c2', '#ff8f3d', '#ff6fb3', '#9fd15c', '#7f95ff',
  '#d783ff', '#52a47d', '#c69048', '#de4f8f'
];

let eventsEnabled = true;

function v18HashColor(seed) {
  let h = 0;
  String(seed || '').split('').forEach(ch => h = ((h << 5) - h + ch.charCodeAt(0)) | 0);
  const idx = Math.abs(h) % V18_EMPIRE_COLORS.length;
  return V18_EMPIRE_COLORS[idx];
}

function ensureEmpireColor(empire) {
  if (!empire) return '#7a8792';
  if (!empire.color) {
    const used = new Set(empires.map(e => e.color).filter(Boolean));
    empire.color = V18_EMPIRE_COLORS.find(c => !used.has(c)) || v18HashColor(empire.id || empire.name);
  }
  return empire.color;
}

function empireColorById(id) {
  const e = empireById(id);
  return e ? ensureEmpireColor(e) : '#7a8792';
}

function settlementColor(s) {
  return s?.empireId ? empireColorById(s.empireId) : '#9aa4ad';
}

function armyColor(a) {
  const s = settlementById(a?.homeSettlementId || a?.stationedSettlementId);
  if (s?.empireId) return empireColorById(s.empireId);
  const eId = typeof armyEmpireId === 'function' ? armyEmpireId(a) : null;
  return eId ? empireColorById(eId) : '#3a5ecf';
}

function v18Lighten(hex, amount = 0.25) {
  const h = String(hex || '#777777').replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

function v18Darken(hex, amount = 0.35) {
  const h = String(hex || '#777777').replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

function v18OrganizeTopUI() {
  const inner = document.querySelector('#ui .inner');
  if (!inner || inner.dataset.v18Organized) return;
  inner.dataset.v18Organized = '1';

  const h1 = inner.querySelector('h1');
  const rows = Array.from(inner.children).filter(el => el.classList?.contains('row'));
  const readoutEl = document.getElementById('readout');
  const menuTabs = inner.querySelector('.menuTabs');

  const topBar = document.createElement('div');
  topBar.className = 'topBar';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'titleWrap';
  if (h1) titleWrap.appendChild(h1);

  const modeWrap = document.createElement('div');
  modeWrap.className = 'modeActions';
  if (rows[1]) {
    while (rows[1].firstChild) modeWrap.appendChild(rows[1].firstChild);
    rows[1].remove();
  }

  const actionWrap = document.createElement('div');
  actionWrap.className = 'topActions';
  if (rows[0]) {
    while (rows[0].firstChild) actionWrap.appendChild(rows[0].firstChild);
    rows[0].remove();
  }
  if (rows[2]) {
    while (rows[2].firstChild) actionWrap.appendChild(rows[2].firstChild);
    rows[2].remove();
  }

  topBar.appendChild(titleWrap);
  topBar.appendChild(modeWrap);
  topBar.appendChild(actionWrap);

  inner.insertBefore(topBar, inner.firstChild);
  if (readoutEl) topBar.appendChild(readoutEl);
  if (menuTabs) inner.insertBefore(menuTabs, topBar.nextSibling);

  // Start with a cleaner active menu. Armies is still accessible, but the top HUD does not cover the side.
  try { if (typeof setActiveMenu === 'function') setActiveMenu('armies'); } catch {}
}

function v18EnhanceEmpirePanels() {
  empires.forEach(ensureEmpireColor);

  // Add color picker to selected empire panel if present.
  const panel = document.getElementById('selectedEmpirePanel');
  const e = empireById(selectedEmpireId);
  if (panel && e && !panel.querySelector('#v18EmpireColorInput')) {
    const color = ensureEmpireColor(e);
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <label>Empire color</label>
      <input id="v18EmpireColorInput" type="color" value="${color}">
    `;
    panel.insertBefore(row, panel.firstChild);
    row.querySelector('input').addEventListener('input', ev => {
      e.color = ev.target.value;
      refreshEmpirePanels();
      refreshSelectionPanels();
      draw();
    });
  }

  // Color dots in empire list.
  const empireItems = document.querySelectorAll('#empireList .clickableListItem');
  empireItems.forEach((li, i) => {
    const e = empires[i];
    if (!e || li.querySelector('.empireColorDot')) return;
    const dot = document.createElement('span');
    dot.className = 'empireColorDot';
    dot.style.background = ensureEmpireColor(e);
    li.prepend(dot);
  });
}

const V18_ORIGINAL_CREATE_DEFAULT_EMPIRE = createDefaultEmpire;
createDefaultEmpire = function createDefaultEmpireV18(name) {
  const e = V18_ORIGINAL_CREATE_DEFAULT_EMPIRE(name);
  ensureEmpireColor(e);
  return e;
};

const V18_ORIGINAL_ENSURE_EMPIRE_SHAPE = ensureEmpireShape;
ensureEmpireShape = function ensureEmpireShapeV18(e) {
  V18_ORIGINAL_ENSURE_EMPIRE_SHAPE(e);
  ensureEmpireColor(e);
};

const V18_ORIGINAL_SELECT_SETTLEMENT = selectSettlement;
selectSettlement = function selectSettlementV18(id) {
  const s = settlementById(id);
  V18_ORIGINAL_SELECT_SETTLEMENT(id);
  if (s && s.empireId) {
    selectedEmpireId = s.empireId;
    if (typeof setActiveMenu === 'function') setActiveMenu('armies');
    refreshEmpirePanels();
  }
  // Keep the settlement selected after empire refresh.
  selectedSettlementId = id;
  selectedArmyId = null;
  pendingDestinationArmyId = null;
  refreshSelectionPanels();
  draw();
};

const V18_ORIGINAL_CREATE_ARMY_AT_SELECTED_SETTLEMENT = createArmyAtSelectedSettlement;
createArmyAtSelectedSettlement = function createArmyAtSelectedSettlementV18() {
  const s = settlementById(selectedSettlementId);
  if (s?.empireId) selectedEmpireId = s.empireId;
  return V18_ORIGINAL_CREATE_ARMY_AT_SELECTED_SETTLEMENT();
};

const V18_ORIGINAL_ASSIGN_SELECTED_SETTLEMENT_TO_EMPIRE = assignSelectedSettlementToEmpire;
assignSelectedSettlementToEmpire = function assignSelectedSettlementToEmpireV18() {
  V18_ORIGINAL_ASSIGN_SELECTED_SETTLEMENT_TO_EMPIRE();
  const s = settlementById(empireSettlementSelect?.value || selectedSettlementId);
  if (s?.empireId) selectedEmpireId = s.empireId;
  v18EnhanceEmpirePanels();
};

function v18SettlementVisualScale(s) {
  ensureSettlementEconomy(s);
  const infra = Number(s.economy.infrastructure) || 0;
  const pop = Number(s.economy.population?.count) || 0;
  const fort = Number(s.economy.fortificationLevel) || 0;
  const base = s.type === 'capital' ? 9 : s.type === 'fortress' ? 7 : s.type === 'harbor' ? 7 : 5;
  return clamp(base + infra * 1.3 + Math.log10(Math.max(1, pop)) * 2 + fort * 1.3, 6, 28);
}

function v18DrawSettlementFootprint(targetCtx, p, s, scale, color) {
  ensureSettlementEconomy(s);
  const infra = Math.max(0, Number(s.economy.infrastructure) || 0);
  const pop = Math.max(1, Number(s.economy.population?.count) || 1);
  const count = clamp(Math.round(4 + infra * 2 + Math.log10(pop) * 3), 5, 26);
  const size = Math.max(3.2 * dpr * scale, Math.min(11 * dpr * scale, world.zoom * 0.85 * scale));
  const gap = size * 1.18;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const w = cols * gap;
  const h = rows * gap;
  const x0 = p.x - w / 2;
  const y0 = p.y - h / 2;

  targetCtx.save();
  targetCtx.globalAlpha = 0.96;
  targetCtx.fillStyle = 'rgba(10,14,20,0.22)';
  roundRect(targetCtx, x0 - size, y0 - size, w + size * 2, h + size * 2, size * 1.2);
  targetCtx.fill();

  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const bx = x0 + c * gap + (r % 2) * size * 0.25;
    const by = y0 + r * gap;
    targetCtx.fillStyle = i === 0 ? v18Lighten(color, 0.28) : color;
    targetCtx.strokeStyle = 'rgba(255,255,255,0.72)';
    targetCtx.lineWidth = Math.max(0.8, 1.1 * dpr * scale);

    if (s.type === 'fortress' && i < 4) {
      targetCtx.beginPath();
      targetCtx.rect(bx, by, size * 1.1, size * 1.1);
      targetCtx.fill();
      targetCtx.stroke();
    } else if (s.type === 'harbor' && i < 3) {
      targetCtx.beginPath();
      targetCtx.arc(bx + size/2, by + size/2, size * 0.55, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.stroke();
    } else {
      targetCtx.beginPath();
      targetCtx.moveTo(bx, by + size);
      targetCtx.lineTo(bx + size * 0.5, by);
      targetCtx.lineTo(bx + size, by + size);
      targetCtx.closePath();
      targetCtx.fill();
      targetCtx.stroke();
    }
  }

  if (s.type === 'capital') {
    drawStar(targetCtx, p.x, p.y - h/2 - size * 1.5, size * 1.15, size * 0.55, v18Lighten(color, 0.45), v18Darken(color, 0.55), Math.max(1, dpr * scale));
  }
  targetCtx.restore();
}

drawSettlements = function drawSettlementsV18(targetCtx, transformer, scale, labelMode = 'auto') {
  targetCtx.save();
  targetCtx.font = `${12 * dpr * scale}px Arial`;
  targetCtx.textBaseline = 'top';

  settlements.forEach(s => {
    const p = transformer(s.x, s.y);
    if (p.x < -160 || p.y < -160 || p.x > targetCtx.canvas.width + 160 || p.y > targetCtx.canvas.height + 160) return;

    const color = settlementColor(s);
    const footprint = v18SettlementVisualScale(s);
    const showFootprint = labelMode === 'all' || world.zoom > 2.25 * dpr;
    if (showFootprint) v18DrawSettlementFootprint(targetCtx, p, s, scale, color);

    if (s.type === 'capital') {
      drawStar(targetCtx, p.x, p.y, 8 * dpr * scale, 4 * dpr * scale, v18Lighten(color, 0.25), v18Darken(color, 0.55), 1.5 * dpr * scale);
    } else if (s.type === 'fortress') {
      const r = 7.2 * dpr * scale;
      targetCtx.beginPath();
      targetCtx.moveTo(p.x, p.y - r);
      targetCtx.lineTo(p.x + r, p.y);
      targetCtx.lineTo(p.x, p.y + r);
      targetCtx.lineTo(p.x - r, p.y);
      targetCtx.closePath();
      targetCtx.fillStyle = color;
      targetCtx.fill();
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = 1.8 * dpr * scale;
      targetCtx.stroke();
    } else if (s.type === 'harbor') {
      const r = 7 * dpr * scale;
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      targetCtx.fillStyle = color;
      targetCtx.fill();
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = 1.8 * dpr * scale;
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.moveTo(p.x, p.y - r * 0.72);
      targetCtx.lineTo(p.x, p.y + r * 0.55);
      targetCtx.moveTo(p.x - r * 0.55, p.y + r * 0.12);
      targetCtx.quadraticCurveTo(p.x, p.y + r * 0.82, p.x + r * 0.55, p.y + r * 0.12);
      targetCtx.strokeStyle = v18Darken(color, 0.65);
      targetCtx.lineWidth = 1.4 * dpr * scale;
      targetCtx.stroke();
    } else {
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, 5.2 * dpr * scale, 0, Math.PI * 2);
      targetCtx.fillStyle = color;
      targetCtx.fill();
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = 1.8 * dpr * scale;
      targetCtx.stroke();
    }

    const label = `${s.name} · ${Math.round(s.elevation)}m`;
    const tw = targetCtx.measureText(label).width;
    const bx = p.x + 10 * dpr * scale;
    const by = p.y - 8 * dpr * scale;
    targetCtx.fillStyle = 'rgba(14,19,25,0.82)';
    roundRect(targetCtx, bx, by, tw + 14 * dpr * scale, 20 * dpr * scale, 8 * dpr * scale);
    targetCtx.fill();
    targetCtx.fillStyle = '#eef4f8';
    targetCtx.fillText(label, bx + 7 * dpr * scale, by + 4 * dpr * scale);
  });

  targetCtx.restore();
};

drawArmies = function drawArmiesV18(targetCtx, transformer, scale, labelMode = 'auto') {
  targetCtx.save();
  targetCtx.font = `${12 * dpr * scale}px Arial`;
  targetCtx.textBaseline = 'top';

  armies.forEach(a => {
    if (!a.route) return;
    const p1 = transformer(a.x, a.y);
    const p2 = transformer(a.route.destX, a.route.destY);
    targetCtx.save();
    targetCtx.setLineDash([7 * dpr * scale, 6 * dpr * scale]);
    targetCtx.strokeStyle = isShipGroup(a) ? 'rgba(17,88,145,0.82)' : `${armyColor(a)}cc`;
    targetCtx.lineWidth = 2 * dpr * scale;
    targetCtx.beginPath();
    targetCtx.moveTo(p1.x, p1.y);
    targetCtx.lineTo(p2.x, p2.y);
    targetCtx.stroke();
    targetCtx.restore();
  });

  armies.forEach(a => {
    const p = transformer(a.x, a.y);
    if (p.x < -90 || p.y < -90 || p.x > targetCtx.canvas.width + 90 || p.y > targetCtx.canvas.height + 90) return;

    const color = armyColor(a);
    if (isShipGroup(a)) {
      const w = 17 * dpr * scale, h = 11 * dpr * scale;
      targetCtx.beginPath();
      targetCtx.moveTo(p.x - w * 0.60, p.y);
      targetCtx.quadraticCurveTo(p.x, p.y + h * 0.75, p.x + w * 0.65, p.y);
      targetCtx.lineTo(p.x + w * 0.42, p.y + h * 0.42);
      targetCtx.lineTo(p.x - w * 0.45, p.y + h * 0.42);
      targetCtx.closePath();
      targetCtx.fillStyle = a.id === selectedArmyId ? v18Lighten(color, 0.22) : color;
      targetCtx.fill();
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = 1.5 * dpr * scale;
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.moveTo(p.x, p.y - h * 0.95);
      targetCtx.lineTo(p.x, p.y + h * 0.20);
      targetCtx.strokeStyle = v18Darken(color, 0.65);
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.moveTo(p.x + 1 * dpr * scale, p.y - h * 0.88);
      targetCtx.lineTo(p.x + w * 0.42, p.y - h * 0.30);
      targetCtx.lineTo(p.x + 1 * dpr * scale, p.y - h * 0.12);
      targetCtx.closePath();
      targetCtx.fillStyle = '#f3f7fb';
      targetCtx.fill();
    } else {
      const w = 12 * dpr * scale, h = 13 * dpr * scale;
      targetCtx.beginPath();
      targetCtx.moveTo(p.x - w * 0.55, p.y + h * 0.55);
      targetCtx.lineTo(p.x - w * 0.55, p.y - h * 0.55);
      targetCtx.lineTo(p.x + w * 0.35, p.y - h * 0.28);
      targetCtx.lineTo(p.x - w * 0.55, p.y + 0.02 * h);
      targetCtx.closePath();
      targetCtx.fillStyle = a.id === selectedArmyId ? v18Lighten(color, 0.24) : color;
      targetCtx.fill();
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.lineWidth = 1.5 * dpr * scale;
      targetCtx.stroke();
      targetCtx.beginPath();
      targetCtx.moveTo(p.x - w * 0.55, p.y - h * 0.60);
      targetCtx.lineTo(p.x - w * 0.55, p.y + h * 0.70);
      targetCtx.strokeStyle = v18Darken(color, 0.65);
      targetCtx.lineWidth = 1.8 * dpr * scale;
      targetCtx.stroke();
    }

    const shouldLabel = labelMode === 'all' || a.id === selectedArmyId || world.zoom > 3.0 * dpr;
    if (shouldLabel) {
      const label = isShipGroup(a)
        ? (a.route ? `${shipLabel(a)} · ${Math.max(0, ((a.route.endTime - performance.now()) / GAME_DAY_MS)).toFixed(1)}d` : shipLabel(a))
        : (a.route ? `${a.name} · S ${armyScoreLabel(a)} · ${Math.max(0, ((a.route.endTime - performance.now()) / GAME_DAY_MS)).toFixed(1)}d` : `${a.name} · S ${armyScoreLabel(a)}`);
      const tw = targetCtx.measureText(label).width;
      const bx = p.x + 12 * dpr * scale;
      const by = p.y + 4 * dpr * scale;
      targetCtx.fillStyle = 'rgba(14,19,25,0.84)';
      roundRect(targetCtx, bx, by, tw + 14 * dpr * scale, 20 * dpr * scale, 8 * dpr * scale);
      targetCtx.fill();
      targetCtx.fillStyle = '#eef4f8';
      targetCtx.fillText(label, bx + 7 * dpr * scale, by + 4 * dpr * scale);
    }
  });
  targetCtx.restore();
};

const V18_ORIGINAL_REFRESH_EMPIRE_PANELS = refreshEmpirePanels;
refreshEmpirePanels = function refreshEmpirePanelsV18() {
  V18_ORIGINAL_REFRESH_EMPIRE_PANELS();
  v18EnhanceEmpirePanels();
};

const V18_ORIGINAL_REFRESH_SELECTION_PANELS = refreshSelectionPanels;
refreshSelectionPanels = function refreshSelectionPanelsV18() {
  V18_ORIGINAL_REFRESH_SELECTION_PANELS();
  const s = settlementById(selectedSettlementId);
  if (s?.empireId) {
    selectedEmpireId = s.empireId;
  }
};

const V18_ORIGINAL_REFRESH_EVENT_PANEL = typeof refreshEventPanel === 'function' ? refreshEventPanel : null;
refreshEventPanel = function refreshEventPanelV18() {
  if (!eventEmpireSelect || !eventLogPanel) return;
  eventEmpireSelect.innerHTML = empires.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">No empires</option>';
  eventLogPanel.innerHTML = `
    <div class="row">
      <button id="toggleEventsEnabledBtn">${eventsEnabled ? 'Disable future events' : 'Enable future events'}</button>
      <button id="clearEventLogBtn">Clear event log</button>
    </div>
    <div class="subtleLine">Status: ${eventsEnabled ? 'events enabled' : 'events disabled'}</div>
    ${
      eventLog.length
        ? eventLog.map(ev => `
          <div class="heroCard ${ev.disabled ? 'disabledEventCard' : ''}">
            <strong>${ev.eventName}${ev.disabled ? ' (disabled in log)' : ''}</strong>
            <div class="subtleLine">${ev.when}</div>
            <ul>${ev.entries.map(x => `<li>${x}</li>`).join('')}</ul>
            <div class="row">
              <button class="disableEventLogBtn" data-event-id="${ev.id}">${ev.disabled ? 'Re-enable log item' : 'Disable log item'}</button>
              <button class="deleteEventLogBtn" data-event-id="${ev.id}">Delete</button>
            </div>
          </div>
        `).join('')
        : '<div class="v18EmptyNotice">No events triggered yet.</div>'
    }
  `;

  eventLogPanel.querySelector('#toggleEventsEnabledBtn')?.addEventListener('click', () => {
    eventsEnabled = !eventsEnabled;
    refreshEventPanel();
  });
  eventLogPanel.querySelector('#clearEventLogBtn')?.addEventListener('click', () => {
    if (confirm('Clear all event history? This does not undo already-applied effects.')) {
      eventLog = [];
      refreshEventPanel();
    }
  });
  eventLogPanel.querySelectorAll('.deleteEventLogBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      eventLog = eventLog.filter(ev => ev.id !== btn.dataset.eventId);
      refreshEventPanel();
    });
  });
  eventLogPanel.querySelectorAll('.disableEventLogBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = eventLog.find(x => x.id === btn.dataset.eventId);
      if (ev) ev.disabled = !ev.disabled;
      refreshEventPanel();
    });
  });
};

const V18_ORIGINAL_TRIGGER_RANDOM_EVENT = typeof triggerRandomEvent === 'function' ? triggerRandomEvent : null;
triggerRandomEvent = function triggerRandomEventV18() {
  if (!eventsEnabled) {
    alert('Events are currently disabled. Re-enable them in the Events tab.');
    return;
  }
  if (V18_ORIGINAL_TRIGGER_RANDOM_EVENT) return V18_ORIGINAL_TRIGGER_RANDOM_EVENT();
};

const V18_ORIGINAL_BUILD_EXPORT_STATE = buildExportState;
buildExportState = function buildExportStateV18() {
  const state = V18_ORIGINAL_BUILD_EXPORT_STATE();
  state.eventsEnabled = eventsEnabled;
  empires.forEach(ensureEmpireColor);
  state.empires = empires;
  return state;
};

const V18_ORIGINAL_IMPORT_CAMPAIGN_STATE = importCampaignState;
importCampaignState = function importCampaignStateV18(state) {
  V18_ORIGINAL_IMPORT_CAMPAIGN_STATE(state);
  eventsEnabled = state.eventsEnabled !== undefined ? !!state.eventsEnabled : true;
  empires.forEach(ensureEmpireColor);
  refreshEventPanel();
  refreshEmpirePanels();
  draw();
};

function v18PostInit() {
  v18OrganizeTopUI();
  empires.forEach(ensureEmpireColor);
  v18EnhanceEmpirePanels();
  refreshEventPanel();

  // The original Events button listener was bound before this module loads.
  // Capture-phase guard lets us disable future events without touching old code.
  triggerRandomEventBtn?.addEventListener('click', ev => {
    if (!eventsEnabled) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      alert('Events are currently disabled. Re-enable them in the Events tab.');
    }
  }, true);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', v18PostInit);
} else {
  v18PostInit();
}
