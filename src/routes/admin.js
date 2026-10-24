const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const players = db.getPlayers();
  const seasons = db.getSeasons();

  const playerRows = players.map(p => `
    <tr>
      <td>#${esc(p.number)}</td>
      <td>${esc(p.name)}</td>
      <td><span class="badge ${p.active ? 'badge-green' : 'badge-gray'}">${p.active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="btn btn-sm" onclick="openEditPlayer(${p.id},'${esc(p.name)}','${esc(p.number)}',${p.active})">Edit</button>
      </td>
    </tr>`).join('');

  const seasonBlocks = seasons.map(s => {
    const matches = db.getMatchesBySeason(s.id);
    const matchRows = matches.map(m => `
      <tr>
        <td>${m.match_date}</td>
        <td>${esc(m.opponent)}</td>
        <td>${esc(m.location)}</td>
        <td>
          <button class="btn btn-sm" onclick="openEditMatch(${m.id},'${esc(m.opponent)}','${m.match_date}','${esc(m.location)}')">Edit</button>
          <form method="POST" action="/admin/match/${m.id}/delete" style="display:inline" onsubmit="return confirm('Delete this match and all its stats?')">
            <button class="btn btn-sm btn-danger">Delete</button>
          </form>
        </td>
      </tr>`).join('');

    return `
    <div class="season-block">
      <div class="season-header">
        <h3>${esc(s.name)}</h3>
        <div class="btn-group">
          <button class="btn btn-sm" onclick="openEditSeason(${s.id},'${esc(s.name)}')">Edit Season</button>
          <form method="POST" action="/admin/season/${s.id}/delete" style="display:inline" onsubmit="return confirm('Delete this season and ALL its matches and stats?')">
            <button class="btn btn-sm btn-danger">Delete Season</button>
          </form>
          <button class="btn btn-sm btn-primary" onclick="openAddMatch(${s.id})">+ Match</button>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Opponent</th><th>Location</th><th>Actions</th></tr></thead>
        <tbody>${matchRows || '<tr><td colspan="4" class="empty">No matches</td></tr>'}</tbody>
      </table>
    </div>`;
  }).join('');

  const body = `
  <div class="page-header">
    <h1>Admin</h1>
  </div>

  <section class="admin-section">
    <div class="section-header">
      <h2>Players</h2>
      <button class="btn btn-primary" onclick="openAddPlayer()">+ Player</button>
    </div>
    <table class="data-table">
      <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${playerRows || '<tr><td colspan="4" class="empty">No players yet</td></tr>'}</tbody>
    </table>
  </section>

  <section class="admin-section">
    <div class="section-header">
      <h2>Seasons &amp; Matches</h2>
      <button class="btn btn-primary" onclick="openAddSeason()">+ Season</button>
    </div>
    ${seasons.length === 0 ? '<p class="empty-state">No seasons yet.</p>' : seasonBlocks}
  </section>

  <!-- Player Modal -->
  <div id="modal-player" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-player-title">Add Player</h3>
      <form method="POST" id="form-player">
        <input type="hidden" name="id" id="player-id">
        <label>Name <input type="text" name="name" id="player-name" required></label>
        <label>Jersey # <input type="text" name="number" id="player-number"></label>
        <label id="player-active-wrap" style="display:none">
          Active <input type="checkbox" name="active" id="player-active" value="1">
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn" onclick="closeModal('modal-player')">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Season Modal -->
  <div id="modal-season" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-season-title">Add Season</h3>
      <form method="POST" id="form-season">
        <input type="hidden" name="id" id="season-id">
        <label>Season Name <input type="text" name="name" id="season-name" required placeholder="e.g. 2025/26"></label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn" onclick="closeModal('modal-season')">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Match Modal -->
  <div id="modal-match" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-match-title">Add Match</h3>
      <form method="POST" id="form-match">
        <input type="hidden" name="id" id="match-id">
        <input type="hidden" name="season_id" id="match-season-id">
        <label>Opponent <input type="text" name="opponent" id="match-opponent" required></label>
        <label>Date <input type="date" name="match_date" id="match-date" required></label>
        <label>Location <input type="text" name="location" id="match-location" placeholder="Home / Away / Arena name"></label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn" onclick="closeModal('modal-match')">Cancel</button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-overlay hidden" id="modal-overlay" onclick="closeAllModals()"></div>`;

  res.send(layout('Admin', body, { activePage: 'admin' }));
});

// ── Players ───────────────────────────────────────────────────────────────────
router.post('/player/add', (req, res) => {
  const { name, number } = req.body;
  if (name) db.insertPlayer(name.trim(), (number || '').trim());
  res.redirect('/admin');
});

router.post('/player/:id/edit', (req, res) => {
  const { name, number, active } = req.body;
  db.updatePlayer(req.params.id, name.trim(), (number || '').trim(), active ? 1 : 0);
  res.redirect('/admin');
});

// ── Seasons ───────────────────────────────────────────────────────────────────
router.post('/season/add', (req, res) => {
  const { name } = req.body;
  if (name) db.insertSeason(name.trim());
  res.redirect('/admin');
});

router.post('/season/:id/edit', (req, res) => {
  const { name } = req.body;
  db.updateSeason(req.params.id, name.trim());
  res.redirect('/admin');
});

router.post('/season/:id/delete', (req, res) => {
  db.deleteSeason(req.params.id);
  res.redirect('/admin');
});

// ── Matches ───────────────────────────────────────────────────────────────────
router.post('/match/add', (req, res) => {
  const { season_id, opponent, match_date, location } = req.body;
  db.insertMatch(season_id, opponent.trim(), match_date, (location || '').trim());
  res.redirect('/admin');
});

router.post('/match/:id/edit', (req, res) => {
  const { opponent, match_date, location } = req.body;
  db.updateMatch(req.params.id, opponent.trim(), match_date, (location || '').trim());
  res.redirect('/admin');
});

router.post('/match/:id/delete', (req, res) => {
  db.deleteMatch(req.params.id);
  res.redirect('/admin');
});

module.exports = router;
