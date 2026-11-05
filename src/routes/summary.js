const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');
const { esc, toCsv } = require('../util');
const { averagesTable, totalsTable } = require('../views/playerTables');
const {
  STAT_TYPES, STAT_KEYS, buildStatMap, pointsOf, shooting, splitText, avgText,
  buildPlayerGames, summarize,
} = require('../stats');

/** Made/attempted columns shown next to the counts. Only meaningful if misses were recorded. */
const SPLIT_COLS = [['fg', 'FG'], ['p3', '3P'], ['ft', 'FT']];

function buildSummaryTable(statMap, players, t, tracked) {
  const rows = players.map(p => {
    const m = statMap[p.id] || {};
    if (STAT_TYPES.every(st => !m[st])) return null;
    const sh = shooting(m);
    const cells = STAT_TYPES.map(st => `<td>${m[st] || 0}</td>`).join('');
    const splits = SPLIT_COLS.map(([k], i) => `<td${i === 0 ? ' class="col-sep"' : ''}>${tracked ? splitText(sh[k]) : '—'}</td>`).join('');
    return `<tr><td>#${esc(p.number)} ${esc(p.name)}</td><td><strong>${pointsOf(m)}</strong></td>${cells}${splits}</tr>`;
  }).filter(Boolean).join('') || `<tr><td colspan="${2 + STAT_TYPES.length + SPLIT_COLS.length}" class="empty">${t('no_data')}</td></tr>`;

  const headers = STAT_TYPES.map(st => `<th>${t(STAT_KEYS[st])}</th>`).join('')
    + SPLIT_COLS.map(([, label], i) => `<th${i === 0 ? ' class="col-sep"' : ''}>${label}</th>`).join('');
  return `<div class="summary-wrap"><table class="data-table summary-table">
    <thead><tr><th>${t('player')}</th><th>${t('pts')}</th>${headers}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

const hasMisses = (stats) => stats.some(s => s.stat_type.endsWith('_miss'));

// ── GET /match/:id/summary ────────────────────────────────────────────────────
router.get('/match/:id/summary', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const players = db.getPlayers();
  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);
  const table   = buildSummaryTable(statMap, players, t, hasMisses(stats));

  const closedBadge = match.status === 'closed'
    ? `<span class="badge badge-red">🔒 ${t('closed')}</span>`
    : `<span class="badge badge-green">${t('open')}</span>`;

  const scoreDisplay = (match.score_bsc || match.score_opponent)
    ? `<span class="summary-score">${match.score_bsc || 0} — ${match.score_opponent || 0}</span>`
    : '';

  const body = `
  <div class="page-header">
    <h1>${t('summary_title')}: ${t('vs')} ${esc(match.opponent)} ${scoreDisplay} ${closedBadge}</h1>
    <p class="match-meta">${match.match_date}${match.location ? ' · '+esc(match.location) : ''} · ${esc(match.season_name)}</p>
  </div>
  <div class="summary-actions">
    <a href="/match/${match.id}" class="btn">${t('back_to_match')}</a>
    <a href="/share/match/${esc(match.share_token)}" target="_blank" class="btn btn-primary">🔗 ${t('share')}</a>
    <a href="/match/${match.id}/export.csv" class="btn btn-outline">${t('export_csv')}</a>
  </div>
  ${table}
  <p class="summary-note">${t('shooting_note')}</p>`;

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
  const tracked = hasMisses(stats);

  const headers = [t('player'), t('jersey'), t('pts'), ...STAT_TYPES.map(st => t(STAT_KEYS[st])), 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA'];
  const rows = players
    .filter(p => STAT_TYPES.some(st => (statMap[p.id]||{})[st]))
    .map(p => {
      const m  = statMap[p.id] || {};
      const sh = shooting(m);
      const sp = tracked ? [sh.fg.m, sh.fg.a, sh.p3.m, sh.p3.a, sh.ft.m, sh.ft.a] : ['', '', '', '', '', ''];
      return [p.name, p.number, pointsOf(m), ...STAT_TYPES.map(st => m[st]||0), ...sp];
    });

  const csv = toCsv([headers, ...rows]);
  const filename = `match_${match.match_date}_vs_${match.opponent.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/** One row per player who played in `matches`: [{ player, s }], best scorer first. */
function seasonRows(season, matches) {
  const ids  = new Set(matches.map(m => m.id));
  const games = buildPlayerGames({
    matches,
    grouped:    db.getGroupedStats(season.id).filter(r => ids.has(r.match_id)),
    rosterRows: db.getRosterRows(season.id).filter(r => ids.has(r.match_id)),
  });
  return db.getPlayers()
    .filter(p => games.has(p.id))
    .map(p => ({ player: p, s: summarize(games.get(p.id)) }))
    .sort((a, b) => b.s.avg.pts - a.s.avg.pts || a.player.name.localeCompare(b.player.name));
}

// ── GET /season/:id/summary ───────────────────────────────────────────────────
router.get('/season/:id/summary', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const seasons  = db.getSeasons();
  const season   = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Season not found');

  const matches  = db.getMatchesBySeason(season.id);

  // Build a section per match type
  const TYPES = ['league', 'tournament', 'friendly'];
  const typeLabels = {
    league:     t('match_type_league'),
    tournament: t('match_type_tournament'),
    friendly:   t('match_type_friendly'),
  };
  const matchesByType = { league: [], tournament: [], friendly: [] };
  matches.forEach(m => { (matchesByType[m.match_type || 'league'] || matchesByType.league).push(m); });

  const block = (list) => {
    const rows = seasonRows(season, list);
    return `${averagesTable(rows, t)}
      <details class="roster-box"><summary>${t('totals')}</summary>${totalsTable(rows, list.length, t)}</details>`;
  };

  const sections = TYPES.map(mt => {
    const list = matchesByType[mt];
    if (!list.length) return '';

    const mCount = list.length;
    const mLabel = mCount === 1 ? t('matches_count_one') : t('matches_count_other');

    // For tournaments, list tournament names
    let subLabel = `${mCount} ${mLabel}`;
    if (mt === 'tournament') {
      const names = [...new Set(list.map(m => m.tournament_name))].filter(Boolean);
      if (names.length) subLabel += ` · ${names.map(esc).join(', ')}`;
    }

    return `
    <div class="summary-section">
      <div class="summary-section-header">
        <span class="badge badge-type badge-type-${mt}">${typeLabels[mt]}</span>
        <span class="summary-section-meta">${subLabel}</span>
      </div>
      ${block(list)}
    </div>`;
  }).join('');

  const mCount = matches.length;
  const mLabel = mCount === 1 ? t('matches_count_one') : t('matches_count_other');

  const body = `
  <div class="page-header">
    <h1>${t('season_summary_title')}: ${esc(season.name)}</h1>
    <p class="match-meta">${mCount} ${mLabel}</p>
  </div>
  <div class="summary-actions">
    <a href="/dashboard" class="btn">${t('back_to_dashboard')}</a>
    <a href="/season/${season.id}/export.csv" class="btn btn-outline">${t('export_csv')}</a>
  </div>
  ${TYPES.filter(mt => matchesByType[mt].length > 0).length > 1 ? `
    <div class="summary-section">
      <div class="summary-section-header">
        <span class="summary-section-title">${t('summary_all')}</span>
        <span class="summary-section-meta">${mCount} ${mLabel}</span>
      </div>
      ${block(matches)}
    </div>` : ''}
  ${sections}
  <p class="summary-note">${t('shooting_note')}</p>`;

  res.send(layout(`${t('season_summary_title')}: ${season.name}`, body, { activePage: 'dashboard', lang, t }));
});

// ── GET /season/:id/export.csv ────────────────────────────────────────────────
router.get('/season/:id/export.csv', (req, res) => {
  const t       = req.t;
  const seasons = db.getSeasons();
  const season  = seasons.find(s => s.id == req.params.id);
  if (!season) return res.status(404).send('Not found');

  const rows = seasonRows(season, db.getMatchesBySeason(season.id));

  const headers = [t('player'), t('jersey'), t('games_played'), t('pts'), t('avg_pts'), ...STAT_TYPES.map(st => t(STAT_KEYS[st])), 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA'];
  const data = rows.map(({ player, s }) => {
    const sh = s.shoot;
    const sp = s.shootGp ? [sh.fg.m, sh.fg.a, sh.p3.m, sh.p3.a, sh.ft.m, sh.ft.a] : ['', '', '', '', '', ''];
    return [player.name, player.number, s.gp, s.pts, avgText(s.avg.pts), ...STAT_TYPES.map(st => s.totals[st] || 0), ...sp];
  });

  const csv = toCsv([headers, ...data]);
  const filename = `season_${season.name.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

module.exports = router;
