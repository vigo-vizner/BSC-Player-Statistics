const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

const STAT_TYPES  = ['1pt','2pt','3pt','oreb','dreb','ast','to','blk','stl','pf'];
const STAT_LABELS = { '1pt':'1PT','2pt':'2PT','3pt':'3PT','oreb':'OReb','dreb':'DReb','ast':'AST','to':'TO','blk':'BLK','stl':'STL','pf':'PF' };

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildStatMap(stats, players) {
  const map = {};
  players.forEach(p => { map[p.id] = {}; STAT_TYPES.forEach(t => { map[p.id][t] = 0; }); });
  stats.forEach(s => { if (map[s.player_id]) map[s.player_id][s.stat_type]++; });
  return map;
}

function totalPoints(m) {
  return (m['1pt']||0)*1 + (m['2pt']||0)*2 + (m['3pt']||0)*3;
}

function buildSummaryTable(statMap, players) {
  const rows = players.map(p => {
    const m = statMap[p.id] || {};
    if (STAT_TYPES.every(t => !m[t])) return null; // skip players with 0 stats
    const pts = totalPoints(m);
    const cells = STAT_TYPES.map(t => `<td>${m[t] || 0}</td>`).join('');
    return `<tr><td>#${esc(p.number)} ${esc(p.name)}</td><td><strong>${pts}</strong></td>${cells}</tr>`;
  }).filter(Boolean).join('') || '<tr><td colspan="12" class="empty">No stats recorded</td></tr>';

  const headers = STAT_TYPES.map(t => `<th>${STAT_LABELS[t]}</th>`).join('');
  return `<table class="data-table summary-table">
    <thead><tr><th>Player</th><th>PTS</th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── GET /match/:id/summary ────────────────────────────────────────────────────
router.get('/match/:id/summary', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const players = db.getPlayers();
  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);
  const table   = buildSummaryTable(statMap, players);

  const body = `
  <div class="page-header">
    <h1>Summary: vs ${esc(match.opponent)}</h1>
    <p class="match-meta">${match.match_date}${match.location ? ' · '+esc(match.location) : ''} · ${esc(match.season_name)}</p>
  </div>
  <div class="summary-actions">
    <a href="/match/${match.id}" class="btn">← Back to Live</a>
    <a href="/match/${match.id}/export.csv" class="btn btn-outline">Export CSV</a>
  </div>
  ${table}`;

  res.send(layout(`Summary vs ${match.opponent}`, body, {}));
});

// ── GET /match/:id/export.csv ─────────────────────────────────────────────────
router.get('/match/:id/export.csv', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Not found');

  const players = db.getPlayers();
  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);

  const headers = ['Player','Jersey','PTS',...STAT_TYPES.map(t=>STAT_LABELS[t])];
  const rows = players
    .filter(p => STAT_TYPES.some(t => (statMap[p.id]||{})[t]))
    .map(p => {
      const m = statMap[p.id] || {};
      return [p.name, p.number, totalPoints(m), ...STAT_TYPES.map(t => m[t]||0)].join(',');
    });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = `match_${match.match_date}_vs_${match.opponent.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── GET /season/:id/summary ───────────────────────────────────────────────────
router.get('/season/:id/summary', (req, res) => {
  const seasons = db.getSeasons();
  const season  = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Season not found');

  const players   = db.getPlayers();
  const statsRaw  = db.getStatsBySeasonRaw(season.id);
  const statMap   = buildStatMap(statsRaw, players);
  const matches   = db.getMatchesBySeason(season.id);
  const table     = buildSummaryTable(statMap, players);

  const body = `
  <div class="page-header">
    <h1>Season Summary: ${esc(season.name)}</h1>
    <p class="match-meta">${matches.length} match${matches.length !== 1 ? 'es' : ''}</p>
  </div>
  <div class="summary-actions">
    <a href="/dashboard" class="btn">← Dashboard</a>
    <a href="/season/${season.id}/export.csv" class="btn btn-outline">Export CSV</a>
  </div>
  ${table}`;

  res.send(layout(`Season: ${season.name}`, body, { activePage: 'dashboard' }));
});

// ── GET /season/:id/export.csv ────────────────────────────────────────────────
router.get('/season/:id/export.csv', (req, res) => {
  const seasons = db.getSeasons();
  const season  = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Not found');

  const players  = db.getPlayers();
  const statsRaw = db.getStatsBySeasonRaw(season.id);
  const statMap  = buildStatMap(statsRaw, players);

  const headers = ['Player','Jersey','PTS',...STAT_TYPES.map(t=>STAT_LABELS[t])];
  const rows = players
    .filter(p => STAT_TYPES.some(t => (statMap[p.id]||{})[t]))
    .map(p => {
      const m = statMap[p.id] || {};
      return [p.name, p.number, totalPoints(m), ...STAT_TYPES.map(t => m[t]||0)].join(',');
    });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = `season_${season.name.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
