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
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    number      TEXT    NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    stat_type  TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Safe migrations for existing databases ────────────────────────────────────
const migrations = [
  "ALTER TABLE matches  ADD COLUMN status      TEXT    NOT NULL DEFAULT 'open'",
  "ALTER TABLE players  ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL",
  "ALTER TABLE seasons  ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists */ }
}

// ── Categories ────────────────────────────────────────────────────────────────
const getCategories    = () => db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
const getCategory      = (id) => db.prepare('SELECT * FROM categories WHERE id=?').get(id);
const insertCategory   = (name, sort_order) => db.prepare('INSERT INTO categories (name,sort_order) VALUES (?,?)').run(name, sort_order || 0);
const updateCategory   = (id, name, sort_order) => db.prepare('UPDATE categories SET name=?,sort_order=? WHERE id=?').run(name, sort_order || 0, id);
const deleteCategory   = (id) => db.prepare('DELETE FROM categories WHERE id=?').run(id);

// ── Players ───────────────────────────────────────────────────────────────────
const getPlayers             = () => db.prepare('SELECT p.*, c.name as category_name FROM players p LEFT JOIN categories c ON c.id=p.category_id ORDER BY c.sort_order, c.name, p.name').all();
const getActivePlayers       = () => db.prepare('SELECT p.*, c.name as category_name FROM players p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.name').all();
const getActivePlayersByCat  = (categoryId) => db.prepare('SELECT * FROM players WHERE active=1 AND category_id=? ORDER BY name').all(categoryId);
const insertPlayer           = (name, number, categoryId) => db.prepare('INSERT INTO players (name,number,category_id) VALUES (?,?,?)').run(name, number, categoryId || null);
const updatePlayer           = (id, name, number, active, categoryId) => db.prepare('UPDATE players SET name=?,number=?,active=?,category_id=? WHERE id=?').run(name, number, active, categoryId || null, id);

// ── Seasons ───────────────────────────────────────────────────────────────────
const getSeasons             = () => db.prepare('SELECT s.*, c.name as category_name FROM seasons s LEFT JOIN categories c ON c.id=s.category_id ORDER BY c.sort_order, c.name, s.created_at DESC').all();
const getSeasonsByCat        = (categoryId) => db.prepare('SELECT * FROM seasons WHERE category_id=? ORDER BY created_at DESC').all(categoryId);
const insertSeason           = (name, categoryId) => db.prepare('INSERT INTO seasons (name,category_id) VALUES (?,?)').run(name, categoryId || null);
const updateSeason           = (id, name, categoryId) => db.prepare('UPDATE seasons SET name=?,category_id=? WHERE id=?').run(name, categoryId || null, id);
const deleteSeason           = (id) => db.prepare('DELETE FROM seasons WHERE id=?').run(id);

// ── Matches ───────────────────────────────────────────────────────────────────
const getMatchesBySeason = (seasonId) => db.prepare('SELECT * FROM matches WHERE season_id=? ORDER BY match_date DESC').all(seasonId);
const getMatch           = (id) => db.prepare(`
  SELECT m.*, s.name as season_name, s.category_id,
         c.name as category_name
  FROM matches m
  JOIN seasons s ON s.id=m.season_id
  LEFT JOIN categories c ON c.id=s.category_id
  WHERE m.id=?`).get(id);
const insertMatch        = (seasonId, opponent, date, location) => db.prepare('INSERT INTO matches (season_id,opponent,match_date,location) VALUES (?,?,?,?)').run(seasonId, opponent, date, location);
const updateMatch        = (id, opponent, date, location) => db.prepare('UPDATE matches SET opponent=?,match_date=?,location=? WHERE id=?').run(opponent, date, location, id);
const deleteMatch        = (id) => db.prepare('DELETE FROM matches WHERE id=?').run(id);
const closeMatch         = (id) => db.prepare("UPDATE matches SET status='closed' WHERE id=?").run(id);
const reopenMatch        = (id) => db.prepare("UPDATE matches SET status='open' WHERE id=?").run(id);

// ── Stats ─────────────────────────────────────────────────────────────────────
const insertStat          = (matchId, playerId, statType) => db.prepare('INSERT INTO stats (match_id,player_id,stat_type) VALUES (?,?,?)').run(matchId, playerId, statType);
const getLastStat         = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id DESC LIMIT 1').get(matchId);
const deleteStat          = (id) => db.prepare('DELETE FROM stats WHERE id=?').run(id);
const getStatsByMatch     = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id').all(matchId);
const getStatsBySeasonRaw = (seasonId) => db.prepare('SELECT s.* FROM stats s JOIN matches m ON m.id=s.match_id WHERE m.season_id=?').all(seasonId);

module.exports = {
  getCategories, getCategory, insertCategory, updateCategory, deleteCategory,
  getPlayers, getActivePlayers, getActivePlayersByCat, insertPlayer, updatePlayer,
  getSeasons, getSeasonsByCat, insertSeason, updateSeason, deleteSeason,
  getMatchesBySeason, getMatch, insertMatch, updateMatch, deleteMatch,
  closeMatch, reopenMatch,
  insertStat, getLastStat, deleteStat, getStatsByMatch, getStatsBySeasonRaw,
};
