/* ── i18n + fetch helpers ────────────────────────────────────────────────── */
/** Translated UI string injected by layout.js (window._i18n); falls back to the key. */
function tr(key) {
  return (window._i18n && window._i18n[key]) || key;
}

/**
 * fetch() wrapper: marks the request as a script call so an expired session
 * yields a 401 (instead of a redirect to the login page) and tells the user.
 */
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), 'X-Requested-With': 'fetch' },
  });
  if (res.status === 401) {
    showToast(tr('session_expired'), true);
    const err = new Error('session_expired');
    err.handled = true;
    throw err;
  }
  return res;
}

/* Live match behaviour (SSE sync, optimistic taps, retry queue, undo, edit mode ±) lives in live.js */

/* ── Score inputs — debounced auto-save ──────────────────────────────────── */
(function initScoreInputs() {
  const scoreboard = document.getElementById('scoreboard');
  if (!scoreboard) return;

  let _timer = null;

  function saveScore() {
    const bscInput = document.getElementById('score-bsc-input');
    const oppInput = document.getElementById('score-opp-input');
    if (!bscInput || !oppInput) return;
    const matchId = bscInput.dataset.match;
    apiFetch(`/match/${matchId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score_bsc:       parseInt(bscInput.value)  || 0,
        score_opponent:  parseInt(oppInput.value)  || 0,
      }),
    }).catch(() => {}); // silent fail — score is non-critical
  }

  scoreboard.addEventListener('input', (e) => {
    if (!e.target.classList.contains('score-input')) return;
    // Clamp to 0–999
    const v = parseInt(e.target.value) || 0;
    e.target.value = Math.min(999, Math.max(0, v));
    clearTimeout(_timer);
    _timer = setTimeout(saveScore, 600); // debounce 600ms
  });

  // Also save immediately on blur (navigating away)
  scoreboard.addEventListener('change', (e) => {
    if (!e.target.classList.contains('score-input')) return;
    clearTimeout(_timer);
    saveScore();
  });
})();

/** Update all stat buttons (table row + accordion + edit controls) for a player. */
function updateStatButtons(pid, counts) {
  Object.keys(counts).forEach(st => {
    const n = counts[st] || 0;

    // Desktop table button
    const tb = document.querySelector(`.stat-btn:not(.accord-btn)[data-player="${pid}"][data-stat="${st}"]`);
    if (tb) {
      tb.textContent = n > 0 ? n : '+';
      tb.classList.toggle('has-val', n > 0);
    }
    // Accordion normal button
    const ab = document.querySelector(`.accord-btn[data-player="${pid}"][data-stat="${st}"]`);
    if (ab) {
      const countEl = ab.querySelector('.accord-count');
      if (countEl) countEl.textContent = n > 0 ? n : '+';
      ab.classList.toggle('has-val', n > 0);
    }
    // Edit-mode count display + minus button disabled state
    const ec = document.getElementById(`edit-count-${pid}-${st}`);
    if (ec) ec.textContent = n;
    const minusBtn = document.querySelector(`.edit-btn-minus[data-player="${pid}"][data-stat="${st}"]`);
    if (minusBtn) minusBtn.disabled = n === 0;
  });
}

/** Show THIS device's own last stat in the undo bar. `my` = { player_name, stat_label } or null/undefined. */
function updateUndoBar(my) {
  const undoInfo = document.getElementById('undo-info');
  const undoBtn  = document.getElementById('undo-btn');
  const has = !!(my && my.player_name);
  if (undoInfo) {
    undoInfo.innerHTML = has
      ? `${escHtml(undoInfo.dataset.yourLabel || 'Your last')}: <strong>${escHtml(my.player_name)}</strong> — ${escHtml(my.stat_label)}`
      : escHtml(undoInfo.dataset.emptyLabel || 'Nothing to undo');
  }
  if (undoBtn) undoBtn.disabled = !has;
}

/* ── Edit mode toggle ────────────────────────────────────────────────────── */
let _editMode = false;

function toggleEditMode() {
  _editMode = !_editMode;
  const banner  = document.getElementById('edit-banner');
  const editBtn = document.getElementById('edit-mode-btn');
  const undoBar = document.getElementById('undo-bar');

  if (banner)  banner.classList.toggle('hidden', !_editMode);
  if (undoBar) undoBar.classList.toggle('hidden', _editMode);
  if (editBtn) {
    editBtn.classList.toggle('edit-active', _editMode);
    // Label is set server-side via i18n; swap between edit/exit text
    editBtn.textContent = _editMode
      ? (editBtn.dataset.exitLabel || '✏️ Exit Edit')
      : (editBtn.dataset.editLabel || '✏️ Edit');
  }

  // Switch accordion between normal and edit grids for any open player
  document.querySelectorAll('.accord-normal').forEach(g => g.classList.toggle('hidden', _editMode));
  document.querySelectorAll('.accord-edit').forEach(g => g.classList.toggle('hidden', !_editMode));
}

/* Edit mode −/+ buttons: handled in live.js */

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

/* ── Admin: data-attribute driven actions (no inline handlers carrying user text) ── */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;
  switch (d.action) {
    case 'edit-category': openEditCategory(d.id, d.name, d.sort); break;
    case 'edit-player':   openEditPlayer(d.id, d.name, d.number, d.active === '1', d.categories); break;
    case 'edit-season':   openEditSeason(d.id, d.name, d.category); break;
    case 'edit-match':    openEditMatch(d.id, d.opponent, d.date, d.location, d.type, d.tournament); break;
    case 'delete':        openDeleteConfirm(d.url, d.label); break;
  }
});

// Confirmation prompt for forms carrying data-confirm="..."
document.addEventListener('submit', e => {
  const msg = e.target.dataset && e.target.dataset.confirm;
  if (msg && !confirm(msg)) e.preventDefault();
});

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

function _setMatchType(type) {
  document.getElementById('match-type').value = type || 'league';
  document.getElementById('tournament-name-wrap').style.display =
    (type === 'tournament') ? 'flex' : 'none';
}

// Show/hide tournament name field when type select changes
document.addEventListener('change', e => {
  if (e.target.id === 'match-type') _setMatchType(e.target.value);
});

function openAddMatch(seasonId) {
  document.getElementById('form-match').action = '/admin/match/add' + _tabQ();
  document.getElementById('match-id').value = '';
  document.getElementById('match-season-id').value = seasonId;
  document.getElementById('match-opponent').value = '';
  document.getElementById('match-date').valueAsDate = new Date();
  document.getElementById('match-location').value = '';
  document.getElementById('match-tournament-name').value = '';
  _setMatchType('league');
  openModal('modal-match');
}
function openEditMatch(id, opponent, date, location, matchType, tournamentName) {
  document.getElementById('form-match').action = `/admin/match/${id}/edit` + _tabQ();
  document.getElementById('match-id').value = id;
  document.getElementById('match-opponent').value = opponent;
  document.getElementById('match-date').value = date;
  document.getElementById('match-location').value = location;
  document.getElementById('match-tournament-name').value = tournamentName || '';
  _setMatchType(matchType || 'league');
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

/* ── Delete-confirm modal ─────────────────────────────────────────────────── */
let _deleteConfirmUrl = '';

function openDeleteConfirm(url, label) {
  _deleteConfirmUrl = url;
  document.getElementById('delete-confirm-label').textContent = label;
  document.getElementById('delete-confirm-pw').value = '';
  document.getElementById('delete-confirm-error').classList.add('hidden');
  openModal('modal-delete');
  setTimeout(() => document.getElementById('delete-confirm-pw').focus(), 100);
}

async function submitDeleteConfirm() {
  const pw = document.getElementById('delete-confirm-pw').value;
  const errEl = document.getElementById('delete-confirm-error');
  const btn = document.getElementById('delete-confirm-btn');

  btn.disabled = true;
  try {
    const verifyRes = await apiFetch('/admin/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const { ok } = await verifyRes.json();
    if (!ok) {
      errEl.classList.remove('hidden');
      document.getElementById('delete-confirm-pw').value = '';
      document.getElementById('delete-confirm-pw').focus();
      btn.disabled = false;
      return;
    }

    // Password correct — submit the delete action
    await apiFetch(_deleteConfirmUrl, { method: 'POST' });
    // Redirect back preserving tab param from the delete URL
    const tabMatch = _deleteConfirmUrl.match(/[?&]tab=([^&]+)/);
    const tab = tabMatch ? tabMatch[1] : 'players';
    window.location.href = `/admin?tab=${tab}`;
  } catch (_) {
    btn.disabled = false;
  }
}

// Allow Enter key in password field to submit
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'delete-confirm-pw') {
    submitDeleteConfirm();
  }
});

/* ── Backup restore ───────────────────────────────────────────────────────── */
function openRestoreConfirm() {
  const msg = window._backupMsg || {};
  const input = document.getElementById('restore-file');
  const fileErr = document.getElementById('restore-file-error');
  fileErr.classList.add('hidden');
  if (!input.files || !input.files[0]) {
    fileErr.textContent = msg.noFile || '';
    fileErr.classList.remove('hidden');
    return;
  }
  document.getElementById('restore-confirm-label').textContent = input.files[0].name;
  document.getElementById('restore-confirm-pw').value = '';
  document.getElementById('restore-confirm-error').classList.add('hidden');
  openModal('modal-restore');
  setTimeout(() => document.getElementById('restore-confirm-pw').focus(), 100);
}

async function submitRestore() {
  const msg = window._backupMsg || {};
  const file = document.getElementById('restore-file').files[0];
  const errEl = document.getElementById('restore-confirm-error');
  const btn = document.getElementById('restore-confirm-btn');
  if (!file) return;

  btn.disabled = true;
  errEl.classList.add('hidden');
  try {
    const res = await apiFetch('/admin/backup/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Admin-Password': document.getElementById('restore-confirm-pw').value,
      },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      alert(msg.done || 'OK');
      window.location.href = '/admin?tab=backup';
      return;
    }
    errEl.textContent = data.error || msg.failed || 'Error';
    errEl.classList.remove('hidden');
  } catch (_) {
    errEl.textContent = msg.failed || 'Error';
    errEl.classList.remove('hidden');
  }
  btn.disabled = false;
}
