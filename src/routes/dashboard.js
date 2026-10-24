const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

router.get('/', (req, res) => {
  const t          = req.t;
  const lang       = req.lang;
  const categories = db.getCategories();
  const seasons    = db.getSeasons();

  // Active category filter from query param — default 'all'
  const activeCat = req.query.cat || 'all';

  // Build category tab bar
  const tabs = [
    { key: 'all', label: t('all_categories') },
    ...categories.map(c => ({ key: String(c.id), label: esc(c.name) })),
    { key: 'none', label: t('uncategorized') },
  ].map(tab => {
    const isActive = activeCat === tab.key;
    return `<a href="/dashboard?cat=${tab.key}" class="cat-tab${isActive ? ' active' : ''}">${tab.label}</a>`;
  }).join('');

  // Filter seasons by selected tab
  const filteredSeasons = seasons.filter(s => {
    if (activeCat === 'all')  return true;
    if (activeCat === 'none') return !s.category_id;
    return String(s.category_id) === activeCat;
  });

  const seasonsHtml = filteredSeasons.map(s => {
    const matches = db.getMatchesBySeason(s.id);
    const catLabel = s.category_name
      ? `<span class="badge badge-blue">${esc(s.category_name)}</span>`
      : '';
    const matchRows = matches.map(m => {
      const isClosed = m.status === 'closed';
      const statusBadge = isClosed
        ? `<span class="badge badge-red">🔒 ${t('closed')}</span>`
        : `<span class="badge badge-green">${t('open')}</span>`;
      const typeBadge = `<span class="badge badge-type badge-type-${m.match_type || 'league'}">${t('match_type_' + (m.match_type || 'league'))}</span>`;
      const tournLabel = (m.match_type === 'tournament' && m.tournament_name) ? ` <span class="match-tourn-name">${esc(m.tournament_name)}</span>` : '';
      const scoreLabel = (m.score_bsc || m.score_opponent)
        ? `<span class="match-score">${m.score_bsc || 0}–${m.score_opponent || 0}</span>`
        : '';
      const liveBtn = isClosed
        ? `<a href="/match/${m.id}" class="btn btn-sm btn-outline">${t('view')}</a>`
        : `<a href="/match/${m.id}" class="btn btn-sm">${t('live')}</a>`;
      return `
      <tr>
        <td>${m.match_date}</td>
        <td>${esc(m.opponent)} ${scoreLabel}</td>
        <td>${esc(m.location)}</td>
        <td>${typeBadge}${tournLabel}</td>
        <td>${statusBadge}</td>
        <td class="td-actions">
          ${liveBtn}
          <a href="/match/${m.id}/summary" class="btn btn-sm btn-outline">${t('summary')}</a>
        </td>
      </tr>`;
    }).join('');

    return `
    <div class="season-block">
      <div class="season-header">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <h2>${esc(s.name)}</h2>
          ${catLabel}
        </div>
        <a href="/season/${s.id}/summary" class="btn btn-sm btn-outline">${t('season_summary')}</a>
      </div>
      <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>${t('date')}</th><th>${t('opponent')}</th><th>${t('location')}</th><th>${t('match_type')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${matchRows || `<tr><td colspan="6" class="empty">${t('no_matches')}</td></tr>`}</tbody>
      </table>
      </div>
    </div>`;
  }).join('');

  const body = `
    <div class="page-header">
      <h1>${t('dashboard')}</h1>
    </div>
    <div class="cat-tabs">${tabs}</div>
    ${filteredSeasons.length === 0
      ? `<p class="empty-state">${t('no_seasons')}</p>`
      : seasonsHtml}`;

  res.send(layout(t('dashboard'), body, { activePage: 'dashboard', lang, t }));
});

module.exports = router;
