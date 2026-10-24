const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');
const { buildTour } = require('../tour');


function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function catOptions(categories, selectedId, t) {
  const none = `<option value="">${t('uncategorized')}</option>`;
  return none + categories.map(c =>
    `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
}

// Multi-select options — selectedIds is an array of numbers/strings
function catOptionsMulti(categories, selectedIds, t) {
  const ids = (selectedIds || []).map(String);
  return categories.map(c =>
    `<option value="${c.id}" ${ids.includes(String(c.id)) ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
}

// ── GET /admin ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const t          = req.t;
  const lang       = req.lang;
  const tab        = ['players', 'seasons', 'categories'].includes(req.query.tab) ? req.query.tab : 'players';
  const categories = db.getCategories();
  const players    = db.getPlayers();
  const seasons    = db.getSeasons();

  // ── Categories panel ──────────────────────────────────────────────────────
  const catRows = categories.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${c.sort_order}</td>
      <td>
        <button class="btn btn-sm" onclick="openEditCategory(${c.id},'${esc(c.name)}',${c.sort_order})">${t('edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="openDeleteConfirm('/admin/category/${c.id}/delete?tab=categories','${t('delete_confirm_what')}: ${esc(c.name)}')">${t('delete')}</button>
      </td>
    </tr>`).join('');

  // ── Players panel ─────────────────────────────────────────────────────────
  // Group players by each of their categories (a player may appear in multiple groups)
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = []; });
  catMap['null'] = []; // uncategorized
  players.forEach(p => {
    if (p.categories && p.categories.length > 0) {
      p.categories.forEach(c => {
        if (!catMap[c.id]) catMap[c.id] = [];
        catMap[c.id].push(p);
      });
    } else {
      catMap['null'].push(p);
    }
  });

  const playerGroupHtml = [
    ...categories.map(c => ({ label: esc(c.name), key: c.id })),
    { label: t('uncategorized'), key: 'null' },
  ].filter(g => catMap[g.key] && catMap[g.key].length > 0).map(g => {
    const rows = catMap[g.key].map(p => {
      const catIds = JSON.stringify((p.categories || []).map(c => c.id));
      return `
      <tr>
        <td>#${esc(p.number)}</td>
        <td>${esc(p.name)}</td>
        <td><span class="badge ${p.active ? 'badge-green' : 'badge-gray'}">${p.active ? t('active') : t('inactive')}</span></td>
        <td>
          <button class="btn btn-sm" onclick="openEditPlayer(${p.id},'${esc(p.name)}','${esc(p.number)}',${p.active},${esc(catIds)})">${t('edit')}</button>
          <button class="btn btn-sm btn-danger" onclick="openDeleteConfirm('/admin/player/${p.id}/delete?tab=players','${t('delete_confirm_what')}: #${esc(p.number)} ${esc(p.name)}')">${t('delete')}</button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="player-group">
      <div class="player-group-label">${g.label}</div>
      <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>${t('jersey')}</th><th>${t('name')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    </div>`;
  }).join('') || `<p class="empty-state">${t('no_data')}</p>`;

  // ── Seasons & Matches panel ───────────────────────────────────────────────
  const seasonGroups = [
    ...categories.map(c => ({ label: esc(c.name), catId: c.id })),
    { label: t('uncategorized'), catId: null },
  ].map(g => {
    const groupSeasons = seasons.filter(s =>
      g.catId === null ? !s.category_id : s.category_id == g.catId
    );
    if (groupSeasons.length === 0) return '';

    const seasonBlocks = groupSeasons.map(s => {
      const matches = db.getMatchesBySeason(s.id);
      const matchRows = matches.map(m => {
        const typeBadge = `<span class="badge badge-type badge-type-${m.match_type || 'league'}">${t('match_type_' + (m.match_type || 'league'))}</span>`;
        const tournLabel = (m.match_type === 'tournament' && m.tournament_name) ? ` · ${esc(m.tournament_name)}` : '';
        return `
        <tr>
          <td>${m.match_date}</td>
          <td>${esc(m.opponent)}</td>
          <td>${esc(m.location)}</td>
          <td>${typeBadge}${tournLabel}</td>
          <td><span class="badge ${m.status === 'closed' ? 'badge-red' : 'badge-green'}">${m.status === 'closed' ? `🔒 ${t('closed')}` : t('open')}</span></td>
          <td>
            <button class="btn btn-sm" onclick="openEditMatch(${m.id},'${esc(m.opponent)}','${m.match_date}','${esc(m.location)}','${m.match_type || 'league'}','${esc(m.tournament_name || '')}')">${t('edit')}</button>
            ${m.status === 'closed'
              ? `<form method="POST" action="/match/${m.id}/reopen?tab=seasons" style="display:inline"><button class="btn btn-sm btn-primary">${t('reopen')}</button></form>`
              : `<form method="POST" action="/match/${m.id}/close?tab=seasons" style="display:inline" onsubmit="return confirm('${t('confirm_close_match')}')"><button class="btn btn-sm btn-warning">${t('close_match')}</button></form>`
            }
            <button class="btn btn-sm btn-danger" onclick="openDeleteConfirm('/admin/match/${m.id}/delete?tab=seasons','${t('delete_confirm_what')}: ${esc(m.opponent)} ${m.match_date}')">${t('delete')}</button>
          </td>
        </tr>`;
      }).join('');

      return `
      <div class="season-block">
        <div class="season-header">
          <h3>${esc(s.name)}</h3>
          <div class="btn-group">
            <button class="btn btn-sm" onclick="openEditSeason(${s.id},'${esc(s.name)}',${s.category_id || 'null'})">${t('edit_season')}</button>
            <button class="btn btn-sm btn-danger" onclick="openDeleteConfirm('/admin/season/${s.id}/delete?tab=seasons','${t('delete_confirm_what')}: ${esc(s.name)}')">${t('delete_season')}</button>
            <button class="btn btn-sm btn-primary" onclick="openAddMatch(${s.id})">${t('add_match')}</button>
          </div>
        </div>
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>${t('date')}</th><th>${t('opponent')}</th><th>${t('location')}</th><th>${t('match_type')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
          <tbody>${matchRows || `<tr><td colspan="6" class="empty">${t('no_matches_admin')}</td></tr>`}</tbody>
        </table>
        </div>
      </div>`;
    }).join('');

    return `<div class="cat-group">
      <div class="cat-group-label">${g.label}</div>
      ${seasonBlocks}
    </div>`;
  }).join('');

  const body = `
  <script>window._adminTab = '${tab}';</script>
  <div class="page-header"><h1>${t('admin')}</h1></div>

  <!-- ── Tab bar ── -->
  <div class="admin-tabs" id="admin-tabs" data-active="${tab}">
    <button class="admin-tab${tab === 'players'    ? ' active' : ''}" data-tab="players">${t('players')}</button>
    <button class="admin-tab${tab === 'seasons'    ? ' active' : ''}" data-tab="seasons">${t('seasons_matches')}</button>
    <button class="admin-tab${tab === 'categories' ? ' active' : ''}" data-tab="categories">${t('categories')}</button>
  </div>

  <!-- ── Players panel ── -->
  <div class="admin-panel${tab === 'players' ? ' active' : ''}" id="panel-players">
    <div class="section-header">
      <h2>${t('players')}</h2>
      <button class="btn btn-primary" onclick="openAddPlayer()">${t('add_player')}</button>
    </div>
    ${playerGroupHtml}
  </div>

  <!-- ── Seasons & Matches panel ── -->
  <div class="admin-panel${tab === 'seasons' ? ' active' : ''}" id="panel-seasons">
    <div class="section-header">
      <h2>${t('seasons_matches')}</h2>
      <button class="btn btn-primary" onclick="openAddSeason()">${t('add_season')}</button>
    </div>
    ${seasons.length === 0 ? `<p class="empty-state">${t('no_seasons_admin')}</p>` : seasonGroups}
  </div>

  <!-- ── Categories panel ── -->
  <div class="admin-panel${tab === 'categories' ? ' active' : ''}" id="panel-categories">
    <div class="section-header">
      <h2>${t('categories')}</h2>
      <button class="btn btn-primary" onclick="openAddCategory()">${t('add_category')}</button>
    </div>
    <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th>${t('category_name')}</th><th>${t('sort_order')}</th><th>${t('actions')}</th></tr></thead>
      <tbody>${catRows || `<tr><td colspan="3" class="empty">${t('no_categories')}</td></tr>`}</tbody>
    </table>
    </div>
  </div>

  <!-- ── Category Modal ── -->
  <div id="modal-category" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-category-title">${t('add_category_title')}</h3>
      <form method="POST" id="form-category">
        <input type="hidden" name="id" id="category-id">
        <label>${t('category_name')} <input type="text" name="name" id="category-name" required></label>
        <label>${t('sort_order')} <small>${t('sort_order_hint')}</small>
          <input type="number" name="sort_order" id="category-sort" value="0" min="0">
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-category')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Player Modal ── -->
  <div id="modal-player" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-player-title">${t('add_player_title')}</h3>
      <form method="POST" id="form-player">
        <input type="hidden" name="id" id="player-id">
        <label>${t('name')} <input type="text" name="name" id="player-name" required></label>
        <label>${t('jersey_number')} <input type="text" name="number" id="player-number"></label>
        <label>${t('categories')}
          <select name="category_ids" id="player-categories" multiple size="4" style="height:auto">${catOptionsMulti(categories, [], t)}</select>
          <small style="color:var(--muted)">${t('multi_select_hint')}</small>
        </label>
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

  <!-- ── Season Modal ── -->
  <div id="modal-season" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-season-title">${t('add_season_title')}</h3>
      <form method="POST" id="form-season">
        <input type="hidden" name="id" id="season-id">
        <label>${t('season_name')} <input type="text" name="name" id="season-name" required placeholder="${t('season_placeholder')}"></label>
        <label>${t('category')}
          <select name="category_id" id="season-category">${catOptions(categories, null, t)}</select>
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-season')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ── Match Modal ── -->
  <div id="modal-match" class="modal hidden">
    <div class="modal-box">
      <h3 id="modal-match-title">${t('add_match_title')}</h3>
      <form method="POST" id="form-match">
        <input type="hidden" name="id" id="match-id">
        <input type="hidden" name="season_id" id="match-season-id">
        <label>${t('opponent')} <input type="text" name="opponent" id="match-opponent" required></label>
        <label>${t('date')} <input type="date" name="match_date" id="match-date" required></label>
        <label>${t('location')} <input type="text" name="location" id="match-location" placeholder="${t('location_placeholder')}"></label>
        <label>${t('match_type')}
          <select name="match_type" id="match-type">
            <option value="league">${t('match_type_league')}</option>
            <option value="tournament">${t('match_type_tournament')}</option>
            <option value="friendly">${t('match_type_friendly')}</option>
          </select>
        </label>
        <label id="tournament-name-wrap" style="display:none">${t('tournament_name')}
          <input type="text" name="tournament_name" id="match-tournament-name" placeholder="${t('tournament_name_placeholder')}">
        </label>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${t('save')}</button>
          <button type="button" class="btn" onclick="closeModal('modal-match')">${t('cancel')}</button>
        </div>
      </form>
    </div>
  </div>
  <!-- ── Delete Confirm Modal ── -->
  <div id="modal-delete" class="modal hidden">
    <div class="modal-box">
      <h3 style="color:var(--red)">${t('delete_confirm_title')}</h3>
      <p id="delete-confirm-label" style="font-size:.9rem;color:var(--muted)"></p>
      <label>${t('delete_confirm_password')}
        <input type="password" id="delete-confirm-pw" autocomplete="current-password" placeholder="••••••••">
      </label>
      <p id="delete-confirm-error" class="error hidden">${t('delete_confirm_wrong_pw')}</p>
      <div class="modal-actions">
        <button class="btn btn-danger" id="delete-confirm-btn" onclick="submitDeleteConfirm()">${t('delete_confirm_btn')}</button>
        <button type="button" class="btn" onclick="closeModal('modal-delete')">${t('cancel')}</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay hidden" id="modal-overlay" onclick="closeAllModals()"></div>`;

  res.send(layout(t('admin'), body, { activePage: 'admin', lang, t, tour: buildTour('admin', t) }));
});

// Helper: redirect back to admin preserving ?tab= from the request query
function adminRedirect(res, req, fallback) {
  const tab = req.query.tab || fallback || 'players';
  res.redirect(`/admin?tab=${tab}`);
}

// ── Categories ────────────────────────────────────────────────────────────────
router.post('/category/add', (req, res) => {
  const { name, sort_order } = req.body;
  if (name) db.insertCategory(name.trim(), parseInt(sort_order) || 0);
  adminRedirect(res, req, 'categories');
});
router.post('/category/:id/edit', (req, res) => {
  const { name, sort_order } = req.body;
  db.updateCategory(req.params.id, name.trim(), parseInt(sort_order) || 0);
  adminRedirect(res, req, 'categories');
});
router.post('/category/:id/delete', (req, res) => {
  db.deleteCategory(req.params.id);
  adminRedirect(res, req, 'categories');
});

// ── Players ───────────────────────────────────────────────────────────────────
function parseCategoryIds(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(Number).filter(n => n > 0);
}

router.post('/player/add', (req, res) => {
  const { name, number, category_ids } = req.body;
  if (name) {
    const result = db.insertPlayer(name.trim(), (number || '').trim());
    db.setPlayerCategories(result.lastInsertRowid, parseCategoryIds(category_ids));
  }
  adminRedirect(res, req, 'players');
});
router.post('/player/:id/edit', (req, res) => {
  const { name, number, active, category_ids } = req.body;
  db.updatePlayer(req.params.id, name.trim(), (number || '').trim(), active ? 1 : 0);
  db.setPlayerCategories(req.params.id, parseCategoryIds(category_ids));
  adminRedirect(res, req, 'players');
});
router.post('/player/:id/delete', (req, res) => {
  db.deletePlayer(req.params.id);
  adminRedirect(res, req, 'players');
});

// ── Seasons ───────────────────────────────────────────────────────────────────
router.post('/season/add', (req, res) => {
  const { name, category_id } = req.body;
  if (name) db.insertSeason(name.trim(), category_id || null);
  adminRedirect(res, req, 'seasons');
});
router.post('/season/:id/edit', (req, res) => {
  const { name, category_id } = req.body;
  db.updateSeason(req.params.id, name.trim(), category_id || null);
  adminRedirect(res, req, 'seasons');
});
router.post('/season/:id/delete', (req, res) => {
  db.deleteSeason(req.params.id);
  adminRedirect(res, req, 'seasons');
});

// ── Matches ───────────────────────────────────────────────────────────────────
router.post('/match/add', (req, res) => {
  const { season_id, opponent, match_date, location, match_type, tournament_name } = req.body;
  db.insertMatch(season_id, opponent.trim(), match_date, (location || '').trim(), match_type, (tournament_name || '').trim());
  adminRedirect(res, req, 'seasons');
});
router.post('/match/:id/edit', (req, res) => {
  const { opponent, match_date, location, match_type, tournament_name } = req.body;
  db.updateMatch(req.params.id, opponent.trim(), match_date, (location || '').trim(), match_type, (tournament_name || '').trim());
  adminRedirect(res, req, 'seasons');
});
router.post('/match/:id/delete', (req, res) => {
  db.deleteMatch(req.params.id);
  adminRedirect(res, req, 'seasons');
});


// ── Password verification (used by delete confirm modal) ──────────────────────
router.post('/verify-password', (req, res) => {
  const ok = (req.body.password || '') === (process.env.ADMIN_PASSWORD || '');
  res.json({ ok });
});


module.exports = router;
