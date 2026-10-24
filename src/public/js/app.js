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

    // Update all stat buttons for this player
    const counts = data.counts;
    Object.keys(counts).forEach(st => {
      const b = document.querySelector(
        `.stat-btn[data-player="${data.player_id}"][data-stat="${st}"]`
      );
      if (!b) return;
      b.textContent = counts[st] > 0 ? counts[st] : '+';
      b.classList.toggle('has-val', counts[st] > 0);
    });

    // Update total points cell
    const ptsCell = document.getElementById(`pts-${data.player_id}`);
    if (ptsCell) ptsCell.textContent = data.points;

    // Flash the tapped button
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 300);

    // Update undo bar
    const undoInfo = document.getElementById('undo-info');
    const undoBtn  = document.getElementById('undo-btn');
    if (undoInfo) undoInfo.innerHTML = `Last: <strong>${escHtml(data.last_player_name)}</strong> — ${escHtml(data.last_stat_label)}`;
    if (undoBtn)  undoBtn.disabled = false;

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

    // Update buttons & points for the undone player
    const counts = data.counts;
    const pid    = data.undone_player_id;
    Object.keys(counts).forEach(st => {
      const b = document.querySelector(`.stat-btn[data-player="${pid}"][data-stat="${st}"]`);
      if (!b) return;
      b.textContent = counts[st] > 0 ? counts[st] : '+';
      b.classList.toggle('has-val', counts[st] > 0);
    });
    const ptsCell = document.getElementById(`pts-${pid}`);
    if (ptsCell) ptsCell.textContent = data.points;

    // Update undo bar
    const undoInfo = document.getElementById('undo-info');
    const undoBtn  = document.getElementById('undo-btn');
    if (data.new_last) {
      if (undoInfo) undoInfo.innerHTML = `Last: <strong>${escHtml(data.new_last.player_name)}</strong> — ${escHtml(data.new_last.stat_label)}`;
      if (undoBtn)  undoBtn.disabled = false;
    } else {
      if (undoInfo) undoInfo.textContent = 'No stats recorded yet';
      if (undoBtn)  undoBtn.disabled = true;
    }

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
