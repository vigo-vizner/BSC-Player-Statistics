const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

const STAT_TYPES = ['1pt','2pt','3pt','oreb','dreb','ast','to','blk','stl','pf'];
const STAT_KEYS  = { '1pt':'stat_1pt','2pt':'stat_2pt','3pt':'stat_3pt','oreb':'stat_oreb','dreb':'stat_dreb','ast':'stat_ast','to':'stat_to','blk':'stat_blk','stl':'stat_stl','pf':'stat_pf' };

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

function buildSummaryTable(statMap, players, t) {
  const rows = players.map(p => {
    const m = statMap[p.id] || {};
    if (STAT_TYPES.every(st => !m[st])) return null;
    const pts  = totalPoints(m);
    const cells = STAT_TYPES.map(st => `<td>${m[st] || 0}</td>`).join('');
    return `<tr><td>#${esc(p.number)} ${esc(p.name)}</td><td><strong>${pts}</strong></td>${cells}</tr>`;
  }).filter(Boolean).join('') || `<tr><td colspan="12" class="empty">${t('no_data')}</td></tr>`;

  const headers = STAT_TYPES.map(st => `<th>${t(STAT_KEYS[st])}</th>`).join('');
  return `<div class="summary-wrap"><table class="data-table summary-table">
    <thead><tr><th>${t('player')}</th><th>${t('pts')}</th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── GET /match/:id/summary ────────────────────────────────────────────────────
router.get('/match/:id/summary', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const players = db.getPlayers();
  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);
  const table   = buildSummaryTable(statMap, players, t);

  const closedBadge = match.status === 'closed'
    ? `<span class="badge badge-red">🔒 ${t('closed')}</span>`
    : `<span class="badge badge-green">${t('open')}</span>`;

  const body = `
  <div class="page-header">
    <h1>${t('summary_title')}: ${t('vs')} ${esc(match.opponent)} ${closedBadge}</h1>
    <p class="match-meta">${match.match_date}${match.location ? ' · '+esc(match.location) : ''} · ${esc(match.season_name)}</p>
  </div>
  <div class="summary-actions">
    <a href="/match/${match.id}" class="btn">${t('back_to_match')}</a>
    <a href="/match/${match.id}/export.csv" class="btn btn-outline">${t('export_csv')}</a>
  </div>
  ${table}`;

  res.send(layout(`${t('summary_title')} ${t('vs')} ${match.opponent}`, body, { lang, t }));
});

// ── GET /match/:id/export.csv ─────────────────────────────────────────────────
router.get('/match/:id/export.csv', (req, res) => {
  const t     = req.t;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Not found');

  const players = db.getPlayers();
  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);

  const headers = [t('player'), t('jersey'), t('pts'), ...STAT_TYPES.map(st => t(STAT_KEYS[st]))];
  const rows = players
    .filter(p => STAT_TYPES.some(st => (statMap[p.id]||{})[st]))
    .map(p => {
      const m = statMap[p.id] || {};
      return [p.name, p.number, totalPoints(m), ...STAT_TYPES.map(st => m[st]||0)].join(',');
    });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = `match_${match.match_date}_vs_${match.opponent.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── GET /season/:id/summary ───────────────────────────────────────────────────
router.get('/season/:id/summary', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const seasons  = db.getSeasons();
  const season   = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Season not found');

  const players  = db.getPlayers();
  const statsRaw = db.getStatsBySeasonRaw(season.id);
  const statMap  = buildStatMap(statsRaw, players);
  const matches  = db.getMatchesBySeason(season.id);
  const table    = buildSummaryTable(statMap, players, t);
  const mCount   = matches.length;
  const mLabel   = mCount === 1 ? t('matches_count_one') : t('matches_count_other');

  const body = `
  <div class="page-header">
    <h1>${t('season_summary_title')}: ${esc(season.name)}</h1>
    <p class="match-meta">${mCount} ${mLabel}</p>
  </div>
  <div class="summary-actions">
    <a href="/dashboard" class="btn">${t('back_to_dashboard')}</a>
    <a href="/season/${season.id}/export.csv" class="btn btn-outline">${t('export_csv')}</a>
  </div>
  ${table}`;

  res.send(layout(`${t('season_summary_title')}: ${season.name}`, body, { activePage: 'dashboard', lang, t }));
});

// ── GET /season/:id/export.csv ────────────────────────────────────────────────
router.get('/season/:id/export.csv', (req, res) => {
  const t       = req.t;
  const seasons = db.getSeasons();
  const season  = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Not found');

  const players  = db.getPlayers();
  const statsRaw = db.getStatsBySeasonRaw(season.id);
  const statMap  = buildStatMap(statsRaw, players);

  const headers = [t('player'), t('jersey'), t('pts'), ...STAT_TYPES.map(st => t(STAT_KEYS[st]))];
  const rows = players
    .filter(p => STAT_TYPES.some(st => (statMap[p.id]||{})[st]))
    .map(p => {
      const m = statMap[p.id] || {};
      return [p.name, p.number, totalPoints(m), ...STAT_TYPES.map(st => m[st]||0)].join(',');
    });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = `season_${season.name.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
