const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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
  // players.category_id existed in the old single-category model — we keep it
  // in the schema via migration but no longer use it (junction table takes over)
  "ALTER TABLE players ADD COLUMN category_id INTEGER",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists */ }
}

// Create junction table if it didn't exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS player_categories (
    player_id   INTEGER NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (player_id, category_id)
  );
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

// ── Seasons ───────────────────────────────────────────────────────────────────
const getSeasons      = () => db.prepare('SELECT s.*, c.name as category_name FROM seasons s LEFT JOIN categories c ON c.id=s.category_id ORDER BY c.sort_order, c.name, s.created_at DESC').all();
const getSeasonsByCat = (categoryId) => db.prepare('SELECT * FROM seasons WHERE category_id=? ORDER BY created_at DESC').all(categoryId);
const insertSeason    = (name, categoryId) => db.prepare('INSERT INTO seasons (name,category_id) VALUES (?,?)').run(name, categoryId || null);
const updateSeason    = (id, name, categoryId) => db.prepare('UPDATE seasons SET name=?,category_id=? WHERE id=?').run(name, categoryId || null, id);
const deleteSeason    = (id) => db.prepare('DELETE FROM seasons WHERE id=?').run(id);

// ── Matches ───────────────────────────────────────────────────────────────────
const getMatchesBySeason = (seasonId) => db.prepare('SELECT * FROM matches WHERE season_id=? ORDER BY match_date DESC').all(seasonId);
const getMatch = (id) => db.prepare(`
  SELECT m.*, s.name as season_name, s.category_id,
         c.name as category_name
  FROM matches m
  JOIN seasons s ON s.id = m.season_id
  LEFT JOIN categories c ON c.id = s.category_id
  WHERE m.id = ?`).get(id);
const insertMatch  = (seasonId, opponent, date, location) => db.prepare('INSERT INTO matches (season_id,opponent,match_date,location) VALUES (?,?,?,?)').run(seasonId, opponent, date, location);
const updateMatch  = (id, opponent, date, location) => db.prepare('UPDATE matches SET opponent=?,match_date=?,location=? WHERE id=?').run(opponent, date, location, id);
const deleteMatch  = (id) => db.prepare('DELETE FROM matches WHERE id=?').run(id);
const closeMatch   = (id) => db.prepare("UPDATE matches SET status='closed' WHERE id=?").run(id);
const reopenMatch  = (id) => db.prepare("UPDATE matches SET status='open' WHERE id=?").run(id);

// ── Stats ─────────────────────────────────────────────────────────────────────
const insertStat          = (matchId, playerId, statType) => db.prepare('INSERT INTO stats (match_id,player_id,stat_type) VALUES (?,?,?)').run(matchId, playerId, statType);
const getLastStat         = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id DESC LIMIT 1').get(matchId);
const deleteStat          = (id) => db.prepare('DELETE FROM stats WHERE id=?').run(id);
const getStatsByMatch     = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id').all(matchId);
const getStatsBySeasonRaw = (seasonId) => db.prepare('SELECT s.* FROM stats s JOIN matches m ON m.id=s.match_id WHERE m.season_id=?').all(seasonId);

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

module.exports = {
  getCategories, getCategory, insertCategory, updateCategory, deleteCategory,
  getPlayerCategoryIds, setPlayerCategories,
  getPlayers, getActivePlayers, getActivePlayersByCat, insertPlayer, updatePlayer,
  getSeasons, getSeasonsByCat, insertSeason, updateSeason, deleteSeason,
  getMatchesBySeason, getMatch, insertMatch, updateMatch, deleteMatch,
  closeMatch, reopenMatch,
  insertStat, getLastStat, deleteStat, getStatsByMatch, getStatsBySeasonRaw,
  getSeasonPtsByPlayer,
};
