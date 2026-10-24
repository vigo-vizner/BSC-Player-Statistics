const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

router.get('/', (req, res) => {
  const t       = req.t;
  const lang    = req.lang;
  const seasons = db.getSeasons();

  const seasonsHtml = seasons.map(s => {
    const matches = db.getMatchesBySeason(s.id);
    const matchRows = matches.map(m => {
      const isClosed = m.status === 'closed';
      const statusBadge = isClosed
        ? `<span class="badge badge-red">🔒 ${t('closed')}</span>`
        : `<span class="badge badge-green">${t('open')}</span>`;
      const liveBtn = isClosed
        ? `<a href="/match/${m.id}" class="btn btn-sm btn-outline">${t('view')}</a>`
        : `<a href="/match/${m.id}" class="btn btn-sm">${t('live')}</a>`;
      return `
      <tr>
        <td>${m.match_date}</td>
        <td>${esc(m.opponent)}</td>
        <td>${esc(m.location)}</td>
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
        <h2>${esc(s.name)}</h2>
        <a href="/season/${s.id}/summary" class="btn btn-sm btn-outline">${t('season_summary')}</a>
      </div>
      <table class="data-table">
        <thead><tr><th>${t('date')}</th><th>${t('opponent')}</th><th>${t('location')}</th><th>${t('status')}</th><th>${t('actions')}</th></tr></thead>
        <tbody>${matchRows || `<tr><td colspan="5" class="empty">${t('no_matches')}</td></tr>`}</tbody>
      </table>
    </div>`;
  }).join('');

  const body = `
    <div class="page-header">
      <h1>${t('dashboard')}</h1>
    </div>
    ${seasons.length === 0
      ? `<p class="empty-state">${t('no_seasons')} <a href="/admin">${t('nav_admin')}</a></p>`
      : seasonsHtml}`;

  res.send(layout(t('dashboard'), body, { activePage: 'dashboard', lang, t }));
});

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
