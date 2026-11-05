const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');
const { averagesTable } = require('../views/playerTables');
const { esc } = require('../util');
const { buildPlayerGames, summarize, pointsOf, reboundsOf, shooting, splitText, pctText, avgText } = require('../stats');

/** Games of every player, limited to the given matches. Map<playerId, [{ match, counts, tracked }]> */
function gamesFor(matches) {
  const ids = new Set(matches.map(m => m.id));
  return buildPlayerGames({
    matches,
    grouped:    db.getGroupedStats().filter(r => ids.has(r.match_id)),
    rosterRows: db.getRosterRows().filter(r => ids.has(r.match_id)),
  });
}

/** Link-style tabs: [{ key, label }] -> <a> list, `base` is the URL prefix incl. other params. */
const tabsHtml = (items, active, hrefOf) => items.map(i =>
  `<a href="${hrefOf(i.key)}" class="cat-tab${active === i.key ? ' active' : ''}">${i.label}</a>`).join('');

// ── GET /players ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const t = req.t;
  const categories = db.getCategories();
  const activeCat  = req.query.cat || 'all';

  const matches = db.getAllMatches().filter(m =>
    activeCat === 'all' ? true : activeCat === 'none' ? !m.category_id : String(m.category_id) === activeCat);

  const games   = gamesFor(matches);
  const players = db.getPlayers();
  const rows = players
    .filter(p => games.has(p.id))
    .map(p => ({ player: p, s: summarize(games.get(p.id)) }))
    .sort((a, b) => b.s.avg.pts - a.s.avg.pts || a.player.name.localeCompare(b.player.name));

  const tabs = tabsHtml([
    { key: 'all', label: t('all_categories') },
    ...categories.map(c => ({ key: String(c.id), label: esc(c.name) })),
    { key: 'none', label: t('uncategorized') },
  ], activeCat, k => `/players?cat=${k}`);

  const body = `
  <div class="page-header">
    <h1>${t('players_title')}</h1>
    <p class="match-meta">${t('players_intro')}</p>
  </div>
  <div class="cat-tabs">${tabs}</div>
  ${averagesTable(rows, t)}
  <p class="summary-note">${t('shooting_note')}</p>`;

  res.send(layout(t('players_title'), body, { activePage: 'players', lang: req.lang, t }));
});

// ── GET /players/:id ──────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const t = req.t;
  const player = db.getPlayers().find(p => p.id === parseInt(req.params.id, 10));
  if (!player) return res.status(404).send('Player not found');

  const all = gamesFor(db.getAllMatches()).get(player.id) || [];

  // Season filter: only seasons this player has games in
  const seasonsSeen = [];
  all.forEach(g => { if (!seasonsSeen.some(s => s.id === g.match.season_id)) seasonsSeen.push({ id: g.match.season_id, name: g.match.season_name }); });
  const activeSeason = req.query.season || 'all';
  const games = activeSeason === 'all' ? all : all.filter(g => String(g.match.season_id) === activeSeason);
  const s = summarize(games);

  const seasonTabs = seasonsSeen.length > 1
    ? `<div class="cat-tabs">${tabsHtml([{ key: 'all', label: t('all_seasons') }, ...seasonsSeen.map(x => ({ key: String(x.id), label: esc(x.name) }))],
        activeSeason, k => `/players/${player.id}?season=${k}`)}</div>`
    : '';

  const card = (val, lbl, sub = '') =>
    `<div class="stat-card"><div class="stat-card-val">${val}</div><div class="stat-card-lbl">${lbl}</div>${sub ? `<div class="stat-card-sub">${sub}</div>` : ''}</div>`;

  const cards = games.length ? [
    card(s.gp, t('games_played_full')),
    card(avgText(s.avg.pts), t('avg_pts'), `${s.pts} ${t('pts')}`),
    card(avgText(s.avg.reb), t('avg_reb'), `${s.reb}`),
    card(avgText(s.avg.ast), t('avg_ast'), `${s.totals.ast}`),
    card(avgText(s.avg.stl), t('avg_stl'), `${s.totals.stl}`),
    card(avgText(s.avg.blk), t('avg_blk'), `${s.totals.blk}`),
    card(avgText(s.avg.to),  t('avg_to'),  `${s.totals.to}`),
    card(avgText(s.avg.pf),  t('avg_pf'),  `${s.totals.pf}`),
  ].join('') : '';

  const shootCards = s.shootGp
    ? [
        card(pctText(s.shoot.fg), t('pct_fg'), splitText(s.shoot.fg)),
        card(pctText(s.shoot.p3), t('pct_3p'), splitText(s.shoot.p3)),
        card(pctText(s.shoot.ft), t('pct_ft'), splitText(s.shoot.ft)),
      ].join('')
    : '';

  // Newest game first
  const logRows = [...games].reverse().map(g => {
    const c = g.counts, sh = shooting(c), m = g.match;
    const score = (m.score_bsc || m.score_opponent) ? `${m.score_bsc || 0}–${m.score_opponent || 0}` : '';
    const split = (x) => (g.tracked ? splitText(x) : '—');
    return `<tr>
      <td><a href="/match/${m.id}/summary">${esc(m.match_date)}</a></td>
      <td>${t('vs')} ${esc(m.opponent)}${score ? ` <span class="dim">${score}</span>` : ''}</td>
      <td><strong>${pointsOf(c)}</strong></td><td>${reboundsOf(c)}</td><td>${c.ast}</td><td>${c.stl}</td><td>${c.blk}</td><td>${c.to}</td><td>${c.pf}</td>
      <td class="col-sep">${split(sh.fg)}</td><td>${split(sh.p3)}</td><td>${split(sh.ft)}</td>
    </tr>`;
  }).join('');
  const logHead = ['date', 'opponent', 'pts', 'sh_reb', 'sh_ast', 'stat_stl', 'stat_blk', 'stat_to', 'stat_pf', 'pct_fg', 'pct_3p', 'pct_ft']
    .map(k => `<th>${t(k)}</th>`).join('');

  const body = `
  <div class="page-header">
    <div class="player-hero"><h1>${esc(player.name)}</h1><span class="p-num">#${esc(player.number)}</span></div>
  </div>
  <div class="summary-actions"><a href="/players" class="btn">${t('back_to_players')}</a></div>
  ${seasonTabs}
  ${games.length ? `
    <h2 class="summary-subtitle">${t('averages')}</h2>
    <div class="stat-cards">${cards}</div>
    ${shootCards ? `<h2 class="summary-subtitle">${t('shooting')}</h2><div class="stat-cards">${shootCards}</div><p class="summary-note">${t('shooting_note')}</p>`
                 : `<p class="summary-note">${t('no_shooting')}. ${t('shooting_note')}</p>`}
    <h2 class="summary-subtitle">${t('game_log')}</h2>
    <div class="summary-wrap"><table class="data-table summary-table">
      <thead><tr>${logHead}</tr></thead><tbody>${logRows}</tbody>
    </table></div>`
    : `<p class="empty-state">${t('no_games')}</p>`}`;

  res.send(layout(player.name, body, { activePage: 'players', lang: req.lang, t }));
});

module.exports = router;
