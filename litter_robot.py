#!/usr/bin/env python3
"""
litter_robot.py
Called by index.js via child_process. All DB operations live here too.
Usage:
  python3 litter_robot.py robots
  python3 litter_robot.py activity <robotId>
  python3 litter_robot.py record_visit <json>
  python3 litter_robot.py record_sabotage <json>
  python3 litter_robot.py context_visit
  python3 litter_robot.py context_sabotage
"""

import asyncio, json, os, sqlite3, sys
from datetime import datetime, timezone
from pathlib import Path

# ── DB setup ──────────────────────────────────────────────────────────────────

DB_PATH = os.environ.get("DB_PATH", "./cookie.db")

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id TEXT UNIQUE NOT NULL,
            timestamp   TEXT NOT NULL,
            duration_s  INTEGER,
            weight_lbs  REAL,
            unit_status TEXT
        )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_v_ts ON visits(timestamp)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS sabotages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id TEXT UNIQUE NOT NULL,
            timestamp   TEXT NOT NULL
        )""")
    db.execute("CREATE INDEX IF NOT EXISTS idx_s_ts ON sabotages(timestamp)")
    db.commit()
    return db

def today():
    return datetime.now().strftime("%Y-%m-%d")

# ── DB commands ───────────────────────────────────────────────────────────────

def record_visit(data):
    db = get_db()
    db.execute("""
        INSERT OR IGNORE INTO visits (activity_id, timestamp, duration_s, weight_lbs, unit_status)
        VALUES (?,?,?,?,?)""",
        (data["activityId"], data.get("timestamp", datetime.now(timezone.utc).isoformat()),
         data.get("duration"), data.get("catWeight"), data.get("unitStatus")))
    db.commit()
    return {"ok": True}

def record_sabotage(data):
    db = get_db()
    db.execute("""
        INSERT OR IGNORE INTO sabotages (activity_id, timestamp)
        VALUES (?,?)""",
        (data["activityId"], data.get("timestamp", datetime.now(timezone.utc).isoformat())))
    db.commit()
    return {"ok": True}

def context_visit(data):
    db = get_db()
    t = today()

    today_visits = db.execute(
        "SELECT * FROM visits WHERE date(timestamp)=? ORDER BY timestamp", (t,)).fetchall()
    visit_count = len(today_visits)

    stats = db.execute("""
        SELECT AVG(weight_lbs) avg, MIN(weight_lbs) mn, MAX(weight_lbs) mx
        FROM visits WHERE weight_lbs IS NOT NULL""").fetchone()

    recent_avg = db.execute("""
        SELECT AVG(weight_lbs) avg FROM visits
        WHERE weight_lbs IS NOT NULL AND timestamp >= datetime('now','-30 days')""").fetchone()
    prior_avg = db.execute("""
        SELECT AVG(weight_lbs) avg FROM visits
        WHERE weight_lbs IS NOT NULL
          AND timestamp >= datetime('now','-60 days')
          AND timestamp <  datetime('now','-30 days')""").fetchone()

    total_visits = db.execute("SELECT COUNT(*) cnt FROM visits").fetchone()["cnt"]

    sab_rate_visits = db.execute(
        "SELECT COUNT(*) cnt FROM visits WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]
    sab_rate_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]

    weight = data.get("catWeight")
    lines = [f"Today's visits: {visit_count}"]
    if visit_count == 1: lines.append("First visit of the day.")
    if visit_count >= 5: lines.append(f"⚠️ Visit #{visit_count} today — highly unusual.")
    if data.get("duration"):
        s = int(data["duration"]); m = s // 60; s = s % 60
        lines.append(f"Duration: {f'{m}m ' if m else ''}{s}s")
    if weight:
        lines.append(f"Weight this visit: {weight:.2f} lbs")
        if stats["avg"]:
            lines.append(f"All-time average: {stats['avg']:.2f} lbs")
            lines.append(f"All-time range: {stats['mn']:.2f}–{stats['mx']:.2f} lbs")
        if recent_avg["avg"] and prior_avg["avg"]:
            delta = recent_avg["avg"] - prior_avg["avg"]
            lines.append(f"30-day trend: {'gained' if delta>0 else 'lost'} {abs(delta):.2f} lbs vs prior 30 days.")
    lines.append(f"All-time recorded visits: {total_visits}")
    if total_visits % 100 == 0 and total_visits > 0:
        lines.append(f"🎉 MILESTONE: Visit #{total_visits}!")
    if sab_rate_visits > 0:
        lines.append(f"Sabotage rate this month: {round(sab_rate_sabs/sab_rate_visits*100)}% of cycles disrupted.")

    return {"context": "\n".join(lines)}

def context_sabotage():
    db = get_db()
    t = today()
    today_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE date(timestamp)=?", (t,)).fetchone()["cnt"]
    total_sabs = db.execute("SELECT COUNT(*) cnt FROM sabotages").fetchone()["cnt"]
    sab_rate_visits = db.execute(
        "SELECT COUNT(*) cnt FROM visits WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]
    sab_rate_sabs = db.execute(
        "SELECT COUNT(*) cnt FROM sabotages WHERE timestamp >= datetime('now','-30 days')").fetchone()["cnt"]

    lines = [f"Times she has interfered today: {today_sabs}"]
    if today_sabs > 1: lines.append("She is on a streak of interference today.")
    lines.append(f"All-time sabotage incidents: {total_sabs}")
    if total_sabs % 25 == 0 and total_sabs > 0:
        lines.append(f"🚨 MILESTONE: {total_sabs}th sabotage incident.")
    if sab_rate_visits > 0:
        lines.append(f"Sabotage rate this month: {round(sab_rate_sabs/sab_rate_visits*100)}%")

    return {"context": "\n".join(lines)}

# ── LR API commands ───────────────────────────────────────────────────────────

async def get_robots():
    from pylitterbot import Account
    account = Account()
    try:
        await account.connect(
            username=os.environ["LITTER_ROBOT_EMAIL"],
            password=os.environ["LITTER_ROBOT_PASSWORD"],
            load_robots=True)
        return [{"litterRobotId": str(r.id), "name": r.name,
                 "unitStatus": str(r.status.value) if r.status else None}
                for r in account.robots]
    finally:
        await account.disconnect()

async def get_activity(robot_id):
    from pylitterbot import Account
    account = Account()
    try:
        await account.connect(
            username=os.environ["LITTER_ROBOT_EMAIL"],
            password=os.environ["LITTER_ROBOT_PASSWORD"],
            load_robots=True)
        robot = next((r for r in account.robots if str(r.id) == robot_id), None)
        if not robot: return []
        activity = await robot.get_activity()
        result = []
        for a in (activity or []):
            result.append({
                "activityId":  str(a.timestamp.timestamp()) if a.timestamp else None,
                "timestamp":   a.timestamp.isoformat() if a.timestamp else None,
                "unitStatus":  str(a.status.value) if a.status else None,
                "catWeight":   float(a.cat_weight) if a.cat_weight else None,
                "catDetected": getattr(a, "cat_detected", False),
                "duration":    int(a.duration.total_seconds()) if getattr(a, "duration", None) else None,
            })
        return result
    finally:
        await account.disconnect()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""

    if cmd == "robots":
        print(json.dumps(asyncio.run(get_robots())))
    elif cmd == "activity":
        print(json.dumps(asyncio.run(get_activity(sys.argv[2]))))
    elif cmd == "record_visit":
        print(json.dumps(record_visit(json.loads(sys.argv[2]))))
    elif cmd == "record_sabotage":
        print(json.dumps(record_sabotage(json.loads(sys.argv[2]))))
    elif cmd == "context_visit":
        data = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        print(json.dumps(context_visit(data)))
    elif cmd == "context_sabotage":
        print(json.dumps(context_sabotage()))
    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))

main()
