// src/db.js
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'cookie.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id  TEXT UNIQUE NOT NULL,
      timestamp    TEXT NOT NULL,
      duration_s   INTEGER,
      weight_lbs   REAL,
      unit_status  TEXT
    );

    CREATE TABLE IF NOT EXISTS sabotages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id  TEXT UNIQUE NOT NULL,
      timestamp    TEXT NOT NULL,
      -- how many times the cycle was interrupted before completing (if known)
      interrupts   INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_visits_timestamp    ON visits(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sabotages_timestamp ON sabotages(timestamp);
  `);
}

// ── Visits ────────────────────────────────────────────────────────────────────

function recordVisit(activity) {
  getDb().prepare(`
    INSERT OR IGNORE INTO visits (activity_id, timestamp, duration_s, weight_lbs, unit_status)
    VALUES (@activityId, @timestamp, @durationS, @weightLbs, @unitStatus)
  `).run({
    activityId: activity.activityId || activity.timestamp,
    timestamp:  activity.timestamp  || new Date().toISOString(),
    durationS:  activity.duration   ?? null,
    weightLbs:  activity.catWeight  ?? null,
    unitStatus: activity.unitStatus ?? null,
  });
}

function getTodayVisits() {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare(`
    SELECT * FROM visits WHERE date(timestamp) = ? ORDER BY timestamp ASC
  `).all(today);
}

function getWeightStats() {
  return getDb().prepare(`
    SELECT
      AVG(weight_lbs) AS avg_all_time,
      MIN(weight_lbs) AS min_weight,
      MAX(weight_lbs) AS max_weight,
      (SELECT weight_lbs FROM visits WHERE weight_lbs IS NOT NULL ORDER BY timestamp DESC LIMIT 1) AS latest_weight,
      (SELECT weight_lbs FROM visits WHERE weight_lbs IS NOT NULL ORDER BY timestamp ASC  LIMIT 1) AS oldest_weight
    FROM visits WHERE weight_lbs IS NOT NULL
  `).get();
}

function getWeightTrend() {
  const recent = getDb().prepare(`
    SELECT AVG(weight_lbs) AS avg FROM visits
    WHERE weight_lbs IS NOT NULL AND timestamp >= datetime('now', '-30 days')
  `).get();

  const prior = getDb().prepare(`
    SELECT AVG(weight_lbs) AS avg FROM visits
    WHERE weight_lbs IS NOT NULL
      AND timestamp >= datetime('now', '-60 days')
      AND timestamp <  datetime('now', '-30 days')
  `).get();

  return {
    recentAvg: recent?.avg ?? null,
    priorAvg:  prior?.avg  ?? null,
    delta: (recent?.avg && prior?.avg) ? (recent.avg - prior.avg) : null,
  };
}

function getAllTimeVisitCount() {
  return getDb().prepare(`SELECT COUNT(*) AS cnt FROM visits`).get().cnt;
}

// ── Sabotages ─────────────────────────────────────────────────────────────────

function recordSabotage(activity) {
  getDb().prepare(`
    INSERT OR IGNORE INTO sabotages (activity_id, timestamp, interrupts)
    VALUES (@activityId, @timestamp, @interrupts)
  `).run({
    activityId: activity.activityId || activity.timestamp,
    timestamp:  activity.timestamp  || new Date().toISOString(),
    interrupts: activity.interrupts ?? 1,
  });
}

function getTodaySabotages() {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().prepare(`
    SELECT * FROM sabotages WHERE date(timestamp) = ? ORDER BY timestamp ASC
  `).all(today);
}

function getAllTimeSabotageCount() {
  return getDb().prepare(`SELECT COUNT(*) AS cnt FROM sabotages`).get().cnt;
}

// Sabotage rate: sabotages per visit over last 30 days
function getSabotageRate() {
  const visits = getDb().prepare(`
    SELECT COUNT(*) AS cnt FROM visits
    WHERE timestamp >= datetime('now', '-30 days')
  `).get().cnt;

  const sabotages = getDb().prepare(`
    SELECT COUNT(*) AS cnt FROM sabotages
    WHERE timestamp >= datetime('now', '-30 days')
  `).get().cnt;

  return {
    visits,
    sabotages,
    rate: visits > 0 ? (sabotages / visits) : null,
  };
}

module.exports = {
  recordVisit,
  getTodayVisits,
  getWeightStats,
  getWeightTrend,
  getAllTimeVisitCount,
  recordSabotage,
  getTodaySabotages,
  getAllTimeSabotageCount,
  getSabotageRate,
};
