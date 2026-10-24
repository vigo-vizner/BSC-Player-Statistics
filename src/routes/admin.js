const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

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
  const categories = db.getCategories();
  const players    = db.getPlayers();
  const seasons    = db.getSeasons();

  // ── Categories section ────────────────────────────────────────────────────
  const catRows = categories.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${c.sort_order}</td>
      <td>
        <button class="btn btn-sm" onclick="openEditCategory(${c.id},'${esc(c.name)}',${c.sort_order})">${t('edit')}</button>
        <form method="POST" action="/admin/category/${c.id}/delete" style="display:inline"
              onsubmit="return confirm('${t('confirm_delete_cat')}')">
          <button class="btn btn-sm btn-danger">${t('delete')}</button>
        </form>
      </td>
    </tr>`).join('');

  // ── Players section ───────────────────────────────────────────────────────
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

  // ── Seasons & Matches section ─────────────────────────────────────────────
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
            <button class="btn btn-sm" onclick="openEditSeason(${s.id},'${esc(s.name)}',${s.category_id || 'null'})">${t('edit_season')}</button>
            <form method="POST" action="/admin/season/${s.id}/delete" style="display:inline" onsubmit="return confirm('${t('confirm_delete_season')}')">
              <button class="btn btn-sm btn-danger">${t('delete_season')}</button>
            </form>
            <button class="btn btn-sm btn-primary" onclick="openAddMatch(${s.id})">${t('add_match')}</button>
          </div>
        </div>
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>${t('date')}</th><th>${t('opponent')}</th><th>${t('location')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
          <tbody>${matchRows || `<tr><td colspan="5" class="empty">${t('no_matches_admin')}</td></tr>`}</tbody>
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
  <div class="page-header"><h1>${t('admin')}</h1></div>

  <!-- ── Categories ── -->
  <section class="admin-section">
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
  </section>

  <!-- ── Players ── -->
  <section class="admin-section">
    <div class="section-header">
      <h2>${t('players')}</h2>
      <button class="btn btn-primary" onclick="openAddPlayer()">${t('add_player')}</button>
    </div>
    ${playerGroupHtml}
  </section>

  <!-- ── Seasons & Matches ── -->
  <section class="admin-section">
    <div class="section-header">
      <h2>${t('seasons_matches')}</h2>
      <button class="btn btn-primary" onclick="openAddSeason()">${t('add_season')}</button>
    </div>
    ${seasons.length === 0 ? `<p class="empty-state">${t('no_seasons_admin')}</p>` : seasonGroups}
  </section>

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

// ── Categories ────────────────────────────────────────────────────────────────
router.post('/category/add', (req, res) => {
  const { name, sort_order } = req.body;
  if (name) db.insertCategory(name.trim(), parseInt(sort_order) || 0);
  res.redirect('/admin');
});
router.post('/category/:id/edit', (req, res) => {
  const { name, sort_order } = req.body;
  db.updateCategory(req.params.id, name.trim(), parseInt(sort_order) || 0);
  res.redirect('/admin');
});
router.post('/category/:id/delete', (req, res) => {
  db.deleteCategory(req.params.id);
  res.redirect('/admin');
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
  res.redirect('/admin');
});
router.post('/player/:id/edit', (req, res) => {
  const { name, number, active, category_ids } = req.body;
  db.updatePlayer(req.params.id, name.trim(), (number || '').trim(), active ? 1 : 0);
  db.setPlayerCategories(req.params.id, parseCategoryIds(category_ids));
  res.redirect('/admin');
});

// ── Seasons ───────────────────────────────────────────────────────────────────
router.post('/season/add', (req, res) => {
  const { name, category_id } = req.body;
  if (name) db.insertSeason(name.trim(), category_id || null);
  res.redirect('/admin');
});
router.post('/season/:id/edit', (req, res) => {
  const { name, category_id } = req.body;
  db.updateSeason(req.params.id, name.trim(), category_id || null);
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
