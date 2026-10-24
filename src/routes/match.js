const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const sse      = require('../sse');
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

function totalPoints(statMap, playerId) {
  const m = statMap[playerId] || {};
  return (m['1pt'] || 0) * 1 + (m['2pt'] || 0) * 2 + (m['3pt'] || 0) * 3;
}

/** Build the SSE broadcast payload for a player after any stat change. */
function buildPlayerPayload(t, match, players, statMap, pid, lastStat) {
  const newLast = lastStat;
  const lastPlayer = newLast ? players.find(p => p.id === newLast.player_id) : null;
  return {
    player_id:        pid,
    counts:           statMap[pid] || {},
    points:           totalPoints(statMap, pid),
    last_player_name: lastPlayer?.name || null,
    last_stat_label:  newLast ? t(STAT_KEYS[newLast.stat_type]) : null,
    last_stat_id:     newLast?.id || null,
  };
}

// ── GET /match/:id ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const t    = req.t;
  const lang = req.lang;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const isClosed  = match.status === 'closed';
  // Show only players belonging to this match's category (or all if no category set)
  const players = match.category_id
    ? db.getActivePlayersByCat(match.category_id)
    : db.getActivePlayers();
  const stats    = db.getStatsByMatch(match.id);
  const statMap  = buildStatMap(stats, players);
  const lastStat = db.getLastStat(match.id);

  // Season pts per player (all matches in the season, including this one live)
  const seasonId     = match.season_id;
  const seasonPtsMap = db.getSeasonPtsByPlayer(seasonId);

  const headerCols = STAT_TYPES.map(st => `<th class="stat-col">${t(STAT_KEYS[st])}</th>`).join('');

  const playerRows = players.map(p => {
    const statCells = STAT_TYPES.map(st => {
      const count = statMap[p.id][st] || 0;
      if (isClosed) {
        return `<td class="stat-cell"><span class="stat-val ${count > 0 ? 'has-val' : ''}">${count || '—'}</span></td>`;
      }
      return `<td class="stat-cell">
        <button class="stat-btn${count > 0 ? ' has-val' : ''}" data-match="${match.id}" data-player="${p.id}" data-stat="${st}">
          ${count > 0 ? count : '+'}
        </button>
      </td>`;
    }).join('');

    // Accordion: normal tap-to-add buttons
    const accordionBtns = isClosed ? '' : STAT_TYPES.map(st => {
      const count = statMap[p.id][st] || 0;
      return `<button class="stat-btn accord-btn${count > 0 ? ' has-val' : ''}" data-match="${match.id}" data-player="${p.id}" data-stat="${st}">
        <span class="accord-label">${t(STAT_KEYS[st])}</span>
        <span class="accord-count">${count > 0 ? count : '+'}</span>
      </button>`;
    }).join('');

    // Accordion: edit-mode −/count/+ controls
    const accordionEditBtns = isClosed ? '' : STAT_TYPES.map(st => {
      const count = statMap[p.id][st] || 0;
      return `<div class="edit-stat-cell">
        <span class="edit-stat-label">${t(STAT_KEYS[st])}</span>
        <div class="edit-stat-controls">
          <button class="edit-btn edit-btn-minus" data-match="${match.id}" data-player="${p.id}" data-stat="${st}" ${count === 0 ? 'disabled' : ''}>−</button>
          <span class="edit-stat-count" id="edit-count-${p.id}-${st}">${count}</span>
          <button class="edit-btn edit-btn-plus"  data-match="${match.id}" data-player="${p.id}" data-stat="${st}">+</button>
        </div>
      </div>`;
    }).join('');

    const pts       = totalPoints(statMap, p.id);
    const seasonPts = seasonPtsMap[p.id] || 0;
    return `
    <tr id="player-row-${p.id}" class="player-main-row" data-player-id="${p.id}">
      <td class="player-cell">
        <button class="pin-btn" data-player-id="${p.id}" title="Pin player" aria-label="Pin ${esc(p.name)}">☆</button>
        <span class="player-name-expand" data-player-id="${p.id}">
          <span class="p-num">#${esc(p.number)}</span> ${esc(p.name)}
          <span class="season-pts-badge" title="${t('season_pts_title')}">${seasonPts} ${t('season_pts_label')}</span>
        </span>
      </td>
      <td class="pts-cell" id="pts-${p.id}">${pts}</td>
      ${statCells}
    </tr>
    ${!isClosed ? `<tr id="accord-row-${p.id}" class="accord-row hidden" data-player-id="${p.id}">
      <td colspan="${2 + STAT_TYPES.length}" class="accord-cell">
        <div class="accord-grid accord-normal">${accordionBtns}</div>
        <div class="accord-grid accord-edit hidden">${accordionEditBtns}</div>
      </td>
    </tr>` : ''}`;
  }).join('');

  const lastPlayer = players.find(p => p.id === lastStat?.player_id);
  const undoInfo = lastStat
    ? `${t('last')}: <strong>${esc(lastPlayer?.name || '?')}</strong> — ${t(STAT_KEYS[lastStat.stat_type])}`
    : t('no_stats_yet');

  const closedBanner = isClosed ? `
    <div class="closed-banner">
      ${t('match_closed_banner')}
      <a href="/admin" class="btn btn-sm">${t('reopen_in_admin')}</a>
    </div>` : '';

  const liveControls = isClosed ? '' : `
    <div class="undo-bar" id="undo-bar">
      <span id="undo-info">${undoInfo}</span>
      <button class="btn btn-warning" id="undo-btn" ${!lastStat ? 'disabled' : ''} onclick="undoLast(${match.id})">${t('undo')}</button>
    </div>
    <button class="btn btn-outline" id="edit-mode-btn" onclick="toggleEditMode()"
      data-edit-label="${esc(t('edit_mode'))}" data-exit-label="${esc(t('edit_mode_exit'))}">${t('edit_mode')}</button>
    <form method="POST" action="/match/${match.id}/close" onsubmit="return confirm('${t('confirm_close')}')">
      <button class="btn btn-danger">${t('close_match_btn')}</button>
    </form>`;

  // SSE indicator — shows a small dot when live sync is active
  const syncIndicator = isClosed ? '' :
    `<span id="sync-dot" class="sync-dot sync-dot--off" title="Live sync"></span>`;

  const editBanner = isClosed ? '' :
    `<div class="edit-banner hidden" id="edit-banner">${t('edit_mode_banner')}</div>`;

  // Scoreboard — editable inputs when open, plain text when closed
  const scoreBoard = isClosed
    ? `<div class="scoreboard scoreboard--closed">
        <span class="score-team">${t('bsc')}</span>
        <span class="score-val" id="score-bsc">${match.score_bsc || 0}</span>
        <span class="score-sep">—</span>
        <span class="score-val" id="score-opp">${match.score_opponent || 0}</span>
        <span class="score-team">${esc(match.opponent)}</span>
      </div>`
    : `<div class="scoreboard" id="scoreboard">
        <span class="score-team">${t('bsc')}</span>
        <input class="score-input" id="score-bsc-input" type="number" min="0" max="999"
          value="${match.score_bsc || 0}" data-match="${match.id}" data-side="bsc"
          aria-label="${t('bsc')} score">
        <span class="score-sep">—</span>
        <input class="score-input" id="score-opp-input" type="number" min="0" max="999"
          value="${match.score_opponent || 0}" data-match="${match.id}" data-side="opp"
          aria-label="${esc(match.opponent)} score">
        <span class="score-team">${esc(match.opponent)}</span>
      </div>`;

  const body = `
  ${closedBanner}
  ${editBanner}
  <div class="match-header">
    <div>
      <h1>${t('vs')} ${esc(match.opponent)} ${syncIndicator}</h1>
      <p class="match-meta">${match.match_date}${match.location ? ' · '+esc(match.location) : ''} · ${esc(match.season_name)}</p>
    </div>
    ${scoreBoard}
    <div class="match-actions">
      ${liveControls}
      <a href="/match/${match.id}/summary" class="btn btn-outline">${t('summary')}</a>
    </div>
  </div>

  <div class="live-table-wrap">
    <table class="live-table" id="live-table">
      <thead>
        <tr>
          <th class="player-col">${t('player')}</th>
          <th class="pts-col">${t('pts')}</th>
          ${headerCols}
        </tr>
      </thead>
      <tbody id="live-tbody">${playerRows}</tbody>
    </table>
  </div>

  <div id="toast" class="toast hidden"></div>
  ${!isClosed ? `<script>window._matchId = ${match.id};</script>` : ''}`;

  res.send(layout(`${t('vs')} ${match.opponent}`, body, { lang, t }));
});

// ── GET /match/:id/events  (SSE stream) ───────────────────────────────────────
router.get('/:id/events', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).end();

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering on Railway
  res.flushHeaders();

  // Send a heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 25000);

  sse.addClient(match.id, res);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.removeClient(match.id, res);
  });
});

// ── POST /match/:id/stat ─────────────────────────────────────────────────────
router.post('/:id/stat', (req, res) => {
  const t = req.t;
  const { player_id, stat_type } = req.body;
  if (!STAT_TYPES.includes(stat_type)) return res.status(400).json({ error: 'invalid stat' });

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  db.insertStat(match.id, player_id, stat_type);

  const stats   = db.getStatsByMatch(match.id);
  const players = db.getActivePlayers();
  const statMap = buildStatMap(stats, players);
  const pid     = parseInt(player_id, 10);
  const lastStat = db.getLastStat(match.id);

  const payload = buildPlayerPayload(t, match, players, statMap, pid, lastStat);

  // Broadcast to all OTHER devices watching this match
  sse.broadcast(match.id, 'stat', payload);

  res.json({ ok: true, ...payload });
});

// ── POST /match/:id/stat/remove ──────────────────────────────────────────────
router.post('/:id/stat/remove', (req, res) => {
  const t = req.t;
  const { player_id, stat_type } = req.body;
  if (!STAT_TYPES.includes(stat_type)) return res.status(400).json({ error: 'invalid stat' });

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const removed = db.deleteLastStatOfType(match.id, player_id, stat_type);
  if (!removed) return res.json({ ok: false, message: 'Nothing to remove' });

  const stats   = db.getStatsByMatch(match.id);
  const players = match.category_id ? db.getActivePlayersByCat(match.category_id) : db.getActivePlayers();
  const statMap = buildStatMap(stats, players);
  const pid     = parseInt(player_id, 10);
  const lastStat = db.getLastStat(match.id);

  const payload = buildPlayerPayload(t, match, players, statMap, pid, lastStat);
  sse.broadcast(match.id, 'stat', payload);
  res.json({ ok: true, ...payload });
});

// ── POST /match/:id/undo ──────────────────────────────────────────────────────
router.post('/:id/undo', (req, res) => {
  const t = req.t;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const last = db.getLastStat(match.id);
  if (!last) return res.json({ ok: false, message: t('no_stats_yet') });

  const undone_pid = last.player_id;
  db.deleteStat(last.id);

  const stats   = db.getStatsByMatch(match.id);
  const players = db.getActivePlayers();
  const statMap = buildStatMap(stats, players);
  const newLast = db.getLastStat(match.id);

  const payload = {
    undone_player_id: undone_pid,
    undone_stat_type: last.stat_type,
    counts:  statMap[undone_pid] || {},
    points:  totalPoints(statMap, undone_pid),
    new_last: newLast ? {
      id:          newLast.id,
      player_name: players.find(p => p.id === newLast.player_id)?.name || '?',
      stat_label:  t(STAT_KEYS[newLast.stat_type]),
    } : null,
  };

  // Broadcast undo to all other devices
  sse.broadcast(match.id, 'undo', payload);

  res.json({ ok: true, ...payload });
});

// ── POST /match/:id/score ─────────────────────────────────────────────────────
router.post('/:id/score', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const { score_bsc, score_opponent } = req.body;
  db.updateMatchScore(match.id, score_bsc, score_opponent);

  const updated = db.getMatch(match.id);
  const payload = { ok: true, score_bsc: updated.score_bsc, score_opponent: updated.score_opponent };
  sse.broadcast(match.id, 'score', payload);
  res.json(payload);
});

// ── POST /match/:id/close ─────────────────────────────────────────────────────
router.post('/:id/close', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');
  db.closeMatch(match.id);
  sse.broadcast(match.id, 'closed', {});
  res.redirect(`/match/${match.id}`);
});

// ── POST /match/:id/reopen ────────────────────────────────────────────────────
router.post('/:id/reopen', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');
  db.reopenMatch(match.id);
  res.redirect(`/match/${match.id}`);
});

module.exports = router;
