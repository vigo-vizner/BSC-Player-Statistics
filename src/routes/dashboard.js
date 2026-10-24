const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

router.get('/', (req, res) => {
  const seasons = db.getSeasons();
  const seasonsHtml = seasons.map(s => {
    const matches = db.getMatchesBySeason(s.id);
    const matchRows = matches.map(m => {
      const isClosed = m.status === 'closed';
      const statusBadge = isClosed
        ? '<span class="badge badge-red">🔒 Closed</span>'
        : '<span class="badge badge-green">Open</span>';
      const liveBtn = isClosed
        ? `<a href="/match/${m.id}" class="btn btn-sm btn-outline">View</a>`
        : `<a href="/match/${m.id}" class="btn btn-sm">Live</a>`;
      return `
      <tr>
        <td>${m.match_date}</td>
        <td>${escHtml(m.opponent)}</td>
        <td>${escHtml(m.location)}</td>
        <td>${statusBadge}</td>
        <td class="td-actions">
          ${liveBtn}
          <a href="/match/${m.id}/summary" class="btn btn-sm btn-outline">Summary</a>
        </td>
      </tr>`;
    }).join('');

    return `
    <div class="season-block">
      <div class="season-header">
        <h2>${escHtml(s.name)}</h2>
        <a href="/season/${s.id}/summary" class="btn btn-sm btn-outline">Season Summary</a>
      </div>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Opponent</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${matchRows || '<tr><td colspan="5" class="empty">No matches yet</td></tr>'}</tbody>
      </table>
    </div>`;
  }).join('');

  const body = `
    <div class="page-header">
      <h1>Dashboard</h1>
    </div>
    ${seasons.length === 0 ? '<p class="empty-state">No seasons yet. Go to <a href="/admin">Admin</a> to create one.</p>' : seasonsHtml}`;

  res.send(layout('Dashboard', body, { activePage: 'dashboard' }));
});

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = router;
