const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const { getT }  = require('../i18n');

const STAT_TYPES = ['1pt','2pt','3pt','oreb','dreb','ast','to','blk','stl','pf'];

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

function totalReb(m) { return (m['oreb']||0) + (m['dreb']||0); }
function totalAst(m) { return m['ast']||0; }

// ── GET /share/match/:id ──────────────────────────────────────────────────────
router.get('/match/:id', (req, res) => {
  const lang = req.session?.lang || 'en';
  const t    = getT(lang);

  const match = db.getMatch(req.params.id);
  if (!match) return res.status(404).send('Match not found');

  const players  = match.category_id
    ? db.getActivePlayersByCat(match.category_id)
    : db.getActivePlayers();
  const stats    = db.getStatsByMatch(match.id);
  const statMap  = buildStatMap(stats, players);

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
    return `
    <tr>
      <td class="sh-player"><span class="sh-num">#${esc(p.number)}</span> ${esc(p.name)}</td>
      <td class="sh-stat"><strong>${pts}</strong><span class="sh-lbl">pts</span></td>
      <td class="sh-stat">${reb}<span class="sh-lbl">reb</span></td>
      <td class="sh-stat">${ast}<span class="sh-lbl">ast</span></td>
    </tr>`;
  }).join('');

  // Build clipboard text
  const header = `🏀 BSC vs ${match.opponent}${hasScore ? ` ${scoreStr}` : ''} · ${match.match_date}`;
  const lines  = [...players].sort((a,b) => a.name.localeCompare(b.name)).map(p => {
    const m   = statMap[p.id] || {};
    const pts = totalPoints(m);
    const reb = totalReb(m);
    const ast = totalAst(m);
    return `${p.name}: ${pts}pts ${reb}reb${ast > 0 ? ` ${ast}ast` : ''}`;
  }).join('\n');
  const shareText = `${header}\n${lines}\n#BSCBratislava`;

  const matchTypeBadge = match.match_type && match.match_type !== 'league'
    ? `<span class="sh-type-badge sh-type-${match.match_type}">${t('match_type_' + match.match_type)}${match.tournament_name ? ` · ${esc(match.tournament_name)}` : ''}</span>`
    : '';

  const statusBadge = match.status === 'closed'
    ? `<span class="sh-badge sh-badge--closed">🔒 ${t('closed')}</span>`
    : `<span class="sh-badge sh-badge--live">🟢 Live</span>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    .sh-footer { text-align: center; font-size: .72rem; color: var(--muted); margin-top: 2rem; border-top: 1px solid var(--border); padding-top: .75rem; }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet">
</head>
<body>
<div class="sh-wrap">

  <div class="sh-header">
    <img src="/img/BSC_logo.jpg" alt="BSC Bratislava" class="sh-logo">
    <div class="sh-club">BSC Bratislava<span>Player Statistics</span></div>
  </div>

  <h1 class="sh-match-title">BSC vs ${esc(match.opponent)}</h1>
  <p class="sh-meta">${match.match_date}${match.location ? ' · ' + esc(match.location) : ''} · ${esc(match.season_name)}</p>
  <div class="sh-badges">${statusBadge}${matchTypeBadge}</div>

  ${hasScore ? `
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
  </div>` : ''}

  <div class="sh-table-wrap">
    <table>
      <thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
      <tbody>${playerRows}</tbody>
    </table>
  </div>

  <button class="sh-copy-btn" id="copy-btn" onclick="copyShare()">📋 Copy for WhatsApp</button>

  <div class="sh-footer">Shared from BSC Bratislava Player Statistics</div>
</div>

<script>
const _shareText = ${JSON.stringify(shareText)};
function copyShare() {
  const btn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(_shareText).then(() => {
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy for WhatsApp'; btn.classList.remove('copied'); }, 2500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = _shareText;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy for WhatsApp'; btn.classList.remove('copied'); }, 2500);
  });
}
</script>
</body>
</html>`;

  res.send(html);
});

module.exports = router;
