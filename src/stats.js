/**
 * Single source of truth for stat types and every derived number
 * (points, shooting splits, games played, per-game averages).
 * Pure functions only - no database access - so they are easy to test.
 */

// Canonical order = column order in the live table.
const SHOT_MADE  = ['1pt', '2pt', '3pt'];
const SHOT_MISS  = ['1pt_miss', '2pt_miss', '3pt_miss'];
const OTHER_STATS = ['oreb', 'dreb', 'ast', 'to', 'blk', 'stl', 'pf'];
const STAT_TYPES = [...SHOT_MADE, ...SHOT_MISS, ...OTHER_STATS];
const STAT_KEYS  = Object.fromEntries(STAT_TYPES.map(st => [st, 'stat_' + st]));

const emptyCounts = () => Object.fromEntries(STAT_TYPES.map(st => [st, 0]));

/** { playerId -> counts } for the given players, filled from raw stat rows. */
function buildStatMap(stats, players) {
  const map = {};
  players.forEach(p => { map[p.id] = emptyCounts(); });
  stats.forEach(s => { if (map[s.player_id] && s.stat_type in map[s.player_id]) map[s.player_id][s.stat_type]++; });
  return map;
}

/** Points come from made shots only; misses are worth 0. */
const pointsOf = (c) => (c['1pt'] || 0) + 2 * (c['2pt'] || 0) + 3 * (c['3pt'] || 0);
const reboundsOf = (c) => (c.oreb || 0) + (c.dreb || 0);

/** Made / attempted for free throws, 2-pointers, 3-pointers and field goals (2P + 3P). */
function shooting(c) {
  const ft = { m: c['1pt'] || 0, a: (c['1pt'] || 0) + (c['1pt_miss'] || 0) };
  const p2 = { m: c['2pt'] || 0, a: (c['2pt'] || 0) + (c['2pt_miss'] || 0) };
  const p3 = { m: c['3pt'] || 0, a: (c['3pt'] || 0) + (c['3pt_miss'] || 0) };
  const fg = { m: p2.m + p3.m, a: p2.a + p3.a };
  return { ft, p2, p3, fg };
}

/** Whole-number percentage, or null when nothing was attempted. */
const pct = (m, a) => (a > 0 ? Math.round((m * 100) / a) : null);

/**
 * True when at least one missed shot was recorded in the given counts.
 * Only then is a shooting PERCENTAGE meaningful - made shots only (misses simply not tracked)
 * would otherwise show a false 100%. Made/attempted counts are shown regardless.
 */
const shotsTracked = (c) => SHOT_MISS.some(st => (c[st] || 0) > 0);

/**
 * Which players took part in which match, with their stat counts.
 *  - matches:    [{ id, match_date, ... }]
 *  - grouped:    [{ match_id, player_id, stat_type, c }]   (stats grouped + counted)
 *  - rosterRows: [{ match_id, player_id }]                 (match_players)
 * A player "played" a match if he is on its roster, or - when the match has no roster
 * (older matches) - if any stat was recorded for him. Anyone with a stat has played.
 * Returns Map<playerId, [{ match, counts, tracked }]> in chronological order.
 * `tracked` is true only if misses were recorded for THAT player in THAT match.
 */
function buildPlayerGames({ matches, grouped, rosterRows }) {
  const statsBy = {};
  grouped.forEach(r => {
    if (!STAT_TYPES.includes(r.stat_type)) return;
    const m = statsBy[r.match_id] || (statsBy[r.match_id] = {});
    const c = m[r.player_id] || (m[r.player_id] = emptyCounts());
    c[r.stat_type] += r.c;
  });
  const rosterBy = {};
  rosterRows.forEach(r => { (rosterBy[r.match_id] || (rosterBy[r.match_id] = new Set())).add(r.player_id); });

  const sorted = [...matches].sort((a, b) => String(a.match_date).localeCompare(String(b.match_date)) || a.id - b.id);
  const out = new Map();
  sorted.forEach(match => {
    const withStats = statsBy[match.id] || {};
    const ids = new Set(Object.keys(withStats).map(Number));
    (rosterBy[match.id] || []).forEach(id => ids.add(id));
    ids.forEach(pid => {
      if (!out.has(pid)) out.set(pid, []);
      const counts = withStats[pid] || emptyCounts();
      out.get(pid).push({ match, counts, tracked: shotsTracked(counts) });
    });
  });
  return out;
}

/**
 * Totals, per-game averages and shooting numbers for a list of games.
 *  - shoot:    made/attempted from ALL recorded shots (always shown)
 *  - pctShoot: made/attempted from only the games where misses were tracked, used for percentages
 *              (a zero-attempt split shows as a dash)
 */
function summarize(games) {
  const totals = emptyCounts();
  const tracked = emptyCounts();
  games.forEach(g => {
    STAT_TYPES.forEach(st => { totals[st] += g.counts[st] || 0; });
    if (g.tracked) STAT_TYPES.forEach(st => { tracked[st] += g.counts[st] || 0; });
  });
  const gp = games.length;
  const pts = pointsOf(totals), reb = reboundsOf(totals);
  const per = (n) => (gp ? n / gp : 0);
  return {
    gp, totals, pts, reb,
    avg: { pts: per(pts), reb: per(reb), ast: per(totals.ast), stl: per(totals.stl),
           blk: per(totals.blk), to: per(totals.to), pf: per(totals.pf) },
    shoot: shooting(totals),
    pctShoot: shooting(tracked),
  };
}

/** "5/12" style text for a { m, a } split, or '—' when nothing was attempted. */
const splitText = (s) => (s.a > 0 ? `${s.m}/${s.a}` : '—');
/** "42%" for a { m, a } split, or '—' when nothing was attempted. */
const pctText = (s) => (s.a > 0 ? `${pct(s.m, s.a)}%` : '—');
/** Per-game average with one decimal. */
const avgText = (n) => (Math.round(n * 10) / 10).toFixed(1);

module.exports = {
  STAT_TYPES, STAT_KEYS, SHOT_MADE, SHOT_MISS, OTHER_STATS,
  emptyCounts, buildStatMap, pointsOf, reboundsOf, shooting, pct, shotsTracked, splitText, pctText, avgText, buildPlayerGames, summarize,
};
