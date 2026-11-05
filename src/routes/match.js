const crypto   = require('crypto');
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const sse      = require('../sse');
const { layout } = require('../views/layout');
const { buildTour } = require('../tour');
const { esc } = require('../util');
const { STAT_TYPES, STAT_KEYS, SHOT_MISS, buildStatMap, pointsOf } = require('../stats');

const isMiss = (st) => SHOT_MISS.includes(st);
// Class suffixes for a stat button: red tint for misses, wider cell in the accordion for the six shot buttons
const statClass  = (st) => (isMiss(st) ? ' is-miss' : '');
const shotClass  = (st) => (st.startsWith('1pt') || st.startsWith('2pt') || st.startsWith('3pt') ? ' accord-shot' : '');

// ── Per-browser device id (used so Undo only touches this device's own stats) ──
// Random id kept in a long-lived cookie; no login or setup needed.
router.use((req, res, next) => {
  const m = /(?:^|;\s*)bsc_device=([\w-]{8,64})/.exec(req.headers.cookie || '');
  if (m) {
    req.deviceId = m[1];
  } else {
    req.deviceId = crypto.randomUUID();
    res.cookie('bsc_device', req.deviceId, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax' });
  }
  next();
});

/** This device's newest stat as { player_name, stat_label }, or null if none. */
function buildMyLast(t, matchId, deviceId) {
  const s = db.getLastStatByDevice(matchId, deviceId);
  if (!s) return null;
  return {
    player_name: playerName(s.player_id),
    stat_label:  t(STAT_KEYS[s.stat_type]),
  };
}

/** Players shown on (and allowed to receive stats in) this match: its roster, else its whole category. */
const getMatchPlayers = (match) => db.getMatchPlayers(match);

/** Look up a player's display name among ALL players (also inactive ones). */
function playerName(playerId) {
  return db.getPlayers().find(p => p.id === playerId)?.name || '?';
}

const totalPoints = (statMap, playerId) => pointsOf(statMap[playerId] || {});

/** Build the SSE broadcast payload for a player after any stat change. */
function buildPlayerPayload(t, match, players, statMap, pid, lastStat) {
  const newLast = lastStat;
  return {
    player_id:        pid,
    counts:           statMap[pid] || {},
    points:           totalPoints(statMap, pid),
    last_player_name: newLast ? playerName(newLast.player_id) : null,
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
  const players = getMatchPlayers(match);
  const stats    = db.getStatsByMatch(match.id);
  const statMap  = buildStatMap(stats, players);
  const myLastStat = db.getLastStatByDevice(match.id, req.deviceId);

  // Season pts per player (all matches in the season, including this one live)
  const seasonId     = match.season_id;
  const seasonPtsMap = db.getSeasonPtsByPlayer(seasonId);

  const headerCols = STAT_TYPES.map(st => `<th class="stat-col${statClass(st)}">${t(STAT_KEYS[st])}</th>`).join('');

  const playerRows = players.map(p => {
    const statCells = STAT_TYPES.map(st => {
      const count = statMap[p.id][st] || 0;
      if (isClosed) {
        return `<td class="stat-cell"><span class="stat-val ${count > 0 ? 'has-val' : ''}">${count || '—'}</span></td>`;
      }
      return `<td class="stat-cell">
        <button class="stat-btn${statClass(st)}${count > 0 ? ' has-val' : ''}" data-match="${match.id}" data-player="${p.id}" data-stat="${st}">
          ${count > 0 ? count : '+'}
        </button>
      </td>`;
    }).join('');

    // Accordion: normal tap-to-add buttons
    const accordionBtns = isClosed ? '' : STAT_TYPES.map(st => {
      const count = statMap[p.id][st] || 0;
      return `<button class="stat-btn accord-btn${statClass(st)}${shotClass(st)}${count > 0 ? ' has-val' : ''}" data-match="${match.id}" data-player="${p.id}" data-stat="${st}">
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
    <tr id="player-row-${p.id}" class="player-main-row" data-player-id="${p.id}" data-name="${esc(p.name)}">
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

  const undoInfo = myLastStat
    ? `${t('your_last')}: <strong>${esc(playerName(myLastStat.player_id))}</strong> — ${t(STAT_KEYS[myLastStat.stat_type])}`
    : t('nothing_to_undo');

  const closedBanner = isClosed ? `
    <div class="closed-banner">
      ${t('match_closed_banner')}
      <a href="/admin" class="btn btn-sm">${t('reopen_in_admin')}</a>
    </div>` : '';

  const liveControls = isClosed ? '' : `
    <div class="undo-bar" id="undo-bar">
      <span id="undo-info" data-your-label="${esc(t('your_last'))}" data-empty-label="${esc(t('nothing_to_undo'))}">${undoInfo}</span>
      <button class="btn btn-warning" id="undo-btn" ${!myLastStat ? 'disabled' : ''} onclick="undoLast(${match.id})">${t('undo')}</button>
    </div>
    <button class="btn btn-outline" id="edit-mode-btn" onclick="toggleEditMode()"
      data-edit-label="${esc(t('edit_mode'))}" data-exit-label="${esc(t('edit_mode_exit'))}">${t('edit_mode')}</button>
    <form method="POST" action="/match/${match.id}/close" data-confirm="${esc(t('confirm_close'))}">
      <button class="btn btn-danger">${t('close_match_btn')}</button>
    </form>`;

  // SSE indicator — shows a small dot when live sync is active
  const syncIndicator = isClosed ? '' :
    `<span id="sync-dot" class="sync-dot sync-dot--off" title="Live sync"></span>
     <span id="pending-badge" class="pending-badge hidden" role="status"></span>`;

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

  // Roster picker (open matches only). No saved roster = everyone in the category is on the list.
  let rosterBox = '';
  if (!isClosed) {
    const saved      = db.getMatchRoster(match.id);
    const hasStat    = new Set(stats.map(s => s.player_id));
    const candidates = db.getRosterCandidates(match);
    const checks = candidates.map(p => {
      const locked = hasStat.has(p.id);
      const on     = locked || !saved.length || saved.includes(p.id);
      return `<label class="roster-item${locked ? ' roster-item--locked' : ''}"${locked ? ` title="${esc(t('roster_has_stats'))}"` : ''}>
        <input type="checkbox" name="player_ids" value="${p.id}"${on ? ' checked' : ''}${locked ? ' disabled' : ''}>
        <span class="p-num">#${esc(p.number)}</span> ${esc(p.name)}
      </label>`;
    }).join('');
    rosterBox = `
    <details class="roster-box">
      <summary>👥 ${t('roster')} <span class="roster-count">(${players.length})</span></summary>
      <form method="POST" action="/match/${match.id}/roster">
        <p class="roster-hint">${t('roster_hint')}</p>
        <div class="roster-list">${checks || `<span class="empty">${t('no_data')}</span>`}</div>
        <button class="btn btn-primary btn-sm">${t('save')}</button>
      </form>
    </details>`;
  }

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
      <a href="/share/match/${esc(match.share_token)}" target="_blank" class="btn btn-outline">🔗 ${t('share')}</a>
    </div>
  </div>

  ${rosterBox}

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
  ${!isClosed
    ? `<script>window._matchId = ${match.id}; window._statLabels = ${JSON.stringify(Object.fromEntries(STAT_TYPES.map(st => [st, t(STAT_KEYS[st])]))).replace(/</g, '\\u003c')};</script>`
    : `<script>window._closedMatchId = ${match.id};</script>`}`;

  res.send(layout(`${t('vs')} ${match.opponent}`, body, { lang, t, tour: isClosed ? null : buildTour('match', t) }));
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

// ── GET /match/:id/state  (full snapshot, used to resync after a dropped connection) ──
router.get('/:id/state', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ ok: false, error: 'match not found' });

  const players = getMatchPlayers(match);
  const statMap = buildStatMap(db.getStatsByMatch(match.id), players);
  const out = {};
  players.forEach(p => { out[p.id] = { counts: statMap[p.id], points: totalPoints(statMap, p.id) }; });

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    status:         match.status,
    score_bsc:      match.score_bsc || 0,
    score_opponent: match.score_opponent || 0,
    players:        out,
    my_last:        buildMyLast(req.t, match.id, req.deviceId),
  });
});

// ── POST /match/:id/stat ─────────────────────────────────────────────────────
router.post('/:id/stat', (req, res) => {
  const t = req.t;
  const { player_id, stat_type } = req.body;
  // Client-generated id of this tap: a retried request with the same id is never counted twice
  const opId = /^[\w-]{8,64}$/.test(req.body.op_id || '') ? req.body.op_id : null;
  if (!STAT_TYPES.includes(stat_type)) return res.status(400).json({ error: 'invalid stat' });

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const players = getMatchPlayers(match);
  const pid     = parseInt(player_id, 10);
  if (!players.some(p => p.id === pid)) return res.status(400).json({ error: 'invalid player' });

  const inserted = db.insertStat(match.id, pid, stat_type, req.deviceId, opId);

  const stats   = db.getStatsByMatch(match.id);
  const statMap = buildStatMap(stats, players);
  const lastStat = db.getLastStat(match.id);

  const payload = buildPlayerPayload(t, match, players, statMap, pid, lastStat);

  // Broadcast to all devices watching this match (a duplicate retry changed nothing, so nothing to announce)
  if (inserted) sse.broadcast(match.id, 'stat', opId ? { ...payload, op_id: opId } : payload);

  // my_last is private to the requesting device — never broadcast
  res.json({ ok: true, ...payload, my_last: buildMyLast(t, match.id, req.deviceId) });
});

// ── POST /match/:id/stat/remove ──────────────────────────────────────────────
router.post('/:id/stat/remove', (req, res) => {
  const t = req.t;
  const { player_id, stat_type } = req.body;
  if (!STAT_TYPES.includes(stat_type)) return res.status(400).json({ error: 'invalid stat' });

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  const pid = parseInt(player_id, 10);
  const removed = db.deleteLastStatOfType(match.id, pid, stat_type);
  if (!removed) return res.json({ ok: false, message: t('nothing_to_remove') });

  const stats   = db.getStatsByMatch(match.id);
  const players = getMatchPlayers(match);
  const statMap = buildStatMap(stats, players);
  const lastStat = db.getLastStat(match.id);

  const payload = buildPlayerPayload(t, match, players, statMap, pid, lastStat);
  // `removed` tells other devices to re-check their own "Your last" (the removed stat may have been theirs)
  sse.broadcast(match.id, 'stat', { ...payload, removed: true });
  res.json({ ok: true, ...payload, my_last: buildMyLast(t, match.id, req.deviceId) });
});

// ── GET /match/:id/my-last ────────────────────────────────────────────────────
router.get('/:id/my-last', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  res.json({ my_last: buildMyLast(req.t, match.id, req.deviceId) });
});

// ── POST /match/:id/undo ──────────────────────────────────────────────────────
router.post('/:id/undo', (req, res) => {
  const t = req.t;
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'match not found' });
  if (match.status === 'closed') return res.status(403).json({ error: 'match is closed' });

  // Only this device's own stats can be undone (older stats without a device id never match)
  const last = db.getLastStatByDevice(match.id, req.deviceId);
  if (!last) return res.json({ ok: false, message: t('nothing_to_undo') });

  const undone_pid = last.player_id;
  db.deleteStat(last.id);

  const stats   = db.getStatsByMatch(match.id);
  const players = getMatchPlayers(match);
  const statMap = buildStatMap(stats, players);

  const payload = {
    undone_player_id: undone_pid,
    undone_stat_type: last.stat_type,
    counts:  statMap[undone_pid] || {},
    points:  totalPoints(statMap, undone_pid),
  };

  // Broadcast undo to all other devices
  sse.broadcast(match.id, 'undo', payload);

  res.json({ ok: true, ...payload, my_last: buildMyLast(t, match.id, req.deviceId) });
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

// ── POST /match/:id/roster ────────────────────────────────────────────────────
// Who attended. Players who already have a stat can't be removed (their checkbox is disabled in the form).
router.post('/:id/roster', (req, res) => {
  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');
  if (match.status === 'closed') return res.redirect(`/match/${match.id}`);

  const raw      = [].concat(req.body.player_ids || []);
  const allowed  = new Set(db.getRosterCandidates(match).map(p => p.id));
  const picked   = raw.map(v => parseInt(v, 10)).filter(id => allowed.has(id));
  const withStat = db.getStatsByMatch(match.id).map(s => s.player_id);
  const ids      = [...new Set([...picked, ...withStat])];

  // Everybody ticked = same as no roster (keeps new category players showing up automatically)
  const everyone = [...allowed].every(id => ids.includes(id));
  db.setMatchRoster(match.id, everyone ? [] : ids);
  sse.broadcast(match.id, 'roster', {});
  res.redirect(`/match/${match.id}`);
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
  sse.broadcast(match.id, 'reopened', {});
  res.redirect(`/match/${match.id}`);
});

module.exports = router;
