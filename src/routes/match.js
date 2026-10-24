const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { layout } = require('../views/layout');

const STAT_TYPES = ['1pt','2pt','3pt','oreb','dreb','ast','to','blk','stl','pf'];
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

function totalPoints(statMap, playerId) {
  const m = statMap[playerId] || {};
  return (m['1pt'] || 0) * 1 + (m['2pt'] || 0) * 2 + (m['3pt'] || 0) * 3;
}

// ── GET /match/:id ─────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const isClosed = match.status === 'closed';
  const players  = db.getActivePlayers();
  const stats    = db.getStatsByMatch(match.id);
  const statMap  = buildStatMap(stats, players);
  const lastStat = db.getLastStat(match.id);

  const headerCols = STAT_TYPES.map(t => `<th class="stat-col">${STAT_LABELS[t]}</th>`).join('');

  const playerRows = players.map(p => {
    const statCells = STAT_TYPES.map(t => {
      const count = statMap[p.id][t] || 0;
      if (isClosed) {
        return `<td class="stat-cell"><span class="stat-val ${count > 0 ? 'has-val' : ''}">${count || '—'}</span></td>`;
      }
      return `<td class="stat-cell">
        <button class="stat-btn${count > 0 ? ' has-val' : ''}" data-match="${match.id}" data-player="${p.id}" data-stat="${t}">
          ${count > 0 ? count : '+'}
        </button>
      </td>`;
    }).join('');
    const pts = totalPoints(statMap, p.id);
    return `<tr id="player-row-${p.id}">
      <td class="player-cell"><span class="p-num">#${esc(p.number)}</span> ${esc(p.name)}</td>
      <td class="pts-cell" id="pts-${p.id}">${pts}</td>
      ${statCells}
    </tr>`;
  }).join('');

  const undoInfo = lastStat
    ? `Last: <strong>${esc(players.find(p=>p.id===lastStat.player_id)?.name||'?')}</strong> — ${STAT_LABELS[lastStat.stat_type]}`
    : 'No stats recorded yet';

  const closedBanner = isClosed ? `
    <div class="closed-banner">
      🔒 This match is closed — stats are locked.
      <a href="/admin" class="btn btn-sm">Reopen in Admin</a>
    </div>` : '';

  const liveControls = isClosed ? '' : `
    <div class="undo-bar" id="undo-bar">
      <span id="undo-info">${undoInfo}</span>
      <button class="btn btn-warning" id="undo-btn" ${!lastStat ? 'disabled' : ''} onclick="undoLast(${match.id})">↩ Undo</button>
    </div>
    <form method="POST" action="/match/${match.id}/close" onsubmit="return confirm('Close this match? Stats will be locked.')">
      <button class="btn btn-danger">🔒 Close Match</button>
    </form>`;

  const body = `
  ${closedBanner}
  <div class="match-header">
    <div>
      <h1>vs ${esc(match.opponent)}</h1>
      <p class="match-meta">${match.match_date}${match.location ? ' · '+esc(match.location) : ''} · ${esc(match.season_name)}</p>
    </div>
    <div class="match-actions">
      ${liveControls}
      <a href="/match/${match.id}/summary" class="btn btn-outline">Summary</a>
    </div>
  </div>

  <div class="live-table-wrap">
    <table class="live-table" id="live-table">
      <thead>
        <tr>
          <th class="player-col">Player</th>
          <th class="pts-col">PTS</th>
          ${headerCols}
        </tr>
      </thead>
      <tbody id="live-tbody">${playerRows}</tbody>
    </table>
  </div>

  <div id="toast" class="toast hidden"></div>`;

  res.send(layout(`vs ${match.opponent}`, body, {}));
});

// ── POST /match/:id/stat ─────────────────────────────────────────────────────
router.post('/:id/stat', (req, res) => {
  const { player_id, stat_type } = req.body;
  if (!STAT_TYPES.includes(stat_type)) return res.status(400).json({ error: 'invalid stat' });

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  db.insertStat(match.id, player_id, stat_type);

  const stats   = db.getStatsByMatch(match.id);
  const players = db.getActivePlayers();
  const statMap = buildStatMap(stats, players);
  const pid = parseInt(player_id, 10);

  res.json({
    ok: true,
    player_id: pid,
    counts: statMap[pid] || {},
    points: totalPoints(statMap, pid),
    last_stat_id: db.getLastStat(match.id)?.id,
    last_player_name: players.find(p => p.id === pid)?.name || '?',
    last_stat_type: stat_type,
    last_stat_label: STAT_LABELS[stat_type],
  });
});

// ── POST /match/:id/undo ──────────────────────────────────────────────────────
router.post('/:id/undo', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const last = db.getLastStat(match.id);
  if (!last) return res.json({ ok: false, message: 'Nothing to undo' });

  db.deleteStat(last.id);

  const stats   = db.getStatsByMatch(match.id);
  const players = db.getActivePlayers();
  const statMap = buildStatMap(stats, players);
  const pid = last.player_id;
  const newLast = db.getLastStat(match.id);

  res.json({
    ok: true,
    undone_player_id: pid,
    undone_stat_type: last.stat_type,
    counts: statMap[pid] || {},
    points: totalPoints(statMap, pid),
    new_last: newLast ? {
      id: newLast.id,
      player_name: players.find(p => p.id === newLast.player_id)?.name || '?',
      stat_label: STAT_LABELS[newLast.stat_type],
    } : null,
  });
});

// ── POST /match/:id/close ─────────────────────────────────────────────────────
router.post('/:id/close', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');
  db.closeMatch(match.id);
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
