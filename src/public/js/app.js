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

/** Apply a stat/player update to the DOM (used by both local tap AND SSE). */
function applyPlayerUpdate(data) {
  const counts = data.counts || {};
  Object.keys(counts).forEach(st => {
    const b = document.querySelector(`.stat-btn[data-player="${data.player_id}"][data-stat="${st}"]`);
    if (!b) return;
    b.textContent = counts[st] > 0 ? counts[st] : '+';
    b.classList.toggle('has-val', counts[st] > 0);
  });
  const ptsCell = document.getElementById(`pts-${data.player_id}`);
  if (ptsCell) ptsCell.textContent = data.points;
}

/** Apply an undo update to the DOM. */
function applyUndoUpdate(data) {
  const counts = data.counts || {};
  const pid    = data.undone_player_id;
  Object.keys(counts).forEach(st => {
    const b = document.querySelector(`.stat-btn[data-player="${pid}"][data-stat="${st}"]`);
    if (!b) return;
    b.textContent = counts[st] > 0 ? counts[st] : '+';
    b.classList.toggle('has-val', counts[st] > 0);
  });
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

/* ── Admin modals ────────────────────────────────────────────────────────── */
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

function openAddPlayer() {
  document.getElementById('modal-player-title').textContent = 'Add Player';
  document.getElementById('form-player').action = '/admin/player/add';
  document.getElementById('player-id').value = '';
  document.getElementById('player-name').value = '';
  document.getElementById('player-number').value = '';
  document.getElementById('player-active-wrap').style.display = 'none';
  openModal('modal-player');
}
function openEditPlayer(id, name, number, active) {
  document.getElementById('modal-player-title').textContent = 'Edit Player';
  document.getElementById('form-player').action = `/admin/player/${id}/edit`;
  document.getElementById('player-id').value = id;
  document.getElementById('player-name').value = name;
  document.getElementById('player-number').value = number;
  document.getElementById('player-active').checked = !!active;
  document.getElementById('player-active-wrap').style.display = 'flex';
  openModal('modal-player');
}

function openAddSeason() {
  document.getElementById('modal-season-title').textContent = 'Add Season';
  document.getElementById('form-season').action = '/admin/season/add';
  document.getElementById('season-id').value = '';
  document.getElementById('season-name').value = '';
  openModal('modal-season');
}
function openEditSeason(id, name) {
  document.getElementById('modal-season-title').textContent = 'Edit Season';
  document.getElementById('form-season').action = `/admin/season/${id}/edit`;
  document.getElementById('season-id').value = id;
  document.getElementById('season-name').value = name;
  openModal('modal-season');
}

function openAddMatch(seasonId) {
  document.getElementById('modal-match-title').textContent = 'Add Match';
  document.getElementById('form-match').action = '/admin/match/add';
  document.getElementById('match-id').value = '';
  document.getElementById('match-season-id').value = seasonId;
  document.getElementById('match-opponent').value = '';
  document.getElementById('match-date').valueAsDate = new Date();
  document.getElementById('match-location').value = '';
  openModal('modal-match');
}
function openEditMatch(id, opponent, date, location) {
  document.getElementById('modal-match-title').textContent = 'Edit Match';
  document.getElementById('form-match').action = `/admin/match/${id}/edit`;
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
