/* ── Live match: optimistic taps, persistent retry queue, SSE sync, resync ──────
 *
 * Design
 *  - A tap is applied to the screen immediately and put in an ordered queue (kept in localStorage).
 *  - The queue is sent one op at a time. Every op carries a client-generated op_id; the server
 *    ignores an op_id it has already stored, so retrying after a lost response never double counts.
 *  - Displayed count = last known server count + still-pending ops of this device.
 *  - After a (re)connect, when the tab becomes visible again, or when the network returns, the full
 *    match state is fetched from /match/:id/state so nothing missed while offline stays missing.
 *
 * Loaded right after app.js, which provides tr, apiFetch, showToast, updateStatButtons, updateUndoBar.
 */
(function liveMatch() {
  'use strict';

  /* ── Closed match page: only wait for a reopen ─────────────────────────── */
  if (window._closedMatchId) {
    const es = new EventSource(`/match/${window._closedMatchId}/events`);
    es.addEventListener('reopened', () => { es.close(); window.location.reload(); });
    return;
  }

  const matchId = window._matchId;
  if (!matchId) return; // not a live match page

  const LABELS     = window._statLabels || {};
  const STAT_TYPES = Object.keys(LABELS);
  const QUEUE_KEY  = `bsc_queue_${matchId}`;

  const uuid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'op-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /* ── State ─────────────────────────────────────────────────────────────── */
  const server = {};          // playerId -> counts as last reported by the server
  let queue        = loadQueue(); // pending taps of THIS device, oldest first: { op_id, player_id, stat_type }
  let inFlight     = null;    // the op currently being sent
  let flushPromise = null;
  let failing      = false;   // last send failed for network/server reasons (will be retried)
  let blocked      = false;   // session expired: waiting for the user to log in again
  let fails        = 0;
  let retryTimer   = null;
  let confirmSeq   = 0;       // bumped whenever the server confirms one of our ops
  let serverMyLast = null;    // this device's last stat according to the server

  function loadQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q.filter(o => o && o.op_id && o.player_id && o.stat_type) : [];
    } catch (_) { return []; }
  }
  function persist() {
    try {
      if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      else localStorage.removeItem(QUEUE_KEY);
    } catch (_) { /* storage full / disabled: queue still works in memory */ }
  }

  /* ── Rendering ─────────────────────────────────────────────────────────── */
  function effective(pid) {
    const c = Object.assign({}, server[pid]);
    STAT_TYPES.forEach(st => { c[st] = c[st] || 0; });
    queue.forEach(op => { if (op.player_id === String(pid) && op.stat_type in c) c[op.stat_type] += 1; });
    return c;
  }
  const points = (c) => (c['1pt'] || 0) + 2 * (c['2pt'] || 0) + 3 * (c['3pt'] || 0);

  function render(pid) {
    pid = String(pid);
    const c = effective(pid);
    updateStatButtons(pid, c);
    const cell = document.getElementById(`pts-${pid}`);
    if (cell) cell.textContent = points(c);
  }
  const renderAll = () => Object.keys(server).forEach(render);

  function playerName(pid) {
    const row = document.getElementById(`player-row-${pid}`);
    return row ? row.dataset.name : '?';
  }

  /** Undo bar: the newest still-pending tap if there is one, otherwise the server's view. */
  function refreshUndoBar() {
    const last = queue[queue.length - 1];
    if (last) {
      updateUndoBar({ player_name: playerName(last.player_id), stat_label: LABELS[last.stat_type] || last.stat_type });
    } else {
      updateUndoBar(serverMyLast);
    }
  }

  function updateBadge() {
    const el = document.getElementById('pending-badge');
    if (!el) return;
    const show = queue.length > 0 && (failing || blocked);
    el.textContent = show ? tr('pending_sync').replace('{n}', queue.length) : '';
    el.classList.toggle('hidden', !show);
  }

  function setDot(on) {
    const dot = document.getElementById('sync-dot');
    if (!dot) return;
    dot.classList.toggle('sync-dot--on', on);
    dot.classList.toggle('sync-dot--off', !on);
  }

  /* ── Sending the queue ────────────────────────────────────────────────── */
  function scheduleRetry() {
    clearTimeout(retryTimer);
    fails += 1;
    retryTimer = setTimeout(flush, Math.min(10000, 1000 * Math.pow(2, Math.min(fails, 4))));
  }

  function removeFromQueue(op) {
    const i = queue.indexOf(op);
    if (i >= 0) { queue.splice(i, 1); persist(); }
  }

  function flush() {
    if (flushPromise) return flushPromise;
    if (!queue.length) return Promise.resolve();

    flushPromise = (async () => {
      await Promise.resolve(); // guarantees flushPromise is assigned before the loop can finish
      try {
        while (queue.length) {
          const op = queue[0];
          inFlight = op;

          let res;
          const ctl   = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 10000);
          try {
            res = await apiFetch(`/match/${matchId}/stat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op),
              signal: ctl.signal,
            });
          } catch (err) {
            inFlight = null;
            if (err.handled) blocked = true;          // 401: wait for a new login
            else { failing = true; scheduleRetry(); } // offline / timeout: retry later
            break;
          } finally {
            clearTimeout(timer);
          }
          inFlight = null;

          // The server definitively refused this op: retrying cannot help.
          if (res.status === 403) {                    // match closed
            queue = []; persist();
            showToast(tr('match_closed_banner'), true);
            renderAll();
            break;
          }
          if (res.status === 400 || res.status === 404) {
            removeFromQueue(op);
            showToast(tr('error_retry'), true);
            render(op.player_id);
            continue;
          }
          if (!res.ok) { failing = true; scheduleRetry(); break; } // 5xx etc.

          let data;
          try { data = await res.json(); } catch (_) { failing = true; scheduleRetry(); break; }
          if (!data.ok) { removeFromQueue(op); render(op.player_id); continue; }

          // Confirmed by the server
          removeFromQueue(op);
          confirmSeq += 1;
          fails = 0; failing = false; blocked = false;
          server[String(data.player_id)] = data.counts;
          if (!queue.length) serverMyLast = data.my_last;
          render(data.player_id);
          refreshUndoBar();
        }
        if (!queue.length) { failing = false; fails = 0; clearTimeout(retryTimer); }
      } finally {
        inFlight = null;
        flushPromise = null;
        updateBadge();
      }
    })();
    return flushPromise;
  }

  /* ── Taps ─────────────────────────────────────────────────────────────── */
  function enqueue(pid, st) {
    queue.push({ op_id: uuid(), player_id: String(pid), stat_type: st });
    persist();
    blocked = false;
    render(pid);
    refreshUndoBar();
    if (navigator.vibrate) navigator.vibrate(12);
    showToast(`+${LABELS[st] || st} — ${playerName(pid)}`);
    flush();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.stat-btn, .edit-btn-plus');
    if (!btn) return;
    enqueue(btn.dataset.player, btn.dataset.stat);
    if (btn.classList.contains('stat-btn')) {
      btn.classList.add('flash');
      setTimeout(() => btn.classList.remove('flash'), 300);
    }
  });

  /* Edit mode "−": cancel a not-yet-sent tap if there is one, otherwise remove on the server */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.edit-btn-minus');
    if (!btn) return;
    const pid = String(btn.dataset.player), st = btn.dataset.stat;

    for (;;) {
      let i = -1;
      for (let k = queue.length - 1; k >= 0; k--) {
        if (queue[k].player_id === pid && queue[k].stat_type === st) { i = k; break; }
      }
      if (i < 0) break;
      if (queue[i] === inFlight && flushPromise) { await flushPromise; continue; } // let it settle first
      queue.splice(i, 1); persist();
      render(pid); refreshUndoBar(); updateBadge();
      showToast(tr('removed'));
      return;
    }

    btn.disabled = true;
    try {
      const res  = await apiFetch(`/match/${matchId}/stat/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: pid, stat_type: st }),
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.message || tr('nothing_to_remove')); return; }
      server[String(data.player_id)] = data.counts;
      if (!queue.length) serverMyLast = data.my_last;
      showToast(tr('removed'));
    } catch (err) {
      if (!err.handled) showToast(tr('error_retry'), true);
      console.error(err);
    } finally {
      btn.disabled = false;
      render(pid);
      refreshUndoBar();
    }
  });

  /* Undo: cancels this device's newest unsent tap, otherwise its newest saved stat */
  window.undoLast = async function undoLast() {
    for (;;) {
      if (!queue.length) break;
      const last = queue[queue.length - 1];
      if (last === inFlight && flushPromise) { await flushPromise; continue; } // let it settle first
      queue.pop(); persist();
      render(last.player_id); refreshUndoBar(); updateBadge();
      showToast(tr('undone'));
      return;
    }
    try {
      const res  = await apiFetch(`/match/${matchId}/undo`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) { showToast(data.message || tr('nothing_to_undo')); return; }
      server[String(data.undone_player_id)] = data.counts;
      serverMyLast = data.my_last;
      render(data.undone_player_id);
      refreshUndoBar();
      showToast(tr('undone'));
    } catch (err) {
      if (!err.handled) showToast(tr('error_retry'), true);
      console.error(err);
    }
  };

  /* ── Full resync (after reconnect / tab visible / back online) ─────────── */
  async function resync(retries = 2) {
    const seq = confirmSeq;
    try {
      const res = await apiFetch(`/match/${matchId}/state`);
      const s   = await res.json();
      if (!s.ok) return;
      if (s.status === 'closed') { window.location.reload(); return; }
      // One of our taps was confirmed while this snapshot was being taken: it may be stale, ask again
      if (seq !== confirmSeq && retries > 0) { resync(retries - 1); return; }

      Object.keys(s.players).forEach(pid => { server[pid] = s.players[pid].counts; });
      serverMyLast = s.my_last;
      applyScore(s.score_bsc, s.score_opponent);
      renderAll();
      refreshUndoBar();
    } catch (_) { /* offline: the next reconnect tries again */ }
  }

  function applyScore(bsc, opp) {
    const bscInput = document.getElementById('score-bsc-input');
    const oppInput = document.getElementById('score-opp-input');
    // Don't clobber a field somebody is typing in
    if (bscInput && document.activeElement !== bscInput) bscInput.value = bsc;
    if (oppInput && document.activeElement !== oppInput) oppInput.value = opp;
  }

  /* ── Live updates from other devices (SSE) ─────────────────────────────── */
  function connect() {
    const es = new EventSource(`/match/${matchId}/events`);

    es.addEventListener('open', () => { setDot(true); resync(); flush(); });

    es.addEventListener('error', () => {
      setDot(false);
      es.close();
      setTimeout(connect, 3000);
    });

    es.addEventListener('stat', (e) => {
      const d = JSON.parse(e.data);
      // Echo of one of OUR taps: the server count now includes it, so it is no longer "pending"
      if (d.op_id) {
        const mine = queue.find(o => o.op_id === d.op_id);
        if (mine) { removeFromQueue(mine); confirmSeq += 1; updateBadge(); }
      }
      server[String(d.player_id)] = d.counts;
      render(d.player_id);
      // An edit-mode removal elsewhere may have deleted this device's own newest stat
      if (d.removed) resync();
    });

    // Another device hit undo (it only removes that device's own stat, so our undo bar is unaffected)
    es.addEventListener('undo', (e) => {
      const d = JSON.parse(e.data);
      server[String(d.undone_player_id)] = d.counts;
      render(d.undone_player_id);
    });

    es.addEventListener('score', (e) => {
      const d = JSON.parse(e.data);
      applyScore(d.score_bsc, d.score_opponent);
    });

    es.addEventListener('closed', () => { es.close(); window.location.reload(); });
    // Roster changed on another device: rows were added/removed, so rebuild the page (unsent taps stay queued)
    es.addEventListener('roster', () => { es.close(); window.location.reload(); });
  }

  /* ── Keep the screen awake while recording ─────────────────────────────── */
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) { /* not allowed (e.g. low battery / insecure context): ignore */ }
  }

  /* ── Boot ──────────────────────────────────────────────────────────────── */
  // Server-rendered buttons show the current server counts: take them as the baseline
  document.querySelectorAll('.stat-btn:not(.accord-btn)').forEach(b => {
    const pid = b.dataset.player;
    (server[pid] = server[pid] || {})[b.dataset.stat] = parseInt(b.textContent, 10) || 0;
  });
  if (queue.length) { renderAll(); refreshUndoBar(); flush(); }
  updateBadge();

  connect();
  requestWakeLock();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    requestWakeLock();
    resync();
    flush();
  });
  window.addEventListener('online', () => { flush(); resync(); });

  // Warn before leaving the page while taps are still unsent
  window.addEventListener('beforeunload', (e) => {
    if (queue.length) { e.preventDefault(); e.returnValue = ''; }
  });
})();
