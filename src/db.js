const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'stats.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    number     TEXT    NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_categories (
    player_id   INTEGER NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (player_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS seasons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    opponent   TEXT    NOT NULL,
    match_date TEXT    NOT NULL,
    location   TEXT    NOT NULL DEFAULT '',
    status     TEXT    NOT NULL DEFAULT 'open',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stats (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
    player_id  INTEGER NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
    stat_type  TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Safe migrations for existing databases ────────────────────────────────────
const migrations = [
  "ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'open'",
  "ALTER TABLE seasons ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL",
  "ALTER TABLE players ADD COLUMN category_id INTEGER",
  "ALTER TABLE matches ADD COLUMN match_type TEXT NOT NULL DEFAULT 'league'",
  "ALTER TABLE matches ADD COLUMN tournament_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE matches ADD COLUMN score_bsc INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE matches ADD COLUMN score_opponent INTEGER NOT NULL DEFAULT 0",
  // Browser that recorded the stat (per-device Undo). NULL for stats recorded before this existed.
  "ALTER TABLE stats ADD COLUMN device_id TEXT",
  // Unguessable token used in the public share URL (/share/match/:token) instead of the sequential id.
  "ALTER TABLE matches ADD COLUMN share_token TEXT",
  // Client-generated id of a tap, so a retried request (lost response / flaky Wi-Fi) is never counted twice.
  "ALTER TABLE stats ADD COLUMN op_id TEXT",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists */ }
}

const newShareToken = () => crypto.randomBytes(16).toString('base64url'); // 128 bits, 22 chars

/** Gives every match without a share token one (used at startup and after a restore from an older backup). */
const ensureShareTokens = () => {
  const rows = db.prepare("SELECT id FROM matches WHERE share_token IS NULL OR share_token = ''").all();
  const upd = db.prepare('UPDATE matches SET share_token=? WHERE id=?');
  db.transaction(() => { for (const r of rows) upd.run(newShareToken(), r.id); })();
};
ensureShareTokens();
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_share_token ON matches(share_token)');

// Indexes for the per-match / per-player stat lookups used on every tap
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stats_match_id        ON stats(match_id, id);
  CREATE INDEX IF NOT EXISTS idx_stats_match_player    ON stats(match_id, player_id, stat_type);
  CREATE INDEX IF NOT EXISTS idx_stats_match_device    ON stats(match_id, device_id, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_op       ON stats(match_id, op_id) WHERE op_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_matches_season_id     ON matches(season_id);
  CREATE INDEX IF NOT EXISTS idx_player_categories_cat ON player_categories(category_id);
`);

// Create junction table if it didn't exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS player_categories (
    player_id   INTEGER NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (player_id, category_id)
  );

  -- Who attended a match. A match without any row here simply shows all players of its category.
  CREATE TABLE IF NOT EXISTS match_players (
    match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (match_id, player_id)
  );
  CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
`);

// ── Categories ────────────────────────────────────────────────────────────────
const getCategories  = () => db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
const getCategory    = (id) => db.prepare('SELECT * FROM categories WHERE id=?').get(id);
const insertCategory = (name, sort_order) => db.prepare('INSERT INTO categories (name,sort_order) VALUES (?,?)').run(name, sort_order || 0);
const updateCategory = (id, name, sort_order) => db.prepare('UPDATE categories SET name=?,sort_order=? WHERE id=?').run(name, sort_order || 0, id);
const deleteCategory = (id) => db.prepare('DELETE FROM categories WHERE id=?').run(id);

// ── Player ↔ Category junction ────────────────────────────────────────────────
const getPlayerCategoryIds = (playerId) =>
  db.prepare('SELECT category_id FROM player_categories WHERE player_id=?').all(playerId).map(r => r.category_id);

const setPlayerCategories = db.transaction((playerId, categoryIds) => {
  db.prepare('DELETE FROM player_categories WHERE player_id=?').run(playerId);
  const ins = db.prepare('INSERT OR IGNORE INTO player_categories (player_id,category_id) VALUES (?,?)');
  for (const cid of categoryIds) ins.run(playerId, cid);
});

// ── Players ───────────────────────────────────────────────────────────────────
const getPlayers = () => {
  const players = db.prepare('SELECT * FROM players ORDER BY name').all();
  const catRows = db.prepare(`
    SELECT pc.player_id, c.id, c.name, c.sort_order
    FROM player_categories pc
    JOIN categories c ON c.id = pc.category_id
    ORDER BY c.sort_order, c.name
  `).all();
  const catMap = {};
  catRows.forEach(r => {
    if (!catMap[r.player_id]) catMap[r.player_id] = [];
    catMap[r.player_id].push({ id: r.id, name: r.name });
  });
  return players.map(p => ({ ...p, categories: catMap[p.id] || [] }));
};

const getActivePlayers = () => {
  const players = db.prepare('SELECT * FROM players WHERE active=1 ORDER BY name').all();
  const catRows = db.prepare(`
    SELECT pc.player_id, c.id, c.name
    FROM player_categories pc
    JOIN categories c ON c.id = pc.category_id
  `).all();
  const catMap = {};
  catRows.forEach(r => {
    if (!catMap[r.player_id]) catMap[r.player_id] = [];
    catMap[r.player_id].push({ id: r.id, name: r.name });
  });
  return players.map(p => ({ ...p, categories: catMap[p.id] || [] }));
};

// Returns active players that have categoryId in their player_categories
const getActivePlayersByCat = (categoryId) =>
  db.prepare(`
    SELECT p.* FROM players p
    JOIN player_categories pc ON pc.player_id = p.id
    WHERE p.active = 1 AND pc.category_id = ?
    ORDER BY p.name
  `).all(categoryId);

const insertPlayer = (name, number) =>
  db.prepare('INSERT INTO players (name,number) VALUES (?,?)').run(name, number);

const updatePlayer = (id, name, number, active) =>
  db.prepare('UPDATE players SET name=?,number=?,active=? WHERE id=?').run(name, number, active, id);


const deletePlayer = (id) => {
  db.prepare('DELETE FROM player_categories WHERE player_id=?').run(id);
  db.prepare('DELETE FROM players WHERE id=?').run(id);
};

// ── Match roster ──────────────────────────────────────────────────────────────
const getMatchRoster = (matchId) =>
  db.prepare('SELECT player_id FROM match_players WHERE match_id=?').all(matchId).map(r => r.player_id);

// Replaces the roster; an empty list means "no roster" (everyone in the category is shown)
const setMatchRoster = db.transaction((matchId, playerIds) => {
  db.prepare('DELETE FROM match_players WHERE match_id=?').run(matchId);
  const ins = db.prepare('INSERT OR IGNORE INTO match_players (match_id,player_id) VALUES (?,?)');
  for (const pid of playerIds) ins.run(matchId, pid);
});

/**
 * Players shown on (and allowed to receive stats in) a match.
 *  - no roster: every active player of the match's category (or all active players)
 *  - roster:    the rostered players plus anyone who already has a stat in this match
 */
const getMatchPlayers = (match) => {
  const roster = getMatchRoster(match.id);
  if (!roster.length) return match.category_id ? getActivePlayersByCat(match.category_id) : getActivePlayers();
  const keep = new Set(roster);
  db.prepare('SELECT DISTINCT player_id FROM stats WHERE match_id=?').all(match.id).forEach(r => keep.add(r.player_id));
  return getPlayers().filter(p => keep.has(p.id));
};

/** Players that can be picked for a match roster: its category's active players plus those already on it. */
const getRosterCandidates = (match) => {
  const keep = new Set(getMatchRoster(match.id));
  const base = match.category_id ? getActivePlayersByCat(match.category_id) : getActivePlayers();
  base.forEach(p => keep.add(p.id));
  return getPlayers().filter(p => keep.has(p.id));
};


// ── Seasons ───────────────────────────────────────────────────────────────────
const getSeasons      = () => db.prepare('SELECT s.*, c.name as category_name FROM seasons s LEFT JOIN categories c ON c.id=s.category_id ORDER BY c.sort_order, c.name, s.created_at DESC').all();
const getSeasonsByCat = (categoryId) => db.prepare('SELECT * FROM seasons WHERE category_id=? ORDER BY created_at DESC').all(categoryId);
const insertSeason    = (name, categoryId) => db.prepare('INSERT INTO seasons (name,category_id) VALUES (?,?)').run(name, categoryId || null);
const updateSeason    = (id, name, categoryId) => db.prepare('UPDATE seasons SET name=?,category_id=? WHERE id=?').run(name, categoryId || null, id);
const deleteSeason    = (id) => db.prepare('DELETE FROM seasons WHERE id=?').run(id);

// ── Matches ───────────────────────────────────────────────────────────────────
const getMatchesBySeason = (seasonId) => db.prepare('SELECT * FROM matches WHERE season_id=? ORDER BY match_date DESC').all(seasonId);
// Every match with its season name and category (for the players pages)
const getAllMatches = () => db.prepare(`
  SELECT m.*, s.name AS season_name, s.category_id
  FROM matches m JOIN seasons s ON s.id = m.season_id`).all();
const getMatch = (id) => db.prepare(`
  SELECT m.*, s.name as season_name, s.category_id,
         c.name as category_name
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  LEFT JOIN categories c ON c.id = s.category_id
  WHERE m.id = ?`).get(id);
const getMatchByShareToken = (token) => db.prepare(`
  SELECT m.*, s.name as season_name, s.category_id,
         c.name as category_name
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  LEFT JOIN categories c ON c.id = s.category_id
  WHERE m.share_token = ?`).get(String(token));
const insertMatch  = (seasonId, opponent, date, location, matchType, tournamentName) =>
  db.prepare('INSERT INTO matches (season_id,opponent,match_date,location,match_type,tournament_name,share_token) VALUES (?,?,?,?,?,?,?)')
    .run(seasonId, opponent, date, location, matchType || 'league', tournamentName || '', newShareToken());
const updateMatch  = (id, opponent, date, location, matchType, tournamentName) =>
  db.prepare('UPDATE matches SET opponent=?,match_date=?,location=?,match_type=?,tournament_name=? WHERE id=?')
    .run(opponent, date, location, matchType || 'league', tournamentName || '', id);
const updateMatchScore = (id, scoreBsc, scoreOpponent) =>
  db.prepare('UPDATE matches SET score_bsc=?,score_opponent=? WHERE id=?').run(
    Math.max(0, parseInt(scoreBsc) || 0),
    Math.max(0, parseInt(scoreOpponent) || 0),
    id
  );
const deleteMatch  = (id) => db.prepare('DELETE FROM matches WHERE id=?').run(id);
const closeMatch   = (id) => db.prepare("UPDATE matches SET status='closed' WHERE id=?").run(id);
const reopenMatch  = (id) => db.prepare("UPDATE matches SET status='open' WHERE id=?").run(id);

// ── Stats ─────────────────────────────────────────────────────────────────────
// With an opId, re-sending the same op is a no-op. Returns true if a new row was inserted.
const insertStat          = (matchId, playerId, statType, deviceId = null, opId = null) =>
  db.prepare('INSERT OR IGNORE INTO stats (match_id,player_id,stat_type,device_id,op_id) VALUES (?,?,?,?,?)')
    .run(matchId, playerId, statType, deviceId, opId).changes > 0;
const getLastStat         = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id DESC LIMIT 1').get(matchId);
// Newest stat recorded by one device (stats without a device_id never match)
const getLastStatByDevice = (matchId, deviceId) => db.prepare('SELECT * FROM stats WHERE match_id=? AND device_id=? ORDER BY id DESC LIMIT 1').get(matchId, deviceId);
const deleteStat          = (id) => db.prepare('DELETE FROM stats WHERE id=?').run(id);
const deleteLastStatOfType = (matchId, playerId, statType) => {
  const row = db.prepare('SELECT id FROM stats WHERE match_id=? AND player_id=? AND stat_type=? ORDER BY id DESC LIMIT 1').get(matchId, playerId, statType);
  if (!row) return false;
  db.prepare('DELETE FROM stats WHERE id=?').run(row.id);
  return true;
};
const getStatsByMatch     = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id').all(matchId);
const getStatsBySeasonRaw = (seasonId) => db.prepare('SELECT s.* FROM stats s JOIN matches m ON m.id=s.match_id WHERE m.season_id=?').all(seasonId);

// Stats counted per (match, player, stat type): [{ match_id, player_id, stat_type, c }]. seasonId optional.
const getGroupedStats = (seasonId = null) => db.prepare(`
  SELECT s.match_id, s.player_id, s.stat_type, COUNT(*) AS c
  FROM stats s JOIN matches m ON m.id = s.match_id
  ${seasonId ? 'WHERE m.season_id = ?' : ''}
  GROUP BY s.match_id, s.player_id, s.stat_type`).all(...(seasonId ? [seasonId] : []));

// Roster rows [{ match_id, player_id }]. seasonId optional.
const getRosterRows = (seasonId = null) => db.prepare(`
  SELECT mp.match_id, mp.player_id
  FROM match_players mp JOIN matches m ON m.id = mp.match_id
  ${seasonId ? 'WHERE m.season_id = ?' : ''}`).all(...(seasonId ? [seasonId] : []));

// Returns { player_id -> total_points } for all closed+open matches in a season
// Points = 1pt*1 + 2pt*2 + 3pt*3
const getSeasonPtsByPlayer = (seasonId) => {
  const rows = db.prepare(`
    SELECT s.player_id,
      SUM(CASE s.stat_type WHEN '1pt' THEN 1 WHEN '2pt' THEN 2 WHEN '3pt' THEN 3 ELSE 0 END) AS pts
    FROM stats s
    JOIN matches m ON m.id = s.match_id
    WHERE m.season_id = ?
    GROUP BY s.player_id
  `).all(seasonId);
  const map = {};
  rows.forEach(r => { map[r.player_id] = r.pts || 0; });
  return map;
};

// ── Backup / restore ──────────────────────────────────────────────────────────
const DB_FILE = path.join(DATA_DIR, 'stats.db');
// Parents first (insert order); reversed for deletes.
const RESTORE_TABLES  = ['categories', 'players', 'player_categories', 'seasons', 'matches', 'match_players', 'stats'];
const REQUIRED_TABLES = ['categories', 'players', 'seasons', 'matches', 'stats'];

// Consistent snapshot of the live DB (safe with WAL). Returns a Promise.
const backupTo = (file) => db.backup(file);

// True if `file` is a healthy SQLite DB that contains the app's core tables.
const validateBackupFile = (file) => {
  let src;
  try {
    src = new Database(file, { readonly: true, fileMustExist: true });
    const tables = src.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    if (!REQUIRED_TABLES.every(t => tables.includes(t))) return false;
    return src.pragma('integrity_check', { simple: true }) === 'ok';
  } catch (_) {
    return false;
  } finally {
    if (src) src.close();
  }
};

// Replaces ALL app data with the contents of `file` in a single transaction.
// Only columns present in both DBs are copied, so older backups restore into a newer schema.
const restoreFrom = (file) => {
  db.pragma('foreign_keys = OFF'); // cannot be changed inside a transaction
  db.prepare('ATTACH DATABASE ? AS src').run(file);
  try {
    const srcTables = new Set(
      db.prepare("SELECT name FROM src.sqlite_master WHERE type='table'").all().map(r => r.name)
    );
    db.transaction(() => {
      for (const t of [...RESTORE_TABLES].reverse()) db.prepare(`DELETE FROM main.${t}`).run();
      db.prepare(`DELETE FROM main.sqlite_sequence WHERE name IN (${RESTORE_TABLES.map(() => '?').join(',')})`)
        .run(...RESTORE_TABLES);
      for (const t of RESTORE_TABLES) {
        if (!srcTables.has(t)) continue;
        const srcCols = new Set(db.prepare(`PRAGMA src.table_info(${t})`).all().map(c => c.name));
        const cols = db.prepare(`PRAGMA main.table_info(${t})`).all()
          .map(c => c.name).filter(c => srcCols.has(c)).map(c => `"${c}"`).join(',');
        db.prepare(`INSERT INTO main.${t} (${cols}) SELECT ${cols} FROM src.${t}`).run();
      }
      if (db.pragma('foreign_key_check').length > 0) throw new Error('Backup contains inconsistent data');
    })();
    ensureShareTokens(); // backups made before share tokens existed have none
  } finally {
    try { db.exec('DETACH DATABASE src'); } catch (_) { /* ignore */ }
    db.pragma('foreign_keys = ON');
  }
};

module.exports = {
  DATA_DIR, DB_FILE, backupTo, validateBackupFile, restoreFrom,
  getCategories, getCategory, insertCategory, updateCategory, deleteCategory,
  getPlayerCategoryIds, setPlayerCategories,
  getPlayers, getActivePlayers, getActivePlayersByCat, insertPlayer, updatePlayer, deletePlayer,
  getMatchRoster, setMatchRoster, getMatchPlayers, getRosterCandidates,
  getSeasons, getSeasonsByCat, insertSeason, updateSeason, deleteSeason,
  getMatchesBySeason, getAllMatches, getMatch, getMatchByShareToken, insertMatch, updateMatch, updateMatchScore, deleteMatch,
  closeMatch, reopenMatch,
  insertStat, getLastStat, getLastStatByDevice, deleteStat, deleteLastStatOfType, getStatsByMatch, getStatsBySeasonRaw,
  getGroupedStats, getRosterRows,
  getSeasonPtsByPlayer,
};
