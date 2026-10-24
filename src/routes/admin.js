const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const players = db.getPlayers();
  const seasons = db.getSeasons();

  const playerRows = players.map(p => `
    <tr>
      <td>#${esc(p.number)}</td>
      <td>${esc(p.name)}</td>
      <td><span class="badge ${p.active ? 'badge-green' : 'badge-gray'}">${p.active ? t('active') : t('inactive')}</span></td>
      <td>
        <button class="btn btn-sm" onclick="openEditPlayer(${p.id},'${esc(p.name)}','${esc(p.number)}',${p.active})">${t('edit')}</button>
      </td>
    </tr>`).join('');

  const seasonBlocks = seasons.map(s => {
    const matches = db.getMatchesBySeason(s.id);
    const matchRows = matches.map(m => `
      <tr>
        <td>${m.match_date}</td>
        <td>${esc(m.opponent)}</td>
        <td>${esc(m.location)}</td>
        <td><span class="badge ${m.status === 'closed' ? 'badge-red' : 'badge-green'}">${m.status === 'closed' ? `🔒 ${t('closed')}` : t('open')}</span></td>
        <td>
          <button class="btn btn-sm" onclick="openEditMatch(${m.id},'${esc(m.opponent)}','${m.match_date}','${esc(m.location)}')">${t('edit')}</button>
          ${m.status === 'closed'
            ? `<form method="POST" action="/match/${m.id}/reopen" style="display:inline"><button class="btn btn-sm btn-primary">${t('reopen')}</button></form>`
            : `<form method="POST" action="/match/${m.id}/close" style="display:inline" onsubmit="return confirm('${t('confirm_close_match')}')"><button class="btn btn-sm btn-warning">${t('close_match')}</button></form>`
          }
          <form method="POST" action="/admin/match/${m.id}/delete" style="display:inline" onsubmit="return confirm('${t('confirm_delete_match')}')">
            <button class="btn btn-sm btn-danger">${t('delete')}</button>
          </form>
        </td>
      </tr>`).join('');

    return `
    <div class="season-block">
      <div class="season-header">
        <h3>${esc(s.name)}</h3>
        <div class="btn-group">
          <button class="btn btn-sm" onclick="openEditSeason(${s.id},'${esc(s.name)}')">${t('edit_season')}</button>
          <form method="POST" action="/admin/season/${s.id}/delete" style="display:inline" onsubmit="return confirm('${t('confirm_delete_season')}')">
            <button class="btn btn-sm btn-danger">${t('delete_season')}</button>
          </form>
          <button class="btn btn-sm btn-primary" onclick="openAddMatch(${s.id})">${t('add_match')}</button>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>${t('date')}</th><th>${t('opponent')}</th><th>${t('location')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${matchRows || `<tr><td colspan="5" class="empty">${t('no_matches_admin')}</td></tr>`}</tbody>
      </table>
    </div>`;
  }).join('');

  const body = `
  <div class="page-header">
    <h1>${t('admin')}</h1>
  </div>

  <section class="admin-section">
    <div class="section-header">
      <h2>${t('players')}</h2>
      <button class="btn btn-primary" onclick="openAddPlayer()">${t('add_player')}</button>
    </div>
    <table class="data-table">
      <thead><tr><th>${t('jersey')}</th><th>${t('name')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
      <tbody>${playerRows || `<tr><td colspan="4" class="empty">${t('no_data')}</td></tr>`}</tbody>
    </table>
  </section>

  <section class="admin-section">
    <div class="section-header">
      <h2>${t('seasons_matches')}</h2>
      <button class="btn btn-primary" onclick="openAddSeason()">${t('add_season')}</button>
    </div>
    ${seasons.length === 0 ? `<p class="empty-state">${t('no_seasons_admin')}</p>` : seasonBlocks}
  </section>

  <!-- Player Modal -->
  <div id="modal-player" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-player-title">${t('add_player_title')}</h3>
      <form method="POST" id="form-player">
        <input type="hidden" name="id" id="player-id">
        <label>${t('name')} <input type="text" name="name" id="player-name" required></label>
        <label>${t('jersey_number')} <input type="text" name="number" id="player-number"></label>
        <label id="player-active-wrap" style="display:none">
          ${t('active')} <input type="checkbox" name="active" id="player-active" value="1">
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-player')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Season Modal -->
  <div id="modal-season" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-season-title">${t('add_season_title')}</h3>
      <form method="POST" id="form-season">
        <input type="hidden" name="id" id="season-id">
        <label>${t('season_name')} <input type="text" name="name" id="season-name" required placeholder="${t('season_placeholder')}"></label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-season')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Match Modal -->
  <div id="modal-match" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-match-title">${t('add_match_title')}</h3>
      <form method="POST" id="form-match">
        <input type="hidden" name="id" id="match-id">
        <input type="hidden" name="season_id" id="match-season-id">
        <label>${t('opponent')} <input type="text" name="opponent" id="match-opponent" required></label>
        <label>${t('date')} <input type="date" name="match_date" id="match-date" required></label>
        <label>${t('location')} <input type="text" name="location" id="match-location" placeholder="${t('location_placeholder')}"></label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-match')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-overlay hidden" id="modal-overlay" onclick="closeAllModals()"></div>`;

  res.send(layout(t('admin'), body, { activePage: 'admin', lang, t }));
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
