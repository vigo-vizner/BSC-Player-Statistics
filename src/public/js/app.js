/* ── SSE live sync ───────────────────────────────────────────────────────── */
(function initSSE() {
  const matchId = window._matchId;
  if (!matchId) return; // not on a live match page

  const dot = document.getElementById('sync-dot');
  let es;

  function setDot(on) {
    if (!dot) return;
    dot.classList.toggle('sync-dot--on',  on);
    dot.classList.toggle('sync-dot--off', !on);
  }

  function connect() {
    es = new EventSource(`/match/${matchId}/events`);

    es.addEventListener('open', () => setDot(true));

    es.addEventListener('error', () => {
      setDot(false);
      es.close();
      // Reconnect after 3 s
      setTimeout(connect, 3000);
    });

    // Another device recorded a stat
    es.addEventListener('stat', (e) => {
      const data = JSON.parse(e.data);
      applyPlayerUpdate(data);
      if (data.last_player_name && data.last_stat_label) {
        updateUndoBar(data.last_player_name, data.last_stat_label, true);
      }
    });

    // Another device hit undo
    es.addEventListener('undo', (e) => {
      const data = JSON.parse(e.data);
      applyUndoUpdate(data);
    });

    // Match was closed — reload so the page shows the closed state
    es.addEventListener('closed', () => {
      es.close();
      window.location.reload();
    });
  }

  connect();
})();

/** Update all stat buttons (table row + accordion) for a player. */
function updateStatButtons(pid, counts) {
  Object.keys(counts).forEach(st => {
    // Desktop table button
    const tb = document.querySelector(`.stat-btn:not(.accord-btn)[data-player="${pid}"][data-stat="${st}"]`);
    if (tb) {
      tb.textContent = counts[st] > 0 ? counts[st] : '+';
      tb.classList.toggle('has-val', counts[st] > 0);
    }
    // Accordion button
    const ab = document.querySelector(`.accord-btn[data-player="${pid}"][data-stat="${st}"]`);
    if (ab) {
      const countEl = ab.querySelector('.accord-count');
      if (countEl) countEl.textContent = counts[st] > 0 ? counts[st] : '+';
      ab.classList.toggle('has-val', counts[st] > 0);
    }
  });
}

/** Apply a stat/player update to the DOM (used by both local tap AND SSE). */
function applyPlayerUpdate(data) {
  updateStatButtons(data.player_id, data.counts || {});
  const ptsCell = document.getElementById(`pts-${data.player_id}`);
  if (ptsCell) ptsCell.textContent = data.points;
}

/** Apply an undo update to the DOM. */
function applyUndoUpdate(data) {
  const pid = data.undone_player_id;
  updateStatButtons(pid, data.counts || {});
  const ptsCell = document.getElementById(`pts-${pid}`);
  if (ptsCell) ptsCell.textContent = data.points;

  if (data.new_last) {
    updateUndoBar(data.new_last.player_name, data.new_last.stat_label, true);
  } else {
    updateUndoBar(null, null, false);
  }
}

/** Update the undo bar text and button state. */
function updateUndoBar(playerName, statLabel, hasStats) {
  const undoInfo = document.getElementById('undo-info');
  const undoBtn  = document.getElementById('undo-btn');
  if (undoInfo) {
    undoInfo.innerHTML = hasStats && playerName
      ? `Last: <strong>${escHtml(playerName)}</strong> — ${escHtml(statLabel)}`
      : (undoInfo.dataset.emptyLabel || 'No stats recorded yet');
  }
  if (undoBtn) undoBtn.disabled = !hasStats;
}

/* ── Live match stat buttons ─────────────────────────────────────────────── */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.stat-btn');
  if (!btn) return;

  const matchId  = btn.dataset.match;
  const playerId = btn.dataset.player;
  const statType = btn.dataset.stat;

  btn.disabled = true;

  try {
    const res  = await fetch(`/match/${matchId}/stat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId, stat_type: statType }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'error');

    // Update DOM for this player (shared helper also used by SSE)
    applyPlayerUpdate(data);

    // Flash the tapped button
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 300);

    // Update undo bar
    if (data.last_player_name) updateUndoBar(data.last_player_name, data.last_stat_label, true);

    showToast(`+${escHtml(data.last_stat_label)} — ${escHtml(data.last_player_name)}`);
  } catch (err) {
    showToast('Error — please retry', true);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

/* ── Undo last stat ──────────────────────────────────────────────────────── */
async function undoLast(matchId) {
  try {
    const res  = await fetch(`/match/${matchId}/undo`, { method: 'POST' });
    const data = await res.json();
    if (!data.ok) { showToast(data.message || 'Nothing to undo'); return; }

    // Update DOM (shared helper also used by SSE)
    applyUndoUpdate(data);
    showToast('Undone ✓');
  } catch (err) {
    showToast('Error — please retry', true);
    console.error(err);
  }
}

/* ── Accordion expand/collapse (mobile live match) ───────────────────────── */
(function initAccordion() {
  const tbody = document.getElementById('live-tbody');
  if (!tbody) return;

  let openPlayerId = null;

  function closeAccordion(pid) {
    const row = document.getElementById(`accord-row-${pid}`);
    const mainRow = document.getElementById(`player-row-${pid}`);
    if (row) row.classList.add('hidden');
    if (mainRow) mainRow.classList.remove('expanded');
    openPlayerId = null;
  }

  function openAccordion(pid) {
    if (openPlayerId !== null && openPlayerId !== pid) {
      closeAccordion(openPlayerId);
    }
    const row = document.getElementById(`accord-row-${pid}`);
    const mainRow = document.getElementById(`player-row-${pid}`);
    if (!row) return;
    row.classList.remove('hidden');
    if (mainRow) mainRow.classList.add('expanded');
    openPlayerId = pid;
  }

  tbody.addEventListener('click', e => {
    // Don't trigger accordion when tapping stat buttons or pin button
    if (e.target.closest('.stat-btn') || e.target.closest('.pin-btn')) return;

    // Trigger from anywhere on the main player row (name, PTS cell, row itself)
    const mainRow = e.target.closest('.player-main-row');
    if (!mainRow) return;

    const pid = parseInt(mainRow.dataset.playerId, 10);
    if (openPlayerId === pid) {
      closeAccordion(pid);
    } else {
      openAccordion(pid);
    }
  });

  // Expose so pin re-sort can keep accordion state
  window._accordionOpen = () => openPlayerId;
  window._accordionClose = closeAccordion;
})();

/* ── Pin player to top (localStorage per device) ─────────────────────────── */
(function initPinPlayers() {
  const tbody = document.getElementById('live-tbody');
  if (!tbody) return;

  const matchId = window._matchId;
  const STORE_KEY = matchId ? `bsc_pin_${matchId}` : 'bsc_pin_global';

  // Load pinned set from localStorage
  function loadPinned() {
    try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]')); }
    catch (_) { return new Set(); }
  }
  function savePinned(set) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch (_) {}
  }

  let pinned = loadPinned();

  // Apply pinned state to all pin buttons and rows
  function applyPinState() {
    document.querySelectorAll('.pin-btn').forEach(btn => {
      const pid = String(btn.dataset.playerId);
      const isPinned = pinned.has(pid);
      btn.textContent = isPinned ? '★' : '☆';
      btn.classList.toggle('pinned', isPinned);
      const mainRow = document.getElementById(`player-row-${pid}`);
      if (mainRow) mainRow.classList.toggle('pinned-row', isPinned);
    });
  }

  // Re-sort tbody: pinned rows first (preserve server order within each group)
  function sortRows() {
    const allMainRows = [...tbody.querySelectorAll('.player-main-row')];
    const pinnedRows  = allMainRows.filter(r => pinned.has(String(r.dataset.playerId)));
    const otherRows   = allMainRows.filter(r => !pinned.has(String(r.dataset.playerId)));

    // For each main row, also grab its accordion row (immediately follows it)
    function getAccordRow(mainRow) {
      const pid = mainRow.dataset.playerId;
      return document.getElementById(`accord-row-${pid}`);
    }

    // Re-insert in order: pinned first, then rest
    [...pinnedRows, ...otherRows].forEach(mainRow => {
      tbody.appendChild(mainRow);
      const acc = getAccordRow(mainRow);
      if (acc) tbody.appendChild(acc);
    });
  }

  // Initial render
  applyPinState();
  sortRows();

  // Handle pin button clicks
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.pin-btn');
    if (!btn) return;

    const pid = String(btn.dataset.playerId);

    // Close accordion for this player before re-sorting if it's open
    if (window._accordionClose && window._accordionOpen && window._accordionOpen() === parseInt(pid, 10)) {
      window._accordionClose(parseInt(pid, 10));
    }

    if (pinned.has(pid)) {
      pinned.delete(pid);
    } else {
      pinned.add(pid);
    }
    savePinned(pinned);
    applyPinState();
    sortRows();
  });
})();

/* ── Admin tab switching ─────────────────────────────────────────────────── */
(function initAdminTabs() {
  const bar = document.getElementById('admin-tabs');
  if (!bar) return;

  function showTab(name) {
    bar.querySelectorAll('.admin-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });
    document.querySelectorAll('.admin-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${name}`);
    });
    // Keep URL in sync so refresh lands on the same tab
    const url = new URL(window.location);
    url.searchParams.set('tab', name);
    history.replaceState(null, '', url);
    window._adminTab = name;
  }

  bar.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab');
    if (btn) showTab(btn.dataset.tab);
  });
})();

/* ── Admin modals ────────────────────────────────────────────────────────── */
function _tabQ() {
  const t = window._adminTab || 'players';
  return `?tab=${t}`;
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('modal-overlay').classList.add('hidden');
}
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('modal-overlay')?.classList.add('hidden');
}

function openAddCategory() {
  document.getElementById('form-category').action = '/admin/category/add' + _tabQ();
  document.getElementById('category-id').value = '';
  document.getElementById('category-name').value = '';
  document.getElementById('category-sort').value = '0';
  openModal('modal-category');
}
function openEditCategory(id, name, sort) {
  document.getElementById('form-category').action = `/admin/category/${id}/edit` + _tabQ();
  document.getElementById('category-id').value = id;
  document.getElementById('category-name').value = name;
  document.getElementById('category-sort').value = sort;
  openModal('modal-category');
}

function openAddPlayer() {
  document.getElementById('form-player').action = '/admin/player/add' + _tabQ();
  document.getElementById('player-id').value = '';
  document.getElementById('player-name').value = '';
  document.getElementById('player-number').value = '';
  // deselect all options in multi-select
  Array.from(document.getElementById('player-categories').options).forEach(o => o.selected = false);
  document.getElementById('player-active-wrap').style.display = 'none';
  openModal('modal-player');
}
function openEditPlayer(id, name, number, active, categoryIds) {
  document.getElementById('form-player').action = `/admin/player/${id}/edit` + _tabQ();
  document.getElementById('player-id').value = id;
  document.getElementById('player-name').value = name;
  document.getElementById('player-number').value = number;
  // categoryIds is a JSON array like [1,3]
  const ids = (typeof categoryIds === 'string' ? JSON.parse(categoryIds) : (categoryIds || [])).map(String);
  Array.from(document.getElementById('player-categories').options).forEach(o => {
    o.selected = ids.includes(o.value);
  });
  document.getElementById('player-active').checked = !!active;
  document.getElementById('player-active-wrap').style.display = 'flex';
  openModal('modal-player');
}

function openAddSeason() {
  document.getElementById('form-season').action = '/admin/season/add' + _tabQ();
  document.getElementById('season-id').value = '';
  document.getElementById('season-name').value = '';
  document.getElementById('season-category').value = '';
  openModal('modal-season');
}
function openEditSeason(id, name, categoryId) {
  document.getElementById('form-season').action = `/admin/season/${id}/edit` + _tabQ();
  document.getElementById('season-id').value = id;
  document.getElementById('season-name').value = name;
  document.getElementById('season-category').value = categoryId || '';
  openModal('modal-season');
}

function openAddMatch(seasonId) {
  document.getElementById('form-match').action = '/admin/match/add' + _tabQ();
  document.getElementById('match-id').value = '';
  document.getElementById('match-season-id').value = seasonId;
  document.getElementById('match-opponent').value = '';
  document.getElementById('match-date').valueAsDate = new Date();
  document.getElementById('match-location').value = '';
  openModal('modal-match');
}
function openEditMatch(id, opponent, date, location) {
  document.getElementById('form-match').action = `/admin/match/${id}/edit` + _tabQ();
  document.getElementById('match-id').value = id;
  document.getElementById('match-opponent').value = opponent;
  document.getElementById('match-date').value = date;
  document.getElementById('match-location').value = location;
  openModal('modal-match');
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.background = isError ? '#dc2626' : '#1c2333';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
