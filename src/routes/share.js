const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const sse       = require('../sse');
const { getT, DEFAULT_LANG } = require('../i18n');
const { esc } = require('../util');
const { buildStatMap, pointsOf, reboundsOf, shooting, shotsTracked, splitText } = require('../stats');

const totalPoints = pointsOf;
const totalReb    = reboundsOf;
function totalAst(m) { return m['ast']||0; }

const TOKEN_RE = /^[\w-]{16,64}$/;

// Keep shared pages out of search engines and don't leak the token via Referer
function privacyHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function findMatch(token) {
  return TOKEN_RE.test(token) ? db.getMatchByShareToken(token) : null;
}

// Everything the page shows that changes during a match. Rendered on the server once, so the
// initial page and the live updates (JSON fragments swapped in by the client) use the same markup.
function buildView(match, t) {
  const players  = db.getMatchPlayers(match);   // the match roster, else its whole category
  const stats    = db.getStatsByMatch(match.id);
  const statMap  = buildStatMap(stats, players);
  // FG column appears when at least one player has misses recorded; each player's own cell shows a dash otherwise
  const tracked  = players.some(p => shotsTracked(statMap[p.id] || {}));

  const scoreBsc = match.score_bsc || 0;
  const scoreOpp = match.score_opponent || 0;
  const hasScore = scoreBsc > 0 || scoreOpp > 0;

  const scoreStr = hasScore ? `${scoreBsc}–${scoreOpp}` : '';
  const resultClass = !hasScore ? '' : scoreBsc > scoreOpp ? 'result--win' : scoreBsc < scoreOpp ? 'result--loss' : 'result--draw';

  // Stat rows — alphabetical, include all players
  const playerRows = [...players].sort((a,b) => a.name.localeCompare(b.name)).map(p => {
    const m   = statMap[p.id] || {};
    const pts = totalPoints(m);
    const reb = totalReb(m);
    const ast = totalAst(m);
    const fg  = shooting(m).fg;
    return `
    <tr>
      <td class="sh-player"><span class="sh-num">#${esc(p.number)}</span> ${esc(p.name)}</td>
      <td class="sh-stat"><strong>${pts}</strong><span class="sh-lbl">pts</span></td>
      <td class="sh-stat">${reb}<span class="sh-lbl">reb</span></td>
      <td class="sh-stat">${ast}<span class="sh-lbl">ast</span></td>
      ${tracked ? `<td class="sh-stat">${shotsTracked(m) ? splitText(fg) : '—'}<span class="sh-lbl">fg</span></td>` : ''}
    </tr>`;
  }).join('');

  // Build clipboard text
  const header = `🏀 BSC vs ${match.opponent}${hasScore ? ` ${scoreStr}` : ''} · ${match.match_date}`;
  const lines  = [...players].sort((a,b) => a.name.localeCompare(b.name)).map(p => {
    const m   = statMap[p.id] || {};
    const pts = totalPoints(m);
    const reb = totalReb(m);
    const ast = totalAst(m);
    const fg  = shooting(m).fg;
    return `${p.name}: ${pts}pts ${reb}reb${ast > 0 ? ` ${ast}ast` : ''}${shotsTracked(m) && fg.a > 0 ? ` ${splitText(fg)}fg` : ''}`;
  }).join('\n');
  const shareText = `${header}\n${lines}\n#BSCBratislava`;

  const statusHtml = match.status === 'closed'
    ? `<span class="sh-badge sh-badge--closed">🔒 ${t('closed')}</span>`
    : `<span class="sh-badge sh-badge--live">🟢 ${t('sh_live')}</span>`;

  const scoreHtml = hasScore ? `
  <div class="sh-score-wrap">
    <div class="sh-score ${resultClass}">
      <div>
        <div class="sh-score-team">BSC</div>
        <div class="sh-score-val">${scoreBsc}</div>
      </div>
      <div class="sh-score-sep">—</div>
      <div>
        <div class="sh-score-team">${esc(match.opponent)}</div>
        <div class="sh-score-val">${scoreOpp}</div>
      </div>
    </div>
  </div>` : '';

  const tableHtml = `<table>
      <thead><tr><th>${t('sh_player')}</th><th>${t('sh_pts')}</th><th>${t('sh_reb')}</th><th>${t('sh_ast')}</th>${tracked ? `<th>${t('sh_fg')}</th>` : ''}</tr></thead>
      <tbody>${playerRows}</tbody>
    </table>`;

  const noteHtml = tracked ? `<p class="sh-note">${t('shooting_note')}</p>` : '';

  return { hasScore, scoreStr, shareText, statusHtml, scoreHtml, tableHtml, noteHtml };
}

// ── GET /share/match/:token/data ──────────────────────────────────────────────
// Public JSON with the current HTML fragments; the live share page fetches this on every change.
router.get('/match/:token/data', (req, res) => {
  privacyHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  const match = findMatch(req.params.token);
  if (!match) return res.status(404).json({ ok: false });

  const v = buildView(match, getT(req.session?.lang || DEFAULT_LANG));
  res.json({ ok: true, status: v.statusHtml, score: v.scoreHtml, table: v.tableHtml, note: v.noteHtml, shareText: v.shareText });
});

// ── GET /share/match/:token/events  (SSE) ─────────────────────────────────────
// Public. Carries no stat data — only a bare `changed` signal telling the page to re-fetch /data.
router.get('/match/:token/events', (req, res) => {
  privacyHeaders(res);
  const match = findMatch(req.params.token);
  if (!match) return res.status(404).end();

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (!sse.addWatcher(match.id, res)) return res.status(503).end();
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sse.removeWatcher(match.id, res);
  });
});

// ── GET /share/match/:token ───────────────────────────────────────────────────
// Public (no login). The URL carries an unguessable per-match token, not the sequential id.
router.get('/match/:token', (req, res) => {
  const lang = req.session?.lang || DEFAULT_LANG;
  const t    = getT(lang);

  privacyHeaders(res);
  res.setHeader('Cache-Control', 'no-store');

  const match = findMatch(req.params.token);
  if (!match) return res.status(404).send('Match not found');

  const { hasScore, scoreStr, shareText, statusHtml, scoreHtml, tableHtml, noteHtml } = buildView(match, t);

  const matchTypeBadge = match.match_type && match.match_type !== 'league'
    ? `<span class="sh-type-badge sh-type-${esc(match.match_type)}">${t('match_type_' + match.match_type)}${match.tournament_name ? ` · ${esc(match.tournament_name)}` : ''}</span>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">

  <meta property="og:title" content="BSC vs ${esc(match.opponent)}${hasScore ? ` ${scoreStr}` : ''}">
  <meta property="og:description" content="${esc(shareText.split('\n').slice(1).join(' · '))}">
  <title>BSC vs ${esc(match.opponent)}${hasScore ? ` ${scoreStr}` : ''}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --blue: #0030ae; --yellow: #ffd700; --bg: #edf0f7;
      --surface: #fff; --border: #dde1e7; --text: #1a1f2e; --muted: #6b7280;
      --green: #15803d; --red: #b91c1c; --radius: 8px;
    }
    body { font-family: -apple-system,"Segoe UI",system-ui,sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    h1,h2,h3 { font-family: "Barlow Condensed",system-ui,sans-serif; font-weight: 700; }
    a { color: var(--blue); }

    .sh-wrap { max-width: 480px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }

    /* Header */
    .sh-header { display: flex; align-items: center; gap: .6rem; margin-bottom: 1.5rem; padding-bottom: .75rem; border-bottom: 2px solid var(--border); }
    .sh-logo { height: 40px; width: auto; }
    .sh-club { font-family: "Barlow Condensed",system-ui,sans-serif; font-weight: 800; font-size: .95rem; color: var(--blue); line-height: 1.15; }
    .sh-club span { display: block; font-size: .7rem; font-weight: 600; color: var(--muted); letter-spacing: .04em; text-transform: uppercase; }

    /* Match title */
    .sh-match-title { font-size: 1.5rem; color: var(--blue); line-height: 1.15; margin-bottom: .3rem; }
    .sh-meta { font-size: .82rem; color: var(--muted); margin-bottom: .75rem; }
    .sh-badges { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
    .sh-badge { font-size: .72rem; font-weight: 700; padding: .15rem .5rem; border-radius: 999px; }
    .sh-badge--closed { background: #fee2e2; color: #b91c1c; }
    .sh-badge--live   { background: #dcfce7; color: #15803d; }
    .sh-type-badge { font-size: .72rem; font-weight: 700; padding: .15rem .5rem; border-radius: 999px; }
    .sh-type-tournament { background: #fef9c3; color: #854d0e; }
    .sh-type-friendly   { background: #dcfce7; color: #166534; }

    /* Score */
    .sh-score-wrap { text-align: center; margin-bottom: 1.25rem; }
    .sh-score {
      display: inline-flex; align-items: center; gap: .6rem;
      background: var(--blue); border-radius: var(--radius); padding: .4rem 1.25rem;
    }
    .sh-score-val { font-family: "Barlow Condensed",system-ui,sans-serif; font-size: 2.2rem; font-weight: 800; color: #fff; min-width: 2ch; text-align: center; line-height: 1; }
    .sh-score-sep { font-family: "Barlow Condensed",system-ui,sans-serif; font-size: 1.6rem; font-weight: 700; color: var(--yellow); }
    .sh-score-team { font-family: "Barlow Condensed",system-ui,sans-serif; font-size: .8rem; font-weight: 700; color: rgba(255,255,255,.65); letter-spacing: .05em; text-transform: uppercase; text-align: center; }
    .result--win  .sh-score-val:first-of-type { color: var(--yellow); }
    .result--loss .sh-score-val:last-of-type  { color: var(--yellow); }

    /* Stats table */
    .sh-table-wrap { background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; margin-bottom: 1.25rem; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: var(--blue); color: #e2e8f0; font-family: "Barlow Condensed",system-ui,sans-serif; font-size: .8rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: .45rem .6rem; text-align: center; }
    thead th:first-child { text-align: left; }
    tbody tr:hover td { background: #f5f7fb; }
    tbody tr:last-child td { border-bottom: none; }
    td { padding: .5rem .6rem; border-bottom: 1px solid #f0f2f5; font-size: .875rem; text-align: center; }
    .sh-player { text-align: left !important; white-space: nowrap; }
    .sh-num { color: var(--muted); font-size: .75rem; }
    .sh-stat strong { font-size: 1rem; font-weight: 800; color: var(--blue); }
    .sh-lbl { font-size: .65rem; color: var(--muted); margin-left: .1rem; text-transform: uppercase; }

    /* Copy button */
    .sh-copy-btn {
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      width: 100%; padding: .7rem 1rem; border-radius: var(--radius);
      background: var(--yellow); border: none; cursor: pointer;
      font-family: "Barlow Condensed",system-ui,sans-serif;
      font-size: 1.05rem; font-weight: 700; letter-spacing: .03em; color: var(--text);
      transition: background .15s; margin-bottom: .75rem;
    }
    .sh-copy-btn:active { background: #c9b200; }
    .sh-copy-btn.copied { background: #dcfce7; color: #15803d; }

    /* Footer */
    .sh-offline { font-size: .72rem; color: var(--muted); }
    .sh-offline[hidden] { display: none; }
    .sh-note { font-size: .72rem; color: var(--muted); margin: -.6rem 0 1rem; line-height: 1.4; }
    .sh-footer { text-align: center; font-size: .72rem; color: var(--muted); margin-top: 2rem; border-top: 1px solid var(--border); padding-top: .75rem; }
  </style>
  <link rel="stylesheet" href="/fonts/fonts.css">
</head>
<body>
<div class="sh-wrap">

  <div class="sh-header">
    <img src="/img/BSC_logo.jpg" alt="BSC Bratislava" class="sh-logo">
    <div class="sh-club">BSC Bratislava<span>Player Statistics</span></div>
  </div>

  <h1 class="sh-match-title">BSC vs ${esc(match.opponent)}</h1>
  <p class="sh-meta">${match.match_date}${match.location ? ' · ' + esc(match.location) : ''} · ${esc(match.season_name)}</p>
  <div class="sh-badges"><span id="sh-status">${statusHtml}</span>${matchTypeBadge}<span id="sh-offline" class="sh-offline" hidden>${t('sh_offline')}</span></div>

  <div id="sh-score">${scoreHtml}</div>

  <div class="sh-table-wrap" id="sh-table">${tableHtml}</div>

  <div id="sh-note">${noteHtml}</div>

  <button class="sh-copy-btn" id="copy-btn" onclick="copyShare()">${t('sh_copy')}</button>

  <div class="sh-footer">${t('sh_footer')}</div>
</div>

<script>
let _shareText = ${JSON.stringify(shareText).replace(/</g, '\\u003c')};
const _lblCopy = ${JSON.stringify(t('sh_copy'))};
const _lblCopied = ${JSON.stringify(t('sh_copied'))};
function copyShare() {
  const btn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(_shareText).then(() => {
    btn.textContent = _lblCopied;
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = _lblCopy; btn.classList.remove('copied'); }, 2500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = _shareText;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = _lblCopied;
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = _lblCopy; btn.classList.remove('copied'); }, 2500);
  });
}

// ── Live updates ──
// The events stream only says "something changed"; the numbers are fetched from /data.
(function () {
  const base = location.pathname.replace(/\/$/, '');
  const offline = document.getElementById('sh-offline');
  let timer = null, es = null, retry = null;

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function refresh() {
    fetch(base + '/data', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setHtml('sh-status', d.status);
        setHtml('sh-score', d.score);
        setHtml('sh-table', d.table);
        setHtml('sh-note', d.note);
        _shareText = d.shareText;
        offline.hidden = true;
      })
      .catch(() => { offline.hidden = false; });
  }

  // A burst of events (several stats in a second) becomes one fetch
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 300);
  }

  function connect() {
    clearTimeout(retry);
    if (es) es.close();
    es = new EventSource(base + '/events');
    es.addEventListener('changed', schedule);
    es.onopen = () => { offline.hidden = true; refresh(); };   // also catches up on anything missed while offline
    es.onerror = () => {
      offline.hidden = false;
      es.close();
      retry = setTimeout(connect, 3000);
    };
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', connect);
  if (window.EventSource) connect();
})();
</script>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
