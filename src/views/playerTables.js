/**
 * HTML tables built from per-player summaries (see summarize() in ../stats.js).
 * rows: [{ player, s }]  where s = summarize(games)
 */
const { esc } = require('../util');
const { STAT_TYPES, STAT_KEYS, SHOT_MISS, emptyCounts, pointsOf, avgText, pctText } = require('../stats');

const playerCell = (p, link) => {
  const label = `#${esc(p.number)} ${esc(p.name)}`;
  return link ? `<a href="/players/${p.id}">${label}</a>` : label;
};

/** Games played, points, per-game averages and shooting percentages. */
function averagesTable(rows, t, { link = true } = {}) {
  const head = ['player', 'games_played', 'pts', 'avg_pts', 'avg_reb', 'avg_ast', 'avg_stl', 'avg_blk', 'avg_to', 'avg_pf', 'pct_fg', 'pct_3p', 'pct_ft']
    .map(k => `<th>${t(k)}</th>`).join('');
  const body = rows.map(({ player, s }) => `<tr>
    <td>${playerCell(player, link)}</td>
    <td>${s.gp}</td>
    <td><strong>${s.pts}</strong></td>
    <td><strong>${avgText(s.avg.pts)}</strong></td>
    <td>${avgText(s.avg.reb)}</td><td>${avgText(s.avg.ast)}</td><td>${avgText(s.avg.stl)}</td>
    <td>${avgText(s.avg.blk)}</td><td>${avgText(s.avg.to)}</td><td>${avgText(s.avg.pf)}</td>
    <td class="col-sep">${pctText(s.shoot.fg)}</td><td>${pctText(s.shoot.p3)}</td><td>${pctText(s.shoot.ft)}</td>
  </tr>`).join('') || `<tr><td colspan="13" class="empty">${t('no_data')}</td></tr>`;
  return `<div class="summary-wrap"><table class="data-table summary-table">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
  </table></div>`;
}

/** Raw totals of every stat type, with a team row (games = number of matches played by the team). */
function totalsTable(rows, teamGames, t, { link = true } = {}) {
  const head = `<th>${t('player')}</th><th>${t('games_played')}</th><th>${t('pts')}</th>`
    + STAT_TYPES.map(st => `<th>${t(STAT_KEYS[st])}</th>`).join('');
  const team = emptyCounts();
  rows.forEach(({ s }) => STAT_TYPES.forEach(st => { team[st] += s.totals[st]; }));

  const body = rows.map(({ player, s }) => `<tr>
    <td>${playerCell(player, link)}</td><td>${s.gp}</td><td><strong>${s.pts}</strong></td>
    ${STAT_TYPES.map(st => `<td>${s.totals[st] || 0}</td>`).join('')}
  </tr>`).join('');
  if (!body) return `<div class="summary-wrap"><table class="data-table summary-table"><tbody><tr><td class="empty">${t('no_data')}</td></tr></tbody></table></div>`;

  const teamRow = `<tr class="total-row"><td>${t('team_total')}</td><td>${teamGames}</td><td>${pointsOf(team)}</td>
    ${STAT_TYPES.map(st => `<td>${team[st]}</td>`).join('')}</tr>`;
  return `<div class="summary-wrap"><table class="data-table summary-table">
    <thead><tr>${head}</tr></thead><tbody>${body}${teamRow}</tbody>
  </table></div>`;
}

module.exports = { averagesTable, totalsTable };
