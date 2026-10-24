const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'stats.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    number    TEXT    NOT NULL DEFAULT '',
    active    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT   NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS seasons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS matches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    opponent   TEXT    NOT NULL,
    match_date TEXT    NOT NULL,
    location   TEXT    NOT NULL DEFAULT '',
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

// ── Players ──────────────────────────────────────────────────────────────────
const getPlayers      = () => db.prepare('SELECT * FROM players ORDER BY name').all();
const getActivePlayers = () => db.prepare('SELECT * FROM players WHERE active=1 ORDER BY name').all();
const insertPlayer    = (name, number) => db.prepare('INSERT INTO players (name,number) VALUES (?,?)').run(name, number);
const updatePlayer    = (id, name, number, active) => db.prepare('UPDATE players SET name=?,number=?,active=? WHERE id=?').run(name, number, active, id);

// ── Seasons ───────────────────────────────────────────────────────────────────
const getSeasons   = () => db.prepare('SELECT * FROM seasons ORDER BY created_at DESC').all();
const insertSeason = (name) => db.prepare('INSERT INTO seasons (name) VALUES (?)').run(name);
const updateSeason = (id, name) => db.prepare('UPDATE seasons SET name=? WHERE id=?').run(name, id);
const deleteSeason = (id) => db.prepare('DELETE FROM seasons WHERE id=?').run(id);

// ── Matches ───────────────────────────────────────────────────────────────────
const getMatchesBySeason = (seasonId) => db.prepare('SELECT * FROM matches WHERE season_id=? ORDER BY match_date DESC').all(seasonId);
const getMatch           = (id) => db.prepare('SELECT m.*, s.name as season_name FROM matches m JOIN seasons s ON s.id=m.season_id WHERE m.id=?').get(id);
const insertMatch        = (seasonId, opponent, date, location) => db.prepare('INSERT INTO matches (season_id,opponent,match_date,location) VALUES (?,?,?,?)').run(seasonId, opponent, date, location);
const updateMatch        = (id, opponent, date, location) => db.prepare('UPDATE matches SET opponent=?,match_date=?,location=? WHERE id=?').run(opponent, date, location, id);
const deleteMatch        = (id) => db.prepare('DELETE FROM matches WHERE id=?').run(id);

// ── Stats ─────────────────────────────────────────────────────────────────────
const insertStat      = (matchId, playerId, statType) => db.prepare('INSERT INTO stats (match_id,player_id,stat_type) VALUES (?,?,?)').run(matchId, playerId, statType);
const getLastStat     = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id DESC LIMIT 1').get(matchId);
const deleteStat      = (id) => db.prepare('DELETE FROM stats WHERE id=?').run(id);
const getStatsByMatch = (matchId) => db.prepare('SELECT * FROM stats WHERE match_id=? ORDER BY id').all(matchId);
const getStatsBySeasonRaw = (seasonId) =>
  db.prepare(`SELECT s.* FROM stats s JOIN matches m ON m.id=s.match_id WHERE m.season_id=?`).all(seasonId);

module.exports = {
  getPlayers, getActivePlayers, insertPlayer, updatePlayer,
  getSeasons, insertSeason, updateSeason, deleteSeason,
  getMatchesBySeason, getMatch, insertMatch, updateMatch, deleteMatch,
  insertStat, getLastStat, deleteStat, getStatsByMatch, getStatsBySeasonRaw,
};
