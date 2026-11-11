/**
 * HTML tables built from per-player summaries (see summarize() in ../stats.js).
 * rows: [{ player, s }]  where s = summarize(games)
 */
const { esc, th } = require('../util');
const { STAT_TYPES, STAT_KEYS, SHOT_MISS, emptyCounts, pointsOf, avgText, pctText } = require('../stats');

const playerCell = (p, link) => {
  const label = `#${esc(p.number)} ${esc(p.name)}`;
  return link ? `<a href="/players/${p.id}">${label}</a>` : label;
};

/** Hover descriptions for the averages table headers (column key -> translation key). */
const AVG_TIPS = {
  games_played: 'tip_gp', pts: 'tip_pts', avg_pts: 'tip_avg_pts', avg_reb: 'tip_avg_reb', avg_ast: 'tip_avg_ast',
  avg_stl: 'tip_avg_stl', avg_blk: 'tip_avg_blk', avg_to: 'tip_avg_to', avg_pf: 'tip_avg_pf',
  pct_fg: 'tip_pct_fg', pct_3p: 'tip_pct_3p', pct_ft: 'tip_pct_ft',
};

/** Games played, points, per-game averages and shooting percentages. */
function averagesTable(rows, t, { link = true } = {}) {
  const head = ['player', 'games_played', 'pts', 'avg_pts', 'avg_reb', 'avg_ast', 'avg_stl', 'avg_blk', 'avg_to', 'avg_pf', 'pct_fg', 'pct_3p', 'pct_ft']
    .map(k => th(t(k), AVG_TIPS[k] && t(AVG_TIPS[k]))).join('');
  const body = rows.map(({ player, s }) => `<tr>
    <td>${playerCell(player, link)}</td>
    <td>${s.gp}</td>
    <td><strong>${s.pts}</strong></td>
    <td><strong>${avgText(s.avg.pts)}</strong></td>
    <td>${avgText(s.avg.reb)}</td><td>${avgText(s.avg.ast)}</td><td>${avgText(s.avg.stl)}</td>
    <td>${avgText(s.avg.blk)}</td><td>${avgText(s.avg.to)}</td><td>${avgText(s.avg.pf)}</td>
    <td class="col-sep">${pctText(s.pctShoot.fg)}</td><td>${pctText(s.pctShoot.p3)}</td><td>${pctText(s.pctShoot.ft)}</td>
  </tr>`).join('') || `<tr><td colspan="13" class="empty">${t('no_data')}</td></tr>`;
  return `<div class="summary-wrap"><table class="data-table summary-table">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
  </table></div>`;
}

/** Raw totals of every stat type, with a team row (games = number of matches played by the team). */
function totalsTable(rows, teamGames, t, { link = true } = {}) {
  const head = `<th>${t('player')}</th>${th(t('games_played'), t('tip_gp'))}${th(t('pts'), t('tip_pts'))}`
    + STAT_TYPES.map(st => th(t(STAT_KEYS[st]), t('stat_help_' + st))).join('');
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

/** Legend entries as [label, description, isMiss] for the averages table columns (GP, PTS, per-game, percentages). */
const avgLegendItems = (t) => Object.entries(AVG_TIPS).map(([k, tip]) => [t(k), t(tip)]);
/** Legend entries for every raw stat type (made, missed, rebounds, assists ...). */
const statLegendItems = (t) => STAT_TYPES.map(st => [t(STAT_KEYS[st]), t('stat_help_' + st), SHOT_MISS.includes(st)]);
/** Legend entries for the FG / 3P / FT made-attempted columns. */
const splitLegendItems = (t) => [['FG', 'tip_fg'], ['3P', 'tip_3p'], ['FT', 'tip_ft']].map(([label, k]) => [label, t(k)]);

/**
 * Collapsible "what do the abbreviations mean?" box, readable on touch screens where hover tooltips don't work.
 * Same markup/styles as the glossary on the live match page. `groups` are arrays of legend entries.
 */
function legend(t, ...groups) {
  const seen = new Set();
  const rows = groups.flat()
    .filter(([label, desc]) => { const k = label + '|' + desc; return seen.has(k) ? false : (seen.add(k), true); })
    .map(([label, desc, miss]) => `<dt${miss ? ' class="is-miss"' : ''}>${esc(label)}</dt><dd>${esc(desc)}</dd>`).join('');
  return `<details class="roster-box stat-help"><summary>❓ ${t('stat_help_title')}</summary><dl class="stat-help-list">${rows}</dl></details>`;
}

module.exports = { averagesTable, totalsTable, legend, avgLegendItems, statLegendItems, splitLegendItems };
